# Amplifier Node.js SDK — Implementation Plan

> **For execution:** Use `/execute-plan` mode or the subagent-driven-development recipe.

**Goal:** Build the official Node.js SDK for Amplifier — a fully self-contained npm package that bundles the Amplifier binary, wraps it via subprocess, and exposes a typed TypeScript API.

**Architecture:** Each SDK call spawns `amplifier run --output-format json` as a subprocess and parses the single JSON result from stdout. Session continuity uses amplifier's file-based persistence via `--resume <sessionId>`. No long-lived processes, no sockets.

**Tech Stack:** TypeScript 5, tsup (build), Vitest (tests), child_process (subprocess), npm optionalDependencies (binary distribution)

---

## Phase 1 — Foundation (no dependencies between tasks)

### Task 1: Scaffold the project

**Why:** Every other task depends on having a buildable, testable project skeleton. Nothing works without this.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsup.config.ts`
- Create: `.gitignore`

**Step 1: Create `package.json`**

Create file `package.json` with this exact content:

```json
{
  "name": "amplifier",
  "version": "0.1.0",
  "description": "Official Node.js SDK for Amplifier",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["amplifier", "ai", "agent", "sdk", "typescript"],
  "author": "Amplifier Team",
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  },
  "optionalDependencies": {
    "@amplifier/sdk-darwin-arm64": "0.1.0",
    "@amplifier/sdk-darwin-x64": "0.1.0",
    "@amplifier/sdk-linux-x64": "0.1.0",
    "@amplifier/sdk-linux-arm64": "0.1.0",
    "@amplifier/sdk-win32-x64": "0.1.0"
  }
}
```

**Step 2: Create `tsconfig.json`**

This mirrors the sibling SDK at `amplifier-sdk` exactly. `noEmit: true` means `tsc` is typecheck-only — `tsup` handles the actual build.

Create file `tsconfig.json` with this exact content:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "noEmit": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "isolatedModules": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "src/__tests__"]
}
```

**Step 3: Create `tsup.config.ts`**

Create file `tsup.config.ts` with this exact content:

```typescript
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
```

**Step 4: Create `.gitignore`**

Create file `.gitignore` with this exact content:

```
node_modules/
dist/
*.js.map
*.mjs.map
*.d.ts.map
```

**Step 5: Create a minimal `src/index.ts` so the project builds**

Create file `src/index.ts` with this exact content (placeholder — Task 9 replaces it):

```typescript
// Amplifier Node.js SDK — placeholder entry point.
// Real exports are wired up in Task 9.
export {};
```

**Step 6: Install dependencies**

Run:
```bash
npm install --ignore-scripts 2>&1 | tail -5
```

Expected: installs typescript, tsup, vitest, @types/node. The five `optionalDependencies` will warn/skip since those packages don't exist on npm yet — that's fine.

**Step 7: Verify the build works**

Run:
```bash
npx tsup && ls dist/
```

Expected output includes: `index.js`, `index.mjs`, `index.d.ts` (plus sourcemaps).

**Step 8: Verify typecheck works**

Run:
```bash
npx tsc --noEmit
```

Expected: exits 0, no errors.

**Step 9: Commit**

```bash
git add package.json tsconfig.json tsup.config.ts .gitignore src/index.ts package-lock.json && git commit -m "chore: scaffold project with tsup, vitest, and typescript"
```

---

### Task 2: `src/types.ts` — all TypeScript interfaces

**Why:** Every other module imports from `types.ts`. We define the shapes first so downstream code has something to reference. No implementation, no tests needed — pure type definitions.

**Files:**
- Create: `src/types.ts`

**Step 1: Create `src/types.ts`**

Create file `src/types.ts` with this exact content:

```typescript
/**
 * Type definitions for Amplifier Node.js SDK.
 *
 * These types describe the JSON wire format returned by the
 * `amplifier run --output-format json` subprocess.
 */

/**
 * Single JSON result from `amplifier run --output-format json`.
 * One of these is emitted per subprocess invocation.
 */
export interface ResultMessage {
  type: "result";
  status: "success" | "error";
  response?: string;
  error?: string;
  errorType?: string;
  sessionId: string;
  bundle: string;
  model: string;
  timestamp: string;
}

/**
 * Options for the `query()` function.
 */
export interface QueryOptions {
  sessionId?: string;
  bundle?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  binaryPath?: string;
  timeoutMs?: number;
}

/**
 * Constructor options for `AmplifierClient`.
 */
export interface AmplifierClientOptions {
  bundle?: string;
  provider?: string;
  model?: string;
  binaryPath?: string;
}

/**
 * Result from a session prompt — guaranteed to carry a `sessionId`.
 */
export interface SessionResult extends ResultMessage {
  sessionId: string;
}
```

**Step 2: Verify it typechecks**

Run:
```bash
npx tsc --noEmit
```

Expected: exits 0, no errors.

**Step 3: Commit**

```bash
git add src/types.ts && git commit -m "feat: add TypeScript type definitions"
```

---

## Phase 2 — Core Primitives (depends on types)

### Task 3: `src/errors.ts` + tests

**Why:** Every module that can fail needs typed errors. We build these first so `binary.ts`, `runner.ts`, and friends can throw them.

**Files:**
- Create: `src/errors.ts`
- Create: `src/__tests__/errors.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/errors.test.ts` with this exact content:

```typescript
import { describe, it, expect } from "vitest";
import {
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from "../errors";

describe("AmplifierBinaryNotFoundError", () => {
  it("has the correct name", () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err.name).toBe("AmplifierBinaryNotFoundError");
  });

  it("has an actionable install message", () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err.message).toContain("npm install amplifier");
  });

  it("is an instance of Error", () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AmplifierProcessError", () => {
  it("has the correct name", () => {
    const err = new AmplifierProcessError("boom", "some stderr");
    expect(err.name).toBe("AmplifierProcessError");
  });

  it("stores the message", () => {
    const err = new AmplifierProcessError("process failed", "stderr output");
    expect(err.message).toBe("process failed");
  });

  it("stores stderr", () => {
    const err = new AmplifierProcessError("boom", "stderr output");
    expect(err.stderr).toBe("stderr output");
  });

  it("stores an optional code", () => {
    const err = new AmplifierProcessError("boom", "stderr", "TIMEOUT");
    expect(err.code).toBe("TIMEOUT");
  });

  it("leaves code undefined when not provided", () => {
    const err = new AmplifierProcessError("boom", "stderr");
    expect(err.code).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new AmplifierProcessError("boom", "stderr");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AmplifierSessionError", () => {
  it("has the correct name", () => {
    const err = new AmplifierSessionError("bad session");
    expect(err.name).toBe("AmplifierSessionError");
  });

  it("stores the message", () => {
    const err = new AmplifierSessionError("something broke");
    expect(err.message).toBe("something broke");
  });

  it("stores an optional errorType", () => {
    const err = new AmplifierSessionError("broke", "ModuleValidationError");
    expect(err.errorType).toBe("ModuleValidationError");
  });

  it("leaves errorType undefined when not provided", () => {
    const err = new AmplifierSessionError("broke");
    expect(err.errorType).toBeUndefined();
  });

  it("is an instance of Error", () => {
    const err = new AmplifierSessionError("broke");
    expect(err).toBeInstanceOf(Error);
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/errors.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../errors'`

**Step 3: Write the implementation**

Create file `src/errors.ts` with this exact content:

```typescript
/**
 * Error classes for the Amplifier Node.js SDK.
 *
 * Three errors, three situations:
 * - Binary missing → AmplifierBinaryNotFoundError
 * - Process crashed (non-zero exit) → AmplifierProcessError
 * - Process succeeded but JSON says "error" → AmplifierSessionError
 */

/**
 * Thrown when the amplifier binary cannot be found anywhere:
 * not in AMPLIFIER_BINARY env, not in optionalDependencies, not on PATH.
 */
export class AmplifierBinaryNotFoundError extends Error {
  constructor() {
    super("Amplifier binary not found. Install with: npm install amplifier");
    this.name = "AmplifierBinaryNotFoundError";
  }
}

/**
 * Thrown when the amplifier subprocess exits with a non-zero code,
 * or when it is killed (e.g. timeout).
 */
export class AmplifierProcessError extends Error {
  readonly code?: string;
  readonly stderr: string;

  constructor(message: string, stderr: string, code?: string) {
    super(message);
    this.name = "AmplifierProcessError";
    this.stderr = stderr;
    this.code = code;
  }
}

/**
 * Thrown when the amplifier subprocess exits 0 but the JSON payload
 * contains `"status": "error"`.
 */
export class AmplifierSessionError extends Error {
  readonly errorType?: string;

  constructor(message: string, errorType?: string) {
    super(message);
    this.name = "AmplifierSessionError";
    this.errorType = errorType;
  }
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/errors.test.ts
```

Expected: all 12 tests PASS.

**Step 5: Commit**

```bash
git add src/errors.ts src/__tests__/errors.test.ts && git commit -m "feat: add error classes with tests"
```

---

### Task 4: `src/binary.ts` + tests

**Why:** Before we can spawn `amplifier`, we need to find it. This module implements a 4-step priority search: env var → optionalDependency → system PATH → throw.

**Files:**
- Create: `src/binary.ts`
- Create: `src/__tests__/binary.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/binary.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { discoverBinary, checkBinaryVersion } from "../binary";
import { AmplifierBinaryNotFoundError } from "../errors";

// We mock child_process.execSync for the PATH-fallback and version-check tests.
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// We need the mock reference to control return values per-test.
import { execSync } from "child_process";
const mockExecSync = vi.mocked(execSync);

describe("discoverBinary — priority 1: AMPLIFIER_BINARY env var", () => {
  const originalEnv = process.env.AMPLIFIER_BINARY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AMPLIFIER_BINARY;
    } else {
      process.env.AMPLIFIER_BINARY = originalEnv;
    }
  });

  it("returns the env var value when AMPLIFIER_BINARY is set", () => {
    process.env.AMPLIFIER_BINARY = "/custom/path/amplifier";
    expect(discoverBinary()).toBe("/custom/path/amplifier");
  });
});

describe("discoverBinary — priority 3: system PATH fallback", () => {
  const originalEnv = process.env.AMPLIFIER_BINARY;

  beforeEach(() => {
    delete process.env.AMPLIFIER_BINARY;
    mockExecSync.mockReset();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AMPLIFIER_BINARY = originalEnv;
    }
  });

  it("returns the path from 'which' when binary is on system PATH", () => {
    // Mock require.resolve to throw (no optionalDep installed)
    // discoverBinary will fall through to the which/where check.
    mockExecSync.mockReturnValue(Buffer.from("/usr/local/bin/amplifier\n"));
    const result = discoverBinary();
    expect(result).toBe("/usr/local/bin/amplifier");
  });

  it("throws AmplifierBinaryNotFoundError when nothing is found", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("not found");
    });
    expect(() => discoverBinary()).toThrow(AmplifierBinaryNotFoundError);
  });
});

describe("checkBinaryVersion", () => {
  const originalSkip = process.env.AMPLIFIER_SKIP_VERSION_CHECK;

  beforeEach(() => {
    mockExecSync.mockReset();
    delete process.env.AMPLIFIER_SKIP_VERSION_CHECK;
  });

  afterEach(() => {
    if (originalSkip !== undefined) {
      process.env.AMPLIFIER_SKIP_VERSION_CHECK = originalSkip;
    } else {
      delete process.env.AMPLIFIER_SKIP_VERSION_CHECK;
    }
  });

  it("does nothing when AMPLIFIER_SKIP_VERSION_CHECK is set", () => {
    process.env.AMPLIFIER_SKIP_VERSION_CHECK = "1";
    checkBinaryVersion("/fake/amplifier");
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("does not warn when version meets minimum", () => {
    mockExecSync.mockReturnValue(Buffer.from("amplifier 0.1.0\n"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkBinaryVersion("/fake/amplifier");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("warns when version is below minimum", () => {
    mockExecSync.mockReturnValue(Buffer.from("amplifier 0.0.1\n"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkBinaryVersion("/fake/amplifier");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("below minimum")
    );
    warnSpy.mockRestore();
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/binary.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../binary'`

**Step 3: Write the implementation**

Create file `src/binary.ts` with this exact content:

```typescript
/**
 * Binary discovery for the Amplifier CLI.
 *
 * Search priority:
 *   1. AMPLIFIER_BINARY env var
 *   2. optionalDependencies platform package
 *   3. System PATH (which / where)
 *   4. Throw AmplifierBinaryNotFoundError
 */

import { execSync } from "child_process";
import { join, dirname } from "path";
import { AmplifierBinaryNotFoundError } from "./errors";

/** SDK won't work with binaries older than this. */
export const MINIMUM_BINARY_VERSION = "0.1.0";

/**
 * Map of Node.js platform+arch → npm optional-dependency package name.
 */
const PLATFORM_PACKAGES: Record<string, string> = {
  "darwin-arm64": "@amplifier/sdk-darwin-arm64",
  "darwin-x64": "@amplifier/sdk-darwin-x64",
  "linux-x64": "@amplifier/sdk-linux-x64",
  "linux-arm64": "@amplifier/sdk-linux-arm64",
  "win32-x64": "@amplifier/sdk-win32-x64",
};

/**
 * Find the amplifier binary. Tries, in order:
 *   1. `process.env.AMPLIFIER_BINARY`
 *   2. Platform package from optionalDependencies
 *   3. `which amplifier` (or `where amplifier` on Windows)
 *   4. Throws `AmplifierBinaryNotFoundError`
 */
export function discoverBinary(): string {
  // Priority 1: explicit env var
  if (process.env.AMPLIFIER_BINARY) {
    return process.env.AMPLIFIER_BINARY;
  }

  // Priority 2: optionalDependencies platform package
  const platformKey = `${process.platform}-${process.arch}`;
  const packageName = PLATFORM_PACKAGES[platformKey];
  if (packageName) {
    try {
      const pkgJson = require.resolve(`${packageName}/package.json`);
      const pkgDir = dirname(pkgJson);
      const binaryName =
        process.platform === "win32" ? "amplifier.exe" : "amplifier";
      return join(pkgDir, "bin", binaryName);
    } catch {
      // Package not installed — fall through
    }
  }

  // Priority 3: system PATH
  try {
    const cmd = process.platform === "win32" ? "where amplifier" : "which amplifier";
    const result = execSync(cmd, { encoding: "utf-8" }).trim();
    if (result) {
      return result;
    }
  } catch {
    // Not on PATH — fall through
  }

  // Priority 4: give up
  throw new AmplifierBinaryNotFoundError();
}

/**
 * Check that the binary version meets the minimum.
 * Warns on mismatch — never throws.
 * Skipped entirely if `AMPLIFIER_SKIP_VERSION_CHECK` env var is set.
 */
export function checkBinaryVersion(binaryPath: string): void {
  if (process.env.AMPLIFIER_SKIP_VERSION_CHECK) {
    return;
  }

  try {
    const output = execSync(`${binaryPath} --version`, {
      encoding: "utf-8",
    }).trim();
    // Expected format: "amplifier X.Y.Z"
    const match = output.match(/(\d+\.\d+\.\d+)/);
    if (!match) return;

    const version = match[1];
    if (compareSemver(version, MINIMUM_BINARY_VERSION) < 0) {
      console.warn(
        `Amplifier binary version ${version} is below minimum ${MINIMUM_BINARY_VERSION}. ` +
          `Update with: npm install amplifier@latest`
      );
    }
  } catch {
    // If we can't check the version, don't block execution.
  }
}

/**
 * Compare two semver strings. Returns <0, 0, or >0.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/binary.test.ts
```

Expected: all 6 tests PASS.

**Step 5: Commit**

```bash
git add src/binary.ts src/__tests__/binary.test.ts && git commit -m "feat: add binary discovery with tests"
```

---

## Phase 3 — Subprocess Engine (depends on errors, binary)

### Task 5: `src/runner.ts` + tests

**Why:** This is the engine. Every public API method (`query`, `session.prompt`, `client.createSession`) delegates to `runAmplifier()`. It spawns the subprocess, collects output, parses JSON, and throws the right errors.

**Files:**
- Create: `src/runner.ts`
- Create: `src/__tests__/runner.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/runner.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runAmplifier } from "../runner";
import { AmplifierProcessError, AmplifierSessionError } from "../errors";

// Mock child_process.spawn to return a controllable fake process.
vi.mock("child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock binary discovery so runAmplifier doesn't actually search for a binary.
vi.mock("../binary", () => ({
  discoverBinary: vi.fn(() => "/fake/amplifier"),
  checkBinaryVersion: vi.fn(),
}));

import { spawn } from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";

const mockSpawn = vi.mocked(spawn);

/**
 * Creates a fake ChildProcess that emits configurable stdout/stderr
 * and exits with a configurable code.
 */
function createFakeProcess(options: {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}) {
  const proc = new EventEmitter() as ReturnType<typeof spawn>;
  const stdoutStream = new Readable({ read() {} });
  const stderrStream = new Readable({ read() {} });

  (proc as any).stdout = stdoutStream;
  (proc as any).stderr = stderrStream;
  (proc as any).pid = 12345;
  (proc as any).kill = vi.fn();

  // Emit data and close on next tick so the promise can attach listeners.
  setTimeout(() => {
    if (options.stdout) stdoutStream.push(options.stdout);
    stdoutStream.push(null);
    if (options.stderr) stderrStream.push(options.stderr);
    stderrStream.push(null);
    proc.emit("close", options.exitCode ?? 0);
  }, 0);

  return proc;
}

describe("runAmplifier — success path", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it("returns a parsed ResultMessage on success", async () => {
    const json = JSON.stringify({
      type: "result",
      status: "success",
      response: "Hello world",
      session_id: "abc-123",
      bundle: "foundation",
      model: "anthropic/claude-sonnet-4-5",
      timestamp: "2025-11-10T12:34:56.789Z",
    });
    mockSpawn.mockReturnValue(createFakeProcess({ stdout: json }));

    const result = await runAmplifier(["run", "--output-format", "json", "hello"]);

    expect(result.status).toBe("success");
    expect(result.response).toBe("Hello world");
    expect(result.sessionId).toBe("abc-123");
  });

  it("passes the correct args to spawn", async () => {
    const json = JSON.stringify({
      type: "result",
      status: "success",
      session_id: "x",
      bundle: "b",
      model: "m",
      timestamp: "t",
    });
    mockSpawn.mockReturnValue(createFakeProcess({ stdout: json }));

    await runAmplifier(["run", "--output-format", "json", "test prompt"], {
      binaryPath: "/my/binary",
    });

    expect(mockSpawn).toHaveBeenCalledWith(
      "/my/binary",
      ["run", "--output-format", "json", "test prompt"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });
});

describe("runAmplifier — error paths", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
  });

  it("throws AmplifierProcessError on non-zero exit code", async () => {
    mockSpawn.mockReturnValue(
      createFakeProcess({ stdout: "", stderr: "fatal error", exitCode: 1 })
    );

    await expect(runAmplifier(["run"])).rejects.toThrow(AmplifierProcessError);
  });

  it("includes stderr in AmplifierProcessError", async () => {
    mockSpawn.mockReturnValue(
      createFakeProcess({ stdout: "", stderr: "segfault", exitCode: 1 })
    );

    try {
      await runAmplifier(["run"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AmplifierProcessError);
      expect((err as AmplifierProcessError).stderr).toBe("segfault");
    }
  });

  it("throws AmplifierSessionError when JSON status is 'error'", async () => {
    const json = JSON.stringify({
      type: "result",
      status: "error",
      error: "Module not found",
      error_type: "ModuleValidationError",
      session_id: "abc",
      bundle: "b",
      model: "m",
      timestamp: "t",
    });
    mockSpawn.mockReturnValue(createFakeProcess({ stdout: json }));

    try {
      await runAmplifier(["run"]);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AmplifierSessionError);
      expect((err as AmplifierSessionError).message).toBe("Module not found");
      expect((err as AmplifierSessionError).errorType).toBe(
        "ModuleValidationError"
      );
    }
  });
});

describe("runAmplifier — timeout", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    vi.useFakeTimers();
  });

  it("kills the process and throws on timeout", async () => {
    // Create a process that never emits close.
    const proc = new EventEmitter() as ReturnType<typeof spawn>;
    const stdoutStream = new Readable({ read() {} });
    const stderrStream = new Readable({ read() {} });
    (proc as any).stdout = stdoutStream;
    (proc as any).stderr = stderrStream;
    (proc as any).pid = 99;
    (proc as any).kill = vi.fn(() => {
      // Simulate the process dying after kill
      stderrStream.push(null);
      stdoutStream.push(null);
      proc.emit("close", null);
    });
    mockSpawn.mockReturnValue(proc);

    const promise = runAmplifier(["run"], { timeoutMs: 5000 });

    // Advance past the timeout
    await vi.advanceTimersByTimeAsync(5001);

    await expect(promise).rejects.toThrow(AmplifierProcessError);
    await expect(promise).rejects.toThrow(/timed out/i);
    expect((proc as any).kill).toHaveBeenCalled();

    vi.useRealTimers();
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/runner.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../runner'`

**Step 3: Write the implementation**

Create file `src/runner.ts` with this exact content:

```typescript
/**
 * Subprocess runner for the Amplifier CLI.
 *
 * Every SDK call bottlenecks through `runAmplifier()`.
 * It spawns the binary, collects stdout/stderr, parses JSON,
 * and throws typed errors.
 */

import { spawn } from "child_process";
import { discoverBinary, checkBinaryVersion } from "./binary";
import { AmplifierProcessError, AmplifierSessionError } from "./errors";
import type { ResultMessage } from "./types";

let versionChecked = false;

/**
 * Spawn `amplifier` with the given args, wait for exit,
 * parse the JSON result from stdout, and return it.
 *
 * Throws:
 * - `AmplifierProcessError` on non-zero exit or timeout
 * - `AmplifierSessionError` when JSON status is "error"
 * - `AmplifierBinaryNotFoundError` if binary can't be found
 */
export async function runAmplifier(
  args: string[],
  options: { binaryPath?: string; timeoutMs?: number } = {}
): Promise<ResultMessage> {
  const binaryPath = options.binaryPath ?? discoverBinary();

  // One-time version check on first use.
  if (!versionChecked) {
    versionChecked = true;
    checkBinaryVersion(binaryPath);
  }

  return new Promise<ResultMessage>((resolve, reject) => {
    const proc = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Timeout handling
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options.timeoutMs) {
      timer = setTimeout(() => {
        killed = true;
        proc.kill();
      }, options.timeoutMs);
    }

    // Cleanup: kill child if parent exits
    const cleanup = () => {
      try {
        proc.kill();
      } catch {
        // already dead
      }
    };
    process.on("exit", cleanup);

    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      process.removeListener("exit", cleanup);

      // Timeout
      if (killed) {
        reject(
          new AmplifierProcessError(
            "Amplifier process timed out",
            stderr,
            "TIMEOUT"
          )
        );
        return;
      }

      // Non-zero exit
      if (code !== 0) {
        reject(
          new AmplifierProcessError(
            `Amplifier process exited with code ${code}`,
            stderr
          )
        );
        return;
      }

      // Parse JSON
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        reject(
          new AmplifierProcessError(
            "Failed to parse JSON from amplifier stdout",
            stderr
          )
        );
        return;
      }

      // Normalize snake_case → camelCase for the fields we care about
      const result: ResultMessage = {
        type: "result",
        status: parsed.status as "success" | "error",
        response: parsed.response as string | undefined,
        error: parsed.error as string | undefined,
        errorType: parsed.error_type as string | undefined,
        sessionId: (parsed.session_id ?? parsed.sessionId) as string,
        bundle: parsed.bundle as string,
        model: parsed.model as string,
        timestamp: parsed.timestamp as string,
      };

      // Session-level error
      if (result.status === "error") {
        reject(
          new AmplifierSessionError(
            result.error ?? "Unknown session error",
            result.errorType
          )
        );
        return;
      }

      resolve(result);
    });
  });
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/runner.test.ts
```

Expected: all 7 tests PASS.

**Step 5: Commit**

```bash
git add src/runner.ts src/__tests__/runner.test.ts && git commit -m "feat: add subprocess runner with tests"
```

---

## Phase 4 — API Layer (depends on runner, types)

### Task 6: `src/query.ts` + tests

**Why:** `query()` is the simple entry point — one function, one prompt, one result. It's the first thing users see in the README.

**Files:**
- Create: `src/query.ts`
- Create: `src/__tests__/query.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/query.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "../query";
import type { ResultMessage } from "../types";

// Mock the runner — we don't want to spawn real processes.
vi.mock("../runner", () => ({
  runAmplifier: vi.fn(),
}));

import { runAmplifier } from "../runner";
const mockRunAmplifier = vi.mocked(runAmplifier);

const FAKE_RESULT: ResultMessage = {
  type: "result",
  status: "success",
  response: "Hi there",
  sessionId: "sess-1",
  bundle: "foundation",
  model: "anthropic/claude-sonnet-4-5",
  timestamp: "2025-11-10T12:34:56.789Z",
};

describe("query — args construction", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("builds minimal args: run --output-format json <prompt>", async () => {
    for await (const _msg of query("hello")) {
      // consume
    }

    expect(mockRunAmplifier).toHaveBeenCalledWith(
      ["run", "--output-format", "json", "hello"],
      expect.any(Object)
    );
  });

  it("adds --resume when sessionId is provided", async () => {
    for await (const _msg of query("follow up", { sessionId: "abc" })) {
      // consume
    }

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--resume");
    expect(args[args.indexOf("--resume") + 1]).toBe("abc");
  });

  it("adds --bundle when bundle is provided", async () => {
    for await (const _msg of query("hello", { bundle: "foundation" })) {
      // consume
    }

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--bundle");
    expect(args[args.indexOf("--bundle") + 1]).toBe("foundation");
  });

  it("adds --provider when provider is provided", async () => {
    for await (const _msg of query("hello", { provider: "anthropic" })) {
      // consume
    }

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--provider");
    expect(args[args.indexOf("--provider") + 1]).toBe("anthropic");
  });

  it("adds --model when model is provided", async () => {
    for await (const _msg of query("hello", { model: "claude-sonnet-4-5" })) {
      // consume
    }

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-4-5");
  });

  it("adds --max-tokens when maxTokens is provided", async () => {
    for await (const _msg of query("hello", { maxTokens: 4096 })) {
      // consume
    }

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--max-tokens");
    expect(args[args.indexOf("--max-tokens") + 1]).toBe("4096");
  });

  it("passes binaryPath and timeoutMs to runAmplifier options", async () => {
    for await (const _msg of query("hello", {
      binaryPath: "/my/bin",
      timeoutMs: 10000,
    })) {
      // consume
    }

    expect(mockRunAmplifier).toHaveBeenCalledWith(expect.any(Array), {
      binaryPath: "/my/bin",
      timeoutMs: 10000,
    });
  });
});

describe("query — async iterator", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("yields exactly one ResultMessage", async () => {
    const results: ResultMessage[] = [];
    for await (const msg of query("hello")) {
      results.push(msg);
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(FAKE_RESULT);
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/query.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../query'`

**Step 3: Write the implementation**

Create file `src/query.ts` with this exact content:

```typescript
/**
 * Simple query entry point for Amplifier.
 *
 * ```typescript
 * import { query } from "amplifier";
 * for await (const msg of query("summarize this file")) {
 *   console.log(msg.response);
 * }
 * ```
 */

import { runAmplifier } from "./runner";
import type { ResultMessage, QueryOptions } from "./types";

/**
 * Send a prompt to Amplifier and iterate over the result.
 *
 * Returns an async generator that yields exactly one `ResultMessage`
 * (batch-only for v1 — real streaming deferred to a future CLI addition).
 */
export async function* query(
  prompt: string,
  options: QueryOptions = {}
): AsyncGenerator<ResultMessage> {
  const args: string[] = ["run", "--output-format", "json"];

  if (options.sessionId) {
    args.push("--resume", options.sessionId);
  }
  if (options.bundle) {
    args.push("--bundle", options.bundle);
  }
  if (options.provider) {
    args.push("--provider", options.provider);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.maxTokens != null) {
    args.push("--max-tokens", String(options.maxTokens));
  }

  // Prompt is always the last arg.
  args.push(prompt);

  const result = await runAmplifier(args, {
    binaryPath: options.binaryPath,
    timeoutMs: options.timeoutMs,
  });

  yield result;
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/query.test.ts
```

Expected: all 8 tests PASS.

**Step 5: Commit**

```bash
git add src/query.ts src/__tests__/query.test.ts && git commit -m "feat: add query() function with tests"
```

---

### Task 7: `src/session.ts` + tests

**Why:** `Session` wraps multi-turn conversations. It remembers the `sessionId` and passes `--resume` on every call. It's the building block for `AmplifierClient.createSession()`.

**Files:**
- Create: `src/session.ts`
- Create: `src/__tests__/session.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/session.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Session } from "../session";
import type { ResultMessage } from "../types";

vi.mock("../runner", () => ({
  runAmplifier: vi.fn(),
}));

import { runAmplifier } from "../runner";
const mockRunAmplifier = vi.mocked(runAmplifier);

const FAKE_RESULT: ResultMessage = {
  type: "result",
  status: "success",
  response: "Session response",
  sessionId: "sess-42",
  bundle: "foundation",
  model: "anthropic/claude-sonnet-4-5",
  timestamp: "2025-11-10T12:34:56.789Z",
};

describe("Session", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("stores the sessionId", () => {
    const session = new Session("sess-42", {});
    expect(session.sessionId).toBe("sess-42");
  });

  it("passes --resume with the sessionId on every prompt", async () => {
    const session = new Session("sess-42", {});
    await session.prompt("follow up");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--resume");
    expect(args[args.indexOf("--resume") + 1]).toBe("sess-42");
  });

  it("forwards client-level bundle option", async () => {
    const session = new Session("sess-42", { bundle: "foundation" });
    await session.prompt("hello");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--bundle");
    expect(args[args.indexOf("--bundle") + 1]).toBe("foundation");
  });

  it("forwards client-level provider option", async () => {
    const session = new Session("sess-42", { provider: "anthropic" });
    await session.prompt("hello");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--provider");
    expect(args[args.indexOf("--provider") + 1]).toBe("anthropic");
  });

  it("forwards client-level model option", async () => {
    const session = new Session("sess-42", { model: "claude-sonnet-4-5" });
    await session.prompt("hello");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("claude-sonnet-4-5");
  });

  it("forwards client-level binaryPath", async () => {
    const session = new Session("sess-42", { binaryPath: "/custom/bin" });
    await session.prompt("hello");

    expect(mockRunAmplifier).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ binaryPath: "/custom/bin" })
    );
  });

  it("forwards per-call timeoutMs", async () => {
    const session = new Session("sess-42", {});
    await session.prompt("hello", { timeoutMs: 5000 });

    expect(mockRunAmplifier).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });

  it("returns a SessionResult with sessionId", async () => {
    const session = new Session("sess-42", {});
    const result = await session.prompt("hello");

    expect(result.sessionId).toBe("sess-42");
    expect(result.response).toBe("Session response");
  });

  it("close() is a no-op (does not throw)", () => {
    const session = new Session("sess-42", {});
    expect(() => session.close()).not.toThrow();
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/session.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../session'`

**Step 3: Write the implementation**

Create file `src/session.ts` with this exact content:

```typescript
/**
 * Multi-turn session for Amplifier.
 *
 * Each `prompt()` call spawns a fresh subprocess with `--resume <sessionId>`.
 * Session state is persisted on disk by the amplifier binary — the SDK
 * just tracks the session ID.
 */

import { runAmplifier } from "./runner";
import type {
  AmplifierClientOptions,
  QueryOptions,
  SessionResult,
} from "./types";

export class Session {
  readonly sessionId: string;
  private readonly options: AmplifierClientOptions;

  constructor(sessionId: string, options: AmplifierClientOptions) {
    this.sessionId = sessionId;
    this.options = options;
  }

  /**
   * Send a follow-up prompt within this session.
   */
  async prompt(
    text: string,
    opts?: Pick<QueryOptions, "timeoutMs">
  ): Promise<SessionResult> {
    const args: string[] = ["run", "--output-format", "json"];

    // Always resume the existing session.
    args.push("--resume", this.sessionId);

    if (this.options.bundle) {
      args.push("--bundle", this.options.bundle);
    }
    if (this.options.provider) {
      args.push("--provider", this.options.provider);
    }
    if (this.options.model) {
      args.push("--model", this.options.model);
    }

    args.push(text);

    const result = await runAmplifier(args, {
      binaryPath: this.options.binaryPath,
      timeoutMs: opts?.timeoutMs,
    });

    return { ...result, sessionId: this.sessionId };
  }

  /**
   * Close the session. No-op for file-based sessions —
   * amplifier manages its own session files.
   */
  close(): void {
    // No-op. Amplifier sessions are file-based.
  }
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/session.test.ts
```

Expected: all 9 tests PASS.

**Step 5: Commit**

```bash
git add src/session.ts src/__tests__/session.test.ts && git commit -m "feat: add Session class with tests"
```

---

### Task 8: `src/client.ts` + tests

**Why:** `AmplifierClient` is the advanced API — create sessions, run recipes, install bundles. It composes everything built so far.

**Files:**
- Create: `src/client.ts`
- Create: `src/__tests__/client.test.ts`

**Step 1: Write the failing tests**

Create file `src/__tests__/client.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AmplifierClient } from "../client";
import type { ResultMessage } from "../types";

vi.mock("../runner", () => ({
  runAmplifier: vi.fn(),
}));

import { runAmplifier } from "../runner";
const mockRunAmplifier = vi.mocked(runAmplifier);

const FAKE_RESULT: ResultMessage = {
  type: "result",
  status: "success",
  response: "Client response",
  sessionId: "new-session-id",
  bundle: "foundation",
  model: "anthropic/claude-sonnet-4-5",
  timestamp: "2025-11-10T12:34:56.789Z",
};

describe("AmplifierClient.createSession", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("calls runAmplifier with run --output-format json and the prompt", async () => {
    const client = new AmplifierClient();
    await client.createSession("hello world");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args[0]).toBe("run");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args[args.length - 1]).toBe("hello world");
  });

  it("returns a Session with the sessionId from the result", async () => {
    const client = new AmplifierClient();
    const session = await client.createSession("hello");
    expect(session.sessionId).toBe("new-session-id");
  });

  it("forwards client-level options to the args", async () => {
    const client = new AmplifierClient({
      bundle: "foundation",
      provider: "anthropic",
      model: "claude-sonnet-4-5",
    });
    await client.createSession("hello");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--bundle");
    expect(args).toContain("--provider");
    expect(args).toContain("--model");
  });

  it("forwards binaryPath to runAmplifier options", async () => {
    const client = new AmplifierClient({ binaryPath: "/custom/bin" });
    await client.createSession("hello");

    expect(mockRunAmplifier).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ binaryPath: "/custom/bin" })
    );
  });

  it("merges per-call QueryOptions", async () => {
    const client = new AmplifierClient({ bundle: "foundation" });
    await client.createSession("hello", { timeoutMs: 5000, model: "gpt-4" });

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--model");
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-4");
    expect(mockRunAmplifier).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });
});

describe("AmplifierClient.runRecipe", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("calls runAmplifier with recipe run --output-format json <path>", async () => {
    const client = new AmplifierClient();
    await client.runRecipe("./my-recipe.yaml");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args[0]).toBe("recipe");
    expect(args[1]).toBe("run");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("./my-recipe.yaml");
  });

  it("appends context as --context key=value pairs", async () => {
    const client = new AmplifierClient();
    await client.runRecipe("./recipe.yaml", { file: "src/auth.ts", severity: "high" });

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toContain("--context");
    expect(args).toContain("file=src/auth.ts");
    expect(args).toContain("severity=high");
  });

  it("returns the ResultMessage", async () => {
    const client = new AmplifierClient();
    const result = await client.runRecipe("./recipe.yaml");
    expect(result.status).toBe("success");
  });
});

describe("AmplifierClient.install", () => {
  beforeEach(() => {
    mockRunAmplifier.mockReset();
    mockRunAmplifier.mockResolvedValue(FAKE_RESULT);
  });

  it("calls runAmplifier with bundle add <url>", async () => {
    const client = new AmplifierClient();
    await client.install("git+https://github.com/org/bundle@main");

    const args = mockRunAmplifier.mock.calls[0][0];
    expect(args).toEqual([
      "bundle",
      "add",
      "git+https://github.com/org/bundle@main",
    ]);
  });
});
```

**Step 2: Run tests — verify they fail**

Run:
```bash
npx vitest run src/__tests__/client.test.ts 2>&1 | tail -5
```

Expected: FAIL — `Cannot find module '../client'`

**Step 3: Write the implementation**

Create file `src/client.ts` with this exact content:

```typescript
/**
 * AmplifierClient — advanced API surface for Amplifier.
 *
 * Provides session management, recipe execution, and bundle installation.
 * Each method delegates to `runAmplifier()`.
 */

import { runAmplifier } from "./runner";
import { Session } from "./session";
import type {
  AmplifierClientOptions,
  QueryOptions,
  ResultMessage,
} from "./types";

export class AmplifierClient {
  private readonly options: AmplifierClientOptions;

  constructor(options: AmplifierClientOptions = {}) {
    this.options = options;
  }

  /**
   * Start a new session with an initial prompt.
   * Returns a `Session` object for multi-turn follow-ups.
   */
  async createSession(
    prompt: string,
    opts?: QueryOptions
  ): Promise<Session> {
    const args: string[] = ["run", "--output-format", "json"];

    const bundle = opts?.bundle ?? this.options.bundle;
    const provider = opts?.provider ?? this.options.provider;
    const model = opts?.model ?? this.options.model;

    if (bundle) args.push("--bundle", bundle);
    if (provider) args.push("--provider", provider);
    if (model) args.push("--model", model);
    if (opts?.maxTokens != null) {
      args.push("--max-tokens", String(opts.maxTokens));
    }

    args.push(prompt);

    const result = await runAmplifier(args, {
      binaryPath: opts?.binaryPath ?? this.options.binaryPath,
      timeoutMs: opts?.timeoutMs,
    });

    return new Session(result.sessionId, this.options);
  }

  /**
   * Execute a recipe file.
   *
   * @param recipePath — path to the recipe YAML file
   * @param context — key/value context variables passed via `--context key=value`
   */
  async runRecipe(
    recipePath: string,
    context?: Record<string, unknown>
  ): Promise<ResultMessage> {
    const args: string[] = [
      "recipe",
      "run",
      "--output-format",
      "json",
      recipePath,
    ];

    if (context) {
      for (const [key, value] of Object.entries(context)) {
        args.push("--context", `${key}=${value}`);
      }
    }

    return runAmplifier(args, {
      binaryPath: this.options.binaryPath,
    });
  }

  /**
   * Install a bundle from a URL.
   *
   * Wraps `amplifier bundle add <url>`.
   */
  async install(bundleUrl: string): Promise<void> {
    await runAmplifier(["bundle", "add", bundleUrl], {
      binaryPath: this.options.binaryPath,
    });
  }
}
```

**Step 4: Run tests — verify they pass**

Run:
```bash
npx vitest run src/__tests__/client.test.ts
```

Expected: all 8 tests PASS.

**Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts && git commit -m "feat: add AmplifierClient with tests"
```

---

## Phase 5 — Wire Up (depends on all above)

### Task 9: `src/index.ts` — public exports + build verification

**Why:** This is the front door. Everything the user can import from `"amplifier"` is re-exported here. We also verify the entire project builds and all tests pass end-to-end.

**Files:**
- Modify: `src/index.ts` (replace placeholder)
- Create: `src/__tests__/index.test.ts`

**Step 1: Write the export smoke-test**

Create file `src/__tests__/index.test.ts` with this exact content:

```typescript
/**
 * Import-only smoke test for public exports.
 * Catches accidental removal of re-exports from index.ts.
 */
import { describe, it, expect } from "vitest";
import {
  query,
  AmplifierClient,
  Session,
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from "../index";

describe("index.ts — named exports exist", () => {
  it("exports query as a function", () => {
    expect(typeof query).toBe("function");
  });

  it("exports AmplifierClient as a constructor", () => {
    expect(typeof AmplifierClient).toBe("function");
  });

  it("exports Session as a constructor", () => {
    expect(typeof Session).toBe("function");
  });

  it("exports AmplifierBinaryNotFoundError as a constructor", () => {
    expect(typeof AmplifierBinaryNotFoundError).toBe("function");
  });

  it("exports AmplifierProcessError as a constructor", () => {
    expect(typeof AmplifierProcessError).toBe("function");
  });

  it("exports AmplifierSessionError as a constructor", () => {
    expect(typeof AmplifierSessionError).toBe("function");
  });
});
```

**Step 2: Replace `src/index.ts` with real exports**

Replace the entire content of `src/index.ts` with:

```typescript
/**
 * Amplifier Node.js SDK — official TypeScript client.
 *
 * @example Simple one-shot query:
 * ```typescript
 * import { query } from "amplifier";
 *
 * for await (const msg of query("summarize this file")) {
 *   console.log(msg.response);
 * }
 * ```
 *
 * @example Multi-turn session:
 * ```typescript
 * import { AmplifierClient } from "amplifier";
 *
 * const client = new AmplifierClient({ bundle: "foundation" });
 * const session = await client.createSession("hello");
 * const r = await session.prompt("follow up");
 * ```
 *
 * @packageDocumentation
 */

export { query } from "./query";
export { AmplifierClient } from "./client";
export { Session } from "./session";
export type {
  ResultMessage,
  QueryOptions,
  AmplifierClientOptions,
  SessionResult,
} from "./types";
export {
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from "./errors";
```

**Step 3: Run all tests**

Run:
```bash
npx vitest run
```

Expected: ALL tests pass (errors: 12, binary: 6, runner: 7, query: 8, session: 9, client: 8, index: 6 = 56 total).

**Step 4: Run typecheck**

Run:
```bash
npx tsc --noEmit
```

Expected: exits 0, no errors.

**Step 5: Build and verify dist output**

Run:
```bash
npx tsup && ls dist/
```

Expected output includes: `index.js`, `index.mjs`, `index.d.ts`, `index.d.mts` (plus sourcemaps).

**Step 6: Commit**

```bash
git add src/index.ts src/__tests__/index.test.ts && git commit -m "feat: wire up public exports and add smoke tests"
```

---

## Phase 6 — Platform Packages (independent, no TypeScript deps)

### Tasks 10–14: Create platform packages

**Why:** These are the npm packages that carry the Amplifier binary for each platform. npm's `optionalDependencies` + `os`/`cpu` fields ensure only the matching one is installed. The actual binaries are added by CI — we just create the package skeletons.

**Files (per platform):**
- Create: `packages/@amplifier/sdk-{platform}/package.json`
- Create: `packages/@amplifier/sdk-{platform}/bin/.gitkeep`

**Step 1: Create all five platform package directories and files**

Run these commands:

```bash
mkdir -p packages/@amplifier/sdk-darwin-arm64/bin
mkdir -p packages/@amplifier/sdk-darwin-x64/bin
mkdir -p packages/@amplifier/sdk-linux-x64/bin
mkdir -p packages/@amplifier/sdk-linux-arm64/bin
mkdir -p packages/@amplifier/sdk-win32-x64/bin
touch packages/@amplifier/sdk-darwin-arm64/bin/.gitkeep
touch packages/@amplifier/sdk-darwin-x64/bin/.gitkeep
touch packages/@amplifier/sdk-linux-x64/bin/.gitkeep
touch packages/@amplifier/sdk-linux-arm64/bin/.gitkeep
touch packages/@amplifier/sdk-win32-x64/bin/.gitkeep
```

**Step 2: Create `packages/@amplifier/sdk-darwin-arm64/package.json`**

```json
{
  "name": "@amplifier/sdk-darwin-arm64",
  "version": "0.1.0",
  "description": "Amplifier binary for macOS Apple Silicon",
  "os": ["darwin"],
  "cpu": ["arm64"],
  "main": "bin/amplifier",
  "files": ["bin/"],
  "license": "MIT"
}
```

**Step 3: Create `packages/@amplifier/sdk-darwin-x64/package.json`**

```json
{
  "name": "@amplifier/sdk-darwin-x64",
  "version": "0.1.0",
  "description": "Amplifier binary for macOS Intel",
  "os": ["darwin"],
  "cpu": ["x64"],
  "main": "bin/amplifier",
  "files": ["bin/"],
  "license": "MIT"
}
```

**Step 4: Create `packages/@amplifier/sdk-linux-x64/package.json`**

```json
{
  "name": "@amplifier/sdk-linux-x64",
  "version": "0.1.0",
  "description": "Amplifier binary for Linux x64",
  "os": ["linux"],
  "cpu": ["x64"],
  "main": "bin/amplifier",
  "files": ["bin/"],
  "license": "MIT"
}
```

**Step 5: Create `packages/@amplifier/sdk-linux-arm64/package.json`**

```json
{
  "name": "@amplifier/sdk-linux-arm64",
  "version": "0.1.0",
  "description": "Amplifier binary for Linux ARM64",
  "os": ["linux"],
  "cpu": ["arm64"],
  "main": "bin/amplifier",
  "files": ["bin/"],
  "license": "MIT"
}
```

**Step 6: Create `packages/@amplifier/sdk-win32-x64/package.json`**

```json
{
  "name": "@amplifier/sdk-win32-x64",
  "version": "0.1.0",
  "description": "Amplifier binary for Windows x64",
  "os": ["win32"],
  "cpu": ["x64"],
  "main": "bin/amplifier.exe",
  "files": ["bin/"],
  "license": "MIT"
}
```

**Step 7: Commit**

```bash
git add packages/ && git commit -m "feat: add platform package skeletons for binary distribution"
```

---

### Task 15: npm workspaces config

**Why:** npm workspaces lets the root project resolve the `@amplifier/sdk-*` packages locally during development. This is how `require.resolve('@amplifier/sdk-darwin-arm64/package.json')` in `binary.ts` will find the platform packages.

**Files:**
- Modify: `package.json` (add `workspaces` field)

**Step 1: Add the workspaces field to root `package.json`**

Add this field to the root `package.json`, after the `"optionalDependencies"` block:

```json
"workspaces": [
  "packages/@amplifier/*"
]
```

**Step 2: Run `npm install` to verify workspace resolution**

Run:
```bash
npm install --ignore-scripts 2>&1 | tail -10
```

Expected: installs successfully.

**Step 3: Verify symlinks exist**

Run:
```bash
ls -la node_modules/@amplifier/ 2>/dev/null || echo "no @amplifier symlinks (expected on first setup)"
```

Expected: symlinks to each `packages/@amplifier/sdk-*` directory, or a note that workspace resolution depends on matching `os`/`cpu` (which may skip non-matching platforms). Either outcome is fine — the workspace config is correct.

**Step 4: Run all tests to make sure nothing broke**

Run:
```bash
npx vitest run
```

Expected: ALL tests still pass.

**Step 5: Commit**

```bash
git add package.json package-lock.json && git commit -m "chore: add npm workspaces for platform packages"
```

---

## Summary

| Task | Module | Tests | Depends On |
|------|--------|-------|------------|
| 1 | Scaffold (package.json, tsconfig, tsup, gitignore) | build check | — |
| 2 | `src/types.ts` | typecheck | — |
| 3 | `src/errors.ts` | 12 tests | types |
| 4 | `src/binary.ts` | 6 tests | errors |
| 5 | `src/runner.ts` | 7 tests | errors, binary |
| 6 | `src/query.ts` | 8 tests | runner, types |
| 7 | `src/session.ts` | 9 tests | runner, types |
| 8 | `src/client.ts` | 8 tests | runner, session, types |
| 9 | `src/index.ts` | 6 tests | all above |
| 10–14 | Platform packages (5) | — | — |
| 15 | npm workspaces | build check | platform packages |

**Total: 56 unit tests across 7 test files.**

## V1 Scope — Explicitly Deferred

- **No streaming** — batch-only (async iterator yields one `ResultMessage`)
- **No `amplifier recipe run --output-format json` verification** — open question from design doc
- **No CI/CD pipeline** — separate task
- **No actual binaries in platform packages** — CI will add these
- **No publish scripts** — separate task

## Parallelism Guide for Execution

Tasks that can run in **parallel** (no shared state):
- Tasks 1 + 2 (scaffold + types) — but 2 needs the project to exist, so sequential is safer
- Tasks 3 + 4 (errors + binary) — both depend only on types, independent of each other
- Tasks 6 + 7 (query + session) — both depend on runner, independent of each other
- Tasks 10–14 (platform packages) — all independent, can all be done in one step

Tasks that **must** be sequential:
- 1 → 2 → {3, 4} → 5 → {6, 7} → 8 → 9 → {10–14} → 15