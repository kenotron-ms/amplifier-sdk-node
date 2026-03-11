import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '../..');

describe('npm workspaces configuration', () => {
  it('root package.json has workspaces field pointing to packages/@amplifier/*', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.workspaces).toEqual(['packages/@amplifier/*']);
  });
});
