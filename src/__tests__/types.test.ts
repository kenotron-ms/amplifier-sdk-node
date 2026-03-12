import { describe, it, expect } from 'vitest';
import {
  isTextMessage,
  isThinkingMessage,
  isToolUseMessage,
  isToolResultMessage,
  isResultMessage,
} from '../types';
import type { Message } from '../types';

describe('type guards', () => {
  const text: Message = { type: 'text', content: 'hello' };
  const thinking: Message = { type: 'thinking', content: 'hmm' };
  const toolUse: Message = { type: 'tool_use', id: 't1', name: 'bash', input: {} };
  const toolResult: Message = { type: 'tool_result', toolUseId: 't1', content: 'ok' };
  const result: Message = { type: 'result', response: 'done', sessionId: 's1' };

  it('isTextMessage', () => {
    expect(isTextMessage(text)).toBe(true);
    expect(isTextMessage(thinking)).toBe(false);
    expect(isTextMessage(result)).toBe(false);
  });

  it('isThinkingMessage', () => {
    expect(isThinkingMessage(thinking)).toBe(true);
    expect(isThinkingMessage(text)).toBe(false);
  });

  it('isToolUseMessage', () => {
    expect(isToolUseMessage(toolUse)).toBe(true);
    expect(isToolUseMessage(text)).toBe(false);
  });

  it('isToolResultMessage', () => {
    expect(isToolResultMessage(toolResult)).toBe(true);
    expect(isToolResultMessage(toolUse)).toBe(false);
  });

  it('isResultMessage', () => {
    expect(isResultMessage(result)).toBe(true);
    expect(isResultMessage(text)).toBe(false);
  });
});
