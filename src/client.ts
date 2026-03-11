import { runAmplifier } from './runner';
import { Session } from './session';
import type { AmplifierClientOptions, QueryOptions, ResultMessage } from './types';

/**
 * High-level client for interacting with the Amplifier binary.
 * Manages session creation, recipe execution, and bundle installation.
 */
export class AmplifierClient {
  private readonly options: AmplifierClientOptions;

  constructor(options?: AmplifierClientOptions) {
    this.options = options ?? {};
  }

  /**
   * Start a new Amplifier session with the given prompt.
   * Client-level options (bundle, provider, model) are merged with per-call opts;
   * per-call values take precedence.
   */
  async createSession(prompt: string, opts?: QueryOptions): Promise<Session> {
    const args: string[] = ['run', '--output-format', 'json'];

    // Merge client-level and per-call options; per-call wins
    const bundle = opts?.bundle ?? this.options.bundle;
    const provider = opts?.provider ?? this.options.provider;
    const model = opts?.model ?? this.options.model;

    if (bundle !== undefined) {
      args.push('--bundle', bundle);
    }

    if (provider !== undefined) {
      args.push('--provider', provider);
    }

    if (model !== undefined) {
      args.push('--model', model);
    }

    if (opts?.maxTokens !== undefined) {
      args.push('--max-tokens', String(opts.maxTokens));
    }

    args.push(prompt);

    const result = await runAmplifier(args, {
      binaryPath: opts?.binaryPath ?? this.options.binaryPath,
      timeoutMs: opts?.timeoutMs,
    });

    return new Session(result.sessionId, this.options);
  }

  /**
   * Execute an Amplifier recipe file, optionally passing context variables.
   */
  async runRecipe(
    recipePath: string,
    context?: Record<string, unknown>,
  ): Promise<ResultMessage> {
    const args: string[] = ['recipe', 'run', '--output-format', 'json', recipePath];

    if (context !== undefined) {
      for (const [key, value] of Object.entries(context)) {
        args.push('--context', `${key}=${value}`);
      }
    }

    return await runAmplifier(args, {
      binaryPath: this.options.binaryPath,
    });
  }

  /**
   * Install a bundle from the given URL.
   */
  async install(bundleUrl: string): Promise<void> {
    await runAmplifier(['bundle', 'add', bundleUrl], {
      binaryPath: this.options.binaryPath,
    });
  }
}
