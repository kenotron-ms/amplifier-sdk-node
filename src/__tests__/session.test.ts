import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Session } from '../session';
import type { ResultMessage } from '../types';

vi.mock('../runner', () => ({
  runAmplifier: vi.fn(),
}));

import { runAmplifier } from '../runner';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_RESULT: ResultMessage = {
  type: 'result',
  status: 'success',
  response: 'Hello from Amplifier',
  sessionId: 'sess-abc',
  bundle: 'default',
  model: 'gpt-4',
  timestamp: '2024-01-01T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAmplifier).mockResolvedValue(MOCK_RESULT);
  });

  // Test 1: stores sessionId
  it('stores sessionId as a readable property', () => {
    const session = new Session('sess-123', {});
    expect(session.sessionId).toBe('sess-123');
  });

  // Test 2: passes --resume with sessionId on every prompt
  it('passes --resume <sessionId> on every prompt call', async () => {
    const session = new Session('sess-123', {});
    await session.prompt('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--resume', 'sess-123']),
      expect.anything(),
    );
  });

  // Test 3: forwards client-level bundle option
  it('forwards client-level bundle option as --bundle', async () => {
    const session = new Session('sess-123', { bundle: 'my-bundle' });
    await session.prompt('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--bundle', 'my-bundle']),
      expect.anything(),
    );
  });

  // Test 4: forwards provider
  it('forwards client-level provider option as --provider', async () => {
    const session = new Session('sess-123', { provider: 'openai' });
    await session.prompt('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--provider', 'openai']),
      expect.anything(),
    );
  });

  // Test 5: forwards model
  it('forwards client-level model option as --model', async () => {
    const session = new Session('sess-123', { model: 'gpt-4o' });
    await session.prompt('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--model', 'gpt-4o']),
      expect.anything(),
    );
  });

  // Test 6: forwards binaryPath
  it('forwards client-level binaryPath to runAmplifier options', async () => {
    const session = new Session('sess-123', { binaryPath: '/usr/bin/amplifier' });
    await session.prompt('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ binaryPath: '/usr/bin/amplifier' }),
    );
  });

  // Test 7: forwards per-call timeoutMs
  it('forwards per-call timeoutMs to runAmplifier options', async () => {
    const session = new Session('sess-123', {});
    await session.prompt('hello', { timeoutMs: 30000 });

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ timeoutMs: 30000 }),
    );
  });

  // Test 8: returns SessionResult with sessionId
  it('returns a SessionResult that includes the sessionId', async () => {
    const session = new Session('sess-123', {});
    const result = await session.prompt('hello');

    expect(result).toMatchObject({ ...MOCK_RESULT, sessionId: 'sess-123' });
  });

  // Test 9: close() does not throw
  it('close() does not throw', () => {
    const session = new Session('sess-123', {});
    expect(() => session.close()).not.toThrow();
  });
});
