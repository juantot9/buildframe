import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assessPiHostVersion,
  discoverPiHostVersion,
  PI_HOST_COMPATIBILITY_RANGE,
  VERIFIED_PI_HOST_VERSIONS,
} from '../../src/piHostCompatibility.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { force: true, recursive: true })),
  );
});

describe('Pi host compatibility', () => {
  it('admits the verified floor, current latest, and stable 0.x and 1.x forward-compatible releases', () => {
    expect(PI_HOST_COMPATIBILITY_RANGE).toBe('>=0.80.6 <2.0.0');
    expect(VERIFIED_PI_HOST_VERSIONS).toContain('0.80.6');
    expect(VERIFIED_PI_HOST_VERSIONS).toContain('0.85.1');
    expect(VERIFIED_PI_HOST_VERSIONS).toContain('1.3.0');
    expect(assessPiHostVersion('0.80.6')).toEqual({
      status: 'compatible',
      version: '0.80.6',
      evidence: 'verified',
    });
    expect(assessPiHostVersion('0.85.1')).toEqual({
      status: 'compatible',
      version: '0.85.1',
      evidence: 'verified',
    });
    expect(assessPiHostVersion('0.99.999')).toEqual({
      status: 'compatible',
      version: '0.99.999',
      evidence: 'compatible-family',
    });
    expect(assessPiHostVersion('1.5.0')).toEqual({
      status: 'compatible',
      version: '1.5.0',
      evidence: 'compatible-family',
    });
  });

  it.each([
    [undefined, 'version-unavailable'],
    ['', 'malformed-version'],
    ['v0.85.1', 'malformed-version'],
    ['0.85.1-beta.1', 'malformed-version'],
    ['0.080.6', 'malformed-version'],
    ['0.80.5', 'too-old'],
    ['0.79.999', 'too-old'],
    ['2.0.0', 'major-unreviewed'],
    ['3.1.0', 'major-unreviewed'],
  ] as const)('refuses unsupported host version %s', (version, reason) => {
    expect(assessPiHostVersion(version)).toMatchObject({ status: 'unsupported', reason });
  });

  it('discovers the actual version from the package owning a nested Pi CLI entrypoint', async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'buildframe-pi-host-'));
    temporaryDirectories.push(temporaryDirectory);
    const packageRoot = path.join(temporaryDirectory, 'node_modules', '@earendil-works', 'pi-coding-agent');
    const entrypoint = path.join(packageRoot, 'dist', 'bundle', 'cli.js');
    await fs.mkdir(path.dirname(entrypoint), { recursive: true });
    await Promise.all([
      fs.writeFile(
        path.join(packageRoot, 'package.json'),
        JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.85.1' }),
      ),
      fs.writeFile(entrypoint, ''),
      fs.writeFile(path.join(temporaryDirectory, 'package.json'), JSON.stringify({ version: '9.9.9' })),
    ]);

    expect(discoverPiHostVersion(entrypoint)).toBe('0.85.1');
    expect(discoverPiHostVersion(path.join(temporaryDirectory, 'other.js'))).toBeUndefined();
    expect(discoverPiHostVersion(undefined)).toBeUndefined();
  });
});
