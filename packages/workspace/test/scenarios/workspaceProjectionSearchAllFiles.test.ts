import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { installWorkspaceProjectionHygiene, open, roots, started } from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

const run = promisify(execFile);
const git = async (checkout: string, ...args: string[]): Promise<void> => {
  await run(await resolveGitExecutable(), ['-C', checkout, ...args]);
};

// The hygiene closes each owner before removing its folder (and restores the
// State home): Windows cannot delete the State database while it is open.
describe('Review search over every repository file', () => {
  it('matches the paths of unchanged files only when asked for the live changes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-search-all-'));
    roots.add(root);
    const checkout = path.join(root, 'checkout');
    await mkdir(path.join(checkout, 'src'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'user-7@masked.invalid');
    for (const file of ['src/a.ts', 'src/config.ts', 'src/Config.md']) {
      await writeFile(path.join(checkout, file), 'basis\n');
    }
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'basis');
    await writeFile(path.join(checkout, 'src/a.ts'), 'changed config value\n');

    const owner = await open(checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'search-all-files',
        expectedStateVersion: 0,
      }),
    );
    const live = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (live.status !== 'available') throw new Error('Live changes are not available');
    const search = { kind: 'review.search', reviewIdentity: review.reviewIdentity, offset: 0, limit: 8 } as const;

    // Without the live changes, only the saved Snapshot is searched: the changed line.
    const saved = await owner.workspace.read({ ...search, query: 'config' });
    expect(saved).toMatchObject({ status: 'available', totalResults: 1, results: [{ kind: 'change' }] });

    const all = await owner.workspace.read({
      ...search,
      query: 'config',
      liveChangesIdentity: live.liveChangesIdentity,
    });
    if (all.status !== 'available') throw new Error('Search is not available');
    // The changed line first, then unchanged files by path, ignoring case; each at its place in the live list.
    expect(all.totalResults).toBe(3);
    expect(all.results.map(result => [result.kind, result.displayPath, result.fileAbsolute])).toEqual([
      ['change', 'src/a.ts', 0],
      ['unchanged-file', 'src/Config.md', 1],
      ['unchanged-file', 'src/config.ts', 2],
    ]);
    const files = await owner.workspace.read({
      kind: 'review.live-files',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      offset: 0,
      limit: 64,
    });
    if (files.status !== 'available') throw new Error('Live files are not available');
    expect(files.files.items[2]?.fileIdentity).toBe(all.results[2]?.fileIdentity);

    // A changed file is never listed again as unchanged.
    const changed = await owner.workspace.read({
      ...search,
      query: 'a.ts',
      liveChangesIdentity: live.liveChangesIdentity,
    });
    expect(changed).toMatchObject({ totalResults: 1, results: [{ kind: 'file', displayPath: 'src/a.ts' }] });
  });
});
