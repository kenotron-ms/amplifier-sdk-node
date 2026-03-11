import { describe, it, expect } from 'vitest';
import {
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from '../errors';

// ─── AmplifierBinaryNotFoundError (3 tests) ───────────────────────────────────

describe('AmplifierBinaryNotFoundError', () => {
  it('has correct name property', () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err.name).toBe('AmplifierBinaryNotFoundError');
  });

  it('message contains actionable npm install amplifier instruction', () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err.message).toContain('npm install amplifier');
  });

  it('is an instance of Error', () => {
    const err = new AmplifierBinaryNotFoundError();
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── AmplifierProcessError (6 tests) ─────────────────────────────────────────

describe('AmplifierProcessError', () => {
  it('has correct name property', () => {
    const err = new AmplifierProcessError('something went wrong', 'stderr output');
    expect(err.name).toBe('AmplifierProcessError');
  });

  it('stores the message', () => {
    const err = new AmplifierProcessError('process failed', 'some stderr');
    expect(err.message).toBe('process failed');
  });

  it('stores stderr', () => {
    const err = new AmplifierProcessError('failed', 'error detail from stderr');
    expect(err.stderr).toBe('error detail from stderr');
  });

  it('stores optional exit code when provided', () => {
    const err = new AmplifierProcessError('failed', 'stderr text', '1');
    expect(err.code).toBe('1');
  });

  it('leaves code undefined when not provided', () => {
    const err = new AmplifierProcessError('failed', 'stderr text');
    expect(err.code).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new AmplifierProcessError('failed', 'stderr');
    expect(err).toBeInstanceOf(Error);
  });
});

// ─── AmplifierSessionError (3 tests) ─────────────────────────────────────────

describe('AmplifierSessionError', () => {
  it('has correct name property', () => {
    const err = new AmplifierSessionError('session error');
    expect(err.name).toBe('AmplifierSessionError');
  });

  it('stores message and optional errorType, and is an instance of Error', () => {
    const err = new AmplifierSessionError('session failed', 'timeout');
    expect(err.message).toBe('session failed');
    expect(err.errorType).toBe('timeout');
    expect(err).toBeInstanceOf(Error);
  });

  it('leaves errorType undefined when not provided', () => {
    const err = new AmplifierSessionError('session failed');
    expect(err.errorType).toBeUndefined();
  });
});
