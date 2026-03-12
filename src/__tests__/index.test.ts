import { describe, it, expect } from 'vitest';
import {
  query,
  AmplifierClient,
  Session,
  PythonBridgeTransport,
  AmplifierError,
  PythonNotFoundError,
  FoundationNotInstalledError,
  BridgeError,
  BridgeTimeoutError,
  BridgeCrashedError,
  SessionError,
  BundleLoadError,
  BundleValidationError,
  isTextMessage,
  isThinkingMessage,
  isToolUseMessage,
  isToolResultMessage,
  isResultMessage,
} from '../index';

describe('public exports', () => {
  it('exports query function', () => {
    expect(typeof query).toBe('function');
  });

  it('exports AmplifierClient class', () => {
    expect(typeof AmplifierClient).toBe('function');
  });

  it('exports Session class', () => {
    expect(typeof Session).toBe('function');
  });

  it('exports PythonBridgeTransport class', () => {
    expect(typeof PythonBridgeTransport).toBe('function');
  });

  it('exports all error classes', () => {
    expect(typeof AmplifierError).toBe('function');
    expect(typeof PythonNotFoundError).toBe('function');
    expect(typeof FoundationNotInstalledError).toBe('function');
    expect(typeof BridgeError).toBe('function');
    expect(typeof BridgeTimeoutError).toBe('function');
    expect(typeof BridgeCrashedError).toBe('function');
    expect(typeof SessionError).toBe('function');
    expect(typeof BundleLoadError).toBe('function');
    expect(typeof BundleValidationError).toBe('function');
  });

  it('exports type guard functions', () => {
    expect(typeof isTextMessage).toBe('function');
    expect(typeof isThinkingMessage).toBe('function');
    expect(typeof isToolUseMessage).toBe('function');
    expect(typeof isToolResultMessage).toBe('function');
    expect(typeof isResultMessage).toBe('function');
  });
});
