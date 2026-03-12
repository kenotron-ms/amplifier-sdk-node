import type { Transport } from '../types';

interface PendingRequest {
  method: string;
  params?: Record<string, unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * MockTransport for testing — no Python process needed.
 * Tests control responses via `mockResponse()` and `mockNotification()`.
 */
export class MockTransport implements Transport {
  private _isRunning = false;
  private notificationHandlers: ((method: string, params: Record<string, unknown>) => void)[] = [];
  private reverseRequestHandler: ((method: string, params: Record<string, unknown>) => Promise<unknown>) | null = null;
  private responseMap = new Map<string, unknown>();
  private responseQueue = new Map<string, unknown[]>();
  readonly requests: { method: string; params?: Record<string, unknown> }[] = [];

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    this._isRunning = true;
  }

  /** Pre-configure the response for a given method. */
  mockResponse(method: string, result: unknown): void {
    this.responseMap.set(method, result);
  }

  /** Queue multiple responses for a method (returned in order). */
  mockResponseQueue(method: string, results: unknown[]): void {
    this.responseQueue.set(method, [...results]);
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.requests.push({ method, params });

    // Check queue first
    const queue = this.responseQueue.get(method);
    if (queue && queue.length > 0) {
      return queue.shift()!;
    }

    const result = this.responseMap.get(method);
    if (result === undefined) {
      throw new Error(`MockTransport: no response configured for '${method}'`);
    }
    return result;
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.requests.push({ method, params });
  }

  onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const idx = this.notificationHandlers.indexOf(handler);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    };
  }

  onRequest(handler: (method: string, params: Record<string, unknown>) => Promise<unknown>): () => void {
    this.reverseRequestHandler = handler;
    return () => {
      if (this.reverseRequestHandler === handler) {
        this.reverseRequestHandler = null;
      }
    };
  }

  /** Simulate receiving a notification from the bridge. */
  emitNotification(method: string, params: Record<string, unknown>): void {
    for (const handler of this.notificationHandlers) {
      handler(method, params);
    }
  }

  /** Simulate a reverse call from the bridge and return the handler's response. */
  async emitReverseRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.reverseRequestHandler) return null;
    return this.reverseRequestHandler(method, params);
  }

  async close(): Promise<void> {
    this._isRunning = false;
  }
}
