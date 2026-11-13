import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixture, open, started, manifest, installWorkspaceProjectionHygiene } from './workspaceProjectionScenarios.js';

installWorkspaceProjectionHygiene();

describe('bounded Reviewing Projection search, actions, and capture reuse', () => {
  it('searches the complete immutable Snapshot by file path and changed text with exact navigation targets', async () => {
    const created = await fixture(3);
    await writeFile(
      path.join(created.checkout, 'review-000.txt'),
      `after-0\nshared\n${'x'.repeat(9_000)}deep-needle\n`,
    );
    const owner = await open(created.checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-start-search',
        expectedStateVersion: 0,
      }),
    );
    await writeFile(path.join(created.checkout, 'review-002.txt'), 'working state must not be searched\n');

    const pathSearch = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'review-002',
      offset: 0,
      limit: 8,
    });
    expect(pathSearch).toMatchObject({
      status: 'available',
      totalResults: 1,
      results: [
        {
          kind: 'file',
          fileAbsolute: 2,
          displayPath: 'review-002.txt',
        },
      ],
    });
    if (pathSearch.status !== 'available') {
      throw new Error('Review search was not available');
    }

    const changedText = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'AFTER-2',
      offset: 0,
      limit: 8,
    });
    if (changedText.status !== 'available') {
      throw new Error('Changed-text search was not available');
    }
    expect(changedText.totalResults).toBe(1);
    const result = changedText.results[0];
    expect(result).toMatchObject({
      kind: 'change',
      displayPath: 'review-002.txt',
      change: 'addition',
      newLine: 1,
    });
    if (result?.kind !== 'change') throw new Error('Changed line was not found');
    expect(Buffer.from(result.snippet.bytesBase64, 'base64').toString('utf8')).toContain('after-2');
    const preview = await owner.workspace.read({
      kind: 'review.search-preview',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: result.fileIdentity,
      offset: Math.floor(result.rowAbsolute / 64) * 64,
      limit: 64,
    });
    if (preview.status !== 'available') {
      throw new Error('Search result preview was unavailable');
    }
    expect(preview.window.rows.some(row => row.rowIdentity === result.rowIdentity)).toBe(true);

    const diff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: review.reviewIdentity,
      fileIdentity: result.fileIdentity,
      offset: Math.floor(result.rowAbsolute / 64) * 64,
      limit: 64,
    });
    if (diff.status !== 'available') throw new Error('Search target Diff was unavailable');
    expect(diff.window.rows.some(row => row.rowIdentity === result.rowIdentity)).toBe(true);

    const deepSearch = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'deep-needle',
      offset: 0,
      limit: 8,
    });
    expect(deepSearch).toMatchObject({
      status: 'available',
      totalResults: 1,
      results: [{ kind: 'change', displayPath: 'review-000.txt', newLine: 3 }],
    });

    const dirtySearch = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'working state must not be searched',
      offset: 0,
      limit: 8,
    });
    expect(dirtySearch).toMatchObject({ status: 'available', totalResults: 0 });

    const firstPage = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'after-',
      offset: 0,
      limit: 2,
    });
    expect(firstPage).toMatchObject({
      status: 'available',
      totalResults: 3,
      offset: 0,
      results: [{ kind: 'change' }, { kind: 'change' }],
      nextOffset: 2,
    });
    const lastPage = await owner.workspace.read({
      kind: 'review.search',
      reviewIdentity: review.reviewIdentity,
      query: 'after-',
      offset: 2,
      limit: 2,
    });
    expect(lastPage).toMatchObject({
      status: 'available',
      totalResults: 3,
      offset: 2,
      results: [{ kind: 'change' }],
      nextOffset: null,
    });
    await expect(
      owner.workspace.read({
        kind: 'review.search',
        reviewIdentity: review.reviewIdentity,
        query: 'after',
        offset: 0,
        limit: 65,
      }),
    ).rejects.toThrow('Invalid bounded Review search window');
  });

  it('projects one direct Ask action and makes Previous Reviews read-only', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const first = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-direct-first',
        expectedStateVersion: 0,
      }),
    );
    const manifestView = manifest(
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: first.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    );
    const file = manifestView.manifest.files[0];
    if (file === undefined) throw new Error('File missing');
    const currentDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: first.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(currentDiff.actions).toEqual([
      expect.objectContaining({
        kind: 'review.question.ask',
        availability: 'direct',
        gateBasis: expect.objectContaining({
          expectedStateVersion: 1,
          reviewIdentity: first.reviewIdentity,
        }),
      }),
    ]);
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: first.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions).toMatchObject({
      status: 'available',
      list: { totalItems: 0, items: [] },
      actions: [],
    });

    const second = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-direct-second',
        expectedStateVersion: 1,
      }),
    );
    expect(second.reviewIdentity).not.toBe(first.reviewIdentity);
    const previousDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: first.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(previousDiff.header).toMatchObject({ retention: 'previous' });
    expect(previousDiff.actions?.[0]).toMatchObject({
      kind: 'review.question.ask',
      availability: 'blocked',
      blockers: [expect.objectContaining({ code: 'review-is-not-current' })],
    });
    const recalled = await owner.workspace.read({
      kind: 'review.command-result',
      commandIdentity: 'projection-direct-first',
    });
    expect(recalled).toMatchObject({
      status: 'available',
      committedStateVersion: 1,
      result: { reviewIdentity: first.reviewIdentity },
    });
  });

  it('adopts a fresh live capture on eviction instead of re-capturing every read', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const review = started(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'projection-adopt-capture-start',
        expectedStateVersion: 0,
      }),
    );
    const live = await owner.workspace.read({
      kind: 'review.live-manifest',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(live).toMatchObject({ kind: 'review.live-manifest', status: 'available' });

    // Evict the projection's live capture from the shared four-entry FIFO, then
    // take a marker capture that only survives if later live reads stop
    // inserting a fresh capture per read.
    for (let index = 0; index < 4; index += 1) {
      await expect(owner.workspace.read({ kind: 'workspace.current-changes.capture' })).resolves.toMatchObject({
        status: 'captured',
      });
    }
    const marker = await owner.workspace.read({ kind: 'workspace.current-changes.capture' });
    expect(marker).toMatchObject({ status: 'captured' });
    if (marker.status !== 'captured') throw new Error('Marker capture unavailable');

    for (let index = 0; index < 6; index += 1) {
      await expect(
        owner.workspace.read({
          kind: 'review.live-manifest',
          reviewIdentity: review.reviewIdentity,
          offset: 0,
          limit: 64,
        }),
      ).resolves.toMatchObject({ kind: 'review.live-manifest', status: 'available' });
    }
    await expect(
      owner.workspace.read({
        kind: 'workspace.current-changes.manifest',
        evidenceIdentity: marker.evidenceIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      evidenceIdentity: marker.evidenceIdentity,
    });
  });
});
