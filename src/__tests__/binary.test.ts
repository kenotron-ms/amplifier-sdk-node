import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { discoverBinary, checkBinaryVersion } from '../binary';
import { AmplifierBinaryNotFoundError } from '../errors';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// ─── discoverBinary ──────────────────────────────────────────────────────────

describe('discoverBinary', () => {
  beforeEach(() => {
    delete process.env['AMPLIFIER_BINARY'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['AMPLIFIER_BINARY'];
  });

  it('returns AMPLIFIER_BINARY env var when set', () => {
    process.env['AMPLIFIER_BINARY'] = '/custom/path/amplifier';
    expect(discoverBinary()).toBe('/custom/path/amplifier');
  });

  it('returns path from which when binary is on PATH', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('/usr/local/bin/amplifier\n'));
    expect(discoverBinary()).toBe('/usr/local/bin/amplifier');
  });

  it('throws AmplifierBinaryNotFoundError when nothing found', () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('not found');
    });
    expect(() => discoverBinary()).toThrow(AmplifierBinaryNotFoundError);
  });
});

// ─── checkBinaryVersion ──────────────────────────────────────────────────────

describe('checkBinaryVersion', () => {
  beforeEach(() => {
    delete process.env['AMPLIFIER_SKIP_VERSION_CHECK'];
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env['AMPLIFIER_SKIP_VERSION_CHECK'];
  });

  it('skips when AMPLIFIER_SKIP_VERSION_CHECK is set', () => {
    process.env['AMPLIFIER_SKIP_VERSION_CHECK'] = '1';
    checkBinaryVersion('/path/to/amplifier');
    expect(vi.mocked(execSync)).not.toHaveBeenCalled();
  });

  it('does not warn when version meets minimum', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('amplifier 0.1.0\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkBinaryVersion('/path/to/amplifier');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('warns when version is below minimum', () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from('amplifier 0.0.9\n'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkBinaryVersion('/path/to/amplifier');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
