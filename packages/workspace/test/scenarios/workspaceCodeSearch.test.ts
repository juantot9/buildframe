import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, installWorkspaceProjectionHygiene, open, started } from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

/**
 * review-000.txt (modified by the fixture), src/app.ts (committed, holds the
 * needle), src/new.ts (untracked, holds it), build/out.ts (ignored, holds it),
 * logo.bin (binary, holds it).
 */
async function codeRepository() {
  const created = await fixture();
  const write = async (relative: string, content: string | Buffer) => {
    await mkdir(path.dirname(path.join(created.checkout, relative)), { recursive: true });
    await writeFile(path.join(created.checkout, relative), content);
  };
  const git = (...args: string[]) => execFileSync('git', args, { cwd: created.checkout }).toString('utf8').trim();
  await write('.gitignore', 'build/\n');
  await write('src/app.ts', 'const first = 1;\nconst Needle = "committed";\n');
  await write('logo.bin', Buffer.concat([Buffer.from('needle'), Buffer.alloc(16, 0)]));
  git('add', '.gitignore', 'src/app.ts', 'logo.bin');
  git('commit', '-qm', 'code');
  const committed = git('rev-parse', 'HEAD');
  // After the commit: the needle moves in app.ts, and appears in new and ignored files.
  await write('src/app.ts', 'const first = 1;\nconst second = 2;\nconst needle = "now";\n');
  await write('src/new.ts', 'export const needle = true;\n');
  await write('build/out.ts', 'needle\n');
  const owner = await open(created.checkout);
  return { created, owner, committed, git };
}

describe('code search finds any text in the Review’s code', () => {
  it('searches the code as it is now in a live Review: tracked and untracked, not ignored or binary', async () => {
    const { owner } = await codeRepository();
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'code-search-live',
        expectedStateVersion: 0,
      }),
    );
    const view = await owner.workspace.read({
      kind: 'review.code-search',
      reviewIdentity: review.reviewIdentity,
      query: 'NEEDLE',
    });
    if (view.status !== 'available') throw new Error(`Code search is ${view.status}: ${view.reason}`);
    expect(view.searched).toEqual({ kind: 'now' });
    expect(view.matches.map(match => `${match.path.display}:${match.line} ${match.text}`)).toEqual([
      'src/app.ts:3 const needle = "now";',
      'src/new.ts:1 export const needle = true;',
    ]);
    expect(view.totalMatches).toBe(2);

    // One file only.
    const one = await owner.workspace.read({
      kind: 'review.code-search',
      reviewIdentity: review.reviewIdentity,
      query: 'const',
      pathBytesBase64: base64('src/app.ts'),
    });
    if (one.status !== 'available') throw new Error('Code search in one file unavailable');
    expect(one.matches.map(match => match.line)).toEqual([1, 2, 3]);
  });

  it('returns at most 200 matches and counts them all', async () => {
    const { created, owner } = await codeRepository();
    await writeFile(path.join(created.checkout, 'src/many.ts'), 'hit\n'.repeat(450));
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'code-search-many',
        expectedStateVersion: 0,
      }),
    );
    const view = await owner.workspace.read({
      kind: 'review.code-search',
      reviewIdentity: review.reviewIdentity,
      query: 'hit',
    });
    if (view.status !== 'available') throw new Error('Code search unavailable');
    expect(view.matches).toHaveLength(200);
    expect(view.totalMatches).toBe(450);
  });

  it('searches the compared commit’s files in a fixed Review, and says which commit', async () => {
    const { owner, committed, git } = await codeRepository();
    const parent = git('rev-parse', 'HEAD^');
    const selection = {
      kind: 'revision-pair',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: parent },
      compared: { kind: 'object', objectKind: 'commit', objectIdentity: committed },
    } as const;
    const preview = await owner.workspace.read({ kind: 'review.comparison-preview', selection });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Comparison preview unavailable');
    }
    const review = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'code-search-fixed',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (review.kind !== 'review.comparison.started') throw new Error('Commit Review did not start');
    const view = await owner.workspace.read({
      kind: 'review.code-search',
      reviewIdentity: review.reviewIdentity,
      query: 'needle',
    });
    if (view.status !== 'available') throw new Error('Code search unavailable');
    expect(view.searched).toMatchObject({ kind: 'commit', objectIdentity: committed });
    expect(view.matches.map(match => `${match.path.display}:${match.line} ${match.text}`)).toEqual([
      'src/app.ts:2 const Needle = "committed";',
    ]);
  });

  it('rejects an empty query, control characters and a malformed path', async () => {
    const { owner } = await codeRepository();
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'code-search-bad',
        expectedStateVersion: 0,
      }),
    );
    for (const bad of [{ query: '  ' }, { query: 'a\u0001b' }, { query: 'ok', pathBytesBase64: 'not base64!' }]) {
      await expect(
        owner.workspace.read({ kind: 'review.code-search', reviewIdentity: review.reviewIdentity, ...bad } as never),
      ).rejects.toThrow();
    }
  });
});
