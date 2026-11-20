import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { captureLegacyReviewSource } from '../../src/legacyReviewSource.js';
import { symlinksAvailable } from '../platformCases.js';
import { capture, recognized, removeTemporaryRoots, temporaryRoot } from './legacyReviewSourceScenarios.js';

afterEach(removeTemporaryRoots);

describe('legacy Review source locators', () => {
  it('rejects missing, symlinked, non-regular, and invalid locators', async () => {
    const missingRoot = await temporaryRoot();
    await expect(capture('queue', missingRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'missing',
    });

    // A file link needs Developer Mode on Windows; directory links are junctions there.
    if (symlinksAvailable) {
      const finalLinkRoot = await temporaryRoot();
      await fs.mkdir(path.join(finalLinkRoot, 'owned'));
      await fs.writeFile(path.join(finalLinkRoot, 'target.json'), '[]\n');
      await fs.symlink(path.join(finalLinkRoot, 'target.json'), path.join(finalLinkRoot, 'owned', 'source.json'));
      await expect(capture('queue', finalLinkRoot)).resolves.toMatchObject({
        status: 'unavailable',
        reason: 'unsafe-path',
      });
    }

    const directoryLinkRoot = await temporaryRoot();
    await fs.mkdir(path.join(directoryLinkRoot, 'actual'));
    await fs.writeFile(path.join(directoryLinkRoot, 'actual', 'source.json'), '[]\n');
    await fs.symlink(path.join(directoryLinkRoot, 'actual'), path.join(directoryLinkRoot, 'owned'), 'junction');
    await expect(capture('queue', directoryLinkRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'unsafe-path',
    });

    const nonRegularRoot = await temporaryRoot();
    await fs.mkdir(path.join(nonRegularRoot, 'owned', 'source.json'), {
      recursive: true,
    });
    await expect(capture('queue', nonRegularRoot)).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'not-regular-file',
    });

    const aliasedParent = await temporaryRoot();
    const actualRoot = path.join(aliasedParent, 'actual-root');
    const aliasedRoot = path.join(aliasedParent, 'configured-root');
    await fs.mkdir(path.join(actualRoot, 'owned'), { recursive: true });
    await fs.writeFile(path.join(actualRoot, 'owned', 'source.json'), '[]\n');
    await fs.symlink(actualRoot, aliasedRoot, 'junction');
    const aliased = recognized(
      await captureLegacyReviewSource({
        sourceKind: 'queue',
        trustedRoot: aliasedRoot,
        relativePath: ['owned', 'source.json'],
      }),
    );
    expect(aliased.sourcePath).toBe(await fs.realpath(path.join(actualRoot, 'owned', 'source.json')));

    await expect(
      captureLegacyReviewSource({
        sourceKind: 'queue',
        trustedRoot: missingRoot,
        relativePath: ['owned', '..', 'source.json'],
      }),
    ).rejects.toThrow('relative path is invalid');
  });
});
