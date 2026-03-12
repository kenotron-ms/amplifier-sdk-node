import { BridgeError } from './errors';

// === JSON-RPC 2.0 Types ===

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

// === ID Generation ===

let nextId = 1;

export function generateId(): number {
  return nextId++;
}

/** Reset ID counter — for tests only. */
export function _resetIdCounter(): void {
  nextId = 1;
}

// === Serialization ===

export function serializeRequest(method: string, params?: Record<string, unknown>): string {
  const msg: JsonRpcRequest = {
    jsonrpc: '2.0',
    id: generateId(),
    method,
    params,
  };
  return JSON.stringify(msg);
}

export function serializeNotification(method: string, params?: Record<string, unknown>): string {
  const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params };
  return JSON.stringify(msg);
}

export function serializeResponse(id: number | string, result: unknown): string {
  const msg: JsonRpcResponse = { jsonrpc: '2.0', id, result };
  return JSON.stringify(msg);
}

// === Parsing ===

export function parseMessage(line: string): JsonRpcMessage {
  const parsed = JSON.parse(line) as Record<string, unknown>;

  if (parsed['jsonrpc'] !== '2.0') {
    throw new BridgeError(`Invalid JSON-RPC message: missing jsonrpc field`);
  }

  return parsed as unknown as JsonRpcMessage;
}

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && ('result' in msg || 'error' in msg) && !('method' in msg);
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'id' in msg && 'method' in msg;
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg);
}

export function extractError(response: JsonRpcResponse): BridgeError | null {
  if (!response.error) return null;
  return new BridgeError(
    response.error.message,
    String(response.error.code),
  );
}
