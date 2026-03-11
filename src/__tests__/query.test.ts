import { describe, it, expect, vi, beforeEach } from 'vitest';
import { query } from '../query';
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

describe('query', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAmplifier).mockResolvedValue(MOCK_RESULT);
  });

  // Test 1: minimal args – only the base args + prompt
  it('builds minimal args: run --output-format json <prompt>', async () => {
    const gen = query('hello world');
    await gen.next(); // consume the single result

    const [args] = vi.mocked(runAmplifier).mock.calls[0];
    expect(args).toEqual(['run', '--output-format', 'json', 'hello world']);
  });

  // Test 2: adds --resume when sessionId is provided
  it('adds --resume <sessionId> when sessionId option is provided', async () => {
    const gen = query('hello', { sessionId: 'sess-123' });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--resume', 'sess-123']),
      expect.anything(),
    );
  });

  // Test 3: adds --bundle when bundle is provided
  it('adds --bundle <bundle> when bundle option is provided', async () => {
    const gen = query('hello', { bundle: 'my-bundle' });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--bundle', 'my-bundle']),
      expect.anything(),
    );
  });

  // Test 4: adds --provider when provider is provided
  it('adds --provider <provider> when provider option is provided', async () => {
    const gen = query('hello', { provider: 'openai' });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--provider', 'openai']),
      expect.anything(),
    );
  });

  // Test 5: adds --model when model is provided
  it('adds --model <model> when model option is provided', async () => {
    const gen = query('hello', { model: 'gpt-4o' });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--model', 'gpt-4o']),
      expect.anything(),
    );
  });

  // Test 6: adds --max-tokens as string when maxTokens is provided
  it('adds --max-tokens as string when maxTokens option is provided', async () => {
    const gen = query('hello', { maxTokens: 2048 });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--max-tokens', '2048']),
      expect.anything(),
    );
  });

  // Test 7: passes binaryPath and timeoutMs to runAmplifier options
  it('passes binaryPath and timeoutMs to runAmplifier options', async () => {
    const gen = query('hello', { binaryPath: '/usr/bin/amplifier', timeoutMs: 30000 });
    await gen.next();

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.anything(),
      { binaryPath: '/usr/bin/amplifier', timeoutMs: 30000 },
    );
  });

  // Test 8: combined — full args array with all options, prompt always last
  it('builds exact full args array with prompt last when all options are provided', async () => {
    const gen = query('my-prompt', {
      sessionId: 'sess-123',
      bundle: 'my-bundle',
      provider: 'openai',
      model: 'gpt-4o',
      maxTokens: 2048,
    });
    await gen.next();

    const [args] = vi.mocked(runAmplifier).mock.calls[0];
    expect(args).toEqual([
      'run', '--output-format', 'json',
      '--resume', 'sess-123',
      '--bundle', 'my-bundle',
      '--provider', 'openai',
      '--model', 'gpt-4o',
      '--max-tokens', '2048',
      'my-prompt',
    ]);
  });

  // Test 9: async iterator yields exactly one ResultMessage
  it('yields exactly one ResultMessage', async () => {
    const results: ResultMessage[] = [];
    for await (const result of query('hello')) {
      results.push(result);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(MOCK_RESULT);
  });
});
