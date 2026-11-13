import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, open, requireStarted, git, installWorkspaceReviewingHygiene } from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

describe('direct retained Reviewing context projections', () => {
  it('projects persistent stale source truth and blocks the one Ask action', async () => {
    const created = await fixture();
    const owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'stale-current-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await writeFile(path.join(created.checkout, 'review.txt'), 'source moved\n');
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest.status).toBe('available');
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    expect(manifest.header.snapshotStatus).toBe('stale');
    const file = manifest.manifest.files[0];
    if (file === undefined) throw new Error('File missing');
    const diff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: started.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(diff.actions?.find(action => action.kind === 'review.question.ask')).toMatchObject({
      availability: 'blocked',
      blockers: [expect.objectContaining({ code: 'review-snapshot-changed' })],
    });
    const liveManifest = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(liveManifest).toMatchObject({
      status: 'available',
      matchesLatestSnapshot: false,
      stateVersion: manifest.stateVersion,
    });
    if (liveManifest.status !== 'available') {
      throw new Error('Live Changes unavailable');
    }
    const liveDiff = await owner.workspace.read({
      kind: 'review.live-diff',
      reviewIdentity: started.reviewIdentity,
      liveChangesIdentity: liveManifest.liveChangesIdentity,
      fileIdentity: liveManifest.manifest.files[0]!.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(liveDiff).toMatchObject({
      status: 'available',
      matchesLatestSnapshot: false,
      actions: [
        expect.objectContaining({
          kind: 'review.question.ask',
          availability: 'direct',
        }),
      ],
    });
    if (liveDiff.status !== 'available') throw new Error('Live Diff unavailable');
    expect(
      liveDiff.window.rows.map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8')).join(''),
    ).toContain('source moved');
  });

  it('projects bounded Changed and All current-repository files without excluding clean checkouts', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'unchanged.txt'), 'unchanged\n');
    await git(created.checkout, 'add', 'unchanged.txt');
    await git(created.checkout, 'commit', '-qm', 'add unchanged file');
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'live-files-clean-start',
        expectedStateVersion: 0,
      }),
    );
    const cleanManifest = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (cleanManifest.status !== 'available') throw new Error('Clean Live Changes unavailable');
    expect(cleanManifest.manifest.totalFiles).toBe(0);
    const cleanFiles = await owner.workspace.read({
      kind: 'review.live-files',
      reviewIdentity: started.reviewIdentity,
      liveChangesIdentity: cleanManifest.liveChangesIdentity,
      offset: 0,
      limit: 64,
    });
    expect(cleanFiles).toMatchObject({
      status: 'available',
      files: {
        total: 2,
        offset: 0,
        items: [
          { status: 'unchanged', path: { display: 'review.txt' } },
          { status: 'unchanged', path: { display: 'unchanged.txt' } },
        ],
        nextOffset: null,
      },
    });

    await writeFile(path.join(created.checkout, 'review.txt'), 'changed now\n');
    const movedManifest = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (movedManifest.status !== 'available') throw new Error('Moved Live Changes unavailable');
    await expect(
      owner.workspace.read({
        kind: 'review.live-files',
        reviewIdentity: started.reviewIdentity,
        liveChangesIdentity: cleanManifest.liveChangesIdentity,
        offset: 0,
        limit: 1,
      }),
    ).resolves.toMatchObject({ status: 'moved', reason: 'live-changes-moved' });
    const first = await owner.workspace.read({
      kind: 'review.live-files',
      reviewIdentity: started.reviewIdentity,
      liveChangesIdentity: movedManifest.liveChangesIdentity,
      offset: 0,
      limit: 1,
    });
    expect(first).toMatchObject({
      status: 'available',
      files: {
        total: 2,
        offset: 0,
        items: [{ status: 'modified', path: { display: 'review.txt' }, changedFile: expect.any(Object) }],
        nextOffset: 1,
      },
    });
    const second = await owner.workspace.read({
      kind: 'review.live-files',
      reviewIdentity: started.reviewIdentity,
      liveChangesIdentity: movedManifest.liveChangesIdentity,
      offset: 1,
      limit: 1,
    });
    expect(second).toMatchObject({
      status: 'available',
      files: {
        total: 2,
        offset: 1,
        items: [{ status: 'unchanged', path: { display: 'unchanged.txt' } }],
        nextOffset: null,
      },
    });
  });

  it('projects bounded working-tree content for unchanged files', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'notes.txt'), 'file contents\n');
    await writeFile(path.join(created.checkout, 'blob.bin'), Buffer.from([0x00, 0x01, 0x02]));
    await git(created.checkout, 'add', 'notes.txt', 'blob.bin');
    await git(created.checkout, 'commit', '-qm', 'add unchanged content fixtures');
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'live-content-start',
        expectedStateVersion: 0,
      }),
    );
    const manifest = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available') throw new Error('Live Changes unavailable');
    const readContent = (pathBytesBase64: string, liveChangesIdentity = manifest.liveChangesIdentity) =>
      owner.workspace.read({
        kind: 'review.live-file-content',
        reviewIdentity: started.reviewIdentity,
        liveChangesIdentity,
        pathBytesBase64,
      });
    const text = await readContent(Buffer.from('notes.txt').toString('base64'));
    expect(text).toMatchObject({
      status: 'available',
      path: { display: 'notes.txt' },
      content: { encoding: 'utf8', byteLength: Buffer.byteLength('file contents\n'), truncated: false },
    });
    if (text.status !== 'available') throw new Error('Text content unavailable');
    expect(Buffer.from(text.content.bytesBase64, 'base64').toString('utf8')).toBe('file contents\n');
    await expect(readContent(Buffer.from('blob.bin').toString('base64'))).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'binary',
    });
    await expect(readContent(Buffer.from('absent.txt').toString('base64'))).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'file-unavailable',
    });

    await writeFile(path.join(created.checkout, 'review.txt'), 'moved on\n');
    await expect(readContent(Buffer.from('notes.txt').toString('base64'))).resolves.toMatchObject({
      status: 'moved',
      reason: 'live-changes-moved',
    });
    const moved = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (moved.status !== 'available') throw new Error('Moved Live Changes unavailable');
    // Changed files are shown through their Diff, never through this view.
    await expect(
      readContent(Buffer.from('review.txt').toString('base64'), moved.liveChangesIdentity),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'file-unavailable' });
  });
});
