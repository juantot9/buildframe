import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { expect } from 'vitest';

import type {
  HarnessAttachmentIdentity,
  PrepareUserPullCommand,
  ReviewedCapabilityManifest,
  UserPullPreparationIdentity,
} from '../../src/harness-interaction/index.js';
import type { Workspace, WorkspaceIdentity, WorkspaceIdentityView } from '../../src/index.js';
import {
  openAuthoritativeState,
  type AuthoritativeState,
  type StateCommitRequest,
  type StateCommitResult,
  type StateContentReadRequest,
  type StateContentReadResult,
  type StateReadRequest,
  type StateReadResult,
  type StateStatus,
} from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import {
  decodeReviewingPayload,
  parseReviewIndex,
  parseReviewSnapshot,
  reviewingRecordIdentity,
  type CurrentChangesReviewStarted,
  type ReviewQuestionBatchCommitted,
  type ReviewQuestionDraftCreated,
} from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);

export interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

export async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

export async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-user-pull-lifecycle-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, 'review.txt'), 'before\nsame\n');
  await git(checkout, 'add', 'review.txt');
  await git(checkout, 'commit', '-qm', 'basis');
  await writeFile(path.join(checkout, 'review.txt'), 'after\nsame\n');
  return { root, checkout, state };
}

export function userPullManifest(): ReviewedCapabilityManifest {
  return {
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: 'neoflow.test-user-pull-adapter/1',
    adapterDisplayName: 'Claude Code',
    reviewedHostVersions: ['2.1.209'],
    capabilities: [
      {
        contractVersion: 1,
        capabilityIdentity: 'test-user-pull-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'user-pull',
        authority: 'workspace-write',
        effectConstraint: {
          strength: 'communicated',
          scope: 'harness-tools',
          limitation: 'The Harness may modify the workspace with the tools available in this session.',
        },
        evidenceProfile: {
          submission: 'correlated',
          normalEnd: 'correlated',
          failure: 'correlated',
          interruption: 'unavailable',
          replay: 'unavailable',
        },
        knownLimitations: [
          'No interruption channel exists.',
          'No Review Response Artifact is captured from this route.',
        ],
      },
    ],
  };
}

export function requireStarted(result: Awaited<ReturnType<Workspace['execute']>>): CurrentChangesReviewStarted {
  if (result.kind !== 'review.current-changes.started') throw new Error(`Review did not start: ${result.kind}`);
  return result;
}

export function requireDraft(result: Awaited<ReturnType<Workspace['execute']>>): ReviewQuestionDraftCreated {
  if (result.kind !== 'review.question-draft.created') throw new Error(`Draft was not created: ${result.kind}`);
  return result;
}

export function requireBatch(result: Awaited<ReturnType<Workspace['execute']>>): ReviewQuestionBatchCommitted {
  if (result.kind !== 'review.question-batch.committed') throw new Error(`Batch was not committed: ${result.kind}`);
  return result;
}

export async function firstFileIdentity(workspace: Workspace): Promise<string> {
  const capture = await workspace.read({ kind: 'workspace.current-changes.capture' });
  if (capture.status !== 'captured') throw new Error('Current changes were not captured');
  const manifest = await workspace.read({
    kind: 'workspace.current-changes.manifest',
    evidenceIdentity: capture.evidenceIdentity,
    offset: 0,
    limit: 1,
  });
  if (manifest.status !== 'available' || manifest.files[0] === undefined) {
    throw new Error('Changed file was unavailable');
  }
  return manifest.files[0].fileIdentity;
}

export async function installHistoricalActiveReview(
  created: Fixture,
  workspaceIdentity: WorkspaceIdentity,
  started: CurrentChangesReviewStarted,
): Promise<void> {
  const state = await openAuthoritativeState({
    workspaceIdentity,
    privateStateDirectory: userStateDirectory(created.checkout),
  });
  try {
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const read = await state.read({
      recordIdentities: [indexIdentity, started.reviewSnapshotIdentity],
      includeContent: false,
    });
    const [indexRecord, snapshotRecord] = read.records;
    if (
      indexRecord?.kind !== 'review.index' ||
      indexRecord.recordClass !== 'revisioned' ||
      snapshotRecord?.kind !== 'review.snapshot' ||
      snapshotRecord.recordClass !== 'immutable'
    ) {
      throw new Error('Review fixture records are unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    if (snapshot.reviewIdentity !== started.reviewIdentity) throw new Error('Review fixture is inconsistent');
    const committed = await state.commit({
      commandIdentity: `install-active-${started.reviewIdentity}`,
      expectedStateVersion: read.stateVersion,
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
              ...index,
              reviews: index.reviews.map(entry =>
                entry.reviewIdentity === started.reviewIdentity ? { ...entry, status: 'active' as const } : entry,
              ),
            }),
          ),
          content: [],
        },
      ],
      result: {
        kind: 'test.historical-active-review-installed',
        schemaVersion: 1,
        payload: new Uint8Array([1]),
      },
    });
    if (!('result' in committed)) throw new Error(`Review fixture failed: ${committed.reason}`);
  } finally {
    await state.close();
  }
}

export class MissingRecordState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  readonly missingRecordIdentity: string;

  constructor(delegate: AuthoritativeState, missingRecordIdentity: string) {
    this.delegate = delegate;
    this.missingRecordIdentity = missingRecordIdentity;
  }

  commit(request: StateCommitRequest): Promise<StateCommitResult> {
    return this.delegate.commit(request);
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    const result = await this.delegate.read(request);
    return {
      ...result,
      records: result.records.map((record, index) =>
        request.recordIdentities[index] === this.missingRecordIdentity ? undefined : record,
      ),
    };
  }

  readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return this.delegate.readContent(request);
  }

  status(): Promise<StateStatus> {
    return this.delegate.status();
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

export class FailingEvidenceState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  readonly mode: 'before' | 'after';
  failed = false;

  constructor(delegate: AuthoritativeState, mode: 'before' | 'after') {
    this.delegate = delegate;
    this.mode = mode;
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    const evidenceCommit = request.records.some(record => record.kind === 'harness.evidence');
    if (!this.failed && evidenceCommit) {
      this.failed = true;
      if (this.mode === 'before') throw new Error('injected evidence commit failure');
      await this.delegate.commit(request);
      throw new Error('injected post-evidence-commit response loss');
    }
    return await this.delegate.commit(request);
  }

  read(request: StateReadRequest): Promise<StateReadResult> {
    return this.delegate.read(request);
  }

  readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return this.delegate.readContent(request);
  }

  status(): Promise<StateStatus> {
    return this.delegate.status();
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

export class FailingClaimState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  failNextClaim = true;

  constructor(delegate: AuthoritativeState) {
    this.delegate = delegate;
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    if (this.failNextClaim && request.commandIdentity === 'failed-user-pull-claim') {
      this.failNextClaim = false;
      throw new Error('injected claim commit failure');
    }
    return await this.delegate.commit(request);
  }

  read(request: StateReadRequest): Promise<StateReadResult> {
    return this.delegate.read(request);
  }

  readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return this.delegate.readContent(request);
  }

  status(): Promise<StateStatus> {
    return this.delegate.status();
  }

  close(): Promise<void> {
    return this.delegate.close();
  }
}

export interface PreparedFixture {
  readonly created: Fixture;
  readonly owner: WorkspaceRuntimeOwner;
  readonly identity: WorkspaceIdentityView;
  readonly sessionId: string;
  readonly canonicalGitDir: string;
  readonly started: CurrentChangesReviewStarted;
  readonly batch: ReviewQuestionBatchCommitted;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly compatibilityIdentity: string;
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly commitmentReceiptIdentity: string;
  readonly preparedStateVersion: number;
}
/** Owns one scenario's runtime owners, state handles, roots, and environment. */
export class UserPullScenarioHarness {
  readonly owners = new Set<WorkspaceRuntimeOwner>();
  readonly states = new Set<AuthoritativeState>();
  readonly roots = new Set<string>();
  readonly #originalStateHome = process.env.XDG_STATE_HOME;

  async fixture(): Promise<Fixture> {
    const created = await createFixture();
    this.roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    return created;
  }

  async open(checkout: string): Promise<WorkspaceRuntimeOwner> {
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(`Workspace runtime was rejected: ${opened.diagnostic.code}`);
    this.owners.add(opened.owner);
    return opened.owner;
  }

  async prepareReview(options: { readonly disclosedDeadline?: string } = {}): Promise<PreparedFixture> {
    const created = await this.fixture();
    let owner = await this.open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'user-pull-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await owner.dispose();
    this.owners.delete(owner);
    await installHistoricalActiveReview(created, identity.workspaceIdentity, started);
    owner = await this.open(created.checkout);

    const sessionId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const canonicalGitDir = path.join(identity.canonicalCheckout, '.git');
    const beforeAttach = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const attached = await owner.workspace.execute({
      kind: 'harness.user-pull.attach',
      commandIdentity: 'user-pull-attach',
      expectedStateVersion: beforeAttach.stateVersion,
      sessionId,
      canonicalGitRoot: identity.canonicalCheckout,
      canonicalGitDir,
      hostVersion: '2.1.209',
      manifest: userPullManifest(),
    });
    if (attached.kind !== 'harness.user-pull.attached') throw new Error(`Attachment failed: ${attached.kind}`);

    const fileIdentity = await firstFileIdentity(owner.workspace);
    const draft = requireDraft(
      await owner.workspace.execute({
        kind: 'review.question-draft.create',
        commandIdentity: 'user-pull-draft',
        expectedStateVersion: attached.stateVersion,
        reviewIdentity: started.reviewIdentity,
        anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
        body: 'Does this synthetic change preserve the intended behavior?',
      }),
    );
    const batch = requireBatch(
      await owner.workspace.execute({
        kind: 'review.question-batch.commit',
        commandIdentity: 'user-pull-batch',
        expectedStateVersion: draft.stateVersion,
        reviewIdentity: started.reviewIdentity,
        draftIdentities: [draft.draftIdentity],
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.user-pull.review-handoff.inspect',
      reviewIdentity: started.reviewIdentity,
      reviewBatchIdentity: batch.reviewBatchIdentity,
      attachmentIdentity: attached.attachmentIdentity,
    });
    if (inspection.status !== 'available') throw new Error(`Inspection unavailable: ${inspection.reason}`);
    expect(inspection.capability).not.toHaveProperty('artifactResultContract');
    const command: PrepareUserPullCommand = {
      kind: 'harness.user-pull.prepare',
      commandIdentity: 'user-pull-prepare',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewBatchIdentity: batch.reviewBatchIdentity,
      attachmentIdentity: attached.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      ...(options.disclosedDeadline === undefined ? {} : { disclosedDeadline: options.disclosedDeadline }),
    };
    const prepared = await owner.workspace.execute(command);
    if (prepared.kind !== 'harness.user-pull.prepared') throw new Error(`Preparation failed: ${prepared.kind}`);
    return {
      created,
      owner,
      identity,
      sessionId,
      canonicalGitDir,
      started,
      batch,
      attachmentIdentity: attached.attachmentIdentity,
      compatibilityIdentity: attached.compatibilityIdentity,
      preparationIdentity: prepared.preparationIdentity,
      commitmentReceiptIdentity: prepared.commitmentReceiptIdentity,
      preparedStateVersion: prepared.stateVersion,
    };
  }

  async claimPrepared(prepared: PreparedFixture, promptId: string) {
    const armed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: `arm-${promptId}`,
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error(`Arm failed: ${armed.kind}`);
    const claimed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.claim',
      commandIdentity: `claim-${promptId}`,
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (claimed.kind !== 'harness.user-pull.claimed') throw new Error(`Claim failed: ${claimed.kind}`);
    return { armed, claimed };
  }

  async startClaimed(prepared: PreparedFixture, promptId: string) {
    const { claimed } = await this.claimPrepared(prepared, promptId);
    const started = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: `start-${promptId}`,
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'prompt-submitted',
        sessionId: prepared.sessionId,
        promptId,
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      },
    });
    if (started.kind !== 'harness.user-pull.observed') throw new Error(`Start failed: ${started.kind}`);
    return { claimed, started };
  }

  async dispose(): Promise<void> {
    await Promise.all([...this.owners].map(async owner => owner.dispose().catch(() => undefined)));
    this.owners.clear();
    await Promise.all([...this.states].map(async state => state.close().catch(() => undefined)));
    this.states.clear();
    if (this.#originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = this.#originalStateHome;
    await Promise.all([...this.roots].map(async root => rm(root, { recursive: true, force: true })));
    this.roots.clear();
  }
}
