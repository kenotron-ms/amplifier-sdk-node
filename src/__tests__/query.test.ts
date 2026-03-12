import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Message } from '../types';

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockSessionClose = vi.fn().mockResolvedValue(undefined);
const mockSessionQuery = vi.fn();

vi.mock('../client', () => {
  return {
    AmplifierClient: class MockAmplifierClient {
      options: Record<string, unknown>;
      constructor(options?: Record<string, unknown>) {
        this.options = options ?? {};
      }
      async createSession() {
        return {
          id: 'sess-1',
          query: mockSessionQuery,
          close: mockSessionClose,
        };
      }
      close = mockClose;
    },
  };
});

import { AmplifierClient } from '../client';
import { query } from '../query';

describe('query', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSessionQuery.mockImplementation(async function* () {
      yield { type: 'text', content: 'Hello' } as Message;
      yield { type: 'result', response: 'Hello', sessionId: 'sess-1' } as Message;
    });
  });

  it('yields messages from session.query', async () => {
    const messages: Message[] = [];
    for await (const msg of query('test prompt')) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].type).toBe('text');
    expect(messages[1].type).toBe('result');
  });

  it('creates client with options and calls session.query', async () => {
    for await (const _ of query('test', { bundle: 'foundation', provider: 'anthropic' })) {
      // consume
    }

    // Verify that session.query was called with the prompt
    expect(mockSessionQuery).toHaveBeenCalledWith('test');
  });

  it('cleans up session and client after iteration', async () => {
    for await (const _ of query('test')) {
      // consume
    }

    expect(mockSessionClose).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('cleans up on error', async () => {
    mockSessionQuery.mockImplementation(async function* () {
      throw new Error('test error');
    });

    await expect(async () => {
      for await (const _ of query('test')) {
        // consume
      }
    }).rejects.toThrow('test error');

    expect(mockClose).toHaveBeenCalled();
  });
});
