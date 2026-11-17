import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CommittedHarnessDirective,
  HarnessAttachmentIdentity,
  HarnessConnectionView,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  HarnessInvocationIdentity,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '../../src/harness-interaction/index.js';
import type { Workspace, WorkspaceIdentity } from '../../src/index.js';
import type {
  DirectReviewHandoffAvailableView,
  DirectReviewHandoffCommitted,
  ReviewMessageCommitted,
} from '@buildframe/workspace/harness-interaction';
import type {
  CurrentChangesReviewStarted,
  ReviewAnchorInput,
  ReviewQuestionBatchCommitted,
  ReviewQuestionDraftCreated,
} from '@buildframe/workspace/reviewing';
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
import { reviewMessageAcknowledgementIdentity } from '../../src/harness-interaction/commitmentPolicy.js';
import { stableIdentity } from '../../src/harness-interaction/utils.js';
import {
  parseReviewIndex,
  parseReviewSnapshot,
  decodeReviewingPayload,
  reviewContextSelectionIdentity,
  reviewingRecordIdentity,
} from '../../src/reviewing/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-harness-interaction-'));
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

async function installHistoricalActiveReview(
  created: Fixture,
  workspaceIdentity: WorkspaceIdentity,
  started: CurrentChangesReviewStarted,
): Promise<number> {
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
      throw new Error('Historical Review fixture records are unavailable');
    }
    const index = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    if (
      snapshot.reviewIdentity !== started.reviewIdentity ||
      !index.reviews.some(entry => entry.reviewIdentity === started.reviewIdentity)
    ) {
      throw new Error('Historical Review fixture is inconsistent');
    }
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
    if (!('result' in committed)) {
      throw new Error(`Historical Review fixture failed: ${committed.reason}`);
    }
    return committed.stateVersion;
  } finally {
    await state.close();
  }
}

function reverseKeyOrder<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).reverse()) as T;
}

function attachmentIdentity(seed: string): HarnessAttachmentIdentity {
  return `att_${createHash('sha256').update(seed).digest('hex')}` as HarnessAttachmentIdentity;
}

function capabilityManifest(
  limitation = 'The reviewed request-scoped constraint is cooperative, not OS isolation.',
  authority: 'discussion-only' | 'workspace-write' = 'discussion-only',
): ReviewedCapabilityManifest {
  return {
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: 'scripted-direct-review-adapter',
    adapterDisplayName: 'Scripted Harness',
    reviewedHostVersions: ['1.0.0'],
    capabilities: [
      {
        contractVersion: 1,
        capabilityIdentity:
          authority === 'workspace-write' ? 'direct-workspace-write-review-v1' : 'direct-question-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority,
        effectConstraint:
          authority === 'workspace-write'
            ? {
                strength: 'communicated',
                scope: 'harness-tools',
                limitation,
              }
            : {
                strength: 'enforced',
                scope: 'workspace-read-only',
                limitation,
              },
        evidenceProfile: {
          dispatchRejection: 'correlated',
          start: 'correlated',
          normalEnd: 'correlated',
          failure: 'correlated',
          interruption: 'correlated',
          replay: 'unavailable',
        },
        interruption: { route: 'direct-request' },
        artifactResultContract: {
          contractVersion: 1,
          contractIdentity: 'pi-settled-final-assistant-review-response-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: 16 * 1024,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: [limitation],
      },
    ],
  };
}

class ScriptedAdapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  readonly directives: CommittedHarnessDirective[] = [];
  readonly observations: HarnessDirectiveObservation[] = [];
  /** Why the core released this session, in order: a newer session connected. */
  readonly released: string[] = [];
  sink: HarnessEvidenceSink | undefined;
  onPerform: ((directive: CommittedHarnessDirective) => void | Promise<void>) | undefined;

  constructor(options: {
    readonly workspaceIdentity: WorkspaceIdentity;
    readonly canonicalCheckout: string;
    readonly attachmentIdentity?: HarnessAttachmentIdentity;
    readonly evidenceIdentity?: string;
    readonly hostVersion?: string;
    readonly availability?: ReviewedHarnessAttachment['availability'];
    readonly manifest?: ReviewedCapabilityManifest;
  }) {
    this.manifest = options.manifest ?? capabilityManifest();
    this.attachment = {
      evidenceIdentity: options.evidenceIdentity ?? 'scripted-attachment-establishment-1',
      attachmentIdentity: options.attachmentIdentity ?? attachmentIdentity('scripted-attachment-1'),
      workspaceIdentity: options.workspaceIdentity,
      hostVersion: options.hostVersion ?? '1.0.0',
      destination: {
        harnessLabel: this.manifest.adapterDisplayName,
        sessionLabel: 'scripted session',
        repositoryLabel: 'test repository',
        canonicalCheckout: options.canonicalCheckout,
      },
      availability: options.availability ?? { status: 'available' },
    };
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.sink = sink;
    return {
      perform: async (directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> => {
        this.directives.push(directive);
        await this.onPerform?.(directive);
        return this.observations.shift() ?? { status: 'accepted-for-observation' };
      },
      release: reason => {
        this.released.push(reason);
      },
    };
  }

  async emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    if (this.sink === undefined) throw new Error('Adapter is not established');
    return await this.sink.accept(evidence);
  }
}

async function firstFileIdentity(workspace: Workspace): Promise<string> {
  const capture = await workspace.read({ kind: 'workspace.current-changes.capture' });
  if (capture.status !== 'captured') throw new Error('Evidence was not captured');
  const manifest = await workspace.read({
    kind: 'workspace.current-changes.manifest',
    evidenceIdentity: capture.evidenceIdentity,
    offset: 0,
    limit: 1,
  });
  if (manifest.status !== 'available' || manifest.files[0] === undefined) {
    throw new Error('Changed file was not available');
  }
  return manifest.files[0].fileIdentity;
}

function requireStarted(result: Awaited<ReturnType<Workspace['execute']>>): CurrentChangesReviewStarted {
  if (result.kind !== 'review.current-changes.started') {
    throw new Error(`Review did not start: ${result.kind}`);
  }
  return result;
}

function requireDraft(result: Awaited<ReturnType<Workspace['execute']>>): ReviewQuestionDraftCreated {
  if (result.kind !== 'review.question-draft.created') {
    throw new Error(`Question Draft was not created: ${result.kind}`);
  }
  return result;
}

function requireBatch(result: Awaited<ReturnType<Workspace['execute']>>): ReviewQuestionBatchCommitted {
  if (result.kind !== 'review.question-batch.committed') {
    throw new Error(`Question Batch was not committed: ${result.kind}`);
  }
  return result;
}

function requireInspection(value: Awaited<ReturnType<Workspace['read']>>): DirectReviewHandoffAvailableView {
  if (value.kind !== 'harness.review-handoff.inspection' || value.status !== 'available') {
    throw new Error('Direct Review Handoff was not available');
  }
  return value;
}

function requireCommitted(result: Awaited<ReturnType<Workspace['execute']>>): DirectReviewHandoffCommitted {
  if (result.kind !== 'harness.review-handoff.direct-committed') {
    throw new Error(`Handoff was not committed: ${result.kind}`);
  }
  return result;
}

async function establish(
  owner: WorkspaceRuntimeOwner,
  options: Partial<ConstructorParameters<typeof ScriptedAdapter>[0]> = {},
): Promise<ScriptedAdapter> {
  const identity = await owner.workspace.read({ kind: 'workspace.identity' });
  const adapter = new ScriptedAdapter({
    workspaceIdentity: identity.workspaceIdentity,
    canonicalCheckout: identity.canonicalCheckout,
    ...options,
  });
  const established = await owner.harnessAdapters.establish(adapter);
  expect(established.status).toBe('established');
  if (established.status !== 'established') {
    throw new Error(`Adapter was refused: ${established.reason}`);
  }
  return adapter;
}

async function inspect(
  workspace: Workspace,
  reviewIdentity: CurrentChangesReviewStarted['reviewIdentity'],
  batch: ReviewQuestionBatchCommitted,
  attachment: HarnessAttachmentIdentity,
): Promise<DirectReviewHandoffAvailableView> {
  return requireInspection(
    await workspace.read({
      kind: 'harness.review-handoff.inspect',
      reviewIdentity,
      reviewBatchIdentity: batch.reviewBatchIdentity,
      attachmentIdentity: attachment,
    }),
  );
}

class FaultingState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  failNextHarnessCommand = false;

  constructor(delegate: AuthoritativeState) {
    this.delegate = delegate;
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    if (this.failNextHarnessCommand && request.result.kind === 'harness.command-result') {
      this.failNextHarnessCommand = false;
      throw new Error('injected Harness Interaction commit failure');
    }
    return await this.delegate.commit(request);
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    return await this.delegate.read(request);
  }

  async readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return await this.delegate.readContent(request);
  }

  async status(): Promise<StateStatus> {
    return await this.delegate.status();
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }
}

/**
 * Test-only State seam: holds the ordinal-th post-arm read of one record
 * identity until the test releases it, so a concurrent command can commit
 * inside another command's optimistic verification window. Every other
 * operation delegates unchanged.
 */
class HeldReadState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  #identity: string | undefined;
  #ordinal = 0;
  #seen = 0;
  #held = false;
  #holdResolve: (() => void) | undefined;
  #releaseResolve: (() => void) | undefined;
  readonly #holding: Promise<void>;
  readonly #release: Promise<void>;

  constructor(delegate: AuthoritativeState) {
    this.delegate = delegate;
    this.#holding = new Promise(resolve => {
      this.#holdResolve = resolve;
    });
    this.#release = new Promise(resolve => {
      this.#releaseResolve = resolve;
    });
  }

  arm(identity: string, ordinal: number): void {
    this.#identity = identity;
    this.#ordinal = ordinal;
    this.#seen = 0;
    this.#held = false;
  }

  async waitUntilHolding(): Promise<void> {
    await this.#holding;
  }

  release(): void {
    this.#releaseResolve?.();
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    if (
      this.#identity !== undefined &&
      !this.#held &&
      request.recordIdentities.length === 1 &&
      request.recordIdentities[0] === this.#identity
    ) {
      this.#seen += 1;
      if (this.#seen === this.#ordinal) {
        this.#held = true;
        this.#holdResolve?.();
        await this.#release;
      }
    }
    return await this.delegate.read(request);
  }

  async readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return await this.delegate.readContent(request);
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    return await this.delegate.commit(request);
  }

  async status(): Promise<StateStatus> {
    return await this.delegate.status();
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }
}

const MESSAGE_LOCATION = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;

interface MessageReview {
  readonly reviewIdentity: CurrentChangesReviewStarted['reviewIdentity'];
  readonly liveBasisIdentity: string;
}

async function startMessageReview(workspace: Workspace, commandIdentity: string): Promise<MessageReview> {
  const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  const started = requireStarted(
    await workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity,
      expectedStateVersion: home.stateVersion,
    }),
  );
  const bases = await workspace.read({
    kind: 'review.bases',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  if (bases.status !== 'available') throw new Error('Review Bases unavailable');
  const live = bases.bases.items.find(item => item.kind === 'live');
  if (live === undefined) throw new Error('Live Basis unavailable');
  return { reviewIdentity: started.reviewIdentity, liveBasisIdentity: live.reviewBasisIdentity };
}

/** Inspects and commits one Message, accepting whatever the inspection asks to confirm. */
async function sendMessage(
  workspace: Workspace,
  review: MessageReview,
  commandIdentity: string,
): Promise<ReviewMessageCommitted> {
  const body = `Is line one right? (${commandIdentity})`;
  const inspection = await workspace.read({
    kind: 'harness.review-message.inspect-default',
    reviewIdentity: review.reviewIdentity,
    originReviewBasisIdentity: review.liveBasisIdentity as never,
    location: MESSAGE_LOCATION,
    body,
  });
  if (inspection.status !== 'available') throw new Error(`Message unavailable: ${inspection.reason}`);
  const committed = await workspace.execute({
    kind: 'review.message.commit',
    commandIdentity,
    expectedStateVersion: inspection.stateVersion,
    reviewIdentity: review.reviewIdentity,
    originReviewBasisIdentity: review.liveBasisIdentity as never,
    location: MESSAGE_LOCATION,
    body,
    attachmentIdentity: inspection.destination.attachmentIdentity,
    inspectionIdentity: inspection.inspectionIdentity,
    acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
      requirement => requirement.requirementIdentity,
    ),
  });
  if (committed.kind !== 'review.message.committed') {
    throw new Error(`Message was not committed: ${'reason' in committed ? String(committed.reason) : committed.kind}`);
  }
  return committed;
}

function decodeJson(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

interface StoredIndexShape {
  readonly formatVersion: number;
  readonly attachments: readonly { readonly attachmentIdentity: string }[];
  readonly handoffs: readonly { readonly handoffIdentity: string; readonly reviewIdentity: string }[];
  readonly invocations: readonly {
    readonly invocationIdentity: string;
    readonly handoffIdentity: string;
    readonly status: string;
  }[];
  readonly preparations: readonly unknown[];
}

interface StoredHistoryShape {
  readonly formatVersion: number;
  readonly reviewIdentity: string;
  readonly handoffs: readonly { readonly handoffIdentity: string }[];
  readonly invocations: readonly { readonly invocationIdentity: string; readonly status: string }[];
}

/**
 * Test-only State seam that writes the Harness index exactly as format 3 did:
 * every entry stays in the one index forever, Attachments never retire, and no
 * Review history exists. Turning it off lets the current code take over.
 */
class FormatThreeIndexState implements AuthoritativeState {
  readonly delegate: AuthoritativeState;
  legacy = true;

  constructor(delegate: AuthoritativeState) {
    this.delegate = delegate;
  }

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    if (!this.legacy) return await this.delegate.commit(request);
    const histories = request.records.filter(record => record.kind === 'harness.review-history');
    const indexRecord = request.records.find(record => record.kind === 'harness.index');
    if (indexRecord === undefined) return await this.delegate.commit(request);
    const priorRecord = (
      await this.delegate.read({ recordIdentities: [indexRecord.recordIdentity], includeContent: false })
    ).records[0];
    const prior =
      priorRecord === undefined
        ? { attachments: [], handoffs: [], invocations: [], preparations: [] }
        : (decodeJson(priorRecord.payload) as Record<string, readonly Record<string, unknown>[]>);
    const next = decodeJson(indexRecord.payload) as Record<string, readonly Record<string, unknown>[]>;
    const moved = histories.map(
      record => decodeJson(record.payload) as Record<string, readonly Record<string, unknown>[]>,
    );
    const merge = (key: string, identity: string): readonly Record<string, unknown>[] => {
      const latest = new Map<unknown, Record<string, unknown>>();
      for (const item of [...(next[key] ?? []), ...moved.flatMap(history => history[key] ?? [])]) {
        latest.set(item[identity], item);
      }
      const kept = (prior[key] ?? []).map(item => latest.get(item[identity]) ?? item);
      const known = new Set(kept.map(item => item[identity]));
      return [...kept, ...[...latest.values()].filter(item => !known.has(item[identity]))];
    };
    const legacyIndex = {
      formatVersion: 3,
      attachments: merge('attachments', 'attachmentIdentity'),
      handoffs: merge('handoffs', 'handoffIdentity'),
      invocations: merge('invocations', 'invocationIdentity'),
      preparations: next['preparations'] ?? [],
    };
    return await this.delegate.commit({
      ...request,
      records: request.records
        .filter(record => record.kind !== 'harness.review-history')
        .map(record =>
          record === indexRecord
            ? { ...record, payload: new TextEncoder().encode(JSON.stringify(legacyIndex)) }
            : record,
        ),
    });
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    return await this.delegate.read(request);
  }

  async readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return await this.delegate.readContent(request);
  }

  async status(): Promise<StateStatus> {
    return await this.delegate.status();
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }
}

describe('Direct Harness Interaction path', () => {
  const owners = new Set<WorkspaceRuntimeOwner>();
  const standaloneStates = new Set<AuthoritativeState>();
  const roots = new Set<string>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function fixture(): Promise<Fixture> {
    const created = await createFixture();
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    return created;
  }

  async function open(checkout: string): Promise<WorkspaceRuntimeOwner> {
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') {
      throw new Error(`Workspace runtime was rejected: ${opened.diagnostic.code}`);
    }
    owners.add(opened.owner);
    return opened.owner;
  }

  async function restart(owner: WorkspaceRuntimeOwner, checkout: string): Promise<WorkspaceRuntimeOwner> {
    await owner.dispose();
    owners.delete(owner);
    return await open(checkout);
  }

  async function openStoredState(checkout: string, workspaceIdentity: WorkspaceIdentity): Promise<AuthoritativeState> {
    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(checkout),
    });
    standaloneStates.add(state);
    return state;
  }

  async function readStoredHarness(
    state: AuthoritativeState,
    workspaceIdentity: WorkspaceIdentity,
    reviewIdentities: readonly string[] = [],
  ): Promise<{
    readonly revision: number;
    readonly index: StoredIndexShape;
    readonly histories: readonly (StoredHistoryShape | undefined)[];
  }> {
    const read = await state.read({
      recordIdentities: [
        stableIdentity('hix', workspaceIdentity),
        ...reviewIdentities.map(reviewIdentity => stableIdentity('hrh', reviewIdentity, 'review-harness-history')),
      ],
      includeContent: false,
    });
    const [indexRecord, ...historyRecords] = read.records;
    if (indexRecord === undefined) throw new Error('Harness index missing');
    return {
      revision: indexRecord.revision,
      index: decodeJson(indexRecord.payload) as StoredIndexShape,
      histories: historyRecords.map(record =>
        record === undefined ? undefined : (decodeJson(record.payload) as StoredHistoryShape),
      ),
    };
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    await Promise.all([...standaloneStates].map(async state => state.close().catch(() => undefined)));
    standaloneStates.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('validates Attachment compatibility and availability without exposing a fallback', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });

    const invalidManifest = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      manifest: {
        ...capabilityManifest(),
        capabilities: [],
      },
    });
    expect(await owner.harnessAdapters.establish(invalidManifest)).toEqual({
      status: 'refused',
      reason: 'invalid-manifest',
    });

    const unsupported = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      hostVersion: '2.0.0',
    });
    expect(await owner.harnessAdapters.establish(unsupported)).toEqual({
      status: 'refused',
      reason: 'unsupported-host-version',
    });

    const wrongWorkspace = new ScriptedAdapter({
      workspaceIdentity: attachmentIdentity('not-a-workspace') as unknown as WorkspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
    });
    expect(await owner.harnessAdapters.establish(wrongWorkspace)).toEqual({
      status: 'refused',
      reason: 'workspace-mismatch',
    });

    const adapter = await establish(owner);
    const attachment = adapter.attachment.attachmentIdentity;
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const review = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'attachment-inspection-review',
        expectedStateVersion: home.stateVersion,
      }),
    );

    expect(
      await owner.workspace.read({
        kind: 'harness.review-question.inspect-default',
        reviewIdentity: review.reviewIdentity,
      }),
    ).toMatchObject({
      kind: 'harness.review-question.default-inspection',
      status: 'available',
      destination: { attachmentIdentity: attachment },
    });

    const blockedAck = await adapter.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'availability-busy-1',
      attachmentIdentity: attachment,
      availability: { status: 'blocked', reason: 'busy' },
    });
    expect(blockedAck.status).toBe('applied');
    const blocked = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: review.reviewIdentity,
    });
    expect(blocked).toMatchObject({
      status: 'unavailable',
      reason: 'availability-blocked',
    });

    const availableAck = await adapter.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'availability-ready-1',
      attachmentIdentity: attachment,
      availability: { status: 'available' },
    });
    expect(availableAck.status).toBe('applied');
    expect(
      await owner.workspace.read({
        kind: 'harness.review-question.inspect-default',
        reviewIdentity: review.reviewIdentity,
      }),
    ).toMatchObject({ status: 'available' });

    // A second session connecting replaces the first: the default route is
    // the newest session, and the first is told why it was released.
    const competing = await establish(owner, {
      attachmentIdentity: attachmentIdentity('scripted-attachment-2'),
      evidenceIdentity: 'scripted-attachment-establishment-2',
    });
    expect(competing.attachment.attachmentIdentity).not.toBe(attachment);
    expect(adapter.released).toEqual(['replaced']);
    expect(competing.released).toEqual([]);
    expect(
      await owner.workspace.read({
        kind: 'harness.review-question.inspect-default',
        reviewIdentity: review.reviewIdentity,
      }),
    ).toMatchObject({
      status: 'available',
      destination: { attachmentIdentity: competing.attachment.attachmentIdentity },
    });
    // With the newest session gone, the released one is not a fallback.
    const competingDisconnectedAck = await competing.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'availability-disconnected-2',
      attachmentIdentity: competing.attachment.attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    expect(competingDisconnectedAck.status).toBe('applied');
    expect(
      await owner.workspace.read({
        kind: 'harness.review-question.inspect-default',
        reviewIdentity: review.reviewIdentity,
      }),
    ).toMatchObject({
      status: 'unavailable',
      reason: 'attachment-not-live',
    });
  });

  it('reports which agents are connected as they connect, leave and come back', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    await expect(owner.workspace.read({ kind: 'harness.connection' })).resolves.toMatchObject({ harnesses: [] });
    const updates: HarnessConnectionView[] = [];
    const unsubscribe = owner.workspace.subscribe({ kind: 'harness.connection' }, update => updates.push(update));
    const latest = async (count: number): Promise<HarnessConnectionView> => {
      for (let attempt = 0; attempt < 200 && updates.length < count; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      expect(updates).toHaveLength(count);
      return updates.at(-1)!;
    };
    expect((await latest(1)).harnesses).toEqual([]);

    const adapter = await establish(owner);
    expect((await latest(2)).harnesses).toEqual([
      {
        attachmentIdentity: adapter.attachment.attachmentIdentity,
        harnessLabel: 'Scripted Harness',
        sessionLabel: 'scripted session',
        connected: true,
        availability: { status: 'available' },
      },
    ]);

    await adapter.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'connection-view-disconnected',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      availability: { status: 'blocked', reason: 'disconnected' },
    });
    expect((await latest(3)).harnesses).toMatchObject([
      { connected: false, availability: { status: 'blocked', reason: 'disconnected' } },
    ]);

    await adapter.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'connection-view-reconnected',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      availability: { status: 'available' },
    });
    expect((await latest(4)).harnesses).toMatchObject([{ connected: true }]);
    // A commit that leaves the agents as they were is no news.
    await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'connection-view-unrelated-commit',
      expectedStateVersion: updates.at(-1)!.stateVersion,
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(updates).toHaveLength(4);
    unsubscribe();

    // After a runtime restart the agent is known but gone until it connects
    // again; reconnecting commits nothing, yet the view still updates.
    const restarted = await restart(owner, created.checkout);
    const afterRestart: HarnessConnectionView[] = [];
    const unsubscribeRestarted = restarted.workspace.subscribe({ kind: 'harness.connection' }, update =>
      afterRestart.push(update),
    );
    for (let attempt = 0; attempt < 200 && afterRestart.length < 1; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(afterRestart.at(-1)?.harnesses).toMatchObject([{ connected: false }]);
    await establish(restarted);
    for (let attempt = 0; attempt < 200 && afterRestart.length < 2; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    expect(afterRestart.at(-1)?.harnesses).toMatchObject([{ connected: true }]);
    unsubscribeRestarted();
  });

  it('routes each Message to the newest connected session and lets an earlier one take it back', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'disconnected message source');
    const owner = await open(created.checkout);
    const first = await establish(owner);
    const second = await establish(owner, {
      attachmentIdentity: attachmentIdentity('scripted-attachment-2'),
      evidenceIdentity: 'scripted-attachment-establishment-2',
    });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'disconnected-message-route-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Disconnected route Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Disconnected route Live Basis unavailable');
    const inspectionRequest = {
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location: { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const,
      body: 'Which Harness session will answer this Message?',
    } as const;
    // The newest connected session receives the Message; nobody is asked to choose.
    await expect(owner.workspace.read(inspectionRequest)).resolves.toMatchObject({
      status: 'available',
      destination: { attachmentIdentity: second.attachment.attachmentIdentity },
    });
    expect(first.released).toEqual(['replaced']);
    // Running /buildframe in the first session again takes the connection back.
    const again = await establish(owner);
    expect(second.released).toEqual(['replaced']);
    await expect(owner.workspace.read(inspectionRequest)).resolves.toMatchObject({
      status: 'available',
      destination: { attachmentIdentity: again.attachment.attachmentIdentity },
    });
    expect(again.attachment.attachmentIdentity).toBe(first.attachment.attachmentIdentity);
    expect(first.directives).toEqual([]);
    expect(second.directives).toEqual([]);
  });

  it('says a Review saved before Messages cannot take one, instead of blaming its review point', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'predates-messages-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    const live = bases.status === 'available' ? bases.bases.items.find(item => item.kind === 'live') : undefined;
    if (live === undefined) throw new Error('Live Basis unavailable');
    await owner.dispose();
    owners.delete(owner);
    // Reviews saved before Messages carry no review-point tree and no Message history.
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    try {
      const indexIdentity = reviewingRecordIdentity('rvi', identity.workspaceIdentity);
      const read = await state.read({ recordIdentities: [indexIdentity], includeContent: false });
      const indexRecord = read.records[0];
      if (indexRecord?.kind !== 'review.index' || indexRecord.recordClass !== 'revisioned') {
        throw new Error('Review index unavailable');
      }
      const index = JSON.parse(new TextDecoder().decode(indexRecord.payload)) as {
        reviews: Record<string, unknown>[];
      };
      const committed = await state.commit({
        commandIdentity: 'strip-review-points',
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
                reviews: index.reviews.map(({ basisTree: _basisTree, messageHistory: _history, ...entry }) => entry),
              }),
            ),
            content: [],
          },
        ],
        result: { kind: 'test.review-points-stripped', schemaVersion: 1, payload: new Uint8Array([1]) },
      });
      if (!('result' in committed)) throw new Error(`Fixture failed: ${committed.reason}`);
    } finally {
      await state.close();
    }
    owner = await open(created.checkout);
    await establish(owner);
    await expect(
      owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: live.reviewBasisIdentity,
        location: { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 },
        body: 'Can this old Review take a Message?',
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'review-predates-messages' });
  });

  it('pins historical manifest key order across durable producers and verifiers', async () => {
    const created = await fixture();
    await git(created.checkout, 'checkout', '--', 'review.txt');
    await writeFile(path.join(created.checkout, 'golden.txt'), 'golden manifest\n');

    let owner = await open(created.checkout);
    const originalAdapter = await establish(owner);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'golden-manifest-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    expect(started.manifest).toEqual({
      formatVersion: 1,
      totalFiles: 1,
      digest: {
        algorithm: 'sha256',
        value: '4d973d8e968903f1e54c3d6778187714e1c53305be32500b0a90b90db930daa3',
      },
    });
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
      throw new Error('Golden Review Manifest unavailable');
    }
    expect(manifest.manifest.files).toEqual([
      expect.objectContaining({
        displayPath: 'golden.txt',
        status: 'added',
        newSide: expect.objectContaining({
          path: 'golden.txt',
          kind: 'regular',
          byteLength: 16,
          content: 'available',
        }),
      }),
    ]);

    // Reopening forces both durable parsers to validate bytes written above
    // before the reviewed Adapter can observe a direct dispatch.
    owner = await restart(owner, created.checkout);
    const adapter = await establish(owner);
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Ask Pi unavailable');
    expect(inspection.stateVersion).toBe(started.stateVersion);
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'golden-manifest-direct-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: {
        kind: 'review.whole-file',
        fileIdentity: manifest.manifest.files[0].fileIdentity,
        side: 'new',
      },
      body: 'Does this exact manifest remain readable?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    if (asked.kind !== 'review.question.asked') {
      throw new Error(`Question was not asked: ${asked.kind}`);
    }
    expect(originalAdapter.directives).toEqual([]);
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review.dispatch') {
      throw new Error('Golden direct directive missing');
    }
    expect(directive.capabilitySnapshot.manifestSha256).toBe(
      '942db29fa80bc8730b83003a86b4e8008893258275c8ec42bdd18dd2281b4c02',
    );
    expect(directive.disclosure.manifest.digest).toEqual(started.manifest.digest);
    expect(directive.disclosure.manifest.files).toEqual([
      expect.objectContaining({
        fileIdentity: manifest.manifest.files[0].fileIdentity,
        status: 'added',
        newSide: expect.objectContaining({
          path: { bytesBase64: 'Z29sZGVuLnR4dA==', display: 'golden.txt' },
        }),
      }),
    ]);
  });

  it('atomically asks from one exact Anchor and materializes the complete correlated Response', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'direct-ask-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    expect(inspection).toMatchObject({
      status: 'available',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Ask Pi unavailable');

    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'one-atomic-direct-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Why is this exact line correct?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    expect(asked).toMatchObject({
      kind: 'review.question.asked',
      status: 'accepted',
      stateVersion: inspection.stateVersion + 1,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Question was not asked');
    expect(asked.reviewSnapshotIdentity).toBe(started.reviewSnapshotIdentity);
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    expect(directive).toMatchObject({
      kind: 'harness.direct-review.dispatch',
      invocationIdentity: asked.invocationIdentity,
    });
    if (directive?.kind !== 'harness.direct-review.dispatch') {
      throw new Error('Direct directive missing');
    }
    expect(directive.disclosure.questions).toEqual([
      expect.objectContaining({
        sourceQuestionIdentity: asked.questionIdentity,
        body: 'Why is this exact line correct?',
        anchor: expect.objectContaining({ side: 'new', line: 1 }),
      }),
    ]);

    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'direct-ask-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    const body = 'Because the immutable Snapshot proves the exact anchored value.';
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'direct-ask-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    });

    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions.status).toBe('available');
    if (questions.status !== 'available') throw new Error('Questions unavailable');
    expect(questions.list.items).toEqual([
      expect.objectContaining({
        kind: 'question',
        itemIdentity: asked.questionIdentity,
        response: expect.objectContaining({
          body: expect.objectContaining({ truncated: false }),
        }),
      }),
    ]);
    const response = questions.list.items[0];
    if (response?.kind !== 'question' || response.response === undefined) {
      throw new Error('Response missing');
    }
    expect(Buffer.from(response.response.body.bytesBase64, 'base64').toString('utf8')).toBe(body);

    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({
      status: 'ended-normally',
      responseIdentity: response.response.responseIdentity,
    });
  });

  it('commits a message against an unchanged file in a clean checkout', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'clean message source');
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'clean-review-message-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    expect(started.manifest.totalFiles).toBe(0);
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Clean Review Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Clean Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 2 } as const;
    const body = 'Does this unchanged café line still express the intended behavior?';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Clean Review Message unavailable');
    const exactOutgoing = `${body}\n\nreview.txt:2`;
    expect(inspection.outgoingMaterial).toMatchObject({
      byteLength: Buffer.byteLength(exactOutgoing),
      characterLength: [...exactOutgoing].length,
      sha256: createHash('sha256').update(exactOutgoing).digest('hex'),
    });
    expect(inspection.outgoingMaterial.byteLength).toBeGreaterThan(inspection.outgoingMaterial.characterLength);
    expect(inspection).not.toHaveProperty('tokenEstimate');
    expect(inspection.limitations).toEqual([
      'The agent may read newer code later.',
      'Naming a file does not limit what the agent can read.',
    ]);
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-clean-review-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    expect(adapter.directives).toHaveLength(1);
  });

  it('reports a lost State version, not a snapshot symptom, for a concurrent Direct Handoff', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'held-handoff-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await owner.dispose();
    owners.delete(owner);
    // Direct Handoff is retained compatibility for the superseded active-Review
    // lifecycle; seed that historical fact before the gated assembly reads.
    await installHistoricalActiveReview(created, identity.workspaceIdentity, started);
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const held = new HeldReadState(state);
    standaloneStates.add(held);
    const assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, held);
    const adapter = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
    });
    expect(await assembly.harnessAdapters.establish(adapter)).toMatchObject({ status: 'established' });
    const fileIdentity = await firstFileIdentity(assembly.workspace);
    const attachedHome = await assembly.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const draft = requireDraft(
      await assembly.workspace.execute({
        kind: 'review.question-draft.create',
        commandIdentity: 'held-handoff-draft',
        expectedStateVersion: attachedHome.stateVersion,
        reviewIdentity: started.reviewIdentity,
        anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
        body: 'Does the held concurrent Handoff report a lost State version?',
      }),
    );
    const batch = requireBatch(
      await assembly.workspace.execute({
        kind: 'review.question-batch.commit',
        commandIdentity: 'held-handoff-batch',
        expectedStateVersion: draft.stateVersion,
        reviewIdentity: started.reviewIdentity,
        draftIdentities: [draft.draftIdentity],
      }),
    );
    const inspected = await inspect(
      assembly.workspace,
      started.reviewIdentity,
      batch,
      adapter.attachment.attachmentIdentity,
    );
    const base = {
      kind: 'harness.review-handoff.commit' as const,
      expectedStateVersion: inspected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewBatchIdentity: batch.reviewBatchIdentity,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      inspectionIdentity: inspected.inspectionIdentity,
      acknowledgeUnresolvedInvocationRisk: false,
    };

    // The losing Handoff reads the context selection only inside Snapshot
    // verification; hold that read until the winner commits.
    held.arm(reviewContextSelectionIdentity(started.reviewIdentity), 1);
    const losing = assembly.workspace.execute({ ...base, commandIdentity: 'held-handoff-b' });
    await held.waitUntilHolding();
    const winning = await assembly.workspace.execute({ ...base, commandIdentity: 'held-handoff-a' });
    expect(winning).toMatchObject({
      kind: 'harness.review-handoff.direct-committed',
      status: 'accepted',
      stateVersion: inspected.stateVersion + 1,
    });
    held.release();
    expect(await losing).toMatchObject({
      kind: 'harness.command.rejected',
      status: 'rejected',
      stateVersion: inspected.stateVersion + 1,
      reason: 'state-version-mismatch',
    });
  });

  it('serializes concurrent Message commits by the State version, not by inspection symptoms', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'concurrent message source');
    const owner = await open(created.checkout);
    await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'concurrent-message-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Concurrent Message Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Concurrent Message Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 2 } as const;
    const body = 'Does the concurrent Message commit serialize on the State version?';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Concurrent Review Message unavailable');
    const base = {
      kind: 'review.message.commit' as const,
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    };
    const results = await Promise.all([
      owner.workspace.execute({ ...base, commandIdentity: 'concurrent-message-a' }),
      owner.workspace.execute({ ...base, commandIdentity: 'concurrent-message-b' }),
    ]);
    const accepted = results.find(result => result.kind === 'review.message.committed');
    const rejectedResult = results.find(result => result.kind === 'harness.command.rejected');
    expect(accepted).toMatchObject({ status: 'accepted', stateVersion: inspection.stateVersion + 1 });
    expect(rejectedResult).toMatchObject({
      status: 'rejected',
      stateVersion: inspection.stateVersion + 1,
      reason: 'state-version-mismatch',
    });
    if (accepted?.kind !== 'review.message.committed' || rejectedResult?.kind !== 'harness.command.rejected') {
      throw new Error('Concurrent Message commit did not serialize');
    }
  });

  it('dispatches a workspace-write Message with the capability authority intact', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'write authority source');
    const owner = await open(created.checkout);
    const adapter = await establish(owner, {
      manifest: capabilityManifest('The Harness may modify the workspace with its session tools.', 'workspace-write'),
    });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'write-authority-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Write authority Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Write authority Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Please rename this constant and keep the diff reviewable.';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Write authority Message unavailable');
    expect(inspection.capability).toMatchObject({
      authority: 'workspace-write',
      effectConstraint: { strength: 'communicated', scope: 'harness-tools' },
    });
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-write-authority-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Write authority directive missing');
    }
    expect(directive.capabilitySnapshot.capability.authority).toBe('workspace-write');
    expect(directive.disclosure.authority).toBe('workspace-write');
  });

  it('renders one user Message template and replays it at commit', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'template source');
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'template-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Template Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Template Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Please rename this constant.';
    const outgoingTemplate = '## Review request\n\n{{message}}\n\nContext: `{{location}}`\n';
    const rendered = `## Review request\n\n${body}\n\nContext: \`review.txt:1\`\n`;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      outgoingTemplate,
    });
    if (inspection.status !== 'available') throw new Error('Templated Message unavailable');
    expect(Buffer.from(inspection.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(rendered);
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-templated-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Templated Message directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(rendered);
  });

  it('commits a cheap preview inspection after the full commit revalidation', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'preview-purpose-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Preview purpose Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Preview purpose Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Preview purpose without the stability proof.';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      purpose: 'preview',
    });
    if (inspection.status !== 'available') throw new Error('Preview purpose Message unavailable');
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-preview-purpose-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    expect(adapter.directives).toHaveLength(1);
  });

  it('refuses an invalid Message template and never re-renders literal placeholders', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'template refusal source');
    const owner = await open(created.checkout);
    await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'template-refusal-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Refusal Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Refusal Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    await expect(
      owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: live.reviewBasisIdentity,
        location,
        body: 'Please rename this constant.',
        outgoingTemplate: '{{message}} {{unknown}}',
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'message-template-invalid' });
    const literal = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body: 'Keep {{location}} as literal text.',
      outgoingTemplate: '## Review request\n\n{{message}}\n\nContext: `{{location}}`\n',
    });
    if (literal.status !== 'available') throw new Error('Literal placeholder Message unavailable');
    expect(Buffer.from(literal.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      '## Review request\n\nKeep {{location}} as literal text.\n\nContext: `review.txt:1`\n',
    );
  });

  it('blocks a live message when its selected file changes after composition and sends nothing', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'moving-message-target-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Moving target Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Moving target Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Please review this selected line.';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Moving target Message unavailable');
    await writeFile(path.join(created.checkout, 'review.txt'), 'different selected bytes\nsame\n');
    const rejected = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'reject-moving-message-target',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(rejected).toMatchObject({
      kind: 'harness.command.rejected',
      status: 'rejected',
      reason: 'inspection-changed',
    });
    expect(adapter.directives).toHaveLength(0);
    await expect(
      owner.workspace.read({
        kind: 'review.messages',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({ messages: { total: 0, items: [] } });

    const reselected = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (reselected.status !== 'available') throw new Error('Reselected Message unavailable');
    expect(reselected.inspectionIdentity).not.toBe(inspection.inspectionIdentity);
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-reselected-message-target',
      expectedStateVersion: reselected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: reselected.destination.attachmentIdentity,
      inspectionIdentity: reselected.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: reselected.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    expect(adapter.directives).toHaveLength(1);
  });

  it('commits one exact live Review Message and forks only when its settled Response is followed by repository change', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'review-message-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Live Review Basis unavailable');
    const body = 'Please explain and propose a safer implementation.';
    const location = {
      pathBytesBase64: Buffer.from('review.txt').toString('base64'),
      line: 1,
    } as const;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    expect(inspection).toMatchObject({
      status: 'available',
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location: { file: { display: 'review.txt' }, line: 1 },
      outgoingMaterial: { representation: 'live-repository-reference' },
    });
    if (inspection.status !== 'available') throw new Error('Review Message unavailable');
    const exactOutgoing = `${body}\n\nreview.txt:1`;
    expect(Buffer.from(inspection.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(exactOutgoing);
    // Unrelated repository churn does not alter or block this exact target.
    await writeFile(path.join(created.checkout, 'notes.txt'), 'unrelated before commitment\n');

    const command = {
      kind: 'review.message.commit',
      commandIdentity: 'commit-one-live-review-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    } as const;
    const committed = await owner.workspace.execute(command);
    expect(committed).toMatchObject({
      kind: 'review.message.committed',
      status: 'accepted',
      stateVersion: inspection.stateVersion + 1,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      outgoingMaterialIdentity: inspection.outgoingMaterial.outgoingMaterialIdentity,
      outgoingMaterial: {
        outgoingMaterialIdentity: inspection.outgoingMaterial.outgoingMaterialIdentity,
        byteLength: inspection.outgoingMaterial.byteLength,
        characterLength: inspection.outgoingMaterial.characterLength,
        sha256: inspection.outgoingMaterial.sha256,
      },
    });
    if (committed.kind !== 'review.message.committed') throw new Error('Review Message was not committed');
    expect(adapter.directives).toHaveLength(1);
    await expect(owner.workspace.execute(command)).resolves.toEqual(committed);
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Review Message directive missing');
    }
    expect(directive.disclosure).toMatchObject({
      payloadKind: 'review-message',
      outgoingMaterial: {
        outgoingMaterialIdentity: committed.outgoingMaterialIdentity,
        sha256: inspection.outgoingMaterial.sha256,
      },
    });
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      exactOutgoing,
    );

    await writeFile(path.join(created.checkout, 'review.txt'), 'changed while Pi answered\nsame\n');
    const beforeResponse = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(
      beforeResponse.status === 'available' && beforeResponse.bases.items.some(item => item.kind === 'change-event'),
    ).toBe(false);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'review-message-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
    const responseBody = 'The first line changed while this Response was being produced.';
    const terminal = await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'review-message-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: responseBody,
        byteLength: Buffer.byteLength(responseBody),
        sha256: createHash('sha256').update(responseBody).digest('hex'),
      },
    });
    if (terminal.status !== 'applied') throw new Error(JSON.stringify(terminal));
    const messages = await owner.workspace.read({
      kind: 'review.messages',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(messages).toMatchObject({
      status: 'available',
      messages: {
        total: 1,
        items: [
          {
            reviewMessageIdentity: committed.reviewMessageIdentity,
            body: { truncated: false },
            originReviewBasisIdentity: live.reviewBasisIdentity,
            response: { body: { truncated: false } },
            changeObservation: {
              outcome: 'forked',
              reviewBasisIdentity: expect.stringMatching(/^rbs_[0-9a-f]{64}$/u),
            },
          },
        ],
      },
    });
    if (messages.status !== 'available') throw new Error('Review Messages unavailable');
    const projectedMessage = messages.messages.items[0];
    if (projectedMessage?.response === undefined) throw new Error('Review Message Response unavailable');
    expect(Buffer.from(projectedMessage.body.bytesBase64, 'base64').toString('utf8')).toBe(body);
    expect(Buffer.from(projectedMessage.response.body.bytesBase64, 'base64').toString('utf8')).toBe(responseBody);
    const afterResponse = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterResponse.status).toBe('available');
    if (afterResponse.status !== 'available') throw new Error('Observed Review Basis unavailable');
    expect(afterResponse.bases.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'change-event',
          parentReviewBasisIdentity: live.reviewBasisIdentity,
          source: expect.objectContaining({
            kind: 'changes-observed-after-response',
            label: 'changes observed after this Response',
          }),
        }),
      ]),
    );

    owner = await restart(owner, created.checkout);
    const restarted = await owner.workspace.read({
      kind: 'review.messages',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(restarted).toMatchObject({
      status: 'available',
      messages: {
        items: [
          {
            reviewMessageIdentity: committed.reviewMessageIdentity,
            body: { truncated: false },
            response: { body: { truncated: false } },
            changeObservation: { outcome: 'forked' },
          },
        ],
      },
    });
    if (restarted.status !== 'available') throw new Error('Restarted Review Messages unavailable');
    const responseIdentity = restarted.messages.items[0]?.response?.responseIdentity;
    if (responseIdentity === undefined) throw new Error('Restarted Review Message Response unavailable');

    // What changed while it was answered: the code kept at send against right
    // after it answered. The file added before sending was already there, so
    // only review.txt changed.
    const sent = { kind: 'sent', reviewMessageIdentity: committed.reviewMessageIdentity } as const;
    const answered = { kind: 'answered', reviewMessageIdentity: committed.reviewMessageIdentity } as const;
    const changes = await owner.workspace.read({
      kind: 'review.step-changes',
      reviewIdentity: started.reviewIdentity,
      from: sent,
      to: answered,
      offset: 0,
      limit: 64,
    });
    expect(changes).toMatchObject({
      status: 'available',
      files: { total: 1, items: [{ path: { display: 'review.txt' }, change: 'modified' }] },
    });
    if (changes.status !== 'available') throw new Error('Review Message changes unavailable');
    const changeDiff = await owner.workspace.read({
      kind: 'review.step-changes-diff',
      reviewIdentity: started.reviewIdentity,
      from: sent,
      to: answered,
      fileIdentity: changes.files.items[0]!.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (changeDiff.status !== 'available') throw new Error('Review Message change rows unavailable');
    const changeRows = changeDiff.window.rows.map(
      row => `${row.kind} ${Buffer.from(row.text.bytesBase64, 'base64').toString('utf8').trimEnd()}`,
    );
    expect(changeRows).toContain('addition changed while Pi answered');
    expect(changeRows).toContain('context same');
    expect(changes.files.items[0]!.lines).toEqual({
      added: changeRows.filter(row => row.startsWith('addition')).length,
      removed: changeRows.filter(row => row.startsWith('deletion')).length,
    });

    // The history: edits before the Message, its answer, and nothing since.
    await expect(
      owner.workspace.read({ kind: 'review.history', reviewIdentity: started.reviewIdentity }),
    ).resolves.toMatchObject({
      status: 'available',
      reachesNow: true,
      steps: [
        { from: { kind: 'start' }, to: sent, kind: 'outside', messageOrdinals: [] },
        {
          from: sent,
          to: answered,
          kind: 'answer',
          messageOrdinals: [1],
          changes: { status: 'changed', paths: [{ display: 'review.txt' }], total: 1 },
        },
        { from: answered, to: { kind: 'now' }, kind: 'outside', changes: { status: 'unchanged' } },
      ],
    });
    // The Messages list names the same file, from fingerprints alone.
    await expect(
      owner.workspace.read({ kind: 'review.messages', reviewIdentity: started.reviewIdentity, offset: 0, limit: 8 }),
    ).resolves.toMatchObject({
      status: 'available',
      messages: {
        items: [
          {
            changeObservation: {
              outcome: 'forked',
              changedFiles: { paths: [{ display: 'review.txt' }], total: 1 },
            },
          },
        ],
      },
    });

    // An edit after the answer lands in the last step, outside answers, and
    // leaves the answer's own step as it was.
    await writeFile(path.join(created.checkout, 'review.txt'), 'edited after the answer\nsame\n');
    await vi.waitFor(
      async () => {
        const later = await owner.workspace.read({ kind: 'review.history', reviewIdentity: started.reviewIdentity });
        expect(later).toMatchObject({
          status: 'available',
          steps: [
            {},
            { changes: { status: 'changed', total: 1 } },
            {
              from: answered,
              to: { kind: 'now' },
              kind: 'outside',
              changes: { status: 'changed', paths: [{ display: 'review.txt' }], total: 1 },
            },
          ],
        });
      },
      { timeout: 10_000, interval: 100 },
    );
    const sinceAnswer = await owner.workspace.read({
      kind: 'review.step-changes-diff',
      reviewIdentity: started.reviewIdentity,
      from: answered,
      to: { kind: 'now' },
      fileIdentity: changes.files.items[0]!.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (sinceAnswer.status !== 'available') throw new Error('Changes since the answer unavailable');
    expect(
      sinceAnswer.window.rows.map(
        row => `${row.kind} ${Buffer.from(row.text.bytesBase64, 'base64').toString('utf8').trimEnd()}`,
      ),
    ).toEqual(['deletion changed while Pi answered', 'addition edited after the answer', 'context same']);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    await owner.dispose();
    owners.delete(owner);
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    standaloneStates.add(state);
    const records = await state.read({
      recordIdentities: [
        committed.reviewBatchIdentity,
        committed.reviewMessageIdentity,
        committed.outgoingMaterialIdentity,
        committed.handoffIdentity,
        committed.commitmentReceiptIdentity,
        responseIdentity,
      ],
      includeContent: true,
    });
    expect(records.records.map(record => record?.kind)).toEqual([
      'review.message-batch',
      'review.message',
      'review.message-outgoing-material',
      'harness.workflow-handoff',
      'harness.commitment-receipt',
      'review.message-response',
    ]);
    const outgoingRecord = records.records[2];
    expect(Buffer.from(outgoingRecord?.content[0]?.bytes ?? []).toString('utf8')).toBe(exactOutgoing);
    const outgoingPayload = JSON.parse(new TextDecoder().decode(outgoingRecord?.payload)) as unknown;
    expect(outgoingPayload).toMatchObject({
      outgoingMaterialIdentity: committed.outgoingMaterialIdentity,
      byteLength: committed.outgoingMaterial.byteLength,
      characterLength: committed.outgoingMaterial.characterLength,
      sha256: committed.outgoingMaterial.sha256,
    });
    const handoffRecord = records.records[3];
    const handoffMaterial = handoffRecord?.content.find(item => item.role === 'outgoing-message');
    expect(Buffer.from(handoffMaterial?.bytes ?? []).toString('utf8')).toBe(exactOutgoing);
    const acceptedDisclosure = handoffRecord?.content.find(item => item.role === 'accepted-disclosure');
    const disclosurePayload = JSON.parse(new TextDecoder().decode(acceptedDisclosure?.bytes)) as unknown;
    expect(disclosurePayload).toMatchObject({
      outgoingMaterial: {
        outgoingMaterialIdentity: committed.outgoingMaterialIdentity,
        bytesBase64: Buffer.from(exactOutgoing).toString('base64'),
        byteLength: committed.outgoingMaterial.byteLength,
        characterLength: committed.outgoingMaterial.characterLength,
        sha256: committed.outgoingMaterial.sha256,
      },
      sha256: committed.outgoingMaterial.sha256,
    });
    const handoffPayload = JSON.parse(new TextDecoder().decode(handoffRecord?.payload)) as unknown;
    expect(handoffPayload).toMatchObject({
      outgoingMaterialIdentity: committed.outgoingMaterialIdentity,
      disclosure: { sha256: committed.outgoingMaterial.sha256 },
    });
    const receiptRecord = records.records[4];
    const receiptPayload = JSON.parse(new TextDecoder().decode(receiptRecord?.payload)) as unknown;
    expect(receiptPayload).toMatchObject({
      scope: {
        outgoingMaterialIdentity: committed.outgoingMaterialIdentity,
        disclosureSha256: committed.outgoingMaterial.sha256,
        disclosureByteLength: committed.outgoingMaterial.byteLength,
        disclosureCharacterLength: committed.outgoingMaterial.characterLength,
      },
    });
  });

  it('shows what changed during an answer that committed part of its work', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'commit-crossing-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Live Review Basis unavailable');
    const body = 'Tidy this up and commit it.';
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Review Message unavailable');
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-crossing-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    if (committed.kind !== 'review.message.committed') throw new Error('Review Message was not committed');

    // While answering, the agent commits review.txt and leaves a new file uncommitted.
    await writeFile(path.join(created.checkout, 'review.txt'), 'committed while answering\nsame\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'Tidy review');
    await writeFile(path.join(created.checkout, 'lexer.txt'), 'left uncommitted\n');
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'commit-crossing-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
    const responseBody = 'Committed the tidy-up.';
    const terminal = await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'commit-crossing-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: responseBody,
        byteLength: Buffer.byteLength(responseBody),
        sha256: createHash('sha256').update(responseBody).digest('hex'),
      },
    });
    if (terminal.status !== 'applied') throw new Error(JSON.stringify(terminal));

    const sent = { kind: 'sent', reviewMessageIdentity: committed.reviewMessageIdentity } as const;
    const answered = { kind: 'answered', reviewMessageIdentity: committed.reviewMessageIdentity } as const;
    const headMove = { kind: 'commits', count: 1, from: { subject: 'basis' }, to: { subject: 'Tidy review' } };
    // The answer's step counts the committed file and the uncommitted one, and names the commit.
    await expect(
      owner.workspace.read({ kind: 'review.history', reviewIdentity: started.reviewIdentity }),
    ).resolves.toMatchObject({
      status: 'available',
      steps: [
        { from: { kind: 'start' }, to: sent },
        {
          from: sent,
          to: answered,
          kind: 'answer',
          changes: { status: 'changed', paths: [{ display: 'lexer.txt' }, { display: 'review.txt' }], total: 2 },
          headMove,
        },
        { from: answered, to: { kind: 'now' }, changes: { status: 'unchanged' } },
      ],
    });
    await expect(
      owner.workspace.read({ kind: 'review.messages', reviewIdentity: started.reviewIdentity, offset: 0, limit: 8 }),
    ).resolves.toMatchObject({
      status: 'available',
      messages: { items: [{ changeObservation: { outcome: 'forked', changedFiles: { total: 2 } } }] },
    });

    const changes = await owner.workspace.read({
      kind: 'review.step-changes',
      reviewIdentity: started.reviewIdentity,
      from: sent,
      to: answered,
      offset: 0,
      limit: 64,
    });
    if (changes.status !== 'available') throw new Error(`Step changes unavailable: ${JSON.stringify(changes)}`);
    expect(changes.files.items.map(item => [item.path.display, item.change])).toEqual([
      ['lexer.txt', 'added'],
      ['review.txt', 'modified'],
    ]);
    const reviewFile = changes.files.items.find(item => item.path.display === 'review.txt')!;
    const rows = await owner.workspace.read({
      kind: 'review.step-changes-diff',
      reviewIdentity: started.reviewIdentity,
      from: sent,
      to: answered,
      fileIdentity: reviewFile.fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (rows.status !== 'available') throw new Error('Step change rows unavailable');
    // From the code at send (uncommitted "after") to the committed version.
    expect(
      rows.window.rows.map(
        row => `${row.kind} ${Buffer.from(row.text.bytesBase64, 'base64').toString('utf8').trimEnd()}`,
      ),
    ).toEqual(['deletion after', 'addition committed while answering', 'context same']);

    // Resetting HEAD back to where it was is a move, not a commit.
    await git(created.checkout, 'reset', '-q', '--hard', 'HEAD~1');
    await vi.waitFor(
      async () => {
        const later = await owner.workspace.read({ kind: 'review.history', reviewIdentity: started.reviewIdentity });
        expect(later).toMatchObject({
          status: 'available',
          steps: [
            {},
            { headMove },
            {
              from: answered,
              to: { kind: 'now' },
              headMove: { kind: 'moved', from: { subject: 'Tidy review' }, to: { subject: 'basis' } },
            },
          ],
        });
      },
      { timeout: 10_000, interval: 100 },
    );
  });

  it('quotes exact saved-origin bytes with a safe fence and anchors later Responses to the commitment-time repository', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'review.txt'), 'value = ```;\nsame\n');
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'saved-message-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const initialBases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (initialBases.status !== 'available') throw new Error('Initial Review Bases unavailable');
    const live = initialBases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Live Review Basis unavailable');
    const saved = await owner.workspace.execute({
      kind: 'review.basis.fork',
      commandIdentity: 'save-message-origin',
      expectedStateVersion: initialBases.stateVersion,
      reviewIdentity: started.reviewIdentity,
      parentReviewBasisIdentity: live.reviewBasisIdentity,
    });
    if (saved.kind !== 'review.basis.forked') throw new Error('Saved Review Basis failed');
    await writeFile(path.join(created.checkout, 'review.txt'), 'current implementation\nsame\n');

    const body = 'Why was this marker retained?';
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Saved-origin Review Message unavailable');
    const exactOutgoing = [
      body,
      '',
      'From saved review point — review.txt:1:',
      '',
      '````',
      'value = ```;',
      '````',
      '',
      'review.txt:1 — historical source (saved review point, not current code)',
    ].join('\n');
    expect(Buffer.from(inspection.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(exactOutgoing);
    // Saved-origin revalidation is independent of later movement in current code.
    await writeFile(path.join(created.checkout, 'review.txt'), 'current moved after composition\nsame\n');
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-saved-origin-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    if (committed.kind !== 'review.message.committed') throw new Error('Saved-origin Message failed');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Saved-origin Review Message directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      exactOutgoing,
    );
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'saved-message-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
    const responseBody = 'It was retained to preserve compatibility.';
    const terminal = await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'saved-message-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: responseBody,
        byteLength: Buffer.byteLength(responseBody),
        sha256: createHash('sha256').update(responseBody).digest('hex'),
      },
    });
    expect(terminal.status).toBe('applied');
    const messages = await owner.workspace.read({
      kind: 'review.messages',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(messages).toMatchObject({
      status: 'available',
      messages: {
        items: [
          {
            reviewMessageIdentity: committed.reviewMessageIdentity,
            originReviewBasisIdentity: saved.reviewBasisIdentity,
            changeObservation: { outcome: 'unchanged' },
          },
        ],
      },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.step-changes',
        reviewIdentity: started.reviewIdentity,
        from: { kind: 'sent', reviewMessageIdentity: committed.reviewMessageIdentity },
        to: { kind: 'answered', reviewMessageIdentity: committed.reviewMessageIdentity },
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({ status: 'available', files: { total: 0, items: [] } });
    await writeFile(path.join(created.checkout, 'review.txt'), 'unrelated later typing\nsame\n');
    const tree = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(tree.status).toBe('available');
    if (tree.status !== 'available') throw new Error('Saved-origin tree unavailable');
    expect(tree.bases.items.some(item => item.kind === 'change-event')).toBe(false);
    const origin = await owner.workspace.read({
      kind: 'review.message-origin',
      reviewIdentity: started.reviewIdentity,
      reviewMessageIdentity: committed.reviewMessageIdentity,
    });
    expect(origin).toMatchObject({
      status: 'available',
      basis: { reviewBasisIdentity: saved.reviewBasisIdentity },
      source: { kind: 'review-snapshot', reviewSnapshotIdentity: saved.reviewSnapshotIdentity },
    });
  });

  it('quotes a commit Review line from its saved copy when the file exists only on another branch', async () => {
    const created = await fixture();
    const gitExecutable = await resolveGitExecutable();
    const revParse = async (revision: string): Promise<string> =>
      (await execFileAsync(gitExecutable, ['-C', created.checkout, 'rev-parse', revision])).stdout.trim();
    const home = await revParse('HEAD');
    await git(created.checkout, 'checkout', '-q', '-b', 'side');
    await writeFile(path.join(created.checkout, 'branch-only.txt'), 'first\nonly on side\n');
    await git(created.checkout, 'add', 'branch-only.txt');
    await git(created.checkout, 'commit', '-qm', 'Side work');
    const side = await revParse('HEAD');
    await git(created.checkout, 'checkout', '-q', home);
    await expect(access(path.join(created.checkout, 'branch-only.txt'))).rejects.toThrow();

    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const state = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'branch-only-review-start',
      expectedStateVersion: state.stateVersion,
      selection: { kind: 'commit', revision: side },
      expectedBasisObjectIdentity: home,
      expectedComparedObjectIdentity: side,
    });
    if (started.kind !== 'review.comparison.started') throw new Error('Commit Review did not start');
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review Bases unavailable');
    const commitBasis = bases.bases.items.find(item => item.kind === 'git-commit');
    if (commitBasis?.kind !== 'git-commit') throw new Error('Commit basis missing');
    expect(commitBasis.source.commit.objectIdentity).toBe(side);

    const body = 'What is this line for?';
    const location = { pathBytesBase64: Buffer.from('branch-only.txt').toString('base64'), line: 2 } as const;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: commitBasis.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error(`Commit-origin Message unavailable: ${inspection.reason}`);
    const exactOutgoing = [
      body,
      '',
      `From ${commitBasis.source.commit.abbreviatedObjectIdentity} · Side work — branch-only.txt:2:`,
      '',
      '```',
      'only on side',
      '```',
      '',
      'branch-only.txt:2 — historical source (saved review point, not current code)',
    ].join('\n');
    expect(Buffer.from(inspection.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(exactOutgoing);

    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-branch-only-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: commitBasis.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    if (committed.kind !== 'review.message.committed') throw new Error('Commit-origin Message failed');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') throw new Error('Directive missing');
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      exactOutgoing,
    );
  });

  it('templates a saved-origin Message with source and origin placeholders', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'review.txt'), 'value = ```;\nsame\n');
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'templated-saved-origin-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const initialBases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (initialBases.status !== 'available') throw new Error('Initial Review Bases unavailable');
    const live = initialBases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Live Review Basis unavailable');
    const saved = await owner.workspace.execute({
      kind: 'review.basis.fork',
      commandIdentity: 'save-templated-message-origin',
      expectedStateVersion: initialBases.stateVersion,
      reviewIdentity: started.reviewIdentity,
      parentReviewBasisIdentity: live.reviewBasisIdentity,
    });
    if (saved.kind !== 'review.basis.forked') throw new Error('Saved Review Basis failed');
    const body = 'Why was this marker retained?';
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const origin = 'From saved review point — review.txt:1:';
    const caveat = 'review.txt:1 — historical source (saved review point, not current code)';
    const source = ['````', 'value = ```;', '````', '', caveat].join('\n');
    const fixed = [body, '', origin, '', source].join('\n');

    // The historical decomposition reproduces the fixed structure byte for byte.
    const equivalent = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
      outgoingTemplate: '{{message}}\n\n{{origin}}\n\n{{source}}',
    });
    if (equivalent.status !== 'available') throw new Error('Equivalent saved-origin template unavailable');
    expect(Buffer.from(equivalent.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(fixed);

    // A structured historical template commits exactly the previewed bytes.
    const template = '## Review request\n\n{{message}}\n\n{{origin}}\n\n{{source}}\n';
    const rendered = `## Review request\n\n${body}\n\n${origin}\n\n${source}\n`;
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
      outgoingTemplate: template,
    });
    if (inspection.status !== 'available') throw new Error('Templated saved-origin Message unavailable');
    expect(Buffer.from(inspection.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(rendered);
    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-templated-saved-origin-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    if (committed.kind !== 'review.message.committed') throw new Error('Templated saved-origin Message failed');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Templated saved-origin directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(rendered);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'templated-saved-origin-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'templated-saved-origin-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
      outcome: 'ended-normally',
    });

    // An unpaired historical placeholder is invalid on either origin.
    await expect(
      owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: saved.reviewBasisIdentity,
        location,
        body,
        outgoingTemplate: '{{message}} {{location}} {{source}}',
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'message-template-invalid' });

    // A live template leaves the saved-origin structure fixed.
    const liveTemplate = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: saved.reviewBasisIdentity,
      location,
      body,
      outgoingTemplate: '## Review request\n\n{{message}}\n\nContext: `{{location}}`\n',
    });
    if (liveTemplate.status !== 'available') throw new Error('Live template on saved origin unavailable');
    expect(Buffer.from(liveTemplate.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(fixed);

    // A historical template on a live Message is invalid instead of fabricating history.
    await expect(
      owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: live.reviewBasisIdentity,
        location,
        body,
        outgoingTemplate: template,
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'message-template-invalid' });
  });

  it('records one interruption and recalls reordered commands without another effect', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'interruption-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Ask Pi unavailable');
    const askCommand = {
      kind: 'review.question.ask',
      commandIdentity: 'interruption-direct-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity,
        side: 'new',
        line: 1,
      },
      body: 'Please keep this invocation interruptible.',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    } as const;
    const asked = await owner.workspace.execute(askCommand);
    if (asked.kind !== 'review.question.asked') {
      throw new Error(`Question was not asked: ${asked.kind}`);
    }
    expect(adapter.directives).toHaveLength(1);
    expect(adapter.directives[0]).toMatchObject({
      kind: 'harness.direct-review.dispatch',
      invocationIdentity: asked.invocationIdentity,
    });

    const command = {
      kind: 'harness.invocation.interruption.request' as const,
      commandIdentity: 'interruption-intent-once',
      expectedStateVersion: asked.stateVersion,
      invocationIdentity: asked.invocationIdentity,
    };
    const interrupted = await owner.workspace.execute(command);
    expect(interrupted).toMatchObject({
      kind: 'harness.invocation.interruption-requested',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: asked.stateVersion + 1,
      invocationIdentity: asked.invocationIdentity,
      interruptionIntentIdentity: expect.stringMatching(/^hir_[0-9a-f]{64}$/u),
      route: 'direct-request',
    });
    if (interrupted.kind !== 'harness.invocation.interruption-requested') {
      throw new Error(`Interruption was not accepted: ${interrupted.kind}`);
    }
    expect(adapter.directives).toHaveLength(2);
    expect(adapter.directives[1]).toEqual({
      kind: 'harness.direct-invocation.interrupt',
      contractVersion: 1,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      interruptionIntentIdentity: interrupted.interruptionIntentIdentity,
    });

    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction).toMatchObject({
      stateVersion: asked.stateVersion + 1,
      invocations: [
        {
          invocationIdentity: asked.invocationIdentity,
          status: 'awaiting-start',
          missingStartEvidence: true,
          missingTerminalEvidence: true,
          totalEvidence: 0,
          evidenceIdentities: [],
          interruptionIntentIdentities: [interrupted.interruptionIntentIdentity],
        },
      ],
    });
    const commandResult = await owner.workspace.read({
      kind: 'harness.command-result',
      commandIdentity: command.commandIdentity,
    });
    expect(commandResult).toMatchObject({
      status: 'available',
      stateVersion: asked.stateVersion + 1,
      committedStateVersion: asked.stateVersion + 1,
      result: interrupted,
    });

    // Durable recall after owner restart must ignore caller insertion order and
    // precede dispatch, current-version checks, or any second durable effect.
    owner = await restart(owner, created.checkout);
    // Restart records the lost in-flight turn once; recall must add nothing after it.
    const afterRestart = (await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion;
    expect(afterRestart).toBe(asked.stateVersion + 2);
    const reattached = await establish(owner);
    const reorderedAsk = reverseKeyOrder({
      ...askCommand,
      anchor: reverseKeyOrder(askCommand.anchor),
    });
    const reorderedInterruption = reverseKeyOrder(command);
    expect(Object.keys(reorderedAsk)).toEqual(Object.keys(askCommand).reverse());
    expect(Object.keys(reorderedAsk.anchor)).toEqual(Object.keys(askCommand.anchor).reverse());
    expect(Object.keys(reorderedInterruption)).toEqual(Object.keys(command).reverse());
    expect(reattached.directives).toEqual([]);
    expect(await owner.workspace.execute(reorderedAsk)).toEqual(asked);
    expect(await owner.workspace.execute(reorderedInterruption)).toEqual(interrupted);
    expect(adapter.directives).toHaveLength(2);
    expect(reattached.directives).toHaveLength(0);
    const afterReplay = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterReplay.stateVersion).toBe(afterRestart);
    expect(afterReplay.invocations).toHaveLength(1);
    expect(afterReplay.invocations[0]?.interruptionIntentIdentities).toEqual([interrupted.interruptionIntentIdentity]);
    const afterQuestions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (afterQuestions.status !== 'available') {
      throw new Error('Replayed Questions unavailable');
    }
    expect(afterQuestions.list.items).toEqual([expect.objectContaining({ itemIdentity: asked.questionIdentity })]);

    const missing = await owner.workspace.execute({
      kind: 'harness.invocation.interruption.request',
      commandIdentity: 'interruption-missing-invocation',
      expectedStateVersion: afterRestart,
      invocationIdentity: `hin_${'0'.repeat(64)}` as HarnessInvocationIdentity,
    });
    expect(missing).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'invocation-not-found',
      stateVersion: afterRestart,
    });
    // The turn's connection ended with the old runtime: its outcome is unknown,
    // late evidence cannot rewrite that, and there is nothing left to interrupt.
    expect(afterReplay.invocations[0]).toMatchObject({
      invocationIdentity: asked.invocationIdentity,
      status: 'unresolved',
      terminalReason: 'attachment-lost',
      interruptionIntentIdentities: [interrupted.interruptionIntentIdentity],
    });
    expect(
      await reattached.emit({
        kind: 'harness.invocation.start-observed',
        evidenceIdentity: 'interruption-start',
        attachmentIdentity: reattached.attachment.attachmentIdentity,
        invocationIdentity: asked.invocationIdentity,
      }),
    ).toMatchObject({ status: 'refused', reason: 'illegal-evidence-order' });
    expect(
      await owner.workspace.execute({
        kind: 'harness.invocation.interruption.request',
        commandIdentity: 'interruption-terminal-invocation',
        expectedStateVersion: afterRestart,
        invocationIdentity: asked.invocationIdentity,
      }),
    ).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'invocation-not-interruptible',
      stateVersion: afterRestart,
    });
    expect(adapter.directives).toHaveLength(2);
    expect(reattached.directives).toHaveLength(0);
  });

  it('recalls a reordered historical Handoff without another durable effect', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'reordered-handoff-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );

    // Direct Handoff is retained compatibility for the superseded active-Review
    // lifecycle. Seed that historical fact without restoring an Application producer.
    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const historicalStateVersion = await installHistoricalActiveReview(created, workspaceIdentity, started);
    owner = await open(created.checkout);
    const adapter = await establish(owner);
    const attachedHome = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(attachedHome.stateVersion).toBe(historicalStateVersion + 1);
    const draft = requireDraft(
      await owner.workspace.execute({
        kind: 'review.question-draft.create',
        commandIdentity: 'reordered-handoff-draft',
        expectedStateVersion: attachedHome.stateVersion,
        reviewIdentity: started.reviewIdentity,
        anchor: {
          kind: 'review.diff-line',
          fileIdentity,
          side: 'new',
          line: 1,
        },
        body: 'Does this historical Handoff remain idempotent?',
      }),
    );
    const batch = requireBatch(
      await owner.workspace.execute({
        kind: 'review.question-batch.commit',
        commandIdentity: 'reordered-handoff-batch',
        expectedStateVersion: draft.stateVersion,
        reviewIdentity: started.reviewIdentity,
        draftIdentities: [draft.draftIdentity],
      }),
    );
    const inspected = await inspect(
      owner.workspace,
      started.reviewIdentity,
      batch,
      adapter.attachment.attachmentIdentity,
    );
    const command = {
      kind: 'harness.review-handoff.commit' as const,
      commandIdentity: 'reordered-handoff-commit',
      expectedStateVersion: inspected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      reviewBatchIdentity: batch.reviewBatchIdentity,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      inspectionIdentity: inspected.inspectionIdentity,
      acknowledgeUnresolvedInvocationRisk: false,
    };
    const committed = requireCommitted(await owner.workspace.execute(command));
    expect(adapter.directives).toHaveLength(1);
    expect(adapter.directives[0]).toMatchObject({
      kind: 'harness.direct-review.dispatch',
      handoffIdentity: committed.handoffIdentity,
      invocationIdentity: committed.invocationIdentity,
    });

    owner = await restart(owner, created.checkout);
    // Restart records the lost in-flight turn once; recall must add nothing after it.
    const afterRestart = (await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion;
    expect(afterRestart).toBe(committed.stateVersion + 1);
    const reattached = await establish(owner);
    const reordered = reverseKeyOrder(command);
    expect(Object.keys(reordered)).toEqual(Object.keys(command).reverse());
    expect(await owner.workspace.execute(reordered)).toEqual(committed);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(afterRestart);
    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.stateVersion).toBe(afterRestart);
    expect(interaction.invocations).toEqual([
      expect.objectContaining({
        invocationIdentity: committed.invocationIdentity,
        handoffIdentity: committed.handoffIdentity,
        status: 'unresolved',
      }),
    ]);
    expect(adapter.directives).toHaveLength(1);
    expect(reattached.directives).toHaveLength(0);
  });

  it('preserves exact line and whole-file Anchors across one successor Snapshot', async () => {
    const created = await fixture();
    await git(created.checkout, 'checkout', '--', 'review.txt');
    await writeFile(path.join(created.checkout, 'deleted.txt'), 'deleted line\n');
    await git(created.checkout, 'add', 'deleted.txt');
    await git(created.checkout, 'commit', '-qm', 'add deletion fixture');
    await writeFile(path.join(created.checkout, 'review.txt'), 'after\nsame\n');
    await rm(path.join(created.checkout, 'deleted.txt'));
    await writeFile(path.join(created.checkout, 'new.txt'), 'new line\n');
    await writeFile(path.join(created.checkout, 'empty.txt'), '');
    await writeFile(path.join(created.checkout, 'binary.bin'), new Uint8Array([0, 1, 2, 3]));

    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'whole-file-anchor-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available') throw new Error('Manifest unavailable');
    const file = (displayPath: string) => {
      const fileAbsolute = manifest.manifest.files.findIndex(candidate => candidate.displayPath === displayPath);
      const projected = manifest.manifest.files[fileAbsolute];
      if (projected === undefined) throw new Error(`${displayPath} missing`);
      return { fileIdentity: projected.fileIdentity, fileAbsolute };
    };
    const empty = file('empty.txt');
    const binary = file('binary.bin');
    const added = file('new.txt');
    const deleted = file('deleted.txt');
    await writeFile(path.join(created.checkout, 'review.txt'), 'whole-file successor\nsame\n');

    const ask = async (commandIdentity: string, anchor: ReviewAnchorInput) => {
      const inspection = await owner.workspace.read({
        kind: 'harness.review-question.inspect-default',
        reviewIdentity: started.reviewIdentity,
      });
      if (inspection.status !== 'available') throw new Error('Ask unavailable');
      const result = await owner.workspace.execute({
        kind: 'review.question.ask',
        commandIdentity,
        expectedStateVersion: inspection.stateVersion,
        reviewIdentity: started.reviewIdentity,
        anchor,
        body: `Question for ${commandIdentity}?`,
        attachmentIdentity: inspection.destination.attachmentIdentity,
        inspectionIdentity: inspection.inspectionIdentity,
      });
      if (result.kind !== 'review.question.asked') {
        throw new Error(`Ask rejected: ${result.kind}`);
      }
      const directive = adapter.directives.at(-1);
      if (directive?.kind !== 'harness.direct-review.dispatch') {
        throw new Error('Direct disclosure missing');
      }
      await adapter.emit({
        kind: 'harness.invocation.start-observed',
        evidenceIdentity: `${commandIdentity}-start`,
        attachmentIdentity: adapter.attachment.attachmentIdentity,
        invocationIdentity: result.invocationIdentity,
      });
      await adapter.emit({
        kind: 'harness.invocation.terminal-observed',
        evidenceIdentity: `${commandIdentity}-terminal`,
        attachmentIdentity: adapter.attachment.attachmentIdentity,
        invocationIdentity: result.invocationIdentity,
        outcome: 'failed',
        reason: 'harness-failed',
      });
      return { result, anchor: directive.disclosure.questions[0]!.anchor };
    };

    const emptyAsk = await ask('ask-empty-whole-file', {
      kind: 'review.whole-file',
      ...empty,
      side: 'new',
    });
    expect(emptyAsk.result.reviewSnapshotIdentity).not.toBe(started.reviewSnapshotIdentity);
    expect(emptyAsk.anchor).toMatchObject({
      kind: 'review.whole-file',
      reviewSnapshotIdentity: emptyAsk.result.reviewSnapshotIdentity,
      fileIdentity: empty.fileIdentity,
      side: 'new',
      scope: 'file',
      fileAbsolute: empty.fileAbsolute,
      content: {
        status: 'available',
        byteLength: 0,
        contentIdentity: {
          algorithm: 'sha256',
          value: createHash('sha256').update('').digest('hex'),
        },
      },
    });
    const addedAsk = await ask('ask-new-text-line', {
      kind: 'review.diff-line',
      fileIdentity: added.fileIdentity,
      side: 'new',
      line: 1,
    });
    expect(addedAsk.anchor).toMatchObject({
      kind: 'review.diff-line',
      side: 'new',
      line: 1,
    });
    const deletedAsk = await ask('ask-deleted-text-line', {
      kind: 'review.diff-line',
      fileIdentity: deleted.fileIdentity,
      side: 'old',
      line: 1,
    });
    expect(deletedAsk.anchor).toMatchObject({
      kind: 'review.diff-line',
      side: 'old',
      line: 1,
    });
    const binaryAsk = await ask('ask-binary-whole-file', {
      kind: 'review.whole-file',
      ...binary,
      side: 'new',
    });
    expect(binaryAsk.anchor).toMatchObject({
      kind: 'review.whole-file',
      side: 'new',
      scope: 'file',
      content: {
        status: 'available',
        classification: 'binary',
        byteLength: 4,
      },
    });
    expect(binaryAsk.result.reviewSnapshotIdentity).toBe(emptyAsk.result.reviewSnapshotIdentity);

    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions).toMatchObject({
      status: 'available',
      list: {
        items: [
          { target: { kind: 'review.whole-file', scope: 'file' } },
          { target: { kind: 'review.diff-line', side: 'new', line: 1 } },
          { target: { kind: 'review.diff-line', side: 'old', line: 1 } },
          { target: { kind: 'review.whole-file', scope: 'file' } },
        ],
      },
    });

    const racingInspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (racingInspection.status !== 'available') throw new Error('Ask unavailable');
    await rm(path.join(created.checkout, 'empty.txt'));
    expect(
      await owner.workspace.execute({
        kind: 'review.question.ask',
        commandIdentity: 'racing-whole-file-anchor',
        expectedStateVersion: racingInspection.stateVersion,
        reviewIdentity: started.reviewIdentity,
        anchor: { kind: 'review.whole-file', ...empty, side: 'new' },
        body: 'Should a moved whole-file target commit?',
        attachmentIdentity: racingInspection.destination.attachmentIdentity,
        inspectionIdentity: racingInspection.inspectionIdentity,
      }),
    ).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'inspection-changed',
      stateVersion: racingInspection.stateVersion,
    });
    expect(adapter.directives).toHaveLength(4);
    const unchanged = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(unchanged.currentReview?.reviewSnapshotIdentity).toBe(emptyAsk.result.reviewSnapshotIdentity);

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created.checkout);
    expect(
      await owner.workspace.read({
        kind: 'review.questions',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 8,
      }),
    ).toMatchObject({
      list: {
        items: [
          { target: { kind: 'review.whole-file', scope: 'file' } },
          { target: { kind: 'review.diff-line' } },
          { target: { kind: 'review.diff-line' } },
          { target: { kind: 'review.whole-file', scope: 'file' } },
        ],
      },
    });
    const reconstructedInteraction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(reconstructedInteraction.handoffs).toHaveLength(4);
    expect(reconstructedInteraction.invocations).toHaveLength(4);
  });

  it('atomically creates one successor Snapshot on the first Ask after source changes', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'successor-ask-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await writeFile(path.join(created.checkout, 'review.txt'), 'successor\nsame\n');

    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    expect(inspection.status).toBe('available');
    if (inspection.status !== 'available') throw new Error('Ask unavailable');
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'first-successor-direct-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Why is the successor line correct?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    expect(asked).toMatchObject({
      kind: 'review.question.asked',
      status: 'accepted',
      stateVersion: inspection.stateVersion + 1,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Ask failed');
    expect(asked.reviewSnapshotIdentity).not.toBe(started.reviewSnapshotIdentity);
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review.dispatch') {
      throw new Error('Successor directive missing');
    }
    expect(directive.disclosure).toMatchObject({
      reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
      questions: [
        expect.objectContaining({
          anchor: expect.objectContaining({
            reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
            side: 'new',
            line: 1,
          }),
        }),
      ],
    });
    const disclosedAnchor = directive.disclosure.questions[0]!.anchor;
    if (disclosedAnchor.kind !== 'review.diff-line') {
      throw new Error('Expected a line Anchor');
    }
    expect(Buffer.from(disclosedAnchor.lineContent.bytesBase64, 'base64').toString('utf8')).toBe('successor');

    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'successor-first-ask-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'successor-first-ask-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      outcome: 'failed',
      reason: 'harness-failed',
    });
    const followUpInspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (followUpInspection.status !== 'available') {
      throw new Error('Follow-up Ask unavailable');
    }
    const followUp = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'unchanged-successor-follow-up',
      expectedStateVersion: followUpInspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Does this reuse the exact successor?',
      attachmentIdentity: followUpInspection.destination.attachmentIdentity,
      inspectionIdentity: followUpInspection.inspectionIdentity,
    });
    if (followUp.kind !== 'review.question.asked') {
      throw new Error('Follow-up Ask failed');
    }
    expect(followUp.reviewSnapshotIdentity).toBe(asked.reviewSnapshotIdentity);
    expect(adapter.directives).toHaveLength(2);

    const versions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versions).toMatchObject({
      status: 'available',
      stateVersion: followUp.stateVersion,
      latestReviewSnapshotIdentity: asked.reviewSnapshotIdentity,
      versions: {
        total: 2,
        items: [
          {
            reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
            previousReviewSnapshotIdentity: started.reviewSnapshotIdentity,
            ordinal: 2,
            isLatest: true,
          },
          {
            reviewSnapshotIdentity: started.reviewSnapshotIdentity,
            ordinal: 1,
            isLatest: false,
          },
        ],
        nextOffset: null,
      },
    });
    const historicalManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (historicalManifest.status !== 'available') {
      throw new Error('Historical version unavailable');
    }
    expect(historicalManifest.header).toMatchObject({
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      latestReviewSnapshotIdentity: asked.reviewSnapshotIdentity,
      version: { ordinal: 1, total: 2, isLatest: false },
    });
    expect(historicalManifest.actions).toEqual([]);
    const historicalDiff = await owner.workspace.read({
      kind: 'review.diff',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      fileIdentity,
      offset: 0,
      limit: 64,
    });
    if (historicalDiff.status !== 'available') {
      throw new Error('Historical version Diff unavailable');
    }
    expect(historicalDiff.actions).toEqual([]);
    expect(
      historicalDiff.window.rows.map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8')).join(''),
    ).toContain('after');
    expect(
      historicalDiff.window.rows.map(row => Buffer.from(row.text.bytesBase64, 'base64').toString('utf8')).join(''),
    ).not.toContain('successor');
    const historicalQuestions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      offset: 0,
      limit: 8,
    });
    expect(historicalQuestions).toMatchObject({
      status: 'available',
      header: {
        reviewSnapshotIdentity: started.reviewSnapshotIdentity,
        version: { ordinal: 1, isLatest: false },
      },
      list: { totalItems: 0, items: [] },
      actions: [],
    });
    const successorQuestions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
      offset: 0,
      limit: 8,
    });
    expect(successorQuestions).toMatchObject({
      status: 'available',
      header: {
        reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
        version: { ordinal: 2, isLatest: true },
      },
      list: { totalItems: 2 },
    });
    await expect(
      owner.workspace.read({
        kind: 'review.versions',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 65,
      }),
    ).rejects.toThrow('Invalid bounded Review Versions window');

    const projectedHome = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(projectedHome.currentReview?.reviewSnapshotIdentity).toBe(asked.reviewSnapshotIdentity);
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions.status).toBe('available');
    if (questions.status !== 'available') throw new Error('Questions unavailable');
    expect(questions.list.items[0]).toMatchObject({
      itemIdentity: asked.questionIdentity,
      target: {
        reviewSnapshotIdentity: asked.reviewSnapshotIdentity,
        fileIdentity,
        side: 'new',
        line: 1,
      },
    });

    owner = await restart(owner, created.checkout);
    const reconstructed = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(reconstructed.currentReview?.reviewSnapshotIdentity).toBe(asked.reviewSnapshotIdentity);
    expect(
      await owner.workspace.read({
        kind: 'review.versions',
        reviewIdentity: started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).toMatchObject({
      latestReviewSnapshotIdentity: asked.reviewSnapshotIdentity,
      versions: {
        items: [
          { reviewSnapshotIdentity: asked.reviewSnapshotIdentity, ordinal: 2 },
          { reviewSnapshotIdentity: started.reviewSnapshotIdentity, ordinal: 1 },
        ],
      },
    });

    const workspaceIdentity = owner.workspaceIdentity;
    await owner.dispose();
    owners.delete(owner);
    const state = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    standaloneStates.add(state);
    const indexIdentity = reviewingRecordIdentity('rvi', workspaceIdentity);
    const durable = await state.read({
      recordIdentities: [indexIdentity, started.reviewSnapshotIdentity, asked.reviewSnapshotIdentity],
      includeContent: false,
    });
    const [indexRecord, initialRecord, successorRecord] = durable.records;
    if (
      indexRecord?.kind !== 'review.index' ||
      initialRecord?.kind !== 'review.snapshot' ||
      successorRecord?.kind !== 'review.snapshot'
    ) {
      throw new Error('Durable Snapshot lineage is incomplete');
    }
    const reviewIndex = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const entry = reviewIndex.reviews.find(candidate => candidate.reviewIdentity === started.reviewIdentity);
    expect(entry?.reviewSnapshotIdentities).toEqual([started.reviewSnapshotIdentity, asked.reviewSnapshotIdentity]);
    expect(
      parseReviewSnapshot(decodeReviewingPayload(initialRecord.payload)).previousReviewSnapshotIdentity,
    ).toBeUndefined();
    expect(parseReviewSnapshot(decodeReviewingPayload(successorRecord.payload)).previousReviewSnapshotIdentity).toBe(
      started.reviewSnapshotIdentity,
    );
  });

  it('rejects a source race without committing a successor or effect', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'racing-successor-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Ask unavailable');
    await writeFile(path.join(created.checkout, 'review.txt'), 'raced after inspection\nsame\n');

    const raced = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'racing-successor-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Should this stale inspection commit?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    expect(raced).toMatchObject({
      kind: 'harness.command.rejected',
      status: 'rejected',
      reason: 'inspection-changed',
      stateVersion: inspection.stateVersion,
    });
    expect(adapter.directives).toHaveLength(0);
    const unchanged = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(unchanged.stateVersion).toBe(inspection.stateVersion);
    expect(unchanged.currentReview?.reviewSnapshotIdentity).toBe(started.reviewSnapshotIdentity);
  });

  it('keeps a failed Pi outcome without fabricating a Response or replaying the Ask', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'failed-ask-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Ask unavailable');
    const command = {
      kind: 'review.question.ask' as const,
      commandIdentity: 'failed-direct-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: {
        kind: 'review.diff-line' as const,
        fileIdentity,
        side: 'new' as const,
        line: 1,
      },
      body: 'Will this fail normally?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    };
    const asked = await owner.workspace.execute(command);
    if (asked.kind !== 'review.question.asked') throw new Error('Ask failed to commit');
    expect(adapter.directives).toHaveLength(1);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'failed-ask-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'failed-ask-terminal',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      outcome: 'failed',
      reason: 'harness-failed',
    });
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    expect(questions.status).toBe('available');
    if (questions.status !== 'available') throw new Error('Questions unavailable');
    expect(questions.list.items[0]).toMatchObject({
      kind: 'question',
      itemIdentity: asked.questionIdentity,
    });
    expect(questions.list.items[0]).not.toHaveProperty('response');
    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({ status: 'failed' });
    expect(interaction.invocations[0]).not.toHaveProperty('responseIdentity');

    const duplicate = await owner.workspace.execute(command);
    expect(duplicate).toEqual(asked);
    expect(adapter.directives).toHaveLength(1);
  });

  it('records an awaiting-start Ask as unknown after restart, without replay', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const attachment = adapter.attachment.attachmentIdentity;
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const review = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'restart-direct-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspected = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: review.reviewIdentity,
    });
    if (inspected.status !== 'available') throw new Error('Ask unavailable');
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'restart-direct-ask',
      expectedStateVersion: inspected.stateVersion,
      reviewIdentity: review.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Will this replay?',
      attachmentIdentity: inspected.destination.attachmentIdentity,
      inspectionIdentity: inspected.inspectionIdentity,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Ask failed');
    expect(adapter.directives).toHaveLength(1);

    owner = await restart(owner, created.checkout);
    expect(
      await owner.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).toMatchObject({
      invocations: [
        {
          invocationIdentity: asked.invocationIdentity,
          // No connection survives a runtime, so the start can no longer be observed.
          status: 'unresolved',
          terminalReason: 'attachment-lost',
          missingStartEvidence: false,
        },
      ],
    });
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const reattached = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      attachmentIdentity: attachment,
      evidenceIdentity: adapter.attachment.evidenceIdentity,
    });
    expect(await owner.harnessAdapters.establish(reattached)).toMatchObject({
      status: 'established',
    });
    expect(reattached.directives).toHaveLength(0);
  });

  it('lets a session Send again after a crash left its Message waiting, behind the unknown-turn gate', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const adapter = await establish(owner);
    const review = await startMessageReview(owner.workspace, 'crash-message-review');
    const sent = await sendMessage(owner.workspace, review, 'crash-message-1');
    expect(adapter.directives).toHaveLength(1);

    // The runtime dies with no orderly disconnect, so nothing reported the lost turn.
    owner = await restart(owner, created.checkout);
    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction).toMatchObject({
      invocations: [
        { invocationIdentity: sent.invocationIdentity, status: 'unresolved', terminalReason: 'attachment-lost' },
      ],
    });

    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const reattached = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      evidenceIdentity: adapter.attachment.evidenceIdentity,
    });
    expect(await owner.harnessAdapters.establish(reattached)).toMatchObject({ status: 'established' });
    expect(reattached.directives).toHaveLength(0);
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: review.liveBasisIdentity as never,
      location: MESSAGE_LOCATION,
      body: 'Still there?',
    });
    expect(inspection.status).toBe('available');
    if (inspection.status !== 'available') return;
    expect(inspection.commitment.requirements.length).toBeGreaterThan(0);
    await sendMessage(owner.workspace, review, 'crash-message-2');
    expect(reattached.directives).toHaveLength(1);
  });

  it('records a Message dispatch the session proved it never ran as rejected, so the next Send is free', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    adapter.observations.push({
      status: 'proven-not-dispatched',
      evidenceIdentity: 'scripted-message-not-dispatched',
      reason: 'harness-rejected',
    });
    const review = await startMessageReview(owner.workspace, 'refused-message-review');
    const sent = await sendMessage(owner.workspace, review, 'refused-message-1');
    await vi.waitFor(async () => {
      expect(
        await owner.workspace.read({
          kind: 'harness.review-interaction',
          reviewIdentity: review.reviewIdentity,
          offset: 0,
          limit: 64,
        }),
      ).toMatchObject({
        invocations: [
          { invocationIdentity: sent.invocationIdentity, status: 'rejected', terminalReason: 'harness-rejected' },
        ],
      });
    });
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: review.liveBasisIdentity as never,
      location: MESSAGE_LOCATION,
      body: 'Try again?',
    });
    expect(inspection).toMatchObject({ status: 'available', commitment: { requirements: [] } });
  });

  it('reports a timed-out Ask as unknown, emits no directive, and recovers without replay', async () => {
    const created = await fixture();
    const bootstrapped = await import('../../src/index.js').then(
      async ({ bootstrapWorkspace }) => await bootstrapWorkspace({ startPath: created.checkout }),
    );
    if (bootstrapped.status !== 'ready') {
      throw new Error('Workspace did not bootstrap');
    }
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
      testControl: {
        requestTimeoutMilliseconds: 1_000,
        pauseAfterCommitCommandIdentity: 'timeout-unknown-ask',
      },
    });
    standaloneStates.add(state);
    const assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, state);
    const adapter = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
    });
    expect(await assembly.harnessAdapters.establish(adapter)).toMatchObject({
      status: 'established',
    });
    const fileIdentity = await firstFileIdentity(assembly.workspace);
    const home = await assembly.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    const review = requireStarted(
      await assembly.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'timeout-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await writeFile(path.join(created.checkout, 'review.txt'), 'timeout successor\nsame\n');
    const inspected = await assembly.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: review.reviewIdentity,
    });
    if (inspected.status !== 'available') throw new Error('Ask unavailable');
    const command = {
      kind: 'review.question.ask' as const,
      commandIdentity: 'timeout-unknown-ask',
      expectedStateVersion: inspected.stateVersion,
      reviewIdentity: review.reviewIdentity,
      anchor: {
        kind: 'review.diff-line' as const,
        fileIdentity,
        side: 'new' as const,
        line: 1,
      },
      body: 'Was this committed before timeout?',
      attachmentIdentity: inspected.destination.attachmentIdentity,
      inspectionIdentity: inspected.inspectionIdentity,
    };
    await expect(assembly.workspace.execute(command)).rejects.toMatchObject({
      code: 'state-request-timeout',
    });
    expect(adapter.directives).toHaveLength(0);
    await expect(assembly.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).rejects.toMatchObject({
      code: 'state-closed',
    });

    await state.close().catch(() => undefined);
    standaloneStates.delete(state);
    const recoveredState = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    standaloneStates.add(recoveredState);
    const recoveredAssembly = openRuntimeWorkspace(
      identity.workspaceIdentity,
      identity.canonicalCheckout,
      recoveredState,
    );
    const recovered = await recoveredAssembly.workspace.read({
      kind: 'harness.command-result',
      commandIdentity: command.commandIdentity,
    });
    expect(recovered).toMatchObject({
      status: 'available',
      result: { kind: 'review.question.asked' },
    });
    const reattached = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      evidenceIdentity: adapter.attachment.evidenceIdentity,
    });
    expect(await recoveredAssembly.harnessAdapters.establish(reattached)).toMatchObject({
      status: 'established',
    });
    expect(reattached.directives).toHaveLength(0);
  });

  it('commits no effect on transaction failure and never replays a post-commit crash', async () => {
    const created = await fixture();
    const bootstrapped = await import('../../src/index.js').then(
      async ({ bootstrapWorkspace }) => await bootstrapWorkspace({ startPath: created.checkout }),
    );
    if (bootstrapped.status !== 'ready') throw new Error('Workspace did not bootstrap');
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    const faulting = new FaultingState(state);
    standaloneStates.add(faulting);
    let failAfterCommitBeforeDirective = false;
    const assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, faulting, {
      afterHarnessCommitBeforeDirective: () => {
        if (!failAfterCommitBeforeDirective) return;
        failAfterCommitBeforeDirective = false;
        throw new Error('injected death after commit before directive');
      },
    });
    const adapter = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
    });
    expect(await assembly.harnessAdapters.establish(adapter)).toMatchObject({ status: 'established' });
    const fileIdentity = await firstFileIdentity(assembly.workspace);
    const home = await assembly.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const review = requireStarted(
      await assembly.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'fault-direct-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    await writeFile(path.join(created.checkout, 'review.txt'), 'fault successor\nsame\n');
    const inspected = await assembly.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: review.reviewIdentity,
    });
    if (inspected.status !== 'available') throw new Error('Ask unavailable');
    const failedCommand = {
      kind: 'review.question.ask' as const,
      commandIdentity: 'direct-state-fault-1',
      expectedStateVersion: inspected.stateVersion,
      reviewIdentity: review.reviewIdentity,
      anchor: {
        kind: 'review.diff-line' as const,
        fileIdentity,
        side: 'new' as const,
        line: 1,
      },
      body: 'Commit atomically?',
      attachmentIdentity: inspected.destination.attachmentIdentity,
      inspectionIdentity: inspected.inspectionIdentity,
    };
    faulting.failNextHarnessCommand = true;
    await expect(assembly.workspace.execute(failedCommand)).rejects.toThrow(
      'injected Harness Interaction commit failure',
    );
    expect(adapter.directives).toHaveLength(0);
    expect(
      await assembly.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).toMatchObject({ handoffs: [], invocations: [] });
    const afterFailedCommit = await assembly.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(afterFailedCommit.currentReview?.reviewSnapshotIdentity).toBe(review.reviewSnapshotIdentity);

    const messageBases = await assembly.workspace.read({
      kind: 'review.bases',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (messageBases.status !== 'available') throw new Error('Fault Message Bases unavailable');
    const liveBasis = messageBases.bases.items.find(item => item.kind === 'live');
    if (liveBasis === undefined) throw new Error('Fault Message Live Basis unavailable');
    const messageLocation = {
      pathBytesBase64: Buffer.from('review.txt').toString('base64'),
      line: 1,
    } as const;
    // An earlier turn that never reported back is what gates this Message.
    const lostInspection = await assembly.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: review.reviewIdentity,
    });
    if (lostInspection.status !== 'available') throw new Error('Lost-turn Ask unavailable');
    const lostAsk = await assembly.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'fault-lost-ask',
      expectedStateVersion: lostInspection.stateVersion,
      reviewIdentity: review.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Does this turn end?',
      attachmentIdentity: lostInspection.destination.attachmentIdentity,
      inspectionIdentity: lostInspection.inspectionIdentity,
    });
    if (lostAsk.kind !== 'review.question.asked') throw new Error('Lost-turn Ask failed');
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'fault-lost-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: lostAsk.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: 'fault-lost-correlation-lost',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: lostAsk.invocationIdentity,
      reason: 'correlation-lost',
    });
    const directivesBeforeMessage = adapter.directives.length;
    const snapshotBeforeMessage = (await assembly.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 }))
      .currentReview?.reviewSnapshotIdentity;
    const interactionBeforeMessage = await assembly.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    const unchangedInteraction = {
      handoffs: interactionBeforeMessage.handoffs,
      invocations: interactionBeforeMessage.invocations,
    };
    const messageBody = 'Does this fail before any outgoing effect?';
    const messageInspection = await assembly.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: liveBasis.reviewBasisIdentity,
      location: messageLocation,
      body: messageBody,
    });
    if (messageInspection.status !== 'available') throw new Error('Fault Message unavailable');
    expect(messageInspection.commitment.status).toBe('gate');
    const messageRequirement = messageInspection.commitment.requirements[0];
    if (messageRequirement === undefined) throw new Error('Fault Message requirement missing');
    faulting.failNextHarnessCommand = true;
    await expect(
      assembly.workspace.execute({
        kind: 'review.message.commit',
        commandIdentity: 'review-message-state-fault',
        expectedStateVersion: messageInspection.stateVersion,
        reviewIdentity: review.reviewIdentity,
        originReviewBasisIdentity: liveBasis.reviewBasisIdentity,
        location: messageLocation,
        body: messageBody,
        attachmentIdentity: messageInspection.destination.attachmentIdentity,
        inspectionIdentity: messageInspection.inspectionIdentity,
        acceptedAcknowledgementRequirementIdentities: [messageRequirement.requirementIdentity],
      }),
    ).rejects.toThrow('injected Harness Interaction commit failure');
    expect(adapter.directives).toHaveLength(directivesBeforeMessage);
    await expect(
      assembly.workspace.read({
        kind: 'review.messages',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({ messages: { total: 0, items: [] } });
    // A failed pre-commit durability leaves no acknowledgment behind either.
    const acknowledgementBefore = await state.read({
      recordIdentities: [reviewMessageAcknowledgementIdentity(messageRequirement.requirementIdentity)],
      includeContent: false,
    });
    expect(acknowledgementBefore.records[0]).toBeUndefined();
    expect(
      await assembly.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).toMatchObject(unchangedInteraction);

    const crashInspection = await assembly.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: liveBasis.reviewBasisIdentity,
      location: messageLocation,
      body: 'Retain this Message without replaying an uncertain dispatch.',
    });
    if (crashInspection.status !== 'available') throw new Error('Post-commit crash Message unavailable');
    expect(crashInspection.commitment.status).toBe('gate');
    const crashRequirement = crashInspection.commitment.requirements[0];
    if (crashRequirement === undefined) throw new Error('Post-commit crash requirement missing');
    const crashCommand = {
      kind: 'review.message.commit' as const,
      commandIdentity: 'review-message-post-commit-crash',
      expectedStateVersion: crashInspection.stateVersion,
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: liveBasis.reviewBasisIdentity,
      location: messageLocation,
      body: 'Retain this Message without replaying an uncertain dispatch.',
      attachmentIdentity: crashInspection.destination.attachmentIdentity,
      inspectionIdentity: crashInspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: [crashRequirement.requirementIdentity],
    };
    failAfterCommitBeforeDirective = true;
    await expect(assembly.workspace.execute(crashCommand)).rejects.toThrow(
      'injected death after commit before directive',
    );
    expect(adapter.directives).toHaveLength(directivesBeforeMessage);
    const recovered = await assembly.workspace.read({
      kind: 'harness.command-result',
      commandIdentity: crashCommand.commandIdentity,
    });
    expect(recovered).toMatchObject({
      status: 'available',
      result: {
        kind: 'review.message.committed',
        outgoingMaterial: {
          byteLength: crashInspection.outgoingMaterial.byteLength,
          characterLength: crashInspection.outgoingMaterial.characterLength,
          sha256: crashInspection.outgoingMaterial.sha256,
        },
      },
    });
    if (recovered.status !== 'available' || recovered.result?.kind !== 'review.message.committed') {
      throw new Error('Committed Review Message result missing');
    }
    expect(recovered.result.acknowledgementRequirementIdentities).toEqual([crashRequirement.requirementIdentity]);
    expect(recovered.result.acknowledgementIdentities).toEqual([
      reviewMessageAcknowledgementIdentity(crashRequirement.requirementIdentity),
    ]);
    const acknowledgementAfterCrash = await state.read({
      recordIdentities: [reviewMessageAcknowledgementIdentity(crashRequirement.requirementIdentity)],
      includeContent: false,
    });
    const crashAcknowledgement = acknowledgementAfterCrash.records[0];
    expect(crashAcknowledgement?.kind).toBe('harness.commitment-acknowledgement');
    expect(JSON.parse(Buffer.from(crashAcknowledgement?.payload ?? []).toString('utf8'))).toMatchObject({
      acceptedByCommandIdentity: crashCommand.commandIdentity,
      requirement: { requirementIdentity: crashRequirement.requirementIdentity },
    });
    const afterCrash = await assembly.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(afterCrash.currentReview?.reviewSnapshotIdentity).toBe(snapshotBeforeMessage);
    expect(await assembly.workspace.execute(crashCommand)).toEqual(recovered.result);
    expect(adapter.directives).toHaveLength(directivesBeforeMessage);
    await expect(
      assembly.workspace.read({
        kind: 'review.messages',
        reviewIdentity: review.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({
      messages: {
        total: 1,
        items: [{ reviewMessageIdentity: recovered.result.reviewMessageIdentity }],
      },
    });
  });

  it('sends a secret-looking Message directly, with its exact bytes and no confirmation', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'secret-looking-message-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Secret-looking Message Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Secret-looking Message Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Is api_key = "abcdefghijklmnop" still valid?';

    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error('Secret-looking Message unavailable');
    expect(inspection.commitment).toMatchObject({ status: 'direct', requirements: [] });

    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-secret-looking-message',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: [],
    });
    expect(committed).toMatchObject({
      kind: 'review.message.committed',
      status: 'accepted',
      acknowledgementRequirementIdentities: [],
    });
    expect(adapter.directives).toHaveLength(1);
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Secret-looking Message directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toContain(body);
  });

  it('gates previous unresolved work with this exact proposal and never turns one acceptance into standing trust', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const adapter = await establish(owner);
    const fileIdentity = await firstFileIdentity(owner.workspace);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'unresolved-message-review-start',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Unresolved fixture Ask unavailable');
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'unresolved-fixture-ask',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Does this turn end?',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Unresolved fixture Ask failed');
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'unresolved-fixture-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: 'unresolved-fixture-correlation-lost',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      reason: 'correlation-lost',
    });

    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Unresolved Message Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Unresolved Message Live Basis unavailable');
    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Please review this line while an earlier turn is unresolved.';
    const gated = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (gated.status !== 'available') throw new Error('Unresolved Message inspection unavailable');
    expect(gated.commitment.status).toBe('gate');
    expect(gated.commitment.requirements).toEqual([
      expect.objectContaining({
        kind: 'unresolved-invocation-risk',
        invocationIdentity: asked.invocationIdentity,
      }),
    ]);
    const requirement = gated.commitment.requirements[0];
    if (requirement === undefined) throw new Error('Unresolved requirement missing');

    const unacknowledged = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-unacknowledged-unresolved-message',
      expectedStateVersion: gated.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: gated.destination.attachmentIdentity,
      inspectionIdentity: gated.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: [],
    });
    expect(unacknowledged).toMatchObject({
      kind: 'harness.command.rejected',
      status: 'rejected',
      reason: 'commitment-requirements-not-acknowledged',
    });
    expect(adapter.directives).toHaveLength(1);

    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'commit-acknowledged-unresolved-message',
      expectedStateVersion: gated.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: gated.destination.attachmentIdentity,
      inspectionIdentity: gated.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: [requirement.requirementIdentity],
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    if (committed.kind !== 'review.message.committed') throw new Error('Unresolved Message was not committed');
    expect(adapter.directives).toHaveLength(2);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'unresolved-message-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'unresolved-message-interrupted',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: committed.invocationIdentity,
      outcome: 'interrupted',
      reason: 'interruption-observed',
    });

    const next = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body: 'Please review this different line too while that turn stays unresolved.',
    });
    if (next.status !== 'available') throw new Error('Next unresolved Message inspection unavailable');
    expect(next.commitment.status).toBe('gate');
    expect(next.commitment.requirements[0]?.requirementIdentity).not.toBe(requirement.requirementIdentity);
  });

  it('retires each earlier idle session from the live index, so connecting never runs out', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    let latest: ScriptedAdapter | undefined;
    for (let session = 0; session < 70; session += 1) {
      latest = await establish(owner, {
        attachmentIdentity: attachmentIdentity(`sequential-session-${session}`),
        evidenceIdentity: `sequential-session-establishment-${session}`,
      });
    }
    if (latest === undefined) throw new Error('No session connected');
    await expect(owner.workspace.read({ kind: 'harness.connection' })).resolves.toMatchObject({
      harnesses: [{ attachmentIdentity: latest.attachment.attachmentIdentity, connected: true }],
    });
    const review = await startMessageReview(owner.workspace, 'sequential-session-review');
    await sendMessage(owner.workspace, review, 'sequential-session-message');
    expect(latest.directives).toHaveLength(1);

    await owner.dispose();
    owners.delete(owner);
    const stored = await readStoredHarness(
      await openStoredState(created.checkout, identity.workspaceIdentity),
      identity.workspaceIdentity,
    );
    expect(stored.index.formatVersion).toBe(4);
    expect(stored.index.attachments.map(item => item.attachmentIdentity)).toEqual([
      latest.attachment.attachmentIdentity,
    ]);
  });

  it('keeps sending from a format-3 index holding the old 512 cap of settled work across Reviews', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = await establish(owner);
    const review = await startMessageReview(owner.workspace, 'old-cap-review');

    // A real Send costs about half a second of Git captures, so 512 earlier
    // settled Sends in four other Reviews are written as format 3 kept them:
    // all in the one index, where 512 refused every further Send.
    await owner.dispose();
    owners.delete(owner);
    const state = await openStoredState(created.checkout, identity.workspaceIdentity);
    const stored = await readStoredHarness(state, identity.workspaceIdentity);
    const fake = (prefix: string, seed: string): string =>
      `${prefix}_${createHash('sha256').update(seed).digest('hex')}`;
    const otherReviews = [0, 1, 2, 3].map(index => fake('rev', `old-cap-other-review-${index}`));
    const padding = Array.from({ length: 512 }, (_, index) => {
      const reviewIdentity = otherReviews[Math.floor(index / 128)]!;
      const handoffIdentity = fake('hho', `old-cap-handoff-${index}`);
      const invocationIdentity = fake('hin', `old-cap-invocation-${index}`);
      return {
        handoff: {
          handoffIdentity,
          reviewIdentity,
          reviewBatchIdentity: fake('rbt', `old-cap-batch-${index}`),
          attachmentIdentity: adapter.attachment.attachmentIdentity,
          commitmentReceiptIdentity: fake('hcr', `old-cap-receipt-${index}`),
          capabilitySnapshotIdentity: fake('hcs', `old-cap-snapshot-${index}`),
          invocationIdentity,
          disclosure: { fileCount: 0, questionCount: 0, messageCount: 1, byteLength: 1, sha256: '0'.repeat(64) },
        },
        invocation: {
          invocationIdentity,
          handoffIdentity,
          reviewIdentity,
          attachmentIdentity: adapter.attachment.attachmentIdentity,
          status: 'rejected',
          evidenceIdentities: [`old-cap-refused-${index}`],
          interruptionIntentIdentities: [],
          terminalReason: 'harness-rejected',
        },
      };
    });
    const installed = await state.commit({
      commandIdentity: 'install-format-three-old-cap',
      expectedStateVersion: (await state.read({ recordIdentities: [], includeContent: false })).stateVersion,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: stableIdentity('hix', identity.workspaceIdentity),
          workflowIdentity: stableIdentity('hix', identity.workspaceIdentity),
          kind: 'harness.index',
          schemaVersion: 1,
          expectedRevision: stored.revision,
          payload: new TextEncoder().encode(
            JSON.stringify({
              ...stored.index,
              formatVersion: 3,
              handoffs: padding.map(item => item.handoff),
              invocations: padding.map(item => item.invocation),
            }),
          ),
          content: [],
        },
      ],
      result: { kind: 'test.format-three-old-cap-installed', schemaVersion: 1, payload: new Uint8Array([1]) },
    });
    if (!('result' in installed)) throw new Error(`Format-3 fixture failed: ${installed.reason}`);
    await state.close();
    standaloneStates.delete(state);

    owner = await open(created.checkout);
    const returned = await establish(owner);
    // The Send format 3 refused at 512 is the write that moves the settled work out.
    const ended = await sendMessage(owner.workspace, review, 'old-cap-ended');
    await returned.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'old-cap-ended-start',
      attachmentIdentity: returned.attachment.attachmentIdentity,
      invocationIdentity: ended.invocationIdentity,
    });
    await returned.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'old-cap-ended-end',
      attachmentIdentity: returned.attachment.attachmentIdentity,
      invocationIdentity: ended.invocationIdentity,
      outcome: 'ended-normally',
    });
    const failed = await sendMessage(owner.workspace, review, 'old-cap-failed');
    await returned.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'old-cap-failed-start',
      attachmentIdentity: returned.attachment.attachmentIdentity,
      invocationIdentity: failed.invocationIdentity,
    });
    await returned.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'old-cap-failed-end',
      attachmentIdentity: returned.attachment.attachmentIdentity,
      invocationIdentity: failed.invocationIdentity,
      outcome: 'failed',
      reason: 'harness-failed',
    });
    const refused = await sendMessage(owner.workspace, review, 'old-cap-refused');
    await returned.emit({
      kind: 'harness.invocation.rejected',
      evidenceIdentity: 'old-cap-refused',
      attachmentIdentity: returned.attachment.attachmentIdentity,
      invocationIdentity: refused.invocationIdentity,
      reason: 'harness-rejected',
    });
    const waiting = await sendMessage(owner.workspace, review, 'old-cap-waiting');
    expect(returned.directives).toHaveLength(4);
    const view = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 128,
    });
    expect(view.handoffs.map(item => item.handoffIdentity)).toEqual([
      ended.handoffIdentity,
      failed.handoffIdentity,
      refused.handoffIdentity,
      waiting.handoffIdentity,
    ]);
    expect(view.invocations.map(item => item.status)).toEqual([
      'ended-normally',
      'failed',
      'rejected',
      'awaiting-start',
    ]);

    await owner.dispose();
    owners.delete(owner);
    const converted = await readStoredHarness(
      await openStoredState(created.checkout, identity.workspaceIdentity),
      identity.workspaceIdentity,
      [review.reviewIdentity, ...otherReviews],
    );
    expect(converted.index.formatVersion).toBe(4);
    expect(converted.index.handoffs.map(item => item.handoffIdentity)).toEqual([waiting.handoffIdentity]);
    expect(converted.histories.map(history => history?.handoffs.length)).toEqual([3, 128, 128, 128, 128]);
  });

  it('refuses a Send past the Review bound with its own reason', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    await establish(owner);
    const review = await startMessageReview(owner.workspace, 'review-bound-review');
    // 127 earlier Review Batches, as Questions and Messages leave them, without 127 slow Sends.
    await owner.dispose();
    owners.delete(owner);
    const state = await openStoredState(created.checkout, identity.workspaceIdentity);
    const reviewIndexIdentity = reviewingRecordIdentity('rvi', identity.workspaceIdentity);
    const read = await state.read({ recordIdentities: [reviewIndexIdentity], includeContent: false });
    const indexRecord = read.records[0];
    if (indexRecord?.kind !== 'review.index' || indexRecord.recordClass !== 'revisioned') {
      throw new Error('Review index unavailable');
    }
    const reviewIndex = parseReviewIndex(decodeReviewingPayload(indexRecord.payload));
    const padded = await state.commit({
      commandIdentity: 'install-review-bound-batches',
      expectedStateVersion: read.stateVersion,
      records: [
        {
          recordClass: 'revisioned',
          recordIdentity: reviewIndexIdentity,
          workflowIdentity: reviewIndexIdentity,
          kind: 'review.index',
          schemaVersion: 1,
          expectedRevision: indexRecord.revision,
          payload: new TextEncoder().encode(
            JSON.stringify({
              ...reviewIndex,
              reviews: reviewIndex.reviews.map(entry =>
                entry.reviewIdentity === review.reviewIdentity
                  ? {
                      ...entry,
                      batchIdentities: Array.from(
                        { length: 127 },
                        (_, index) => `rbt_${createHash('sha256').update(`review-bound-${index}`).digest('hex')}`,
                      ),
                    }
                  : entry,
              ),
            }),
          ),
          content: [],
        },
      ],
      result: { kind: 'test.review-bound-batches-installed', schemaVersion: 1, payload: new Uint8Array([1]) },
    });
    if (!('result' in padded)) throw new Error(`Review bound fixture failed: ${padded.reason}`);
    await state.close();
    standaloneStates.delete(state);

    owner = await open(created.checkout);
    const adapter = await establish(owner);
    const last = await sendMessage(owner.workspace, review, 'review-bound-last');
    await adapter.emit({
      kind: 'harness.invocation.rejected',
      evidenceIdentity: 'review-bound-last-refused',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: last.invocationIdentity,
      reason: 'harness-rejected',
    });
    await expect(
      owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: review.reviewIdentity,
        originReviewBasisIdentity: review.liveBasisIdentity as never,
        location: MESSAGE_LOCATION,
        body: 'One more than this Review can hold.',
      }),
    ).resolves.toMatchObject({ status: 'unavailable', reason: 'review-handoff-limit-reached' });
    expect(adapter.directives).toHaveLength(1);
  });

  it('reads a format-3 index unchanged and moves its settled work to Review history on the first write', async () => {
    const created = await fixture();
    const bootstrapped = await import('../../src/index.js').then(
      async ({ bootstrapWorkspace }) => await bootstrapWorkspace({ startPath: created.checkout }),
    );
    if (bootstrapped.status !== 'ready') throw new Error('Workspace did not bootstrap');
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    const state = new FormatThreeIndexState(
      await openAuthoritativeState({
        workspaceIdentity: identity.workspaceIdentity,
        privateStateDirectory: userStateDirectory(created.checkout),
      }),
    );
    standaloneStates.add(state);
    let assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, state);
    const earlier = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      attachmentIdentity: attachmentIdentity('format-three-earlier'),
      evidenceIdentity: 'format-three-earlier-establishment',
    });
    expect(await assembly.harnessAdapters.establish(earlier)).toMatchObject({ status: 'established' });
    const adapter = new ScriptedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
    });
    expect(await assembly.harnessAdapters.establish(adapter)).toMatchObject({ status: 'established' });
    const review = await startMessageReview(assembly.workspace, 'format-three-review');
    const answered = await sendMessage(assembly.workspace, review, 'format-three-answered');
    const answeredEnd = {
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'format-three-answered-end',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: answered.invocationIdentity,
      outcome: 'ended-normally',
    } as const;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'format-three-answered-start',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: answered.invocationIdentity,
    });
    const answeredAcknowledgement = await adapter.emit(answeredEnd);
    expect(answeredAcknowledgement).toMatchObject({ status: 'applied' });
    const refused = await sendMessage(assembly.workspace, review, 'format-three-refused');
    await adapter.emit({
      kind: 'harness.invocation.rejected',
      evidenceIdentity: 'format-three-refused',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: refused.invocationIdentity,
      reason: 'harness-rejected',
    });
    const lost = await sendMessage(assembly.workspace, review, 'format-three-lost');
    await adapter.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: 'format-three-lost-correlation',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: lost.invocationIdentity,
      reason: 'correlation-lost',
    });

    const legacy = await readStoredHarness(state, identity.workspaceIdentity, [review.reviewIdentity]);
    expect(legacy.index.formatVersion).toBe(3);
    expect(legacy.index.attachments).toHaveLength(2);
    expect(legacy.index.invocations.map(item => item.status)).toEqual(['ended-normally', 'rejected', 'unresolved']);
    expect(legacy.histories).toEqual([undefined]);
    const interaction = {
      kind: 'harness.review-interaction',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 128,
    } as const;
    const before = await assembly.workspace.read(interaction);

    // The current code takes over this format-3 State after a restart.
    state.legacy = false;
    assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, state);
    expect(await assembly.harnessAdapters.establish(adapter)).toMatchObject({ status: 'established' });
    await expect(assembly.workspace.read(interaction)).resolves.toEqual(before);
    // Reading writes nothing.
    expect((await readStoredHarness(state, identity.workspaceIdentity)).revision).toBe(legacy.revision);

    // An exact duplicate of settled evidence is still the same acknowledgement.
    await expect(adapter.emit(answeredEnd)).resolves.toEqual(answeredAcknowledgement);
    await adapter.emit({
      kind: 'harness.availability.observed',
      evidenceIdentity: 'format-three-first-write',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      availability: { status: 'available' },
    });
    const converted = await readStoredHarness(state, identity.workspaceIdentity, [review.reviewIdentity]);
    expect(converted.index.formatVersion).toBe(4);
    // The unresolved turn stays live with its still-current session; the earlier idle session stays too,
    // because only a new connection retires sessions.
    expect(converted.index.attachments).toHaveLength(2);
    expect(converted.index.handoffs.map(item => item.handoffIdentity)).toEqual([lost.handoffIdentity]);
    expect(converted.histories[0]?.handoffs.map(item => item.handoffIdentity)).toEqual([
      answered.handoffIdentity,
      refused.handoffIdentity,
    ]);
    const after = await assembly.workspace.read(interaction);
    expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
    expect({ ...after, stateVersion: before.stateVersion }).toEqual(before);

    // Settled work answers late evidence as it always did.
    await expect(adapter.emit(answeredEnd)).resolves.toEqual(answeredAcknowledgement);
    await expect(
      adapter.emit({
        ...answeredEnd,
        evidenceIdentity: 'format-three-answered-second-end',
        outcome: 'interrupted',
        reason: 'interruption-observed',
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'conflicting-terminal-evidence' });
    const settledStateVersion = (await assembly.workspace.read(interaction)).stateVersion;
    await expect(
      assembly.workspace.execute({
        kind: 'harness.invocation.interruption.request',
        commandIdentity: 'format-three-interrupt-settled',
        expectedStateVersion: settledStateVersion,
        invocationIdentity: answered.invocationIdentity,
      }),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'invocation-not-interruptible' });
  });

  it('asks to confirm an unknown earlier turn only while its session is the connected one', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const first = await establish(owner);
    const review = await startMessageReview(owner.workspace, 'unresolved-session-review');
    const lost = await sendMessage(owner.workspace, review, 'unresolved-session-lost');
    await first.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: 'unresolved-session-lost-correlation',
      attachmentIdentity: first.attachment.attachmentIdentity,
      invocationIdentity: lost.invocationIdentity,
      reason: 'correlation-lost',
    });
    const request = {
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: review.reviewIdentity,
      originReviewBasisIdentity: review.liveBasisIdentity as never,
      location: MESSAGE_LOCATION,
      body: 'Is the earlier turn still in the way?',
    } as const;
    await expect(owner.workspace.read(request)).resolves.toMatchObject({
      status: 'available',
      commitment: {
        status: 'gate',
        requirements: [{ kind: 'unresolved-invocation-risk', invocationIdentity: lost.invocationIdentity }],
      },
    });

    // A new /buildframe is a new session; the earlier session's unknown turn no longer gates it.
    const second = await establish(owner, {
      attachmentIdentity: attachmentIdentity('unresolved-session-second'),
      evidenceIdentity: 'unresolved-session-second-establishment',
    });
    const next = await owner.workspace.read(request);
    if (next.status !== 'available') throw new Error('Message after a new session unavailable');
    expect(next.destination.attachmentIdentity).toBe(second.attachment.attachmentIdentity);
    expect(next.commitment.requirements).toEqual([]);
    // The unknown outcome stays unknown in the Review.
    const view = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: review.reviewIdentity,
      offset: 0,
      limit: 128,
    });
    expect(view.invocations).toMatchObject([{ invocationIdentity: lost.invocationIdentity, status: 'unresolved' }]);

    // Its evidence now finds it in history and is refused as before.
    await expect(
      first.emit({
        kind: 'harness.invocation.terminal-observed',
        evidenceIdentity: 'unresolved-session-late-end',
        attachmentIdentity: first.attachment.attachmentIdentity,
        invocationIdentity: lost.invocationIdentity,
        outcome: 'ended-normally',
      }),
    ).resolves.toMatchObject({ status: 'refused', reason: 'conflicting-terminal-evidence' });

    await owner.dispose();
    owners.delete(owner);
    const stored = await readStoredHarness(
      await openStoredState(created.checkout, identity.workspaceIdentity),
      identity.workspaceIdentity,
      [review.reviewIdentity],
    );
    expect(stored.index.attachments.map(item => item.attachmentIdentity)).toEqual([
      second.attachment.attachmentIdentity,
    ]);
    expect(stored.index.handoffs).toEqual([]);
    expect(stored.histories[0]?.invocations).toMatchObject([{ status: 'unresolved' }]);
  });

  it('restores the unresolved-work gate when the same retired session returns, even across Reviews and restarts', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const first = await establish(owner);
    const earlierReview = await startMessageReview(owner.workspace, 'returning-unresolved-earlier-review');
    const lost = await sendMessage(owner.workspace, earlierReview, 'returning-unresolved-earlier-message');
    await first.emit({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: 'returning-unresolved-correlation-lost',
      attachmentIdentity: first.attachment.attachmentIdentity,
      invocationIdentity: lost.invocationIdentity,
      reason: 'correlation-lost',
    });
    await establish(owner, {
      attachmentIdentity: attachmentIdentity('returning-unresolved-second'),
      evidenceIdentity: 'returning-unresolved-second-establishment',
    });
    const currentReview = await startMessageReview(owner.workspace, 'returning-unresolved-current-review');
    const request = {
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: currentReview.reviewIdentity,
      originReviewBasisIdentity: currentReview.liveBasisIdentity as never,
      location: MESSAGE_LOCATION,
      body: 'The same session still has an earlier turn whose outcome is unknown.',
    } as const;
    // A different session does not inherit the earlier one's risk.
    await expect(owner.workspace.read(request)).resolves.toMatchObject({
      status: 'available',
      commitment: { status: 'direct', requirements: [] },
    });

    for (let restartCount = 0; restartCount < 2; restartCount += 1) {
      owner = await restart(owner, created.checkout);
      const returned = await establish(owner);
      expect(returned.attachment).toEqual(first.attachment);
      const inspection = await owner.workspace.read(request);
      if (inspection.status !== 'available') throw new Error('Returning session inspection unavailable');
      expect(inspection.commitment.status).toBe('gate');
      expect(inspection.commitment.requirements).toEqual([
        expect.objectContaining({ kind: 'unresolved-invocation-risk', invocationIdentity: lost.invocationIdentity }),
      ]);
      const interaction = await owner.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: earlierReview.reviewIdentity,
        offset: 0,
        limit: 128,
      });
      expect(interaction.invocations).toMatchObject([
        { invocationIdentity: lost.invocationIdentity, status: 'unresolved' },
      ]);
      expect(interaction.handoffs).toHaveLength(1);
      if (restartCount === 0) continue;

      const command = {
        kind: 'review.message.commit',
        expectedStateVersion: inspection.stateVersion,
        reviewIdentity: currentReview.reviewIdentity,
        originReviewBasisIdentity: request.originReviewBasisIdentity,
        location: request.location,
        body: request.body,
        attachmentIdentity: inspection.destination.attachmentIdentity,
        inspectionIdentity: inspection.inspectionIdentity,
      } as const;
      await expect(
        owner.workspace.execute({
          ...command,
          commandIdentity: 'returning-unresolved-unacknowledged',
          acceptedAcknowledgementRequirementIdentities: [],
        }),
      ).resolves.toMatchObject({ status: 'rejected', reason: 'commitment-requirements-not-acknowledged' });
      expect(returned.directives).toHaveLength(0);
      await expect(
        owner.workspace.execute({
          ...command,
          commandIdentity: 'returning-unresolved-acknowledged',
          acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
            requirement => requirement.requirementIdentity,
          ),
        }),
      ).resolves.toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
      expect(returned.directives).toHaveLength(1);
    }
  });

  it('lets a retired session reconnect with its own identity and take the connection back', async () => {
    const created = await fixture();
    let owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const first = await establish(owner);
    const second = await establish(owner, {
      attachmentIdentity: attachmentIdentity('returning-second'),
      evidenceIdentity: 'returning-second-establishment',
    });
    expect(first.released).toEqual(['replaced']);
    // The first session's reconnect loop, after a runtime restart, uses the same identity.
    owner = await restart(owner, created.checkout);
    const returned = await establish(owner);
    expect(returned.attachment).toEqual(first.attachment);
    await expect(owner.workspace.read({ kind: 'harness.connection' })).resolves.toMatchObject({
      harnesses: [{ attachmentIdentity: first.attachment.attachmentIdentity, connected: true }],
    });
    const review = await startMessageReview(owner.workspace, 'returning-review');
    const sent = await sendMessage(owner.workspace, review, 'returning-message');
    expect(sent).toMatchObject({ status: 'accepted' });
    expect(returned.directives).toHaveLength(1);
    // Reconnecting again while it is live commits nothing.
    const before = (await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion;
    await establish(owner);
    expect((await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion).toBe(before);
    expect(second.directives).toEqual([]);

    await owner.dispose();
    owners.delete(owner);
    const stored = await readStoredHarness(
      await openStoredState(created.checkout, identity.workspaceIdentity),
      identity.workspaceIdentity,
    );
    expect(stored.index.attachments.map(item => item.attachmentIdentity)).toEqual([
      first.attachment.attachmentIdentity,
    ]);
  });
});
