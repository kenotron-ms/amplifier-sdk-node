import { runAmplifier } from './runner';
import type { QueryOptions, ResultMessage } from './types';

/**
 * Send a prompt to the Amplifier binary and yield the single ResultMessage.
 *
 * Builds the CLI args array:
 *   run --output-format json [--resume <sessionId>] [--bundle <bundle>]
 *       [--provider <provider>] [--model <model>] [--max-tokens <n>] <prompt>
 */
export async function* query(
  prompt: string,
  options?: QueryOptions,
): AsyncGenerator<ResultMessage> {
  const args: string[] = ['run', '--output-format', 'json'];

  if (options?.sessionId !== undefined) {
    args.push('--resume', options.sessionId);
  }

  if (options?.bundle !== undefined) {
    args.push('--bundle', options.bundle);
  }

  if (options?.provider !== undefined) {
    args.push('--provider', options.provider);
  }

  if (options?.model !== undefined) {
    args.push('--model', options.model);
  }

  if (options?.maxTokens !== undefined) {
    args.push('--max-tokens', String(options.maxTokens));
  }

  // Prompt is always the last arg
  args.push(prompt);

  const result = await runAmplifier(args, {
    binaryPath: options?.binaryPath,
    timeoutMs: options?.timeoutMs,
  });

  yield result;
}
