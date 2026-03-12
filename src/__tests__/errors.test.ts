import { describe, it, expect } from 'vitest';
import {
  AmplifierError,
  PythonNotFoundError,
  FoundationNotInstalledError,
  BridgeError,
  BridgeTimeoutError,
  BridgeCrashedError,
  SessionError,
  BundleLoadError,
  BundleValidationError,
} from '../errors';

describe('Error hierarchy', () => {
  it('all errors extend AmplifierError', () => {
    expect(new PythonNotFoundError()).toBeInstanceOf(AmplifierError);
    expect(new FoundationNotInstalledError()).toBeInstanceOf(AmplifierError);
    expect(new BridgeError('x')).toBeInstanceOf(AmplifierError);
    expect(new BridgeTimeoutError()).toBeInstanceOf(AmplifierError);
    expect(new BridgeCrashedError('x')).toBeInstanceOf(AmplifierError);
    expect(new SessionError('x')).toBeInstanceOf(AmplifierError);
    expect(new BundleLoadError('x')).toBeInstanceOf(AmplifierError);
    expect(new BundleValidationError('x', [], [])).toBeInstanceOf(AmplifierError);
  });

  it('AmplifierError extends Error', () => {
    expect(new AmplifierError('test')).toBeInstanceOf(Error);
  });

  it('BridgeTimeoutError extends BridgeError', () => {
    expect(new BridgeTimeoutError()).toBeInstanceOf(BridgeError);
  });

  it('BridgeCrashedError extends BridgeError', () => {
    expect(new BridgeCrashedError('x')).toBeInstanceOf(BridgeError);
  });
});

describe('PythonNotFoundError', () => {
  it('has correct name and default message', () => {
    const err = new PythonNotFoundError();
    expect(err.name).toBe('PythonNotFoundError');
    expect(err.message).toContain('Python 3.11+');
  });
});

describe('BridgeError', () => {
  it('stores code', () => {
    const err = new BridgeError('fail', 'ERR_CODE');
    expect(err.code).toBe('ERR_CODE');
  });

  it('code is undefined when not provided', () => {
    const err = new BridgeError('fail');
    expect(err.code).toBeUndefined();
  });
});

describe('BridgeTimeoutError', () => {
  it('has TIMEOUT code', () => {
    const err = new BridgeTimeoutError();
    expect(err.code).toBe('TIMEOUT');
  });

  it('includes timeout duration in message when provided', () => {
    const err = new BridgeTimeoutError('timed out', 5000);
    expect(err.message).toContain('5000ms');
  });
});

describe('BridgeCrashedError', () => {
  it('stores stderr', () => {
    const err = new BridgeCrashedError('crashed', 'traceback...');
    expect(err.stderr).toBe('traceback...');
    expect(err.code).toBe('CRASHED');
  });
});

describe('SessionError', () => {
  it('stores sessionId', () => {
    const err = new SessionError('failed', 'sess-123');
    expect(err.sessionId).toBe('sess-123');
  });
});

describe('BundleValidationError', () => {
  it('stores errors and warnings arrays', () => {
    const err = new BundleValidationError('invalid', ['err1'], ['warn1', 'warn2']);
    expect(err.errors).toEqual(['err1']);
    expect(err.warnings).toEqual(['warn1', 'warn2']);
  });
});
