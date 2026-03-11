# Amplifier Node.js SDK Design

## Goal

Build the official Node.js SDK for Amplifier. Users run `npm install amplifier` and get a fully self-contained package — no Python, Rust, or separate CLI installation required. The bundled Amplifier binary ships inside the package. Users control Amplifier via Node.js and can install additional functionality (bundles) via the SDK.

Modeled closely after `@anthropic-ai/claude-agent-sdk`.

## Decision Summary

| Decision | Choice | Rationale |
|---|---|---|
| Distribution model | One main package + five platform `optionalDependencies` | npm auto-selects the right binary; no postinstall scripts |
| Transport | Subprocess per turn (`amplifier run --output-format json`) | Simple, stateless; session state managed by amplifier on disk |
| Session model | File-based (amplifier persists state); SDK tracks `session_id` | No long-lived processes; each `prompt()` is a fresh spawn with `--resume` |
| Streaming | Batch-only for v1 (async iterator emits one `ResultMessage`) | Real streaming deferred until CLI supports `--output-format json-stream` |
| API surface | `query()` for simple use, `AmplifierClient` for advanced | Covers one-shot scripts through multi-turn agent sessions |
| Build tooling | `tsup` (CJS + ESM + `.d.ts`), Vitest for tests | Fast, modern, minimal config |
| Error philosophy | Three typed errors, human-readable messages, no opaque codes | Actionable diagnostics over abstract error taxonomies |
| Version strategy | Co-versioned: main package version == binary version | `MINIMUM_BINARY_VERSION` guard prevents silent mismatches |

## Background

Amplifier is a CLI-based agent runtime. Today, using it from Node.js means shelling out manually, parsing output, and managing process lifecycle by hand. An official SDK eliminates that friction and opens Amplifier to the Node.js ecosystem — build tools, CI pipelines, VS Code extensions, and application backends can all drive Amplifier programmatically.

The SDK is a thin typed wrapper around the CLI's JSON output mode. It does not reimplement agent logic — it delegates everything to the binary and focuses on ergonomic process management, error handling, and session tracking.

## Architecture

```
npm install amplifier
       │
       ▼
┌──────────────┐     optionalDependencies      ┌─────────────────────────────┐
│  amplifier   │ ─────────────────────────────▶ │ @amplifier/sdk-darwin-arm64 │
│  (main pkg)  │   (npm installs only the one   │ @amplifier/sdk-darwin-x64   │
│              │    matching the host platform)  │ @amplifier/sdk-linux-x64    │
│  TypeScript  │                                │ @amplifier/sdk-linux-arm64  │
│  SDK code    │                                │ @amplifier/sdk-win32-x64    │
└──────┬───────┘                                └──────────┬──────────────────┘
       │                                                   │
       │  discovers binary at runtime                      │  contains bin/amplifier
       ▼                                                   │
┌──────────────┐                                           │
│ child_process│ ◀─────────────────────────────────────────┘
│   .spawn()   │
│              │──▶ amplifier run --output-format json "prompt"
│              │──▶ amplifier run --output-format json --resume <id> "prompt"
│              │──▶ amplifier recipe run --output-format json ./recipe.yaml
│              │──▶ amplifier bundle add <url>
└──────────────┘
```

Every SDK call spawns a short-lived subprocess. There are no long-running daemon processes, no sockets, and no IPC channels. Session continuity comes from amplifier's own file-based session persistence — the SDK just passes `--resume <session_id>`.

## Components

### 1. Package Structure & Distribution

The npm ecosystem consists of six packages, all co-versioned with the Amplifier release.

**Main package: `amplifier`**

Published to npm. Contains the TypeScript SDK compiled to CJS + ESM + `.d.ts`. Lists the five platform packages as `optionalDependencies` — npm auto-installs only the one matching the host platform. No postinstall scripts, no network calls after install.

**Platform packages (one binary each):**

| Package | Platform |
|---|---|
| `@amplifier/sdk-darwin-arm64` | macOS Apple Silicon |
| `@amplifier/sdk-darwin-x64` | macOS Intel |
| `@amplifier/sdk-linux-x64` | Linux x64 |
| `@amplifier/sdk-linux-arm64` | Linux ARM64 |
| `@amplifier/sdk-win32-x64` | Windows x64 |

Each has `os` and `cpu` fields in `package.json` so npm skips them on the wrong platform. Each contains one file: the compiled Amplifier binary (`amplifier` / `amplifier.exe`) in a `bin/` directory.

**Binary discovery at runtime (in the main package):**

1. `AMPLIFIER_BINARY` env var — escape hatch for development/testing
2. Walk the `optionalDependencies`, find the installed platform package, return its `bin/amplifier` path
3. Fall back to `amplifier` in system `$PATH`
4. Throw `AmplifierBinaryNotFoundError` with a clear install message if nothing found

**Version pinning:** Main package version == binary version. A `MINIMUM_BINARY_VERSION` constant guards against users somehow getting a mismatched binary.

### 2. Subprocess Transport Layer

The existing Amplifier CLI already has the right primitive:

```bash
amplifier run --output-format json "your prompt"
amplifier run --output-format json --resume <session-id> "follow-up"
```

stdout produces exactly one JSON object when the run completes. stderr receives all diagnostics. Session state is auto-persisted to disk by amplifier itself — the SDK just tracks `session_id` and passes `--resume` for subsequent turns.

**Wire format (stdout, one JSON object on process exit):**

```json
{
  "status": "success",
  "response": "The assistant's full response as a markdown string",
  "session_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "bundle": "bundle:foundation",
  "model": "anthropic/claude-sonnet-4-5",
  "timestamp": "2025-11-10T12:34:56.789Z"
}
```

**Error shape:**

```json
{
  "status": "error",
  "error": "Error message here",
  "error_type": "ModuleValidationError",
  "session_id": "uuid-if-session-was-created",
  "timestamp": "2025-11-10T12:34:56.789Z"
}
```

**Subprocess lifecycle:** One process per turn. Process exits naturally after writing JSON. Session state is file-based, not process-based.

**Streaming:** Batch-only for v1. The async iterator emits one `ResultMessage` when the run completes. Real streaming (`--output-format json-stream` NDJSON) is deferred to a future CLI addition.

### 3. API Surface

**`query()` — simple entry point:**

```typescript
import { query } from 'amplifier';

for await (const msg of query("summarize this file", { bundle: "foundation" })) {
  console.log(msg.response); // msg.type === 'result'
}

// With session resumption
for await (const msg of query("follow up", { sessionId: "abc123" })) { }
```

Returns an async iterable that emits a single `ResultMessage`:

```typescript
interface ResultMessage {
  type: 'result';
  status: 'success' | 'error';
  response?: string;
  error?: string;
  sessionId: string;
  bundle: string;
  model: string;
  timestamp: string;
}

interface QueryOptions {
  sessionId?: string;
  bundle?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  binaryPath?: string;
  timeoutMs?: number;
}
```

**`AmplifierClient` — advanced surface:**

```typescript
const client = new AmplifierClient({ bundle: 'foundation' });

// Multi-turn session
const session = await client.createSession();
const r1 = await session.prompt("hello");
const r2 = await session.prompt("follow up");
await session.close();

// Recipes
const result = await client.runRecipe('./my-recipe.yaml', { key: 'value' });

// Bundle install
await client.install('git+https://github.com/org/bundle@main');
```

`AmplifierClient` constructor accepts `{ bundle?, provider?, model?, binaryPath? }`. Each `session.prompt()` spawns a fresh process with `--resume <sessionId>`. `runRecipe()` wraps `amplifier recipe run --output-format json`. `install()` wraps `amplifier bundle add`.

**Public exports from main package:**

```typescript
export { query } from './query';
export { AmplifierClient } from './client';
export type { ResultMessage, QueryOptions, AmplifierClientOptions, Session } from './types';
export { AmplifierBinaryNotFoundError, AmplifierProcessError, AmplifierSessionError } from './errors';
```

### 4. Error Handling & Process Management

**Error types:**

| Error Class | When Thrown |
|---|---|
| `AmplifierBinaryNotFoundError` | Binary missing, no PATH fallback found |
| `AmplifierProcessError` | Non-zero exit code; includes stderr |
| `AmplifierSessionError` | `status: 'error'` in JSON response |

All three are plain subclasses of `Error` with `.message` and `.cause`. No opaque error codes — messages are human-readable and actionable.

**Process cleanup:** Each spawned process is tracked. On `session.close()`, the process receives SIGTERM. On `query()` completion, the process exits naturally. On Node.js process exit, all child processes are cleaned up via `process.on('exit')`. No zombie processes.

**Timeouts:** `query()` and `session.prompt()` accept optional `timeoutMs`. If timeout fires, the process is killed and `AmplifierProcessError` is thrown with `code: 'TIMEOUT'`. Default: no timeout (defers to amplifier's own execution limits).

**Binary version check:** On first use, the SDK runs `amplifier --version`, parses semver, and warns (never throws) if below `MINIMUM_BINARY_VERSION`. Can be silenced via `AMPLIFIER_SKIP_VERSION_CHECK=1`.

**Concurrent sessions:** `AmplifierClient` supports multiple concurrent sessions — each is an independent subprocess. No global process limit enforced by the SDK.

## Data Flow

**Single-shot query:**

```
User code                SDK                          OS                    Amplifier binary
   │                      │                            │                         │
   │  query("prompt")     │                            │                         │
   │─────────────────────▶│                            │                         │
   │                      │  spawn(amplifier run ...)  │                         │
   │                      │───────────────────────────▶│                         │
   │                      │                            │  exec amplifier         │
   │                      │                            │────────────────────────▶│
   │                      │                            │                         │ (runs agent)
   │                      │                            │  stdout: JSON           │
   │                      │                            │◀────────────────────────│
   │                      │  process exit + stdout     │  exit 0                 │
   │                      │◀───────────────────────────│                         │
   │  ResultMessage       │                            │                         │
   │◀─────────────────────│                            │                         │
```

**Multi-turn session:**

```
   │  createSession()     │                            │                         │
   │─────────────────────▶│  spawn(amplifier run ...)  │                         │
   │                      │───────────────────────────▶│  ──▶ run ──▶ exit      │
   │                      │◀───────────────────────────│  {session_id: "abc"}    │
   │  r1 (+ sessionId)    │                            │                         │
   │◀─────────────────────│                            │                         │
   │                      │                            │                         │
   │  prompt("follow up") │                            │                         │
   │─────────────────────▶│  spawn(... --resume abc)   │                         │
   │                      │───────────────────────────▶│  ──▶ run ──▶ exit      │
   │                      │◀───────────────────────────│  {session_id: "abc"}    │
   │  r2                  │                            │                         │
   │◀─────────────────────│                            │                         │
```

Each turn is a complete process lifecycle. Session continuity is handled entirely by amplifier's file-based session persistence.

## Testing Strategy

**Unit tests** — pure TypeScript, no subprocess required. Mock `child_process.spawn` and simulate stdout/stderr streams. Cover: binary discovery logic, JSON parsing, error classification, session ID extraction, timeout behavior. Fast, run on every commit.

**Integration tests** — require the actual bundled binary. Spawn real `amplifier run --output-format json` processes. Cover: real prompt round-trips, `--resume` session continuity, `install()` invoking `amplifier bundle add`, error responses producing the correct error class. Tagged `@integration`, not run in CI unless the binary is present.

**Platform tests** — run in CI matrix across macOS arm64, macOS x64, Linux x64, Linux arm64, Windows x64. Verify binary discovery resolves correctly for each platform package. Verify the binary executes and returns valid JSON. Gate before any release.

**Test tooling:** Vitest for test runner. `tsup` for build (CJS + ESM + `.d.ts`). No external mock framework — Vitest's built-in mock for `child_process.spawn` is sufficient.

## Open Questions

- **Package name:** What is the exact npm package name? (`amplifier`, `@microsoft/amplifier`, `@amplifier/sdk`?)
- **Binary compilation:** How is the Amplifier binary compiled for each platform? (PyOxidizer? Nuitka? Pure Rust binary?) This determines the platform package build pipeline.
- **Recipe JSON support:** Does `amplifier recipe run` already support `--output-format json`? (Or does it need to be added alongside the session run command?)
- **Node.js version floor:** What is the minimum supported Node.js version? (Suggest >=18 for native `fetch` and stable `ReadableStream`.)
