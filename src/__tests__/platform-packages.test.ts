import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

interface PlatformSpec {
  name: string;
  os: string;
  cpu: string;
  main: string;
  description: string;
}

const PLATFORMS: PlatformSpec[] = [
  { name: '@amplifier/sdk-darwin-arm64', os: 'darwin', cpu: 'arm64', main: 'bin/amplifier',     description: 'Amplifier SDK binary for darwin-arm64' },
  { name: '@amplifier/sdk-darwin-x64',   os: 'darwin', cpu: 'x64',   main: 'bin/amplifier',     description: 'Amplifier SDK binary for darwin-x64'   },
  { name: '@amplifier/sdk-linux-x64',    os: 'linux',  cpu: 'x64',   main: 'bin/amplifier',     description: 'Amplifier SDK binary for linux-x64'    },
  { name: '@amplifier/sdk-linux-arm64',  os: 'linux',  cpu: 'arm64', main: 'bin/amplifier',     description: 'Amplifier SDK binary for linux-arm64'  },
  { name: '@amplifier/sdk-win32-x64',    os: 'win32',  cpu: 'x64',   main: 'bin/amplifier.exe', description: 'Amplifier SDK binary for win32-x64'    },
];

describe('platform package skeletons', () => {
  for (const platform of PLATFORMS) {
    const shortName = platform.name.replace('@amplifier/', '');
    const pkgDir = resolve(ROOT, 'packages', '@amplifier', shortName);

    describe(platform.name, () => {
      it('has bin/.gitkeep file that is empty', () => {
        const gitkeepPath = resolve(pkgDir, 'bin', '.gitkeep');
        expect(existsSync(gitkeepPath), `Expected ${gitkeepPath} to exist`).toBe(true);
        expect(readFileSync(gitkeepPath, 'utf-8')).toBe('');
      });

      it('has package.json with correct fields', () => {
        const pkgJsonPath = resolve(pkgDir, 'package.json');
        expect(existsSync(pkgJsonPath), `Expected ${pkgJsonPath} to exist`).toBe(true);

        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

        expect(pkg.name).toBe(platform.name);
        expect(pkg.version).toBe('0.1.0');
        expect(pkg.license).toBe('MIT');
        expect(pkg.description).toBe(platform.description);
        expect(pkg.os).toEqual([platform.os]);
        expect(pkg.cpu).toEqual([platform.cpu]);
        expect(pkg.main).toBe(platform.main);
        expect(pkg.files).toEqual(['bin/']);
      });
    });
  }
});
