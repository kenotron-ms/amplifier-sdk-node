import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AmplifierClient } from '../client';
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

describe('AmplifierClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runAmplifier).mockResolvedValue(MOCK_RESULT);
  });

  // Test 1: createSession calls runAmplifier with base args and prompt
  it('createSession calls runAmplifier with correct base args and prompt', async () => {
    const client = new AmplifierClient();
    await client.createSession('hello world');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      ['run', '--output-format', 'json', 'hello world'],
      expect.anything(),
    );
  });

  // Test 2: createSession returns a Session with the correct sessionId
  it('createSession returns a Session with the correct sessionId', async () => {
    const client = new AmplifierClient();
    const session = await client.createSession('hello');

    expect(session.sessionId).toBe('sess-abc');
  });

  // Test 3: createSession forwards client-level bundle, provider, model as CLI args
  it('createSession forwards client-level options as CLI args', async () => {
    const client = new AmplifierClient({
      bundle: 'my-bundle',
      provider: 'openai',
      model: 'gpt-4o',
    });
    await client.createSession('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining(['--bundle', 'my-bundle', '--provider', 'openai', '--model', 'gpt-4o']),
      expect.anything(),
    );
  });

  // Test 4: createSession forwards binaryPath to runAmplifier options
  it('createSession forwards binaryPath to runAmplifier options', async () => {
    const client = new AmplifierClient({ binaryPath: '/usr/local/bin/amplifier' });
    await client.createSession('hello');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ binaryPath: '/usr/local/bin/amplifier' }),
    );
  });

  // Test 5: createSession per-call model overrides client-level model
  it('createSession per-call model overrides client-level model', async () => {
    const client = new AmplifierClient({ model: 'gpt-4' });
    await client.createSession('hello', { model: 'claude-3-sonnet' });

    const call = vi.mocked(runAmplifier).mock.calls[0];
    const args = call[0];

    // --model flag should be set to the per-call value, not the client-level value
    const modelIndex = args.indexOf('--model');
    expect(args[modelIndex + 1]).toBe('claude-3-sonnet');
  });

  // Test 6: runRecipe calls runAmplifier with correct base args
  it('runRecipe calls runAmplifier with recipe run args and path', async () => {
    const client = new AmplifierClient();
    await client.runRecipe('/path/to/recipe.yaml');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      ['recipe', 'run', '--output-format', 'json', '/path/to/recipe.yaml'],
      expect.anything(),
    );
  });

  // Test 7: runRecipe appends context entries as --context key=value pairs
  it('runRecipe appends context as --context key=value pairs', async () => {
    const client = new AmplifierClient();
    await client.runRecipe('/path/to/recipe.yaml', { env: 'production', version: 42 });

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      expect.arrayContaining([
        '--context', 'env=production',
        '--context', 'version=42',
      ]),
      expect.anything(),
    );
  });

  // Test 8: install calls runAmplifier with bundle add args
  it('install calls runAmplifier with bundle add <url>', async () => {
    const client = new AmplifierClient();
    await client.install('https://example.com/bundle');

    expect(vi.mocked(runAmplifier)).toHaveBeenCalledWith(
      ['bundle', 'add', 'https://example.com/bundle'],
      expect.anything(),
    );
  });
});
