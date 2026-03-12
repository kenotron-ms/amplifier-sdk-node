import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { BridgeCrashedError, BridgeTimeoutError, PythonNotFoundError } from './errors';
import {
  type JsonRpcMessage,
  type JsonRpcResponse,
  extractError,
  isNotification,
  isRequest,
  isResponse,
  parseMessage,
  serializeNotification,
  serializeResponse,
} from './protocol';
import { generateId } from './protocol';
import type { Transport } from './types';

const BRIDGE_SCRIPT = resolve(__dirname, '..', 'scripts', 'bridge.py');
const DEFAULT_PYTHON = 'python3';
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export class PythonBridgeTransport implements Transport {
  private process: ChildProcess | null = null;
  private buffer = '';
  private stderrBuffer = '';
  private readonly pendingRequests = new Map<number | string, PendingRequest>();
  private notificationHandlers: ((method: string, params: Record<string, unknown>) => void)[] = [];
  private requestHandlers: ((method: string, params: Record<string, unknown>) => Promise<unknown>)[] = [];
  private _isRunning = false;
  private readonly pythonPath: string;
  private readonly cwd?: string;
  private readonly requestTimeoutMs: number;

  constructor(options?: { pythonPath?: string; cwd?: string; requestTimeoutMs?: number }) {
    this.pythonPath = options?.pythonPath ?? DEFAULT_PYTHON;
    this.cwd = options?.cwd;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;

    try {
      this.process = spawn(this.pythonPath, ['-u', BRIDGE_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.cwd,
        env: { ...process.env },
      });
    } catch {
      throw new PythonNotFoundError(
        `Failed to spawn Python at '${this.pythonPath}'. Ensure Python 3.11+ is installed.`,
      );
    }

    this.process.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });

    this.process.stderr!.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
    });

    this.process.on('exit', (code, signal) => {
      this._isRunning = false;
      // Reject all pending requests
      const error = new BridgeCrashedError(
        `Python bridge exited unexpectedly (code=${code}, signal=${signal})`,
        this.stderrBuffer,
      );
      for (const [id, pending] of this.pendingRequests) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(error);
        this.pendingRequests.delete(id);
      }
    });

    // Cleanup on host process exit
    const cleanup = () => {
      if (this.process && !this.process.killed) {
        this.process.kill();
      }
    };
    process.on('exit', cleanup);
    this.process.on('exit', () => {
      process.removeListener('exit', cleanup);
    });

    this._isRunning = true;

    // Wait for bridge ready signal
    await this.request('bridge.ping');
  }

  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.ensureRunning();

    const id = generateId();
    const msg = { jsonrpc: '2.0' as const, id, method, params };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new BridgeTimeoutError(`Request '${method}' timed out`, this.requestTimeoutMs));
      }, this.requestTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.send(JSON.stringify(msg));
    });
  }

  notify(method: string, params?: Record<string, unknown>): void {
    this.ensureRunning();
    this.send(serializeNotification(method, params));
  }

  onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void {
    this.notificationHandlers.push(handler);
    return () => {
      const idx = this.notificationHandlers.indexOf(handler);
      if (idx !== -1) this.notificationHandlers.splice(idx, 1);
    };
  }

  onRequest(handler: (method: string, params: Record<string, unknown>) => Promise<unknown>): () => void {
    this.requestHandlers.push(handler);
    return () => {
      const idx = this.requestHandlers.indexOf(handler);
      if (idx !== -1) this.requestHandlers.splice(idx, 1);
    };
  }

  async close(): Promise<void> {
    if (!this.process) return;

    if (this._isRunning) {
      try {
        await Promise.race([
          this.request('bridge.close'),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('close timeout')), 5000),
          ),
        ]);
      } catch {
        // Force kill on timeout or if bridge crashed
      }
    }

    if (this.process && !this.process.killed) {
      this.process.kill();
    }

    this._isRunning = false;
    this.process = null;
  }

  private ensureRunning(): void {
    if (!this._isRunning) {
      throw new BridgeCrashedError(
        'Python bridge is not running. Call start() first or the bridge has crashed.',
        this.stderrBuffer,
      );
    }
  }

  private send(data: string): void {
    if (!this.process?.stdin?.writable) {
      throw new BridgeCrashedError('Cannot write to bridge stdin', this.stderrBuffer);
    }
    this.process.stdin.write(data + '\n');
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let msg: JsonRpcMessage;
      try {
        msg = parseMessage(trimmed);
      } catch {
        // Skip non-JSON lines (debug output)
        continue;
      }

      if (isResponse(msg)) {
        this.handleResponse(msg);
      } else if (isNotification(msg)) {
        for (const handler of this.notificationHandlers) {
          handler(msg.method, (msg.params ?? {}) as Record<string, unknown>);
        }
      } else if (isRequest(msg)) {
        this.handleReverseRequest(msg);
      }
    }
  }

  private handleResponse(msg: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;

    this.pendingRequests.delete(msg.id);
    if (pending.timer) clearTimeout(pending.timer);

    const error = extractError(msg);
    if (error) {
      pending.reject(error);
    } else {
      pending.resolve(msg.result);
    }
  }

  private async handleReverseRequest(msg: { id: number | string; method: string; params?: Record<string, unknown> }): Promise<void> {
    if (this.requestHandlers.length === 0) {
      // No handler registered, send empty result
      this.send(serializeResponse(msg.id, null));
      return;
    }

    try {
      let result: unknown = null;
      for (const handler of this.requestHandlers) {
        const r = await handler(msg.method, (msg.params ?? {}) as Record<string, unknown>);
        if (r !== null && r !== undefined) {
          result = r;
          break;
        }
      }
      this.send(serializeResponse(msg.id, result));
    } catch (err) {
      const errorMsg = {
        jsonrpc: '2.0' as const,
        id: msg.id,
        error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
      };
      this.send(JSON.stringify(errorMsg));
    }
  }
}
