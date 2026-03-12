#!/usr/bin/env python3
"""
bridge.py — JSON-RPC 2.0 bridge between Node.js and amplifier-foundation/core.

Communicates via stdin/stdout using newline-delimited JSON (NDJSON).
Stderr is reserved for debug logging only.

Protocol:
  - Requests from TS have numeric `id` fields
  - Notifications from PY have no `id` field
  - Reverse calls from PY to TS have string `id` fields (e.g. "hook:1")
"""

import asyncio
import json
import sys
import uuid
from typing import Any


# ─── Settings ──────────────────────────────────────────────────────────────────

_settings: dict = {}


def _log(msg: str) -> None:
    """Debug log to stderr (never interferes with protocol)."""
    print(f"[bridge] {msg}", file=sys.stderr, flush=True)


def load_settings() -> dict:
    """Load ~/.amplifier/settings.yaml if it exists.

    yaml is bundled with amplifier-foundation, so the import is deferred to
    keep the bridge startable even before the package is installed.
    """
    import pathlib

    settings_path = pathlib.Path.home() / ".amplifier" / "settings.yaml"
    if not settings_path.exists():
        return {}
    try:
        import yaml  # bundled with amplifier-foundation

        with open(settings_path) as f:
            data = yaml.safe_load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        _log(f"Warning: could not load settings: {e}")
        return {}


# ─── Handle Registry ───────────────────────────────────────────────────────────

_handles: dict[str, Any] = {}
_handle_counter = 0


def _new_handle(prefix: str, obj: Any) -> str:
    global _handle_counter
    _handle_counter += 1
    handle = f"{prefix}:{_handle_counter}"
    _handles[handle] = obj
    return handle


def _get_handle(handle: str) -> Any:
    obj = _handles.get(handle)
    if obj is None:
        raise ValueError(f"Unknown handle: {handle}")
    return obj


def _del_handle(handle: str) -> None:
    _handles.pop(handle, None)


# ─── Reverse Call Support ──────────────────────────────────────────────────────

_reverse_counter = 0
_pending_callbacks: dict[str, asyncio.Future] = {}


async def reverse_call(method: str, params: dict) -> Any:
    """Send a request from Python to TS and await the response."""
    global _reverse_counter
    _reverse_counter += 1
    call_id = f"{method.split('.')[0]}:{_reverse_counter}"

    # ISSUE 10: use get_running_loop() — get_event_loop() is deprecated
    future: asyncio.Future = asyncio.get_running_loop().create_future()
    _pending_callbacks[call_id] = future

    _send({"jsonrpc": "2.0", "id": call_id, "method": method, "params": params})

    result = await future
    return result


# ─── I/O ──────────────────────────────────────────────────────────────────────


def _send(msg: dict) -> None:
    """Write a JSON-RPC message to stdout."""
    line = json.dumps(msg, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def _send_notification(method: str, params: dict) -> None:
    _send({"jsonrpc": "2.0", "method": method, "params": params})


def _send_result(id: int | str, result: Any) -> None:
    _send({"jsonrpc": "2.0", "id": id, "result": result})


def _send_error(id: int | str, code: int, message: str, data: Any = None) -> None:
    error: dict = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    _send({"jsonrpc": "2.0", "id": id, "error": error})


# ─── Method Handlers ──────────────────────────────────────────────────────────


async def handle_bridge_ping(params: dict | None) -> dict:
    return {"status": "ok"}


async def handle_bridge_close(params: dict | None) -> None:
    """Clean up all handles, calling cleanup() on any session objects."""
    for handle_id in list(_handles.keys()):
        obj = _handles[handle_id]
        # ISSUE 7/12: session handles are dicts with a "session" key;
        # the correct teardown method is cleanup(), not close().
        if isinstance(obj, dict) and "session" in obj:
            try:
                session_obj: Any = obj["session"]
                await session_obj.cleanup()
            except Exception:
                pass
        elif hasattr(obj, "cleanup"):
            try:
                any_obj: Any = obj
                cleanup_result = any_obj.cleanup()
                if asyncio.iscoroutine(cleanup_result):
                    await cleanup_result
            except Exception:
                pass
    _handles.clear()
    return None


async def handle_bundle_load(params: dict) -> dict:
    source = params["source"]
    try:
        from amplifier_foundation import load_bundle  # type: ignore[import-untyped]

        # ISSUE 3: load_bundle is async — must be awaited
        bundle = await load_bundle(source)
        handle = _new_handle("bundle", bundle)
        name = getattr(bundle, "name", None)
        return {"handle": handle, "name": name}
    except ImportError:
        raise RuntimeError("amplifier_foundation is not installed")
    except Exception as e:
        raise RuntimeError(f"Failed to load bundle: {e}")


async def handle_bundle_compose(params: dict) -> dict:
    base = _get_handle(params["base"])
    overlays = [_get_handle(h) for h in params.get("overlays", [])]
    try:
        # ISSUE 1: compose_bundles() does not exist.
        # compose() is a synchronous instance method on Bundle.
        composed = base.compose(*overlays)
        handle = _new_handle("bundle", composed)
        name = getattr(composed, "name", None)
        return {"handle": handle, "name": name}
    except Exception as e:
        raise RuntimeError(f"Failed to compose bundles: {e}")


async def handle_bundle_prepare(params: dict) -> dict:
    bundle = _get_handle(params["handle"])
    try:
        # ISSUE 2: prepare_bundle() does not exist.
        # prepare() is an async instance method on Bundle.
        prepared = await bundle.prepare(install_deps=True)
        handle = _new_handle("prepared", prepared)
        return {"handle": handle}
    except Exception as e:
        raise RuntimeError(f"Failed to prepare bundle: {e}")


async def handle_bundle_validate(params: dict) -> dict:
    bundle = _get_handle(params["handle"])
    try:
        from amplifier_foundation import validate_bundle  # type: ignore[import-untyped]

        result = validate_bundle(bundle)
        return {
            "valid": result.valid,
            "errors": result.errors,
            "warnings": result.warnings,
        }
    except ImportError:
        raise RuntimeError("amplifier_foundation is not installed")
    except Exception as e:
        raise RuntimeError(f"Failed to validate bundle: {e}")


async def handle_session_create(params: dict) -> dict:
    try:
        # ISSUE 5: HookResult must be imported for hook return values
        from amplifier_core import HookResult

        prepared = _get_handle(params["handle"])

        # ISSUE 6: The approval_system is a protocol object, not a bare callback.
        # It must expose:  async def request_approval(prompt, options, timeout, default) -> str
        approval_system = None
        if params.get("hasApprovalHandler"):

            class BridgeApprovalSystem:
                async def request_approval(
                    self,
                    prompt: str,
                    options: list[str],
                    timeout: float,
                    default: str,
                ) -> str:
                    result = await reverse_call(
                        "approval.request",
                        {
                            "prompt": prompt,
                            "options": options,
                            "timeout": timeout,
                            "default": default,
                        },
                    )
                    return result if isinstance(result, str) else default

            approval_system = BridgeApprovalSystem()

        # ISSUE 4: AmplifierSession constructor does not accept these kwargs.
        # The correct API is PreparedBundle.create_session().
        session = await prepared.create_session(approval_system=approval_system)
        session_id = getattr(session, "session_id", str(uuid.uuid4()))

        # ── Register streaming hooks ───────────────────────────────────────────
        # ISSUE 5: Hooks must be registered AFTER session creation via
        #   session.coordinator.hooks.register(event, callback, priority=...)
        # Callbacks must be:  async def cb(event: str, data: dict) -> HookResult
        # ISSUE 9: correct event name is "content_block:delta", not "content:block_delta"
        async def streaming_hook(event: str, data: dict) -> HookResult:
            """Forward live events to the TypeScript side as notifications."""
            type_map = {
                "content_block:delta": "text",
                "thinking:delta": "thinking",
                "tool:pre": "tool_use",
                "tool:post": "tool_result",
            }
            _send_notification(
                "session.event",
                {
                    "sessionId": session_id,
                    "type": type_map.get(event, event),
                    "data": data,
                },
            )
            return HookResult(action="continue")

        session.coordinator.hooks.register(
            "content_block:delta", streaming_hook, priority=999
        )
        session.coordinator.hooks.register(
            "thinking:delta", streaming_hook, priority=999
        )
        session.coordinator.hooks.register("tool:pre", streaming_hook, priority=999)
        session.coordinator.hooks.register("tool:post", streaming_hook, priority=999)

        # ── Optional TS-side hook forwarders ──────────────────────────────────
        hook_events = params.get("hookEvents", [])

        if "preToolUse" in hook_events:

            async def pre_tool_hook(event: str, data: dict) -> HookResult:
                result = await reverse_call(
                    "hook.preToolUse",
                    {
                        "toolName": data.get("tool_name"),
                        "toolInput": data.get("tool_input"),
                    },
                )
                action = (
                    result.get("action", "continue")
                    if isinstance(result, dict)
                    else "continue"
                )
                return HookResult(action=action)

            session.coordinator.hooks.register("tool:pre", pre_tool_hook, priority=500)

        if "postToolUse" in hook_events:

            async def post_tool_hook(event: str, data: dict) -> HookResult:
                result = await reverse_call(
                    "hook.postToolUse",
                    {
                        "toolName": data.get("tool_name"),
                        "toolInput": data.get("tool_input"),
                        "toolResult": data.get("tool_result"),
                    },
                )
                action = (
                    result.get("action", "continue")
                    if isinstance(result, dict)
                    else "continue"
                )
                return HookResult(action=action)

            session.coordinator.hooks.register(
                "tool:post", post_tool_hook, priority=500
            )

        # ISSUE 12: Store the session_id alongside the session object so that
        # handle_session_execute can return the correct sessionId.
        handle = _new_handle("session", {"session": session, "session_id": session_id})
        return {"handle": handle, "sessionId": session_id}

    except ImportError:
        raise RuntimeError("amplifier_core is not installed")
    except Exception as e:
        raise RuntimeError(f"Failed to create session: {e}")


async def handle_session_execute(params: dict) -> dict:
    # ISSUE 12: unwrap the dict stored by handle_session_create
    data = _get_handle(params["handle"])
    session = data["session"]
    session_id = data["session_id"]
    prompt = params["prompt"]
    try:
        result = await session.execute(prompt)
        response = result if isinstance(result, str) else str(result)
        return {
            "response": response,
            "sessionId": session_id,
        }
    except Exception as e:
        raise RuntimeError(f"Execution failed: {e}")


async def handle_session_interrupt(params: dict) -> None:
    # ISSUE 8: session.interrupt() does not exist in AmplifierSession.
    # Cancellation is not yet implemented; return gracefully.
    return None


async def handle_session_close(params: dict) -> None:
    handle = params["handle"]
    data = _get_handle(handle)
    session = data["session"]
    # ISSUE 7: session.close() does not exist — correct method is cleanup()
    await session.cleanup()
    _del_handle(handle)
    return None


# ─── Method Dispatch ──────────────────────────────────────────────────────────

METHODS = {
    "bridge.ping": handle_bridge_ping,
    "bridge.close": handle_bridge_close,
    "bundle.load": handle_bundle_load,
    "bundle.compose": handle_bundle_compose,
    "bundle.prepare": handle_bundle_prepare,
    "bundle.validate": handle_bundle_validate,
    "session.create": handle_session_create,
    "session.execute": handle_session_execute,
    "session.interrupt": handle_session_interrupt,
    "session.close": handle_session_close,
}


async def dispatch(msg: dict) -> None:
    """Dispatch an incoming JSON-RPC message."""
    msg_id = msg.get("id")
    method = msg.get("method")

    # If this is a response to a reverse call (string ID, has result/error)
    if isinstance(msg_id, str) and ("result" in msg or "error" in msg):
        future = _pending_callbacks.pop(msg_id, None)
        if future and not future.done():
            if "error" in msg:
                future.set_exception(
                    RuntimeError(msg["error"].get("message", "Unknown error"))
                )
            else:
                future.set_result(msg.get("result"))
        return

    # Regular request from TS
    if method is None:
        if msg_id is not None:
            _send_error(msg_id, -32600, "Invalid Request: missing method")
        return

    handler = METHODS.get(method)
    if handler is None:
        if msg_id is not None:
            _send_error(msg_id, -32601, f"Method not found: {method}")
        return

    try:
        result = await handler(msg.get("params", {}))
        if msg_id is not None:
            _send_result(msg_id, result)
    except Exception as e:
        _log(f"Error in {method}: {e}")
        if msg_id is not None:
            _send_error(msg_id, -32000, str(e))


# ─── Main Loop ────────────────────────────────────────────────────────────────


async def main() -> None:
    """Read NDJSON from stdin, dispatch each message."""
    global _settings

    # ISSUE 13: load provider config and other settings from ~/.amplifier/settings.yaml
    _settings = load_settings()

    _log("Bridge starting")

    # ISSUE 10: use get_running_loop() — get_event_loop() is deprecated inside async
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await reader.readline()
            if not line:
                # EOF — TS process closed stdin
                break

            text = line.decode("utf-8").strip()
            if not text:
                continue

            try:
                msg = json.loads(text)
            except json.JSONDecodeError as e:
                _log(f"JSON parse error: {e}")
                continue

            # Dispatch asynchronously so reverse calls can interleave
            asyncio.create_task(dispatch(msg))

        except Exception as e:
            _log(f"Main loop error: {e}")
            break

    _log("Bridge exiting")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
