import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { runAmplifier, _resetVersionChecked } from '../runner';
import { AmplifierProcessError, AmplifierSessionError } from '../errors';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../binary', () => ({
  discoverBinary: vi.fn().mockReturnValue('/fake/amplifier'),
  checkBinaryVersion: vi.fn(),
}));

// ─── Helper ──────────────────────────────────────────────────────────────────

interface FakeProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
}

/** Create a fake ChildProcess with controllable stdout/stderr/close lifecycle. */
function createFakeProcess(): FakeProcess {
  const proc = new EventEmitter() as FakeProcess;
  proc.stdout = new Readable({ read() {} });
  proc.stderr = new Readable({ read() {} });
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.killed = true;
    proc.emit('close', null, 'SIGTERM');
  });
  return proc;
}

/**
 * Push data onto the fake process streams and schedule 'close' after a
 * setImmediate tick so that all stream 'data' nextTick callbacks fire first.
 */
function scheduleClose(
  proc: FakeProcess,
  opts: { stdout?: string; stderr?: string; exitCode?: number },
): void {
  const { stdout, stderr, exitCode = 0 } = opts;
  if (stdout !== undefined) {
    proc.stdout.push(stdout);
    proc.stdout.push(null); // EOF
  } else {
    proc.stdout.push(null);
  }
  if (stderr !== undefined) {
    proc.stderr.push(stderr);
    proc.stderr.push(null);
  } else {
    proc.stderr.push(null);
  }
  // Defer close so that the Readable 'data' nextTick callbacks fire first
  setImmediate(() => proc.emit('close', exitCode, null));
}

const BINARY_PATH = '/fake/amplifier';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runAmplifier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetVersionChecked();
    process.env['AMPLIFIER_SKIP_VERSION_CHECK'] = '1';
  });

  afterEach(() => {
    delete process.env['AMPLIFIER_SKIP_VERSION_CHECK'];
    // Guard: restore real timers even if a test left fake ones active
    vi.useRealTimers();
  });

  // Test 1: happy path – resolves with normalized ResultMessage
  it('returns parsed ResultMessage on success', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const rawJson = JSON.stringify({
      type: 'result',
      status: 'success',
      response: 'Hello world',
      session_id: 'sess-123',
      bundle: 'default',
      model: 'gpt-4',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const promise = runAmplifier(['query', '--prompt', 'hello'], { binaryPath: BINARY_PATH });

    scheduleClose(proc, { stdout: rawJson });

    const result = await promise;
    expect(result).toMatchObject({
      type: 'result',
      status: 'success',
      response: 'Hello world',
      sessionId: 'sess-123',
      bundle: 'default',
      model: 'gpt-4',
    });
  });

  // Test 2: spawn is called with the right binary + args + stdio
  it('passes correct args to spawn', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const promise = runAmplifier(['query', '--prompt', 'test'], { binaryPath: BINARY_PATH });

    scheduleClose(proc, {
      stdout: JSON.stringify({
        type: 'result',
        status: 'success',
        session_id: 's1',
        bundle: 'b',
        model: 'm',
        timestamp: 't',
      }),
    });

    await promise;

    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      BINARY_PATH,
      ['query', '--prompt', 'test'],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  // Test 3: non-zero exit → AmplifierProcessError
  it('throws AmplifierProcessError on non-zero exit', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH });
    scheduleClose(proc, { exitCode: 1 });

    await expect(promise).rejects.toBeInstanceOf(AmplifierProcessError);
  });

  // Test 4: stderr is captured and surfaced inside the ProcessError
  it('includes stderr in ProcessError', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH });
    scheduleClose(proc, { stderr: 'detailed error output', exitCode: 1 });

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AmplifierProcessError);
    expect((error as AmplifierProcessError).stderr).toBe('detailed error output');
  });

  // Test 5: JSON status === 'error' → AmplifierSessionError with errorType
  it('throws AmplifierSessionError when JSON status is error', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const rawJson = JSON.stringify({
      type: 'result',
      status: 'error',
      error: 'Session context limit reached',
      error_type: 'CONTEXT_LIMIT',
      session_id: 'sess-456',
      bundle: 'default',
      model: 'gpt-4',
      timestamp: '2024-01-01T00:00:00Z',
    });

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH });
    scheduleClose(proc, { stdout: rawJson });

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AmplifierSessionError);
    expect((error as AmplifierSessionError).message).toBe('Session context limit reached');
    expect((error as AmplifierSessionError).errorType).toBe('CONTEXT_LIMIT');
  });

  // Test 6: timeout kills the process and throws TIMEOUT ProcessError
  it('kills process and throws AmplifierProcessError with TIMEOUT code on timeout', async () => {
    vi.useFakeTimers();
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH, timeoutMs: 5000 });
    // Attach catch immediately so the rejection is always handled
    const result = promise.catch((e: unknown) => e);

    // Advance past the timeout; kill() will emit 'close' synchronously
    await vi.advanceTimersByTimeAsync(5001);

    expect(proc.kill).toHaveBeenCalled();

    const error = await result;
    expect(error).toBeInstanceOf(AmplifierProcessError);
    expect((error as AmplifierProcessError).code).toBe('TIMEOUT');
  });

  // Test 7: missing sessionId in JSON output throws AmplifierProcessError
  it('throws AmplifierProcessError when sessionId is missing from JSON output', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const rawJson = JSON.stringify({
      type: 'result',
      status: 'success',
      response: 'Hello',
      bundle: 'default',
      model: 'gpt-4',
      // deliberately omitting session_id / sessionId
    });

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH });
    scheduleClose(proc, { stdout: rawJson });

    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AmplifierProcessError);
    expect((error as AmplifierProcessError).message).toContain('Missing sessionId');
  });

  // Test 7: snake_case output fields are normalized to camelCase
  it('normalizes snake_case fields to camelCase in ResultMessage', async () => {
    const proc = createFakeProcess();
    vi.mocked(spawn).mockReturnValueOnce(proc as any);

    const rawJson = JSON.stringify({
      type: 'result',
      status: 'success',
      session_id: 'session-abc',
      bundle: 'mybundle',
      model: 'claude-3',
      timestamp: '2024-06-01T00:00:00Z',
    });

    const promise = runAmplifier(['query'], { binaryPath: BINARY_PATH });
    scheduleClose(proc, { stdout: rawJson });

    const result = await promise;
    expect(result.sessionId).toBe('session-abc');
    expect(result).not.toHaveProperty('session_id');
  });
});
