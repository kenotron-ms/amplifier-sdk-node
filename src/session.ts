import type { Message, Transport, Usage } from './types';
import { SessionError } from './errors';

export class Session {
  readonly id: string;
  private readonly handle: string;
  private readonly transport: Transport;
  private interrupted = false;

  /** @internal — use AmplifierClient.createSession() instead */
  constructor(id: string, handle: string, transport: Transport) {
    this.id = id;
    this.handle = handle;
    this.transport = transport;
  }

  async *query(prompt: string): AsyncGenerator<Message> {
    this.interrupted = false;

    const events: Message[] = [];
    let done = false;
    let resolveWait: (() => void) | null = null;

    const waitForMore = () =>
      new Promise<void>((resolve) => {
        resolveWait = resolve;
      });

    // Register a notification listener for this session's events
    const unsubNotification = this.transport.onNotification((method, params) => {
      if (method !== 'session.event') return;
      if ((params as Record<string, unknown>)['sessionId'] !== this.id) return;

      const msg = this.parseEvent(params as Record<string, unknown>);
      if (msg) {
        events.push(msg);
        resolveWait?.();
      }
    });

    try {
      // Send execute request — response comes when execution completes
      const resultPromise = this.transport.request('session.execute', {
        handle: this.handle,
        prompt,
      }) as Promise<Record<string, unknown>>;

      // Yield events as they arrive, until the result comes back
      resultPromise.then(
        () => {
          done = true;
          resolveWait?.();
        },
        () => {
          done = true;
          resolveWait?.();
        },
      );

      while (!done || events.length > 0) {
        if (this.interrupted) return;

        while (events.length > 0) {
          yield events.shift()!;
        }

        if (!done) {
          await waitForMore();
        }
      }

      // Yield the final result message
      const result = await resultPromise;
      yield {
        type: 'result' as const,
        response: result['response'] as string,
        sessionId: this.id,
        model: result['model'] as string | undefined,
        usage: result['usage'] as Usage | undefined,
      } as Message;
    } finally {
      unsubNotification();
    }
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    await this.transport.request('session.interrupt', { handle: this.handle });
  }

  async close(): Promise<void> {
    await this.transport.request('session.close', { handle: this.handle });
  }

  private parseEvent(params: Record<string, unknown>): Message | null {
    const type = params['type'] as string;
    switch (type) {
      case 'text':
        return { type: 'text', content: params['content'] as string };
      case 'thinking':
        return { type: 'thinking', content: params['content'] as string };
      case 'tool_use':
        return {
          type: 'tool_use',
          id: params['id'] as string,
          name: params['name'] as string,
          input: (params['input'] as Record<string, unknown>) ?? {},
        };
      case 'tool_result':
        return {
          type: 'tool_result',
          toolUseId: params['toolUseId'] as string,
          content: params['content'] as string,
          isError: params['isError'] as boolean | undefined,
        };
      default:
        return null;
    }
  }
}
