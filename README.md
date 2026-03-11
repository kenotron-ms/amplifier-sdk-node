# amplifier-sdk

The official Node.js SDK for [Amplifier](https://github.com/amplifier-dev/amplifier) — call AI agents from your code with a typed TypeScript API.

## Install

```bash
npm install amplifier-sdk
```

The Amplifier CLI is installed automatically during `npm install` — no separate setup needed.

> **If auto-install fails** (rare, usually missing Python): see [Requirements](#requirements).

## Quick Start

```typescript
import { query } from "amplifier-sdk";

for await (const message of query("Explain quicksort in two sentences")) {
  console.log(message.response);
}
```

That's it. One function, one import, and you're talking to an AI agent.

## Going Further

### Multi-turn Sessions

Use `AmplifierClient` to create sessions that remember context across prompts:

```typescript
import { AmplifierClient } from "amplifier-sdk";

const client = new AmplifierClient();
const session = await client.createSession("You are a helpful coding assistant.");

const reply1 = await session.prompt("What's the difference between map and flatMap?");
console.log(reply1.response);

// Session remembers the conversation
const reply2 = await session.prompt("Show me an example of each.");
console.log(reply2.response);
```

Sessions are file-based — no server to manage. Call `session.close()` when you're done (it's a no-op cleanup, nothing will break if you forget).

### Custom Bundle, Provider, or Model

Pass options to `query()` or `createSession()` to control which bundle, provider, or model handles your request:

```typescript
for await (const message of query("Summarize this PR", {
  bundle: "my-team-bundle",
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  maxTokens: 4096,
})) {
  console.log(message.response);
}
```

### Running a Recipe

Recipes are reusable multi-step workflows. Run them directly:

```typescript
const client = new AmplifierClient();

const result = await client.runRecipe("@recipes:code-review.yaml", {
  file_path: "src/auth.ts",
  review_focus: "security",
});

console.log(result.response);
```

### Installing Bundles

```typescript
const client = new AmplifierClient();
await client.install("https://github.com/my-org/my-bundle.git");
```

### Timeout Handling

Long-running queries can be given a timeout in milliseconds:

```typescript
const session = await client.createSession("Analyze this codebase.");

const result = await session.prompt("Find all security issues", {
  timeoutMs: 120_000, // 2 minutes
});
```

You can also set a default timeout on `query()`:

```typescript
for await (const message of query("Quick question", { timeoutMs: 30_000 })) {
  console.log(message.response);
}
```

## Configuration

### Binary Discovery

The SDK needs to find the `amplifier` CLI binary. It checks these locations in order:

| Priority | Source | Example |
|----------|--------|---------|
| 1 | `AMPLIFIER_BINARY` env var | `AMPLIFIER_BINARY=/usr/local/bin/amplifier` |
| 2 | `binaryPath` option | `query("hi", { binaryPath: "/opt/amplifier" })` |
| 3 | Bundled platform package | Installed automatically via `@amplifier/sdk-darwin-arm64` etc. |
| 4 | System `PATH` | Whatever `which amplifier` finds |

If none are found, you'll get an `AmplifierBinaryNotFoundError` with instructions to install.

### Environment Variables

| Variable | Description |
|----------|-------------|
| `AMPLIFIER_BINARY` | Absolute path to the Amplifier CLI binary |
| `AMPLIFIER_SKIP_VERSION_CHECK` | Set to `1` to skip CLI version compatibility check on startup |

## Error Handling

The SDK throws three specific error classes. Catch them to handle different failure modes:

```typescript
import {
  query,
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from "amplifier-sdk";

try {
  for await (const message of query("Hello")) {
    console.log(message.response);
  }
} catch (error) {
  if (error instanceof AmplifierBinaryNotFoundError) {
    // Amplifier CLI isn't installed or can't be found
    // error.message includes install instructions
    console.error("Please install Amplifier:", error.message);

  } else if (error instanceof AmplifierProcessError) {
    // The CLI process exited with an error or timed out
    console.error("Process failed:", error.message);
    console.error("stderr:", error.stderr);
    console.error("code:", error.code);

  } else if (error instanceof AmplifierSessionError) {
    // The CLI returned JSON with status: "error"
    console.error("Session error:", error.message);
    console.error("type:", error.errorType);
  }
}
```

| Error Class | When It's Thrown |
|-------------|-----------------|
| `AmplifierBinaryNotFoundError` | Binary not found at any of the discovery locations |
| `AmplifierProcessError` | CLI exits non-zero, times out, or produces unexpected output |
| `AmplifierSessionError` | CLI returns a valid response with `status: "error"` |

## API Reference

### `query(prompt, options?)`

Async generator that yields a single `ResultMessage`. The simplest way to make a one-shot call.

### `AmplifierClient`

| Method | Description |
|--------|-------------|
| `constructor(options?)` | Create a client with default options |
| `createSession(prompt, opts?)` | Start a multi-turn session, returns a `Session` |
| `runRecipe(recipePath, context?)` | Execute a recipe file, returns a `ResultMessage` |
| `install(bundleUrl)` | Install a bundle from a URL |

### `Session`

| Property / Method | Description |
|-------------------|-------------|
| `sessionId` | The unique session identifier (readonly) |
| `prompt(text, opts?)` | Send a follow-up message, returns `SessionResult` |
| `close()` | Clean up the session (no-op — sessions are file-based) |

### `QueryOptions`

```typescript
interface QueryOptions {
  sessionId?: string;    // Resume an existing session
  bundle?: string;       // Bundle to use
  provider?: string;     // AI provider (e.g., "anthropic", "openai")
  model?: string;        // Model name
  maxTokens?: number;    // Max tokens in response
  binaryPath?: string;   // Override binary discovery
  timeoutMs?: number;    // Timeout in milliseconds
}
```

### `ResultMessage`

```typescript
interface ResultMessage {
  type: "result";
  status: "success" | "error";
  response?: string;       // The AI response text
  error?: string;          // Error message if status is "error"
  errorType?: string;      // Error classification
  sessionId: string;       // Session ID for follow-ups
  bundle: string;          // Bundle that handled the request
  model: string;           // Model that generated the response
  timestamp: string;       // ISO 8601 timestamp
}
```

For full type definitions, see the TypeScript types included with the package.

## Requirements

- **Node.js 18** or later
- **Amplifier CLI** — installed automatically by `npm install`. If auto-install fails, see [Configuration](#configuration) for manual options.

## License

MIT
