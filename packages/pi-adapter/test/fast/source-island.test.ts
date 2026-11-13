import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import * as piAdapter from '../../src/index.js';

interface SourcePackageManifest {
  readonly private: boolean;
  readonly pi: { readonly extensions: readonly string[] };
  readonly buildframe: {
    readonly supportedPiVersions: readonly string[];
    readonly verifiedPiVersions: readonly string[];
    readonly adapterProtocolVersions: readonly number[];
  };
}

describe('Pi Adapter source package', () => {
  it('exposes only the host-loaded extension and pins its reviewed native facts', async () => {
    const manifest = JSON.parse(
      await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as SourcePackageManifest;

    expect(Object.keys(piAdapter)).toEqual(['default']);
    expect(typeof piAdapter.default).toBe('function');
    expect(manifest.private).toBe(true);
    expect(manifest.pi.extensions).toEqual(['./dist/index.js']);
    expect(manifest.buildframe).toEqual({
      supportedPiVersions: ['>=0.80.6 <2.0.0'],
      verifiedPiVersions: ['0.80.6', '0.80.7', '0.80.10', '0.81.0', '0.81.1', '0.82.1', '0.84.1', '0.85.1', '1.3.0'],
      adapterProtocolVersions: [1],
    });
  });
});
