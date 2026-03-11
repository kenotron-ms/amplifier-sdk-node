import { execSync } from 'child_process';
import { AmplifierBinaryNotFoundError } from './errors';

export const MINIMUM_BINARY_VERSION = '0.1.0';

const PLATFORM_PACKAGES: Record<string, string> = {
  'darwin-arm64': '@amplifier/sdk-darwin-arm64',
  'darwin-x64': '@amplifier/sdk-darwin-x64',
  'linux-x64': '@amplifier/sdk-linux-x64',
  'linux-arm64': '@amplifier/sdk-linux-arm64',
  'win32-x64': '@amplifier/sdk-win32-x64',
};

export function discoverBinary(): string {
  // Step 1: AMPLIFIER_BINARY env var
  const envBinary = process.env['AMPLIFIER_BINARY'];
  if (envBinary) {
    return envBinary;
  }

  // Step 2: optionalDependencies platform package via require.resolve
  const platform = `${process.platform}-${process.arch}`;
  const pkg = PLATFORM_PACKAGES[platform];
  if (pkg) {
    try {
      const pkgMain = require.resolve(`${pkg}/binary`);
      return pkgMain;
    } catch {
      // Package not installed, continue to next step
    }
  }

  // Step 3: system PATH via execSync
  try {
    const cmd = process.platform === 'win32' ? 'where amplifier' : 'which amplifier';
    const result = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] });
    const binaryPath = result.toString().trim().split('\n')[0]?.trim();
    if (binaryPath) {
      return binaryPath;
    }
  } catch {
    // Not found on PATH, continue to step 4
  }

  // Step 4: throw
  throw new AmplifierBinaryNotFoundError();
}

function compareSemver(a: string, b: string): number {
  const parse = (v: string): [number, number, number] => {
    const parts = v.split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [aMaj, aMin, aPatch] = parse(a);
  const [bMaj, bMin, bPatch] = parse(b);
  if (aMaj !== bMaj) return aMaj - bMaj;
  if (aMin !== bMin) return aMin - bMin;
  return aPatch - bPatch;
}

export function checkBinaryVersion(binaryPath: string): void {
  if (process.env['AMPLIFIER_SKIP_VERSION_CHECK']) {
    return;
  }

  try {
    const result = execSync(`${binaryPath} --version`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const output = result.toString().trim();
    const match = /(\d+\.\d+\.\d+)/.exec(output);
    if (match) {
      const version = match[1];
      if (version && compareSemver(version, MINIMUM_BINARY_VERSION) < 0) {
        console.warn(
          `Warning: amplifier binary version ${version} is below the minimum required version ${MINIMUM_BINARY_VERSION}.`,
        );
      }
    }
  } catch {
    // Never throws
  }
}
