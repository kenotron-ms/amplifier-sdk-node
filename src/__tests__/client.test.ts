import { describe, it, expect, beforeEach } from 'vitest';
import { AmplifierClient } from '../client';
import { MockTransport } from './mock-transport';

describe('AmplifierClient', () => {
  let transport: MockTransport;

  beforeEach(() => {
    transport = new MockTransport();
    // Default mock responses
    transport.mockResponse('bridge.ping', { status: 'ok' });
    transport.mockResponse('session.create', { handle: 'session:1', sessionId: 'uuid-1' });
    transport.mockResponse('session.close', null);
    transport.mockResponse('bridge.close', null);
  });

  it('lazy-starts transport on first API call', async () => {
    const client = new AmplifierClient({ transport });
    expect(transport.isRunning).toBe(false);

    transport.mockResponse('bundle.load', { handle: 'bundle:1', name: 'test' });
    await client.loadBundle('test-source');

    expect(transport.isRunning).toBe(true);
  });

  it('loadBundle sends bundle.load request', async () => {
    const client = new AmplifierClient({ transport });
    transport.mockResponse('bundle.load', { handle: 'bundle:1', name: 'my-bundle' });

    const handle = await client.loadBundle('git+https://example.com/bundle');
    expect(handle._handle).toBe('bundle:1');
    expect(handle.name).toBe('my-bundle');

    const req = transport.requests.find((r) => r.method === 'bundle.load');
    expect(req?.params).toEqual({ source: 'git+https://example.com/bundle' });
  });

  it('prepareBundle sends bundle.prepare request', async () => {
    const client = new AmplifierClient({ transport });
    transport.mockResponse('bundle.load', { handle: 'bundle:1' });
    transport.mockResponse('bundle.prepare', { handle: 'prepared:1' });

    const bundle = await client.loadBundle('test');
    const prepared = await client.prepareBundle(bundle);

    expect(prepared._handle).toBe('prepared:1');
    const req = transport.requests.find((r) => r.method === 'bundle.prepare');
    expect(req?.params).toEqual({ handle: 'bundle:1' });
  });

  it('composeBundle sends bundle.compose with base and overlays', async () => {
    const client = new AmplifierClient({ transport });
    transport.mockResponse('bundle.load', { handle: 'bundle:1' });
    transport.mockResponseQueue('bundle.load', [
      { handle: 'bundle:1' },
      { handle: 'bundle:2' },
    ]);
    transport.mockResponse('bundle.compose', { handle: 'bundle:3', name: 'composed' });

    const base = await client.loadBundle('base');
    const overlay = await client.loadBundle('overlay');
    const composed = await client.composeBundle(base, overlay);

    expect(composed._handle).toBe('bundle:3');
    const req = transport.requests.find((r) => r.method === 'bundle.compose');
    expect(req?.params).toEqual({ base: 'bundle:1', overlays: ['bundle:2'] });
  });

  it('createSession with no args sends session.create', async () => {
    const client = new AmplifierClient({ transport });
    const session = await client.createSession();

    expect(session.id).toBe('uuid-1');
    const req = transport.requests.find((r) => r.method === 'session.create');
    expect(req).toBeDefined();
  });

  it('createSession with PreparedBundleHandle passes handle', async () => {
    const client = new AmplifierClient({ transport });
    transport.mockResponse('bundle.load', { handle: 'bundle:1' });
    transport.mockResponse('bundle.prepare', { handle: 'prepared:1' });

    const bundle = await client.loadBundle('test');
    const prepared = await client.prepareBundle(bundle);
    await client.createSession(prepared);

    const req = transport.requests.find((r) => r.method === 'session.create');
    expect(req?.params?.['handle']).toBe('prepared:1');
  });

  it('createSession auto-loads client-level bundle', async () => {
    transport.mockResponse('bundle.load', { handle: 'bundle:1', name: 'foundation' });
    transport.mockResponse('bundle.prepare', { handle: 'prepared:1' });

    const client = new AmplifierClient({ bundle: 'foundation', transport });
    await client.createSession();

    const loadReq = transport.requests.find((r) => r.method === 'bundle.load');
    expect(loadReq?.params?.['source']).toBe('foundation');
    const createReq = transport.requests.find((r) => r.method === 'session.create');
    expect(createReq?.params?.['handle']).toBe('prepared:1');
  });

  it('createSession forwards provider and model from client options', async () => {
    const client = new AmplifierClient({
      provider: 'anthropic',
      model: 'claude-3',
      transport,
    });
    await client.createSession();

    const req = transport.requests.find((r) => r.method === 'session.create');
    expect(req?.params?.['provider']).toBe('anthropic');
    expect(req?.params?.['model']).toBe('claude-3');
  });

  it('close shuts down transport', async () => {
    const client = new AmplifierClient({ transport });
    await client.createSession(); // starts transport
    expect(transport.isRunning).toBe(true);

    await client.close();
    expect(transport.isRunning).toBe(false);
  });

  it('close is safe to call when not started', async () => {
    const client = new AmplifierClient({ transport });
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('registers hook handlers for reverse calls', async () => {
    let hookCalled = false;
    const client = new AmplifierClient({
      transport,
      hooks: {
        preToolUse: [
          {
            handler: async (input) => {
              hookCalled = true;
              return { action: 'allow' };
            },
          },
        ],
      },
    });

    await client.createSession(); // triggers start, which registers handlers

    const result = await transport.emitReverseRequest('hook.preToolUse', {
      toolName: 'bash',
      toolInput: { command: 'ls' },
    });

    expect(hookCalled).toBe(true);
    expect(result).toEqual({ action: 'allow' });
  });

  it('registers approval handler for reverse calls', async () => {
    const client = new AmplifierClient({
      transport,
      onApproval: async (req) => req.toolName === 'safe_tool',
    });

    await client.createSession();

    const result = await transport.emitReverseRequest('approval.request', {
      toolName: 'safe_tool',
      toolInput: {},
    });
    expect(result).toEqual({ approved: true });

    const result2 = await transport.emitReverseRequest('approval.request', {
      toolName: 'dangerous_tool',
      toolInput: {},
    });
    expect(result2).toEqual({ approved: false });
  });
});
