/**
 * @module amplifier
 *
 * Node.js SDK for the Amplifier AI orchestration platform.
 *
 * @example One-shot query
 * ```ts
 * import { query } from 'amplifier';
 *
 * for await (const result of query('What is 2 + 2?')) {
 *   console.log(result.response);
 * }
 * ```
 *
 * @example Multi-turn session
 * ```ts
 * import { AmplifierClient } from 'amplifier';
 *
 * const client = new AmplifierClient({ bundle: 'my-bundle' });
 * const session = await client.createSession('Hello!');
 * const reply = await session.prompt('Follow-up question');
 * console.log(reply.response);
 * session.close();
 * ```
 */

export { query } from './query';
export { AmplifierClient } from './client';
export { Session } from './session';
export type {
  ResultMessage,
  QueryOptions,
  AmplifierClientOptions,
  SessionResult,
} from './types';
export {
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from './errors';
