import { describe, it, expect } from 'vitest';
import {
  query,
  AmplifierClient,
  Session,
  AmplifierBinaryNotFoundError,
  AmplifierProcessError,
  AmplifierSessionError,
} from '../index';

describe('index public exports – smoke tests', () => {
  it('query is a function', () => {
    expect(typeof query).toBe('function');
  });

  it('AmplifierClient is a function (class constructor)', () => {
    expect(typeof AmplifierClient).toBe('function');
  });

  it('Session is a function (class constructor)', () => {
    expect(typeof Session).toBe('function');
  });

  it('AmplifierBinaryNotFoundError is a function (class constructor)', () => {
    expect(typeof AmplifierBinaryNotFoundError).toBe('function');
  });

  it('AmplifierProcessError is a function (class constructor)', () => {
    expect(typeof AmplifierProcessError).toBe('function');
  });

  it('AmplifierSessionError is a function (class constructor)', () => {
    expect(typeof AmplifierSessionError).toBe('function');
  });
});
