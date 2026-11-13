import { randomBytes } from 'node:crypto';
import { basename } from 'node:path';

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
  ArmUserPullCommand,
  AskPiReviewQuestionCommand,
  AttachUserPullCommand,
  ClaimUserPullCommand,
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
  UserPullArmOccurrenceIdentity,
  UserPullArmed,
  UserPullAttached,
  UserPullClaimCommitted,
  UserPullClaimDuplicate,
  UserPullClaimed,
  UserPullInvocationUnresolvedReason,
  UserPullObservation,
  UserPullObservationIgnored,
  UserPullObserved,
  UserPullPreparationIdentity,
  UserPullPreparationTerminalReason,
  UserPullPreparationView,
  UserPullPrepared,
  UserPullReviewCapabilityContract,
  UserPullReviewHandoffAvailableView,
  UserPullWithdrawn,
  UserPullObservabilityRecorded,
  UserPullAttachmentView,
  UserPullAvailabilityView,
  UserPullContextBudgetView,
  WithdrawUserPullCommand,
  HarnessAttachmentDestination,
  ExactReviewHandoffDisclosure,
  ExactReviewMessageHandoffDisclosure,
  FrozenDirectReviewCapabilitySnapshot,
  FrozenUserPullReviewCapabilitySnapshot,
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
  ObserveUserPullCommand,
  PrepareUserPullCommand,
  RecordUserPullObservabilityCommand,
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
  type LiveAdapter,
  type LoadedHarnessIndex,
  type LoadedReviewIndex,
  type PreparedAskInspection,
  type PreparedInspection,
  type PreparedReviewMessageInspection,
  type PreparedReviewMessageTarget,
  type PreparedReviewResponse,
  type PreparedUserPullInspection,
  type ReviewDisclosureBasis,
  type ReviewMessageAcknowledgementPayload,
  type Subscription,
  type UserPullArmRecordPayload,
  type LoadedUserPullObservability,
  type UserPullAttachmentRecordPayload,
  type UserPullContextBudgetRecord,
  type UserPullObservabilityRecordPayload,
  type UserPullPreparationIndexEntry,
  type UserPullPreparationRecordPayload,
} from './internalTypes.js';
import {
  ATTACHMENT_PATTERN,
  BATCH_PATTERN,
  COMPATIBILITY_PATTERN,
  MAX_ANCHOR_LINE_BYTES,
  MAX_ARMED_OCCURRENCES,
  MAX_ATTACHMENTS,
  MAX_EVIDENCE_PER_INVOCATION,
  MAX_HANDOFFS,
  MAX_INTERRUPTION_INTENTS,
  MAX_INVOCATIONS,
  MAX_MESSAGE_TEMPLATE_BYTES,
  MAX_PREPARATIONS,
  MAX_PREPARED_REVIEW_MESSAGE_INSPECTIONS,
  MAX_PROJECTED_INTERACTIONS,
  MAX_REVIEW_BATCHES,
  MAX_REVIEW_MESSAGE_BYTES,
  MAX_REVIEW_QUESTIONS,
  MAX_USER_PULL_PAYLOAD_BYTES,
  REVIEW_BASIS_PATTERN,
  USER_PULL_START_OBSERVATION_WINDOW_MS,
  REVIEW_PATTERN,
} from './limits.js';
import {
  normalizeAttachment,
  isDirectReviewCapability,
  isUserPullReviewCapability,
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
  parseUserPullArmRecord,
  parseUserPullAttachmentRecord,
  parseUserPullObservabilityRecord,
  parseUserPullPreparationRecord,
  preparationRecordMatchesIndex,
} from './parsing.js';
import {
  emptyIndex,
  immutableRecord,
  replaceAttachment,
  replaceInvocation,
  replacePreparation,
  revisionedRecord,
} from './records.js';
import {
  composeReviewMessageMaterial,
  repositoryStatesMatch,
  reviewMessageCommitmentInput,
  reviewMessageInspectionIdentity,
  reviewMessageRepositoryState,
} from './reviewMessage.js';
import { renderUserPullPayload } from './userPull.js';
import { boundedText, cloneFrozen, decode, encode, exactUtf8, nthLine, sameValue, stableIdentity } from './utils.js';
import {
  projectionHandoff,
  projectionInvocation,
  projectionUserPullPreparation,
  rejected,
  unavailableInspection,
  unavailableUserPullInspection,
} from './views.js';

interface UserPullInvocationContext {
  readonly preparation: UserPullPreparationIndexEntry;
  readonly invocation: HarnessInvocationIndexEntry;
  readonly occurrence: UserPullArmRecordPayload;
}

interface UserPullEvidenceDecision {
  readonly evidence: Extract<
    NormalizedHarnessEvidence,
    {
      readonly kind:
        | 'harness.user-pull.start-observed'
        | 'harness.user-pull.terminal-observed'
        | 'harness.user-pull.correlation-lost';
    }
  >;
  readonly disposition: UserPullObserved['disposition'];
}

export interface HarnessInteractionOwnerOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly state: AuthoritativeState;
  readonly evidence: WorkspaceEvidence;
  readonly onCommittedStateVersion: (stateVersion: number) => void;
  /** Deterministic internal fault seam; never crosses the Workspace Interface. */
  readonly afterCommitBeforeDirective?: () => void | Promise<void>;
  /** Private deterministic clock seam for semantic User Pull deadlines. */
  readonly now?: () => Date;
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
  readonly #now: () => Date;
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
    this.#now = options.now ?? (() => new Date());
    const runtimeGeneration = options.runtimeGeneration ?? randomBytes(16).toString('hex');
    if (!boundedText(runtimeGeneration)) throw new TypeError('Invalid Harness runtime generation');
    this.#runtimeGeneration = runtimeGeneration;
    this.adapterHost = Object.freeze({
      establish: async (adapter: ReviewedHarnessAdapter) => await this.#establishAdapter(adapter),
    });
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
        case 'harness.user-pull.attach':
          return await this.#attachUserPull(command, normalized, index);
        case 'harness.user-pull.prepare':
          return await this.#prepareUserPull(command, normalized, index);
        case 'harness.user-pull.arm':
          return await this.#armUserPull(command, normalized, index);
        case 'harness.user-pull.claim':
          return await this.#claimUserPull(command, normalized, index);
        case 'harness.user-pull.withdraw':
          return await this.#withdrawUserPull(command, normalized, index);
        case 'harness.user-pull.observe':
          return await this.#observeUserPull(command, index);
        case 'harness.user-pull.observability.record':
          return await this.#recordUserPullObservability(command, index);
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
    if (request.kind === 'harness.user-pull.review-handoff.inspect') {
      if (
        typeof request.reviewIdentity !== 'string' ||
        !REVIEW_PATTERN.test(request.reviewIdentity) ||
        typeof request.reviewBatchIdentity !== 'string' ||
        !BATCH_PATTERN.test(request.reviewBatchIdentity) ||
        typeof request.attachmentIdentity !== 'string' ||
        !ATTACHMENT_PATTERN.test(request.attachmentIdentity)
      ) {
        throw new TypeError('Invalid User Pull Review Handoff inspection');
      }
      const prepared = await this.#prepareUserPullInspection(
        request.reviewIdentity,
        request.reviewBatchIdentity,
        request.attachmentIdentity,
      );
      return prepared.view as HarnessInteractionViewFor<Request>;
    }
    if (request.kind === 'harness.user-pull.preparation') {
      if (typeof request.attachmentIdentity !== 'string' || !ATTACHMENT_PATTERN.test(request.attachmentIdentity)) {
        throw new TypeError('Invalid User Pull Preparation view request');
      }
      return (await this.#userPullPreparationView(request.attachmentIdentity)) as HarnessInteractionViewFor<Request>;
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
      this.#releaseOtherSessions(attachment.attachmentIdentity);
      this.#liveAdapters.set(attachment.attachmentIdentity, {
        manifest,
        manifestSha256,
        attachment,
        compatibilityIdentity,
        connection,
      });
      // Reconnecting commits nothing, but the agent is back.
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
    if (priorAttachment === undefined && index.payload.attachments.length >= MAX_ATTACHMENTS) {
      return { status: 'refused', reason: 'state-conflict' };
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
          this.#indexWrite(index, replaceAttachment(index.payload, nextAttachment)),
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
      return {
        status: 'refused',
        evidenceIdentity: evidence.evidenceIdentity,
        reason: 'attachment-not-found',
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
        return this.#evidenceRefused(evidence, 'invocation-not-found');
      }
      if (invocation.attachmentIdentity !== evidence.attachmentIdentity) {
        return this.#evidenceRefused(evidence, 'attachment-identity-mismatch');
      }
      if (
        (evidence.kind === 'harness.user-pull.start-observed' ||
          evidence.kind === 'harness.user-pull.terminal-observed' ||
          evidence.kind === 'harness.user-pull.correlation-lost') &&
        !(await this.#userPullEvidenceMatchesClaim(index, invocation, evidence))
      ) {
        return this.#evidenceRefused(evidence, 'invalid-evidence');
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
          this.#indexWrite(index, nextIndex),
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

  async #userPullEvidenceMatchesClaim(
    index: LoadedHarnessIndex,
    invocation: HarnessInvocationIndexEntry,
    evidence: Extract<NormalizedHarnessEvidence, { readonly kind: `harness.user-pull.${string}` }>,
  ): Promise<boolean> {
    const preparation = index.payload.preparations.find(
      candidate =>
        candidate.status === 'claimed' &&
        candidate.invocationIdentity === invocation.invocationIdentity &&
        candidate.claimedOccurrenceIdentity === evidence.occurrenceIdentity,
    );
    if (
      preparation === undefined ||
      preparation.preparationIdentity !== evidence.preparationIdentity ||
      preparation.attachmentIdentity !== evidence.attachmentIdentity ||
      preparation.handoffIdentity !== invocation.handoffIdentity
    ) {
      return false;
    }
    const [record] = await this.#readRecordsAtVersion(index.stateVersion, [evidence.occurrenceIdentity], false);
    if (record?.kind !== 'harness.user-pull-arm' || record.recordClass !== 'immutable') return false;
    const occurrence = parseUserPullArmRecord(decode(record.payload));
    return (
      occurrence.occurrenceIdentity === evidence.occurrenceIdentity &&
      occurrence.preparationIdentity === evidence.preparationIdentity &&
      occurrence.attachmentIdentity === evidence.attachmentIdentity &&
      occurrence.sessionId === evidence.sessionId &&
      occurrence.promptId === evidence.promptId &&
      occurrence.canonicalGitRoot === evidence.canonicalGitRoot &&
      occurrence.canonicalGitDir === evidence.canonicalGitDir &&
      occurrence.bridgeProtocolVersion === evidence.bridgeProtocolVersion
    );
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
    if (evidence.kind === 'harness.invocation.start-observed' || evidence.kind === 'harness.user-pull.start-observed') {
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
    if (
      evidence.kind === 'harness.invocation.correlation-lost' ||
      evidence.kind === 'harness.user-pull.correlation-lost'
    ) {
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
    if (evidence.kind === 'harness.user-pull.terminal-observed') {
      return {
        ...invocation,
        status: evidence.outcome,
        evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
        ...(evidence.outcome === 'failed' ? { terminalReason: 'harness-failed' } : {}),
      };
    }
    return {
      ...invocation,
      status: evidence.outcome,
      evidenceIdentities: [...invocation.evidenceIdentities, evidence.evidenceIdentity],
      ...(evidence.reason === undefined ? {} : { terminalReason: evidence.reason }),
    };
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
    if (
      entry.batchIdentities.length >= MAX_REVIEW_BATCHES ||
      index.payload.handoffs.length >= MAX_HANDOFFS ||
      index.payload.invocations.length >= MAX_INVOCATIONS
    ) {
      return unavailable(stateVersion, 'state-conflict');
    }
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
    if (
      entry.batchIdentities.length >= MAX_REVIEW_BATCHES ||
      entry.questionIdentities.length >= MAX_REVIEW_QUESTIONS ||
      index.payload.handoffs.length >= MAX_HANDOFFS ||
      index.payload.invocations.length >= MAX_INVOCATIONS
    ) {
      return unavailable(stateVersion, 'state-conflict');
    }
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
      this.#indexWrite(index, nextHarnessIndex),
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
      this.#indexWrite(index, nextHarnessIndex),
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

  async #prepareUserPullInspection(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedUserPullInspection> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#prepareUserPullInspectionOnce(reviewIdentity, reviewBatchIdentity, attachmentIdentity);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) throw error;
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #prepareUserPullInspectionOnce(
    reviewIdentity: ReviewIdentity,
    reviewBatchIdentity: ReviewBatchIdentity,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<PreparedUserPullInspection> {
    const index = await this.#expireUserPullStartObservations(await this.#loadIndex(), attachmentIdentity);
    const stateVersion = index.stateVersion;
    for (const candidate of index.payload.preparations) {
      if (candidate.attachmentIdentity !== attachmentIdentity || candidate.status !== 'prepared') continue;
      const expiry = await this.#semanticUserPullExpiry(index, candidate);
      if (expiry !== undefined) {
        await this.#expireUserPullPreparation(index, candidate, expiry);
        throw new HarnessProjectionVersionChanged();
      }
    }
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'attachment-not-found',
      );
    }
    const attachmentRecord = await this.#loadUserPullAttachmentAtVersion(stateVersion, attachment);
    if (attachmentRecord === undefined) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'attachment-not-live',
      );
    }
    const capability = attachmentRecord.manifest.capabilities.find(
      (item): item is UserPullReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'user-pull',
    );
    if (capability === undefined) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'capability-unsupported',
      );
    }
    if (attachment.availability.status === 'blocked') {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'availability-blocked',
      );
    }
    if (attachment.availability.status === 'unknown') {
      return unavailableUserPullInspection(
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
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'active-invocation-exists',
        active.map(item => item.invocationIdentity),
      );
    }
    const open = index.payload.preparations.filter(
      item => item.attachmentIdentity === attachmentIdentity && item.status === 'prepared',
    );
    if (open.length > 0) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'preparation-already-open',
        open.map(item => item.preparationIdentity),
      );
    }
    const priorHandoff = index.payload.handoffs.find(item => {
      if (item.reviewBatchIdentity !== reviewBatchIdentity) return false;
      const preparation = index.payload.preparations.find(
        candidate => candidate.handoffIdentity === item.handoffIdentity,
      );
      return preparation === undefined || preparation.status === 'prepared' || preparation.status === 'claimed';
    });
    if (priorHandoff !== undefined) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'batch-already-handed-off',
        [priorHandoff.handoffIdentity],
      );
    }
    if (index.payload.handoffs.length >= MAX_HANDOFFS || index.payload.preparations.length >= MAX_PREPARATIONS) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'state-conflict',
      );
    }

    const basis = await this.#loadReviewDisclosure(stateVersion, reviewIdentity, reviewBatchIdentity);
    if (typeof basis === 'string') {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        basis,
      );
    }
    const rendered = renderUserPullPayload(basis.disclosure, capability);
    if (rendered.byteLength > MAX_USER_PULL_PAYLOAD_BYTES) {
      return unavailableUserPullInspection(
        stateVersion,
        reviewIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        'user-pull-payload-too-large',
      );
    }
    const final = await this.#state.read({ recordIdentities: [], includeContent: false });
    if (final.stateVersion !== stateVersion) throw new HarnessProjectionVersionChanged();

    const inspectionIdentity = sha256(
      JSON.stringify({
        contractVersion: 1,
        route: 'user-pull',
        stateVersion,
        reviewIdentity,
        reviewSnapshotIdentity: basis.snapshot.reviewSnapshotIdentity,
        reviewBatchIdentity,
        attachmentIdentity,
        compatibilityIdentity: attachment.compatibilityIdentity,
        capabilityIdentity: capability.capabilityIdentity,
        manifestSha256: attachmentRecord.manifestSha256,
        disclosureSha256: basis.disclosure.sha256,
        payloadSha256: rendered.sha256,
      }),
    );
    const view: UserPullReviewHandoffAvailableView = cloneFrozen({
      kind: 'harness.user-pull.review-handoff.inspection',
      status: 'available',
      stateVersion,
      inspectionIdentity,
      reviewIdentity,
      reviewSnapshotIdentity: basis.snapshot.reviewSnapshotIdentity,
      reviewBatchIdentity,
      destination: { attachmentIdentity, ...attachment.destination },
      capability: {
        route: 'user-pull',
        authority: capability.authority,
        effectConstraint: capability.effectConstraint,
        evidenceProfile: capability.evidenceProfile,
        ...(capability.artifactResultContract === undefined
          ? {}
          : { artifactResultContract: capability.artifactResultContract }),
        knownLimitations: capability.knownLimitations,
      },
      disclosure: {
        fileCount: basis.disclosure.manifest.totalFiles,
        questionCount: basis.disclosure.questions.length,
        byteLength: basis.disclosure.byteLength,
        sha256: basis.disclosure.sha256,
      },
    });
    return { view, basis, attachment, attachmentRecord, capability };
  }

  async #attachUserPull(
    command: AttachUserPullCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const capability = command.manifest.capabilities.find(
      (item): item is UserPullReviewCapabilityContract =>
        item.handoffKind === 'submit-review-batch' && item.route === 'user-pull',
    );
    if (capability === undefined) return rejected(command, index.stateVersion, 'capability-unsupported');
    if (!command.manifest.reviewedHostVersions.includes(command.hostVersion)) {
      return rejected(command, index.stateVersion, 'unsupported-host-version');
    }

    const attachmentIdentity = stableIdentity(
      'att',
      'claude-code',
      command.sessionId,
      command.canonicalGitRoot,
      command.canonicalGitDir,
    ) as HarnessAttachmentIdentity;
    // Durable producer: the normalized Manifest's key order is part of stored
    // State, exactly as for the Pi attachment compatibility record.
    const manifestSha256 = sha256(JSON.stringify(command.manifest));
    const compatibilityIdentity = stableIdentity(
      'hcp',
      attachmentIdentity,
      command.hostVersion,
      manifestSha256,
    ) as HarnessCompatibilityIdentity;
    const destination: HarnessAttachmentDestination = cloneFrozen({
      harnessLabel: command.manifest.adapterDisplayName,
      sessionLabel: command.sessionId,
      repositoryLabel: basename(command.canonicalGitRoot),
      canonicalCheckout: command.canonicalGitRoot,
    });
    const priorAttachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (priorAttachment !== undefined && !sameValue(priorAttachment.destination, destination)) {
      return rejected(command, index.stateVersion, 'attachment-identity-conflict');
    }
    if (priorAttachment === undefined && index.payload.attachments.length >= MAX_ATTACHMENTS) {
      return rejected(command, index.stateVersion, 'state-conflict');
    }

    const nextAttachment: HarnessAttachmentIndexEntry = {
      attachmentIdentity,
      compatibilityIdentity,
      establishmentEvidenceIdentity: compatibilityIdentity,
      destination,
      availability: { status: 'available' },
    };
    const priorObservability = await this.#loadUserPullObservability(index.stateVersion, attachmentIdentity);
    const preserveObservability = priorObservability?.payload.compatibilityIdentity === compatibilityIdentity;
    const nextObservability: UserPullObservabilityRecordPayload = {
      formatVersion: 1,
      attachmentIdentity,
      compatibilityIdentity,
      availability: {
        state: 'revalidated',
        reason: 'exact-identity-and-contract',
        runtimeGeneration: this.#runtimeGeneration,
        evidenceIdentity: stableIdentity(
          'uav',
          attachmentIdentity,
          compatibilityIdentity,
          this.#runtimeGeneration,
          'revalidated',
        ),
      },
      ...(preserveObservability && priorObservability?.payload.contextBudget !== undefined
        ? { contextBudget: priorObservability.payload.contextBudget }
        : {}),
      ...(preserveObservability && priorObservability?.payload.compaction !== undefined
        ? { compaction: priorObservability.payload.compaction }
        : {}),
    };
    const priorRecord = await this.#readOptionalRecord(compatibilityIdentity);
    if (priorRecord !== undefined) {
      if (priorRecord.kind !== 'harness.user-pull-attachment' || priorRecord.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const prior = parseUserPullAttachmentRecord(decode(priorRecord.payload));
      if (
        prior.attachmentIdentity !== attachmentIdentity ||
        prior.harnessKind !== 'claude-code' ||
        prior.sessionId !== command.sessionId ||
        prior.canonicalGitRoot !== command.canonicalGitRoot ||
        prior.canonicalGitDir !== command.canonicalGitDir ||
        prior.hostVersion !== command.hostVersion ||
        prior.manifestSha256 !== manifestSha256 ||
        !sameValue(prior.destination, destination) ||
        !sameValue(prior.manifest, command.manifest)
      ) {
        throw new HarnessStateProblem();
      }
      if (
        priorAttachment !== undefined &&
        sameValue(priorAttachment, nextAttachment) &&
        priorObservability !== undefined &&
        sameValue(priorObservability.payload, nextObservability)
      ) {
        return cloneFrozen({
          kind: 'harness.user-pull.attached',
          status: 'accepted',
          commandIdentity: command.commandIdentity,
          stateVersion: prior.establishedStateVersion,
          attachmentIdentity,
          compatibilityIdentity,
          destination,
        } satisfies UserPullAttached);
      }
    }

    const nextStateVersion = index.stateVersion + 1;
    const result: UserPullAttached = cloneFrozen({
      kind: 'harness.user-pull.attached',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      attachmentIdentity,
      compatibilityIdentity,
      destination,
    });
    const record: UserPullAttachmentRecordPayload = {
      formatVersion: 1,
      attachmentIdentity,
      compatibilityIdentity,
      harnessKind: 'claude-code',
      sessionId: command.sessionId,
      canonicalGitRoot: command.canonicalGitRoot,
      canonicalGitDir: command.canonicalGitDir,
      hostVersion: command.hostVersion,
      manifestSha256,
      destination,
      manifest: command.manifest,
      establishedStateVersion: nextStateVersion,
    };
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        ...(priorRecord === undefined
          ? [immutableRecord(compatibilityIdentity, this.#indexIdentity, 'harness.user-pull-attachment', record)]
          : []),
        revisionedRecord(
          this.#userPullObservabilityIdentity(attachmentIdentity),
          this.#indexIdentity,
          'harness.user-pull-observability',
          priorObservability?.revision ?? 0,
          nextObservability,
        ),
        this.#indexWrite(index, replaceAttachment(index.payload, nextAttachment)),
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
    return decoded;
  }

  async #prepareUserPull(
    command: PrepareUserPullCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const prepared = await this.#prepareUserPullInspection(
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
      prepared.attachmentRecord === undefined ||
      prepared.capability === undefined
    ) {
      return rejected(command, index.stateVersion, 'inspection-changed');
    }
    if (command.disclosedDeadline !== undefined && Date.parse(command.disclosedDeadline) <= this.#now().valueOf()) {
      return rejected(command, index.stateVersion, 'route-deadline-passed');
    }

    const handoffIdentity = stableIdentity(
      'hho',
      command.commandIdentity,
      'user-pull-handoff',
    ) as HarnessHandoffIdentity;
    const receiptIdentity = stableIdentity(
      'hcr',
      command.commandIdentity,
      'user-pull-commitment-receipt',
    ) as HarnessCommitmentReceiptIdentity;
    const capabilitySnapshotIdentity = stableIdentity(
      'hcs',
      command.commandIdentity,
      'user-pull-capability-snapshot',
    ) as HarnessCapabilitySnapshotIdentity;
    const preparationIdentity = stableIdentity(
      'hpp',
      command.commandIdentity,
      'user-pull-preparation',
    ) as UserPullPreparationIdentity;
    const claimHandle = randomBytes(32).toString('hex');
    const nextStateVersion = index.stateVersion + 1;
    const result: UserPullPrepared = cloneFrozen({
      kind: 'harness.user-pull.prepared',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity: command.reviewBatchIdentity,
      attachmentIdentity: command.attachmentIdentity,
      handoffIdentity,
      commitmentReceiptIdentity: receiptIdentity,
      capabilitySnapshotIdentity,
      preparationIdentity,
      ...(command.disclosedDeadline === undefined ? {} : { disclosedDeadline: command.disclosedDeadline }),
    });
    const capabilitySnapshot: FrozenUserPullReviewCapabilitySnapshot = cloneFrozen({
      snapshotIdentity: capabilitySnapshotIdentity,
      compatibilityIdentity: prepared.attachmentRecord.compatibilityIdentity,
      manifestSha256: prepared.attachmentRecord.manifestSha256,
      capability: prepared.capability,
      availabilityAtCommit: 'available',
    });
    const rendered = renderUserPullPayload(prepared.basis.disclosure, prepared.capability);
    if (rendered.byteLength > MAX_USER_PULL_PAYLOAD_BYTES) {
      return rejected(command, index.stateVersion, 'user-pull-payload-too-large');
    }
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
      disclosure: disclosureSummary,
    };
    const preparationEntry: UserPullPreparationIndexEntry = {
      preparationIdentity,
      handoffIdentity,
      reviewIdentity: command.reviewIdentity,
      reviewBatchIdentity: command.reviewBatchIdentity,
      attachmentIdentity: command.attachmentIdentity,
      status: 'prepared',
      payloadSha256: rendered.sha256,
      armedOccurrenceIdentities: [],
      ...(command.disclosedDeadline === undefined ? {} : { disclosedDeadline: command.disclosedDeadline }),
    };
    const preparationRecord: UserPullPreparationRecordPayload = {
      formatVersion: 1,
      ...preparationEntry,
      claimHandle,
      capabilitySnapshotIdentity,
    };
    const nextIndex: HarnessIndexPayload = {
      ...index.payload,
      handoffs: [...index.payload.handoffs, handoffEntry],
      preparations: [...index.payload.preparations, preparationEntry],
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
          route: 'user-pull',
          authority: prepared.capability.authority,
          workspaceIdentity: this.#workspaceIdentity,
          reviewIdentity: command.reviewIdentity,
          reviewSnapshotIdentity: prepared.basis.snapshot.reviewSnapshotIdentity,
          changeSetIdentity: prepared.basis.snapshot.changeSetIdentity,
          reviewBatchIdentity: command.reviewBatchIdentity,
          attachmentIdentity: command.attachmentIdentity,
          capabilitySnapshotIdentity,
          preparationIdentity,
          disclosure: disclosureSummary,
          payloadSha256: rendered.sha256,
          payloadByteLength: rendered.byteLength,
        },
        [
          { role: 'accepted-disclosure', bytes: encode(prepared.basis.disclosure) },
          { role: 'user-pull-payload', bytes: rendered.bytes },
        ],
      ),
      immutableRecord(receiptIdentity, command.reviewIdentity, 'harness.commitment-receipt', {
        formatVersion: 1,
        commitmentReceiptIdentity: receiptIdentity,
        handoffIdentity,
        commandIdentity: command.commandIdentity,
        consent: 'prepare-user-pull',
        destination: prepared.attachment.destination,
        scope: {
          handoffKind: 'submit-review-batch',
          route: 'user-pull',
          authority: prepared.capability.authority,
          reviewBatchIdentity: command.reviewBatchIdentity,
          disclosureSha256: prepared.basis.disclosure.sha256,
          payloadSha256: rendered.sha256,
          payloadByteLength: rendered.byteLength,
        },
        capabilitySnapshotIdentity,
        preparationIdentity,
        ...(command.disclosedDeadline === undefined ? {} : { disclosedDeadline: command.disclosedDeadline }),
        committedStateVersion: nextStateVersion,
      }),
      immutableRecord(capabilitySnapshotIdentity, command.reviewIdentity, 'harness.capability-snapshot', {
        formatVersion: 1,
        ...capabilitySnapshot,
      }),
      revisionedRecord(
        preparationIdentity,
        command.reviewIdentity,
        'harness.user-pull-preparation',
        0,
        preparationRecord,
      ),
      this.#indexWrite(index, nextIndex),
      this.#commandRecord(command, normalized, result),
    ];
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records,
      result: { kind: 'harness.command-result', schemaVersion: 1, payload: encode(result) },
    });
    if (!('result' in committed)) return await this.#mapCommandCommitFailure(command, normalized, committed);
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    return decoded;
  }

  async #armUserPull(
    command: ArmUserPullCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    if (command.bridgeProtocolVersion !== 1) {
      return rejected(command, index.stateVersion, 'bridge-protocol-mismatch');
    }
    if (command.canonicalGitRoot !== this.#canonicalCheckout) {
      return rejected(command, index.stateVersion, 'checkout-mismatch');
    }
    const attachmentIdentity = stableIdentity(
      'att',
      'claude-code',
      command.sessionId,
      command.canonicalGitRoot,
      command.canonicalGitDir,
    ) as HarnessAttachmentIdentity;
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) return rejected(command, index.stateVersion, 'attachment-not-found');
    const open = index.payload.preparations.filter(
      item => item.attachmentIdentity === attachmentIdentity && item.status === 'prepared',
    );
    if (open.length === 0) return rejected(command, index.stateVersion, 'preparation-not-found');
    if (open.length !== 1) throw new HarnessStateProblem();
    const preparation = open[0];
    if (preparation === undefined) throw new HarnessStateProblem();
    const expiry = await this.#semanticUserPullExpiry(index, preparation);
    if (expiry !== undefined) {
      const expiredStateVersion = await this.#expireUserPullPreparation(index, preparation, expiry);
      return rejected(command, expiredStateVersion, expiry);
    }
    const attachmentRecord = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
    if (
      attachmentRecord === undefined ||
      attachmentRecord.sessionId !== command.sessionId ||
      attachmentRecord.canonicalGitRoot !== command.canonicalGitRoot ||
      attachmentRecord.canonicalGitDir !== command.canonicalGitDir
    ) {
      return rejected(command, index.stateVersion, 'attachment-not-live');
    }
    if (attachment.availability.status === 'blocked') {
      return rejected(command, index.stateVersion, 'availability-blocked');
    }
    if (attachment.availability.status === 'unknown') {
      return rejected(command, index.stateVersion, 'availability-unknown');
    }
    const occurrenceIdentity = stableIdentity(
      'hpa',
      attachmentIdentity,
      command.promptId,
    ) as UserPullArmOccurrenceIdentity;
    const priorOccurrence = await this.#readOptionalRecord(occurrenceIdentity);
    if (preparation.armedOccurrenceIdentities.includes(occurrenceIdentity)) {
      if (priorOccurrence?.kind !== 'harness.user-pull-arm' || priorOccurrence.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const armed = parseUserPullArmRecord(decode(priorOccurrence.payload));
      if (
        armed.preparationIdentity !== preparation.preparationIdentity ||
        armed.attachmentIdentity !== attachmentIdentity ||
        armed.sessionId !== command.sessionId ||
        armed.promptId !== command.promptId ||
        armed.canonicalGitRoot !== command.canonicalGitRoot ||
        armed.canonicalGitDir !== command.canonicalGitDir
      ) {
        return rejected(command, index.stateVersion, 'occurrence-identity-conflict');
      }
      return cloneFrozen({
        kind: 'harness.user-pull.armed',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: armed.armedStateVersion,
        attachmentIdentity,
        preparationIdentity: preparation.preparationIdentity,
        occurrenceIdentity,
      } satisfies UserPullArmed);
    }
    if (priorOccurrence !== undefined) {
      return rejected(command, index.stateVersion, 'occurrence-identity-conflict');
    }
    if (preparation.armedOccurrenceIdentities.length >= MAX_ARMED_OCCURRENCES) {
      return rejected(command, index.stateVersion, 'armed-occurrence-limit-reached');
    }
    const loaded = await this.#loadUserPullPreparationAtVersion(index.stateVersion, preparation, index.payload);
    const nextStateVersion = index.stateVersion + 1;
    const nextPreparation: UserPullPreparationIndexEntry = {
      ...preparation,
      armedOccurrenceIdentities: [...preparation.armedOccurrenceIdentities, occurrenceIdentity],
    };
    const nextRecord: UserPullPreparationRecordPayload = {
      ...loaded.payload,
      armedOccurrenceIdentities: nextPreparation.armedOccurrenceIdentities,
    };
    const result: UserPullArmed = cloneFrozen({
      kind: 'harness.user-pull.armed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      attachmentIdentity,
      preparationIdentity: preparation.preparationIdentity,
      occurrenceIdentity,
    });
    const armRecord: UserPullArmRecordPayload = {
      formatVersion: 1,
      occurrenceIdentity,
      preparationIdentity: preparation.preparationIdentity,
      attachmentIdentity,
      sessionId: command.sessionId,
      promptId: command.promptId,
      canonicalGitRoot: command.canonicalGitRoot,
      canonicalGitDir: command.canonicalGitDir,
      bridgeProtocolVersion: 1,
      armedStateVersion: nextStateVersion,
    };
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        immutableRecord(occurrenceIdentity, preparation.reviewIdentity, 'harness.user-pull-arm', armRecord),
        revisionedRecord(
          preparation.preparationIdentity,
          preparation.reviewIdentity,
          'harness.user-pull-preparation',
          loaded.revision,
          nextRecord,
        ),
        this.#indexWrite(index, replacePreparation(index.payload, nextPreparation)),
        this.#commandRecord(command, normalized, result),
      ],
      result: { kind: 'harness.command-result', schemaVersion: 1, payload: encode(result) },
    });
    if (!('result' in committed)) return await this.#mapCommandCommitFailure(command, normalized, committed);
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    return decoded;
  }

  async #claimUserPull(
    command: ClaimUserPullCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    if (command.bridgeProtocolVersion !== 1) {
      return rejected(command, index.stateVersion, 'bridge-protocol-mismatch');
    }
    if (command.canonicalGitRoot !== this.#canonicalCheckout) {
      return rejected(command, index.stateVersion, 'checkout-mismatch');
    }
    const checkoutAttachments = index.payload.attachments.filter(
      attachment => attachment.destination.canonicalCheckout === command.canonicalGitRoot,
    );
    if (checkoutAttachments.length === 0) {
      return rejected(command, index.stateVersion, 'attachment-not-found');
    }
    const checkoutAttachmentIdentities = new Set(checkoutAttachments.map(item => item.attachmentIdentity));
    const checkoutOpen = index.payload.preparations.filter(
      item => checkoutAttachmentIdentities.has(item.attachmentIdentity) && item.status === 'prepared',
    );
    for (const preparation of checkoutOpen) {
      const expiry = await this.#semanticUserPullExpiry(index, preparation);
      if (expiry !== undefined) {
        const expiredStateVersion = await this.#expireUserPullPreparation(index, preparation, expiry);
        return rejected(command, expiredStateVersion, expiry);
      }
    }
    const matchingAttachments: HarnessAttachmentIndexEntry[] = [];
    for (const attachment of checkoutAttachments) {
      const record = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
      if (record?.canonicalGitDir === command.canonicalGitDir) matchingAttachments.push(attachment);
    }
    if (matchingAttachments.length === 0) return rejected(command, index.stateVersion, 'checkout-mismatch');
    const attachmentIdentities = new Set(matchingAttachments.map(item => item.attachmentIdentity));
    const open = checkoutOpen.filter(item => attachmentIdentities.has(item.attachmentIdentity));
    if (open.length === 0) {
      const duplicate = this.#duplicateUserPullClaim(command, index, attachmentIdentities);
      return duplicate ?? rejected(command, index.stateVersion, 'preparation-not-found');
    }
    const armed = open.flatMap(preparation =>
      preparation.armedOccurrenceIdentities.map(occurrenceIdentity => ({ preparation, occurrenceIdentity })),
    );
    if (armed.length === 0) return rejected(command, index.stateVersion, 'no-armed-occurrence');
    if (armed.length !== 1) return rejected(command, index.stateVersion, 'ambiguous-armed-occurrence');
    const selected = armed[0];
    if (selected === undefined) throw new HarnessStateProblem();
    const { preparation, occurrenceIdentity } = selected;
    const attachment = matchingAttachments.find(item => item.attachmentIdentity === preparation.attachmentIdentity);
    if (attachment === undefined) return rejected(command, index.stateVersion, 'checkout-mismatch');
    if (attachment.availability.status === 'blocked') {
      return rejected(command, index.stateVersion, 'availability-blocked');
    }
    if (attachment.availability.status === 'unknown') {
      return rejected(command, index.stateVersion, 'availability-unknown');
    }
    const active = index.payload.invocations.filter(
      item =>
        item.attachmentIdentity === attachment.attachmentIdentity &&
        (item.status === 'awaiting-start' || item.status === 'active'),
    );
    if (active.length > 0) {
      return rejected(
        command,
        index.stateVersion,
        'active-invocation-exists',
        active.map(item => item.invocationIdentity),
      );
    }
    if (index.payload.invocations.length >= MAX_INVOCATIONS) {
      return rejected(command, index.stateVersion, 'state-conflict');
    }

    const loaded = await this.#loadUserPullPreparationAtVersion(index.stateVersion, preparation, index.payload);
    const handoff = index.payload.handoffs.find(item => item.handoffIdentity === preparation.handoffIdentity);
    if (handoff === undefined || handoff.invocationIdentity !== undefined) throw new HarnessStateProblem();
    const [snapshotRecord, armRecord, handoffRecord] = await this.#readRecordsAtVersion(
      index.stateVersion,
      [handoff.capabilitySnapshotIdentity, occurrenceIdentity, handoff.handoffIdentity],
      true,
    );
    if (
      snapshotRecord?.kind !== 'harness.capability-snapshot' ||
      snapshotRecord.recordClass !== 'immutable' ||
      armRecord?.kind !== 'harness.user-pull-arm' ||
      armRecord.recordClass !== 'immutable' ||
      handoffRecord?.kind !== 'harness.workflow-handoff' ||
      handoffRecord.recordClass !== 'immutable'
    ) {
      throw new HarnessStateProblem();
    }
    const snapshot = this.#parseFrozenUserPullSnapshot(decode(snapshotRecord.payload), handoff);
    if (loaded.payload.capabilitySnapshotIdentity !== snapshot.snapshotIdentity) throw new HarnessStateProblem();
    const currentAttachment = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
    const currentCapability = currentAttachment?.manifest.capabilities.find(
      item => item.capabilityIdentity === snapshot.capability.capabilityIdentity,
    );
    if (
      currentAttachment === undefined ||
      currentAttachment.attachmentIdentity !== preparation.attachmentIdentity ||
      currentCapability === undefined ||
      !isUserPullReviewCapability(currentCapability) ||
      !sameValue(currentCapability, snapshot.capability)
    ) {
      const expiredStateVersion = await this.#expireUserPullPreparation(index, preparation, 'capability-incompatible');
      return rejected(command, expiredStateVersion, 'capability-incompatible');
    }
    const occurrence = parseUserPullArmRecord(decode(armRecord.payload));
    if (
      occurrence.occurrenceIdentity !== occurrenceIdentity ||
      occurrence.preparationIdentity !== preparation.preparationIdentity ||
      occurrence.attachmentIdentity !== preparation.attachmentIdentity ||
      occurrence.canonicalGitRoot !== command.canonicalGitRoot ||
      occurrence.canonicalGitDir !== command.canonicalGitDir
    ) {
      return rejected(command, index.stateVersion, 'occurrence-identity-conflict');
    }
    const payloadContent = handoffRecord.content.find(item => item.role === 'user-pull-payload');
    const payload = payloadContent?.bytes === undefined ? undefined : exactUtf8(payloadContent.bytes);
    if (
      payloadContent?.bytes === undefined ||
      payload === undefined ||
      payloadContent.bytes.byteLength === 0 ||
      payloadContent.bytes.byteLength > MAX_USER_PULL_PAYLOAD_BYTES ||
      payloadContent.digest !== preparation.payloadSha256 ||
      sha256(payloadContent.bytes) !== preparation.payloadSha256
    ) {
      throw new HarnessStateProblem();
    }

    const invocationIdentity = stableIdentity(
      'hin',
      preparation.preparationIdentity,
      occurrenceIdentity,
      'user-pull-invocation',
    ) as HarnessInvocationIdentity;
    const now = this.#now().valueOf();
    if (!Number.isFinite(now)) throw new HarnessStateProblem();
    const startObservationDeadline = new Date(now + USER_PULL_START_OBSERVATION_WINDOW_MS).toISOString();
    const nextStateVersion = index.stateVersion + 1;
    const nextPreparation: UserPullPreparationIndexEntry = {
      ...preparation,
      status: 'claimed',
      claimedOccurrenceIdentity: occurrenceIdentity,
      invocationIdentity,
    };
    const nextPreparationRecord: UserPullPreparationRecordPayload = {
      ...loaded.payload,
      status: 'claimed',
      claimedOccurrenceIdentity: occurrenceIdentity,
      invocationIdentity,
    };
    const nextHandoff: HarnessHandoffIndexEntry = { ...handoff, invocationIdentity };
    const invocation: HarnessInvocationIndexEntry = {
      invocationIdentity,
      handoffIdentity: handoff.handoffIdentity,
      reviewIdentity: handoff.reviewIdentity,
      attachmentIdentity: handoff.attachmentIdentity,
      status: 'awaiting-start',
      evidenceIdentities: [],
      interruptionIntentIdentities: [],
      startObservationDeadline,
    };
    const committedResult: UserPullClaimCommitted = cloneFrozen({
      kind: 'harness.user-pull.claim-committed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: preparation.reviewIdentity,
      reviewBatchIdentity: preparation.reviewBatchIdentity,
      attachmentIdentity: preparation.attachmentIdentity,
      handoffIdentity: preparation.handoffIdentity,
      preparationIdentity: preparation.preparationIdentity,
      occurrenceIdentity,
      invocationIdentity,
      payloadSha256: preparation.payloadSha256,
      payloadByteLength: payloadContent.bytes.byteLength,
    });
    const nextIndex: HarnessIndexPayload = {
      ...replacePreparation(index.payload, nextPreparation),
      handoffs: index.payload.handoffs.map(item =>
        item.handoffIdentity === nextHandoff.handoffIdentity ? nextHandoff : item,
      ),
      invocations: [...index.payload.invocations, invocation],
    };
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        revisionedRecord(
          preparation.preparationIdentity,
          preparation.reviewIdentity,
          'harness.user-pull-preparation',
          loaded.revision,
          nextPreparationRecord,
        ),
        immutableRecord(invocationIdentity, preparation.reviewIdentity, 'harness.user-pull-invocation', {
          formatVersion: 1,
          invocationIdentity,
          handoffIdentity: handoff.handoffIdentity,
          attachmentIdentity: handoff.attachmentIdentity,
          occurrenceIdentity,
          initialStatus: 'awaiting-start',
          startObservationDeadline,
          automaticReplay: 'prohibited',
        }),
        this.#indexWrite(index, nextIndex),
        this.#commandRecord(command, normalized, committedResult),
      ],
      result: { kind: 'harness.command-result', schemaVersion: 1, payload: encode(committedResult) },
    });
    if (!('result' in committed)) return await this.#mapCommandCommitFailure(command, normalized, committed);
    const decoded = this.#decodeCommandResult(committed, command);
    if (decoded.kind !== 'harness.user-pull.claim-committed') throw new HarnessStateProblem();
    this.#publish(committed.stateVersion);
    if (committed.status === 'duplicate') {
      return this.#claimDuplicateFromCommitted(command, decoded);
    }
    await this.#afterCommitBeforeDirective?.();
    return cloneFrozen({
      ...decoded,
      kind: 'harness.user-pull.claimed',
      payload,
    } satisfies UserPullClaimed);
  }

  async #withdrawUserPull(
    command: WithdrawUserPullCommand,
    normalized: string,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    const preparation = index.payload.preparations.find(
      item => item.preparationIdentity === command.preparationIdentity,
    );
    if (preparation === undefined) return rejected(command, index.stateVersion, 'preparation-not-found');
    if (preparation.status !== 'prepared') {
      return rejected(command, index.stateVersion, 'preparation-not-open');
    }
    const expiry = await this.#semanticUserPullExpiry(index, preparation);
    if (expiry !== undefined) {
      const expiredStateVersion = await this.#expireUserPullPreparation(index, preparation, expiry);
      return rejected(command, expiredStateVersion, expiry);
    }
    const loaded = await this.#loadUserPullPreparationAtVersion(index.stateVersion, preparation, index.payload);
    const nextPreparation: UserPullPreparationIndexEntry = {
      ...preparation,
      status: 'withdrawn',
      terminalReason: command.reason,
    };
    const nextRecord: UserPullPreparationRecordPayload = {
      ...loaded.payload,
      status: 'withdrawn',
      terminalReason: command.reason,
    };
    const result: UserPullWithdrawn = cloneFrozen({
      kind: 'harness.user-pull.withdrawn',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion + 1,
      preparationIdentity: preparation.preparationIdentity,
      reason: command.reason,
    });
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        revisionedRecord(
          preparation.preparationIdentity,
          preparation.reviewIdentity,
          'harness.user-pull-preparation',
          loaded.revision,
          nextRecord,
        ),
        this.#indexWrite(index, replacePreparation(index.payload, nextPreparation)),
        this.#commandRecord(command, normalized, result),
      ],
      result: { kind: 'harness.command-result', schemaVersion: 1, payload: encode(result) },
    });
    if (!('result' in committed)) return await this.#mapCommandCommitFailure(command, normalized, committed);
    const decoded = this.#decodeCommandResult(committed, command);
    this.#publish(committed.stateVersion);
    return decoded;
  }

  async #recordUserPullObservability(
    command: RecordUserPullObservabilityCommand,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    if (command.bridgeProtocolVersion !== 1) {
      return rejected(command, index.stateVersion, 'bridge-protocol-mismatch');
    }
    if (command.canonicalGitRoot !== this.#canonicalCheckout) {
      return rejected(command, index.stateVersion, 'checkout-mismatch');
    }
    const attachmentIdentity = stableIdentity(
      'att',
      'claude-code',
      command.sessionId,
      command.canonicalGitRoot,
      command.canonicalGitDir,
    ) as HarnessAttachmentIdentity;
    const attachment = index.payload.attachments.find(item => item.attachmentIdentity === attachmentIdentity);
    if (attachment === undefined) return rejected(command, index.stateVersion, 'attachment-not-found');
    const attachmentRecord = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
    if (
      attachmentRecord === undefined ||
      attachmentRecord.sessionId !== command.sessionId ||
      attachmentRecord.canonicalGitRoot !== command.canonicalGitRoot ||
      attachmentRecord.canonicalGitDir !== command.canonicalGitDir
    ) {
      return rejected(command, index.stateVersion, 'attachment-not-live');
    }
    const loaded = await this.#loadUserPullObservability(index.stateVersion, attachmentIdentity);
    if (
      loaded === undefined ||
      loaded.payload.compatibilityIdentity !== attachment.compatibilityIdentity ||
      loaded.payload.availability.runtimeGeneration !== this.#runtimeGeneration
    ) {
      return rejected(command, index.stateVersion, 'availability-unknown');
    }
    const observation = command.observation;
    if (
      observation.kind === 'context-budget' &&
      observation.compatibilityIdentity !== attachment.compatibilityIdentity
    ) {
      return rejected(command, index.stateVersion, 'capability-incompatible');
    }
    const priorEvidenceIdentity =
      observation.kind === 'context-budget'
        ? loaded.payload.contextBudget?.evidenceIdentity
        : observation.kind === 'compaction'
          ? loaded.payload.compaction?.evidenceIdentity
          : loaded.payload.availability.evidenceIdentity;
    if (priorEvidenceIdentity === observation.evidenceIdentity) {
      return cloneFrozen({
        kind: 'harness.user-pull.observability-recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion,
        attachmentIdentity,
        observationKind: observation.kind,
        evidenceIdentity: observation.evidenceIdentity,
      } satisfies UserPullObservabilityRecorded);
    }

    let next: UserPullObservabilityRecordPayload;
    if (observation.kind === 'context-budget') {
      const prior = loaded.payload.contextBudget;
      const modelChanged =
        prior !== undefined &&
        prior.runtimeGeneration === this.#runtimeGeneration &&
        prior.modelId !== undefined &&
        prior.modelId !== observation.modelId;
      const usage = observation.currentUsage;
      const reportIsConsistent =
        usage === null ||
        (usage.inputTokens + usage.cacheCreationInputTokens + usage.cacheReadInputTokens ===
          observation.totalInputTokens &&
          usage.outputTokens === observation.totalOutputTokens);
      let contextBudget: UserPullContextBudgetRecord;
      if (modelChanged || usage === null || !reportIsConsistent) {
        contextBudget = {
          status: 'unknown',
          source: 'claude-status-line',
          runtimeGeneration: this.#runtimeGeneration,
          evidenceIdentity: observation.evidenceIdentity,
          reason: modelChanged ? 'model-changed' : usage === null ? 'awaiting-response' : 'host-report-inconsistent',
          modelId: observation.modelId,
          modelDisplayName: observation.modelDisplayName,
          contextWindowSize: observation.contextWindowSize,
          ...(observation.promptId === undefined ? {} : { promptId: observation.promptId }),
        };
      } else {
        contextBudget = {
          status: 'available',
          source: 'claude-status-line',
          runtimeGeneration: this.#runtimeGeneration,
          evidenceIdentity: observation.evidenceIdentity,
          modelId: observation.modelId,
          modelDisplayName: observation.modelDisplayName,
          contextWindowSize: observation.contextWindowSize,
          totalInputTokens: observation.totalInputTokens,
          totalOutputTokens: observation.totalOutputTokens,
          currentUsage: usage,
          ...(observation.usedPercentage === undefined ? {} : { usedPercentage: observation.usedPercentage }),
          ...(observation.remainingPercentage === undefined
            ? {}
            : { remainingPercentage: observation.remainingPercentage }),
          ...(observation.promptId === undefined ? {} : { promptId: observation.promptId }),
        };
      }
      next = {
        ...loaded.payload,
        availability: {
          state: 'revalidated',
          reason: 'exact-identity-and-contract',
          runtimeGeneration: this.#runtimeGeneration,
          evidenceIdentity: observation.evidenceIdentity,
        },
        contextBudget,
      };
    } else if (observation.kind === 'compaction') {
      const prior = loaded.payload.contextBudget;
      const contextBudget: UserPullContextBudgetRecord | undefined =
        prior === undefined
          ? undefined
          : {
              status: 'unknown',
              source: 'claude-status-line',
              runtimeGeneration: this.#runtimeGeneration,
              evidenceIdentity: observation.evidenceIdentity,
              reason: 'compacted',
              ...(prior.runtimeGeneration === this.#runtimeGeneration && prior.modelId !== undefined
                ? {
                    modelId: prior.modelId,
                    modelDisplayName: prior.modelDisplayName,
                    contextWindowSize: prior.contextWindowSize,
                  }
                : {}),
              ...(prior.promptId === undefined ? {} : { promptId: prior.promptId }),
            };
      next = {
        ...loaded.payload,
        ...(contextBudget === undefined ? {} : { contextBudget }),
        compaction: {
          phase: observation.phase,
          trigger: observation.trigger,
          runtimeGeneration: this.#runtimeGeneration,
          evidenceIdentity: observation.evidenceIdentity,
        },
      };
    } else {
      const prior = loaded.payload.contextBudget;
      next = {
        ...loaded.payload,
        availability: {
          state: 'blocked-by-runtime',
          reason: observation.reason,
          runtimeGeneration: this.#runtimeGeneration,
          evidenceIdentity: observation.evidenceIdentity,
        },
        ...(prior === undefined
          ? {}
          : {
              contextBudget: {
                status: 'unknown',
                source: 'claude-status-line',
                runtimeGeneration: this.#runtimeGeneration,
                evidenceIdentity: observation.evidenceIdentity,
                reason: 'session-ended',
                ...(prior.runtimeGeneration === this.#runtimeGeneration && prior.modelId !== undefined
                  ? {
                      modelId: prior.modelId,
                      modelDisplayName: prior.modelDisplayName,
                      contextWindowSize: prior.contextWindowSize,
                    }
                  : {}),
                ...(prior.promptId === undefined ? {} : { promptId: prior.promptId }),
              },
            }),
      };
    }

    const result: UserPullObservabilityRecorded = cloneFrozen({
      kind: 'harness.user-pull.observability-recorded',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion + 1,
      attachmentIdentity,
      observationKind: observation.kind,
      evidenceIdentity: observation.evidenceIdentity,
    });
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        revisionedRecord(
          this.#userPullObservabilityIdentity(attachmentIdentity),
          this.#indexIdentity,
          'harness.user-pull-observability',
          loaded.revision,
          next,
        ),
      ],
      result: {
        kind: 'harness.user-pull-observability-result',
        schemaVersion: 1,
        payload: encode(result),
      },
    });
    if (!('result' in committed)) {
      if (committed.reason === 'state-version-mismatch') throw new HarnessProjectionVersionChanged();
      return rejected(
        command,
        index.stateVersion,
        committed.reason === 'command-identity-conflict' ? 'command-identity-conflict' : 'state-conflict',
      );
    }
    if (
      committed.result.kind !== 'harness.user-pull-observability-result' ||
      committed.result.schemaVersion !== 1 ||
      !sameValue(decode(committed.result.payload), result)
    ) {
      throw new HarnessStateProblem();
    }
    this.#publish(committed.stateVersion);
    return result;
  }

  async #observeUserPull(
    command: ObserveUserPullCommand,
    index: LoadedHarnessIndex,
  ): Promise<HarnessInteractionCommandResult> {
    if (command.bridgeProtocolVersion !== 1) {
      return rejected(command, index.stateVersion, 'bridge-protocol-mismatch');
    }
    const contexts = await this.#loadUserPullInvocationContexts(index);
    const selected = this.#selectUserPullObservationContext(command.observation, contexts);
    if (selected === undefined) {
      return cloneFrozen({
        kind: 'harness.user-pull.observation-ignored',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion,
        observationKind: command.observation.kind,
        reason: 'no-correlated-invocation',
      } satisfies UserPullObservationIgnored);
    }
    const decision = this.#userPullEvidenceDecision(command.observation, selected);
    const acknowledgement = await this.#acceptEvidence(
      selected.invocation.attachmentIdentity,
      decision.evidence,
      index.stateVersion,
    );
    if (acknowledgement.status === 'refused') {
      if (acknowledgement.reason === 'state-version-changed') throw new HarnessProjectionVersionChanged();
      return rejected(command, index.stateVersion, this.#userPullEvidenceRejection(acknowledgement.reason));
    }
    return cloneFrozen({
      kind: 'harness.user-pull.observed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: Math.max(index.stateVersion, acknowledgement.stateVersion),
      observationKind: command.observation.kind,
      disposition: decision.disposition,
      attachmentIdentity: selected.invocation.attachmentIdentity,
      invocationIdentity: selected.invocation.invocationIdentity,
      evidenceIdentity: decision.evidence.evidenceIdentity,
    } satisfies UserPullObserved);
  }

  async #loadUserPullInvocationContexts(index: LoadedHarnessIndex): Promise<readonly UserPullInvocationContext[]> {
    const claimed = index.payload.preparations.filter(
      preparation =>
        preparation.status === 'claimed' &&
        preparation.invocationIdentity !== undefined &&
        preparation.claimedOccurrenceIdentity !== undefined,
    );
    if (claimed.length === 0) return [];
    const records = await this.#readRecordsAtVersion(
      index.stateVersion,
      claimed.map(preparation => preparation.claimedOccurrenceIdentity!),
      false,
    );
    return claimed.map((preparation, position) => {
      const invocation = index.payload.invocations.find(
        candidate => candidate.invocationIdentity === preparation.invocationIdentity,
      );
      const record = records[position];
      if (invocation === undefined || record?.kind !== 'harness.user-pull-arm' || record.recordClass !== 'immutable') {
        throw new HarnessStateProblem();
      }
      const occurrence = parseUserPullArmRecord(decode(record.payload));
      if (
        occurrence.occurrenceIdentity !== preparation.claimedOccurrenceIdentity ||
        occurrence.preparationIdentity !== preparation.preparationIdentity ||
        occurrence.attachmentIdentity !== preparation.attachmentIdentity ||
        invocation.attachmentIdentity !== preparation.attachmentIdentity ||
        invocation.handoffIdentity !== preparation.handoffIdentity
      ) {
        throw new HarnessStateProblem();
      }
      return { preparation, invocation, occurrence };
    });
  }

  #selectUserPullObservationContext(
    observation: UserPullObservation,
    contexts: readonly UserPullInvocationContext[],
  ): UserPullInvocationContext | undefined {
    if (observation.kind === 'correlation-lost') {
      return contexts.find(
        context =>
          context.invocation.invocationIdentity === observation.invocationIdentity &&
          context.invocation.attachmentIdentity === observation.attachmentIdentity,
      );
    }
    const nonterminal = new Set<HarnessInvocationStatus>(['awaiting-start', 'active']);
    const candidates =
      observation.kind === 'session-ended'
        ? contexts.filter(
            context =>
              nonterminal.has(context.invocation.status) && context.occurrence.sessionId === observation.sessionId,
          )
        : contexts.filter(
            context =>
              context.occurrence.sessionId === observation.sessionId &&
              context.occurrence.promptId === observation.promptId,
          );
    const exact = candidates.filter(
      context =>
        context.occurrence.canonicalGitRoot === observation.canonicalGitRoot &&
        context.occurrence.canonicalGitDir === observation.canonicalGitDir,
    );
    if (exact.length > 1 || (exact.length === 0 && candidates.length > 1)) throw new HarnessStateProblem();
    return exact[0] ?? candidates[0];
  }

  #userPullEvidenceDecision(
    observation: UserPullObservation,
    context: UserPullInvocationContext,
  ): UserPullEvidenceDecision {
    const { occurrence, preparation, invocation } = context;
    const correlation = {
      preparationIdentity: preparation.preparationIdentity,
      occurrenceIdentity: occurrence.occurrenceIdentity,
      sessionId: occurrence.sessionId,
      promptId: occurrence.promptId,
      canonicalGitRoot: occurrence.canonicalGitRoot,
      canonicalGitDir: occurrence.canonicalGitDir,
      bridgeProtocolVersion: 1 as const,
    };
    if (observation.kind === 'correlation-lost') {
      return this.#userPullLossDecision(context, observation.reason, 'reconciliation', correlation);
    }
    const exactCheckout =
      occurrence.canonicalGitRoot === observation.canonicalGitRoot &&
      occurrence.canonicalGitDir === observation.canonicalGitDir &&
      invocation.attachmentIdentity === occurrence.attachmentIdentity;
    if (!exactCheckout) {
      return this.#userPullLossDecision(context, 'attachment-identity-changed', 'reconciliation', correlation, {
        observedCanonicalGitRoot: observation.canonicalGitRoot,
        observedCanonicalGitDir: observation.canonicalGitDir,
      });
    }
    if (observation.kind === 'session-ended') {
      return this.#userPullLossDecision(
        context,
        'session-ended-without-terminal',
        'session-end',
        correlation,
        observation.sessionReason === undefined ? {} : { sessionReason: observation.sessionReason },
      );
    }
    if (observation.kind === 'prompt-submitted') {
      const deadline = invocation.startObservationDeadline;
      const now = this.#now().valueOf();
      if (!Number.isFinite(now)) throw new HarnessStateProblem();
      if (
        (invocation.status === 'awaiting-start' && deadline !== undefined && Date.parse(deadline) <= now) ||
        (invocation.status === 'unresolved' && invocation.terminalReason === 'start-observation-window-expired')
      ) {
        return this.#userPullLossDecision(
          context,
          'start-observation-window-expired',
          'start-observation-window',
          correlation,
        );
      }
      const evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.start-observed' }> = {
        kind: 'harness.user-pull.start-observed',
        evidenceIdentity: stableIdentity(
          'uev',
          invocation.invocationIdentity,
          occurrence.occurrenceIdentity,
          'prompt-submitted',
        ),
        attachmentIdentity: invocation.attachmentIdentity,
        invocationIdentity: invocation.invocationIdentity,
        ...correlation,
      };
      return { evidence, disposition: 'started' };
    }
    if (
      invocation.status === 'awaiting-start' ||
      (invocation.status === 'unresolved' && invocation.terminalReason === 'start-evidence-lost')
    ) {
      return this.#userPullLossDecision(
        context,
        'start-evidence-lost',
        observation.kind === 'normal-stop' ? 'normal-stop-before-start' : 'stop-failure-before-start',
        correlation,
        observation.kind === 'normal-stop'
          ? {
              ...(observation.backgroundTaskCount === undefined
                ? {}
                : { backgroundTaskCount: observation.backgroundTaskCount }),
              ...(observation.sessionCronCount === undefined ? {} : { sessionCronCount: observation.sessionCronCount }),
              stopHookActive: observation.stopHookActive,
            }
          : {
              ...(observation.errorType === undefined ? {} : { errorType: observation.errorType }),
              ...(observation.failureType === undefined ? {} : { failureType: observation.failureType }),
            },
      );
    }
    if (observation.kind === 'stop-failure') {
      const evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.terminal-observed' }> = {
        kind: 'harness.user-pull.terminal-observed',
        evidenceIdentity: stableIdentity(
          'uev',
          invocation.invocationIdentity,
          occurrence.occurrenceIdentity,
          'stop-failure',
          observation.errorType ?? '',
          observation.failureType ?? '',
        ),
        attachmentIdentity: invocation.attachmentIdentity,
        invocationIdentity: invocation.invocationIdentity,
        ...correlation,
        terminalEvent: 'stop-failure',
        outcome: 'failed',
        ...(observation.errorType === undefined ? {} : { errorType: observation.errorType }),
        ...(observation.failureType === undefined ? {} : { failureType: observation.failureType }),
      };
      return { evidence, disposition: 'failed' };
    }
    const unresolvedReason: UserPullInvocationUnresolvedReason | undefined = observation.stopHookActive
      ? 'stop-continuation-active'
      : observation.backgroundTaskCount === undefined || observation.sessionCronCount === undefined
        ? 'background-activity-unverified'
        : observation.backgroundTaskCount > 0 || observation.sessionCronCount > 0
          ? 'background-activity-remains'
          : undefined;
    if (unresolvedReason !== undefined) {
      return this.#userPullLossDecision(context, unresolvedReason, 'normal-stop', correlation, {
        ...(observation.backgroundTaskCount === undefined
          ? {}
          : { backgroundTaskCount: observation.backgroundTaskCount }),
        ...(observation.sessionCronCount === undefined ? {} : { sessionCronCount: observation.sessionCronCount }),
        stopHookActive: observation.stopHookActive,
      });
    }
    const evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.terminal-observed' }> = {
      kind: 'harness.user-pull.terminal-observed',
      evidenceIdentity: stableIdentity(
        'uev',
        invocation.invocationIdentity,
        occurrence.occurrenceIdentity,
        'normal-stop',
        String(observation.backgroundTaskCount),
        String(observation.sessionCronCount),
        String(observation.stopHookActive),
      ),
      attachmentIdentity: invocation.attachmentIdentity,
      invocationIdentity: invocation.invocationIdentity,
      ...correlation,
      terminalEvent: 'normal-stop',
      outcome: 'ended-normally',
      backgroundTaskCount: observation.backgroundTaskCount as number,
      sessionCronCount: observation.sessionCronCount as number,
      stopHookActive: observation.stopHookActive,
    };
    return { evidence, disposition: 'ended-normally' };
  }

  #userPullLossDecision(
    context: UserPullInvocationContext,
    reason: UserPullInvocationUnresolvedReason,
    trigger: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.correlation-lost' }>['trigger'],
    correlation: Omit<
      Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.start-observed' }>,
      'kind' | 'evidenceIdentity' | 'attachmentIdentity' | 'invocationIdentity'
    >,
    detail: {
      readonly backgroundTaskCount?: number;
      readonly sessionCronCount?: number;
      readonly stopHookActive?: boolean;
      readonly errorType?: string;
      readonly failureType?: string;
      readonly sessionReason?: string;
      readonly observedCanonicalGitRoot?: string;
      readonly observedCanonicalGitDir?: string;
    } = {},
  ): UserPullEvidenceDecision {
    const evidence: Extract<NormalizedHarnessEvidence, { readonly kind: 'harness.user-pull.correlation-lost' }> = {
      kind: 'harness.user-pull.correlation-lost',
      evidenceIdentity: stableIdentity(
        'uev',
        context.invocation.invocationIdentity,
        context.occurrence.occurrenceIdentity,
        trigger,
        reason,
        String(detail.backgroundTaskCount ?? ''),
        String(detail.sessionCronCount ?? ''),
        String(detail.stopHookActive ?? ''),
        detail.errorType ?? '',
        detail.failureType ?? '',
        detail.sessionReason ?? '',
        detail.observedCanonicalGitRoot ?? '',
        detail.observedCanonicalGitDir ?? '',
      ),
      attachmentIdentity: context.invocation.attachmentIdentity,
      invocationIdentity: context.invocation.invocationIdentity,
      ...correlation,
      reason,
      trigger,
      ...detail,
    };
    return { evidence, disposition: 'unresolved' };
  }

  #userPullEvidenceRejection(reason: HarnessEvidenceRefusalReason): HarnessCommandRejectionReason {
    switch (reason) {
      case 'state-version-changed':
        return 'state-version-mismatch';
      case 'attachment-not-found':
        return 'attachment-not-found';
      case 'attachment-identity-mismatch':
        return 'attachment-identity-conflict';
      case 'invocation-not-found':
        return 'invocation-not-found';
      case 'state-conflict':
      case 'state-unavailable':
        return 'state-conflict';
      default:
        return 'observation-conflict';
    }
  }

  async #expireOneUserPullStartObservation(
    index: LoadedHarnessIndex,
    attachmentIdentity?: HarnessAttachmentIdentity,
  ): Promise<boolean> {
    const now = this.#now().valueOf();
    if (!Number.isFinite(now)) throw new HarnessStateProblem();
    const contexts = await this.#loadUserPullInvocationContexts(index);
    const context = contexts.find(
      candidate =>
        candidate.invocation.status === 'awaiting-start' &&
        candidate.invocation.startObservationDeadline !== undefined &&
        Date.parse(candidate.invocation.startObservationDeadline) <= now &&
        (attachmentIdentity === undefined || candidate.invocation.attachmentIdentity === attachmentIdentity),
    );
    if (context === undefined) return false;
    const decision = this.#userPullLossDecision(
      context,
      'start-observation-window-expired',
      'start-observation-window',
      {
        preparationIdentity: context.preparation.preparationIdentity,
        occurrenceIdentity: context.occurrence.occurrenceIdentity,
        sessionId: context.occurrence.sessionId,
        promptId: context.occurrence.promptId,
        canonicalGitRoot: context.occurrence.canonicalGitRoot,
        canonicalGitDir: context.occurrence.canonicalGitDir,
        bridgeProtocolVersion: 1,
      },
    );
    const acknowledgement = await this.#acceptEvidence(
      context.invocation.attachmentIdentity,
      decision.evidence,
      index.stateVersion,
    );
    if (acknowledgement.status === 'applied') return true;
    if (acknowledgement.reason === 'state-version-changed') throw new HarnessProjectionVersionChanged();
    throw new HarnessStateProblem();
  }

  async #expireUserPullStartObservations(
    initial: LoadedHarnessIndex,
    attachmentIdentity?: HarnessAttachmentIdentity,
  ): Promise<LoadedHarnessIndex> {
    let index = initial;
    for (let count = 0; count <= MAX_INVOCATIONS; count += 1) {
      if (!(await this.#expireOneUserPullStartObservation(index, attachmentIdentity))) return index;
      index = await this.#loadIndex();
    }
    throw new HarnessStateProblem();
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
      this.#indexWrite(index, nextIndex),
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
      return rejected(command, index.stateVersion, 'invocation-not-found');
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
        this.#indexWrite(index, replaceInvocation(index.payload, nextInvocation)),
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
    if (directive.kind === 'harness.direct-review.dispatch' && observation.status === 'proven-not-dispatched') {
      await this.#acceptEvidence(directive.attachmentIdentity, {
        kind: 'harness.invocation.rejected',
        evidenceIdentity: observation.evidenceIdentity,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
        reason: observation.reason,
      });
    }
  }

  async #userPullPreparationView(attachmentIdentity: HarnessAttachmentIdentity): Promise<UserPullPreparationView> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#userPullPreparationViewOnce(attachmentIdentity);
      } catch (error) {
        if (!(error instanceof HarnessProjectionVersionChanged) || attempt === 2) throw error;
      }
    }
    throw new HarnessProjectionVersionChanged();
  }

  async #userPullPreparationViewOnce(attachmentIdentity: HarnessAttachmentIdentity): Promise<UserPullPreparationView> {
    let index = await this.#expireUserPullStartObservations(await this.#loadIndex(), attachmentIdentity);
    let preparation = [...index.payload.preparations]
      .reverse()
      .find(item => item.attachmentIdentity === attachmentIdentity);
    if (preparation?.status === 'prepared') {
      const expiry = await this.#semanticUserPullExpiry(index, preparation);
      if (expiry !== undefined) {
        await this.#expireUserPullPreparation(index, preparation, expiry);
        index = await this.#loadIndex();
        preparation = [...index.payload.preparations]
          .reverse()
          .find(item => item.attachmentIdentity === attachmentIdentity);
      }
    }
    if (preparation === undefined) {
      return cloneFrozen({
        kind: 'harness.user-pull.preparation',
        status: 'not-found',
        stateVersion: index.stateVersion,
        attachmentIdentity,
      });
    }
    return projectionUserPullPreparation(index.stateVersion, preparation, index.payload);
  }

  #userPullObservabilityIdentity(attachmentIdentity: HarnessAttachmentIdentity): string {
    return stableIdentity('hob', attachmentIdentity);
  }

  async #loadUserPullObservability(
    expectedStateVersion: number,
    attachmentIdentity: HarnessAttachmentIdentity,
  ): Promise<LoadedUserPullObservability | undefined> {
    const read = await this.#state.read({
      recordIdentities: [this.#userPullObservabilityIdentity(attachmentIdentity)],
      includeContent: false,
    });
    if (read.stateVersion !== expectedStateVersion) throw new HarnessProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.kind !== 'harness.user-pull-observability' || record.recordClass !== 'revisioned') {
      throw new HarnessStateProblem();
    }
    const payload = parseUserPullObservabilityRecord(decode(record.payload));
    if (payload.attachmentIdentity !== attachmentIdentity) throw new HarnessStateProblem();
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload,
    };
  }

  async #loadUserPullAttachmentAtVersion(
    expectedStateVersion: number,
    attachment: HarnessAttachmentIndexEntry,
  ): Promise<UserPullAttachmentRecordPayload | undefined> {
    const read = await this.#state.read({
      recordIdentities: [attachment.compatibilityIdentity],
      includeContent: false,
    });
    if (read.stateVersion !== expectedStateVersion) throw new HarnessProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.kind !== 'harness.user-pull-attachment' || record.recordClass !== 'immutable') return undefined;
    const payload = parseUserPullAttachmentRecord(decode(record.payload));
    if (
      payload.attachmentIdentity !== attachment.attachmentIdentity ||
      payload.compatibilityIdentity !== attachment.compatibilityIdentity ||
      !sameValue(payload.destination, attachment.destination)
    ) {
      throw new HarnessStateProblem();
    }
    return payload;
  }

  async #loadUserPullPreparationAtVersion(
    expectedStateVersion: number,
    preparation: UserPullPreparationIndexEntry,
    index: HarnessIndexPayload,
  ): Promise<{
    readonly stateVersion: number;
    readonly revision: number;
    readonly payload: UserPullPreparationRecordPayload;
  }> {
    const read = await this.#state.read({
      recordIdentities: [preparation.preparationIdentity],
      includeContent: false,
    });
    if (read.stateVersion !== expectedStateVersion) throw new HarnessProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new HarnessStateProblem();
    const record = read.records[0];
    if (
      record === undefined ||
      record.kind !== 'harness.user-pull-preparation' ||
      record.recordClass !== 'revisioned'
    ) {
      throw new HarnessStateProblem();
    }
    const payload = parseUserPullPreparationRecord(decode(record.payload));
    const handoff = index.handoffs.find(item => item.handoffIdentity === preparation.handoffIdentity);
    if (
      !preparationRecordMatchesIndex(payload, preparation) ||
      handoff === undefined ||
      payload.capabilitySnapshotIdentity !== handoff.capabilitySnapshotIdentity
    ) {
      throw new HarnessStateProblem();
    }
    return { stateVersion: read.stateVersion, revision: record.revision, payload };
  }

  #parseFrozenUserPullSnapshot(
    value: unknown,
    handoff: HarnessHandoffIndexEntry,
  ): FrozenUserPullReviewCapabilitySnapshot {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, [
        'formatVersion',
        'snapshotIdentity',
        'compatibilityIdentity',
        'manifestSha256',
        'capability',
        'availabilityAtCommit',
      ]) ||
      value.formatVersion !== 1 ||
      value.snapshotIdentity !== handoff.capabilitySnapshotIdentity ||
      typeof value.compatibilityIdentity !== 'string' ||
      !COMPATIBILITY_PATTERN.test(value.compatibilityIdentity) ||
      typeof value.manifestSha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.manifestSha256) ||
      value.availabilityAtCommit !== 'available'
    ) {
      throw new HarnessStateProblem();
    }
    let capability: ReviewedCapabilityContract;
    try {
      capability = normalizeCapability(value.capability);
    } catch {
      throw new HarnessStateProblem();
    }
    if (!isUserPullReviewCapability(capability)) throw new HarnessStateProblem();
    return cloneFrozen({
      snapshotIdentity: value.snapshotIdentity as HarnessCapabilitySnapshotIdentity,
      compatibilityIdentity: value.compatibilityIdentity as HarnessCompatibilityIdentity,
      manifestSha256: value.manifestSha256,
      capability,
      availabilityAtCommit: 'available',
    });
  }

  async #semanticUserPullExpiry(
    index: LoadedHarnessIndex,
    preparation: UserPullPreparationIndexEntry,
  ): Promise<
    | Extract<UserPullPreparationTerminalReason, 'identity-lost' | 'capability-incompatible' | 'route-deadline-passed'>
    | undefined
  > {
    if (preparation.status !== 'prepared') return undefined;
    if (
      preparation.disclosedDeadline !== undefined &&
      Date.parse(preparation.disclosedDeadline) <= this.#now().valueOf()
    ) {
      return 'route-deadline-passed';
    }
    const attachment = index.payload.attachments.find(
      item => item.attachmentIdentity === preparation.attachmentIdentity,
    );
    if (attachment === undefined) return 'identity-lost';
    const attachmentRecord = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
    if (
      attachmentRecord === undefined ||
      attachmentRecord.canonicalGitRoot !== attachment.destination.canonicalCheckout ||
      attachmentRecord.canonicalGitRoot !== this.#canonicalCheckout
    ) {
      return 'identity-lost';
    }
    const handoff = index.payload.handoffs.find(item => item.handoffIdentity === preparation.handoffIdentity);
    if (handoff === undefined) throw new HarnessStateProblem();
    const [snapshotRecord] = await this.#readRecordsAtVersion(
      index.stateVersion,
      [handoff.capabilitySnapshotIdentity],
      false,
    );
    if (snapshotRecord?.kind !== 'harness.capability-snapshot' || snapshotRecord.recordClass !== 'immutable') {
      throw new HarnessStateProblem();
    }
    const snapshot = this.#parseFrozenUserPullSnapshot(decode(snapshotRecord.payload), handoff);
    const currentCapability = attachmentRecord.manifest.capabilities.find(
      item => item.capabilityIdentity === snapshot.capability.capabilityIdentity,
    );
    if (
      currentCapability === undefined ||
      !isUserPullReviewCapability(currentCapability) ||
      !sameValue(currentCapability, snapshot.capability)
    ) {
      return 'capability-incompatible';
    }
    return undefined;
  }

  async #expireUserPullPreparation(
    index: LoadedHarnessIndex,
    preparation: UserPullPreparationIndexEntry,
    reason: Extract<
      UserPullPreparationTerminalReason,
      'identity-lost' | 'capability-incompatible' | 'route-deadline-passed'
    >,
  ): Promise<number> {
    const loaded = await this.#loadUserPullPreparationAtVersion(index.stateVersion, preparation, index.payload);
    if (loaded.payload.status !== 'prepared') return index.stateVersion;
    const nextPreparation: UserPullPreparationIndexEntry = {
      ...preparation,
      status: 'expired',
      terminalReason: reason,
    };
    const nextRecord: UserPullPreparationRecordPayload = {
      ...loaded.payload,
      status: 'expired',
      terminalReason: reason,
    };
    const result = cloneFrozen({
      kind: 'harness.user-pull.expired',
      preparationIdentity: preparation.preparationIdentity,
      reason,
      stateVersion: index.stateVersion + 1,
    });
    const committed = await this.#state.commit({
      commandIdentity: `harness-user-pull-expire:${preparation.preparationIdentity}:${reason}`,
      expectedStateVersion: index.stateVersion,
      records: [
        revisionedRecord(
          preparation.preparationIdentity,
          preparation.reviewIdentity,
          'harness.user-pull-preparation',
          loaded.revision,
          nextRecord,
        ),
        this.#indexWrite(index, replacePreparation(index.payload, nextPreparation)),
      ],
      result: { kind: 'harness.user-pull-expiry-result', schemaVersion: 1, payload: encode(result) },
    });
    if (!('result' in committed)) {
      if (committed.reason === 'state-version-mismatch' || committed.reason === 'revision-conflict') {
        return (await this.#loadIndex()).stateVersion;
      }
      throw new HarnessStateProblem();
    }
    this.#publish(committed.stateVersion);
    return committed.stateVersion;
  }

  #claimDuplicateFromCommitted(
    command: ClaimUserPullCommand,
    committed: UserPullClaimCommitted,
  ): UserPullClaimDuplicate {
    return cloneFrozen({
      kind: 'harness.user-pull.claim-duplicate',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: committed.stateVersion,
      reviewIdentity: committed.reviewIdentity,
      reviewBatchIdentity: committed.reviewBatchIdentity,
      attachmentIdentity: committed.attachmentIdentity,
      handoffIdentity: committed.handoffIdentity,
      preparationIdentity: committed.preparationIdentity,
      invocationIdentity: committed.invocationIdentity,
    });
  }

  #duplicateUserPullClaim(
    command: ClaimUserPullCommand,
    index: LoadedHarnessIndex,
    attachmentIdentities: ReadonlySet<HarnessAttachmentIdentity>,
  ): HarnessInteractionCommandResult | undefined {
    const candidates = index.payload.preparations.filter(preparation => {
      if (
        preparation.status !== 'claimed' ||
        preparation.invocationIdentity === undefined ||
        !attachmentIdentities.has(preparation.attachmentIdentity)
      ) {
        return false;
      }
      const invocation = index.payload.invocations.find(
        item => item.invocationIdentity === preparation.invocationIdentity,
      );
      return invocation?.status === 'awaiting-start' || invocation?.status === 'active';
    });
    if (candidates.length > 1) {
      return rejected(command, index.stateVersion, 'ambiguous-armed-occurrence');
    }
    const preparation = candidates[0];
    if (preparation?.invocationIdentity === undefined) return undefined;
    return cloneFrozen({
      kind: 'harness.user-pull.claim-duplicate',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion,
      reviewIdentity: preparation.reviewIdentity,
      reviewBatchIdentity: preparation.reviewBatchIdentity,
      attachmentIdentity: preparation.attachmentIdentity,
      handoffIdentity: preparation.handoffIdentity,
      preparationIdentity: preparation.preparationIdentity,
      invocationIdentity: preparation.invocationIdentity,
    } satisfies UserPullClaimDuplicate);
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
    const priorHandoff = index.payload.handoffs.find(item => item.reviewBatchIdentity === reviewBatchIdentity);
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

  async #projectUserPullAttachment(
    index: LoadedHarnessIndex,
    attachment: HarnessAttachmentIndexEntry,
  ): Promise<UserPullAttachmentView | undefined> {
    const attachmentRecord = await this.#loadUserPullAttachmentAtVersion(index.stateVersion, attachment);
    if (attachmentRecord === undefined) return undefined;
    const observability = await this.#loadUserPullObservability(index.stateVersion, attachment.attachmentIdentity);
    if (
      observability !== undefined &&
      observability.payload.compatibilityIdentity !== attachment.compatibilityIdentity
    ) {
      throw new HarnessStateProblem();
    }
    let availability: UserPullAvailabilityView;
    if (observability === undefined) {
      availability = { state: 'stale', reason: 'freshness-unverified' };
    } else if (observability.payload.availability.runtimeGeneration !== this.#runtimeGeneration) {
      availability = { state: 'stale', reason: 'runtime-revalidation-required' };
    } else if (observability.payload.availability.state === 'blocked-by-runtime') {
      availability = {
        state: 'blocked-by-runtime',
        reason: observability.payload.availability.reason,
      };
    } else if (attachment.availability.status === 'blocked') {
      availability = { state: 'blocked-by-runtime', reason: attachment.availability.reason };
    } else if (attachment.availability.status === 'unknown') {
      availability = { state: 'stale', reason: 'freshness-unverified' };
    } else {
      availability = { state: 'revalidated', reason: 'exact-identity-and-contract' };
    }

    const recordedBudget = observability?.payload.contextBudget;
    let contextBudget: UserPullContextBudgetView;
    if (recordedBudget === undefined) {
      contextBudget = { status: 'unavailable', reason: 'status-line-bridge-not-verified' };
    } else if (availability.state === 'stale' || recordedBudget.runtimeGeneration !== this.#runtimeGeneration) {
      contextBudget = {
        status: 'unknown',
        source: 'claude-status-line',
        reason: 'attachment-stale',
        evidenceIdentity: recordedBudget.evidenceIdentity,
      };
    } else if (recordedBudget.status === 'available') {
      contextBudget = {
        status: 'available',
        source: 'claude-status-line',
        evidenceIdentity: recordedBudget.evidenceIdentity,
        modelId: recordedBudget.modelId,
        modelDisplayName: recordedBudget.modelDisplayName,
        contextWindowSize: recordedBudget.contextWindowSize,
        totalInputTokens: recordedBudget.totalInputTokens,
        totalOutputTokens: recordedBudget.totalOutputTokens,
        currentUsage: recordedBudget.currentUsage,
        ...(recordedBudget.usedPercentage === undefined ? {} : { usedPercentage: recordedBudget.usedPercentage }),
        ...(recordedBudget.remainingPercentage === undefined
          ? {}
          : { remainingPercentage: recordedBudget.remainingPercentage }),
        ...(recordedBudget.promptId === undefined ? {} : { promptId: recordedBudget.promptId }),
      };
    } else {
      contextBudget = {
        status: 'unknown',
        source: 'claude-status-line',
        reason: recordedBudget.reason,
        evidenceIdentity: recordedBudget.evidenceIdentity,
        ...(recordedBudget.modelId === undefined ? {} : { modelId: recordedBudget.modelId }),
        ...(recordedBudget.modelDisplayName === undefined ? {} : { modelDisplayName: recordedBudget.modelDisplayName }),
        ...(recordedBudget.contextWindowSize === undefined
          ? {}
          : { contextWindowSize: recordedBudget.contextWindowSize }),
        ...(recordedBudget.promptId === undefined ? {} : { promptId: recordedBudget.promptId }),
      };
    }
    const compaction = observability?.payload.compaction;
    return cloneFrozen({
      attachmentIdentity: attachment.attachmentIdentity,
      destination: { attachmentIdentity: attachment.attachmentIdentity, ...attachment.destination },
      availability,
      contextBudget,
      ...(compaction === undefined || compaction.runtimeGeneration !== this.#runtimeGeneration
        ? {}
        : {
            compaction: {
              phase: compaction.phase,
              trigger: compaction.trigger,
              evidenceIdentity: compaction.evidenceIdentity,
            },
          }),
    });
  }

  async #interactionView(
    reviewIdentity: ReviewIdentity,
    offset: number,
    limit: number,
  ): Promise<ReviewHarnessInteractionView> {
    const index = await this.#expireUserPullStartObservations(await this.#loadIndex());
    const allHandoffs = index.payload.handoffs.filter(item => item.reviewIdentity === reviewIdentity);
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
    const preparations = index.payload.preparations
      .filter(item => item.reviewIdentity === reviewIdentity)
      .map(item => projectionUserPullPreparation(index.stateVersion, item, index.payload));
    const projectedAttachments = (
      await Promise.all(index.payload.attachments.map(async item => await this.#projectUserPullAttachment(index, item)))
    ).filter((item): item is UserPullAttachmentView => item !== undefined);
    const latestPreparation = preparations.at(-1);
    const selectedAttachment =
      latestPreparation === undefined
        ? projectedAttachments.length === 1
          ? projectedAttachments[0]
          : undefined
        : projectedAttachments.find(item => item.attachmentIdentity === latestPreparation.attachmentIdentity);
    const userPullAvailability: UserPullAvailabilityView =
      selectedAttachment?.availability ??
      (latestPreparation === undefined
        ? projectedAttachments.length === 0
          ? { state: 'unavailable', reason: 'attachment-not-observed' }
          : { state: 'unavailable', reason: 'attachment-not-selected' }
        : { state: 'unavailable', reason: 'attachment-lost' });
    return cloneFrozen({
      kind: 'harness.review-interaction',
      stateVersion: index.stateVersion,
      reviewIdentity,
      totalInteractions: allHandoffs.length,
      offset,
      nextOffset,
      handoffs: handoffs.map(item => projectionHandoff(item, messageIdentities.get(item.reviewBatchIdentity))),
      invocations: index.payload.invocations
        .filter(item => invocationIds.has(item.invocationIdentity))
        .map(projectionInvocation),
      userPull: {
        action: '/neoflow:review',
        availability: userPullAvailability,
        ...(selectedAttachment === undefined ? {} : { attachment: selectedAttachment }),
        preparations,
      },
    });
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
    if (command.kind === 'harness.user-pull.claim') {
      if (payload.result.kind !== 'harness.user-pull.claim-committed') throw new HarnessStateProblem();
      return this.#claimDuplicateFromCommitted(command, payload.result);
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
      command.kind === 'harness.review-handoff.commit' ||
      command.kind === 'review.question.ask' ||
      command.kind === 'harness.user-pull.prepare'
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
