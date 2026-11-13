import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openAuthoritativeState } from '../../src/authoritativeState.js';
import type { Workspace } from '../../src/index.js';
import {
  MAX_REVIEW_SNAPSHOTS,
  decodeReviewingPayload,
  parseReviewIndex,
  reviewingRecordIdentity,
  type ReviewSnapshotIdentity,
} from '../../src/reviewing/index.js';
import { reviewComparisonEndpointIdentity } from '../../src/workspaceEvidence/index.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import {
  fixture,
  git,
  open,
  owners,
  installHistoricalActiveReview,
  installWorkspaceReviewingHygiene,
} from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

describe('direct retained Reviewing comparison retention', () => {
  it('starts an exact historical comparison without consulting dirty working bytes', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'review.txt'), 'committed\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'historical target');
    const selected = await git(created.checkout, 'rev-parse', 'HEAD');
    const parent = await git(created.checkout, 'rev-parse', 'HEAD^');
    await writeFile(path.join(created.checkout, 'review.txt'), 'dirty working only\n');

    const owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const result = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'historical-direct-review',
      expectedStateVersion: home.stateVersion,
      selection: { kind: 'commit', revision: selected },
      expectedBasisObjectIdentity: parent,
      expectedComparedObjectIdentity: selected,
    });
    expect(result).toMatchObject({
      kind: 'review.comparison.started',
      status: 'accepted',
    });
    if (result.kind !== 'review.comparison.started') throw new Error('Comparison failed');
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: result.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest.status).toBe('available');
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    const file = manifest.manifest.files[0];
    if (file === undefined) throw new Error('File missing');
    const diff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: result.reviewIdentity,
      fileIdentity: file.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(diff.status).toBe('available');
    if (diff.status !== 'available') throw new Error('Diff unavailable');
    const text = diff.window.rows.map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8')).join('');
    expect(text).toContain('committed');
    expect(text).not.toContain('dirty working only');
    expect(
      await owner.workspace.read({
        kind: 'review.live-manifest',
        reviewIdentity: result.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).toMatchObject({
      status: 'fixed',
      reason: 'fixed-comparison',
    });
  });

  it('binds previewed dynamic revision evidence before atomically retaining the exact Change Set', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'review.txt'), 'selected basis\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'selected basis');
    const basisCommit = await git(created.checkout, 'rev-parse', 'HEAD');
    const basisTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');
    await git(created.checkout, 'branch', 'dynamic-review-basis', basisCommit);
    await writeFile(path.join(created.checkout, 'review.txt'), 'selected compared\n');
    await git(created.checkout, 'commit', '-qam', 'selected compared');
    const comparedTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');

    let owner = await open(created);
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/dynamic-review-basis',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: comparedTree,
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    expect(preview).toMatchObject({
      status: 'available',
      basis: { kind: 'tree', objectIdentity: basisTree },
      comparedState: { kind: 'tree', objectIdentity: comparedTree },
      action: {
        availability: 'direct',
        gateBasis: {
          expectedStateVersion: 0,
          targetIdentities: [expect.stringMatching(/^rcp_[0-9a-f]{64}$/u)],
        },
      },
    });
    if (preview.status !== 'available') throw new Error('Preview unavailable');
    if (preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Preview resolution identity missing');
    }
    expect(preview.comparisonResolutionIdentity).toMatch(/^rcp_[0-9a-f]{64}$/u);

    const sameBasisTree = await git(
      created.checkout,
      'commit-tree',
      basisTree,
      '-p',
      basisCommit,
      '-m',
      'same basis tree',
    );
    await git(created.checkout, 'update-ref', 'refs/heads/dynamic-review-basis', sameBasisTree);
    await expect(
      owner.workspace.execute({
        kind: 'review.comparison.start',
        commandIdentity: 'dynamic-comparison-race',
        expectedStateVersion: preview.stateVersion,
        selection: preview.selection,
        expectedBasisObjectIdentity: reviewComparisonEndpointIdentity(preview.basis),
        expectedComparedObjectIdentity: reviewComparisonEndpointIdentity(preview.comparedState) ?? '',
        expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'comparison-changed',
      stateVersion: 0,
    });

    await git(created.checkout, 'update-ref', 'refs/heads/dynamic-review-basis', basisCommit);
    const currentPreview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    if (currentPreview.status !== 'available') {
      throw new Error('Current preview unavailable');
    }
    if (currentPreview.comparisonResolutionIdentity === undefined) {
      throw new Error('Current preview resolution identity missing');
    }
    const startCommand = {
      kind: 'review.comparison.start',
      commandIdentity: 'dynamic-comparison-start',
      expectedStateVersion: currentPreview.stateVersion,
      selection: currentPreview.selection,
      expectedBasisObjectIdentity: reviewComparisonEndpointIdentity(currentPreview.basis),
      expectedComparedObjectIdentity: reviewComparisonEndpointIdentity(currentPreview.comparedState) ?? '',
      expectedComparisonResolutionIdentity: currentPreview.comparisonResolutionIdentity,
    } as const;
    const started = await owner.workspace.execute(startCommand);
    expect(started).toMatchObject({
      kind: 'review.comparison.started',
      status: 'accepted',
      stateVersion: 1,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Dynamic comparison did not start');
    }

    let manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });
    await git(created.checkout, 'update-ref', 'refs/heads/dynamic-review-basis', sameBasisTree);
    manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'stale' },
    });

    await owner.dispose();
    owners.delete(owner);
    await git(created.checkout, 'update-ref', 'refs/heads/dynamic-review-basis', basisCommit);
    owner = await open(created);
    manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });
    await expect(owner.workspace.execute(startCommand)).resolves.toEqual(started);

    await expect(
      owner.workspace.execute({
        kind: 'review.comparison.start',
        commandIdentity: 'dynamic-comparison-missing-resolution',
        expectedStateVersion: 1,
        selection,
        expectedBasisObjectIdentity: basisTree,
        expectedComparedObjectIdentity: comparedTree,
      }),
    ).rejects.toThrow('Invalid start Review comparison command');
  });

  it('binds scoped preview intent across unrelated ref movement and projects scope context', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside basis\n');
    await git(created.checkout, 'add', 'outside.txt');
    await git(created.checkout, 'commit', '-qm', 'scoped basis');
    await git(created.checkout, 'branch', 'scoped-review-basis');
    await writeFile(path.join(created.checkout, 'review.txt'), 'selected compared\n');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside compared\n');
    await git(created.checkout, 'commit', '-qam', 'scoped compared');
    const comparedTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');

    let owner = await open(created);
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/scoped-review-basis',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: comparedTree,
      },
      scope: {
        kind: 'exact-paths',
        entries: [
          {
            pathBytesBase64: Buffer.from('review.txt').toString('base64'),
            inclusion: 'ordinary',
          },
        ],
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    expect(preview).toMatchObject({
      status: 'available',
      basisEndpointIdentity: expect.stringMatching(/^[0-9a-f]{64}$/u),
      comparedEndpointIdentity: expect.stringMatching(/^[0-9a-f]{64}$/u),
      totalFiles: 1,
    });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Scoped preview unavailable');
    }

    await git(created.checkout, 'checkout', '-q', 'scoped-review-basis');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside moved\n');
    await git(created.checkout, 'commit', '-qam', 'unrelated scoped ref movement');
    await git(created.checkout, 'checkout', '-q', '-');

    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'scoped-comparison-start',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    expect(started).toMatchObject({
      kind: 'review.comparison.started',
      status: 'accepted',
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Scoped comparison did not start');
    }
    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    let manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: {
        title: 'Review selected changes',
        snapshotStatus: 'current',
        comparison: { scope: selection.scope },
      },
      manifest: {
        totalFiles: 1,
        files: [
          {
            displayPath: 'review.txt',
            scopeMembership: [
              {
                selectionPath: 'review.txt',
                selectionPathBytesBase64: Buffer.from('review.txt').toString('base64'),
                selectionKind: 'file',
                inclusion: 'ordinary',
                matchedSides: ['old', 'new'],
              },
            ],
          },
        ],
      },
    });

    await git(created.checkout, 'checkout', '-q', 'scoped-review-basis');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside moved again\n');
    await git(created.checkout, 'commit', '-qam', 'later unrelated ref movement');
    await git(created.checkout, 'checkout', '-q', '-');
    manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });

    await git(created.checkout, 'checkout', '-q', 'scoped-review-basis');
    await writeFile(path.join(created.checkout, 'review.txt'), 'selected moved\n');
    await git(created.checkout, 'commit', '-qam', 'selected scoped ref movement');
    await git(created.checkout, 'checkout', '-q', '-');
    manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'stale' },
    });
  });

  it('refreshes a scoped comparison to an empty diff when the basis catches up', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'selected.txt'), 'selected basis\n');
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'catch-up basis');
    await git(created.checkout, 'branch', 'catch-up-basis');
    await writeFile(path.join(created.checkout, 'selected.txt'), 'selected compared\n');
    await git(created.checkout, 'commit', '-qam', 'catch-up compared');
    const comparedTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');

    const owner = await open(created);
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/catch-up-basis',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: comparedTree,
      },
      scope: {
        kind: 'exact-paths',
        entries: [
          {
            pathBytesBase64: Buffer.from('selected.txt').toString('base64'),
            inclusion: 'ordinary',
          },
        ],
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Scoped preview unavailable');
    }
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'catch-up-start',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Scoped comparison did not start');
    }
    const beforeTree = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (beforeTree.status !== 'available') throw new Error('Initial basis tree unavailable');

    // The basis ref catches up with the compared state: the successor diff is
    // empty, and that is a valid review state rather than a rejection.
    await git(created.checkout, 'branch', '-f', 'catch-up-basis', 'HEAD');
    const emptied = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'catch-up-refresh',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    expect(emptied).toMatchObject({
      kind: 'review.change-set.refreshed',
      status: 'accepted',
      outcome: 'changed',
      stateVersion: started.stateVersion + 1,
      manifest: { totalFiles: 0 },
    });
    if (emptied.kind !== 'review.change-set.refreshed' || emptied.outcome !== 'changed') {
      throw new Error('Refresh did not produce a successor');
    }
    const afterTree = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterTree.status).toBe('available');
    if (afterTree.status !== 'available') throw new Error('Successor basis tree unavailable');
    // Refreshing Snapshot evidence is not an explicit tree fork: file churn,
    // inspection, and Snapshot lineage movement leave the basis tree untouched.
    expect(afterTree.bases.items).toEqual(beforeTree.bases.items);
    await expect(
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity: 'catch-up-refresh',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
      }),
    ).resolves.toEqual(emptied);
    await expect(
      owner.workspace.read({
        kind: 'review.bases',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toEqual(afterTree);
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({ status: 'available', header: { snapshotStatus: 'current' } });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    expect(manifest.manifest.files).toEqual([]);
  });

  it('refreshes a changed scoped comparison into exactly one successor and replays idempotently', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'selected.txt'), 'selected basis\n');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside basis\n');
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'refresh scoped basis');
    await git(created.checkout, 'branch', 'refresh-basis');
    await writeFile(path.join(created.checkout, 'selected.txt'), 'selected compared\n');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside compared\n');
    await git(created.checkout, 'commit', '-qam', 'refresh scoped compared');
    const comparedTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');

    let owner = await open(created);
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/refresh-basis',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: comparedTree,
      },
      scope: {
        kind: 'exact-paths',
        entries: [
          {
            pathBytesBase64: Buffer.from('selected.txt').toString('base64'),
            inclusion: 'ordinary',
          },
        ],
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Scoped preview unavailable');
    }
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'refresh-scoped-start',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Scoped comparison did not start');
    }
    const originalSnapshot = started.reviewSnapshotIdentity;

    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    expect(manifest.manifest.files.map(file => file.displayPath)).toEqual(['selected.txt']);

    // Out-of-scope ref movement is irrelevant by declaration: the refresh
    // reuses the latest Snapshot byte-for-byte and advances no State.
    await git(created.checkout, 'checkout', '-q', 'refresh-basis');
    await writeFile(path.join(created.checkout, 'outside.txt'), 'outside moved\n');
    await git(created.checkout, 'commit', '-qam', 'unrelated out-of-scope movement');
    await git(created.checkout, 'checkout', '-q', '-');
    const unchangedCommand = {
      kind: 'review.change-set.refresh',
      commandIdentity: 'refresh-unchanged',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: originalSnapshot,
    } as const;
    const unchanged = await owner.workspace.execute(unchangedCommand);
    expect(unchanged).toMatchObject({
      kind: 'review.change-set.refreshed',
      status: 'accepted',
      outcome: 'unchanged',
      stateVersion: started.stateVersion,
      changeSetIdentity: started.changeSetIdentity,
      reviewSnapshotIdentity: originalSnapshot,
      manifest: { totalFiles: 1 },
    });
    await expect(owner.workspace.execute(unchangedCommand)).resolves.toEqual(unchanged);

    // Freeze the original Snapshot bytes before the successor commit.
    await owner.dispose();
    owners.delete(owner);
    const workspaceIdentity = owner.workspaceIdentity;
    let state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const frozen = await state.read({
      recordIdentities: [originalSnapshot],
      includeContent: true,
    });
    const frozenSnapshotRecord = frozen.records[0];
    if (frozenSnapshotRecord === undefined) {
      throw new Error('Original Snapshot record unavailable');
    }
    await state.close();
    owner = await open(created);

    await git(created.checkout, 'checkout', '-q', 'refresh-basis');
    await writeFile(path.join(created.checkout, 'selected.txt'), 'selected moved\n');
    await git(created.checkout, 'commit', '-qam', 'in-scope selected movement');
    await git(created.checkout, 'checkout', '-q', '-');
    const changed = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'refresh-changed',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: originalSnapshot,
    });
    expect(changed).toMatchObject({
      kind: 'review.change-set.refreshed',
      status: 'accepted',
      outcome: 'changed',
      stateVersion: started.stateVersion + 1,
      changeSetIdentity: started.changeSetIdentity,
      previousReviewSnapshotIdentity: originalSnapshot,
      manifest: { totalFiles: 1 },
    });
    if (changed.kind !== 'review.change-set.refreshed') {
      throw new Error('Refresh did not produce a successor');
    }
    expect(changed.reviewSnapshotIdentity).not.toBe(originalSnapshot);

    await expect(
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity: 'refresh-changed',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedReviewSnapshotIdentity: originalSnapshot,
      }),
    ).resolves.toEqual(changed);

    const versions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versions).toMatchObject({
      status: 'available',
      versions: {
        total: 2,
        items: [
          { reviewSnapshotIdentity: changed.reviewSnapshotIdentity },
          { reviewSnapshotIdentity: originalSnapshot },
        ],
      },
    });
    const successorManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(successorManifest).toMatchObject({
      status: 'available',
      header: {
        reviewSnapshotIdentity: changed.reviewSnapshotIdentity,
        version: { ordinal: 2, total: 2, isLatest: true },
        snapshotStatus: 'current',
        comparison: { scope: selection.scope },
      },
      manifest: { totalFiles: 1 },
    });
    // The prior Snapshot version stays complete and readable after refresh.
    const originalManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: originalSnapshot,
      offset: 0,
      limit: 64,
    });
    expect(originalManifest).toMatchObject({
      status: 'available',
      header: {
        reviewSnapshotIdentity: originalSnapshot,
        version: { ordinal: 1, total: 2, isLatest: false },
      },
      manifest: { totalFiles: 1 },
    });

    await owner.dispose();
    owners.delete(owner);
    state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const after = await state.read({
      recordIdentities: [originalSnapshot],
      includeContent: true,
    });
    expect(after.records[0]?.payload).toEqual(frozenSnapshotRecord.payload);
    expect(after.records[0]?.content).toEqual(frozenSnapshotRecord.content);
    await state.close();

    // Restart replay recalls the identical committed successor.
    owner = await open(created);
    await expect(
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity: 'refresh-changed',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedReviewSnapshotIdentity: originalSnapshot,
      }),
    ).resolves.toEqual(changed);
    await owner.dispose();
    owners.delete(owner);
  }, 30_000);

  it('rejects refresh with closed diagnostics and never advances State', async () => {
    const created = await fixture(true);
    const owner = await open(created);

    // Non-comparison Change Sets never refresh.
    const current = await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'refresh-diag-current',
      expectedStateVersion: 0,
    });
    if (current.kind !== 'review.current-changes.started') {
      throw new Error('Current changes review did not start');
    }
    const refresh = (
      commandIdentity: string,
      over: {
        readonly reviewIdentity?: string;
        readonly expectedReviewSnapshotIdentity?: string;
        readonly expectedStateVersion?: number;
      } = {},
    ) =>
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity,
        expectedStateVersion: over.expectedStateVersion ?? current.stateVersion,
        reviewIdentity: (over.reviewIdentity ?? current.reviewIdentity) as never,
        expectedReviewSnapshotIdentity: (over.expectedReviewSnapshotIdentity ??
          current.reviewSnapshotIdentity) as never,
      });
    await expect(refresh('refresh-non-comparison')).resolves.toMatchObject({
      status: 'rejected',
      reason: 'change-set-refresh-unsupported',
      stateVersion: current.stateVersion,
    });
    await expect(
      refresh('refresh-wrong-snapshot', {
        expectedReviewSnapshotIdentity: `rsn_${'9'.repeat(64)}`,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'review-snapshot-identity-mismatch',
    });
    await expect(
      refresh('refresh-missing-review', {
        reviewIdentity: `rev_${'8'.repeat(64)}`,
      }),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'review-not-found' });
    await expect(
      refresh('refresh-stale-version', {
        expectedStateVersion: current.stateVersion + 7,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'state-version-mismatch',
    });

    // Frozen historical convenience selections never refresh either.
    const basisCommit = await git(created.checkout, 'rev-parse', 'HEAD');
    const convenience = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'refresh-diag-convenience',
      expectedStateVersion: current.stateVersion,
      selection: { kind: 'last-commit' },
      expectedBasisObjectIdentity: null,
      expectedComparedObjectIdentity: basisCommit,
    });
    if (convenience.kind !== 'review.comparison.started') {
      throw new Error('Convenience comparison did not start');
    }
    await expect(
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity: 'refresh-convenience',
        expectedStateVersion: convenience.stateVersion,
        reviewIdentity: convenience.reviewIdentity,
        expectedReviewSnapshotIdentity: convenience.reviewSnapshotIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'change-set-refresh-unsupported',
    });

    // A non-current Review phase is rejected without advancing State.
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(home.header.currentReviewIdentity).toBe(convenience.reviewIdentity);
    await expect(
      refresh('refresh-not-current', {
        expectedStateVersion: convenience.stateVersion,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'review-not-current',
      stateVersion: convenience.stateVersion,
    });
  });

  it('rejects unresolvable refresh intent and a full bounded lineage', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'selected.txt'), 'basis\n');
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'lineage basis');
    await git(created.checkout, 'branch', 'lineage-basis');
    await writeFile(path.join(created.checkout, 'selected.txt'), 'compared\n');
    await git(created.checkout, 'commit', '-qam', 'lineage compared');
    const comparedTree = await git(created.checkout, 'rev-parse', 'HEAD^{tree}');

    let owner = await open(created);
    const selection = {
      kind: 'revision-pair',
      basis: {
        kind: 'local-ref',
        objectKind: 'tree',
        reference: 'refs/heads/lineage-basis',
      },
      compared: {
        kind: 'object',
        objectKind: 'tree',
        objectIdentity: comparedTree,
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Lineage preview unavailable');
    }
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'lineage-comparison-start',
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Lineage comparison did not start');
    }
    const startedStateVersion = started.stateVersion;
    const startedSnapshot = started.reviewSnapshotIdentity;
    const basisTarget = await git(created.checkout, 'rev-parse', 'refs/heads/lineage-basis');

    // Unresolvable intent: the dynamic basis ref vanished.
    await git(created.checkout, 'update-ref', '-d', 'refs/heads/lineage-basis');
    const unresolvable = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'refresh-unresolvable',
      expectedStateVersion: startedStateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: startedSnapshot,
    });
    expect(unresolvable).toMatchObject({
      status: 'rejected',
      reason: 'comparison-not-found',
      stateVersion: startedStateVersion,
    });

    // Fill the bounded lineage exactly to the limit with synthetic priors.
    await owner.dispose();
    owners.delete(owner);
    const workspaceIdentity = owner.workspaceIdentity;
    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const read = await state.read({
      recordIdentities: [indexIdentity],
      includeContent: false,
    });
    const indexRecord = read.records[0];
    if (indexRecord === undefined || indexRecord.recordClass !== 'revisioned' || indexRecord.kind !== 'review.index') {
      throw new Error('Review index unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const synthetic = Array.from(
      { length: MAX_REVIEW_SNAPSHOTS - 1 },
      (_, ordinal) => `rsn_${ordinal.toString(16).padStart(4, '0')}${'b'.repeat(60)}` as ReviewSnapshotIdentity,
    );
    const nextIndex = {
      ...index,
      reviews: index.reviews.map(entry =>
        entry.reviewIdentity === started.reviewIdentity
          ? {
              ...entry,
              reviewSnapshotIdentities: [...synthetic, startedSnapshot],
            }
          : entry,
      ),
    };
    const committed = await state.commit({
      commandIdentity: 'install-full-lineage-fixture',
      expectedStateVersion: read.stateVersion,
      records: [
        {
          recordClass: 'revisioned' as const,
          recordIdentity: indexIdentity,
          workflowIdentity: indexIdentity,
          kind: 'review.index',
          schemaVersion: 1,
          expectedRevision: indexRecord.revision,
          payload: new TextEncoder().encode(JSON.stringify(nextIndex)),
          content: [],
        },
      ],
      result: {
        kind: 'test.full-lineage-installed',
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      },
    });
    if (!('result' in committed)) {
      throw new Error(`Full lineage fixture commit failed: ${committed.reason}`);
    }
    await state.close();

    owner = await open(created);
    // In-scope committed movement on the restored basis ref makes the
    // retained intent stale while the synthetic lineage is already full.
    await git(created.checkout, 'update-ref', 'refs/heads/lineage-basis', basisTarget);
    await git(created.checkout, 'checkout', '-q', 'lineage-basis');
    await writeFile(path.join(created.checkout, 'selected.txt'), 'changed\n');
    await git(created.checkout, 'commit', '-qam', 'lineage in-scope movement');
    await git(created.checkout, 'checkout', '-q', '-');
    await expect(
      owner.workspace.execute({
        kind: 'review.change-set.refresh',
        commandIdentity: 'refresh-full-lineage',
        expectedStateVersion: committed.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedReviewSnapshotIdentity: startedSnapshot,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'change-set-lineage-limit-reached',
      stateVersion: committed.stateVersion,
    });
  }, 30_000);

  it('binds previewed index evidence and retains it across restart and index movement', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'review.txt'), 'staged value\n');
    await git(created.checkout, 'add', 'review.txt');
    const basisCommit = await git(created.checkout, 'rev-parse', 'HEAD');
    const stagedOid = (await git(created.checkout, 'hash-object', '-w', 'review.txt')).trim();

    let owner = await open(created);
    const selection = {
      kind: 'revision-to-index',
      basis: {
        kind: 'object',
        objectKind: 'commit',
        objectIdentity: basisCommit,
      },
    } as const;
    const preview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    expect(preview).toMatchObject({
      status: 'available',
      basis: { kind: 'commit', objectIdentity: basisCommit },
      comparedState: {
        kind: 'index',
        selector: 'index',
        indexFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      action: {
        availability: 'direct',
        gateBasis: {
          expectedStateVersion: 0,
          targetIdentities: [expect.stringMatching(/^rcp_[0-9a-f]{64}$/u)],
        },
      },
    });
    if (preview.status !== 'available') throw new Error('Preview unavailable');
    if (preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Preview resolution identity missing');
    }

    const startCommand = {
      kind: 'review.comparison.start',
      commandIdentity: 'index-comparison-review',
      expectedStateVersion: preview.stateVersion,
      selection,
      expectedBasisObjectIdentity: basisCommit,
      expectedComparedObjectIdentity: reviewComparisonEndpointIdentity(preview.comparedState) ?? '',
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    } as const;
    const started = await owner.workspace.execute(startCommand);
    expect(started).toMatchObject({
      kind: 'review.comparison.started',
      status: 'accepted',
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error('Index comparison start failed');
    }

    const readManifest = async (): Promise<
      Extract<Awaited<ReturnType<Workspace['read']>>, { readonly kind: 'review.manifest' }>
    > =>
      await owner.workspace.read({
        kind: 'review.manifest',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      });
    expect(await readManifest()).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });

    // Preview/start race: moving the index between preview and start rejects
    // instead of silently changing any endpoint.
    const racingPreview = await owner.workspace.read({
      kind: 'review.comparison-preview',
      selection,
    });
    if (racingPreview.status !== 'available') {
      throw new Error('Racing preview unavailable');
    }
    if (racingPreview.comparisonResolutionIdentity === undefined) {
      throw new Error('Racing preview resolution identity missing');
    }
    await writeFile(path.join(created.checkout, 'review.txt'), 'raced\n');
    await git(created.checkout, 'add', 'review.txt');
    await expect(
      owner.workspace.execute({
        kind: 'review.comparison.start',
        commandIdentity: 'index-comparison-race',
        expectedStateVersion: racingPreview.stateVersion,
        selection,
        expectedBasisObjectIdentity: basisCommit,
        expectedComparedObjectIdentity: reviewComparisonEndpointIdentity(racingPreview.comparedState) ?? '',
        expectedComparisonResolutionIdentity: racingPreview.comparisonResolutionIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'rejected',
      reason: 'comparison-changed',
    });

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    expect(await readManifest()).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'stale' },
    });

    const restoredOid = (await git(created.checkout, 'hash-object', '-w', 'review.txt')).trim();
    void restoredOid;
    await git(created.checkout, 'update-index', '--add', '--cacheinfo', `100644,${stagedOid},review.txt`);
    expect(await readManifest()).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });

    await git(created.checkout, 'reset', '-q', 'HEAD', '--', 'review.txt');
    await writeFile(path.join(created.checkout, 'review.txt'), 'staged value\n');
    await git(created.checkout, 'add', 'review.txt');
    expect(await readManifest()).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'current' },
    });
    await expect(owner.workspace.execute(startCommand)).resolves.toEqual(started);
  });

  it('atomically continues a frozen range from an explicitly chosen current HEAD', async () => {
    const created = await fixture(false);
    await writeFile(path.join(created.checkout, 'review.txt'), 'range endpoint\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'range endpoint');
    const savedEndpoint = await git(created.checkout, 'rev-parse', 'HEAD');
    const rangeBasis = await git(created.checkout, 'rev-parse', 'HEAD^');

    let owner = await open(created);
    const rangeResult = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'continuation-range-review',
      expectedStateVersion: 0,
      selection: { kind: 'commit-to-head', revision: rangeBasis },
      expectedBasisObjectIdentity: rangeBasis,
      expectedComparedObjectIdentity: savedEndpoint,
    });
    expect(rangeResult.kind).toBe('review.comparison.started');
    if (rangeResult.kind !== 'review.comparison.started') {
      throw new Error('Fixed range Review failed');
    }
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historical = await installHistoricalActiveReview(created, workspaceIdentity, rangeResult);
    owner = await open(created);
    const frozenBefore = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: rangeResult.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (frozenBefore.status !== 'available') {
      throw new Error('Fixed range manifest unavailable');
    }
    const frozenFile = frozenBefore.manifest.files[0];
    if (frozenFile === undefined) throw new Error('Fixed range file unavailable');
    const frozenDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: rangeResult.reviewIdentity,
      fileIdentity: frozenFile.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (frozenDiff.status !== 'available') {
      throw new Error('Fixed range Diff unavailable');
    }
    const anchoredRowLocal = frozenDiff.window.rows.findIndex(row => row.newLine !== undefined);
    const anchoredRow = frozenDiff.window.rows[anchoredRowLocal];
    if (anchoredRow?.newLine === undefined || anchoredRowLocal < 0) {
      throw new Error('Fixed range new-side row unavailable');
    }
    const drafted = await owner.workspace.execute({
      kind: 'review.question-draft.create',
      commandIdentity: 'continuation-range-question-draft',
      expectedStateVersion: historical.stateVersion,
      reviewIdentity: rangeResult.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: frozenFile.fileIdentity,
        fileAbsolute: 0,
        rowIdentity: anchoredRow.rowIdentity,
        rowAbsolute: frozenDiff.window.offset + anchoredRowLocal,
        side: 'new',
        line: anchoredRow.newLine,
      },
      body: 'This Question belongs only to the frozen range.',
    });
    if (drafted.kind !== 'review.question-draft.created') {
      throw new Error('Fixed range Draft failed');
    }
    expect(drafted.anchor).toMatchObject({
      fileAbsolute: 0,
      rowIdentity: anchoredRow.rowIdentity,
      rowAbsolute: frozenDiff.window.offset + anchoredRowLocal,
    });
    const committedQuestion = await owner.workspace.execute({
      kind: 'review.question-batch.commit',
      commandIdentity: 'continuation-range-question',
      expectedStateVersion: drafted.stateVersion,
      reviewIdentity: rangeResult.reviewIdentity,
      draftIdentities: [drafted.draftIdentity],
    });
    if (committedQuestion.kind !== 'review.question-batch.committed') {
      throw new Error('Fixed range Question failed');
    }
    const legacyDraft = await owner.workspace.execute({
      kind: 'review.question-draft.create',
      commandIdentity: 'continuation-coordinate-free-draft',
      expectedStateVersion: committedQuestion.stateVersion,
      reviewIdentity: rangeResult.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: frozenFile.fileIdentity,
        side: 'new',
        line: anchoredRow.newLine,
      },
      body: 'This compatibility Question has no saved presentation coordinates.',
    });
    if (legacyDraft.kind !== 'review.question-draft.created') {
      throw new Error('Coordinate-free Draft failed');
    }
    const legacyQuestion = await owner.workspace.execute({
      kind: 'review.question-batch.commit',
      commandIdentity: 'continuation-coordinate-free-question',
      expectedStateVersion: legacyDraft.stateVersion,
      reviewIdentity: rangeResult.reviewIdentity,
      draftIdentities: [legacyDraft.draftIdentity],
    });
    if (legacyQuestion.kind !== 'review.question-batch.committed') {
      throw new Error('Coordinate-free Question failed');
    }
    const located = await owner.workspace.read({
      kind: 'review.question-location',
      reviewIdentity: rangeResult.reviewIdentity,
      itemIdentity: legacyQuestion.questionIdentities[0]!,
    });
    expect(located).toMatchObject({
      status: 'available',
      target: {
        fileIdentity: frozenFile.fileIdentity,
        fileAbsolute: 0,
        rowIdentity: anchoredRow.rowIdentity,
        rowAbsolute: frozenDiff.window.offset + anchoredRowLocal,
        side: 'new',
        line: anchoredRow.newLine,
      },
    });

    await writeFile(path.join(created.checkout, 'review.txt'), 'new head\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'head moved');
    const currentHead = await git(created.checkout, 'rev-parse', 'HEAD');
    await writeFile(path.join(created.checkout, 'review.txt'), 'working live\n');

    const continuation = await owner.workspace.read({
      kind: 'review.continuation',
      reviewIdentity: rangeResult.reviewIdentity,
    });
    expect(continuation).toMatchObject({
      status: 'available',
      reviewIdentity: rangeResult.reviewIdentity,
      sourceReviewSnapshotIdentity: rangeResult.reviewSnapshotIdentity,
      savedEndpoint: { objectIdentity: savedEndpoint },
      currentHead: { objectIdentity: currentHead },
      headMoved: true,
      currentHeadAction: { availability: 'direct' },
      savedEndpointChoice: {
        kind: 'review.comparison.continue-composite',
        status: 'separate-intent',
      },
    });
    if (continuation.status !== 'available') {
      throw new Error('Continuation unavailable');
    }

    await writeFile(path.join(created.checkout, 'review.txt'), 'working moved\n');
    const raced = await owner.workspace.execute({
      kind: 'review.comparison.continue-live',
      commandIdentity: 'raced-range-continuation',
      expectedStateVersion: continuation.stateVersion,
      reviewIdentity: continuation.reviewIdentity,
      expectedReviewSnapshotIdentity: continuation.sourceReviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: continuation.savedEndpoint.objectIdentity,
      expectedCurrentHeadObjectIdentity: continuation.currentHead.objectIdentity,
      expectedLiveChangesIdentity: continuation.liveChangesIdentity,
    });
    expect(raced).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'continuation-generation-changed',
      stateVersion: continuation.stateVersion,
    });
    const afterRace = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(afterRace.header.currentReviewIdentity).toBe(rangeResult.reviewIdentity);
    expect(afterRace.header.totalReviews).toBe(1);

    const refreshed = await owner.workspace.read({
      kind: 'review.continuation',
      reviewIdentity: rangeResult.reviewIdentity,
    });
    if (refreshed.status !== 'available') {
      throw new Error('Refreshed continuation unavailable');
    }
    const continued = await owner.workspace.execute({
      kind: 'review.comparison.continue-live',
      commandIdentity: 'accepted-range-continuation',
      expectedStateVersion: refreshed.stateVersion,
      reviewIdentity: refreshed.reviewIdentity,
      expectedReviewSnapshotIdentity: refreshed.sourceReviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: refreshed.savedEndpoint.objectIdentity,
      expectedCurrentHeadObjectIdentity: refreshed.currentHead.objectIdentity,
      expectedLiveChangesIdentity: refreshed.liveChangesIdentity,
    });
    expect(continued).toMatchObject({
      kind: 'review.comparison.continued-live',
      status: 'accepted',
      sourceReviewIdentity: rangeResult.reviewIdentity,
    });
    if (continued.kind !== 'review.comparison.continued-live') {
      throw new Error('Range continuation failed');
    }

    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(home.currentReview).toMatchObject({
      reviewIdentity: continued.reviewIdentity,
      continuedFromReviewIdentity: rangeResult.reviewIdentity,
      questions: 0,
    });
    expect(home.reviews.items).toEqual([
      expect.objectContaining({
        reviewIdentity: rangeResult.reviewIdentity,
        retention: 'previous',
        questions: 2,
      }),
    ]);
    const frozenAfter = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: rangeResult.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(frozenAfter).toEqual({
      ...frozenBefore,
      stateVersion: continued.stateVersion,
      header: {
        ...frozenBefore.header,
        retention: 'previous',
        snapshotStatus: 'stale',
      },
      questions: {
        openDrafts: 0,
        total: 2,
        needingJudgment: 2,
        open: 0,
      },
    });
    const currentManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: continued.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(currentManifest).toMatchObject({
      status: 'available',
      header: {
        title: 'Review current changes',
        continuedFromReviewIdentity: rangeResult.reviewIdentity,
      },
    });

    expect(await git(created.checkout, 'rev-parse', 'HEAD')).toBe(currentHead);
    expect(await git(created.checkout, 'status', '--porcelain')).toContain('review.txt');

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const reconstructed = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(reconstructed.currentReview).toMatchObject({
      reviewIdentity: continued.reviewIdentity,
      continuedFromReviewIdentity: rangeResult.reviewIdentity,
      questions: 0,
    });
    expect(reconstructed.reviews.items[0]).toMatchObject({
      reviewIdentity: rangeResult.reviewIdentity,
      questions: 2,
    });
    const recalled = await owner.workspace.execute({
      kind: 'review.comparison.continue-live',
      commandIdentity: 'accepted-range-continuation',
      expectedStateVersion: refreshed.stateVersion,
      reviewIdentity: refreshed.reviewIdentity,
      expectedReviewSnapshotIdentity: refreshed.sourceReviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: refreshed.savedEndpoint.objectIdentity,
      expectedCurrentHeadObjectIdentity: refreshed.currentHead.objectIdentity,
      expectedLiveChangesIdentity: refreshed.liveChangesIdentity,
    });
    expect(recalled).toEqual(continued);
  }, 30_000);
});
