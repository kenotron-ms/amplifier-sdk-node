import { runAmplifier } from './runner';
import type { AmplifierClientOptions, QueryOptions, SessionResult } from './types';

/**
 * A persistent session with the Amplifier binary.
 * Each `prompt()` call resumes the session identified by `sessionId`.
 */
export class Session {
  readonly sessionId: string;
  private readonly options: AmplifierClientOptions;

  constructor(sessionId: string, options: AmplifierClientOptions) {
    this.sessionId = sessionId;
    this.options = options;
  }

  /**
   * Send a prompt within this session, resuming via `--resume <sessionId>`.
   * Client-level options (bundle, provider, model, binaryPath) are forwarded
   * to every call; per-call `timeoutMs` overrides the timeout for this call only.
   */
  async prompt(
    text: string,
    opts?: Pick<QueryOptions, 'timeoutMs'>,
  ): Promise<SessionResult> {
    const args: string[] = ['run', '--output-format', 'json', '--resume', this.sessionId];

    if (this.options.bundle !== undefined) {
      args.push('--bundle', this.options.bundle);
    }

    if (this.options.provider !== undefined) {
      args.push('--provider', this.options.provider);
    }

    if (this.options.model !== undefined) {
      args.push('--model', this.options.model);
    }

    args.push(text);

    const result = await runAmplifier(args, {
      binaryPath: this.options.binaryPath,
      timeoutMs: opts?.timeoutMs,
    });

    return { ...result, sessionId: this.sessionId };
  }

  /** No-op — sessions are stateless from the SDK perspective. */
  close(): void {
    // intentional no-op
  }
}
