import { describe, it, expect, beforeEach } from 'vitest';
import { Session } from '../session';
import { MockTransport } from './mock-transport';
import type { Message } from '../types';

describe('Session', () => {
  let transport: MockTransport;

  beforeEach(() => {
    transport = new MockTransport();
    transport.mockResponse('session.execute', {
      response: 'Hello there',
      sessionId: 'sess-1',
    });
    transport.mockResponse('session.interrupt', null);
    transport.mockResponse('session.close', null);
  });

  it('has id and handle', () => {
    const session = new Session('sess-1', 'session:1', transport);
    expect(session.id).toBe('sess-1');
  });

  it('query sends session.execute and yields result', async () => {
    const session = new Session('sess-1', 'session:1', transport);
    const messages: Message[] = [];

    for await (const msg of session.query('Hello')) {
      messages.push(msg);
    }

    expect(messages.length).toBeGreaterThanOrEqual(1);
    const result = messages.find((m) => m.type === 'result');
    expect(result).toBeDefined();
    expect(result!.type).toBe('result');
    if (result!.type === 'result') {
      expect(result!.response).toBe('Hello there');
    }

    const req = transport.requests.find((r) => r.method === 'session.execute');
    expect(req?.params).toEqual({ handle: 'session:1', prompt: 'Hello' });
  });

  it('query yields streaming events before result', async () => {
    // Emit notifications before the execute resolves
    const session = new Session('sess-1', 'session:1', transport);

    // Override transport to emit events during execute
    const originalRequest = transport.request.bind(transport);
    transport.request = async (method, params) => {
      if (method === 'session.execute') {
        // Simulate streaming events
        setTimeout(() => {
          transport.emitNotification('session.event', {
            sessionId: 'sess-1',
            type: 'text',
            content: 'Hi',
          });
          transport.emitNotification('session.event', {
            sessionId: 'sess-1',
            type: 'tool_use',
            id: 't1',
            name: 'bash',
            input: { command: 'echo hello' },
          });
        }, 10);

        // Return final result after events
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({ response: 'Done', sessionId: 'sess-1' });
          }, 50);
        });
      }
      return originalRequest(method, params);
    };

    const messages: Message[] = [];
    for await (const msg of session.query('Do something')) {
      messages.push(msg);
    }

    const textMsgs = messages.filter((m) => m.type === 'text');
    const toolMsgs = messages.filter((m) => m.type === 'tool_use');
    expect(textMsgs.length).toBeGreaterThanOrEqual(1);
    expect(toolMsgs.length).toBeGreaterThanOrEqual(1);
  });

  it('close sends session.close request', async () => {
    const session = new Session('sess-1', 'session:1', transport);
    await session.close();

    const req = transport.requests.find((r) => r.method === 'session.close');
    expect(req?.params).toEqual({ handle: 'session:1' });
  });

  it('interrupt sends session.interrupt request', async () => {
    const session = new Session('sess-1', 'session:1', transport);
    await session.interrupt();

    const req = transport.requests.find((r) => r.method === 'session.interrupt');
    expect(req?.params).toEqual({ handle: 'session:1' });
  });

  it('ignores notifications for other sessions', async () => {
    const session = new Session('sess-1', 'session:1', transport);

    const originalRequest = transport.request.bind(transport);
    transport.request = async (method, params) => {
      if (method === 'session.execute') {
        setTimeout(() => {
          // Event for a different session — should be ignored
          transport.emitNotification('session.event', {
            sessionId: 'sess-OTHER',
            type: 'text',
            content: 'wrong session',
          });
          transport.emitNotification('session.event', {
            sessionId: 'sess-1',
            type: 'text',
            content: 'right session',
          });
        }, 10);
        return new Promise((resolve) => {
          setTimeout(() => resolve({ response: 'ok', sessionId: 'sess-1' }), 50);
        });
      }
      return originalRequest(method, params);
    };

    const messages: Message[] = [];
    for await (const msg of session.query('test')) {
      messages.push(msg);
    }

    const textMsgs = messages.filter((m) => m.type === 'text');
    expect(textMsgs.every((m) => m.type === 'text' && m.content !== 'wrong session')).toBe(true);
  });
});
