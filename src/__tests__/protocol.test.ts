import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateId,
  _resetIdCounter,
  serializeRequest,
  serializeNotification,
  serializeResponse,
  parseMessage,
  isResponse,
  isRequest,
  isNotification,
  extractError,
} from '../protocol';

describe('protocol', () => {
  beforeEach(() => {
    _resetIdCounter();
  });

  describe('generateId', () => {
    it('returns incrementing numbers', () => {
      expect(generateId()).toBe(1);
      expect(generateId()).toBe(2);
      expect(generateId()).toBe(3);
    });
  });

  describe('serializeRequest', () => {
    it('produces valid JSON-RPC request', () => {
      const json = serializeRequest('bundle.load', { source: 'test' });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({
        jsonrpc: '2.0',
        id: 1,
        method: 'bundle.load',
        params: { source: 'test' },
      });
    });
  });

  describe('serializeNotification', () => {
    it('produces JSON-RPC notification without id', () => {
      const json = serializeNotification('session.event', { type: 'text' });
      const parsed = JSON.parse(json);
      expect(parsed.id).toBeUndefined();
      expect(parsed.method).toBe('session.event');
    });
  });

  describe('serializeResponse', () => {
    it('produces JSON-RPC response with id and result', () => {
      const json = serializeResponse(42, { approved: true });
      const parsed = JSON.parse(json);
      expect(parsed).toEqual({ jsonrpc: '2.0', id: 42, result: { approved: true } });
    });
  });

  describe('parseMessage', () => {
    it('parses valid JSON-RPC message', () => {
      const msg = parseMessage('{"jsonrpc":"2.0","id":1,"method":"test"}');
      expect(msg).toEqual({ jsonrpc: '2.0', id: 1, method: 'test' });
    });

    it('throws on missing jsonrpc field', () => {
      expect(() => parseMessage('{"id":1,"method":"test"}')).toThrow('Invalid JSON-RPC');
    });

    it('throws on invalid JSON', () => {
      expect(() => parseMessage('not json')).toThrow();
    });
  });

  describe('message type guards', () => {
    it('isResponse identifies responses', () => {
      expect(isResponse({ jsonrpc: '2.0', id: 1, result: null } as any)).toBe(true);
      expect(isResponse({ jsonrpc: '2.0', id: 1, method: 'test' } as any)).toBe(false);
    });

    it('isRequest identifies requests', () => {
      expect(isRequest({ jsonrpc: '2.0', id: 1, method: 'test' } as any)).toBe(true);
      expect(isRequest({ jsonrpc: '2.0', method: 'test' } as any)).toBe(false);
    });

    it('isNotification identifies notifications', () => {
      expect(isNotification({ jsonrpc: '2.0', method: 'test' } as any)).toBe(true);
      expect(isNotification({ jsonrpc: '2.0', id: 1, method: 'test' } as any)).toBe(false);
    });
  });

  describe('extractError', () => {
    it('returns null when no error', () => {
      expect(extractError({ jsonrpc: '2.0', id: 1, result: 'ok' })).toBeNull();
    });

    it('returns BridgeError when error present', () => {
      const err = extractError({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32000, message: 'Something failed' },
      });
      expect(err).not.toBeNull();
      expect(err!.message).toBe('Something failed');
      expect(err!.code).toBe('-32000');
    });
  });
});
