import { rm, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type {
  ReviewContextSelectionChanged,
  ReviewIdentity,
  ReviewSnapshotContextItem,
  ReviewSnapshotIdentity,
} from '@buildframe/workspace/reviewing';
import type { Workspace } from '../../src/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { encoded, fixture, git, requireSelection, type Fixture } from './workspaceReviewContextRevalidationFixture.js';
import { itOnPosix } from '../platformCases.js';

describe('Review supporting-context revalidation and refresh', () => {
  const roots = new Set<string>();
  const owners = new Set<WorkspaceRuntimeOwner>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    const opened = await openWorkspaceRuntimeOwner({ startPath: created.checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
    owners.add(opened.owner);
    return opened.owner;
  }

  async function start(
    owner: WorkspaceRuntimeOwner,
    created: Fixture,
    commandIdentity: string,
    basisEndpoint: { kind: 'object'; objectIdentity: string } | { kind: 'local-ref'; reference: string } = {
      kind: 'object',
      objectIdentity: created.basis,
    },
  ): Promise<{
    readonly reviewIdentity: ReviewIdentity;
    readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    readonly stateVersion: number;
  }> {
    const selection =
      basisEndpoint.kind === 'object'
        ? ({
            kind: 'revision-pair',
            basis: { kind: 'object', objectKind: 'commit', objectIdentity: basisEndpoint.objectIdentity },
            compared: { kind: 'object', objectKind: 'commit', objectIdentity: created.compared },
          } as const)
        : ({
            kind: 'revision-pair',
            basis: { kind: 'local-ref', objectKind: 'commit', reference: basisEndpoint.reference },
            compared: { kind: 'object', objectKind: 'commit', objectIdentity: created.compared },
          } as const);
    const preview = await owner.workspace.read({ kind: 'review.comparison-preview', selection });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Exact comparison preview unavailable');
    }
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity,
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error(`Review did not start: ${JSON.stringify(started)}`);
    }
    return started;
  }

  async function select(
    owner: WorkspaceRuntimeOwner,
    reviewIdentity: ReviewIdentity,
    commandIdentity: string,
    expectedStateVersion: number,
    expectedSelectionRevision: number,
    change: Record<string, unknown>,
  ): Promise<ReviewContextSelectionChanged> {
    const result = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity,
      expectedStateVersion,
      reviewIdentity,
      expectedSelectionRevision,
      change,
    } as Parameters<Workspace['execute']>[0]);
    return requireSelection(result);
  }

  async function contextRefresh(
    owner: WorkspaceRuntimeOwner,
    reviewIdentity: ReviewIdentity,
    commandIdentity: string,
    expectedStateVersion: number,
    reviewSnapshotIdentity: ReviewSnapshotIdentity,
  ): Promise<Awaited<ReturnType<Workspace['execute']>>> {
    return await owner.workspace.execute({
      kind: 'review.context.refresh',
      commandIdentity,
      expectedStateVersion,
      reviewIdentity,
      expectedReviewSnapshotIdentity: reviewSnapshotIdentity,
    });
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('derives exact stale reasons from additions and byte movement, ignores excluded movement, and commits one coherent context successor', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = await start(owner, created, 'revalidate-start');

    const includeDirectory = await select(
      owner,
      started.reviewIdentity,
      'revalidate-include',
      started.stateVersion,
      0,
      {
        action: 'include',
        source: { kind: 'workspace', form: 'directory', inclusion: 'ordinary', pathBytesBase64: encoded('ctx') },
      },
    );
    const excludeFile = await select(
      owner,
      started.reviewIdentity,
      'revalidate-exclude',
      includeDirectory.stateVersion,
      includeDirectory.selectionRevision,
      {
        action: 'exclude',
        target: { kind: 'workspace', form: 'file', pathBytesBase64: encoded('ctx/excluded.txt') },
      },
    );

    // Freeze the initial basis through the context-only refresh command.
    const frozen = await contextRefresh(
      owner,
      started.reviewIdentity,
      'revalidate-freeze',
      excludeFile.stateVersion,
      started.reviewSnapshotIdentity,
    );
    expect(frozen).toMatchObject({
      kind: 'review.context.refreshed',
      status: 'accepted',
      outcome: 'changed',
      previousReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    if (frozen.kind !== 'review.context.refreshed') throw new Error('Context freeze failed');
    expect(frozen.delta).toEqual({ selectionChanged: true, verdicts: [] });

    // Nothing moved: the observation reuses the latest Snapshot, advances no State,
    // and replays identically.
    const unchangedCommand = {
      kind: 'review.context.refresh',
      commandIdentity: 'revalidate-unchanged',
      expectedStateVersion: frozen.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
    } as const;
    const unchanged = await owner.workspace.execute(unchangedCommand);
    expect(unchanged).toMatchObject({
      kind: 'review.context.refreshed',
      status: 'accepted',
      outcome: 'unchanged',
      stateVersion: frozen.stateVersion,
      reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      delta: { selectionChanged: false, verdicts: [] },
    });
    await expect(owner.workspace.execute(unchangedCommand)).resolves.toEqual(unchanged);

    // Movement under the effective exclusion is irrelevant; included movement and
    // additions beneath the included directory are exactly named.
    await writeFile(path.join(created.checkout, 'ctx', 'direct.txt'), 'MUTATED\n');
    await writeFile(path.join(created.checkout, 'ctx', 'excluded.txt'), 'moved-under-exclusion\n');
    await writeFile(path.join(created.checkout, 'ctx', 'added.txt'), 'brand-new\n');

    const staleHeader = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(staleHeader).toMatchObject({
      status: 'available',
      header: { snapshotStatus: 'stale', contextStatus: 'stale' },
    });

    const changed = await contextRefresh(
      owner,
      started.reviewIdentity,
      'revalidate-changed',
      frozen.stateVersion,
      frozen.reviewSnapshotIdentity,
    );
    expect(changed).toMatchObject({
      kind: 'review.context.refreshed',
      status: 'accepted',
      outcome: 'changed',
      previousReviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      // The frozen Change Set evidence is reused: the comparison manifest is identical.
      manifest: frozen.manifest,
    });
    if (changed.kind !== 'review.context.refreshed') throw new Error('Context successor failed');
    expect(changed.delta.selectionChanged).toBe(false);
    const movedPaths = changed.delta.verdicts.map(verdict =>
      verdict.pathBytesBase64 === undefined
        ? verdict.absolutePath
        : Buffer.from(verdict.pathBytesBase64, 'base64').toString('utf8'),
    );
    expect(movedPaths).toContain('ctx/direct.txt');
    expect(movedPaths).toContain('ctx/added.txt');
    expect(movedPaths).not.toContain('ctx/excluded.txt');
    expect(
      changed.delta.verdicts.find(verdict => verdict.pathBytesBase64 === encoded('ctx/direct.txt'))?.currency,
    ).toBe('changed');
    expect(changed.delta.verdicts.find(verdict => verdict.pathBytesBase64 === encoded('ctx/added.txt'))?.currency).toBe(
      'added',
    );

    // The successor freezes the moved and added bytes; the prior Snapshot is untouched.
    const successor = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: changed.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (successor.status !== 'available' || successor.basis.status !== 'frozen') {
      throw new Error('Successor context unavailable');
    }
    const successorPaths = successor.basis.context
      ? successor.manifest.items
          .filter(item => item.kind === 'locator' && item.decision.status === 'included')
          .map(item =>
            Buffer.from((item as { source: { pathBytesBase64: string } }).source.pathBytesBase64, 'base64').toString(
              'utf8',
            ),
          )
      : [];
    expect(successorPaths).toContain('ctx/added.txt');

    const currentHeader = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(currentHeader).toMatchObject({
      status: 'available',
      header: {
        snapshotStatus: 'current',
        contextStatus: 'current',
        reviewSnapshotIdentity: changed.reviewSnapshotIdentity,
      },
    });

    // Replay of the changed command recalls the identical committed successor.
    await expect(
      owner.workspace.execute({
        kind: 'review.context.refresh',
        commandIdentity: 'revalidate-changed',
        expectedStateVersion: frozen.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedReviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      }),
    ).resolves.toEqual(changed);
  });

  it('pins one exact prior occurrence: frozen bytes survive source change and deletion, and pinned movement never stales', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = await start(owner, created, 'pin-start');

    const includeDirectory = await select(owner, started.reviewIdentity, 'pin-include', started.stateVersion, 0, {
      action: 'include',
      source: { kind: 'workspace', form: 'directory', inclusion: 'ordinary', pathBytesBase64: encoded('ctx') },
    });
    const frozen = await contextRefresh(
      owner,
      started.reviewIdentity,
      'pin-freeze',
      includeDirectory.stateVersion,
      started.reviewSnapshotIdentity,
    );
    if (frozen.kind !== 'review.context.refreshed' || frozen.outcome !== 'changed') {
      throw new Error('Pin freeze failed');
    }

    const frozenView = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (frozenView.status !== 'available' || frozenView.basis.status !== 'frozen') {
      throw new Error('Frozen context unavailable');
    }
    const directItem = frozenView.manifest.items.find(
      (item): item is Extract<ReviewSnapshotContextItem, { kind: 'locator' }> =>
        item.kind === 'locator' &&
        item.decision.status === 'included' &&
        item.source.pathBytesBase64 === encoded('ctx/direct.txt'),
    );
    if (directItem === undefined) throw new Error('Frozen direct.txt occurrence missing');

    const pinned = await select(
      owner,
      started.reviewIdentity,
      'pin-rule',
      frozen.stateVersion,
      includeDirectory.selectionRevision,
      {
        action: 'pin',
        target: { kind: 'workspace', form: 'file', inclusion: 'ordinary', pathBytesBase64: encoded('ctx/direct.txt') },
        reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
        itemIdentity: directItem.itemIdentity,
      },
    );
    const pinnedFrozen = await contextRefresh(
      owner,
      started.reviewIdentity,
      'pin-successor',
      pinned.stateVersion,
      frozen.reviewSnapshotIdentity,
    );
    expect(pinnedFrozen).toMatchObject({ kind: 'review.context.refreshed', outcome: 'changed' });
    if (pinnedFrozen.kind !== 'review.context.refreshed') throw new Error('Pin successor failed');

    const pinnedView = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: pinnedFrozen.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (pinnedView.status !== 'available' || pinnedView.basis.status !== 'frozen') {
      throw new Error('Pinned context unavailable');
    }
    const pinnedOccurrence = pinnedView.manifest.items.find(
      (item): item is Extract<ReviewSnapshotContextItem, { kind: 'locator' }> =>
        item.kind === 'locator' &&
        item.source.pathBytesBase64 === encoded('ctx/direct.txt') &&
        item.decision.status === 'included',
    );
    if (pinnedOccurrence === undefined) throw new Error('Pinned occurrence missing');
    expect(pinnedOccurrence.pinnedFrom).toEqual({
      reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      itemIdentity: directItem.itemIdentity,
    });
    expect(pinnedOccurrence.decision.decidingRuleIdentity).toBe(pinned.ruleIdentity);

    const pinnedContent = await owner.workspace.read({
      kind: 'review.snapshot-context-content',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: pinnedFrozen.reviewSnapshotIdentity,
      contentIdentity: pinnedOccurrence.contents[0]!.contentIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    if (pinnedContent.status !== 'available') throw new Error('Pinned bytes unavailable');
    expect(Buffer.from(pinnedContent.window.bytesBase64, 'base64').toString('utf8')).toBe('abcdefghij\n');

    // The pinned source moves and is deleted; only the live other.txt movement stales,
    // the pinned bytes stay exact, and an explicit exclude remains the distinct action.
    await writeFile(path.join(created.checkout, 'ctx', 'direct.txt'), 'rewritten-after-pin\n');
    await rm(path.join(created.checkout, 'ctx', 'other.txt'), { force: true });

    const afterMovement = await contextRefresh(
      owner,
      started.reviewIdentity,
      'pin-after-movement',
      pinnedFrozen.stateVersion,
      pinnedFrozen.reviewSnapshotIdentity,
    );
    expect(afterMovement).toMatchObject({ kind: 'review.context.refreshed', outcome: 'changed' });
    if (afterMovement.kind !== 'review.context.refreshed') throw new Error('Post-pin refresh failed');
    const movedPaths = afterMovement.delta.verdicts.map(verdict =>
      verdict.pathBytesBase64 === undefined
        ? verdict.absolutePath
        : Buffer.from(verdict.pathBytesBase64, 'base64').toString('utf8'),
    );
    expect(movedPaths).toContain('ctx/other.txt');
    expect(movedPaths).not.toContain('ctx/direct.txt');
    expect(
      afterMovement.delta.verdicts.find(verdict => verdict.pathBytesBase64 === encoded('ctx/other.txt'))?.currency,
    ).toBe('missing');

    const preserved = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: afterMovement.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (preserved.status !== 'available' || preserved.basis.status !== 'frozen') {
      throw new Error('Preserved context unavailable');
    }
    const preservedOccurrence = preserved.manifest.items.find(
      (item): item is Extract<ReviewSnapshotContextItem, { kind: 'locator' }> =>
        item.kind === 'locator' &&
        item.source.pathBytesBase64 === encoded('ctx/direct.txt') &&
        item.decision.status === 'included',
    );
    if (preservedOccurrence === undefined) throw new Error('Preserved occurrence missing');
    expect(preservedOccurrence.pinnedFrom).toBeDefined();
    const preservedContent = await owner.workspace.read({
      kind: 'review.snapshot-context-content',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: afterMovement.reviewSnapshotIdentity,
      contentIdentity: preservedOccurrence.contents[0]!.contentIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    if (preservedContent.status !== 'available') throw new Error('Preserved bytes unavailable');
    expect(Buffer.from(preservedContent.window.bytesBase64, 'base64').toString('utf8')).toBe('abcdefghij\n');
  });

  it('widens explicit refresh to fixed-intent snapshots, rejects unresolvable comparison movement, and refuses context-only refresh with nothing to refresh', async () => {
    const created = await fixture();
    await git(created.checkout, 'branch', 'moving-basis', created.basis);
    const owner = await open(created);
    // A local-ref basis is a dynamic selector, not an exact resolution: the
    // combined change-set refresh gate does not apply to it.
    const started = await start(owner, created, 'widen-start', {
      kind: 'local-ref',
      reference: 'refs/heads/moving-basis',
    });

    // Empty context and empty selection: there is nothing to refresh.
    const refused = await contextRefresh(
      owner,
      started.reviewIdentity,
      'widen-refused',
      started.stateVersion,
      started.reviewSnapshotIdentity,
    );
    expect(refused).toMatchObject({ kind: 'review.command.rejected', reason: 'change-set-refresh-unsupported' });

    await select(owner, started.reviewIdentity, 'widen-include', started.stateVersion, 0, {
      action: 'include',
      source: { kind: 'workspace', form: 'directory', inclusion: 'ordinary', pathBytesBase64: encoded('ctx') },
    });

    const frozen = await contextRefresh(
      owner,
      started.reviewIdentity,
      'widen-freeze',
      started.stateVersion + 1,
      started.reviewSnapshotIdentity,
    );
    expect(frozen).toMatchObject({ kind: 'review.context.refreshed', outcome: 'changed' });
    if (frozen.kind !== 'review.context.refreshed' || frozen.outcome !== 'changed') {
      throw new Error('Dynamic-basis context freeze failed');
    }

    await writeFile(path.join(created.checkout, 'ctx', 'direct.txt'), 'moved-under-dynamic-basis\n');
    const successor = await contextRefresh(
      owner,
      started.reviewIdentity,
      'widen-successor',
      frozen.stateVersion,
      frozen.reviewSnapshotIdentity,
    );
    expect(successor).toMatchObject({ kind: 'review.context.refreshed', outcome: 'changed' });
    if (successor.kind !== 'review.context.refreshed') throw new Error('Dynamic-basis successor failed');
    expect(successor.manifest).toEqual(frozen.manifest);

    // Once the comparison itself moves, context-only refresh rejects and the
    // combined refresh stays the single coherent route for joint movement.
    await git(created.checkout, 'checkout', '-q', 'moving-basis');
    await writeFile(path.join(created.checkout, 'review.txt'), 'basis moved\n');
    await git(created.checkout, 'commit', '-qam', 'basis movement');
    await git(created.checkout, 'checkout', '-q', '-');
    const rejected = await contextRefresh(
      owner,
      started.reviewIdentity,
      'widen-comparison-moved',
      successor.stateVersion,
      successor.reviewSnapshotIdentity,
    );
    expect(rejected).toMatchObject({ kind: 'review.command.rejected', reason: 'snapshot-stale' });
  });

  // Windows files have no executable bit, so a mode never moves there.
  itOnPosix(
    'derives mode movement as an exact changed verdict and keeps the immutable successor lineage duplicate-free across restart',
    async () => {
      const created = await fixture();
      let owner = await open(created);
      const started = await start(owner, created, 'mode-start');

      const includeDirectory = await select(owner, started.reviewIdentity, 'mode-include', started.stateVersion, 0, {
        action: 'include',
        source: { kind: 'workspace', form: 'directory', inclusion: 'ordinary', pathBytesBase64: encoded('ctx') },
      });
      const frozen = await contextRefresh(
        owner,
        started.reviewIdentity,
        'mode-freeze',
        includeDirectory.stateVersion,
        started.reviewSnapshotIdentity,
      );
      if (frozen.kind !== 'review.context.refreshed' || frozen.outcome !== 'changed') {
        throw new Error('Mode freeze failed');
      }

      await chmod(path.join(created.checkout, 'ctx', 'direct.txt'), 0o755);
      await git(created.checkout, 'add', 'ctx/direct.txt');
      const moved = await contextRefresh(
        owner,
        started.reviewIdentity,
        'mode-moved',
        frozen.stateVersion,
        frozen.reviewSnapshotIdentity,
      );
      expect(moved).toMatchObject({ kind: 'review.context.refreshed', outcome: 'changed' });
      if (moved.kind !== 'review.context.refreshed') throw new Error('Mode successor failed');
      const movedVerdict = moved.delta.verdicts.find(verdict => verdict.pathBytesBase64 === encoded('ctx/direct.txt'));
      expect(movedVerdict?.currency).toBe('changed');

      // Restart, then prove the lineage holds exactly two successors with no duplicates.
      await owner.dispose();
      owners.delete(owner);
      owner = await open(created);
      const versions = await owner.workspace.read({
        kind: 'review.versions',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      });
      if (versions.status !== 'available') throw new Error('Versions unavailable');
      const lineage = versions.versions.items.map(item => item.reviewSnapshotIdentity);
      expect(lineage).toEqual([
        moved.reviewSnapshotIdentity,
        frozen.reviewSnapshotIdentity,
        started.reviewSnapshotIdentity,
      ]);
      expect(new Set(lineage).size).toBe(lineage.length);
    },
  );
});
