import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, installWorkspaceProjectionHygiene, open, started } from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

/**
 * review-000.txt (modified), docs/guide.md, src/a.ts, src/z.ts, src/lib/b.ts
 * (modified) and src/new.ts (new, untracked).
 */
async function folderReview() {
  const created = await fixture();
  const write = async (relative: string, text: string) => {
    await mkdir(path.dirname(path.join(created.checkout, relative)), { recursive: true });
    await writeFile(path.join(created.checkout, relative), text);
  };
  for (const relative of ['docs/guide.md', 'src/a.ts', 'src/z.ts', 'src/lib/b.ts']) await write(relative, 'one\n');
  execFileSync('git', ['add', 'docs', 'src'], { cwd: created.checkout });
  execFileSync('git', ['commit', '-qm', 'folders'], { cwd: created.checkout });
  await write('src/lib/b.ts', 'two\n');
  await write('src/new.ts', 'new\n');
  const owner = await open(created.checkout);
  const review = started(
    await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'live-folder',
      expectedStateVersion: 0,
    }),
  );
  const live = await owner.workspace.read({
    kind: 'review.live-manifest',
    reviewIdentity: review.reviewIdentity,
    offset: 0,
    limit: 1,
  });
  if (live.status !== 'available') throw new Error('Live changes are not available');
  const folder = (folderPath: string, window: { offset?: number; limit?: number } = {}) =>
    owner.workspace.read({
      kind: 'review.live-folder',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      pathBytesBase64: base64(folderPath),
      offset: window.offset ?? 0,
      limit: window.limit ?? 1_000,
    });
  return { owner, review, live, folder };
}

/** Each row as `name/ files changed` for a folder or `path status` for a file. */
function rows(view: Awaited<ReturnType<Awaited<ReturnType<typeof folderReview>>['folder']>>) {
  if (view.status !== 'available') throw new Error(`Folder is ${view.status}: ${view.reason}`);
  return view.entries.items.map(entry =>
    entry.kind === 'folder'
      ? `${entry.path.display}/ ${entry.files} ${entry.changedFiles}`
      : `${entry.file.path.display} ${entry.file.status}`,
  );
}

describe('a live folder read lists one folder of the current Review', () => {
  it('lists subfolders with their counts and files with their status, changes first', async () => {
    const { folder } = await folderReview();
    const top = await folder('');
    expect(rows(top)).toEqual(['review-000.txt modified', 'src/ 4 2', 'docs/ 1 0']);
    expect(top.status === 'available' && top.folder).toEqual({
      path: { bytesBase64: '', display: '' },
      files: 6,
      changedFiles: 3,
    });
    expect(rows(await folder('src'))).toEqual([
      'src/lib/ 1 1',
      'src/new.ts added',
      'src/a.ts unchanged',
      'src/z.ts unchanged',
    ]);
    expect(rows(await folder('src/lib'))).toEqual(['src/lib/b.ts modified']);
  });

  it('pages a folder and says where the next window starts', async () => {
    const { folder } = await folderReview();
    const first = await folder('src', { limit: 3 });
    const rest = await folder('src', { offset: 3, limit: 3 });
    if (first.status !== 'available' || rest.status !== 'available') throw new Error('Folder unavailable');
    expect(first.entries).toMatchObject({ total: 4, offset: 0, nextOffset: 3 });
    expect(rest.entries).toMatchObject({ total: 4, offset: 3, nextOffset: null });
    expect(rows(rest)).toEqual(['src/z.ts unchanged']);
  });

  it('says when the folder is not there or the live changes moved', async () => {
    const { owner, review, folder } = await folderReview();
    expect(await folder('nowhere')).toMatchObject({ status: 'not-found', reason: 'folder-not-found' });
    expect(await folder('src/a.ts')).toMatchObject({ status: 'not-found', reason: 'folder-not-found' });
    const moved = await owner.workspace.read({
      kind: 'review.live-folder',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: `lch_${'0'.repeat(64)}`,
      pathBytesBase64: '',
      offset: 0,
      limit: 10,
    });
    expect(moved).toMatchObject({ status: 'moved', reason: 'live-changes-moved' });
  });

  it('reads many whole folders at once, naming the ones that are not there', async () => {
    const { owner, review, live } = await folderReview();
    const view = await owner.workspace.read({
      kind: 'review.live-folders',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      pathsBytesBase64: ['', base64('src/lib'), base64('nowhere'), base64('docs')],
    });
    if (view.status !== 'available') throw new Error(`Folders are ${view.status}`);
    expect(view.folders.map(folder => [folder.folder.path.display, folder.entries.length])).toEqual([
      ['', 3],
      ['src/lib', 1],
      ['docs', 1],
    ]);
    expect(view).toMatchObject({ missing: [base64('nowhere')], remaining: [], tooLarge: [] });
    await expect(
      owner.workspace.read({
        kind: 'review.live-folders',
        reviewIdentity: review.reviewIdentity,
        liveChangesIdentity: live.liveChangesIdentity,
        pathsBytesBase64: [base64('/src')],
      }),
    ).rejects.toThrow();
  });

  it('rejects a folder path that is not a plain relative path, and windows over 1,000 rows', async () => {
    const { folder } = await folderReview();
    for (const bad of ['src/', '/src', 'src//lib', '..', 'src/./lib']) {
      await expect(folder(bad)).rejects.toThrow();
    }
    await expect(folder('src', { limit: 1_001 })).rejects.toThrow();
  });
});
