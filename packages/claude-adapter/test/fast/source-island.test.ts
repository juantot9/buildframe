import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import * as claudeAdapter from '../../src/index.js';

interface SourcePackageManifest {
  readonly private: boolean;
  readonly files: readonly string[];
  readonly buildframe: {
    readonly supportedClaudeDirectHostVersions: readonly string[];
    readonly reviewedClaudeDirectHostVersions: readonly string[];
  };
}

describe('Claude Adapter source package', () => {
  it('pins its reviewed native facts and ships its one plugin beside the build', async () => {
    const manifest = JSON.parse(
      await fs.readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as SourcePackageManifest;

    expect(manifest.private).toBe(true);
    expect(manifest.files).toEqual(['dist', 'plugin']);
    expect(manifest.buildframe).toEqual({
      supportedClaudeDirectHostVersions: ['>=2.1.310 <3.0.0'],
      reviewedClaudeDirectHostVersions: ['2.1.310', '2.1.311', '2.1.317', '2.1.322'],
    });
    expect(claudeAdapter.REVIEWED_CLAUDE_DIRECT_HOST_VERSIONS).toEqual(
      manifest.buildframe.reviewedClaudeDirectHostVersions,
    );
    expect([claudeAdapter.CLAUDE_DIRECT_HOST_COMPATIBILITY_RANGE]).toEqual(
      manifest.buildframe.supportedClaudeDirectHostVersions,
    );
  });

  it('names its plugin buildframe, so its command is /buildframe', async () => {
    const plugin = JSON.parse(
      await fs.readFile(new URL('../../plugin/.claude-plugin/plugin.json', import.meta.url), 'utf8'),
    ) as { readonly name: string };
    expect(plugin.name).toBe('buildframe');
  });
});
