import { randomBytes } from 'node:crypto';

import { decodeBytesBase64, encodeBytesBase64 } from '../bytesBase64.js';
import type { AuthoritativeState, StateCommitResult, StateRecord, StateRecordWrite } from '../authoritativeState.js';
import { hasOnlyKeys, isRecord, safeVersion, unicodeScalarText } from '../recordCodec.js';
import { assessReviewMessageCommitment, reviewMessageAcknowledgementIdentity } from './commitmentPolicy.js';
import { sha256 } from '../sha256.js';
import {
  messageCodeStateRecords,
  decodeReviewingPayload,
  parseReviewDiffWindow,
  parseReviewIndex,
  parseReviewManifestWindow,
  parseReviewBasis,
  parseReviewMessage,
  parseReviewMessageBatch,
  parseReviewMessageOutgoingMaterial,
  parseReviewQuestion,
  parseReviewQuestionBatch,
  parseReviewSnapshot,
  exactWholeFileAnchorContent,
  parseReviewSnapshotFile,
  capturedSnapshotMatches,
  ReviewSnapshotTransition,
  reviewLiveChangesIdentity,
  reviewSnapshotContextMatches,
  reviewMessageIdentity,
  reviewMessageMaterialIdentity,
  reviewSnapshotBasisIdentity,
  reviewingRecordIdentity,
  MAX_REVIEW_BASES,
  MAX_REVIEW_MESSAGES,
  MAX_REVIEW_SNAPSHOTS,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  type CapturedReviewSnapshot,
  type PreparedReviewSnapshot,
  type ReviewAnchorInput,
  type ReviewBasisIdentity,
  type ReviewBasisPayload,
  type ReviewBatchIdentity,
  type ReviewIdentity,
  type ReviewIndexEntry,
  type ReviewIndexPayload,
  type ReviewMessageBatchPayload,
  type ReviewMessageLocation,
  type ReviewMessageOutgoingMaterialPayload,
  type ReviewMessagePayload,
  type ReviewMessageResponsePayload,
  type ReviewQuestionAnchor,
  type ReviewQuestionBatchPayload,
  type ReviewQuestionPayload,
  type ReviewQuestionIdentity,
  type ReviewResponseIdentity,
  type ReviewResponsePayload,
  type ReviewSnapshotIdentity,
  type ReviewSnapshotPayload,
} from '../reviewing/index.js';
import { evidencePath, WorkspaceEvidence, type CurrentChangedFile } from '../workspaceEvidence/index.js';
import type { WorkspaceIdentity } from '../workspace.js';
import type {
  AskPiReviewQuestionCommand,
  CommitDirectReviewHandoffCommand,
  CommitReviewMessageCommand,
  CommittedHarnessDirective,
  DefaultDirectReviewHandoffInspectionView,
  DefaultDirectReviewHandoffUnavailabilityReason,
  DefaultReviewMessageInspectionView,
  DefaultReviewQuestionAskInspectionView,
  DirectReviewCapabilityContract,
  DirectReviewHandoffAvailableView,
  ReviewedCapabilityContract,
  DirectReviewHandoffCommitted,
  ExactReviewHandoffDisclosure,
  ExactReviewMessageHandoffDisclosure,
  FrozenDirectReviewCapabilitySnapshot,
  HarnessAttachmentEstablishment,
  HarnessAttachmentIdentity,
  HarnessAttachmentRefusalReason,
  HarnessCapabilitySnapshotIdentity,
  HarnessCommandRejectionReason,
  HarnessCommandResultView,
  HarnessConnectionView,
  HarnessCompatibilityIdentity,
  HarnessCommitmentReceiptIdentity,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceRefusalReason,
  HarnessEvidenceSink,
  HarnessHandoffIdentity,
  HarnessInteractionCommand,
  HarnessInteractionCommandAccepted,
  HarnessInteractionCommandResult,
  ReviewMessageCommitted,
  ReviewMessageLocationInput,
  ReviewQuestionAsked,
  HarnessInteractionViewFor,
  HarnessInteractionViewRequest,
  HarnessInteractionViewScope,
  HarnessInteractionViewUpdate,
  HarnessInteractionViewUpdateFor,
  HarnessInterruptionIntentIdentity,
  HarnessInterruptionRequested,
  HarnessInvocationIdentity,
  HarnessInvocationStatus,
  NormalizedHarnessEvidence,
  RequestHarnessInterruptionCommand,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
  ReviewHandoffDisclosureSummary,
  ReviewHarnessInteractionView,
  WorkspaceHarnessAdapterHost,
} from './contracts.js';

import { exactQuestionAnchorIsValid } from './anchors.js';
import {
  HarnessProjectionVersionChanged,
  HarnessStateProblem,
  type AttachmentCompatibilityPayload,
  type HarnessAttachmentIndexEntry,
  type HarnessCommandRecordPayload,
  type HarnessEvidenceRecordPayload,
  type HarnessHandoffIndexEntry,
  type HarnessIndexPayload,
  type HarnessInvocationIndexEntry,
  type HarnessReviewHistoryPayload,
  type LiveAdapter,
  type LoadedHarnessIndex,
  type LoadedReviewHistory,
  type LoadedReviewIndex,
  type PreparedAskInspection,
  type PreparedInspection,
  type PreparedReviewMessageInspection,
  type PreparedReviewMessageTarget,
  type PreparedReviewResponse,
  type ReviewDisclosureBasis,
  type ReviewMessageAcknowledgementPayload,
  type Subscription,
} from './internalTypes.js';
import {
  ATTACHMENT_PATTERN,
  BATCH_PATTERN,
  MAX_ANCHOR_LINE_BYTES,
  MAX_ATTACHMENTS,
  MAX_EVIDENCE_PER_INVOCATION,
  MAX_HANDOFFS,
  MAX_INTERRUPTION_INTENTS,
  MAX_INVOCATIONS,
  MAX_MESSAGE_TEMPLATE_BYTES,
  MAX_PREPARED_REVIEW_MESSAGE_INSPECTIONS,
  MAX_PROJECTED_INTERACTIONS,
  MAX_REVIEW_BATCHES,
  MAX_REVIEW_MESSAGE_BYTES,
  MAX_REVIEW_QUESTIONS,
  REVIEW_BASIS_PATTERN,
  REVIEW_PATTERN,
} from './limits.js';
import {
  normalizeAttachment,
  isDirectReviewCapability,
  normalizeCapability,
  normalizeCommand,
  normalizeEvidence,
  normalizeManifest,
  normalizeMessageLocationInput,
} from './normalization.js';
import {
  parseCompatibility,
  parseHarnessCommandAccepted,
  parseHarnessCommandRecord,
  parseHarnessEvidenceRecord,
  parseIndex,
  parseReviewHistory,
} from './parsing.js';
import {
  emptyIndex,
  immutableRecord,
  liveWorkCounts,
  moveSettledInteractions,
  replaceAttachment,
  replaceInvocation,
  restoreUnresolvedInteractions,
  reviewHistoryIdentity,
  reviewsWithMovableInteractions,
  revisionedRecord,
} from './records.js';
import {
  composeReviewMessageMaterial,
  repositoryStatesMatch,
  reviewMessageCommitmentInput,
  reviewMessageInspectionIdentity,
  reviewMessageRepositoryState,
} from './reviewMessage.js';
import { boundedText, cloneFrozen, decode, encode, exactUtf8, nthLine, sameValue, stableIdentity } from './utils.js';
import { projectionHandoff, projectionInvocation, rejected, unavailableInspection } from './views.js';

export interface HarnessInteractionOwnerOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly state: AuthoritativeState;
  readonly evidence: WorkspaceEvidence;
  readonly onCommittedStateVersion: (stateVersion: number) => void;
  /** Deterministic internal fault seam; never crosses the Workspace Interface. */
  readonly afterCommitBeforeDirective?: () => void | Promise<void>;
  /** Private freshness epoch; production creates one for each runtime owner. */
  readonly runtimeGeneration?: string;
}

/** Deep semantic owner. Applications reach it only through Workspace. */
export class HarnessInteractionOwner {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #canonicalCheckout: string;
  readonly #state: AuthoritativeState;
  readonly #evidence: WorkspaceEvidence;
  readonly #snapshots: ReviewSnapshotTransition;
  readonly #indexIdentity: string;
  readonly #onCommittedStateVersion: (stateVersion: number) => void;
  readonly #afterCommitBeforeDirective: (() => void | Promise<void>) | undefined;
  readonly #runtimeGeneration: string;
  readonly #liveAdapters = new Map<HarnessAttachmentIdentity, LiveAdapter>();
  /** Available inspections only; State movement makes every older entry unusable. */
  readonly #preparedReviewMessageInspections = new Map<string, PreparedReviewMessageInspection>();
  readonly #subscriptions = new Set<Subscription>();
  readonly adapterHost: WorkspaceHarnessAdapterHost;

  constructor(options: HarnessInteractionOwnerOptions) {
    this.#workspaceIdentity = options.workspaceIdentity;
    this.#canonicalCheckout = options.canonicalCheckout;
    this.#state = options.state;
    this.#evidence = options.evidence;
    this.#snapshots = new ReviewSnapshotTransition({ evidence: options.evidence, state: options.state });
    this.#indexIdentity = stableIdentity('hix', options.workspaceIdentity);
    this.#onCommittedStateVersion = options.onCommittedStateVersion;
    this.#afterCommitBeforeDirective = options.afterCommitBeforeDirective;
    const runtimeGeneration = options.runtimeGeneration ?? randomBytes(16).toString('hex');
    if (!boundedText(runtimeGeneration)) throw new TypeError('Invalid Harness runtime generation');
    this.#runtimeGeneration = runtimeGeneration;
    this.adapterHost = Object.freeze({
      establish: async (adapter: ReviewedHarnessAdapter) => await this.#establishAdapter(adapter),
    });
  }

  /**
   * A new runtime starts with no Adapter connections, so every direct
   * Invocation still awaiting start or active lost its correlation when the
   * previous runtime ended. An orderly disconnect records that; a crash could
   * not, which left a Message waiting forever and its session unable to Send.
   * Record it before any Adapter attaches. A User Pull Invocation from State
   * written before 0.1.0 is resolved the same way: nothing can settle it now.
   */
  async recoverLostInvocations(): Promise<void> {
    const index = await this.#loadIndex();
    const lost = index.payload.invocations.filter(
      invocation => invocation.status === 'awaiting-start' || invocation.status === 'active',
    );
    for (const invocation of lost) {
      await this.#acceptEvidence(invocation.attachmentIdentity, {
        kind: 'harness.invocation.correlation-lost',
        evidenceIdentity: `workspace-runtime:${this.#runtimeGeneration}:${invocation.invocationIdentity}:correlation-lost`,
        attachmentIdentity: invocation.attachmentIdentity,
        invocationIdentity: invocation.invocationIdentity,
        reason: 'attachment-lost',
      });
    }
  }

  async execute(value: unknown): Promise<HarnessInteractionCommandResult> {
    const command = normalizeCommand(value);
    const normalized = JSON.stringify(command);
    const recalled = await this.#recallCommand(command, normalized);
    if (recalled !== undefined) return recalled;

    const index = await this.#loadIndex();
    if (index.stateVersion !== command.expectedStateVersion) {
      return rejected(command, index.stateVersion, 'state-version-mismatch');
    }
    try {
      switch (command.kind) {
        case 'review.message.commit':
          return await this.#commitReviewMessage(command, normalized, index);
        case 'review.question.ask':
          return await this.#askReviewQuestion(command, normalized, index);
        case 'harness.review-handoff.commit':
          return await this.#commitReviewHandoff(command, normalized, index);
        case 'harness.invocation.interruption.request':
          return await this.#requestInterruption(command, normalized, index);
        default: {
          const unhandledCommand: never = command;
          throw new TypeError(`Unhandled normalized Harness Interaction command: ${String(unhandledCommand)}`);
        }
      }
    } catch (error) {
      if (!(error instanceof HarnessProjectionVersionChanged)) throw error;
      const current = await this.#loadIndex();
      return rejected(command, current.stateVersion, 'state-version-mismatch');
    }
  }

  async read<Request extends HarnessInteractionViewRequest>(
    request: Request,
  ): Promise<HarnessInteractionViewFor<Request>> {
    if (request.kind === 'harness.review-message.inspect-default') {
      if (
        typeof request.reviewIdentity !== 'string' ||
        !REVIEW_PATTERN.test(request.reviewIdentity) ||
        typeof request.originReviewBasisIdentity !== 'string' ||
        !REVIEW_BASIS_PATTERN.test(request.originReviewBasisIdentity) ||
        typeof request.body !== 'string' ||
        request.body.trim().length === 0 ||
        Buffer.byteLength(request.body, 'utf8') > MAX_REVIEW_MESSAGE_BYTES ||
        request.body.includes('\u0000') ||
        !unicodeScalarText(request.body) ||
        (request.outgoingTemplate !== undefined &&
          (typeof request.outgoingTemplate !== 'string' ||
            Buffer.byteLength(request.outgoingTemplate, 'utf8') > MAX_MESSAGE_TEMPLATE_BYTES)) ||
        (request.purpose !== undefined && request.purpose !== 'preview' && request.purpose !== 'submit')
      ) {
        throw new TypeError('Invalid default Review Message inspection');
      }
      const location = normalizeMessageLocationInput(request.location);
      return (await this.#defaultMessageInspection(
        request.reviewIdentity,
        request.originReviewBasisIdentity,
        location,
        request.body,
        request.outgoingTemplate,
        request.purpose,
      )) as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.review-question.inspect-default') {
      if (typeof request.reviewIdentity !== 'string' || !REVIEW_PATTERN.test(request.reviewIdentity)) {
        throw new TypeError('Invalid default Review Question inspection');
      }
      return (await this.#defaultAskInspection(request.reviewIdentity)) as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.review-handoff.inspect') {
      if (
        typeof request.reviewIdentity !== 'string' ||
        !REVIEW_PATTERN.test(request.reviewIdentity) ||
        typeof request.reviewBatchIdentity !== 'string' ||
        !BATCH_PATTERN.test(request.reviewBatchIdentity) ||
        typeof request.attachmentIdentity !== 'string' ||
        !ATTACHMENT_PATTERN.test(request.attachmentIdentity)
      ) {
        throw new TypeError('Invalid Direct Review Handoff inspection');
      }
      const prepared = await this.#prepareInspection(
        request.reviewIdentity,
        request.reviewBatchIdentity,
        request.attachmentIdentity,
      );
      return prepared.view as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.review-handoff.inspect-default') {
      if (
        typeof request.reviewIdentity !== 'string' ||
        !REVIEW_PATTERN.test(request.reviewIdentity) ||
        typeof request.reviewBatchIdentity !== 'string' ||
        !BATCH_PATTERN.test(request.reviewBatchIdentity)
      ) {
        throw new TypeError('Invalid default Direct Review Handoff inspection');
      }
      return (await this.#defaultInspection(
        request.reviewIdentity,
        request.reviewBatchIdentity,
      )) as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.command-result') {
      if (!boundedText(request.commandIdentity)) {
        throw new TypeError('Invalid Harness command-result request');
      }
      return (await this.#commandResultView(request.commandIdentity)) as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.connection') {
      if (!hasOnlyKeys(request as unknown as Record<string, unknown>, ['kind'])) {
        throw new TypeError('Invalid Harness connection view request');
      }
      return (await this.#connectionView()) as HarnessInteractionViewFor<Request>;
    }
    if (
      request.kind !== 'harness.review-interaction' ||
      typeof request.reviewIdentity !== 'string' ||
      !REVIEW_PATTERN.test(request.reviewIdentity) ||
      !safeVersion(request.offset) ||
      !safeVersion(request.limit, false) ||
      request.limit > MAX_PROJECTED_INTERACTIONS
    ) {
      throw new TypeError('Invalid bounded Review Harness Interaction view request');
    }
    return (await this.#interactionView(
      request.reviewIdentity,
      request.offset,
      request.limit,
    )) as HarnessInteractionViewFor<Request>;
  }

  /** Keeps this semantic projection on the one global committed State version. */
  publishCommittedVersion(stateVersion: number): void {
    this.#publish(stateVersion);
  }

  subscribe<Scope extends HarnessInteractionViewScope>(
    scope: Scope,
    onUpdate: (update: HarnessInteractionViewUpdateFor<Scope>) => void,
  ): () => void {
    if (scope.kind === 'harness.connection' && !hasOnlyKeys(scope as unknown as Record<string, unknown>, ['kind'])) {
      throw new TypeError('Invalid Harness connection scope');
    }
    if (
      scope.kind !== 'harness.connection' &&
      (scope.kind !== 'harness.review-interaction' ||
        typeof scope.reviewIdentity !== 'string' ||
        !REVIEW_PATTERN.test(scope.reviewIdentity) ||
        !safeVersion(scope.offset) ||
        !safeVersion(scope.limit, false) ||
        scope.limit > MAX_PROJECTED_INTERACTIONS)
    ) {
      throw new TypeError('Invalid bounded Review Harness Interaction scope');
    }
    const subscription: Subscription = {
      scope: cloneFrozen(scope),
      onUpdate: onUpdate as (update: HarnessInteractionViewUpdate) => void,
      active: true,
      scheduled: false,
      lastStateVersion: -1,
    };
    this.#subscriptions.add(subscription);
    this.#schedule(subscription);
    return (): void => {
      subscription.active = false;
      this.#subscriptions.delete(subscription);
    };
  }

  async #establishAdapter(adapter: ReviewedHarnessAdapter): Promise<HarnessAttachmentEstablishment> {
    let manifest: ReviewedCapabilityManifest;
    let attachment: ReviewedHarnessAttachment;
    let connection: ReviewedHarnessConnection;
    try {
      manifest = normalizeManifest(adapter.manifest);
    } catch {
      return { status: 'refused', reason: 'invalid-manifest' };
    }
    try {
      attachment = normalizeAttachment(adapter.attachment);
    } catch {
      return { status: 'refused', reason: 'invalid-attachment' };
    }
    if (!manifest.reviewedHostVersions.includes(attachment.hostVersion)) {
      return { status: 'refused', reason: 'unsupported-host-version' };
    }
    if (attachment.workspaceIdentity !== this.#workspaceIdentity) {
      return { status: 'refused', reason: 'workspace-mismatch' };
    }
    if (attachment.destination.canonicalCheckout !== this.#canonicalCheckout) {
      return { status: 'refused', reason: 'checkout-mismatch' };
    }
    if (attachment.destination.harnessLabel !== manifest.adapterDisplayName) {
      return { status: 'refused', reason: 'invalid-attachment' };
    }

    const sink: HarnessEvidenceSink = Object.freeze({
      accept: async (evidence: NormalizedHarnessEvidence) =>
        await this.#acceptEvidence(attachment.attachmentIdentity, evidence),
    });
    try {
      connection = adapter.connect(sink);
      if (typeof connection?.perform !== 'function') {
        return { status: 'refused', reason: 'invalid-attachment' };
      }
    } catch {
      return { status: 'refused', reason: 'invalid-attachment' };
    }

    const compatibilityIdentity = stableIdentity('hcp', attachment.evidenceIdentity) as HarnessCompatibilityIdentity;
    // Durable producer: normalized Manifest key order is part of stored State.
    // The golden manifest-digest scenario must fail before it changes.
    const manifestSha256 = sha256(JSON.stringify(manifest));
    const existingCompatibility = await this.#readOptionalRecord(compatibilityIdentity);
    if (existingCompatibility !== undefined) {
      if (
        existingCompatibility.kind !== 'harness.attachment-compatibility' ||
        existingCompatibility.recordClass !== 'immutable'
      ) {
        throw new HarnessStateProblem();
      }
      const prior = parseCompatibility(decode(existingCompatibility.payload));
      if (!sameValue(prior.normalizedAttachment, attachment) || !sameValue(prior.manifest, manifest)) {
        return { status: 'refused', reason: 'evidence-identity-conflict' };
      }
      const refused = await this.#returnRetiredAttachment(prior);
      if (refused !== undefined) return refused;
      this.#releaseOtherSessions(attachment.attachmentIdentity);
      this.#liveAdapters.set(attachment.attachmentIdentity, {
        manifest,
        manifestSha256,
        attachment,
        compatibilityIdentity,
        connection,
      });
      // The agent is back; reconnecting never replays a workflow action.
      this.#scheduleConnectionSubscriptions();
      return prior.result;
    }

    const index = await this.#loadIndex();
    const priorAttachment = index.payload.attachments.find(
      item => item.attachmentIdentity === attachment.attachmentIdentity,
    );
    if (priorAttachment !== undefined && !sameValue(priorAttachment.destination, attachment.destination)) {
      return { status: 'refused', reason: 'attachment-identity-conflict' };
    }

    const nextStateVersion = index.stateVersion + 1;
    const result: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }> = cloneFrozen({
      status: 'established',
      attachmentIdentity: attachment.attachmentIdentity,
      compatibilityIdentity,
      stateVersion: nextStateVersion,
    });
    const compatibility: AttachmentCompatibilityPayload = {
      formatVersion: 1,
      normalizedAttachment: attachment,
      manifest,
      manifestSha256,
      compatibilityIdentity,
      result,
    };
    const nextAttachment: HarnessAttachmentIndexEntry = {
      attachmentIdentity: attachment.attachmentIdentity,
      compatibilityIdentity,
      establishmentEvidenceIdentity: attachment.evidenceIdentity,
      destination: attachment.destination,
      availability: attachment.availability,
    };
    // Newest wins: every other Attachment with nothing in flight retires from the live index.
    let moved: { readonly payload: HarnessIndexPayload; readonly records: StateRecordWrite[] };
    try {
      moved = await this.#movedIndexWrites(
        index,
        replaceAttachment(index.payload, nextAttachment),
        attachment.attachmentIdentity,
      );
    } catch (error) {
      if (error instanceof HarnessProjectionVersionChanged) {
        return { status: 'refused', reason: 'state-version-changed' };
      }
      throw error;
    }
    if (moved.payload.attachments.length > MAX_ATTACHMENTS) {
      return { status: 'refused', reason: 'attachment-limit-reached' };
    }
    if (moved.payload.handoffs.length > MAX_HANDOFFS || moved.payload.invocations.length > MAX_INVOCATIONS) {
      return { status: 'refused', reason: 'state-conflict' };
    }

    let committed: StateCommitResult;
    try {
      committed = await this.#state.commit({
        commandIdentity: `harness-attachment:${attachment.evidenceIdentity}`,
        expectedStateVersion: index.stateVersion,
        records: [
          immutableRecord(
            compatibilityIdentity,
            this.#indexIdentity,
            'harness.attachment-compatibility',
            compatibility,
          ),
          ...moved.records,
        ],
        result: {
          kind: 'harness.attachment-establishment',
          schemaVersion: 1,
          payload: encode(result),
        },
      });
    } catch {
      return { status: 'refused', reason: 'state-unavailable' };
    }
    if (!('result' in committed)) {
      return {
        status: 'refused',
        reason: this.#attachmentCommitReason(committed.reason),
      };
    }
    const decoded = decode(committed.result.payload);
    if (
      committed.result.kind !== 'harness.attachment-establishment' ||
      committed.result.schemaVersion !== 1 ||
      !sameValue(decoded, result)
    ) {
      throw new HarnessStateProblem();
    }
    this.#releaseOtherSessions(attachment.attachmentIdentity);
    this.#liveAdapters.set(attachment.attachmentIdentity, {
      manifest,
      manifestSha256,
      attachment,
      compatibilityIdentity,
      connection,
    });
    this.#publish(committed.stateVersion);
    return result;
  }

  /**
   * A session reconnecting with an Attachment that retired from the live index
   * (a newer `/buildframe` connected meanwhile) takes its place again, and the
   * others retire as for any newest connection. Its unresolved turns return
   * too, even from Previous Reviews: retirement never clears their consent gate.
   * Its immutable compatibility record already exists, so this commit has its own command identity per
   * State version: the original establishment command is never replayed, and a
   * retry after a lost State version is a new command, not a ledger conflict.
   */
  async #returnRetiredAttachment(
    prior: AttachmentCompatibilityPayload,
  ): Promise<Extract<HarnessAttachmentEstablishment, { readonly status: 'refused' }> | undefined> {
    const attachment = prior.normalizedAttachment;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      let index: LoadedHarnessIndex;
      let moved: { readonly payload: HarnessIndexPayload; readonly records: StateRecordWrite[] };
      try {
        index = await this.#loadIndex();
        const current = index.payload.attachments.find(
          item => item.attachmentIdentity === attachment.attachmentIdentity,
        );
        const histories = await this.#allReviewHistories(index.stateVersion);
        const hasHistoricalUnresolved = [...histories.values()].some(history =>
          history.payload.invocations.some(
            invocation =>
              invocation.attachmentIdentity === attachment.attachmentIdentity && invocation.status === 'unresolved',
          ),
        );
        if (current !== undefined && !hasHistoricalUnresolved) return undefined;
        moved = await this.#movedIndexWrites(
          index,
          current === undefined
            ? replaceAttachment(index.payload, {
                attachmentIdentity: attachment.attachmentIdentity,
                compatibilityIdentity: prior.compatibilityIdentity,
                establishmentEvidenceIdentity: attachment.evidenceIdentity,
                destination: attachment.destination,
                availability: attachment.availability,
              })
            : index.payload,
          attachment.attachmentIdentity,
          histories,
        );
      } catch (error) {
        if (error instanceof HarnessProjectionVersionChanged) continue;
        if (error instanceof HarnessStateProblem) throw error;
        return { status: 'refused', reason: 'state-unavailable' };
      }
      if (moved.payload.attachments.length > MAX_ATTACHMENTS) {
        return { status: 'refused', reason: 'attachment-limit-reached' };
      }
      if (moved.payload.handoffs.length > MAX_HANDOFFS || moved.payload.invocations.length > MAX_INVOCATIONS) {
        // Refuse rather than forget risk or persist an index its parser cannot read.
        return { status: 'refused', reason: 'state-conflict' };
      }
      let committed: StateCommitResult;
      try {
        committed = await this.#state.commit({
          commandIdentity: `harness-attachment-return:${index.stateVersion}:${prior.compatibilityIdentity}`,
          expectedStateVersion: index.stateVersion,
          records: moved.records,
          result: {
            kind: 'harness.attachment-return',
            schemaVersion: 1,
            payload: encode(prior.result),
          },
        });
      } catch {
        return { status: 'refused', reason: 'state-unavailable' };
      }
      if (!('result' in committed)) {
        if (committed.reason === 'state-version-mismatch') continue;
        return { status: 'refused', reason: this.#attachmentCommitReason(committed.reason) };
      }
      if (committed.status === 'duplicate') {
        // Only a commit at this exact State version could match; read again rather than trust it.
        continue;
      }
      this.#publish(committed.stateVersion);
      return undefined;
    }
    return { status: 'refused', reason: 'state-version-changed' };
  }

  /**
   * One session is connected per checkout, and the newest connection wins:
   * every other live session is released and told why, so Send never has to
   * ask which session to use. A released session's running turn ends as
   * its own transport loss reports it, never as a fabricated outcome.
   */
  #releaseOtherSessions(attachmentIdentity: HarnessAttachmentIdentity): void {
    for (const [identity, live] of this.#liveAdapters) {
      if (identity === attachmentIdentity) continue;
      this.#liveAdapters.delete(identity);
      try {
        live.connection.release?.('replaced');
      } catch {
        // The released session's transport reports its own loss.
      }
    }
  }

  #attachmentCommitReason(
    reason: Exclude<StateCommitResult, { readonly status: 'committed' | 'duplicate' }>['reason'],
  ): HarnessAttachmentRefusalReason {
    if (reason === 'state-version-mismatch') return 'state-version-changed';
    if (reason === 'command-identity-conflict') return 'evidence-identity-conflict';
    return 'state-conflict';
  }

  async #acceptEvidence(
    expectedAttachmentIdentity: HarnessAttachmentIdentity,
    value: unknown,
    expectedStateVersion?: number,
  ): Promise<HarnessEvidenceAcknowledgement> {
    let evidence: NormalizedHarnessEvidence;
    try {
      evidence = normalizeEvidence(value);
    } catch {
      return { status: 'refused', reason: 'invalid-evidence' };
    }
    if (evidence.attachmentIdentity !== expectedAttachmentIdentity) {
      return {
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: 'attachment-identity-mismatch',
      };
    }
    const normalized = JSON.stringify(evidence);
    const evidenceRecordIdentity = stableIdentity('hev', evidence.evidenceIdentity);
    let prior: StateRecord | undefined;
    try {
      prior = await this.#readOptionalRecord(evidenceRecordIdentity);
    } catch {
      return {
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: 'state-unavailable',
      };
    }
    if (prior !== undefined) {
      if (prior.kind !== 'harness.evidence' || prior.recordClass !== 'immutable') {
        return {
          status: 'refused',
          evidenceIdentity: evidence.evidenceIdentity,
          reason: 'state-conflict',
        };
      }
      let payload: HarnessEvidenceRecordPayload;
      try {
        payload = parseHarnessEvidenceRecord(decode(prior.payload));
      } catch {
        return {
          status: 'refused',
          evidenceIdentity: evidence.evidenceIdentity,
          reason: 'evidence-identity-conflict',
        };
      }
      if (
        payload.normalizedEvidence !== normalized ||
        payload.acknowledgement.evidenceIdentity !== evidence.evidenceIdentity
      ) {
        return {
          status: 'refused',
          evidenceIdentity: evidence.evidenceIdentity,
          reason: 'evidence-identity-conflict',
        };
      }
      return cloneFrozen(payload.acknowledgement);
    }

    let index: LoadedHarnessIndex;
    try {
      index = await this.#loadIndex();
    } catch {
      return {
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: 'state-unavailable',
      };
    }
    if (expectedStateVersion !== undefined && index.stateVersion !== expectedStateVersion) {
      return this.#evidenceRefused(evidence, 'state-version-changed');
    }
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === evidence.attachmentIdentity);
    if (attachment === undefined) {
      const settled =
        evidence.kind === 'harness.availability.observed'
          ? undefined
          : await this.#settledEvidenceRefusal(index, evidence);
      return {
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: settled ?? 'attachment-not-found',
      };
    }

    let nextIndex: HarnessIndexPayload;
    let preparedResponse: PreparedReviewResponse | undefined;
    if (evidence.kind === 'harness.availability.observed') {
      // The runtime adapter entry is deliberately retained: a queued
      // disconnected observation from an older runtime generation can arrive
      // after a newer connection established, and the attachment's own
      // availability already keeps it out of default-route candidates.
      nextIndex = replaceAttachment(index.payload, {
        ...attachment,
        availability: evidence.availability,
      });
    } else {
      const invocation = index.payload.invocations.find(
        item => item.invocationIdentity === evidence.invocationIdentity,
      );
      if (invocation === undefined) {
        return this.#evidenceRefused(
          evidence,
          (await this.#settledEvidenceRefusal(index, evidence)) ?? 'invocation-not-found',
        );
      }
      if (invocation.attachmentIdentity !== evidence.attachmentIdentity) {
        return this.#evidenceRefused(evidence, 'attachment-identity-mismatch');
      }
      let transitioned = this.#applyInvocationEvidence(invocation, evidence);
      if (typeof transitioned === 'string') {
        return this.#evidenceRefused(evidence, transitioned);
      }
      if (
        evidence.kind === 'harness.invocation.terminal-observed' &&
        evidence.outcome === 'ended-normally' &&
        evidence.result !== undefined
      ) {
        preparedResponse = await this.#prepareReviewResponse(index, invocation, evidence);
        if (preparedResponse !== undefined) {
          transitioned = {
            ...transitioned,
            responseIdentity: preparedResponse.responseIdentity,
          };
        }
      }
      nextIndex = replaceInvocation(index.payload, transitioned);
    }

    const acknowledgement: Extract<HarnessEvidenceAcknowledgement, { readonly status: 'applied' }> = cloneFrozen({
      status: 'applied',
      evidenceIdentity: evidence.evidenceIdentity,
      stateVersion: index.stateVersion + 1,
    });
    const payload: HarnessEvidenceRecordPayload = {
      formatVersion: 1,
      normalizedEvidence: normalized,
      acknowledgement,
    };
    let indexWrites: StateRecordWrite[];
    try {
      // A settled Invocation moves to its Review's history in this same commit.
      indexWrites = await this.#indexWrites(index, nextIndex);
    } catch (error) {
      if (error instanceof HarnessProjectionVersionChanged) {
        return this.#evidenceRefused(evidence, 'state-version-changed');
      }
      throw error;
    }
    let committed: StateCommitResult;
    try {
      committed = await this.#state.commit({
        commandIdentity: `harness-evidence:${evidence.evidenceIdentity}`,
        expectedStateVersion: index.stateVersion,
        records: [
          immutableRecord(evidenceRecordIdentity, this.#indexIdentity, 'harness.evidence', payload),
          ...(preparedResponse === undefined
            ? []
            : [
                ...preparedResponse.records,
                this.#reviewIndexWrite(preparedResponse.reviewIndex, preparedResponse.nextReviewIndex),
              ]),
          ...indexWrites,
        ],
        result: {
          kind: 'harness.evidence-acknowledgement',
          schemaVersion: 1,
          payload: encode(acknowledgement),
        },
      });
    } catch {
      return this.#evidenceRefused(evidence, 'state-unavailable');
    }
    if (!('result' in committed)) {
      const reason: HarnessEvidenceRefusalReason =
        committed.reason === 'state-version-mismatch'
          ? 'state-version-changed'
          : committed.reason === 'command-identity-conflict'
            ? 'evidence-identity-conflict'
            : 'state-conflict';
      return this.#evidenceRefused(evidence, reason);
    }
    if (
      committed.result.kind !== 'harness.evidence-acknowledgement' ||
      committed.result.schemaVersion !== 1 ||
      !sameValue(decode(committed.result.payload), acknowledgement)
    ) {
      throw new HarnessStateProblem();
    }
    this.#publish(committed.stateVersion);
    return acknowledgement;
  }

  async #prepareReviewResponse(
    index: LoadedHarnessIndex,
    invocation: HarnessInvocationIndexEntry,
    evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.invocation.terminal-observed' }>,
  ): Promise<PreparedReviewResponse | undefined> {
    const result = evidence.result;
    if (result === undefined || evidence.outcome !== 'ended-normally') return undefined;
    const handoff = index.payload.handoffs.find(item => item.handoffIdentity === invocation.handoffIdentity);
    if (handoff === undefined) throw new HarnessStateProblem();
    const records = await this.#readRecordsAtVersion(
      index.stateVersion,
      [handoff.capabilitySnapshotIdentity, handoff.reviewBatchIdentity],
      false,
    );
    const [capabilityRecord, batchRecord] = records;
    if (
      capabilityRecord?.kind !== 'harness.capability-snapshot' ||
      capabilityRecord.recordClass !== 'immutable' ||
      batchRecord === undefined ||
      (batchRecord.kind !== 'review.question-batch' && batchRecord.kind !== 'review.message-batch') ||
      batchRecord.recordClass !== 'immutable'
    ) {
      throw new HarnessStateProblem();
    }
    const frozen = decode(capabilityRecord.payload);
    if (
      !isRecord(frozen) ||
      frozen.formatVersion !== 1 ||
      frozen.snapshotIdentity !== handoff.capabilitySnapshotIdentity ||
      !isRecord(frozen.capability)
    ) {
      throw new HarnessStateProblem();
    }
    let capability: ReviewedCapabilityContract;
    try {
      capability = normalizeCapability(frozen.capability);
    } catch {
      return undefined;
    }
    if (!isDirectReviewCapability(capability)) return undefined;
    const contract = capability.artifactResultContract;
    if (
      result.contractVersion !== contract.contractVersion ||
      result.contractIdentity !== contract.contractIdentity ||
      result.source !== contract.source ||
      result.byteLength > contract.maximumBytes
    ) {
      return undefined;
    }
    if (batchRecord.kind === 'review.message-batch') {
      return await this.#prepareReviewMessageResponse(index, invocation, evidence, handoff, batchRecord, contract);
    }
    const batch = parseReviewQuestionBatch(decodeReviewingPayload(batchRecord.payload));
    if (
      batch.reviewIdentity !== handoff.reviewIdentity ||
      batch.reviewBatchIdentity !== handoff.reviewBatchIdentity ||
      batch.questionIdentities.length !== 1
    ) {
      return undefined;
    }
    const questionIdentity = batch.questionIdentities[0];
    if (questionIdentity === undefined) return undefined;
    const [questionRecord] = await this.#readRecordsAtVersion(index.stateVersion, [questionIdentity], false);
    if (questionRecord?.kind !== 'review.question') throw new HarnessStateProblem();
    const question = parseReviewQuestion(decodeReviewingPayload(questionRecord.payload));
    if (
      question.reviewIdentity !== handoff.reviewIdentity ||
      question.reviewBatchIdentity !== handoff.reviewBatchIdentity ||
      question.questionIdentity !== questionIdentity
    ) {
      throw new HarnessStateProblem();
    }
    const reviewIndex = await this.#loadReviewIndexAtVersion(index.stateVersion);
    const entry = reviewIndex.payload.reviews.find(item => item.reviewIdentity === handoff.reviewIdentity);
    if (
      entry === undefined ||
      !entry.questionIdentities.includes(questionIdentity) ||
      entry.responses.some(item => item.questionIdentity === questionIdentity)
    ) {
      return undefined;
    }
    const responseIdentity = stableIdentity(
      'rrp',
      invocation.invocationIdentity,
      'review-response',
    ) as ReviewResponseIdentity;
    const response: ReviewResponsePayload = {
      formatVersion: 1,
      reviewIdentity: handoff.reviewIdentity,
      reviewSnapshotIdentity: question.reviewSnapshotIdentity,
      reviewBatchIdentity: handoff.reviewBatchIdentity,
      questionIdentity,
      responseIdentity,
      handoffIdentity: handoff.handoffIdentity,
      invocationIdentity: invocation.invocationIdentity,
      terminalEvidenceIdentity: evidence.evidenceIdentity,
      artifactResultContractIdentity: contract.contractIdentity,
      body: result.body,
      bodySha256: result.sha256,
      bodyByteLength: result.byteLength,
    };
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      responses: [...entry.responses, { questionIdentity, responseIdentity }],
    };
    return {
      responseIdentity,
      records: [immutableRecord(responseIdentity, handoff.reviewIdentity, 'review.response', response)],
      reviewIndex,
      nextReviewIndex: {
        ...reviewIndex.payload,
        reviews: reviewIndex.payload.reviews.map(item =>
          item.reviewIdentity === nextEntry.reviewIdentity ? nextEntry : item,
        ),
      },
    };
  }

  async #prepareReviewMessageResponse(
    index: LoadedHarnessIndex,
    invocation: HarnessInvocationIndexEntry,
    evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.invocation.terminal-observed' }>,
    handoff: HarnessHandoffIndexEntry,
    batchRecord: StateRecord,
    contract: DirectReviewCapabilityContract['artifactResultContract'],
  ): Promise<PreparedReviewResponse | undefined> {
    const result = evidence.result;
    if (result === undefined) return undefined;
    const batch = parseReviewMessageBatch(decodeReviewingPayload(batchRecord.payload));
    if (batch.reviewIdentity !== handoff.reviewIdentity || batch.reviewBatchIdentity !== handoff.reviewBatchIdentity) {
      throw new HarnessStateProblem();
    }
    const [messageRecord] = await this.#readRecordsAtVersion(index.stateVersion, [batch.reviewMessageIdentity], false);
    if (messageRecord?.recordClass !== 'immutable' || messageRecord.kind !== 'review.message') {
      throw new HarnessStateProblem();
    }
    const message = parseReviewMessage(decodeReviewingPayload(messageRecord.payload));
    if (
      message.reviewIdentity !== handoff.reviewIdentity ||
      message.reviewMessageIdentity !== batch.reviewMessageIdentity ||
      message.originReviewBasisIdentity !== batch.originReviewBasisIdentity
    ) {
      throw new HarnessStateProblem();
    }
    const [materialRecord] = await this.#readRecordsAtVersion(
      index.stateVersion,
      [message.outgoingMaterialIdentity],
      true,
    );
    if (materialRecord?.recordClass !== 'immutable' || materialRecord.kind !== 'review.message-outgoing-material') {
      throw new HarnessStateProblem();
    }
    const material = parseReviewMessageOutgoingMaterial(decodeReviewingPayload(materialRecord.payload));
    const materialContent = materialRecord.content.find(item => item.role === 'outgoing-message');
    const materialText = materialContent?.bytes === undefined ? undefined : exactUtf8(materialContent.bytes);
    if (
      material.reviewIdentity !== message.reviewIdentity ||
      material.reviewMessageIdentity !== message.reviewMessageIdentity ||
      material.outgoingMaterialIdentity !== message.outgoingMaterialIdentity ||
      materialContent?.bytes === undefined ||
      materialContent.bytes.byteLength !== material.byteLength ||
      materialText === undefined ||
      [...materialText].length !== material.characterLength ||
      materialContent.digest !== material.sha256 ||
      sha256(materialContent.bytes) !== material.sha256
    ) {
      throw new HarnessStateProblem();
    }
    const reviewIndex = await this.#loadReviewIndexAtVersion(index.stateVersion);
    const entry = reviewIndex.payload.reviews.find(item => item.reviewIdentity === handoff.reviewIdentity);
    const messageHistory = entry?.messageHistory;
    if (
      entry === undefined ||
      messageHistory === undefined ||
      !messageHistory.messages.some(item => item.reviewMessageIdentity === message.reviewMessageIdentity) ||
      messageHistory.responses.some(item => item.reviewMessageIdentity === message.reviewMessageIdentity)
    ) {
      return undefined;
    }
    const responseIdentity = stableIdentity(
      'rrp',
      invocation.invocationIdentity,
      'review-message-response',
    ) as ReviewResponseIdentity;
    const response: ReviewMessageResponsePayload = {
      formatVersion: 1,
      reviewIdentity: handoff.reviewIdentity,
      reviewMessageIdentity: message.reviewMessageIdentity,
      responseIdentity,
      handoffIdentity: handoff.handoffIdentity,
      invocationIdentity: invocation.invocationIdentity,
      terminalEvidenceIdentity: evidence.evidenceIdentity,
      artifactResultContractIdentity: contract.contractIdentity,
      body: result.body,
      bodySha256: result.sha256,
      bodyByteLength: result.byteLength,
    };
    const responseRecord = immutableRecord(
      responseIdentity,
      handoff.reviewIdentity,
      'review.message-response',
      response,
    );
    let nextEntry: ReviewIndexEntry = {
      ...entry,
      messageHistory: {
        ...messageHistory,
        responses: [
          ...messageHistory.responses,
          { reviewMessageIdentity: message.reviewMessageIdentity, responseIdentity },
        ],
      },
    };
    const records: StateRecordWrite[] = [responseRecord];
    if (!messageHistory.changeObservations.some(item => item.reviewMessageIdentity === message.reviewMessageIdentity)) {
      const [captured, context] = await Promise.all([
        this.#snapshots.capture({ kind: 'current-changes' }),
        this.#snapshots.captureContext(entry.reviewIdentity, index.stateVersion),
      ]);
      if (
        !('reason' in captured) &&
        captured.capture.kind === 'workspace.current-changes.capture' &&
        !('reason' in context) &&
        (await this.#snapshots.verify(captured))
      ) {
        const observedState = reviewMessageRepositoryState(captured.capture);
        if (repositoryStatesMatch(message.repositoryStateAtCommitment, observedState)) {
          nextEntry = {
            ...nextEntry,
            messageHistory: {
              ...nextEntry.messageHistory!,
              changeObservations: [
                ...nextEntry.messageHistory!.changeObservations,
                {
                  reviewMessageIdentity: message.reviewMessageIdentity,
                  responseIdentity,
                  outcome: 'unchanged',
                },
              ],
            },
          };
        } else if (
          entry.basisTree !== undefined &&
          entry.basisTree.reviewBasisIdentities.includes(message.originReviewBasisIdentity) &&
          entry.basisTree.reviewBasisIdentities.length < MAX_REVIEW_BASES &&
          entry.reviewSnapshotIdentities.length < MAX_REVIEW_SNAPSHOTS
        ) {
          const reviewSnapshotIdentity = reviewingRecordIdentity(
            'rsn',
            responseIdentity,
            'change-event-review-snapshot',
          ) as ReviewSnapshotIdentity;
          const reviewBasisIdentity = reviewSnapshotBasisIdentity(entry.reviewIdentity, reviewSnapshotIdentity);
          const changeSetIdentity = reviewingRecordIdentity('cst', responseIdentity, 'change-event-change-set');
          const prepared = this.#snapshots.prepare({
            reviewIdentity: entry.reviewIdentity,
            reviewSnapshotIdentity,
            previousReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
            changeSetIdentity,
            captured,
            context,
          });
          const basis: ReviewBasisPayload = {
            formatVersion: 1,
            reviewIdentity: entry.reviewIdentity,
            reviewBasisIdentity,
            kind: 'change-event',
            parentReviewBasisIdentity: message.originReviewBasisIdentity,
            reviewSnapshotIdentity,
            provenance: {
              kind: 'changes-observed-after-response',
              responseIdentity,
            },
          };
          nextEntry = {
            ...nextEntry,
            reviewSnapshotIdentities: [...entry.reviewSnapshotIdentities, reviewSnapshotIdentity],
            reviewSnapshotIdentity,
            basisTree: {
              ...entry.basisTree,
              reviewBasisIdentities: [...entry.basisTree.reviewBasisIdentities, reviewBasisIdentity],
            },
            messageHistory: {
              ...nextEntry.messageHistory!,
              changeObservations: [
                ...nextEntry.messageHistory!.changeObservations,
                {
                  reviewMessageIdentity: message.reviewMessageIdentity,
                  responseIdentity,
                  outcome: 'forked',
                  reviewBasisIdentity,
                },
              ],
            },
          };
          records.push(
            immutableRecord(changeSetIdentity, entry.reviewIdentity, 'review.change-set', {
              formatVersion: 1,
              reviewIdentity: entry.reviewIdentity,
              changeSetIdentity,
              workspaceIdentity: this.#workspaceIdentity,
              canonicalCheckout: this.#canonicalCheckout,
              basis: captured.capture.basis,
              comparedState: captured.capture.comparedState,
            }),
            ...prepared.records,
            immutableRecord(reviewBasisIdentity, entry.reviewIdentity, 'review.basis', basis),
          );
        }
      }
    }
    return {
      responseIdentity,
      records,
      reviewIndex,
      nextReviewIndex: {
        ...reviewIndex.payload,
        reviews: reviewIndex.payload.reviews.map(item =>
          item.reviewIdentity === nextEntry.reviewIdentity ? nextEntry : item,
        ),
      },
    };
  }

  #evidenceRefused(
    evidence: NormalizedHarnessEvidence,
    reason: HarnessEvidenceRefusalReason,
  ): HarnessEvidenceAcknowledgement {
    return cloneFrozen({
      status: 'refused',
      evidenceIdentity: evidence.evidenceIdentity,
      reason,
    });
  }

  /**
   * New evidence for an Invocation that already settled into its Review's
   * history is refused exactly as it was while the Invocation was live. The
   * Invocation's own immutable record names its Review. An exact duplicate
   * never reaches here: its evidence record answers it first.
   */
  async #settledEvidenceRefusal(
    index: LoadedHarnessIndex,
    evidence: Exclude<NormalizedHarnessEvidence, { readonly kind: 'harness.availability.observed' }>,
  ): Promise<HarnessEvidenceRefusalReason | undefined> {
    let invocation: HarnessInvocationIndexEntry | undefined;
    try {
      invocation = await this.#settledInvocation(index.stateVersion, evidence.invocationIdentity);
    } catch (error) {
      if (error instanceof HarnessProjectionVersionChanged) return 'state-version-changed';
      throw error;
    }
    if (invocation === undefined) return undefined;
    if (invocation.attachmentIdentity !== evidence.attachmentIdentity) return 'attachment-identity-mismatch';
    const transitioned = this.#applyInvocationEvidence(invocation, evidence);
    return typeof transitioned === 'string' ? transitioned : 'conflicting-terminal-evidence';
  }

  /** A settled Invocation from its Review's history, found through its immutable record. */
  async #settledInvocation(
    stateVersion: number,
    invocationIdentity: HarnessInvocationIdentity,
  ): Promise<HarnessInvocationIndexEntry | undefined> {
    const [record] = await this.#readOptionalRecordsAtVersion(stateVersion, [invocationIdentity]);
    if (
      record === undefined ||
      record.recordClass !== 'immutable' ||
      (record.kind !== 'harness.direct-invocation' && record.kind !== 'harness.user-pull-invocation') ||
      !REVIEW_PATTERN.test(record.workflowIdentity)
    ) {
      return undefined;
    }
    const reviewIdentity = record.workflowIdentity as ReviewIdentity;
    const history = (await this.#loadReviewHistories(stateVersion, [reviewIdentity])).get(reviewIdentity);
    return history?.payload.invocations.find(item => item.invocationIdentity === invocationIdentity);
  }

  #applyInvocationEvidence(
    invocation: HarnessInvocationIndexEntry,
    evidence: Exclude<NormalizedHarnessEvidence, { readonly kind: 'harness.availability.observed' }>,
  ): HarnessInvocationIndexEntry | HarnessEvidenceRefusalReason {
    if (invocation.evidenceIdentities.length >= MAX_EVIDENCE_PER_INVOCATION) {
      return 'state-conflict';
    }
    const terminal = new Set<HarnessInvocationStatus>([
      'rejected',
      'ended-normally',
      'failed',
      'interrupted',
      'unresolved',
    ]);
    if (evidence.kind === 'harness.invocation.start-observed') {
      if (invocation.status !== 'awaiting-start') return 'illegal-evidence-order';
      return {
        ...invocation,
        status: 'active',
        evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
      };
    }
    if (evidence.kind === 'harness.invocation.rejected') {
      if (invocation.status !== 'awaiting-start') return 'illegal-evidence-order';
      return {
        ...invocation,
        status: 'rejected',
        evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
        terminalReason: evidence.reason,
      };
    }
    if (evidence.kind === 'harness.invocation.correlation-lost') {
      if (terminal.has(invocation.status)) return 'conflicting-terminal-evidence';
      return {
        ...invocation,
        status: 'unresolved',
        evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
        terminalReason: evidence.reason,
      };
    }
    if (invocation.status !== 'active') {
      return terminal.has(invocation.status) ? 'conflicting-terminal-evidence' : 'illegal-evidence-order';
    }
    return {
      ...invocation,
      status: evidence.outcome,
      evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
      ...(evidence.reason === undefined ? {} : { terminalReason: evidence.reason }),
    };
  }

  /** Whether one more Handoff and Invocation would overflow the live index once settled work moves out. */
  #liveIndexFull(index: LoadedHarnessIndex): boolean {
    const live = liveWorkCounts(index.payload);
    return live.handoffs >= MAX_HANDOFFS || live.invocations >= MAX_INVOCATIONS;
  }

  /**
   * Connected adapters that can accept one direct Handoff. An attachment whose
   * bridge disconnected is never a candidate, even while its runtime entry
   * remains cached for truthfulness on explicit routes.
   */
  #candidateAttachments(index: LoadedHarnessIndex): readonly HarnessAttachmentIndexEntry[] {
    return index.payload.attachments.filter(attachment => {
      if (attachment.availability.status === 'blocked' && attachment.availability.reason === 'disconnected') {
        return false;
      }
      const live = this.#liveAdapters.get(attachment.attachmentIdentity);
      return live?.compatibilityIdentity === attachment.compatibilityIdentity;
    });
  }

  async #connectionView(): Promise<HarnessConnectionView> {
    const index = await this.#loadIndex();
    const connected = new Set(this.#directCapableAttachments(index).map(attachment => attachment.attachmentIdentity));
    const harnesses = index.payload.attachments
      .map(attachment => ({
        attachmentIdentity: attachment.attachmentIdentity,
        harnessLabel: attachment.destination.harnessLabel,
        sessionLabel: attachment.destination.sessionLabel,
        connected: connected.has(attachment.attachmentIdentity),
        availability: attachment.availability,
      }))
      .sort(
        (left, right) =>
          Number(right.connected) - Number(left.connected) ||
          left.harnessLabel.localeCompare(right.harnessLabel) ||
          left.sessionLabel.localeCompare(right.sessionLabel),
      );
    return cloneFrozen({ kind: 'harness.connection', stateVersion: index.stateVersion, harnesses });
  }

  #directCapableAttachments(index: LoadedHarnessIndex): readonly HarnessAttachmentIndexEntry[] {
    return this.#candidateAttachments(index).filter(attachment => {
      const live = this.#liveAdapters.get(attachment.attachmentIdentity);
      return (
        live?.manifest.capabilities.some(
          capability => capability.handoffKind === 'submit-review-batch' && capability.route === 'direct',
        ) === true
      );
    });
  }

  async #defaultMessageInspection(
    reviewIdentity: ReviewIdentity,
    originReviewBasisIdentity: ReviewBasisIdentity,
    location: ReviewMessageLocationInput,
    body: string,
    outgoingTemplate?: string,
    purpose: 'preview' | 'submit' = 'submit',
  ): Promise<DefaultReviewMessageInspectionView> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const index = await this.#loadIndex();
        const connected = this.#candidateAttachments(index);
        const capable = this.#directCapableAttachments(index);
        if (capable.length === 1) {
          const attachment = capable[0];
          if (attachment === undefined) throw new HarnessStateProblem();
          const prepared = await this.#prepareReviewMessageInspection(
            reviewIdentity,
            originReviewBasisIdentity,
            location,
            body,
            attachment.attachmentIdentity,
            outgoingTemplate,
            purpose,
          );
          if (prepared.view.stateVersion !== index.stateVersion) throw new HarnessProjectionVersionChanged();
          this.#rememberPreparedReviewMessageInspection(prepared);
          return prepared.view;
        }
        return cloneFrozen({
          kind: 'harness.review-message.default-inspection',
          status: 'unavailable',
          stateVersion: index.stateVersion,
          reviewIdentity,
          originReviewBasisIdentity,
          reason:
            capable.length > 1
              ? 'attachment-selection-required'
              : connected.length > 0
                ? 'capability-unsupported'
                : index.payload.attachments.length > 0
                  ? 'attachment-not-live'
                  : 'attachment-not-found',
        });
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) throw error;
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareReviewMessageInspection(
    reviewIdentity: ReviewIdentity,
    originReviewBasisIdentity: ReviewBasisIdentity,
    location: ReviewMessageLocationInput,
    body: string,
    attachmentIdentity: HarnessAttachmentIdentity,
    outgoingTemplate?: string,
    purpose: 'preview' | 'submit' = 'submit',
  ): Promise<PreparedReviewMessageInspection> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#prepareReviewMessageInspectionOnce(
          reviewIdentity,
          originReviewBasisIdentity,
          location,
          body,
          attachmentIdentity,
          outgoingTemplate,
          purpose,
        );
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) throw error;
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareReviewMessageInspectionOnce(
    reviewIdentity: ReviewIdentity,
    originReviewBasisIdentity: ReviewBasisIdentity,
    location: ReviewMessageLocationInput,
    body: string,
    attachmentIdentity: HarnessAttachmentIdentity,
    outgoingTemplate?: string,
    purpose: 'preview' | 'submit' = 'submit',
  ): Promise<PreparedReviewMessageInspection> {
    const unavailable = (
      stateVersion: number,
      reason: DefaultDirectReviewHandoffUnavailabilityReason,
      blockerIdentities?: readonly string[],
    ): PreparedReviewMessageInspection => ({
      view: cloneFrozen({
        kind: 'harness.review-message.default-inspection',
        status: 'unavailable',
        stateVersion,
        reviewIdentity,
        originReviewBasisIdentity,
        reason,
        ...(blockerIdentities === undefined ? {} : { blockerIdentities }),
      }),
    });
    const index = await this.#loadIndex();
    const stateVersion = index.stateVersion;
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) return unavailable(stateVersion, 'attachment-not-found');
    const live = this.#liveAdapters.get(attachmentIdentity);
    if (live === undefined || live.compatibilityIdentity !== attachment.compatibilityIdentity) {
      return unavailable(stateVersion, 'attachment-not-live');
    }
    const capability = live.manifest.capabilities.find(
      (item): item is DirectReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'direct',
    );
    if (capability === undefined) return unavailable(stateVersion, 'capability-unsupported');
    if (attachment.availability.status === 'blocked') return unavailable(stateVersion, 'availability-blocked');
    if (attachment.availability.status === 'unknown') return unavailable(stateVersion, 'availability-unknown');
    const active = index.payload.invocations.filter(
      item =>
        item.attachmentIdentity === attachmentIdentity &&
        (item.status === 'awaiting-start' || item.status === 'active'),
    );
    if (active.length > 0) {
      return unavailable(
        stateVersion,
        'active-invocation-exists',
        active.map(item => item.invocationIdentity),
      );
    }
    const unresolved = index.payload.invocations.filter(
      item => item.attachmentIdentity === attachmentIdentity && item.status === 'unresolved',
    );

    const reviewIndex = await this.#loadReviewIndexAtVersion(stateVersion);
    const entry = reviewIndex.payload.reviews.find(item => item.reviewIdentity === reviewIdentity);
    if (entry === undefined) return unavailable(stateVersion, 'review-not-found');
    if (reviewIndex.payload.currentReviewIdentity !== reviewIdentity) {
      return unavailable(stateVersion, 'review-not-current');
    }
    if (entry.basisTree === undefined) return unavailable(stateVersion, 'review-predates-messages');
    if (!entry.basisTree.reviewBasisIdentities.includes(originReviewBasisIdentity)) {
      return unavailable(stateVersion, 'review-basis-not-found');
    }
    if ((entry.messageHistory?.messages.length ?? 0) >= MAX_REVIEW_MESSAGES) {
      return unavailable(stateVersion, 'review-message-limit-reached');
    }
    // Each Handoff spends one Review Batch, so this also bounds the Review's history.
    if (entry.batchIdentities.length >= MAX_REVIEW_BATCHES) {
      return unavailable(stateVersion, 'review-handoff-limit-reached');
    }
    if (this.#liveIndexFull(index)) return unavailable(stateVersion, 'harness-index-limit-reached');
    const [basisRecord] = await this.#readRecordsAtVersion(stateVersion, [originReviewBasisIdentity], false);
    if (basisRecord?.recordClass !== 'immutable' || basisRecord.kind !== 'review.basis') {
      throw new HarnessStateProblem();
    }
    const originBasis = parseReviewBasis(decodeReviewingPayload(basisRecord.payload));
    if (
      originBasis.reviewIdentity !== reviewIdentity ||
      originBasis.reviewBasisIdentity !== originReviewBasisIdentity
    ) {
      throw new HarnessStateProblem();
    }

    let current = await this.#snapshots.capture({ kind: 'current-changes' });
    if ('reason' in current || current.capture.kind !== 'workspace.current-changes.capture') {
      return unavailable(stateVersion, 'snapshot-unverified');
    }
    const repositoryState = reviewMessageRepositoryState(current.capture);
    const pathBytes = decodeBytesBase64(location.pathBytesBase64);
    let resolvedLocation: ReviewMessageLocation;
    let historicalLine: Uint8Array | undefined;
    let sourceSha256: string;
    let liveSourceCaptureIdentity: string | undefined;
    if (originBasis.kind === 'live') {
      const capture = await this.#evidence.read({
        kind: 'workspace.context.capture',
        selections: [{ kind: 'workspace-file', pathBytesBase64: location.pathBytesBase64 }],
      });
      if (capture.status !== 'ready') return unavailable(stateVersion, 'message-file-unavailable');
      const item = capture.items.find(candidate => candidate.pathBytesBase64 === location.pathBytesBase64);
      if (item === undefined || item.sourceAvailability === 'working-missing') {
        return unavailable(stateVersion, 'message-file-not-found');
      }
      if (
        item.status !== 'captured' ||
        item.sourceKind !== 'regular' ||
        item.byteLength === undefined ||
        item.pathBytesBase64 === undefined
      ) {
        return unavailable(stateVersion, 'message-file-unavailable');
      }
      const bytes = await this.#loadCapturedContextBytes(
        capture.captureIdentity,
        item.pathBytesBase64,
        item.byteLength,
        capture.limits.maxContentWindowBytes,
      );
      if (bytes === undefined || item.contentDigest === undefined || sha256(bytes) !== item.contentDigest) {
        return unavailable(stateVersion, 'message-file-unavailable');
      }
      sourceSha256 = item.contentDigest;
      liveSourceCaptureIdentity = capture.captureIdentity;
      const line = nthLine(bytes, location.line);
      if (line === undefined) return unavailable(stateVersion, 'message-line-not-found');
      if (line.bytes.byteLength > MAX_ANCHOR_LINE_BYTES) {
        return unavailable(stateVersion, 'message-line-too-large');
      }
      // A preview shows the exact bytes without the commitment-time
      // repository stability proof; the commit revalidates the retained
      // capture and re-captures the repository state before it stores anything.
      if (purpose !== 'preview') {
        const verification = await this.#evidence.read({
          kind: 'workspace.context.verify',
          captureIdentity: capture.captureIdentity,
        });
        if (
          verification.status !== 'settled' ||
          verification.verdicts.length !== 1 ||
          verification.verdicts[0]?.currency !== 'current'
        ) {
          return unavailable(stateVersion, 'message-file-unavailable');
        }
        const settled = await this.#snapshots.capture({ kind: 'current-changes' });
        if (
          'reason' in settled ||
          settled.capture.kind !== 'workspace.current-changes.capture' ||
          !repositoryStatesMatch(repositoryState, reviewMessageRepositoryState(settled.capture))
        ) {
          return unavailable(stateVersion, 'snapshot-unverified');
        }
        current = settled;
      }
      resolvedLocation = { file: evidencePath(pathBytes), line: location.line };
    } else {
      const [snapshotRecord] = await this.#readRecordsAtVersion(
        stateVersion,
        [originBasis.reviewSnapshotIdentity],
        false,
      );
      if (snapshotRecord?.recordClass !== 'immutable' || snapshotRecord.kind !== 'review.snapshot') {
        throw new HarnessStateProblem();
      }
      const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
      if (
        snapshot.reviewIdentity !== reviewIdentity ||
        snapshot.reviewSnapshotIdentity !== originBasis.reviewSnapshotIdentity
      ) {
        throw new HarnessStateProblem();
      }
      const files = await this.#loadCompleteManifest(stateVersion, entry, snapshot);
      const file = files.find(candidate => {
        const candidatePath = candidate.newSide?.path.bytesBase64;
        return candidatePath === location.pathBytesBase64;
      });
      if (file?.newSide === undefined) return unavailable(stateVersion, 'message-file-not-found');
      const [fileRecord] = await this.#readRecordsAtVersion(
        stateVersion,
        [reviewingRecordIdentity('rsf', snapshot.reviewSnapshotIdentity, file.fileIdentity)],
        true,
      );
      if (fileRecord?.recordClass !== 'immutable' || fileRecord.kind !== 'review.snapshot-file') {
        throw new HarnessStateProblem();
      }
      const snapshotFile = parseReviewSnapshotFile(decodeReviewingPayload(fileRecord.payload));
      const content = fileRecord.content.find(item => item.role === 'new');
      if (
        snapshotFile.reviewIdentity !== reviewIdentity ||
        snapshotFile.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
        snapshotFile.file.fileIdentity !== file.fileIdentity ||
        snapshotFile.file.newSide?.contentAvailability !== 'captured' ||
        snapshotFile.file.newSide.contentIdentity === undefined ||
        content?.bytes === undefined ||
        content.digest !== snapshotFile.file.newSide.contentIdentity.value
      ) {
        return unavailable(stateVersion, 'message-file-unavailable');
      }
      const line = nthLine(content.bytes, location.line);
      if (line === undefined) return unavailable(stateVersion, 'message-line-not-found');
      if (line.bytes.byteLength > MAX_ANCHOR_LINE_BYTES) {
        return unavailable(stateVersion, 'message-line-too-large');
      }
      historicalLine = line.bytes;
      sourceSha256 = content.digest;
      resolvedLocation = { file: file.newSide.path, line: location.line };
    }
    if (current.capture.kind !== 'workspace.current-changes.capture') throw new HarnessStateProblem();
    const target: PreparedReviewMessageTarget = {
      location: resolvedLocation,
      originBasis,
      repositoryState: reviewMessageRepositoryState(current.capture),
      sourceSha256,
      // Revalidation needs the bounded capture witness, not a second retained copy
      // of every changed file's contents.
      capturedRepository: { capture: current.capture, files: [] },
      ...(liveSourceCaptureIdentity === undefined ? {} : { liveSourceCaptureIdentity }),
      ...(historicalLine === undefined ? {} : { historicalLine }),
    };
    const material = composeReviewMessageMaterial(body, target, outgoingTemplate);
    if (material.status === 'template-invalid') return unavailable(stateVersion, 'message-template-invalid');
    if (material.status === 'unrenderable') return unavailable(stateVersion, 'message-source-unrenderable');
    const commitmentInput = reviewMessageCommitmentInput(
      stateVersion,
      reviewIdentity,
      originReviewBasisIdentity,
      attachment,
      material,
      active.map(item => item.invocationIdentity),
      unresolved.map(item => item.invocationIdentity),
    );
    const commitment = assessReviewMessageCommitment(commitmentInput);
    if (commitment.status === 'blocked') {
      return unavailable(
        stateVersion,
        commitment.reason === 'active-invocation' ? 'active-invocation-exists' : 'state-conflict',
        commitment.blockerIdentities,
      );
    }
    const final = await this.#state.read({ recordIdentities: [], includeContent: false });
    if (final.stateVersion !== stateVersion) throw new HarnessProjectionVersionChanged();
    const outgoingMaterialSha256 = sha256(material.bytes);
    const inspectionIdentity = reviewMessageInspectionIdentity({
      stateVersion,
      reviewIdentity,
      originReviewBasisIdentity,
      body,
      target,
      attachment,
      capability,
      commitmentAssessmentIdentity: commitment.assessmentIdentity,
      outgoingMaterialSha256,
    });
    const outgoingMaterialIdentity = reviewMessageMaterialIdentity(inspectionIdentity);
    return {
      view: cloneFrozen({
        kind: 'harness.review-message.default-inspection',
        status: 'available',
        stateVersion,
        inspectionIdentity,
        reviewIdentity,
        originReviewBasisIdentity,
        location: resolvedLocation,
        destination: { attachmentIdentity, ...attachment.destination },
        capability: {
          route: 'direct',
          authority: capability.authority,
          effectConstraint: capability.effectConstraint,
          evidenceProfile: capability.evidenceProfile,
          interruption: capability.interruption,
          artifactResultContract: capability.artifactResultContract,
          knownLimitations: capability.knownLimitations,
        },
        outgoingMaterial: {
          outgoingMaterialIdentity,
          representation: material.representation,
          encoding: 'utf8',
          bytesBase64: encodeBytesBase64(material.bytes),
          byteLength: material.bytes.byteLength,
          characterLength: material.characterLength,
          sha256: outgoingMaterialSha256,
        },
        commitment,
        limitations: ['The agent may read newer code later.', 'Naming a file does not limit what the agent can read.'],
      }),
      reviewIndex,
      entry,
      target,
      attachment,
      live,
      capability,
      manifestSha256: live.manifestSha256,
      compatibilityIdentity: attachment.compatibilityIdentity,
      ...(outgoingTemplate === undefined ? {} : { outgoingTemplate }),
    };
  }

  #rememberPreparedReviewMessageInspection(prepared: PreparedReviewMessageInspection): void {
    if (prepared.view.status !== 'available') return;
    this.#preparedReviewMessageInspections.delete(prepared.view.inspectionIdentity);
    this.#preparedReviewMessageInspections.set(prepared.view.inspectionIdentity, prepared);
    while (this.#preparedReviewMessageInspections.size > MAX_PREPARED_REVIEW_MESSAGE_INSPECTIONS) {
      const oldest = this.#preparedReviewMessageInspections.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#preparedReviewMessageInspections.delete(oldest);
    }
  }

  /**
   * Reuses facts already proved by inspection, then revalidates only mutable
   * source and Adapter facts. A cache miss retains the complete preparation
   * path, so the Workspace Interface gains no cache-ordering requirement.
   */
  async #revalidatePreparedReviewMessageInspection(
    command: CommitReviewMessageCommand,
    index: LoadedHarnessIndex,
  ): Promise<PreparedReviewMessageInspection | undefined> {
    const cached = this.#preparedReviewMessageInspections.get(command.inspectionIdentity);
    const prepared =
      cached ??
      (await this.#prepareReviewMessageInspection(
        command.reviewIdentity,
        command.originReviewBasisIdentity,
        command.location,
        command.body,
        command.attachmentIdentity,
      ));
    if (prepared.view.status !== 'available') return prepared;
    if (
      prepared.view.stateVersion !== index.stateVersion ||
      prepared.view.stateVersion !== command.expectedStateVersion ||
      prepared.view.inspectionIdentity !== command.inspectionIdentity ||
      prepared.view.reviewIdentity !== command.reviewIdentity ||
      prepared.view.originReviewBasisIdentity !== command.originReviewBasisIdentity ||
      prepared.view.location.file.bytesBase64 !== command.location.pathBytesBase64 ||
      prepared.view.location.line !== command.location.line ||
      prepared.reviewIndex?.stateVersion !== index.stateVersion ||
      prepared.reviewIndex.payload.currentReviewIdentity !== command.reviewIdentity ||
      prepared.entry?.reviewIdentity !== command.reviewIdentity ||
      prepared.target === undefined ||
      prepared.attachment === undefined ||
      prepared.live === undefined ||
      prepared.capability === undefined ||
      prepared.manifestSha256 === undefined ||
      prepared.compatibilityIdentity === undefined
    ) {
      return undefined;
    }

    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === command.attachmentIdentity);
    const live = this.#liveAdapters.get(command.attachmentIdentity);
    const capability = live?.manifest.capabilities.find(
      (item): item is DirectReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'direct',
    );
    if (
      attachment === undefined ||
      attachment.availability.status !== 'available' ||
      live === undefined ||
      capability === undefined ||
      !sameValue(attachment, prepared.attachment) ||
      attachment.compatibilityIdentity !== prepared.compatibilityIdentity ||
      live.compatibilityIdentity !== attachment.compatibilityIdentity ||
      live.manifestSha256 !== prepared.manifestSha256 ||
      sha256(JSON.stringify(live.manifest)) !== live.manifestSha256 ||
      live.attachment.attachmentIdentity !== attachment.attachmentIdentity ||
      live.attachment.evidenceIdentity !== attachment.establishmentEvidenceIdentity ||
      !sameValue(live.attachment.destination, attachment.destination) ||
      !sameValue(capability, prepared.capability) ||
      !sameValue(prepared.view.destination, {
        attachmentIdentity: attachment.attachmentIdentity,
        ...attachment.destination,
      })
    ) {
      return undefined;
    }

    // The repository state retained with the Message describes commitment
    // time, not inspection time. Capture only its summary here; the expensive
    // complete Snapshot material was already irrelevant to this commitment.
    const current = await this.#evidence.read({ kind: 'workspace.current-changes.capture' });
    if (current.status !== 'captured') return undefined;
    if (prepared.target.originBasis.kind === 'live') {
      if (prepared.target.liveSourceCaptureIdentity === undefined) return undefined;
      const source = await this.#evidence.read({
        kind: 'workspace.context.verify',
        captureIdentity: prepared.target.liveSourceCaptureIdentity,
      });
      if (
        source.status !== 'settled' ||
        source.verdicts.length !== 1 ||
        source.verdicts[0]?.pathBytesBase64 !== command.location.pathBytesBase64 ||
        source.verdicts[0].currency !== 'current'
      ) {
        return undefined;
      }
    }
    const target: PreparedReviewMessageTarget = {
      ...prepared.target,
      repositoryState: reviewMessageRepositoryState(current),
      capturedRepository: { capture: current, files: [] },
    };
    const material = composeReviewMessageMaterial(command.body, target, prepared.outgoingTemplate);
    if (material.status !== 'composed') return undefined;
    const materialSha256 = sha256(material.bytes);
    const inspectionIdentity = reviewMessageInspectionIdentity({
      stateVersion: index.stateVersion,
      reviewIdentity: command.reviewIdentity,
      originReviewBasisIdentity: command.originReviewBasisIdentity,
      body: command.body,
      target,
      attachment,
      capability,
      commitmentAssessmentIdentity: prepared.view.commitment.assessmentIdentity,
      outgoingMaterialSha256: materialSha256,
    });
    if (
      inspectionIdentity !== command.inspectionIdentity ||
      prepared.view.outgoingMaterial.outgoingMaterialIdentity !== reviewMessageMaterialIdentity(inspectionIdentity) ||
      prepared.view.outgoingMaterial.representation !== material.representation ||
      prepared.view.outgoingMaterial.bytesBase64 !== encodeBytesBase64(material.bytes) ||
      prepared.view.outgoingMaterial.byteLength !== material.bytes.byteLength ||
      prepared.view.outgoingMaterial.characterLength !== material.characterLength ||
      prepared.view.outgoingMaterial.sha256 !== materialSha256 ||
      !(await this.#snapshots.verify(target.capturedRepository))
    ) {
      return undefined;
    }

    return {
      ...prepared,
      target,
      attachment,
      live,
      capability,
      manifestSha256: live.manifestSha256,
      compatibilityIdentity: attachment.compatibilityIdentity,
    };
  }

  async #loadCapturedContextBytes(
    captureIdentity: string,
    pathBytesBase64: string,
    totalByteLength: number,
    maximumWindowBytes: number,
  ): Promise<Uint8Array | undefined> {
    if (totalByteLength === 0) return new Uint8Array();
    const chunks: Buffer[] = [];
    let offset = 0;
    while (offset < totalByteLength) {
      const length = Math.min(maximumWindowBytes, totalByteLength - offset);
      const content = await this.#evidence.read({
        kind: 'workspace.context.content',
        captureIdentity,
        pathBytesBase64,
        offset,
        length,
      });
      if (
        content.status !== 'available' ||
        content.offset !== offset ||
        content.totalByteLength !== totalByteLength ||
        content.byteLength < 1
      ) {
        return undefined;
      }
      const chunk = decodeBytesBase64(content.bytesBase64);
      if (chunk.byteLength !== content.byteLength) return undefined;
      chunks.push(chunk);
      offset += chunk.byteLength;
    }
    return Buffer.concat(chunks, totalByteLength);
  }

  async #defaultAskInspection(reviewIdentity: ReviewIdentity): Promise<DefaultReviewQuestionAskInspectionView> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const index = await this.#loadIndex();
        const connected = this.#candidateAttachments(index);
        const capable = this.#directCapableAttachments(index);
        if (capable.length === 1) {
          const attachment = capable[0];
          if (attachment === undefined) throw new HarnessStateProblem();
          const prepared = await this.#prepareAskInspection(reviewIdentity, attachment.attachmentIdentity);
          if (prepared.view.stateVersion !== index.stateVersion) {
            throw new HarnessProjectionVersionChanged();
          }
          return prepared.view;
        }
        return cloneFrozen({
          kind: 'harness.review-question.default-inspection',
          status: 'unavailable',
          stateVersion: index.stateVersion,
          reviewIdentity,
          reason:
            capable.length > 1
              ? 'attachment-selection-required'
              : connected.length > 0
                ? 'capability-unsupported'
                : index.payload.attachments.length > 0
                  ? 'attachment-not-live'
                  : 'attachment-not-found',
        });
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareAskInspection(
    reviewIdentity: ReviewIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedAskInspection> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#prepareAskInspectionOnce(reviewIdentity, attachmentIdentity);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareAskInspectionOnce(
    reviewIdentity: ReviewIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedAskInspection> {
    const unavailable = (
      stateVersion: number,
      reason: DefaultDirectReviewHandoffUnavailabilityReason,
      blockerIdentities?: readonly string[],
    ): PreparedAskInspection => ({
      view: cloneFrozen({
        kind: 'harness.review-question.default-inspection',
        status: 'unavailable',
        stateVersion,
        reviewIdentity,
        reason,
        ...(blockerIdentities === undefined ? {} : { blockerIdentities }),
      }),
    });
    const index = await this.#loadIndex();
    const stateVersion = index.stateVersion;
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) return unavailable(stateVersion, 'attachment-not-found');
    const live = this.#liveAdapters.get(attachmentIdentity);
    if (live === undefined || live.compatibilityIdentity !== attachment.compatibilityIdentity) {
      return unavailable(stateVersion, 'attachment-not-live');
    }
    const capability = live.manifest.capabilities.find(
      (item): item is DirectReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'direct',
    );
    if (capability === undefined) return unavailable(stateVersion, 'capability-unsupported');
    if (attachment.availability.status === 'blocked') {
      return unavailable(stateVersion, 'availability-blocked');
    }
    if (attachment.availability.status === 'unknown') {
      return unavailable(stateVersion, 'availability-unknown');
    }
    const active = index.payload.invocations.filter(
      item =>
        item.attachmentIdentity === attachmentIdentity &&
        (item.status === 'awaiting-start' || item.status === 'active'),
    );
    if (active.length > 0) {
      return unavailable(
        stateVersion,
        'active-invocation-exists',
        active.map(item => item.invocationIdentity),
      );
    }
    const unresolved = index.payload.invocations.filter(
      item => item.attachmentIdentity === attachmentIdentity && item.status === 'unresolved',
    );
    if (unresolved.length > 0) {
      return unavailable(
        stateVersion,
        'unresolved-invocation-risk-not-acknowledged',
        unresolved.map(item => item.invocationIdentity),
      );
    }

    const reviewIndex = await this.#loadReviewIndexAtVersion(stateVersion);
    const entry = reviewIndex.payload.reviews.find(item => item.reviewIdentity === reviewIdentity);
    if (entry === undefined) return unavailable(stateVersion, 'review-not-found');
    if (reviewIndex.payload.currentReviewIdentity !== reviewIdentity) {
      return unavailable(stateVersion, 'review-not-current');
    }
    if (entry.batchIdentities.length >= MAX_REVIEW_BATCHES || entry.questionIdentities.length >= MAX_REVIEW_QUESTIONS) {
      return unavailable(stateVersion, 'review-handoff-limit-reached');
    }
    if (this.#liveIndexFull(index)) return unavailable(stateVersion, 'harness-index-limit-reached');
    const [snapshotRecord] = await this.#readRecordsAtVersion(stateVersion, [entry.reviewSnapshotIdentity], false);
    if (snapshotRecord?.kind !== 'review.snapshot' || snapshotRecord.recordClass !== 'immutable') {
      throw new HarnessStateProblem();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    if (
      snapshot.reviewIdentity !== reviewIdentity ||
      snapshot.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity
    ) {
      throw new HarnessStateProblem();
    }
    const context = await this.#snapshots.captureContext(reviewIdentity, stateVersion);
    if ('reason' in context) {
      if (context.reason === 'state-version-mismatch') throw new HarnessProjectionVersionChanged();
      return unavailable(stateVersion, 'snapshot-unverified');
    }
    if (snapshot.context !== undefined || !reviewSnapshotContextMatches(snapshot, context)) {
      return unavailable(stateVersion, 'snapshot-context-disclosure-unavailable', [
        snapshot.context?.contextIdentity ?? context.selectionIdentity,
      ]);
    }
    let captured: CapturedReviewSnapshot | undefined;
    let files: readonly CurrentChangedFile[];
    let inspectionBasis: ReviewSnapshotPayload['basis'];
    let inspectionComparedState: ReviewSnapshotPayload['comparedState'];
    let inspectionManifest: ReviewSnapshotPayload['manifest'];
    if (snapshot.comparison !== undefined) {
      const verification = await this.#verifySnapshot(snapshot);
      if (verification !== 'current') {
        return unavailable(stateVersion, verification === 'stale' ? 'snapshot-stale' : 'snapshot-unverified');
      }
      files = await this.#loadCompleteManifest(stateVersion, entry, snapshot);
      inspectionBasis = snapshot.basis;
      inspectionComparedState = snapshot.comparedState;
      inspectionManifest = snapshot.manifest;
    } else {
      const latest = await this.#snapshots.capture({ kind: 'current-changes' });
      if ('reason' in latest) {
        return unavailable(stateVersion, 'snapshot-unverified');
      }
      if (latest.capture.manifest.totalFiles === 0) {
        return unavailable(stateVersion, 'snapshot-stale');
      }
      captured = latest;
      const unchanged = capturedSnapshotMatches(snapshot, latest);
      if (!unchanged && entry.reviewSnapshotIdentities.length >= MAX_REVIEW_SNAPSHOTS) {
        return unavailable(stateVersion, 'state-conflict');
      }
      files = unchanged
        ? await this.#loadCompleteManifest(stateVersion, entry, snapshot)
        : latest.files.map(item => item.file);
      inspectionBasis = latest.capture.basis;
      inspectionComparedState = latest.capture.comparedState;
      inspectionManifest = latest.capture.manifest;
    }
    const final = await this.#state.read({
      recordIdentities: [],
      includeContent: false,
    });
    if (final.stateVersion !== stateVersion) {
      throw new HarnessProjectionVersionChanged();
    }
    const inspectionIdentity = sha256(
      JSON.stringify({
        contractVersion: 1,
        stateVersion,
        reviewIdentity,
        latestReviewSnapshotIdentity: snapshot.reviewSnapshotIdentity,
        basis: inspectionBasis,
        comparedState: inspectionComparedState,
        manifest: inspectionManifest,
        context: {
          selectionIdentity: context.selectionIdentity,
          selectionRevision: context.selectionRevision,
          semanticDigest: context.semanticDigest,
        },
        attachmentIdentity,
        compatibilityIdentity: attachment.compatibilityIdentity,
        capabilityIdentity: capability.capabilityIdentity,
        artifactResultContract: capability.artifactResultContract,
      }),
    );
    return {
      view: cloneFrozen({
        kind: 'harness.review-question.default-inspection',
        status: 'available',
        stateVersion,
        inspectionIdentity,
        reviewIdentity,
        reviewSnapshotIdentity: snapshot.reviewSnapshotIdentity,
        ...(snapshot.comparison === undefined
          ? {
              liveChangesIdentity: reviewLiveChangesIdentity(
                inspectionBasis,
                inspectionComparedState,
                inspectionManifest,
              ),
            }
          : {}),
        destination: {
          attachmentIdentity,
          ...attachment.destination,
        },
        capability: {
          route: 'direct',
          authority: capability.authority,
          effectConstraint: capability.effectConstraint,
          evidenceProfile: capability.evidenceProfile,
          interruption: capability.interruption,
          artifactResultContract: capability.artifactResultContract,
          knownLimitations: capability.knownLimitations,
        },
      }),
      reviewIndex,
      entry,
      snapshot,
      ...(captured === undefined ? {} : { captured }),
      files,
      attachment,
      live,
      capability,
      manifestSha256: live.manifestSha256,
      compatibilityIdentity: attachment.compatibilityIdentity,
    };
  }

  async #resolveQuestionAnchor(
    expectedStateVersion: number,
    entry: ReviewIndexEntry,
    files: readonly CurrentChangedFile[],
    input: ReviewAnchorInput,
  ): Promise<ReviewQuestionAnchor | HarnessCommandRejectionReason> {
    const [record] = await this.#readRecordsAtVersion(
      expectedStateVersion,
      [reviewingRecordIdentity('rsf', entry.reviewSnapshotIdentity, input.fileIdentity)],
      true,
    );
    if (record === undefined) return 'anchor-file-not-found';
    if (record.kind !== 'review.snapshot-file' || record.recordClass !== 'immutable') {
      throw new HarnessStateProblem();
    }
    const payload = parseReviewSnapshotFile(decodeReviewingPayload(record.payload));
    if (
      payload.reviewIdentity !== entry.reviewIdentity ||
      payload.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
      payload.file.fileIdentity !== input.fileIdentity
    ) {
      return 'anchor-file-not-found';
    }
    const side = input.side === 'old' ? payload.file.oldSide : payload.file.newSide;
    if (side === undefined) return 'anchor-side-not-present';
    const content = record.content.find(item => item.role === input.side);
    if (input.kind === 'review.whole-file') {
      if (input.fileAbsolute !== undefined && files[input.fileAbsolute]?.fileIdentity !== input.fileIdentity) {
        return 'anchor-file-not-found';
      }
      const resolvedContent = exactWholeFileAnchorContent(side, content?.bytes);
      if (resolvedContent === undefined) throw new HarnessStateProblem();
      return cloneFrozen({
        kind: 'review.whole-file',
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        fileIdentity: input.fileIdentity,
        side: input.side,
        scope: 'file',
        ...(input.fileAbsolute === undefined ? {} : { fileAbsolute: input.fileAbsolute }),
        content: resolvedContent,
      });
    }
    if (input.fileAbsolute !== undefined && files[input.fileAbsolute]?.fileIdentity !== input.fileIdentity) {
      return 'anchor-file-not-found';
    }
    let rowCoordinates:
      | {
          readonly rowIdentity: string;
          readonly rowAbsolute: number;
        }
      | undefined;
    if (input.rowIdentity !== undefined && input.rowAbsolute !== undefined) {
      if (payload.diff.status !== 'available' || input.rowAbsolute >= payload.diff.totalRows) {
        return 'anchor-line-not-found';
      }
      const window = Math.floor(input.rowAbsolute / REVIEW_DIFF_WINDOW_ROWS);
      const [windowRecord] = await this.#readRecordsAtVersion(
        expectedStateVersion,
        [reviewingRecordIdentity('rdw', entry.reviewSnapshotIdentity, input.fileIdentity, String(window))],
        false,
      );
      if (windowRecord?.kind !== 'review.snapshot-diff-window' || windowRecord.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const diffWindow = parseReviewDiffWindow(decodeReviewingPayload(windowRecord.payload));
      const expectedOffset = window * REVIEW_DIFF_WINDOW_ROWS;
      const row = diffWindow.rows[input.rowAbsolute - expectedOffset];
      if (
        diffWindow.reviewIdentity !== entry.reviewIdentity ||
        diffWindow.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        diffWindow.fileIdentity !== input.fileIdentity ||
        diffWindow.offset !== expectedOffset ||
        row === undefined ||
        (input.side === 'old' ? row.oldLine : row.newLine) !== input.line
      ) {
        return 'anchor-line-not-found';
      }
      rowCoordinates = {
        // The command may carry a verified Live row identity. Retain the
        // equivalent immutable Snapshot row identity in durable disclosure.
        rowIdentity: row.rowIdentity,
        rowAbsolute: input.rowAbsolute,
      };
    }
    if (side.contentAvailability !== 'captured' || side.contentIdentity === undefined) {
      return 'anchor-content-unavailable';
    }
    if (content?.bytes === undefined || content.digest !== side.contentIdentity.value) {
      throw new HarnessStateProblem();
    }
    const line = nthLine(content.bytes, input.line);
    if (line === undefined) return 'anchor-line-not-found';
    if (line.bytes.byteLength > MAX_ANCHOR_LINE_BYTES) return 'anchor-line-too-large';
    return cloneFrozen({
      kind: 'review.diff-line',
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      fileIdentity: input.fileIdentity,
      side: input.side,
      line: input.line,
      ...(input.fileAbsolute === undefined ? {} : { fileAbsolute: input.fileAbsolute }),
      ...(rowCoordinates ?? {}),
      byteOffset: line.offset,
      byteLength: line.bytes.byteLength,
      lineContent: {
        algorithm: 'sha256',
        value: sha256(line.bytes),
        bytesBase64: encodeBytesBase64(line.bytes),
      },
    });
  }

  async #commitReviewMessage(
    command: CommitReviewMessageCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const prepared = await this.#revalidatePreparedReviewMessageInspection(command, index);
    if (prepared === undefined) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    if (prepared.view.stateVersion !== command.expectedStateVersion) {
      return rejected(command, prepared.view.stateVersion, 'state-version-mismatch');
    }
    if (prepared.view.status !== 'available') {
      return rejected(
        command,
        prepared.view.stateVersion,
        prepared.view.reason === 'attachment-selection-required' || prepared.view.reason === 'message-template-invalid'
          ? 'inspection-changed'
          : prepared.view.reason,
        prepared.view.blockerIdentities,
      );
    }
    if (
      prepared.view.inspectionIdentity !== command.inspectionIdentity ||
      prepared.reviewIndex === undefined ||
      prepared.entry === undefined ||
      prepared.target === undefined ||
      prepared.attachment === undefined ||
      prepared.live === undefined ||
      prepared.capability === undefined ||
      prepared.manifestSha256 === undefined ||
      prepared.compatibilityIdentity === undefined
    ) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    const requiredAcknowledgements = prepared.view.commitment.requirements.map(
      requirement => requirement.requirementIdentity,
    );
    if (
      JSON.stringify(command.acceptedAcknowledgementRequirementIdentities) !== JSON.stringify(requiredAcknowledgements)
    ) {
      return rejected(
        command,
        index.stateVersion,
        'commitment-requirements-not-acknowledged',
        requiredAcknowledgements,
      );
    }
    const reviewMessageIdentityValue = reviewMessageIdentity(command.commandIdentity);
    const outgoingMaterialIdentity = prepared.view.outgoingMaterial.outgoingMaterialIdentity;
    const reviewBatchIdentity = reviewingRecordIdentity(
      'rbt',
      command.commandIdentity,
      'direct-review-message-batch',
    ) as ReviewBatchIdentity;
    const handoffIdentity = stableIdentity('hho', command.commandIdentity, 'review-handoff') as HarnessHandoffIdentity;
    const receiptIdentity = stableIdentity(
      'hcr',
      command.commandIdentity,
      'commitment-receipt',
    ) as HarnessCommitmentReceiptIdentity;
    const capabilitySnapshotIdentity = stableIdentity(
      'hcs',
      command.commandIdentity,
      'capability-snapshot',
    ) as HarnessCapabilitySnapshotIdentity;
    const invocationIdentity = stableIdentity(
      'hin',
      command.commandIdentity,
      'direct-invocation',
    ) as HarnessInvocationIdentity;
    const nextStateVersion = index.stateVersion + 1;
    const acknowledgementRequirementIdentities = prepared.view.commitment.requirements.map(
      requirement => requirement.requirementIdentity,
    );
    const acknowledgementIdentities = acknowledgementRequirementIdentities.map(requirementIdentity =>
      reviewMessageAcknowledgementIdentity(requirementIdentity),
    );
    const result: ReviewMessageCommitted = cloneFrozen({
      kind: 'review.message.committed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity,
      reviewMessageIdentity: reviewMessageIdentityValue,
      originReviewBasisIdentity: command.originReviewBasisIdentity,
      outgoingMaterialIdentity,
      outgoingMaterial: {
        outgoingMaterialIdentity,
        byteLength: prepared.view.outgoingMaterial.byteLength,
        characterLength: prepared.view.outgoingMaterial.characterLength,
        sha256: prepared.view.outgoingMaterial.sha256,
      },
      handoffIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
      commitmentAssessmentIdentity: prepared.view.commitment.assessmentIdentity,
      acknowledgementRequirementIdentities,
      acknowledgementIdentities,
    });
    const message: ReviewMessagePayload = {
      formatVersion: 1,
      reviewIdentity: command.reviewIdentity,
      reviewMessageIdentity: reviewMessageIdentityValue,
      originReviewBasisIdentity: command.originReviewBasisIdentity,
      location: prepared.target.location,
      body: command.body,
      outgoingMaterialIdentity,
      repositoryStateAtCommitment: prepared.target.repositoryState,
    };
    const batch: ReviewMessageBatchPayload = {
      formatVersion: 1,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity,
      reviewMessageIdentity: reviewMessageIdentityValue,
      originReviewBasisIdentity: command.originReviewBasisIdentity,
    };
    const materialBytes = decodeBytesBase64(prepared.view.outgoingMaterial.bytesBase64);
    const material: ReviewMessageOutgoingMaterialPayload = {
      formatVersion: 1,
      reviewIdentity: command.reviewIdentity,
      reviewMessageIdentity: reviewMessageIdentityValue,
      outgoingMaterialIdentity,
      representation: prepared.view.outgoingMaterial.representation,
      encoding: 'utf8',
      byteLength: prepared.view.outgoingMaterial.byteLength,
      characterLength: prepared.view.outgoingMaterial.characterLength,
      sha256: prepared.view.outgoingMaterial.sha256,
    };
    const disclosure: ExactReviewMessageHandoffDisclosure = cloneFrozen({
      contractVersion: 1,
      handoffKind: 'submit-review-batch',
      payloadKind: 'review-message',
      authority: prepared.capability.authority,
      outgoingMaterial: prepared.view.outgoingMaterial,
      sha256: prepared.view.outgoingMaterial.sha256,
      byteLength: prepared.view.outgoingMaterial.byteLength,
      characterLength: prepared.view.outgoingMaterial.characterLength,
    });
    const capabilitySnapshot: FrozenDirectReviewCapabilitySnapshot = cloneFrozen({
      snapshotIdentity: capabilitySnapshotIdentity,
      compatibilityIdentity: prepared.compatibilityIdentity as HarnessCompatibilityIdentity,
      manifestSha256: prepared.manifestSha256,
      capability: prepared.capability,
      availabilityAtCommit: 'available',
    });
    const disclosureSummary: ReviewHandoffDisclosureSummary = {
      fileCount: 0,
      questionCount: 0,
      messageCount: 1,
      byteLength: disclosure.byteLength,
      sha256: disclosure.sha256,
    };
    const handoffEntry: HarnessHandoffIndexEntry = {
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity,
      attachmentIdentity: command.attachmentIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
      disclosure: disclosureSummary,
    };
    const invocationEntry: HarnessInvocationIndexEntry = {
      invocationIdentity,
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      attachmentIdentity: command.attachmentIdentity,
      status: 'awaiting-start',
      evidenceIdentities: [],
      interruptionIntentIdentities: [],
    };
    const nextHarnessIndex: HarnessIndexPayload = {
      ...index.payload,
      handoffs: [...index.payload.handoffs, handoffEntry],
      invocations: [...index.payload.invocations, invocationEntry],
    };
    const messageHistory = prepared.entry.messageHistory ?? {
      formatVersion: 1 as const,
      messages: [],
      responses: [],
      changeObservations: [],
    };
    const nextReviewEntry: ReviewIndexEntry = {
      ...prepared.entry,
      batchIdentities: [...prepared.entry.batchIdentities, reviewBatchIdentity],
      messageHistory: {
        ...messageHistory,
        messages: [
          ...messageHistory.messages,
          {
            reviewMessageIdentity: reviewMessageIdentityValue,
            originReviewBasisIdentity: command.originReviewBasisIdentity,
          },
        ],
      },
    };
    const nextReviewIndex: ReviewIndexPayload = {
      ...prepared.reviewIndex.payload,
      reviews: prepared.reviewIndex.payload.reviews.map(entry =>
        entry.reviewIdentity === nextReviewEntry.reviewIdentity ? nextReviewEntry : entry,
      ),
    };
    const acknowledgementRecords = prepared.view.commitment.requirements.map(requirement => {
      const acknowledgementIdentity = reviewMessageAcknowledgementIdentity(requirement.requirementIdentity);
      const payload: ReviewMessageAcknowledgementPayload = {
        formatVersion: 1,
        acknowledgementIdentity,
        requirement,
        acceptedByCommandIdentity: command.commandIdentity,
        acceptedStateVersion: nextStateVersion,
      };
      return immutableRecord(
        acknowledgementIdentity,
        command.reviewIdentity,
        'harness.commitment-acknowledgement',
        payload,
      );
    });
    const records: StateRecordWrite[] = [
      ...acknowledgementRecords,
      immutableRecord(reviewBatchIdentity, command.reviewIdentity, 'review.message-batch', batch),
      immutableRecord(reviewMessageIdentityValue, command.reviewIdentity, 'review.message', message),
      immutableRecord(outgoingMaterialIdentity, command.reviewIdentity, 'review.message-outgoing-material', material, [
        { role: 'outgoing-message', bytes: materialBytes },
      ]),
      immutableRecord(
        handoffIdentity,
        command.reviewIdentity,
        'harness.workflow-handoff',
        {
          formatVersion: 1,
          handoffIdentity,
          handoffKind: 'submit-review-batch',
          payloadKind: 'review-message',
          route: 'direct',
          authority: prepared.capability.authority,
          workspaceIdentity: this.#workspaceIdentity,
          reviewIdentity: command.reviewIdentity,
          reviewBatchIdentity,
          reviewMessageIdentity: reviewMessageIdentityValue,
          originReviewBasisIdentity: command.originReviewBasisIdentity,
          outgoingMaterialIdentity,
          attachmentIdentity: command.attachmentIdentity,
          capabilitySnapshotIdentity,
          commitmentAssessmentIdentity: prepared.view.commitment.assessmentIdentity,
          acknowledgementRequirementIdentities,
          acknowledgementIdentities,
          disclosure: disclosureSummary,
        },
        [
          { role: 'accepted-disclosure', bytes: encode(disclosure) },
          { role: 'outgoing-message', bytes: materialBytes },
        ],
      ),
      immutableRecord(receiptIdentity, command.reviewIdentity, 'harness.commitment-receipt', {
        formatVersion: 1,
        commitmentReceiptIdentity: receiptIdentity,
        handoffIdentity,
        commandIdentity: command.commandIdentity,
        consent: 'commit-message',
        destination: prepared.attachment.destination,
        commitmentAssessmentIdentity: prepared.view.commitment.assessmentIdentity,
        acknowledgementRequirementIdentities,
        acknowledgementIdentities,
        scope: {
          handoffKind: 'submit-review-batch',
          payloadKind: 'review-message',
          authority: prepared.capability.authority,
          reviewBatchIdentity,
          reviewMessageIdentity: reviewMessageIdentityValue,
          originReviewBasisIdentity: command.originReviewBasisIdentity,
          outgoingMaterialIdentity,
          disclosureSha256: disclosure.sha256,
          disclosureByteLength: disclosure.byteLength,
          disclosureCharacterLength: disclosure.characterLength,
        },
        capabilitySnapshotIdentity,
        committedStateVersion: nextStateVersion,
      }),
      immutableRecord(capabilitySnapshotIdentity, command.reviewIdentity, 'harness.capability-snapshot', {
        formatVersion: 1,
        ...capabilitySnapshot,
      }),
      immutableRecord(invocationIdentity, command.reviewIdentity, 'harness.direct-invocation', {
        formatVersion: 1,
        invocationIdentity,
        handoffIdentity,
        attachmentIdentity: command.attachmentIdentity,
        initialStatus: 'awaiting-start',
        automaticReplay: 'prohibited',
      }),
      this.#reviewIndexWrite(prepared.reviewIndex, nextReviewIndex),
      ...(await this.#indexWrites(index, nextHarnessIndex)),
      this.#commandRecord(command, normalized, result),
    ];
    // The code as it stood at send, so this Message's Response can later show
    // exactly what it changed. The same capture was just verified current, and
    // its contents are read from retained evidence without touching the checkout.
    const codeAtSend = await this.#snapshots.capturedFiles(prepared.target.capturedRepository.capture);
    if (codeAtSend !== undefined) {
      records.push(...messageCodeStateRecords(command.reviewIdentity, reviewMessageIdentityValue, codeAtSend));
    }
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records,
      result: { kind: 'harness.command-result', schemaVersion: 1, payload: encode(result) },
    });
    if (!('result' in committed)) return await this.#mapCommandCommitFailure(command, normalized, committed);
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    if (committed.status === 'committed') {
      await this.#afterCommitBeforeDirective?.();
      await this.#performAfterCommit(
        prepared.live,
        cloneFrozen({
          kind: 'harness.direct-review-message.dispatch',
          contractVersion: 1,
          attachmentIdentity: command.attachmentIdentity,
          handoffIdentity,
          invocationIdentity,
          capabilitySnapshot,
          disclosure,
        }),
      );
    }
    return decoded;
  }

  async #askReviewQuestion(
    command: AskPiReviewQuestionCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const prepared = await this.#prepareAskInspection(command.reviewIdentity, command.attachmentIdentity);
    if (prepared.view.stateVersion !== command.expectedStateVersion) {
      return rejected(command, prepared.view.stateVersion, 'state-version-mismatch');
    }
    if (prepared.view.status !== 'available') {
      const reason =
        prepared.view.reason === 'attachment-selection-required' || prepared.view.reason === 'message-template-invalid'
          ? 'inspection-changed'
          : prepared.view.reason;
      if (reason === 'snapshot-stale' || reason === 'snapshot-unverified') {
        return await this.#snapshotRejection(
          command,
          prepared.view.stateVersion,
          reason,
          prepared.view.blockerIdentities,
        );
      }
      return rejected(command, prepared.view.stateVersion, reason, prepared.view.blockerIdentities);
    }
    if (
      prepared.view.inspectionIdentity !== command.inspectionIdentity ||
      prepared.reviewIndex === undefined ||
      prepared.entry === undefined ||
      prepared.snapshot === undefined ||
      prepared.files === undefined ||
      prepared.attachment === undefined ||
      prepared.live === undefined ||
      prepared.capability === undefined ||
      prepared.manifestSha256 === undefined ||
      prepared.compatibilityIdentity === undefined
    ) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    let successor: PreparedReviewSnapshot | undefined;
    let committedSnapshot = prepared.snapshot;
    let committedFiles = prepared.files;
    if (prepared.captured !== undefined && !capturedSnapshotMatches(prepared.snapshot, prepared.captured)) {
      const reviewSnapshotIdentity = reviewingRecordIdentity(
        'rsn',
        command.commandIdentity,
        'successor-review-snapshot',
      ) as ReviewSnapshotIdentity;
      successor = this.#snapshots.prepare({
        reviewIdentity: prepared.entry.reviewIdentity,
        reviewSnapshotIdentity,
        previousReviewSnapshotIdentity: prepared.entry.reviewSnapshotIdentity,
        changeSetIdentity: prepared.entry.changeSetIdentity,
        captured: prepared.captured,
      });
      committedSnapshot = successor.snapshot;
      committedFiles = successor.files;
    }
    const anchor =
      successor === undefined
        ? await this.#resolveQuestionAnchor(
            command.expectedStateVersion,
            prepared.entry,
            prepared.files,
            command.anchor,
          )
        : this.#snapshots.resolveAnchor(successor, command.anchor);
    if (typeof anchor === 'string') {
      return rejected(command, index.stateVersion, anchor);
    }
    const reviewBatchIdentity = reviewingRecordIdentity(
      'rbt',
      command.commandIdentity,
      'direct-question-batch',
    ) as ReviewBatchIdentity;
    const questionIdentity = reviewingRecordIdentity(
      'qst',
      command.commandIdentity,
      'direct-question',
    ) as ReviewQuestionIdentity;
    const handoffIdentity = stableIdentity('hho', command.commandIdentity, 'review-handoff') as HarnessHandoffIdentity;
    const receiptIdentity = stableIdentity(
      'hcr',
      command.commandIdentity,
      'commitment-receipt',
    ) as HarnessCommitmentReceiptIdentity;
    const capabilitySnapshotIdentity = stableIdentity(
      'hcs',
      command.commandIdentity,
      'capability-snapshot',
    ) as HarnessCapabilitySnapshotIdentity;
    const invocationIdentity = stableIdentity(
      'hin',
      command.commandIdentity,
      'direct-invocation',
    ) as HarnessInvocationIdentity;
    const nextStateVersion = index.stateVersion + 1;
    const result: ReviewQuestionAsked = cloneFrozen({
      kind: 'review.question.asked',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: command.reviewIdentity,
      reviewSnapshotIdentity: committedSnapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      questionIdentity,
      handoffIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
    });
    const question: ReviewQuestionPayload = {
      formatVersion: 1,
      reviewIdentity: command.reviewIdentity,
      reviewSnapshotIdentity: committedSnapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      questionIdentity,
      intent: 'question',
      body: command.body,
      anchor,
      ordinal: 0,
    };
    const batch: ReviewQuestionBatchPayload = {
      formatVersion: 1,
      reviewIdentity: command.reviewIdentity,
      reviewSnapshotIdentity: committedSnapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      intent: 'question-only',
      questionIdentities: [questionIdentity],
    };
    const disclosureCore = {
      contractVersion: 1 as const,
      handoffKind: 'submit-review-batch' as const,
      authority: 'discussion-only' as const,
      reviewIdentity: command.reviewIdentity,
      changeSetIdentity: committedSnapshot.changeSetIdentity,
      reviewSnapshotIdentity: committedSnapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      manifest: {
        formatVersion: 1 as const,
        totalFiles: committedSnapshot.manifest.totalFiles,
        digest: committedSnapshot.manifest.digest,
        files: committedFiles,
      },
      questions: [
        {
          sourceQuestionIdentity: questionIdentity,
          ordinal: 0,
          intent: 'question' as const,
          body: command.body,
          anchor,
        },
      ],
    };
    const disclosureBytes = encode(disclosureCore);
    const disclosure: ExactReviewHandoffDisclosure = cloneFrozen({
      ...disclosureCore,
      sha256: sha256(disclosureBytes),
      byteLength: disclosureBytes.byteLength,
    });
    const capabilitySnapshot: FrozenDirectReviewCapabilitySnapshot = cloneFrozen({
      snapshotIdentity: capabilitySnapshotIdentity,
      compatibilityIdentity: prepared.compatibilityIdentity as HarnessCompatibilityIdentity,
      manifestSha256: prepared.manifestSha256,
      capability: prepared.capability,
      availabilityAtCommit: 'available',
    });
    const disclosureSummary: ReviewHandoffDisclosureSummary = {
      fileCount: disclosure.manifest.totalFiles,
      questionCount: 1,
      byteLength: disclosure.byteLength,
      sha256: disclosure.sha256,
    };
    const handoffEntry: HarnessHandoffIndexEntry = {
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity,
      attachmentIdentity: command.attachmentIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
      disclosure: disclosureSummary,
    };
    const invocationEntry: HarnessInvocationIndexEntry = {
      invocationIdentity,
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      attachmentIdentity: command.attachmentIdentity,
      status: 'awaiting-start',
      evidenceIdentities: [],
      interruptionIntentIdentities: [],
    };
    const nextHarnessIndex: HarnessIndexPayload = {
      ...index.payload,
      handoffs: [...index.payload.handoffs, handoffEntry],
      invocations: [...index.payload.invocations, invocationEntry],
    };
    const nextReviewEntry: ReviewIndexEntry = {
      ...prepared.entry,
      ...(successor === undefined
        ? {}
        : {
            reviewSnapshotIdentities: [
              ...prepared.entry.reviewSnapshotIdentities,
              successor.snapshot.reviewSnapshotIdentity,
            ],
            reviewSnapshotIdentity: successor.snapshot.reviewSnapshotIdentity,
          }),
      batchIdentities: [...prepared.entry.batchIdentities, reviewBatchIdentity],
      questionIdentities: [...prepared.entry.questionIdentities, questionIdentity],
    };
    const nextReviewIndex: ReviewIndexPayload = {
      ...prepared.reviewIndex.payload,
      reviews: prepared.reviewIndex.payload.reviews.map(entry =>
        entry.reviewIdentity === nextReviewEntry.reviewIdentity ? nextReviewEntry : entry,
      ),
    };
    const records: StateRecordWrite[] = [
      ...(successor?.records ?? []),
      immutableRecord(reviewBatchIdentity, command.reviewIdentity, 'review.question-batch', batch),
      immutableRecord(questionIdentity, command.reviewIdentity, 'review.question', question),
      immutableRecord(
        handoffIdentity,
        command.reviewIdentity,
        'harness.workflow-handoff',
        {
          formatVersion: 1,
          handoffIdentity,
          handoffKind: 'submit-review-batch',
          route: 'direct',
          authority: 'discussion-only',
          workspaceIdentity: this.#workspaceIdentity,
          reviewIdentity: command.reviewIdentity,
          reviewSnapshotIdentity: committedSnapshot.reviewSnapshotIdentity,
          changeSetIdentity: committedSnapshot.changeSetIdentity,
          reviewBatchIdentity,
          attachmentIdentity: command.attachmentIdentity,
          capabilitySnapshotIdentity,
          disclosure: disclosureSummary,
        },
        [{ role: 'accepted-disclosure', bytes: encode(disclosure) }],
      ),
      immutableRecord(receiptIdentity, command.reviewIdentity, 'harness.commitment-receipt', {
        formatVersion: 1,
        commitmentReceiptIdentity: receiptIdentity,
        handoffIdentity,
        commandIdentity: command.commandIdentity,
        consent: 'ask-pi',
        destination: prepared.attachment.destination,
        scope: {
          handoffKind: 'submit-review-batch',
          authority: 'discussion-only',
          reviewBatchIdentity,
          questionIdentity,
          disclosureSha256: disclosure.sha256,
        },
        capabilitySnapshotIdentity,
        committedStateVersion: nextStateVersion,
      }),
      immutableRecord(capabilitySnapshotIdentity, command.reviewIdentity, 'harness.capability-snapshot', {
        formatVersion: 1,
        ...capabilitySnapshot,
      }),
      immutableRecord(invocationIdentity, command.reviewIdentity, 'harness.direct-invocation', {
        formatVersion: 1,
        invocationIdentity,
        handoffIdentity,
        attachmentIdentity: command.attachmentIdentity,
        initialStatus: 'awaiting-start',
        automaticReplay: 'prohibited',
      }),
      this.#reviewIndexWrite(prepared.reviewIndex, nextReviewIndex),
      ...(await this.#indexWrites(index, nextHarnessIndex)),
      this.#commandRecord(command, normalized, result),
    ];
    if (prepared.captured !== undefined && !(await this.#snapshots.verify(prepared.captured))) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records,
      result: {
        kind: 'harness.command-result',
        schemaVersion: 1,
        payload: encode(result),
      },
    });
    if (!('result' in committed)) {
      return await this.#mapCommandCommitFailure(command, normalized, committed);
    }
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    if (committed.status === 'committed') {
      await this.#afterCommitBeforeDirective?.();
      await this.#performAfterCommit(
        prepared.live,
        cloneFrozen({
          kind: 'harness.direct-review.dispatch',
          contractVersion: 1,
          attachmentIdentity: command.attachmentIdentity,
          handoffIdentity,
          invocationIdentity,
          capabilitySnapshot,
          disclosure,
        }),
      );
    }
    return decoded;
  }

  async #commitReviewHandoff(
    command: CommitDirectReviewHandoffCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const prepared = await this.#prepareInspection(
      command.reviewIdentity,
      command.reviewBatchIdentity,
      command.attachmentIdentity,
    );
    if (prepared.view.stateVersion !== command.expectedStateVersion) {
      return rejected(command, prepared.view.stateVersion, 'state-version-mismatch');
    }
    if (prepared.view.status !== 'available') {
      if (prepared.view.reason === 'snapshot-stale' || prepared.view.reason === 'snapshot-unverified') {
        return await this.#snapshotRejection(
          command,
          prepared.view.stateVersion,
          prepared.view.reason,
          prepared.view.blockerIdentities,
        );
      }
      return rejected(command, prepared.view.stateVersion, prepared.view.reason, prepared.view.blockerIdentities);
    }
    if (
      prepared.view.inspectionIdentity !== command.inspectionIdentity ||
      prepared.basis === undefined ||
      prepared.attachment === undefined ||
      prepared.live === undefined ||
      prepared.capability === undefined ||
      prepared.manifestSha256 === undefined ||
      prepared.compatibilityIdentity === undefined
    ) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    if (prepared.view.requiresUnresolvedInvocationRiskAcknowledgement && !command.acknowledgeUnresolvedInvocationRisk) {
      return rejected(command, index.stateVersion, 'unresolved-invocation-risk-not-acknowledged');
    }

    const handoffIdentity = stableIdentity('hho', command.commandIdentity, 'review-handoff') as HarnessHandoffIdentity;
    const receiptIdentity = stableIdentity(
      'hcr',
      command.commandIdentity,
      'commitment-receipt',
    ) as HarnessCommitmentReceiptIdentity;
    const capabilitySnapshotIdentity = stableIdentity(
      'hcs',
      command.commandIdentity,
      'capability-snapshot',
    ) as HarnessCapabilitySnapshotIdentity;
    const invocationIdentity = stableIdentity(
      'hin',
      command.commandIdentity,
      'direct-invocation',
    ) as HarnessInvocationIdentity;
    const nextStateVersion = index.stateVersion + 1;
    const result: DirectReviewHandoffCommitted = cloneFrozen({
      kind: 'harness.review-handoff.direct-committed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity: command.reviewBatchIdentity,
      handoffIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
    });
    const capabilitySnapshot: FrozenDirectReviewCapabilitySnapshot = cloneFrozen({
      snapshotIdentity: capabilitySnapshotIdentity,
      compatibilityIdentity: prepared.compatibilityIdentity as HarnessCompatibilityIdentity,
      manifestSha256: prepared.manifestSha256,
      capability: prepared.capability,
      availabilityAtCommit: 'available',
    });
    const disclosureSummary: ReviewHandoffDisclosureSummary = {
      fileCount: prepared.basis.disclosure.manifest.totalFiles,
      questionCount: prepared.basis.disclosure.questions.length,
      byteLength: prepared.basis.disclosure.byteLength,
      sha256: prepared.basis.disclosure.sha256,
    };
    const handoffEntry: HarnessHandoffIndexEntry = {
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity: command.reviewBatchIdentity,
      attachmentIdentity: command.attachmentIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      invocationIdentity,
      disclosure: disclosureSummary,
    };
    const invocationEntry: HarnessInvocationIndexEntry = {
      invocationIdentity,
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      attachmentIdentity: command.attachmentIdentity,
      status: 'awaiting-start',
      evidenceIdentities: [],
      interruptionIntentIdentities: [],
    };
    const nextIndex: HarnessIndexPayload = {
      ...index.payload,
      handoffs: [...index.payload.handoffs, handoffEntry],
      invocations: [...index.payload.invocations, invocationEntry],
    };
    const records: StateRecordWrite[] = [
      immutableRecord(
        handoffIdentity,
        command.reviewIdentity,
        'harness.workflow-handoff',
        {
          formatVersion: 1,
          handoffIdentity,
          handoffKind: 'submit-review-batch',
          route: 'direct',
          authority: 'discussion-only',
          workspaceIdentity: this.#workspaceIdentity,
          reviewIdentity: command.reviewIdentity,
          reviewSnapshotIdentity: prepared.basis.snapshot.reviewSnapshotIdentity,
          changeSetIdentity: prepared.basis.snapshot.changeSetIdentity,
          reviewBatchIdentity: command.reviewBatchIdentity,
          attachmentIdentity: command.attachmentIdentity,
          capabilitySnapshotIdentity,
          disclosure: disclosureSummary,
        },
        [{ role: 'accepted-disclosure', bytes: encode(prepared.basis.disclosure) }],
      ),
      immutableRecord(receiptIdentity, command.reviewIdentity, 'harness.commitment-receipt', {
        formatVersion: 1,
        commitmentReceiptIdentity: receiptIdentity,
        handoffIdentity,
        commandIdentity: command.commandIdentity,
        consent: 'explicit-command',
        destination: prepared.attachment.destination,
        scope: {
          handoffKind: 'submit-review-batch',
          authority: 'discussion-only',
          reviewBatchIdentity: command.reviewBatchIdentity,
          disclosureSha256: prepared.basis.disclosure.sha256,
        },
        capabilitySnapshotIdentity,
        committedStateVersion: nextStateVersion,
      }),
      immutableRecord(capabilitySnapshotIdentity, command.reviewIdentity, 'harness.capability-snapshot', {
        formatVersion: 1,
        ...capabilitySnapshot,
      }),
      immutableRecord(invocationIdentity, command.reviewIdentity, 'harness.direct-invocation', {
        formatVersion: 1,
        invocationIdentity,
        handoffIdentity,
        attachmentIdentity: command.attachmentIdentity,
        initialStatus: 'awaiting-start',
        automaticReplay: 'prohibited',
      }),
      ...(await this.#indexWrites(index, nextIndex)),
      this.#commandRecord(command, normalized, result),
    ];

    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records,
      result: {
        kind: 'harness.command-result',
        schemaVersion: 1,
        payload: encode(result),
      },
    });
    if (!('result' in committed)) {
      return await this.#mapCommandCommitFailure(command, normalized, committed);
    }
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    if (committed.status === 'committed') {
      await this.#afterCommitBeforeDirective?.();
      const directive: CommittedHarnessDirective = cloneFrozen({
        kind: 'harness.direct-review.dispatch',
        contractVersion: 1,
        attachmentIdentity: command.attachmentIdentity,
        handoffIdentity,
        invocationIdentity,
        capabilitySnapshot,
        disclosure: prepared.basis.disclosure,
      });
      await this.#performAfterCommit(prepared.live, directive);
    }
    return decoded;
  }

  async #requestInterruption(
    command: RequestHarnessInterruptionCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const invocation = index.payload.invocations.find(item => item.invocationIdentity === command.invocationIdentity);
    if (invocation === undefined) {
      const settled = await this.#settledInvocation(index.stateVersion, command.invocationIdentity);
      return rejected(
        command,
        index.stateVersion,
        settled === undefined ? 'invocation-not-found' : 'invocation-not-interruptible',
      );
    }
    if (invocation.status !== 'awaiting-start' && invocation.status !== 'active') {
      return rejected(command, index.stateVersion, 'invocation-not-interruptible');
    }
    if (invocation.interruptionIntentIdentities.length >= MAX_INTERRUPTION_INTENTS) {
      return rejected(command, index.stateVersion, 'state-conflict');
    }
    const intentIdentity = stableIdentity(
      'hir',
      command.commandIdentity,
      'interruption-intent',
    ) as HarnessInterruptionIntentIdentity;
    const nextStateVersion = index.stateVersion + 1;
    const result: HarnessInterruptionRequested = cloneFrozen({
      kind: 'harness.invocation.interruption-requested',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      invocationIdentity: command.invocationIdentity,
      interruptionIntentIdentity: intentIdentity,
      route: 'direct-request',
    });
    const nextInvocation: HarnessInvocationIndexEntry = {
      ...invocation,
      interruptionIntentIdentities: [...invocation.interruptionIntentIdentities, intentIdentity],
    };
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        immutableRecord(intentIdentity, invocation.reviewIdentity, 'harness.interruption-intent', {
          formatVersion: 1,
          interruptionIntentIdentity: intentIdentity,
          invocationIdentity: command.invocationIdentity,
          route: 'direct-request',
          statusAtRequest: invocation.status,
          implication: 'intent-only',
        }),
        ...(await this.#indexWrites(index, replaceInvocation(index.payload, nextInvocation))),
        this.#commandRecord(command, normalized, result),
      ],
      result: {
        kind: 'harness.command-result',
        schemaVersion: 1,
        payload: encode(result),
      },
    });
    if (!('result' in committed)) {
      return await this.#mapCommandCommitFailure(command, normalized, committed);
    }
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    if (committed.status === 'committed') {
      const live = this.#liveAdapters.get(invocation.attachmentIdentity);
      if (live !== undefined) {
        await this.#performAfterCommit(
          live,
          cloneFrozen({
            kind: 'harness.direct-invocation.interrupt',
            contractVersion: 1,
            attachmentIdentity: invocation.attachmentIdentity,
            invocationIdentity: invocation.invocationIdentity,
            interruptionIntentIdentity: intentIdentity,
          }),
        );
      }
    }
    return decoded;
  }

  async #performAfterCommit(live: LiveAdapter, directive: CommittedHarnessDirective): Promise<void> {
    let observation: HarnessDirectiveObservation;
    try {
      observation = await live.connection.perform(directive);
    } catch {
      return;
    }
    if (observation.status === 'proven-not-dispatched') {
      await this.#acceptEvidence(directive.attachmentIdentity, {
        kind: 'harness.invocation.rejected',
        evidenceIdentity: observation.evidenceIdentity,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
        reason: observation.reason,
      });
    }
  }

  async #prepareInspection(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedInspection> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#prepareInspectionOnce(reviewIdentity, reviewBatchIdentity, attachmentIdentity);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareInspectionOnce(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedInspection> {
    const index = await this.#loadIndex();
    const stateVersion = index.stateVersion;
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'attachment-not-found',
      );
    }
    const live = this.#liveAdapters.get(attachmentIdentity);
    if (live === undefined || live.compatibilityIdentity !== attachment.compatibilityIdentity) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'attachment-not-live',
      );
    }
    const capability = live.manifest.capabilities.find(
      (item): item is DirectReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'direct',
    );
    if (capability === undefined) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'capability-unsupported',
      );
    }
    if (attachment.availability.status === 'blocked') {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'availability-blocked',
      );
    }
    if (attachment.availability.status === 'unknown') {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'availability-unknown',
      );
    }
    const active = index.payload.invocations.filter(
      item =>
        item.attachmentIdentity === attachmentIdentity &&
        (item.status === 'awaiting-start' || item.status === 'active'),
    );
    if (active.length > 0) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'active-invocation-exists',
        active.map(item => item.invocationIdentity),
      );
    }
    const priorHandoff =
      index.payload.handoffs.find(item => item.reviewBatchIdentity === reviewBatchIdentity) ??
      (await this.#loadReviewHistories(stateVersion, [reviewIdentity]))
        .get(reviewIdentity)
        ?.payload.handoffs.find(item => item.reviewBatchIdentity === reviewBatchIdentity);
    if (priorHandoff !== undefined) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'batch-already-handed-off',
        [priorHandoff.handoffIdentity],
      );
    }
    if (this.#liveIndexFull(index)) {
      return unavailableInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'harness-index-limit-reached',
      );
    }

    const basis = await this.#loadReviewDisclosure(stateVersion, reviewIdentity, reviewBatchIdentity);
    if (typeof basis === 'string') {
      return unavailableInspection(stateVersion, reviewIdentity, reviewBatchIdentity, attachmentIdentity, basis);
    }
    const final = await this.#state.read({
      recordIdentities: [],
      includeContent: false,
    });
    if (final.stateVersion !== stateVersion) throw new HarnessProjectionVersionChanged();

    const unresolved = index.payload.invocations.some(
      item => item.attachmentIdentity === attachmentIdentity && item.status === 'unresolved',
    );
    const inspectionIdentity = sha256(
      JSON.stringify({
        contractVersion: 1,
        stateVersion,
        reviewIdentity,
        reviewSnapshotIdentity: basis.snapshot.reviewSnapshotIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        compatibilityIdentity: attachment.compatibilityIdentity,
        capabilityIdentity: capability.capabilityIdentity,
        manifestSha256: live.manifestSha256,
        disclosureSha256: basis.disclosure.sha256,
        unresolved,
      }),
    );
    const view: DirectReviewHandoffAvailableView = cloneFrozen({
      kind: 'harness.review-handoff.inspection',
      status: 'available',
      stateVersion,
      inspectionIdentity,
      reviewIdentity,
      reviewSnapshotIdentity: basis.snapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      destination: {
        attachmentIdentity,
        ...attachment.destination,
      },
      capability: {
        route: 'direct',
        authority: capability.authority,
        effectConstraint: capability.effectConstraint,
        evidenceProfile: capability.evidenceProfile,
        interruption: capability.interruption,
        artifactResultContract: capability.artifactResultContract,
        knownLimitations: capability.knownLimitations,
      },
      disclosure: {
        fileCount: basis.disclosure.manifest.totalFiles,
        questionCount: basis.disclosure.questions.length,
        byteLength: basis.disclosure.byteLength,
        sha256: basis.disclosure.sha256,
      },
      requiresUnresolvedInvocationRiskAcknowledgement: unresolved,
    });
    return {
      view,
      basis,
      attachment,
      live,
      capability,
      manifestSha256: live.manifestSha256,
      compatibilityIdentity: attachment.compatibilityIdentity,
    };
  }

  async #loadReviewDisclosure(
    expectedStateVersion: number,
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
  ): Promise<ReviewDisclosureBasis | HarnessCommandRejectionReason> {
    const reviewIndexIdentity = reviewingRecordIdentity('rvi', this.#workspaceIdentity);
    const indexRead = await this.#state.read({
      recordIdentities: [reviewIndexIdentity],
      includeContent: false,
    });
    if (indexRead.stateVersion !== expectedStateVersion) {
      throw new HarnessProjectionVersionChanged();
    }
    if (indexRead.quarantineReports.length > 0) throw new HarnessStateProblem();
    const reviewIndexRecord = indexRead.records[0];
    if (reviewIndexRecord === undefined) return 'review-not-found';
    if (reviewIndexRecord.kind !== 'review.index' || reviewIndexRecord.recordClass !== 'revisioned') {
      throw new HarnessStateProblem();
    }
    const reviewIndex = parseReviewIndex(decodeReviewingPayload(reviewIndexRecord.payload));
    const entry = reviewIndex.reviews.find(item => item.reviewIdentity === reviewIdentity);
    if (entry === undefined) return 'review-not-found';
    if (entry.status !== 'active') return 'review-not-active';
    if (!entry.batchIdentities.includes(reviewBatchIdentity)) return 'batch-not-found';

    const basisRecords = await this.#readRecordsAtVersion(
      expectedStateVersion,
      [entry.reviewSnapshotIdentity, reviewBatchIdentity],
      false,
    );
    const [snapshotRecord, batchRecord] = basisRecords;
    if (
      snapshotRecord === undefined ||
      snapshotRecord.kind !== 'review.snapshot' ||
      snapshotRecord.recordClass !== 'immutable' ||
      batchRecord === undefined ||
      batchRecord.kind !== 'review.question-batch' ||
      batchRecord.recordClass !== 'immutable'
    ) {
      throw new HarnessStateProblem();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    const batch = parseReviewQuestionBatch(decodeReviewingPayload(batchRecord.payload));
    if (
      snapshot.reviewIdentity !== reviewIdentity ||
      snapshot.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
      batch.reviewIdentity !== reviewIdentity ||
      batch.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
      batch.reviewBatchIdentity !== reviewBatchIdentity
    ) {
      throw new HarnessStateProblem();
    }
    if (snapshot.context !== undefined) return 'snapshot-context-disclosure-unavailable';

    const verification = await this.#verifySnapshot(snapshot);
    if (verification !== 'current') {
      return verification === 'stale' ? 'snapshot-stale' : 'snapshot-unverified';
    }

    const questionRecords = await this.#readRecordsAtVersion(expectedStateVersion, batch.questionIdentities, false);
    const questions = questionRecords.map((record, ordinal) => {
      if (record.kind !== 'review.question' || record.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const question = parseReviewQuestion(decodeReviewingPayload(record.payload));
      if (
        question.reviewIdentity !== reviewIdentity ||
        question.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        question.reviewBatchIdentity !== reviewBatchIdentity ||
        question.questionIdentity !== batch.questionIdentities[ordinal] ||
        question.ordinal !== ordinal ||
        question.intent !== 'question'
      ) {
        throw new HarnessStateProblem();
      }
      return question;
    });

    const files = await this.#loadCompleteManifest(expectedStateVersion, entry, snapshot);
    if (questions.some(question => !exactQuestionAnchorIsValid(question, snapshot, files))) {
      throw new HarnessStateProblem();
    }
    const disclosureCore = {
      contractVersion: 1 as const,
      handoffKind: 'submit-review-batch' as const,
      authority: 'discussion-only' as const,
      reviewIdentity,
      changeSetIdentity: snapshot.changeSetIdentity,
      reviewSnapshotIdentity: snapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      manifest: {
        formatVersion: 1 as const,
        totalFiles: snapshot.manifest.totalFiles,
        digest: snapshot.manifest.digest,
        files,
      },
      questions: questions.map(question => ({
        sourceQuestionIdentity: question.questionIdentity,
        ordinal: question.ordinal,
        intent: 'question' as const,
        body: question.body,
        anchor: question.anchor,
      })),
    };
    const bytes = encode(disclosureCore);
    const disclosure: ExactReviewHandoffDisclosure = cloneFrozen({
      ...disclosureCore,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    });
    return { snapshot, batch, questions, files, disclosure };
  }

  async #loadCompleteManifest(
    expectedStateVersion: number,
    entry: ReviewIndexEntry,
    snapshot: ReviewSnapshotPayload,
  ): Promise<readonly CurrentChangedFile[]> {
    const identities: string[] = [];
    for (let offset = 0; offset < snapshot.manifest.totalFiles; offset += REVIEW_MANIFEST_WINDOW_FILES) {
      identities.push(
        reviewingRecordIdentity('rmw', snapshot.reviewSnapshotIdentity, String(offset / REVIEW_MANIFEST_WINDOW_FILES)),
      );
    }
    if (identities.length === 0) return [];
    const records = await this.#readRecordsAtVersion(expectedStateVersion, identities, false);
    const files: CurrentChangedFile[] = [];
    records.forEach((record, window) => {
      if (record.kind !== 'review.snapshot-manifest-window' || record.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const payload = parseReviewManifestWindow(decodeReviewingPayload(record.payload));
      if (
        payload.reviewIdentity !== entry.reviewIdentity ||
        payload.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
        payload.offset !== window * REVIEW_MANIFEST_WINDOW_FILES
      ) {
        throw new HarnessStateProblem();
      }
      files.push(...payload.files);
    });
    // Durable verifier: parsed windows reconstruct the historical public-file
    // order emitted by Workspace Evidence. The golden manifest-digest scenario
    // pins this plain JSON representation across both Modules.
    if (
      files.length !== snapshot.manifest.totalFiles ||
      new Set(files.map(file => file.fileIdentity)).size !== files.length ||
      snapshot.manifest.digest.algorithm !== 'sha256' ||
      sha256(JSON.stringify(files)) !== snapshot.manifest.digest.value
    ) {
      throw new HarnessStateProblem();
    }
    return cloneFrozen(files);
  }

  /**
   * A command-level Snapshot rejection is subordinate to the serialization
   * check. When verification reports a moving workspace, a concurrent command
   * may already have committed: the State version has moved, so the command is
   * stale regardless of the Snapshot verdict. Report the truer
   * `state-version-mismatch` instead of the snapshot symptom.
   */
  async #snapshotRejection(
    command: HarnessInteractionCommand,
    stateVersion: number,
    reason: HarnessCommandRejectionReason,
    blockerIdentities?: readonly string[],
  ): Promise<HarnessInteractionCommandResult> {
    const status = await this.#state.status();
    if (status.stateVersion !== undefined && status.stateVersion !== command.expectedStateVersion) {
      return rejected(command, status.stateVersion, 'state-version-mismatch');
    }
    return rejected(command, stateVersion, reason, blockerIdentities);
  }

  async #verifySnapshot(snapshot: ReviewSnapshotPayload): Promise<'current' | 'stale' | 'unverified'> {
    const comparison = await this.#verifyComparisonOnly(snapshot);
    if (comparison === 'unverified') return 'unverified';
    const context = (await this.#snapshots.verifyPersistedContext(snapshot)).verdict;
    if (comparison === 'stale' || context === 'stale') return 'stale';
    return context;
  }

  async #verifyComparisonOnly(snapshot: ReviewSnapshotPayload): Promise<'current' | 'stale' | 'unverified'> {
    if (snapshot.comparison !== undefined) {
      return await this.#snapshots.verifyPersistedComparison(snapshot);
    }
    if (snapshot.sourceEvidenceIdentity !== undefined) {
      const retained = await this.#evidence.read({
        kind: 'workspace.current-changes.verify',
        evidenceIdentity: snapshot.sourceEvidenceIdentity,
      });
      if (retained.verification.reason !== 'evidence-not-retained') {
        return retained.verification.state;
      }
    }
    const capture = await this.#evidence.read({
      kind: 'workspace.current-changes.capture',
    });
    if (capture.status !== 'captured' || capture.verification.state !== 'current') {
      return 'unverified';
    }
    return sameValue(capture.basis, snapshot.basis) &&
      sameValue(capture.comparedState, snapshot.comparedState) &&
      sameValue(capture.manifest, snapshot.manifest)
      ? 'current'
      : 'stale';
  }

  async #defaultInspection(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
  ): Promise<DefaultDirectReviewHandoffInspectionView> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#defaultInspectionOnce(reviewIdentity, reviewBatchIdentity);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) {
          throw error;
        }
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #defaultInspectionOnce(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
  ): Promise<DefaultDirectReviewHandoffInspectionView> {
    const index = await this.#loadIndex();
    const connected = this.#candidateAttachments(index);
    const capable = this.#directCapableAttachments(index);
    if (capable.length === 1) {
      const attachment = capable[0];
      if (attachment === undefined) throw new HarnessStateProblem();
      const prepared = await this.#prepareInspection(
        reviewIdentity,
        reviewBatchIdentity,
        attachment.attachmentIdentity,
      );
      if (prepared.view.stateVersion !== index.stateVersion) {
        throw new HarnessProjectionVersionChanged();
      }
      return cloneFrozen({
        ...prepared.view,
        kind: 'harness.review-handoff.default-inspection',
      });
    }

    const reason =
      capable.length > 1
        ? 'attachment-selection-required'
        : connected.length > 0
          ? 'capability-unsupported'
          : index.payload.attachments.length > 0
            ? 'attachment-not-live'
            : 'attachment-not-found';
    return cloneFrozen({
      kind: 'harness.review-handoff.default-inspection',
      status: 'unavailable',
      stateVersion: index.stateVersion,
      reviewIdentity,
      reviewBatchIdentity,
      reason,
    });
  }

  async #commandResultView(commandIdentity: string): Promise<HarnessCommandResultView> {
    const read = await this.#state.read({
      recordIdentities: [stableIdentity('hcm', commandIdentity)],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (record === undefined) {
      return cloneFrozen({
        kind: 'harness.command-result',
        status: 'not-found',
        stateVersion: read.stateVersion,
        commandIdentity,
      });
    }
    if (record.kind !== 'harness.command' || record.recordClass !== 'immutable') {
      throw new HarnessStateProblem();
    }
    const payload = parseHarnessCommandRecord(decode(record.payload));
    if (payload.result.commandIdentity !== commandIdentity) {
      throw new HarnessStateProblem();
    }
    return cloneFrozen({
      kind: 'harness.command-result',
      status: 'available',
      stateVersion: read.stateVersion,
      commandIdentity,
      committedStateVersion: payload.result.stateVersion,
      result: payload.result,
    });
  }

  async #interactionView(
    reviewIdentity: ReviewIdentity,
    offset: number,
    limit: number,
  ): Promise<ReviewHarnessInteractionView> {
    // History, the live index and the Review index are read at one State version.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#interactionViewOnce(reviewIdentity, offset, limit);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) throw error;
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #interactionViewOnce(
    reviewIdentity: ReviewIdentity,
    offset: number,
    limit: number,
  ): Promise<ReviewHarnessInteractionView> {
    const index = await this.#loadIndex();
    const history = (await this.#loadReviewHistories(index.stateVersion, [reviewIdentity])).get(reviewIdentity);
    const liveHandoffs = index.payload.handoffs.filter(item => item.reviewIdentity === reviewIdentity);
    const allHandoffs = await this.#inSendOrder(index.stateVersion, reviewIdentity, [
      ...(history?.payload.handoffs ?? []),
      ...liveHandoffs,
    ]);
    const handoffs = allHandoffs.slice(offset, offset + limit);
    const batchRecords = await this.#readRecordsAtVersion(
      index.stateVersion,
      handoffs.map(item => item.reviewBatchIdentity),
      false,
    );
    const messageIdentities = new Map(
      batchRecords
        .filter(record => record.kind === 'review.message-batch')
        .map(record => {
          const batch = parseReviewMessageBatch(decodeReviewingPayload(record.payload));
          return [batch.reviewBatchIdentity, batch.reviewMessageIdentity] as const;
        }),
    );
    const invocationIds = new Set(handoffs.map(item => item.invocationIdentity));
    const nextOffset = offset + handoffs.length < allHandoffs.length ? offset + handoffs.length : null;
    return cloneFrozen({
      kind: 'harness.review-interaction',
      stateVersion: index.stateVersion,
      reviewIdentity,
      totalInteractions: allHandoffs.length,
      offset,
      nextOffset,
      handoffs: handoffs.map(item => projectionHandoff(item, messageIdentities.get(item.reviewBatchIdentity))),
      invocations: [...(history?.payload.invocations ?? []), ...index.payload.invocations]
        .filter(item => invocationIds.has(item.invocationIdentity))
        .map(projectionInvocation),
    });
  }

  /**
   * One Review's Handoffs from history and the live index, in the order their
   * Review Batches were committed, so moving a Handoff to history never moves it
   * in the view. Ties keep their stored order.
   */
  async #inSendOrder(
    stateVersion: number,
    reviewIdentity: ReviewIdentity,
    handoffs: readonly HarnessHandoffIndexEntry[],
  ): Promise<readonly HarnessHandoffIndexEntry[]> {
    if (handoffs.length < 2) return handoffs;
    const entry = (await this.#loadReviewIndexAtVersion(stateVersion)).payload.reviews.find(
      item => item.reviewIdentity === reviewIdentity,
    );
    const position = new Map(entry?.batchIdentities.map((identity, order) => [identity, order]));
    const order = (handoff: HarnessHandoffIndexEntry): number =>
      position.get(handoff.reviewBatchIdentity) ?? Number.MAX_SAFE_INTEGER;
    return handoffs
      .map((handoff, stored) => ({ handoff, stored }))
      .sort((left, right) => order(left.handoff) - order(right.handoff) || left.stored - right.stored)
      .map(item => item.handoff);
  }

  async #loadReviewIndexAtVersion(expectedStateVersion: number): Promise<LoadedReviewIndex> {
    const identity = reviewingRecordIdentity('rvi', this.#workspaceIdentity);
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: false,
    });
    if (read.stateVersion !== expectedStateVersion) {
      throw new HarnessProjectionVersionChanged();
    }
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (record === undefined) {
      return {
        stateVersion: read.stateVersion,
        revision: 0,
        payload: { formatVersion: 1, reviews: [] },
      };
    }
    if (record.kind !== 'review.index' || record.recordClass !== 'revisioned' || record.schemaVersion !== 1) {
      throw new HarnessStateProblem();
    }
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload: parseReviewIndex(decodeReviewingPayload(record.payload)),
    };
  }

  #reviewIndexWrite(index: LoadedReviewIndex, payload: ReviewIndexPayload): StateRecordWrite {
    const identity = reviewingRecordIdentity('rvi', this.#workspaceIdentity);
    return revisionedRecord(identity, identity, 'review.index', index.revision, payload);
  }

  async #loadIndex(): Promise<LoadedHarnessIndex> {
    const read = await this.#state.read({
      recordIdentities: [this.#indexIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (record === undefined) {
      return { stateVersion: read.stateVersion, revision: 0, payload: emptyIndex() };
    }
    if (record.kind !== 'harness.index' || record.recordClass !== 'revisioned' || record.schemaVersion !== 1) {
      throw new HarnessStateProblem();
    }
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload: parseIndex(decode(record.payload)),
    };
  }

  #indexWrite(index: LoadedHarnessIndex, payload: HarnessIndexPayload): StateRecordWrite {
    return revisionedRecord(this.#indexIdentity, this.#indexIdentity, 'harness.index', index.revision, payload);
  }

  /** Every index write: settled work moves into its Review's history in the same commit. */
  async #indexWrites(index: LoadedHarnessIndex, payload: HarnessIndexPayload): Promise<StateRecordWrite[]> {
    return (await this.#movedIndexWrites(index, payload)).records;
  }

  async #movedIndexWrites(
    index: LoadedHarnessIndex,
    payload: HarnessIndexPayload,
    keptAttachmentIdentity?: HarnessAttachmentIdentity,
    returningHistories?: ReadonlyMap<ReviewIdentity, LoadedReviewHistory>,
  ): Promise<{ readonly payload: HarnessIndexPayload; readonly records: StateRecordWrite[] }> {
    // Only an attachment handshake needs all Reviews: an unknown turn may be
    // in a Previous Review. Ordinary writes keep their bounded affected set.
    const loaded =
      returningHistories ??
      (keptAttachmentIdentity === undefined
        ? await this.#loadReviewHistories(index.stateVersion, reviewsWithMovableInteractions(payload))
        : await this.#allReviewHistories(index.stateVersion));
    const histories = new Map([...loaded].map(([reviewIdentity, history]) => [reviewIdentity, history.payload]));
    const restored =
      keptAttachmentIdentity === undefined
        ? { index: payload, histories: new Map<ReviewIdentity, HarnessReviewHistoryPayload>() }
        : restoreUnresolvedInteractions(payload, histories, keptAttachmentIdentity);
    for (const [reviewIdentity, history] of restored.histories) histories.set(reviewIdentity, history);
    const moved = moveSettledInteractions(restored.index, histories, keptAttachmentIdentity);
    const changedHistories = new Map([...restored.histories, ...moved.histories]);
    return {
      payload: moved.index,
      records: [
        this.#indexWrite(index, moved.index),
        ...[...changedHistories].map(([reviewIdentity, history]) =>
          revisionedRecord(
            reviewHistoryIdentity(reviewIdentity),
            reviewIdentity,
            'harness.review-history',
            loaded.get(reviewIdentity)?.revision ?? 0,
            history,
          ),
        ),
      ],
    };
  }

  async #allReviewHistories(stateVersion: number): Promise<ReadonlyMap<ReviewIdentity, LoadedReviewHistory>> {
    const reviews = await this.#loadReviewIndexAtVersion(stateVersion);
    return await this.#loadReviewHistories(
      stateVersion,
      reviews.payload.reviews.map(review => review.reviewIdentity),
    );
  }

  async #loadReviewHistories(
    stateVersion: number,
    reviewIdentities: readonly ReviewIdentity[],
  ): Promise<ReadonlyMap<ReviewIdentity, LoadedReviewHistory>> {
    const records = await this.#readOptionalRecordsAtVersion(stateVersion, reviewIdentities.map(reviewHistoryIdentity));
    const loaded = new Map<ReviewIdentity, LoadedReviewHistory>();
    reviewIdentities.forEach((reviewIdentity, position) => {
      const record = records[position];
      if (record === undefined) return;
      if (
        record.kind !== 'harness.review-history' ||
        record.recordClass !== 'revisioned' ||
        record.schemaVersion !== 1 ||
        record.workflowIdentity !== reviewIdentity
      ) {
        throw new HarnessStateProblem();
      }
      loaded.set(reviewIdentity, {
        revision: record.revision,
        payload: parseReviewHistory(decode(record.payload), reviewIdentity),
      });
    });
    return loaded;
  }

  async #readOptionalRecordsAtVersion(
    expectedStateVersion: number,
    identities: readonly string[],
  ): Promise<readonly (StateRecord | undefined)[]> {
    if (identities.length === 0) return [];
    const read = await this.#state.read({ recordIdentities: identities, includeContent: false });
    if (read.stateVersion !== expectedStateVersion) throw new HarnessProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    return read.records;
  }

  async #readOptionalRecord(identity: string): Promise<StateRecord | undefined> {
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    return read.records[0];
  }

  async #readRecordsAtVersion(
    expectedStateVersion: number,
    identities: readonly string[],
    includeContent: boolean,
  ): Promise<readonly StateRecord[]> {
    if (identities.length === 0) return [];
    const read = await this.#state.read({
      recordIdentities: identities,
      includeContent,
    });
    if (read.stateVersion !== expectedStateVersion) {
      throw new HarnessProjectionVersionChanged();
    }
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    return read.records.map(record => {
      if (record === undefined) throw new HarnessStateProblem();
      return record;
    });
  }

  async #recallCommand(
    command: HarnessInteractionCommand,
    normalized: string,
  ): Promise<HarnessInteractionCommandResult | undefined> {
    const identity = stableIdentity('hcm', command.commandIdentity);
    const record = await this.#readOptionalRecord(identity);
    if (record === undefined) return undefined;
    if (record.kind !== 'harness.command' || record.recordClass !== 'immutable') {
      throw new HarnessStateProblem();
    }
    const payload = parseHarnessCommandRecord(decode(record.payload));
    if (payload.result.commandIdentity !== command.commandIdentity) {
      throw new HarnessStateProblem();
    }
    if (payload.normalizedCommand !== normalized) {
      const index = await this.#loadIndex();
      return rejected(command, index.stateVersion, 'command-identity-conflict');
    }
    return cloneFrozen(payload.result);
  }

  #commandRecord(
    command: HarnessInteractionCommand,
    normalized: string,
    result: HarnessInteractionCommandAccepted,
  ): StateRecordWrite {
    const payload: HarnessCommandRecordPayload = {
      formatVersion: 1,
      normalizedCommand: normalized,
      result,
    };
    const workflowIdentity =
      command.kind === 'harness.review-handoff.commit' || command.kind === 'review.question.ask'
        ? command.reviewIdentity
        : this.#indexIdentity;
    return immutableRecord(
      stableIdentity('hcm', command.commandIdentity),
      workflowIdentity,
      'harness.command',
      payload,
    );
  }

  async #mapCommandCommitFailure(
    command: HarnessInteractionCommand,
    normalized: string,
    committed: Exclude<StateCommitResult, { readonly status: 'committed' | 'duplicate' }>,
  ): Promise<HarnessInteractionCommandResult> {
    if (committed.reason === 'state-version-mismatch') {
      return rejected(command, committed.stateVersion, 'state-version-mismatch');
    }
    if (committed.reason === 'command-identity-conflict') {
      const recalled = await this.#recallCommand(command, normalized);
      return recalled ?? rejected(command, committed.stateVersion, 'command-identity-conflict');
    }
    return rejected(command, committed.stateVersion, 'state-conflict');
  }

  #decodeCommandResult(
    committed: Extract<StateCommitResult, { readonly status: 'committed' | 'duplicate' }>,
    command: HarnessInteractionCommand,
  ): HarnessInteractionCommandAccepted {
    if (committed.result.kind !== 'harness.command-result' || committed.result.schemaVersion !== 1) {
      throw new HarnessStateProblem();
    }
    const value = parseHarnessCommandAccepted(decode(committed.result.payload));
    if (value.commandIdentity !== command.commandIdentity || value.stateVersion !== committed.stateVersion) {
      throw new HarnessStateProblem();
    }
    return cloneFrozen(value);
  }

  #publish(stateVersion: number): void {
    for (const [identity, prepared] of this.#preparedReviewMessageInspections) {
      if (prepared.view.stateVersion < stateVersion) this.#preparedReviewMessageInspections.delete(identity);
    }
    this.#onCommittedStateVersion(stateVersion);
    for (const subscription of this.#subscriptions) this.#schedule(subscription);
  }

  #scheduleConnectionSubscriptions(): void {
    for (const subscription of this.#subscriptions) {
      if (subscription.scope.kind === 'harness.connection') this.#schedule(subscription);
    }
  }

  #schedule(subscription: Subscription): void {
    if (!subscription.active || subscription.scheduled) return;
    subscription.scheduled = true;
    queueMicrotask(() => {
      subscription.scheduled = false;
      if (!subscription.active) return;
      const scope = subscription.scope;
      if (scope.kind === 'harness.connection') {
        void this.#connectionView()
          .then(view => {
            const delivered = JSON.stringify(view.harnesses);
            if (!subscription.active || delivered === subscription.lastDelivered) return;
            subscription.lastDelivered = delivered;
            subscription.lastStateVersion = view.stateVersion;
            subscription.onUpdate(view);
          })
          .catch(() => undefined);
        return;
      }
      void this.#interactionView(scope.reviewIdentity, scope.offset, scope.limit)
        .then(view => {
          if (subscription.active && view.stateVersion > subscription.lastStateVersion) {
            subscription.lastStateVersion = view.stateVersion;
            subscription.onUpdate(view);
          }
        })
        .catch(() => undefined);
    });
  }
}
