import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openAuthoritativeState } from '../../src/authoritativeState.js';
import {
  decodeReviewingPayload,
  parseReviewIndex,
  parseReviewSnapshot,
  reviewMessageIdentity,
  reviewMessageMaterialIdentity,
  reviewingRecordIdentity,
  type ReviewResponseIdentity,
} from '../../src/reviewing/index.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import {
  fixture,
  open,
  requireStarted,
  owners,
  git,
  installWorkspaceReviewingHygiene,
} from './workspaceReviewingScenarios.js';

installWorkspaceReviewingHygiene();

describe('direct retained Reviewing basis and starts', () => {
  it('starts an empty-diff review on a clean checkout and keeps it current', async () => {
    const created = await fixture(false);
    const owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'clean-checkout-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    expect(started.stateVersion).toBe(home.stateVersion + 1);
    const after = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(after.header.currentReviewIdentity).toBe(started.reviewIdentity);
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({ status: 'available', header: { snapshotStatus: 'current' } });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    expect(manifest.manifest.files).toEqual([]);
    // Deterministic replay: the same command identity re-derives the same
    // accepted result without advancing State again.
    await expect(
      owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'clean-checkout-start',
        expectedStateVersion: home.stateVersion,
      }),
    ).resolves.toEqual(started);
  });

  it('records one live basis and automatically lists uncaptured Git commits without fabricating a fork', async () => {
    const created = await fixture(false);
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'basis-tree-start',
        expectedStateVersion: 0,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(bases).toMatchObject({
      status: 'available',
      stateVersion: started.stateVersion,
      gitDiscovery: { status: 'available', truncated: false },
    });
    if (bases.status !== 'available') throw new Error('Basis tree unavailable');
    expect(bases.bases.items[0]).toMatchObject({
      kind: 'live',
      depth: 0,
      source: { kind: 'live-working-diff' },
      capture: { status: 'live' },
    });
    const [live] = bases.bases.items;
    expect(live?.reviewBasisIdentity).toBe(bases.liveReviewBasisIdentity);
    expect(bases.bases.items.some(item => item.capture.status === 'captured')).toBe(false);
    expect(
      bases.bases.items.find(item => item.kind === 'git-commit' && item.capture.status === 'capture-on-open'),
    ).toMatchObject({
      parentReviewBasisIdentity: bases.liveReviewBasisIdentity,
      depth: 1,
      source: { commit: { subject: 'basis' } },
    });
    await writeFile(path.join(created.checkout, 'review.txt'), 'ordinary uncommitted drift\n');
    await expect(
      owner.workspace.read({
        kind: 'review.bases',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toEqual(bases);

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    await expect(
      owner.workspace.read({
        kind: 'review.bases',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toEqual(bases);
  });

  it('captures a discovered Git basis on first open and creates one explicit fork without polluting Snapshot lineage', async () => {
    const created = await fixture(false);
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'basis-capture-start',
        expectedStateVersion: 0,
      }),
    );
    const observed = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (observed.status !== 'available') throw new Error('Observed basis tree unavailable');
    const candidate = observed.bases.items.find(
      item => item.kind === 'git-commit' && item.capture.status === 'capture-on-open',
    );
    if (candidate?.kind !== 'git-commit' || candidate.capture.status !== 'capture-on-open') {
      throw new Error('Observed Git basis unavailable');
    }
    const captured = await owner.workspace.execute({
      kind: 'review.basis.git-commit.capture',
      commandIdentity: 'capture-git-basis',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewBasisIdentity: candidate.reviewBasisIdentity,
      commitObjectIdentity: candidate.source.commit.objectIdentity,
    });
    expect(captured).toMatchObject({
      kind: 'review.basis.git-commit.captured',
      status: 'accepted',
      reviewBasisIdentity: candidate.reviewBasisIdentity,
      parentReviewBasisIdentity: observed.liveReviewBasisIdentity,
      commit: { subject: 'basis' },
    });
    if (captured.kind !== 'review.basis.git-commit.captured') throw new Error('Git basis capture failed');
    await expect(
      owner.workspace.execute({
        kind: 'review.basis.git-commit.capture',
        commandIdentity: 'capture-git-basis',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        reviewBasisIdentity: candidate.reviewBasisIdentity,
        commitObjectIdentity: candidate.source.commit.objectIdentity,
      }),
    ).resolves.toEqual(captured);

    const capturedManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: captured.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(capturedManifest).toMatchObject({
      status: 'available',
      header: { reviewSnapshotIdentity: captured.reviewSnapshotIdentity },
      manifest: { totalFiles: 1, files: [{ displayPath: 'review.txt', status: 'added' }] },
    });
    if (capturedManifest.status !== 'available') throw new Error('Captured Git basis Manifest unavailable');
    expect(capturedManifest.header).not.toHaveProperty('version');
    const capturedFile = capturedManifest.manifest.files[0];
    if (capturedFile === undefined) throw new Error('Captured Git basis file unavailable');
    const capturedDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: captured.reviewSnapshotIdentity,
      fileIdentity: capturedFile.fileIdentity,
      offset: 0,
      limit: 64,
    });
    expect(capturedDiff.status).toBe('available');
    if (capturedDiff.status !== 'available') throw new Error('Captured Git basis Diff unavailable');
    expect(
      capturedDiff.window.rows.map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8')).join(''),
    ).toContain('before');
    await expect(
      owner.workspace.read({
        kind: 'review.questions',
        reviewIdentity: started.reviewIdentity,
        reviewSnapshotIdentity: captured.reviewSnapshotIdentity,
        offset: 0,
        limit: 8,
      }),
    ).resolves.toMatchObject({ status: 'available', list: { totalItems: 0 } });

    await writeFile(path.join(created.checkout, 'review.txt'), 'explicit fork source\n');
    const forked = await owner.workspace.execute({
      kind: 'review.basis.fork',
      commandIdentity: 'explicit-review-basis-fork',
      expectedStateVersion: captured.stateVersion,
      reviewIdentity: started.reviewIdentity,
      parentReviewBasisIdentity: captured.reviewBasisIdentity,
    });
    expect(forked).toMatchObject({
      kind: 'review.basis.forked',
      status: 'accepted',
      parentReviewBasisIdentity: captured.reviewBasisIdentity,
      reviewBasisIdentity: expect.stringMatching(/^rbs_[0-9a-f]{64}$/u),
      reviewSnapshotIdentity: expect.stringMatching(/^rsn_[0-9a-f]{64}$/u),
    });
    if (forked.kind !== 'review.basis.forked') throw new Error('Explicit Review Basis fork failed');
    const tree = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(tree).toMatchObject({
      status: 'available',
      bases: {
        items: [
          { kind: 'live', depth: 0 },
          {
            kind: 'git-commit',
            reviewBasisIdentity: captured.reviewBasisIdentity,
            depth: 1,
            capture: { status: 'captured', reviewSnapshotIdentity: captured.reviewSnapshotIdentity },
          },
          {
            kind: 'saved-review-point',
            reviewBasisIdentity: forked.reviewBasisIdentity,
            parentReviewBasisIdentity: captured.reviewBasisIdentity,
            depth: 2,
            capture: { status: 'captured', reviewSnapshotIdentity: forked.reviewSnapshotIdentity },
          },
        ],
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.versions',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({ versions: { total: 1 } });

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    await expect(
      owner.workspace.read({
        kind: 'review.bases',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toEqual(tree);
  });

  it('starts an empty-diff comparison review between identical revisions', async () => {
    const created = await fixture(false);
    await git(created.checkout, 'commit', '-q', '--allow-empty', '-m', 'identical second commit');
    const selected = await git(created.checkout, 'rev-parse', 'HEAD');
    const parent = await git(created.checkout, 'rev-parse', 'HEAD^');
    const owner = await open(created);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'empty-comparison-start',
      expectedStateVersion: home.stateVersion,
      selection: { kind: 'commit', revision: selected },
      expectedBasisObjectIdentity: parent,
      expectedComparedObjectIdentity: selected,
    });
    expect(started).toMatchObject({ kind: 'review.comparison.started', status: 'accepted' });
    if (started.kind !== 'review.comparison.started') throw new Error('Comparison failed');
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(manifest).toMatchObject({ status: 'available', header: { snapshotStatus: 'current' } });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    expect(manifest.manifest.files).toEqual([]);
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(bases.status).toBe('available');
    if (bases.status !== 'available') throw new Error('Comparison basis tree unavailable');
    expect(bases.bases.items.slice(0, 2)).toMatchObject([
      { kind: 'live', capture: { status: 'live' } },
      {
        kind: 'git-commit',
        source: { kind: 'git-commit', commit: { objectIdentity: selected, subject: 'identical second commit' } },
        capture: { status: 'captured', reviewSnapshotIdentity: started.reviewSnapshotIdentity },
      },
    ]);
  });

  it('projects ordered one-type messages per basis and opens their immutable or drift-accepting origins after restart', async () => {
    const created = await fixture(false);
    await git(created.checkout, 'commit', '-q', '--allow-empty', '-m', 'message origin');
    const selected = await git(created.checkout, 'rev-parse', 'HEAD');
    const parent = await git(created.checkout, 'rev-parse', 'HEAD^');
    let owner = await open(created);
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'message-origin-review',
      expectedStateVersion: 0,
      selection: { kind: 'commit', revision: selected },
      expectedBasisObjectIdentity: parent,
      expectedComparedObjectIdentity: selected,
    });
    if (started.kind !== 'review.comparison.started') throw new Error('Comparison failed');
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);

    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const read = await state.read({
      recordIdentities: [indexIdentity, started.reviewSnapshotIdentity],
      includeContent: false,
    });
    const [indexRecord, snapshotRecord] = read.records;
    if (
      indexRecord?.recordClass !== 'revisioned' ||
      indexRecord.kind !== 'review.index' ||
      snapshotRecord?.recordClass !== 'immutable' ||
      snapshotRecord.kind !== 'review.snapshot'
    ) {
      throw new Error('Review index or Snapshot unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    const repositoryStateAtCommitment = {
      kind: 'current-repository-state',
      basis: {
        kind: 'head',
        selector: 'HEAD',
        objectFormat: 'sha1',
        objectIdentity: selected,
        state: 'resolved',
      },
      comparedState: {
        kind: 'effective-working-state',
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
      },
      manifest: snapshot.manifest,
    } as const;
    const entry = index.reviews.find(candidate => candidate.reviewIdentity === started.reviewIdentity);
    const liveBasisIdentity = entry?.basisTree?.liveReviewBasisIdentity;
    const savedBasisIdentity = entry?.basisTree?.reviewBasisIdentities[1];
    if (entry === undefined || liveBasisIdentity === undefined || savedBasisIdentity === undefined) {
      throw new Error('Review basis fixture unavailable');
    }
    const liveMessageIdentity = reviewMessageIdentity('live-message-fixture');
    const savedMessageIdentity = reviewMessageIdentity('saved-message-fixture');
    const liveResponseIdentity = reviewingRecordIdentity('rrp', 'live-message-response') as ReviewResponseIdentity;
    const responseIdentity = reviewingRecordIdentity('rrp', 'saved-message-response') as ReviewResponseIdentity;
    const liveResponseBody = 'The current behavior follows the configured default.';
    const responseBody = 'The historical implementation used the original default.';
    const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
    const pathEvidence = {
      bytesBase64: Buffer.from('review.txt').toString('base64'),
      display: 'review.txt',
    } as const;
    const committed = await state.commit({
      commandIdentity: 'install-review-message-fixture',
      expectedStateVersion: read.stateVersion,
      records: [
        {
          recordClass: 'immutable',
          recordIdentity: liveMessageIdentity,
          workflowIdentity: started.reviewIdentity,
          kind: 'review.message',
          schemaVersion: 1,
          payload: encode({
            formatVersion: 1,
            reviewIdentity: started.reviewIdentity,
            reviewMessageIdentity: liveMessageIdentity,
            originReviewBasisIdentity: liveBasisIdentity,
            location: { file: pathEvidence, line: 1 },
            body: 'Please explain the current behavior.',
            outgoingMaterialIdentity: reviewMessageMaterialIdentity('live-message-fixture'),
            repositoryStateAtCommitment,
          }),
          content: [],
        },
        {
          recordClass: 'immutable',
          recordIdentity: savedMessageIdentity,
          workflowIdentity: started.reviewIdentity,
          kind: 'review.message',
          schemaVersion: 1,
          payload: encode({
            formatVersion: 1,
            reviewIdentity: started.reviewIdentity,
            reviewMessageIdentity: savedMessageIdentity,
            originReviewBasisIdentity: savedBasisIdentity,
            location: { file: pathEvidence, line: 1 },
            body: 'Why did this work that way in the saved point?',
            outgoingMaterialIdentity: reviewMessageMaterialIdentity('saved-message-fixture'),
            repositoryStateAtCommitment,
          }),
          content: [],
        },
        {
          recordClass: 'immutable',
          recordIdentity: liveResponseIdentity,
          workflowIdentity: started.reviewIdentity,
          kind: 'review.message-response',
          schemaVersion: 1,
          payload: encode({
            formatVersion: 1,
            reviewIdentity: started.reviewIdentity,
            reviewMessageIdentity: liveMessageIdentity,
            responseIdentity: liveResponseIdentity,
            handoffIdentity: `hho_${'c'.repeat(64)}`,
            invocationIdentity: `hin_${'d'.repeat(64)}`,
            terminalEvidenceIdentity: 'live-message-terminal-fixture',
            artifactResultContractIdentity: 'review-response-v1',
            body: liveResponseBody,
            bodySha256: createHash('sha256').update(liveResponseBody).digest('hex'),
            bodyByteLength: Buffer.byteLength(liveResponseBody),
          }),
          content: [],
        },
        {
          recordClass: 'immutable',
          recordIdentity: responseIdentity,
          workflowIdentity: started.reviewIdentity,
          kind: 'review.message-response',
          schemaVersion: 1,
          payload: encode({
            formatVersion: 1,
            reviewIdentity: started.reviewIdentity,
            reviewMessageIdentity: savedMessageIdentity,
            responseIdentity,
            handoffIdentity: `hho_${'a'.repeat(64)}`,
            invocationIdentity: `hin_${'b'.repeat(64)}`,
            terminalEvidenceIdentity: 'message-terminal-fixture',
            artifactResultContractIdentity: 'review-response-v1',
            body: responseBody,
            bodySha256: createHash('sha256').update(responseBody).digest('hex'),
            bodyByteLength: Buffer.byteLength(responseBody),
          }),
          content: [],
        },
        {
          recordClass: 'revisioned',
          recordIdentity: indexIdentity,
          workflowIdentity: indexIdentity,
          kind: 'review.index',
          schemaVersion: 1,
          expectedRevision: indexRecord.revision,
          payload: encode({
            ...index,
            reviews: index.reviews.map(candidate =>
              candidate.reviewIdentity === started.reviewIdentity
                ? {
                    ...candidate,
                    messageHistory: {
                      formatVersion: 1,
                      messages: [
                        { reviewMessageIdentity: liveMessageIdentity, originReviewBasisIdentity: liveBasisIdentity },
                        { reviewMessageIdentity: savedMessageIdentity, originReviewBasisIdentity: savedBasisIdentity },
                      ],
                      responses: [
                        { reviewMessageIdentity: liveMessageIdentity, responseIdentity: liveResponseIdentity },
                        { reviewMessageIdentity: savedMessageIdentity, responseIdentity },
                      ],
                      changeObservations: [],
                    },
                  }
                : candidate,
            ),
          }),
          content: [],
        },
      ],
      result: { kind: 'test.review-messages-installed', schemaVersion: 1, payload: new Uint8Array([1]) },
    });
    if (!('result' in committed)) throw new Error('Review Message fixture commit failed');
    await state.close();

    owner = await open(created);
    const all = await owner.workspace.read({
      kind: 'review.messages',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(all).toMatchObject({
      status: 'available',
      stateVersion: committed.stateVersion,
      messages: {
        total: 2,
        items: [
          {
            reviewMessageIdentity: liveMessageIdentity,
            originReviewBasisIdentity: liveBasisIdentity,
            response: { responseIdentity: liveResponseIdentity },
          },
          {
            reviewMessageIdentity: savedMessageIdentity,
            originReviewBasisIdentity: savedBasisIdentity,
            response: { responseIdentity },
          },
        ],
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.messages',
        reviewIdentity: started.reviewIdentity,
        reviewBasisIdentity: savedBasisIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({ messages: { total: 1, items: [{ reviewMessageIdentity: savedMessageIdentity }] } });
    await expect(
      owner.workspace.read({
        kind: 'review.message-origin',
        reviewIdentity: started.reviewIdentity,
        reviewMessageIdentity: liveMessageIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      source: { kind: 'live-working-diff', drift: 'accepted' },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.message-origin',
        reviewIdentity: started.reviewIdentity,
        reviewMessageIdentity: savedMessageIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'available',
      basis: {
        reviewBasisIdentity: savedBasisIdentity,
        capture: { reviewSnapshotIdentity: started.reviewSnapshotIdentity },
      },
      source: { kind: 'review-snapshot', reviewSnapshotIdentity: started.reviewSnapshotIdentity },
    });
    const body = await owner.workspace.read({
      kind: 'review.message-body',
      reviewIdentity: started.reviewIdentity,
      reviewMessageIdentity: savedMessageIdentity,
      offset: 4,
      length: 9,
    });
    expect(body.status).toBe('available');
    if (body.status !== 'available') throw new Error('Review Message body unavailable');
    expect(Buffer.from(body.body.bytesBase64, 'base64').toString('utf8')).toBe('did this ');
    const responseBodyView = await owner.workspace.read({
      kind: 'review.message-body',
      reviewIdentity: started.reviewIdentity,
      reviewMessageIdentity: savedMessageIdentity,
      part: 'response',
      offset: 4,
      length: responseBody.length - 4,
    });
    expect(responseBodyView).toMatchObject({
      status: 'available',
      reviewMessageIdentity: savedMessageIdentity,
      body: {
        totalByteLength: Buffer.byteLength(responseBody),
        truncated: false,
      },
    });
    if (responseBodyView.status !== 'available') throw new Error('Review Response body unavailable');
    expect(Buffer.from(responseBodyView.body.bytesBase64, 'base64').toString('utf8')).toBe(responseBody.slice(4));
    await expect(
      owner.workspace.read({
        kind: 'review.message-body',
        reviewIdentity: started.reviewIdentity,
        reviewMessageIdentity: reviewMessageIdentity('missing-response-fixture'),
        part: 'response',
        offset: 0,
        length: 16,
      }),
    ).resolves.toMatchObject({ status: 'not-found' });

    const noChange = await owner.workspace.execute({
      kind: 'review.change-observation.record',
      commandIdentity: 'observe-unchanged-message-response',
      expectedStateVersion: committed.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewMessageIdentity: liveMessageIdentity,
      responseIdentity: liveResponseIdentity,
    });
    expect(noChange).toMatchObject({
      kind: 'review.change-observation.recorded',
      status: 'accepted',
      outcome: 'unchanged',
      parentReviewBasisIdentity: liveBasisIdentity,
    });
    if (noChange.kind !== 'review.change-observation.recorded') {
      throw new Error('Unchanged observation failed');
    }
    await writeFile(path.join(created.checkout, 'review.txt'), 'mixed observed changes\n');
    const changed = await owner.workspace.execute({
      kind: 'review.change-observation.record',
      commandIdentity: 'observe-changed-message-response',
      expectedStateVersion: noChange.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewMessageIdentity: savedMessageIdentity,
      responseIdentity,
    });
    expect(changed).toMatchObject({
      kind: 'review.change-observation.recorded',
      status: 'accepted',
      outcome: 'forked',
      parentReviewBasisIdentity: savedBasisIdentity,
      reviewBasisIdentity: expect.stringMatching(/^rbs_[0-9a-f]{64}$/u),
      reviewSnapshotIdentity: expect.stringMatching(/^rsn_[0-9a-f]{64}$/u),
    });
    if (changed.kind !== 'review.change-observation.recorded' || changed.outcome !== 'forked') {
      throw new Error('Changed observation failed');
    }
    const observedTree = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(observedTree).toMatchObject({
      status: 'available',
      bases: {
        items: expect.arrayContaining([
          expect.objectContaining({
            kind: 'change-event',
            reviewBasisIdentity: changed.reviewBasisIdentity,
            parentReviewBasisIdentity: savedBasisIdentity,
            source: {
              kind: 'changes-observed-after-response',
              responseIdentity,
              label: 'changes observed after this Response',
            },
          }),
        ]),
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.messages',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({
      messages: {
        items: [
          { reviewMessageIdentity: liveMessageIdentity, changeObservation: { outcome: 'unchanged' } },
          {
            reviewMessageIdentity: savedMessageIdentity,
            changeObservation: { outcome: 'forked', reviewBasisIdentity: changed.reviewBasisIdentity },
          },
        ],
      },
    });
    await expect(
      owner.workspace.execute({
        kind: 'review.change-observation.record',
        commandIdentity: 'observe-changed-message-response',
        expectedStateVersion: noChange.stateVersion,
        reviewIdentity: started.reviewIdentity,
        reviewMessageIdentity: savedMessageIdentity,
        responseIdentity,
      }),
    ).resolves.toEqual(changed);
  });

  it('atomically moves Current to Previous and reconstructs the pointer after restart', async () => {
    const created = await fixture();
    let owner = await open(created);
    const firstHome = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const first = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'first-current-review',
        expectedStateVersion: firstHome.stateVersion,
      }),
    );
    expect(first).not.toHaveProperty('reviewPassIdentity');

    await writeFile(path.join(created.checkout, 'review.txt'), 'after again\n');
    const second = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'second-current-review',
        expectedStateVersion: first.stateVersion,
      }),
    );
    expect(second.reviewIdentity).not.toBe(first.reviewIdentity);

    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(home.header.currentReviewIdentity).toBe(second.reviewIdentity);
    expect(home.currentReview).toMatchObject({
      reviewIdentity: second.reviewIdentity,
      retention: 'current',
    });
    expect(home.reviews.items).toEqual([
      expect.objectContaining({
        reviewIdentity: first.reviewIdentity,
        retention: 'previous',
      }),
    ]);
    const [firstTree, secondTree] = await Promise.all([
      owner.workspace.read({ kind: 'review.bases', reviewIdentity: first.reviewIdentity, offset: 0, limit: 64 }),
      owner.workspace.read({ kind: 'review.bases', reviewIdentity: second.reviewIdentity, offset: 0, limit: 64 }),
    ]);
    expect(firstTree).toMatchObject({ status: 'available', reviewIdentity: first.reviewIdentity });
    expect(secondTree).toMatchObject({ status: 'available', reviewIdentity: second.reviewIdentity });
    if (firstTree.status !== 'available' || secondTree.status !== 'available') {
      throw new Error('Per-Review basis tree unavailable');
    }
    expect(firstTree.liveReviewBasisIdentity).not.toBe(secondTree.liveReviewBasisIdentity);
    expect(firstTree.bases.items[0]).toMatchObject({
      reviewBasisIdentity: firstTree.liveReviewBasisIdentity,
      kind: 'live',
    });
    expect(firstTree.bases.items.some(item => item.capture.status === 'captured')).toBe(false);

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const reconstructed = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(reconstructed.header.currentReviewIdentity).toBe(second.reviewIdentity);
    expect(reconstructed.reviews.items[0]?.reviewIdentity).toBe(first.reviewIdentity);
  });

  it('reads a pre-lineage immutable Current without rewriting its Snapshot bytes', async () => {
    const created = await fixture();
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'legacy-immutable-current-start',
        expectedStateVersion: 0,
      }),
    );
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);

    let state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const before = await state.read({
      recordIdentities: [indexIdentity, started.reviewSnapshotIdentity],
      includeContent: true,
    });
    const [indexRecord, snapshotRecord] = before.records;
    if (
      indexRecord === undefined ||
      indexRecord.recordClass !== 'revisioned' ||
      snapshotRecord === undefined ||
      snapshotRecord.recordClass !== 'immutable'
    ) {
      throw new Error('Legacy compatibility fixture records unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const only = index.reviews[0];
    if (only === undefined) throw new Error('Legacy Review missing');
    const {
      reviewSnapshotIdentities: _lineage,
      basisTree: _basisTree,
      messageHistory: _messageHistory,
      startedAt: _chronology,
      ...legacyEntry
    } = only;
    const snapshotPayload = new Uint8Array(snapshotRecord.payload);
    const snapshotContent = snapshotRecord.content.map(item => ({
      ...item,
      ...(item.bytes === undefined ? {} : { bytes: new Uint8Array(item.bytes) }),
    }));
    const installed = await state.commit({
      commandIdentity: 'install-pre-lineage-current-index',
      expectedStateVersion: before.stateVersion,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: indexIdentity,
          workflowIdentity: indexIdentity,
          kind: 'review.index',
          schemaVersion: 1,
          expectedRevision: indexRecord.revision,
          payload: new TextEncoder().encode(
            JSON.stringify({
              formatVersion: 1,
              reviews: [{ ...legacyEntry, status: 'active' }],
            }),
          ),
          content: [],
        },
      ],
      result: {
        kind: 'test.pre-lineage-current-installed',
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      },
    });
    if (!('result' in installed)) {
      throw new Error('Legacy compatibility fixture commit failed');
    }
    await state.close();

    owner = await open(created);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(home).toMatchObject({
      stateVersion: installed.stateVersion,
      header: { currentReviewIdentity: started.reviewIdentity },
      currentReview: { reviewIdentity: started.reviewIdentity },
    });
    const versions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versions).toMatchObject({
      status: 'available',
      stateVersion: installed.stateVersion,
      versions: {
        total: 1,
        items: [{ reviewSnapshotIdentity: started.reviewSnapshotIdentity }],
      },
    });
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(bases).toMatchObject({
      status: 'available',
      stateVersion: installed.stateVersion,
    });
    if (bases.status !== 'available') throw new Error('Historical basis tree unavailable');
    expect(bases.bases.items[0]).toMatchObject({ kind: 'live', capture: { status: 'live' } });
    expect(bases.bases.items.some(item => item.capture.status === 'captured')).toBe(false);
    await owner.dispose();
    owners.delete(owner);

    state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const after = await state.read({
      recordIdentities: [started.reviewSnapshotIdentity],
      includeContent: true,
    });
    expect(after.stateVersion).toBe(installed.stateVersion);
    expect(after.records[0]?.payload).toEqual(snapshotPayload);
    expect(after.records[0]?.content).toEqual(snapshotContent);
    await state.close();
  });
});
