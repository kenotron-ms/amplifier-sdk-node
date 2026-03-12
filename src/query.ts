import { AmplifierClient } from './client';
import type { Message, QueryOptions } from './types';

export async function* query(
  prompt: string,
  options?: QueryOptions,
): AsyncGenerator<Message> {
  const client = new AmplifierClient({
    bundle: options?.bundle,
    provider: options?.provider,
    model: options?.model,
    hooks: options?.hooks,
    onApproval: options?.onApproval,
    cwd: options?.cwd,
    pythonPath: options?.pythonPath,
  });

  try {
    const session = await client.createSession({
      systemPrompt: options?.systemPrompt,
      maxTokens: options?.maxTokens,
    });

    try {
      yield* session.query(prompt);
    } finally {
      await session.close();
    }
  } finally {
    await client.close();
  }
}
