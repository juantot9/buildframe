import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import * as appSource from '../../src/index.js';
import * as developerLauncher from '../../src/launcher.js';
import { supportManifest } from '../../src/supportManifest.js';

describe('buildframe v1 application source island', () => {
  it('keeps its Interface small, and the committed support manifest equal to the generated one', async () => {
    const manifest = JSON.parse(
      await fs.readFile(new URL('../../../../support/manifest.json', import.meta.url), 'utf8'),
    ) as unknown;
    const root = JSON.parse(await fs.readFile(new URL('../../../../package.json', import.meta.url), 'utf8')) as {
      readonly version: string;
    };

    expect(Object.keys(appSource)).toEqual(['createReviewingApplication']);
    expect(Object.keys(developerLauncher).sort()).toEqual(['openDeveloperReviewing', 'openDeveloperWorkspaceRuntime']);
    // Regenerate with `pnpm release:manifest` after changing a support fact.
    expect(manifest).toEqual(JSON.parse(JSON.stringify(supportManifest(root.version))));
  });
});
