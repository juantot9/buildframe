import { encodeBytesBase64 } from '../bytesBase64.js';
import type { AuthoritativeState, StateRecord } from '../authoritativeState.js';
import type { ContextSourceOccurrenceConflict } from '../contextEvidence.js';
import { deepFreeze } from '../recordCodec.js';
import {
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
  ReviewSnapshotTransition,
  type CapturedReviewSnapshot,
  decodeReviewingPayload,
  decideReviewContextCandidate,
  emptyReviewContextSelection,
  parseReviewContextContribution,
  parseReviewContextSelection,
  parseReviewDiffWindow,
  parseReviewBasis,
  parseReviewIndex,
  parseReviewManifestWindow,
  parseReviewMessage,
  parseReviewMessageResponse,
  parseReviewQuestion,
  parseReviewQuestionDraft,
  parseReviewResponse,
  parseReviewSnapshot,
  readMessageCodeState,
  parseReviewSnapshotContextContent,
  parseReviewSnapshotContextManifestWindow,
  parseReviewSnapshotFile,
  parseReviewingCommandRecord,
  reviewContextEvidenceSelection,
  reviewContextSelectionIdentity,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewSnapshotBasisIdentity,
  reviewSnapshotContextManifestWindowIdentity,
  type ReviewBasisIdentity,
  type ReviewBasisPayload,
  type ReviewDiffRowPayload,
  type ReviewBasisCommit,
  type ReviewContextContributionIdentity,
  type ReviewContextContributionPayload,
  type ReviewContextRule,
  type ReviewIdentity,
  type ReviewIndexEntry,
  type ReviewMessageIdentity,
  type ReviewMessagePayload,
  type ReviewMessageResponsePayload,
  type ReviewQuestionAnchor,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
  type ReviewResponseIdentity,
  type ReviewSnapshotContextItem,
  type ReviewSnapshotIdentity,
  type ReviewSnapshotPayload,
} from '../reviewing/index.js';
import {
  WorkspaceEvidence,
  reviewComparisonEndpointIdentity,
  evidencePath,
  type CurrentChangedFile,
  type EvidencePath,
  type ReviewCommitGraphRow,
} from '../workspaceEvidence/index.js';
import type { WorkspaceAttention, WorkspaceIdentity } from '../workspace.js';
import {
  commitMovedBetween,
  historyPointKey,
  historyPosition,
  historySteps,
  MAX_STEP_CHANGED_PATHS,
  projectedStepChangeRows,
  stepChangedFiles,
  stepChangedPaths,
  type CommitCrossing,
  type HistoryPointState,
  type StepChangedFile,
} from './history.js';
import type { SubscribeToWorkspaceInvalidation } from '../workspaceInvalidation.js';
import { isLive } from './kinds.js';

import {
  LIVE_BACKGROUND_FALLBACK_VERIFICATION_MS,
  LIVE_FALLBACK_VERIFICATION_MS,
  LIVE_INVALIDATION_DEBOUNCE_MS,
  MAX_DIFF_ROW_BYTES,
  MAX_LIVE_CAPTURES,
  MAX_REVIEWS,
  MAX_REVIEW_BATCHES,
  MAX_REVIEW_DRAFTS,
  MAX_REVIEW_MESSAGE_BODY_PREVIEW_BYTES,
  MAX_SNAPSHOT_EVIDENCE_IDENTITIES,
  SEARCH_CONTENT_WINDOWS_PER_READ,
  SEARCH_CONTENT_WINDOW_BYTES,
  WORKSPACE_PROJECTION_VERSION,
} from './limits.js';
import type {
  ReviewBasesView,
  ReviewBasesViewRequest,
  ReviewBasisItem,
  ReviewCommandResultView,
  ReviewCommandResultViewRequest,
  ReviewCommitGraphView,
  ReviewComparisonPreviewView,
  ReviewComparisonPreviewViewRequest,
  ReviewContextContributionContentView,
  ReviewContextContributionContentViewRequest,
  ReviewContextSelectionCandidate,
  ReviewContextSelectionContribution,
  ReviewContextSelectionSourceGroup,
  ReviewContextSelectionView,
  ReviewContextSelectionViewRequest,
  ReviewContinuationView,
  ReviewContinuationViewRequest,
  ReviewDiffView,
  ReviewDiffViewRequest,
  ReviewLiveDiffUnavailableView,
  ReviewLiveDiffView,
  ReviewLiveDiffViewRequest,
  ReviewLiveFileContentView,
  ReviewLiveFileContentViewRequest,
  ReviewLiveFileItem,
  ReviewLiveFilesView,
  ReviewLiveFilesViewRequest,
  ReviewLiveManifestView,
  ReviewLiveManifestViewRequest,
  ReviewManifestView,
  ReviewManifestViewRequest,
  ReviewMessageBodyView,
  ReviewMessageBodyViewRequest,
  ReviewHistoryPoint,
  ReviewHistoryView,
  ReviewHistoryViewRequest,
  ReviewStepChangesDiffView,
  ReviewStepChangesDiffViewRequest,
  ReviewStepChangesUnavailableReason,
  ReviewStepChangesView,
  ReviewStepChangesViewRequest,
  ReviewMessageListItem,
  ReviewMessageOriginView,
  ReviewMessageOriginViewRequest,
  ReviewMessagesView,
  ReviewMessagesViewRequest,
  ReviewProjectedBlocker,
  ReviewProjectedDiffRow,
  ReviewProjectedQuestionItem,
  ReviewProjectedQuestionTarget,
  ReviewProjectionHeader,
  ReviewQuestionBodyView,
  ReviewQuestionBodyViewRequest,
  ReviewQuestionLocationView,
  ReviewQuestionLocationViewRequest,
  ReviewQuestionsView,
  ReviewQuestionsViewRequest,
  ReviewSearchItem,
  ReviewSearchPreviewView,
  ReviewSearchPreviewViewRequest,
  ReviewSearchView,
  ReviewSearchViewRequest,
  ReviewSnapshotContextContentView,
  ReviewSnapshotContextContentViewRequest,
  ReviewSnapshotContextView,
  ReviewSnapshotContextViewRequest,
  ReviewVersionItem,
  ReviewVersionsView,
  ReviewVersionsViewRequest,
  WorkspaceHomeView,
  WorkspaceHomeViewRequest,
  WorkspaceProjectionView,
  WorkspaceProjectionViewFor,
  WorkspaceProjectionViewRequest,
  WorkspaceProjectionViewScope,
  WorkspaceProjectionViewUpdate,
} from './contracts.js';
import {
  ProjectionRecordsInvalid,
  ProjectionVersionChanged,
  type IndexedReviewSearchChange,
  type IndexedReviewSearchFile,
  type LiveCaptureEntry,
  type LoadedIndex,
  type ProjectionSubscription,
  type ReviewSearchIndex,
  type SearchContentSegment,
} from './internalTypes.js';
import {
  capturedLiveChangesIdentity,
  commandRecordIdentity,
  diffWindowIdentity,
  fileRecordIdentity,
  indexIdentity,
  manifestWindowIdentity,
  permanentProjectionRecordFailure,
  safeInteger,
  searchSnippet,
  snapshotLiveChangesIdentity,
} from './utils.js';
import { normalizeRequest } from './normalization.js';
import {
  blocker,
  completeText,
  currentReviewBlockers,
  fileMatchesComparisonScope,
  homeItem,
  observedGitCommit,
  projectedAction,
  projectedFile,
  projectedReviewBasis,
  questionActions,
  questionTarget,
  reviewActions,
  snapshotBlockers,
  textPreview,
} from './views.js';

export { WORKSPACE_PROJECTION_VERSION } from './limits.js';
export type {
  ReviewBasesAvailableView,
  ReviewBasesNotFoundView,
  ReviewBasesView,
  ReviewBasesViewRequest,
  ReviewBasisGitDiscovery,
  ReviewBasisItem,
  ReviewCommandResultView,
  ReviewCommandResultViewRequest,
  ReviewCommitGraphView,
  ReviewCommitGraphViewRequest,
  ReviewComparisonPreviewView,
  ReviewComparisonPreviewViewRequest,
  ReviewContextContributionContentView,
  ReviewContextContributionContentViewRequest,
  ReviewContextSelectionCandidate,
  ReviewContextSelectionContribution,
  ReviewContextSelectionSourceGroup,
  ReviewContextSelectionView,
  ReviewContextSelectionViewRequest,
  ReviewContinuationAvailableView,
  ReviewContinuationUnavailableView,
  ReviewContinuationView,
  ReviewContinuationViewRequest,
  ReviewDiffAvailableView,
  ReviewDiffUnavailableView,
  ReviewDiffView,
  ReviewDiffViewRequest,
  ReviewGateBasis,
  ReviewLiveDiffAvailableView,
  ReviewLiveDiffUnavailableView,
  ReviewLiveDiffView,
  ReviewLiveDiffViewRequest,
  ReviewLiveFileContentView,
  ReviewLiveFileContentViewRequest,
  ReviewLiveFileItem,
  ReviewLiveFilesView,
  ReviewLiveFilesViewRequest,
  ReviewLiveManifestAvailableView,
  ReviewLiveManifestUnavailableView,
  ReviewLiveManifestView,
  ReviewLiveManifestViewRequest,
  ReviewManifestAvailableView,
  ReviewManifestNotFoundView,
  ReviewManifestView,
  ReviewManifestViewRequest,
  ReviewMessageBodyView,
  ReviewMessageBodyViewRequest,
  ReviewHistoryHeadMove,
  ReviewHistoryPoint,
  ReviewHistoryStep,
  ReviewHistoryView,
  ReviewHistoryViewRequest,
  ReviewStepChangedFile,
  ReviewStepChangesDiffView,
  ReviewStepChangesDiffViewRequest,
  ReviewStepChangesUnavailableReason,
  ReviewStepChangesView,
  ReviewStepChangesViewRequest,
  ReviewMessageListItem,
  ReviewMessageOriginView,
  ReviewMessageOriginViewRequest,
  ReviewMessagesAvailableView,
  ReviewMessagesNotFoundView,
  ReviewMessagesView,
  ReviewMessagesViewRequest,
  ReviewProjectedAction,
  ReviewProjectedActionKind,
  ReviewProjectedBlocker,
  ReviewProjectedContentStatus,
  ReviewProjectedDiffRow,
  ReviewProjectedFile,
  ReviewProjectedFileSide,
  ReviewProjectedQuestionItem,
  ReviewProjectedQuestionTarget,
  ReviewProjectedScopeMembership,
  ReviewProjectedTextWindow,
  ReviewProjectionBlockerCode,
  ReviewProjectionHeader,
  ReviewQuestionBodyView,
  ReviewQuestionBodyViewRequest,
  ReviewQuestionDraftListItem,
  ReviewQuestionListItem,
  ReviewQuestionLocationView,
  ReviewQuestionLocationViewRequest,
  ReviewQuestionsAvailableView,
  ReviewQuestionsNotFoundView,
  ReviewQuestionsView,
  ReviewQuestionsViewRequest,
  ReviewSearchItem,
  ReviewSearchPreviewView,
  ReviewSearchPreviewViewRequest,
  ReviewSearchSnippet,
  ReviewSearchView,
  ReviewSearchViewRequest,
  ReviewSnapshotContextBasisView,
  ReviewSnapshotContextContentView,
  ReviewSnapshotContextContentViewRequest,
  ReviewSnapshotContextView,
  ReviewSnapshotContextViewRequest,
  ReviewVersionItem,
  ReviewVersionsAvailableView,
  ReviewVersionsNotFoundView,
  ReviewVersionsView,
  ReviewVersionsViewRequest,
  WorkspaceHomeReviewItem,
  WorkspaceHomeView,
  WorkspaceHomeViewRequest,
  WorkspaceProjectionFailureUpdate,
  WorkspaceProjectionView,
  WorkspaceProjectionViewFor,
  WorkspaceProjectionViewRequest,
  WorkspaceProjectionViewScope,
  WorkspaceProjectionViewUpdate,
  WorkspaceProjectionViewUpdateFor,
} from './contracts.js';

type StepChangeSet =
  | { readonly status: 'available'; readonly files: readonly StepChangedFile[] }
  | { readonly status: 'unavailable' | 'not-found'; readonly reason: ReviewStepChangesUnavailableReason };

const MAX_STEP_CHANGE_SETS = 8;
const MAX_HISTORY_POINT_STATES = 1024;
const MAX_COMMIT_CROSSINGS = 8;

/** The commit a captured basis compares against; undefined unless it is HEAD. */
function headObjectIdentity(basis: {
  readonly kind: string;
  readonly objectIdentity?: string | null;
}): string | null | undefined {
  return basis.kind === 'head' ? (basis.objectIdentity ?? null) : undefined;
}

type MessageChangedPaths = { readonly paths: readonly EvidencePath[]; readonly total: number } | undefined;

export interface ProjectionOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly state: AuthoritativeState;
  readonly evidence: WorkspaceEvidence;
  readonly subscribeToEvidenceInvalidation?: SubscribeToWorkspaceInvalidation;
  readonly liveFallbackVerificationMilliseconds?: number;
  readonly liveBackgroundFallbackVerificationMilliseconds?: number;
  /** Private deterministic observation seam for the bounded cache regression. */
  readonly onSnapshotEvidenceIdentityCacheSize?: (size: number) => void;
  /** Private observation seam: counts full live recaptures. */
  readonly onLiveChangesCapture?: () => void;
}

/** Read-only deep Projection Module behind Workspace.read and subscribe. */
export class WorkspaceProjection {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #state: AuthoritativeState;
  readonly #evidence: WorkspaceEvidence;
  readonly #snapshotTransition: ReviewSnapshotTransition;
  readonly #subscribeToEvidenceInvalidation: SubscribeToWorkspaceInvalidation | undefined;
  readonly #liveFallbackVerificationMilliseconds: number;
  readonly #liveBackgroundFallbackVerificationMilliseconds: number;
  #attention: WorkspaceAttention = 'foreground';
  readonly #subscriptions = new Set<ProjectionSubscription>();
  readonly #liveCaptures = new Map<string, LiveCaptureEntry>();
  /** Fingerprints at each sent or answered point; those points never change. */
  readonly #historyPointStates = new Map<string, Promise<HistoryPointState | undefined>>();
  /**
   * One working-tree check per Review shared by every live read. A settled
   * check is reused only while the watcher reports changes and nothing has
   * changed since; otherwise only concurrent reads share it.
   */
  readonly #liveVerifications = new Map<
    ReviewIdentity,
    {
      readonly generation: number;
      settledAt: number | undefined;
      readonly promise: Promise<LiveCaptureEntry | undefined>;
    }
  >();
  /** Bumped by every change signal: a watcher event, the fallback tick, or a commit. */
  #liveGeneration = 0;
  /** The repository file list behind each verified working-tree state. */
  readonly #repositoryFiles = new WeakMap<
    LiveCaptureEntry,
    ReturnType<WorkspaceEvidence['readCurrentRepositoryFiles']>
  >();
  readonly #searchIndexes = new Map<string, Promise<ReviewSearchIndex>>();
  readonly #snapshotStatusReads = new Map<
    string,
    Promise<{
      readonly status: ReviewProjectionHeader['snapshotStatus'];
      readonly contextStatus: ReviewProjectionHeader['contextStatus'];
    }>
  >();
  readonly #snapshotEvidenceIdentities = new Map<string, string>();
  /** What each answered Message's Response changed; immutable once observed. */
  readonly #stepChangeSets = new Map<string, Promise<StepChangeSet>>();
  /** What changed between two commits HEAD moved across; commits never change. */
  readonly #commitCrossings = new Map<string, Promise<CommitCrossing | undefined>>();
  readonly #onSnapshotEvidenceIdentityCacheSize: ((size: number) => void) | undefined;
  readonly #onLiveChangesCapture: (() => void) | undefined;
  #unsubscribeFromEvidenceInvalidation: (() => void) | undefined;
  #liveFallbackTimer: ReturnType<typeof setInterval> | undefined;
  #liveInvalidationTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: ProjectionOptions) {
    this.#workspaceIdentity = options.workspaceIdentity;
    this.#state = options.state;
    this.#evidence = options.evidence;
    this.#snapshotTransition = new ReviewSnapshotTransition({ evidence: options.evidence, state: options.state });
    this.#subscribeToEvidenceInvalidation = options.subscribeToEvidenceInvalidation;
    const liveFallbackVerificationMilliseconds =
      options.liveFallbackVerificationMilliseconds ?? LIVE_FALLBACK_VERIFICATION_MS;
    if (!safeInteger(liveFallbackVerificationMilliseconds, false)) {
      throw new TypeError('Invalid Live Changes fallback interval');
    }
    this.#liveFallbackVerificationMilliseconds = liveFallbackVerificationMilliseconds;
    const liveBackgroundFallbackVerificationMilliseconds =
      options.liveBackgroundFallbackVerificationMilliseconds ?? LIVE_BACKGROUND_FALLBACK_VERIFICATION_MS;
    if (!safeInteger(liveBackgroundFallbackVerificationMilliseconds, false)) {
      throw new TypeError('Invalid Live Changes background fallback interval');
    }
    this.#liveBackgroundFallbackVerificationMilliseconds = liveBackgroundFallbackVerificationMilliseconds;
    this.#onSnapshotEvidenceIdentityCacheSize = options.onSnapshotEvidenceIdentityCacheSize;
    this.#onLiveChangesCapture = options.onLiveChangesCapture;
  }

  async read<Request extends WorkspaceProjectionViewRequest>(
    input: Request,
  ): Promise<WorkspaceProjectionViewFor<Request>> {
    const request = normalizeRequest(input);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const view = await this.#readOnce(request);
        const final = await this.#state.read({
          recordIdentities: [],
          includeContent: false,
        });
        if (final.stateVersion !== view.stateVersion) {
          throw new ProjectionVersionChanged();
        }
        return deepFreeze(view) as WorkspaceProjectionViewFor<Request>;
      } catch (error) {
        if (error instanceof ProjectionVersionChanged) continue;
        throw error;
      }
    }
    throw new ProjectionRecordsInvalid();
  }

  subscribe(
    scope: WorkspaceProjectionViewScope,
    onUpdate: (update: WorkspaceProjectionViewUpdate) => void,
  ): () => void {
    normalizeRequest(scope);
    const subscription: ProjectionSubscription = {
      scope,
      onUpdate,
      active: true,
      scheduled: false,
      refreshRequested: false,
      lastDeliveredVersion: -1,
      lastDeliveredLiveIdentity: undefined,
    };
    this.#subscriptions.add(subscription);
    if (isLive(scope)) this.#startLiveInvalidation();
    queueMicrotask(() => this.#schedule(subscription));
    return (): void => {
      subscription.active = false;
      this.#subscriptions.delete(subscription);
      this.#stopLiveInvalidationWhenUnused();
    };
  }

  /**
   * Paces the fallback working-tree check. Coming back to the foreground
   * checks at once, so a change the watcher missed shows when someone looks.
   */
  setAttention(attention: WorkspaceAttention): void {
    if (attention === this.#attention) return;
    this.#attention = attention;
    if (this.#liveFallbackTimer === undefined) return;
    this.#startLiveFallbackTimer();
    if (attention === 'foreground') {
      this.#liveGeneration += 1;
      this.#scheduleLiveSubscriptions();
    }
  }

  publishCommittedVersion(_stateVersion: number): void {
    this.#snapshotStatusReads.clear();
    this.#liveGeneration += 1;
    for (const subscription of [...this.#subscriptions]) {
      this.#schedule(subscription);
    }
  }

  #schedule(subscription: ProjectionSubscription): void {
    if (!subscription.active) return;
    if (subscription.scheduled) {
      subscription.refreshRequested = true;
      return;
    }
    subscription.scheduled = true;
    void this.read(subscription.scope)
      .then(update => {
        if (!subscription.active) return;
        const liveIdentity = isLive(update)
          ? update.status === 'available'
            ? update.liveChangesIdentity
            : `${update.status}:${update.reason}`
          : undefined;
        if (
          update.stateVersion <= subscription.lastDeliveredVersion &&
          liveIdentity === subscription.lastDeliveredLiveIdentity
        ) {
          return;
        }
        subscription.lastDeliveredVersion = update.stateVersion;
        subscription.lastDeliveredLiveIdentity = liveIdentity;
        this.#deliver(subscription, update);
      })
      .catch(async (error: unknown) => {
        if (
          !subscription.active ||
          subscription.lastDeliveredLiveIdentity === 'records-invalid' ||
          !permanentProjectionRecordFailure(error)
        ) {
          return;
        }
        const current = await this.#state.read({
          recordIdentities: [],
          includeContent: false,
        });
        if (!subscription.active) return;
        subscription.lastDeliveredVersion = Math.max(subscription.lastDeliveredVersion, current.stateVersion);
        subscription.lastDeliveredLiveIdentity = 'records-invalid';
        this.#deliver(subscription, {
          kind: 'workspace.projection-failed',
          status: 'failed',
          projectionVersion: WORKSPACE_PROJECTION_VERSION,
          stateVersion: current.stateVersion,
          scope: subscription.scope,
          reason: 'records-invalid',
        });
      })
      .finally(() => {
        subscription.scheduled = false;
        if (subscription.refreshRequested && subscription.active) {
          subscription.refreshRequested = false;
          this.#schedule(subscription);
        }
      })
      .catch(() => undefined);
  }

  #deliver(subscription: ProjectionSubscription, update: WorkspaceProjectionViewUpdate): void {
    try {
      subscription.onUpdate(update);
    } catch {
      // Subscriber code is outside Projection truth and cannot reclassify a
      // verified update or durable-record failure.
    }
  }

  #startLiveInvalidation(): void {
    if (this.#liveFallbackTimer !== undefined) return;
    this.#unsubscribeFromEvidenceInvalidation = this.#subscribeToEvidenceInvalidation?.(() => {
      this.#queueLiveInvalidation();
    });
    this.#startLiveFallbackTimer();
  }

  #startLiveFallbackTimer(): void {
    if (this.#liveFallbackTimer !== undefined) clearInterval(this.#liveFallbackTimer);
    this.#liveFallbackTimer = setInterval(
      () => {
        this.#liveGeneration += 1;
        this.#scheduleLiveSubscriptions();
      },
      this.#attention === 'foreground'
        ? this.#liveFallbackVerificationMilliseconds
        : this.#liveBackgroundFallbackVerificationMilliseconds,
    );
    this.#liveFallbackTimer.unref();
  }

  #queueLiveInvalidation(): void {
    // A change makes any earlier check stale at once, even before the debounce fires.
    this.#liveGeneration += 1;
    if (this.#liveInvalidationTimer !== undefined) return;
    this.#liveInvalidationTimer = setTimeout(() => {
      this.#liveInvalidationTimer = undefined;
      this.#scheduleLiveSubscriptions();
    }, LIVE_INVALIDATION_DEBOUNCE_MS);
    this.#liveInvalidationTimer.unref();
  }

  #scheduleLiveSubscriptions(): void {
    for (const subscription of this.#subscriptions) {
      if (isLive(subscription.scope)) this.#schedule(subscription);
    }
  }

  #stopLiveInvalidationWhenUnused(): void {
    if ([...this.#subscriptions].some(subscription => isLive(subscription.scope))) {
      return;
    }
    this.#unsubscribeFromEvidenceInvalidation?.();
    this.#unsubscribeFromEvidenceInvalidation = undefined;
    if (this.#liveFallbackTimer !== undefined) {
      clearInterval(this.#liveFallbackTimer);
      this.#liveFallbackTimer = undefined;
    }
    if (this.#liveInvalidationTimer !== undefined) {
      clearTimeout(this.#liveInvalidationTimer);
      this.#liveInvalidationTimer = undefined;
    }
  }

  async #readOnce(request: WorkspaceProjectionViewRequest): Promise<WorkspaceProjectionView> {
    if (request.kind === 'review.command-result') {
      return await this.#commandResult(request);
    }
    const index = await this.#loadIndex();
    const entry =
      request.kind === 'workspace.home' ||
      request.kind === 'review.comparison-preview' ||
      request.kind === 'review.commit-graph'
        ? undefined
        : index.payload.reviews.find(candidate => candidate.reviewIdentity === request.reviewIdentity);
    switch (request.kind) {
      case 'workspace.home':
        return await this.#home(request, index);
      case 'review.comparison-preview':
        return await this.#comparisonPreview(request, index);
      case 'review.commit-graph':
        return await this.#commitGraph(index);
      case 'review.context-contribution-content':
        return await this.#contextContributionContent(request, index, entry);
      case 'review.context-selection':
        return await this.#contextSelection(request, index, entry);
      case 'review.snapshot-context':
        return await this.#snapshotContext(request, index, entry);
      case 'review.snapshot-context-content':
        return await this.#snapshotContextContent(request, index, entry);
      case 'review.manifest':
        return await this.#manifest(request, index, entry);
      case 'review.diff':
        return await this.#diff(request, index, entry);
      case 'review.live-manifest':
        return await this.#liveManifest(request, index, entry);
      case 'review.live-files':
        return await this.#liveFiles(request, index, entry);
      case 'review.live-file-content':
        return await this.#liveFileContent(request, index, entry);
      case 'review.continuation':
        return await this.#continuation(request, index, entry);
      case 'review.live-diff':
        return await this.#liveDiff(request, index, entry);
      case 'review.versions':
        return await this.#versions(request, index, entry);
      case 'review.bases':
        return await this.#bases(request, index, entry);
      case 'review.messages':
        return await this.#messages(request, index, entry);
      case 'review.message-origin':
        return await this.#messageOrigin(request, index, entry);
      case 'review.message-body':
        return await this.#messageBody(request, index, entry);
      case 'review.history':
        return await this.#history(request, index, entry);
      case 'review.step-changes':
        return await this.#stepChanges(request, index, entry);
      case 'review.step-changes-diff':
        return await this.#stepChangesDiff(request, index, entry);
      case 'review.search':
        return await this.#search(request, index, entry);
      case 'review.search-preview':
        return await this.#searchPreview(request, index, entry);
      case 'review.questions':
        return await this.#questions(request, index, entry);
      case 'review.question-location':
        return await this.#questionLocation(request, index, entry);
      case 'review.question-body':
        return await this.#questionBody(request, index, entry);
    }
  }

  async #loadIndex(): Promise<LoadedIndex> {
    const read = await this.#state.read({
      recordIdentities: [indexIdentity(this.#workspaceIdentity)],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    const record = read.records[0];
    if (record === undefined) {
      return {
        stateVersion: read.stateVersion,
        payload: { formatVersion: 1, reviews: [] },
      };
    }
    if (record.kind !== 'review.index' || record.recordClass !== 'revisioned' || record.schemaVersion !== 1) {
      throw new ProjectionRecordsInvalid();
    }
    return {
      stateVersion: read.stateVersion,
      payload: parseReviewIndex(decodeReviewingPayload(record.payload)),
    };
  }

  async #readRecords(identities: readonly string[], stateVersion: number): Promise<readonly StateRecord[]> {
    if (identities.length === 0) return [];
    const read = await this.#state.read({
      recordIdentities: identities,
      includeContent: false,
    });
    if (read.stateVersion !== stateVersion) throw new ProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    return read.records.map(record => {
      if (record === undefined) throw new ProjectionRecordsInvalid();
      return record;
    });
  }

  async #readOptionalRecords(
    identities: readonly string[],
    stateVersion: number,
  ): Promise<readonly (StateRecord | undefined)[]> {
    if (identities.length === 0) return [];
    const read = await this.#state.read({
      recordIdentities: identities,
      includeContent: false,
    });
    if (read.stateVersion !== stateVersion) throw new ProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    return read.records;
  }

  #parseContextContributionRecord(
    record: StateRecord,
    reviewIdentity: ReviewIdentity,
    contributionIdentity: ReviewContextContributionIdentity,
  ): ReviewContextContributionPayload {
    if (
      record.kind !== 'review.context-contribution' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== contributionIdentity ||
      record.workflowIdentity !== reviewIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const contribution = parseReviewContextContribution(decodeReviewingPayload(record.payload));
    if (
      contribution.reviewIdentity !== reviewIdentity ||
      contribution.contributionIdentity !== contributionIdentity ||
      (contribution.content.status === 'available'
        ? record.content.length !== 1 ||
          record.content[0]?.role !== 'content' ||
          record.content[0].digest !== contribution.content.sha256
        : record.content.length !== 0)
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return contribution;
  }

  #contextContributionConflicts(
    candidates: readonly ReviewContextSelectionCandidate[],
    contributions: readonly ReviewContextSelectionContribution[],
  ): readonly ContextSourceOccurrenceConflict[] {
    const conflicts: ContextSourceOccurrenceConflict[] = [];
    for (const selected of contributions) {
      const contribution = selected.contribution;
      if (
        contribution.kind !== 'editor' ||
        contribution.editor.savedState !== 'unsaved' ||
        contribution.source.kind === 'editor-buffer'
      ) {
        continue;
      }
      const source = contribution.source;
      const candidate = candidates.find(item => {
        if (item.decision.status !== 'included') return false;
        return source.kind === 'workspace'
          ? item.pathBytesBase64 === source.pathBytesBase64
          : item.absolutePath === source.absolutePath;
      });
      if (candidate === undefined) continue;
      conflicts.push({
        kind: 'saved-versus-unsaved',
        nominalSource:
          source.kind === 'workspace'
            ? { kind: 'workspace', pathBytesBase64: source.pathBytesBase64 }
            : { kind: 'outside-checkout', absolutePath: source.absolutePath },
        liveOccurrence: {
          kind: 'context-locator',
          origins: candidate.origins,
        },
        immutableOccurrence: {
          kind: 'editor-context-contribution',
          occurrenceIdentity: contribution.contributionIdentity,
          ruleIdentity: selected.ruleIdentity,
          sourceGroupOrder: selected.order,
          scope: contribution.scope,
        },
        resolution: 'keep-distinct',
      });
    }
    return conflicts;
  }

  async #contextSelection(
    request: ReviewContextSelectionViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewContextSelectionView> {
    if (entry === undefined) {
      return {
        kind: 'review.context-selection',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const selectionIdentity = reviewContextSelectionIdentity(entry.reviewIdentity);
    const [record] = await this.#readOptionalRecords([selectionIdentity], index.stateVersion);
    let selection = emptyReviewContextSelection(entry.reviewIdentity);
    let selectionRevision = 0;
    if (record !== undefined) {
      if (
        record.kind !== 'review.context-selection' ||
        record.recordClass !== 'revisioned' ||
        record.schemaVersion !== 1 ||
        record.recordIdentity !== selectionIdentity ||
        record.workflowIdentity !== entry.reviewIdentity
      ) {
        throw new ProjectionRecordsInvalid();
      }
      selection = parseReviewContextSelection(decodeReviewingPayload(record.payload));
      selectionRevision = record.revision;
      if (selection.reviewIdentity !== entry.reviewIdentity || selection.selectionIdentity !== selectionIdentity) {
        throw new ProjectionRecordsInvalid();
      }
    }
    const includeRules = selection.rules.filter(
      (rule): rule is Extract<ReviewContextRule, { readonly action: 'include' }> => rule.action === 'include',
    );
    const contributionRules = selection.rules
      .map((rule, order) => ({ rule, order }))
      .filter(
        (
          item,
        ): item is {
          readonly rule: Extract<ReviewContextRule, { readonly action: 'contribute' }>;
          readonly order: number;
        } => item.rule.action === 'contribute',
      );
    const contributionRecords = await this.#readOptionalRecords(
      contributionRules.map(item => item.rule.contributionIdentity),
      index.stateVersion,
    );
    const contributions = contributionRules.map((item, index_) => {
      const contributionRecord = contributionRecords[index_];
      if (contributionRecord === undefined) throw new ProjectionRecordsInvalid();
      return {
        order: item.order,
        ruleIdentity: item.rule.ruleIdentity,
        contribution: this.#parseContextContributionRecord(
          contributionRecord,
          entry.reviewIdentity,
          item.rule.contributionIdentity,
        ),
      };
    });
    const sourceGroups: ReviewContextSelectionSourceGroup[] = [];
    let origin = 0;
    for (const [order, rule] of selection.rules.entries()) {
      if (rule.action === 'include') {
        sourceGroups.push({ kind: 'locator', order, origin, ruleIdentity: rule.ruleIdentity });
        origin += 1;
      } else if (rule.action === 'contribute') {
        sourceGroups.push({
          kind: 'contribution',
          order,
          ruleIdentity: rule.ruleIdentity,
          contributionIdentity: rule.contributionIdentity,
        });
      }
    }
    if (includeRules.length === 0) {
      return {
        kind: 'review.context-selection',
        status: 'available',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        selectionIdentity,
        selectionRevision,
        rules: selection.rules,
        sourceGroups,
        contributions,
        conflicts: [],
        defaultIgnoredUntracked: 'excluded',
        manifest: {
          status: 'complete',
          totalCandidates: 0,
          offset: request.offset,
          candidates: [],
          nextOffset: null,
        },
      };
    }
    const manifest = await this.#evidence.read({
      kind: 'workspace.context.manifest',
      selections: includeRules.map(reviewContextEvidenceSelection),
      offset: request.offset,
      limit: request.limit,
    });
    const candidates = manifest.candidates.map(candidate => ({
      ...candidate,
      decision: decideReviewContextCandidate(selection.rules, includeRules, candidate),
    }));
    return {
      kind: 'review.context-selection',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      selectionIdentity,
      selectionRevision,
      rules: selection.rules,
      sourceGroups,
      contributions,
      conflicts: this.#contextContributionConflicts(candidates, contributions),
      defaultIgnoredUntracked: 'excluded',
      manifest: {
        status: manifest.status,
        ...(manifest.incompleteReason === undefined ? {} : { incompleteReason: manifest.incompleteReason }),
        totalCandidates: manifest.totalCandidates,
        offset: manifest.offset,
        candidates,
        nextOffset: manifest.nextOffset,
      },
    };
  }

  async #contextContributionContent(
    request: ReviewContextContributionContentViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewContextContributionContentView> {
    if (entry === undefined) {
      return {
        kind: 'review.context-contribution-content',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        contributionIdentity: request.contributionIdentity,
      };
    }
    const [record] = await this.#readOptionalRecords([request.contributionIdentity], index.stateVersion);
    if (record === undefined) {
      return {
        kind: 'review.context-contribution-content',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        contributionIdentity: request.contributionIdentity,
      };
    }
    const contribution = this.#parseContextContributionRecord(
      record,
      entry.reviewIdentity,
      request.contributionIdentity,
    );
    if (contribution.content.status === 'unavailable') {
      return {
        kind: 'review.context-contribution-content',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        contributionIdentity: request.contributionIdentity,
        contribution,
        reason: contribution.content.reason,
      };
    }
    const content = await this.#state.readContent({
      windows: [
        {
          recordIdentity: request.contributionIdentity,
          role: 'content',
          offset: request.offset,
          length: request.length,
        },
      ],
    });
    if (content.stateVersion !== index.stateVersion) throw new ProjectionVersionChanged();
    if (content.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    const [window] = content.windows;
    if (
      window === undefined ||
      window.status !== 'available' ||
      window.recordIdentity !== request.contributionIdentity ||
      window.role !== 'content' ||
      window.offset !== request.offset ||
      window.totalByteLength !== contribution.content.byteLength ||
      window.digest !== contribution.content.sha256 ||
      window.byteLength !== window.bytes.byteLength
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return {
      kind: 'review.context-contribution-content',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      contributionIdentity: request.contributionIdentity,
      contribution,
      window: {
        offset: window.offset,
        bytesBase64: encodeBytesBase64(window.bytes),
        byteLength: window.byteLength,
        totalByteLength: window.totalByteLength,
        complete: window.complete,
      },
    };
  }

  async #snapshotContext(
    request: ReviewSnapshotContextViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewSnapshotContextView> {
    if (entry === undefined) {
      return {
        kind: 'review.snapshot-context',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const selectedEntry = await this.#selectedSnapshotEntry(entry, request.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) {
      return {
        kind: 'review.snapshot-context',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const snapshot = await this.#snapshot(selectedEntry, index.stateVersion);
    if (snapshot.context === undefined) {
      return {
        kind: 'review.snapshot-context',
        status: 'available',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        reviewSnapshotIdentity: selectedEntry.reviewSnapshotIdentity,
        basis: {
          status: 'empty',
          selectionIdentity: reviewContextSelectionIdentity(entry.reviewIdentity),
          selectionRevision: 0,
          rules: [],
          defaultIgnoredUntracked: 'excluded',
        },
        manifest: {
          totalItems: 0,
          identity: null,
          offset: request.offset,
          items: [],
          nextOffset: null,
        },
      };
    }
    const context = snapshot.context;
    const end = Math.min(request.offset + request.limit, context.manifest.totalItems);
    const items: ReviewSnapshotContextItem[] = [];
    if (request.offset < end) {
      const firstWindow = Math.floor(request.offset / REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS);
      const lastWindow = Math.floor((end - 1) / REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS);
      const identities: string[] = [];
      for (let window = firstWindow; window <= lastWindow; window += 1) {
        identities.push(reviewSnapshotContextManifestWindowIdentity(selectedEntry.reviewSnapshotIdentity, window));
      }
      const records = await this.#readRecords(identities, index.stateVersion);
      const expanded: ReviewSnapshotContextItem[] = [];
      records.forEach((record, index_) => {
        if (
          record.kind !== 'review.snapshot-context-manifest-window' ||
          record.recordClass !== 'immutable' ||
          record.schemaVersion !== 1 ||
          record.recordIdentity !== identities[index_] ||
          record.workflowIdentity !== entry.reviewIdentity
        ) {
          throw new ProjectionRecordsInvalid();
        }
        const payload = parseReviewSnapshotContextManifestWindow(decodeReviewingPayload(record.payload));
        const expectedOffset = (firstWindow + index_) * REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS;
        if (
          payload.reviewIdentity !== entry.reviewIdentity ||
          payload.reviewSnapshotIdentity !== selectedEntry.reviewSnapshotIdentity ||
          payload.contextIdentity !== context.contextIdentity ||
          payload.offset !== expectedOffset
        ) {
          throw new ProjectionRecordsInvalid();
        }
        expanded.push(...payload.items);
      });
      const relativeOffset = request.offset - firstWindow * REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS;
      items.push(...expanded.slice(relativeOffset, relativeOffset + request.limit));
    }
    const next = request.offset + items.length;
    return {
      kind: 'review.snapshot-context',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: selectedEntry.reviewSnapshotIdentity,
      basis: { status: 'frozen', context },
      manifest: {
        totalItems: context.manifest.totalItems,
        identity: context.manifest.digest.value,
        offset: request.offset,
        items,
        nextOffset: next < context.manifest.totalItems ? next : null,
      },
    };
  }

  async #snapshotContextContent(
    request: ReviewSnapshotContextContentViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewSnapshotContextContentView> {
    const notFound = (reviewSnapshotIdentity?: ReviewSnapshotIdentity): ReviewSnapshotContextContentView => ({
      kind: 'review.snapshot-context-content',
      status: 'not-found',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      ...(reviewSnapshotIdentity === undefined ? {} : { reviewSnapshotIdentity }),
      contentIdentity: request.contentIdentity,
    });
    if (entry === undefined) return notFound();
    const selectedEntry = await this.#selectedSnapshotEntry(entry, request.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) return notFound();
    const snapshot = await this.#snapshot(selectedEntry, index.stateVersion);
    if (snapshot.context === undefined) {
      return {
        kind: 'review.snapshot-context-content',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        reviewSnapshotIdentity: selectedEntry.reviewSnapshotIdentity,
        contentIdentity: request.contentIdentity,
        reason: 'context-empty',
      };
    }
    const [record] = await this.#readOptionalRecords([request.contentIdentity], index.stateVersion);
    if (record === undefined) return notFound(selectedEntry.reviewSnapshotIdentity);
    if (
      record.kind !== 'review.snapshot-context-content' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== request.contentIdentity ||
      record.workflowIdentity !== entry.reviewIdentity ||
      record.content.length !== 1 ||
      record.content[0]?.role !== 'content'
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const content = parseReviewSnapshotContextContent(decodeReviewingPayload(record.payload));
    if (
      content.reviewIdentity !== entry.reviewIdentity ||
      content.reviewSnapshotIdentity !== selectedEntry.reviewSnapshotIdentity ||
      content.contextIdentity !== snapshot.context.contextIdentity ||
      content.contentIdentity !== request.contentIdentity ||
      content.itemOrder >= snapshot.context.manifest.totalItems ||
      record.content[0].digest !== content.sha256
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const read = await this.#state.readContent({
      windows: [
        {
          recordIdentity: request.contentIdentity,
          role: 'content',
          offset: request.offset,
          length: request.length,
        },
      ],
    });
    if (read.stateVersion !== index.stateVersion) throw new ProjectionVersionChanged();
    if (read.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    const window = read.windows[0];
    if (
      window === undefined ||
      window.status !== 'available' ||
      window.recordIdentity !== request.contentIdentity ||
      window.role !== 'content' ||
      window.offset !== request.offset ||
      window.totalByteLength !== content.byteLength ||
      window.digest !== content.sha256 ||
      window.byteLength !== window.bytes.byteLength
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return {
      kind: 'review.snapshot-context-content',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: selectedEntry.reviewSnapshotIdentity,
      content,
      window: {
        offset: window.offset,
        bytesBase64: encodeBytesBase64(window.bytes),
        byteLength: window.byteLength,
        totalByteLength: window.totalByteLength,
        complete: window.complete,
      },
    };
  }

  async #snapshot(entry: ReviewIndexEntry, stateVersion: number): Promise<ReviewSnapshotPayload> {
    const [record] = await this.#readRecords([entry.reviewSnapshotIdentity], stateVersion);
    if (record === undefined || record.kind !== 'review.snapshot' || record.recordClass !== 'immutable') {
      throw new ProjectionRecordsInvalid();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
    if (
      snapshot.reviewIdentity !== entry.reviewIdentity ||
      snapshot.reviewPassIdentity !== entry.reviewPassIdentity ||
      snapshot.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return snapshot;
  }

  async #snapshotStatus(snapshot: ReviewSnapshotPayload): Promise<{
    readonly status: ReviewProjectionHeader['snapshotStatus'];
    readonly contextStatus: ReviewProjectionHeader['contextStatus'];
  }> {
    const existing = this.#snapshotStatusReads.get(snapshot.reviewSnapshotIdentity);
    if (existing !== undefined) return await existing;
    const read = this.#readSnapshotStatus(snapshot);
    this.#snapshotStatusReads.set(snapshot.reviewSnapshotIdentity, read);
    try {
      return await read;
    } finally {
      if (this.#snapshotStatusReads.get(snapshot.reviewSnapshotIdentity) === read) {
        this.#snapshotStatusReads.delete(snapshot.reviewSnapshotIdentity);
      }
    }
  }

  async #readSnapshotStatus(snapshot: ReviewSnapshotPayload): Promise<{
    readonly status: ReviewProjectionHeader['snapshotStatus'];
    readonly contextStatus: ReviewProjectionHeader['contextStatus'];
  }> {
    const comparison: ReviewProjectionHeader['snapshotStatus'] =
      snapshot.comparison === undefined
        ? await (async () => {
            const evidenceIdentity =
              this.#snapshotEvidenceIdentities.get(snapshot.reviewSnapshotIdentity) ?? snapshot.sourceEvidenceIdentity;
            if (evidenceIdentity !== undefined) {
              const retained = await this.#evidence.read({
                kind: 'workspace.current-changes.verify',
                evidenceIdentity,
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
            const matches =
              JSON.stringify(capture.basis) === JSON.stringify(snapshot.basis) &&
              JSON.stringify(capture.comparedState) === JSON.stringify(snapshot.comparedState) &&
              JSON.stringify(capture.manifest) === JSON.stringify(snapshot.manifest);
            if (matches) {
              this.#rememberSnapshotEvidenceIdentity(snapshot.reviewSnapshotIdentity, capture.evidenceIdentity);
            }
            return matches ? 'current' : 'stale';
          })()
        : await this.#snapshotTransition.verifyPersistedComparison(snapshot);
    // One owner-derived context verdict; Projection never composes its own checks.
    const contextStatus = (await this.#snapshotTransition.verifyPersistedContext(snapshot)).verdict;
    const status =
      comparison === 'unverified' || contextStatus === 'unverified'
        ? 'unverified'
        : comparison === 'stale' || contextStatus === 'stale'
          ? 'stale'
          : 'current';
    return { status, contextStatus };
  }

  #rememberSnapshotEvidenceIdentity(reviewSnapshotIdentity: string, evidenceIdentity: string): void {
    this.#snapshotEvidenceIdentities.set(reviewSnapshotIdentity, evidenceIdentity);
    while (this.#snapshotEvidenceIdentities.size > MAX_SNAPSHOT_EVIDENCE_IDENTITIES) {
      const oldest = this.#snapshotEvidenceIdentities.keys().next().value;
      if (oldest === undefined) break;
      this.#snapshotEvidenceIdentities.delete(oldest);
    }
    this.#onSnapshotEvidenceIdentityCacheSize?.(this.#snapshotEvidenceIdentities.size);
  }

  #header(
    entry: ReviewIndexEntry,
    snapshotStatus: ReviewProjectionHeader['snapshotStatus'],
    snapshot: ReviewSnapshotPayload,
    currentReviewIdentity: ReviewIdentity | undefined,
    contextStatus: ReviewProjectionHeader['contextStatus'],
  ): ReviewProjectionHeader {
    const versionIndex = entry.reviewSnapshotIdentities.indexOf(entry.reviewSnapshotIdentity);
    const latestReviewSnapshotIdentity = entry.reviewSnapshotIdentities.at(-1);
    if (latestReviewSnapshotIdentity === undefined) throw new ProjectionRecordsInvalid();
    const endpointLabel = (
      endpoint: ReviewSnapshotPayload['basis'] | ReviewSnapshotPayload['comparedState'],
    ): string =>
      endpoint.kind === 'commit'
        ? `${endpoint.abbreviatedObjectIdentity} ${endpoint.subject}`.trim()
        : endpoint.kind === 'tree'
          ? `${endpoint.abbreviatedObjectIdentity} tree`
          : endpoint.kind === 'empty-tree'
            ? 'Root parent'
            : endpoint.kind === 'effective-working-state'
              ? 'Working state'
              : endpoint.kind === 'working-tree'
                ? 'Working tree'
                : endpoint.kind === 'index'
                  ? 'Index'
                  : 'HEAD';
    return {
      title: snapshot.comparison === undefined ? 'Review current changes' : 'Review selected changes',
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      latestReviewSnapshotIdentity,
      ...(versionIndex < 0
        ? {}
        : {
            version: {
              ordinal: versionIndex + 1,
              total: entry.reviewSnapshotIdentities.length,
              isLatest: entry.reviewSnapshotIdentity === latestReviewSnapshotIdentity,
            },
          }),
      retention: entry.reviewIdentity === currentReviewIdentity ? 'current' : 'previous',
      ...(entry.continuedFromReviewIdentity === undefined
        ? {}
        : { continuedFromReviewIdentity: entry.continuedFromReviewIdentity }),
      ...(entry.status === 'completed' || entry.status === 'cancelled' ? { historicalOutcome: entry.status } : {}),
      snapshotStatus,
      contextStatus,
      ...(snapshot.comparison === undefined
        ? {}
        : {
            comparison: {
              basis: endpointLabel(snapshot.basis),
              compared: endpointLabel(snapshot.comparedState),
              ...(snapshot.comparison.scope === undefined
                ? {}
                : {
                    scope: {
                      kind: 'exact-paths' as const,
                      entries: snapshot.comparison.scope.entries,
                    },
                  }),
            },
          }),
    };
  }

  async #home(request: WorkspaceHomeViewRequest, index: LoadedIndex): Promise<WorkspaceHomeView> {
    const current = index.payload.reviews.find(entry => entry.reviewIdentity === index.payload.currentReviewIdentity);
    const pastReviews = index.payload.reviews
      .filter(entry => entry.reviewIdentity !== index.payload.currentReviewIdentity)
      .reverse();
    const selected = pastReviews.slice(request.offset, request.offset + request.limit);
    const snapshotEntries = [...selected, ...(current === undefined ? [] : [current])];
    const snapshots = await this.#readRecords(
      snapshotEntries.map(entry => entry.reviewSnapshotIdentity),
      index.stateVersion,
    );
    const projected = snapshotEntries.map((entry, offset) => {
      const record = snapshots[offset];
      if (record?.kind !== 'review.snapshot') throw new ProjectionRecordsInvalid();
      const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
      if (snapshot.reviewIdentity !== entry.reviewIdentity) {
        throw new ProjectionRecordsInvalid();
      }
      return homeItem(entry, snapshot.manifest.totalFiles, index.payload.currentReviewIdentity);
    });
    const items = projected.slice(0, selected.length);
    const currentReview = current === undefined ? undefined : projected[selected.length];
    const startBlockers: ReviewProjectedBlocker[] = [];
    if (index.payload.reviews.length >= MAX_REVIEWS) {
      startBlockers.push(blocker('review-capacity-reached', [], 'none'));
    }
    const next = request.offset + items.length;
    return {
      kind: 'workspace.home',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      header: {
        title: 'Home',
        totalReviews: index.payload.reviews.length,
        totalPastReviews: pastReviews.length,
        ...(current === undefined ? {} : { currentReviewIdentity: current.reviewIdentity }),
      },
      ...(currentReview === undefined ? {} : { currentReview }),
      reviews: {
        offset: request.offset,
        items,
        nextOffset: next < pastReviews.length ? next : null,
      },
      actions: [projectedAction('review.current-changes.start', index.stateVersion, undefined, startBlockers)],
    };
  }

  async #comparisonPreview(
    request: ReviewComparisonPreviewViewRequest,
    index: LoadedIndex,
  ): Promise<ReviewComparisonPreviewView> {
    const inspection = await this.#evidence.inspectReviewComparison(request.selection);
    if (inspection.status !== 'available') {
      return {
        kind: 'review.comparison-preview',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        selection: inspection.selection,
        reason: inspection.reason,
      };
    }
    const blockers: ReviewProjectedBlocker[] = [];
    if (index.payload.reviews.length >= MAX_REVIEWS) {
      blockers.push(blocker('review-capacity-reached', [], 'none'));
    }
    if (inspection.totalFiles === 0) {
      blockers.push(blocker('comparison-has-no-changes', [], 'choose-comparison'));
    }
    const basisIdentity = reviewComparisonEndpointIdentity(inspection.basis);
    const comparedIdentity = reviewComparisonEndpointIdentity(inspection.comparedState);
    if (comparedIdentity === null) throw new ProjectionRecordsInvalid();
    return {
      kind: 'review.comparison-preview',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      selection: inspection.selection,
      basis: inspection.basis,
      comparedState: inspection.comparedState,
      basisEndpointIdentity: basisIdentity,
      comparedEndpointIdentity: comparedIdentity,
      ...(inspection.comparisonResolutionIdentity === undefined
        ? {}
        : {
            comparisonResolutionIdentity: inspection.comparisonResolutionIdentity,
          }),
      totalFiles: inspection.totalFiles,
      action: projectedAction(
        'review.comparison.start',
        index.stateVersion,
        undefined,
        blockers,
        inspection.comparisonResolutionIdentity === undefined ? [] : [inspection.comparisonResolutionIdentity],
      ),
    };
  }

  async #commitGraph(index: LoadedIndex): Promise<ReviewCommitGraphView> {
    const graph = await this.#evidence.readReviewCommitGraph(500);
    if (graph.status !== 'available') {
      return {
        kind: 'review.commit-graph',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reason: graph.reason,
      };
    }
    return {
      kind: 'review.commit-graph',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      headObjectIdentity: graph.headObjectIdentity,
      rows: graph.rows,
      truncated: graph.truncated,
    };
  }

  async #selectedSnapshotEntry(
    entry: ReviewIndexEntry,
    reviewSnapshotIdentity: ReviewSnapshotIdentity | undefined,
    stateVersion: number,
  ): Promise<ReviewIndexEntry | undefined> {
    if (reviewSnapshotIdentity === undefined) return entry;
    if (!entry.reviewSnapshotIdentities.includes(reviewSnapshotIdentity)) {
      const tree = await this.#basisPayloads(entry, stateVersion);
      const capturedByBasis = tree.payloads.some(
        basis => basis.kind !== 'live' && basis.reviewSnapshotIdentity === reviewSnapshotIdentity,
      );
      if (!capturedByBasis) return undefined;
    }
    return {
      ...entry,
      reviewSnapshotIdentity,
    };
  }

  async #manifest(
    request: ReviewManifestViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewManifestView> {
    if (entry === undefined) {
      return {
        kind: 'review.manifest',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const selectedEntry = await this.#selectedSnapshotEntry(entry, request.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) {
      return {
        kind: 'review.manifest',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const snapshot = await this.#snapshot(selectedEntry, index.stateVersion);
    const files = await this.#manifestFiles(selectedEntry, snapshot, request.offset, request.limit, index.stateVersion);
    if (files.some(file => !fileMatchesComparisonScope(file, snapshot.comparison))) {
      throw new ProjectionRecordsInvalid();
    }
    const { status: snapshotStatus, contextStatus } = await this.#snapshotStatus(snapshot);
    const current = new Map(entry.currentDispositions.map(item => [item.questionIdentity, item]));
    const next = request.offset + files.length;
    return {
      kind: 'review.manifest',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      header: this.#header(selectedEntry, snapshotStatus, snapshot, index.payload.currentReviewIdentity, contextStatus),
      manifest: {
        totalFiles: snapshot.manifest.totalFiles,
        identity: snapshot.manifest.digest.value,
        offset: request.offset,
        files: files.map(projectedFile),
        nextOffset: next < snapshot.manifest.totalFiles ? next : null,
      },
      questions: {
        openDrafts: entry.openDraftIdentities.length,
        total: entry.questionIdentities.length,
        needingJudgment: entry.questionIdentities.filter(identity => !current.has(identity)).length,
        open: entry.questionIdentities.filter(identity => current.get(identity)?.disposition === 'open').length,
      },
      actions:
        selectedEntry.reviewSnapshotIdentity === entry.reviewSnapshotIdentity
          ? reviewActions(entry, index.stateVersion, snapshotStatus)
          : [],
    };
  }

  async #manifestFiles(
    entry: ReviewIndexEntry,
    snapshot: ReviewSnapshotPayload,
    offset: number,
    limit: number,
    stateVersion: number,
  ): Promise<readonly CurrentChangedFile[]> {
    if (offset >= snapshot.manifest.totalFiles) return [];
    const end = Math.min(offset + limit, snapshot.manifest.totalFiles);
    const firstWindow = Math.floor(offset / REVIEW_MANIFEST_WINDOW_FILES);
    const lastWindow = Math.floor((end - 1) / REVIEW_MANIFEST_WINDOW_FILES);
    const identities: string[] = [];
    for (let window = firstWindow; window <= lastWindow; window += 1) {
      identities.push(manifestWindowIdentity(entry.reviewSnapshotIdentity, window));
    }
    const records = await this.#readRecords(identities, stateVersion);
    const all: CurrentChangedFile[] = [];
    records.forEach((record, index) => {
      if (record.kind !== 'review.snapshot-manifest-window') {
        throw new ProjectionRecordsInvalid();
      }
      const payload = parseReviewManifestWindow(decodeReviewingPayload(record.payload));
      const expectedOffset = (firstWindow + index) * REVIEW_MANIFEST_WINDOW_FILES;
      if (
        payload.reviewIdentity !== entry.reviewIdentity ||
        payload.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        payload.offset !== expectedOffset
      ) {
        throw new ProjectionRecordsInvalid();
      }
      all.push(...payload.files);
    });
    const relativeOffset = offset - firstWindow * REVIEW_MANIFEST_WINDOW_FILES;
    return all.slice(relativeOffset, relativeOffset + limit);
  }

  async #versions(
    request: ReviewVersionsViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewVersionsView> {
    if (entry === undefined) {
      return {
        kind: 'review.versions',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const newestFirst = [...entry.reviewSnapshotIdentities].reverse();
    const selectedIdentities = newestFirst.slice(request.offset, request.offset + request.limit);
    const records = await this.#readRecords(selectedIdentities, index.stateVersion);
    const items = records.map((record, selectedIndex): ReviewVersionItem => {
      if (record.kind !== 'review.snapshot') {
        throw new ProjectionRecordsInvalid();
      }
      const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
      const reviewSnapshotIdentity = selectedIdentities[selectedIndex];
      if (
        reviewSnapshotIdentity === undefined ||
        snapshot.reviewIdentity !== entry.reviewIdentity ||
        snapshot.reviewSnapshotIdentity !== reviewSnapshotIdentity
      ) {
        throw new ProjectionRecordsInvalid();
      }
      const chronologyIndex = entry.reviewSnapshotIdentities.indexOf(reviewSnapshotIdentity);
      const expectedPrevious = chronologyIndex > 0 ? entry.reviewSnapshotIdentities[chronologyIndex - 1] : undefined;
      if (chronologyIndex < 0 || snapshot.previousReviewSnapshotIdentity !== expectedPrevious) {
        throw new ProjectionRecordsInvalid();
      }
      return {
        reviewSnapshotIdentity,
        ...(expectedPrevious === undefined ? {} : { previousReviewSnapshotIdentity: expectedPrevious }),
        ordinal: chronologyIndex + 1,
        isLatest: reviewSnapshotIdentity === entry.reviewSnapshotIdentity,
        totalFiles: snapshot.manifest.totalFiles,
        verificationAtCapture: snapshot.workspaceVerificationAtCapture,
      };
    });
    const next = request.offset + items.length;
    return {
      kind: 'review.versions',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      versions: {
        total: entry.reviewSnapshotIdentities.length,
        offset: request.offset,
        items,
        nextOffset: next < entry.reviewSnapshotIdentities.length ? next : null,
      },
    };
  }

  async #basisPayloads(
    entry: ReviewIndexEntry,
    stateVersion: number,
  ): Promise<{
    readonly payloads: readonly ReviewBasisPayload[];
    readonly liveReviewBasisIdentity: ReviewBasisIdentity;
  }> {
    if (entry.basisTree !== undefined) {
      const records = await this.#readRecords(entry.basisTree.reviewBasisIdentities, stateVersion);
      const payloads = records.map((record, index) => {
        const expectedIdentity = entry.basisTree?.reviewBasisIdentities[index];
        if (
          expectedIdentity === undefined ||
          record.kind !== 'review.basis' ||
          record.recordClass !== 'immutable' ||
          record.schemaVersion !== 1 ||
          record.recordIdentity !== expectedIdentity ||
          record.workflowIdentity !== entry.reviewIdentity
        ) {
          throw new ProjectionRecordsInvalid();
        }
        const payload = parseReviewBasis(decodeReviewingPayload(record.payload));
        if (payload.reviewIdentity !== entry.reviewIdentity || payload.reviewBasisIdentity !== expectedIdentity) {
          throw new ProjectionRecordsInvalid();
        }
        return payload;
      });
      const seen = new Set<ReviewBasisIdentity>();
      for (const [index, payload] of payloads.entries()) {
        if (
          (index === 0 &&
            (payload.kind !== 'live' || payload.reviewBasisIdentity !== entry.basisTree.liveReviewBasisIdentity)) ||
          (index > 0 && (payload.kind === 'live' || !seen.has(payload.parentReviewBasisIdentity)))
        ) {
          throw new ProjectionRecordsInvalid();
        }
        seen.add(payload.reviewBasisIdentity);
      }
      const captured = payloads.filter(
        (payload): payload is Exclude<ReviewBasisPayload, { readonly kind: 'live' }> => payload.kind !== 'live',
      );
      const snapshotIdentities = captured.map(payload => payload.reviewSnapshotIdentity);
      if (new Set(snapshotIdentities).size !== snapshotIdentities.length) {
        throw new ProjectionRecordsInvalid();
      }
      const snapshotRecords = await this.#readRecords(snapshotIdentities, stateVersion);
      const snapshots = snapshotRecords.map((record, index) => {
        const expectedIdentity = snapshotIdentities[index];
        if (
          expectedIdentity === undefined ||
          record.kind !== 'review.snapshot' ||
          record.recordClass !== 'immutable' ||
          record.schemaVersion !== 1 ||
          record.recordIdentity !== expectedIdentity ||
          record.workflowIdentity !== entry.reviewIdentity
        ) {
          throw new ProjectionRecordsInvalid();
        }
        const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
        if (snapshot.reviewIdentity !== entry.reviewIdentity || snapshot.reviewSnapshotIdentity !== expectedIdentity) {
          throw new ProjectionRecordsInvalid();
        }
        return snapshot;
      });
      captured.forEach((basis, index) => {
        const snapshot = snapshots[index];
        if (
          snapshot === undefined ||
          (basis.kind === 'git-commit' &&
            (snapshot.comparedState.kind !== 'commit' ||
              snapshot.comparedState.objectIdentity !== basis.commit.objectIdentity))
        ) {
          throw new ProjectionRecordsInvalid();
        }
      });
      return {
        payloads,
        liveReviewBasisIdentity: entry.basisTree.liveReviewBasisIdentity,
      };
    }

    // Historical indexes have no basis records. Derive only facts that really
    // existed: the live singleton and, for an explicitly selected comparison,
    // its first exact Snapshot. Ordinary Snapshot refreshes are not tree forks.
    const liveReviewBasisIdentity = reviewLiveBasisIdentity(entry.reviewIdentity);
    const payloads: ReviewBasisPayload[] = [
      {
        formatVersion: 1,
        reviewIdentity: entry.reviewIdentity,
        reviewBasisIdentity: liveReviewBasisIdentity,
        kind: 'live',
      },
    ];
    const reviewSnapshotIdentity = entry.reviewSnapshotIdentities[0];
    if (reviewSnapshotIdentity === undefined) throw new ProjectionRecordsInvalid();
    const [record] = await this.#readRecords([reviewSnapshotIdentity], stateVersion);
    if (
      record === undefined ||
      record.kind !== 'review.snapshot' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== reviewSnapshotIdentity ||
      record.workflowIdentity !== entry.reviewIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
    if (
      snapshot.reviewIdentity !== entry.reviewIdentity ||
      snapshot.reviewSnapshotIdentity !== reviewSnapshotIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    if (snapshot.comparison !== undefined) {
      payloads.push(
        snapshot.comparedState.kind === 'commit'
          ? {
              formatVersion: 1,
              reviewIdentity: entry.reviewIdentity,
              reviewBasisIdentity: reviewGitCommitBasisIdentity(
                entry.reviewIdentity,
                snapshot.comparedState.objectIdentity,
              ),
              kind: 'git-commit',
              parentReviewBasisIdentity: liveReviewBasisIdentity,
              reviewSnapshotIdentity,
              commit: {
                kind: 'commit',
                objectFormat: snapshot.comparedState.objectFormat,
                objectIdentity: snapshot.comparedState.objectIdentity,
                abbreviatedObjectIdentity: snapshot.comparedState.abbreviatedObjectIdentity,
                subject: snapshot.comparedState.subject,
              },
            }
          : {
              formatVersion: 1,
              reviewIdentity: entry.reviewIdentity,
              reviewBasisIdentity: reviewSnapshotBasisIdentity(entry.reviewIdentity, reviewSnapshotIdentity),
              kind: 'saved-review-point',
              parentReviewBasisIdentity: liveReviewBasisIdentity,
              reviewSnapshotIdentity,
            },
      );
    }
    return { payloads, liveReviewBasisIdentity };
  }

  async #bases(
    request: ReviewBasesViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewBasesView> {
    if (entry === undefined) {
      return {
        kind: 'review.bases',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const tree = await this.#basisPayloads(entry, index.stateVersion);
    const depths = new Map<ReviewBasisIdentity, number>();
    const recordedItems = tree.payloads.map(payload => {
      const depth = payload.kind === 'live' ? 0 : (depths.get(payload.parentReviewBasisIdentity) ?? Number.NaN) + 1;
      if (!Number.isSafeInteger(depth) || depth < 0) throw new ProjectionRecordsInvalid();
      depths.set(payload.reviewBasisIdentity, depth);
      return projectedReviewBasis(payload, depth);
    });
    const graph = await this.#evidence.readReviewCommitGraph(500);
    const recordedCommitObjects = new Set(
      tree.payloads
        .filter(
          (payload): payload is Extract<ReviewBasisPayload, { readonly kind: 'git-commit' }> =>
            payload.kind === 'git-commit',
        )
        .map(payload => payload.commit.objectIdentity),
    );
    const recordedIdentities = new Set(tree.payloads.map(payload => payload.reviewBasisIdentity));
    const observedItems =
      graph.status === 'available'
        ? graph.rows
            .filter(
              (row): row is Extract<ReviewCommitGraphRow, { readonly kind: 'commit' }> =>
                row.kind === 'commit' && !recordedCommitObjects.has(row.objectIdentity),
            )
            .map(row => observedGitCommit(entry.reviewIdentity, tree.liveReviewBasisIdentity, row))
            .filter(item => !recordedIdentities.has(item.reviewBasisIdentity))
        : [];
    const all = [...recordedItems, ...observedItems];
    const items = all.slice(request.offset, request.offset + request.limit);
    const next = request.offset + items.length;
    return {
      kind: 'review.bases',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      liveReviewBasisIdentity: tree.liveReviewBasisIdentity,
      gitDiscovery:
        graph.status === 'available'
          ? { status: 'available', truncated: graph.truncated }
          : { status: 'unavailable', reason: graph.reason },
      bases: {
        total: all.length,
        offset: request.offset,
        items,
        nextOffset: next < all.length ? next : null,
      },
    };
  }

  async #readReviewMessage(
    entry: ReviewIndexEntry,
    indexed: NonNullable<ReviewIndexEntry['messageHistory']>['messages'][number],
    stateVersion: number,
  ): Promise<ReviewMessagePayload> {
    const [record] = await this.#readRecords([indexed.reviewMessageIdentity], stateVersion);
    if (
      record === undefined ||
      record.kind !== 'review.message' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== indexed.reviewMessageIdentity ||
      record.workflowIdentity !== entry.reviewIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const message = parseReviewMessage(decodeReviewingPayload(record.payload));
    if (
      message.reviewIdentity !== entry.reviewIdentity ||
      message.reviewMessageIdentity !== indexed.reviewMessageIdentity ||
      message.originReviewBasisIdentity !== indexed.originReviewBasisIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return message;
  }

  async #messages(
    request: ReviewMessagesViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewMessagesView> {
    if (
      entry === undefined ||
      (request.reviewBasisIdentity !== undefined &&
        !entry.basisTree?.reviewBasisIdentities.includes(request.reviewBasisIdentity))
    ) {
      return {
        kind: 'review.messages',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        ...(request.reviewBasisIdentity === undefined ? {} : { reviewBasisIdentity: request.reviewBasisIdentity }),
      };
    }
    await this.#basisPayloads(entry, index.stateVersion);
    const history = entry.messageHistory ?? {
      formatVersion: 1 as const,
      messages: [],
      responses: [],
      changeObservations: [],
    };
    const selected =
      request.reviewBasisIdentity === undefined
        ? history.messages
        : history.messages.filter(message => message.originReviewBasisIdentity === request.reviewBasisIdentity);
    const indexed = selected.slice(request.offset, request.offset + request.limit);
    const messages = await Promise.all(
      indexed.map(message => this.#readReviewMessage(entry, message, index.stateVersion)),
    );
    const responseIndex = new Map(history.responses.map(response => [response.reviewMessageIdentity, response]));
    const responseIdentities = indexed
      .map(message => responseIndex.get(message.reviewMessageIdentity)?.responseIdentity)
      .filter((identity): identity is ReviewResponseIdentity => identity !== undefined);
    const responseRecords = await this.#readRecords(responseIdentities, index.stateVersion);
    const responses = new Map<ReviewMessageIdentity, ReviewMessageResponsePayload>();
    responseRecords.forEach((record, ordinal) => {
      const responseIdentity = responseIdentities[ordinal];
      const indexedResponse = history.responses.find(item => item.responseIdentity === responseIdentity);
      if (responseIdentity === undefined || indexedResponse === undefined) throw new ProjectionRecordsInvalid();
      const response = this.#validatedReviewMessageResponse(entry, record, indexedResponse);
      responses.set(response.reviewMessageIdentity, response);
    });
    const observations = messages.map(message =>
      history.changeObservations.find(item => item.reviewMessageIdentity === message.reviewMessageIdentity),
    );
    const changedPaths = await Promise.all(
      messages.map((message, ordinal) =>
        observations[ordinal]?.outcome === 'forked'
          ? this.#changedPathsDuring(entry, message.reviewMessageIdentity, index.stateVersion)
          : undefined,
      ),
    );
    const items = messages.map((message, ordinal): ReviewMessageListItem => {
      const response = responses.get(message.reviewMessageIdentity);
      const observation = observations[ordinal];
      const changedFiles = changedPaths[ordinal];
      return {
        reviewMessageIdentity: message.reviewMessageIdentity,
        originReviewBasisIdentity: message.originReviewBasisIdentity,
        location: message.location,
        body: textPreview(message.body, MAX_REVIEW_MESSAGE_BODY_PREVIEW_BYTES),
        outgoingMaterialIdentity: message.outgoingMaterialIdentity,
        ...(observation === undefined
          ? {}
          : {
              changeObservation:
                observation.outcome === 'unchanged'
                  ? { outcome: 'unchanged' as const }
                  : {
                      outcome: 'forked' as const,
                      reviewBasisIdentity: observation.reviewBasisIdentity as ReviewBasisIdentity,
                      ...(changedFiles === undefined ? {} : { changedFiles }),
                    },
            }),
        ...(response === undefined
          ? {}
          : {
              response: {
                responseIdentity: response.responseIdentity,
                body: textPreview(response.body, MAX_REVIEW_MESSAGE_BODY_PREVIEW_BYTES),
              },
            }),
      };
    });
    const next = request.offset + items.length;
    return {
      kind: 'review.messages',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      ...(request.reviewBasisIdentity === undefined ? {} : { reviewBasisIdentity: request.reviewBasisIdentity }),
      messages: {
        total: selected.length,
        offset: request.offset,
        items,
        nextOffset: next < selected.length ? next : null,
      },
    };
  }

  async #messageOrigin(
    request: ReviewMessageOriginViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewMessageOriginView> {
    const indexed = entry?.messageHistory?.messages.find(
      message => message.reviewMessageIdentity === request.reviewMessageIdentity,
    );
    if (entry === undefined || indexed === undefined) {
      return {
        kind: 'review.message-origin',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        reviewMessageIdentity: request.reviewMessageIdentity,
      };
    }
    const [message, tree] = await Promise.all([
      this.#readReviewMessage(entry, indexed, index.stateVersion),
      this.#basisPayloads(entry, index.stateVersion),
    ]);
    const depths = new Map<ReviewBasisIdentity, number>();
    let selectedBasis: ReviewBasisItem | undefined;
    for (const payload of tree.payloads) {
      const depth = payload.kind === 'live' ? 0 : (depths.get(payload.parentReviewBasisIdentity) ?? Number.NaN) + 1;
      if (!Number.isSafeInteger(depth) || depth < 0) throw new ProjectionRecordsInvalid();
      depths.set(payload.reviewBasisIdentity, depth);
      if (payload.reviewBasisIdentity === message.originReviewBasisIdentity) {
        selectedBasis = projectedReviewBasis(payload, depth);
      }
    }
    if (selectedBasis === undefined) throw new ProjectionRecordsInvalid();
    let source: Extract<ReviewMessageOriginView, { readonly status: 'available' }>['source'];
    if (selectedBasis.kind === 'live') {
      source = { kind: 'live-working-diff', drift: 'accepted' };
    } else {
      if (selectedBasis.capture.status !== 'captured') throw new ProjectionRecordsInvalid();
      source = {
        kind: 'review-snapshot',
        reviewSnapshotIdentity: selectedBasis.capture.reviewSnapshotIdentity,
      };
    }
    return {
      kind: 'review.message-origin',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewMessageIdentity: message.reviewMessageIdentity,
      location: message.location,
      basis: selectedBasis,
      source,
    };
  }

  /** Validates one already-read response record against its immutable index entry. */
  #validatedReviewMessageResponse(
    entry: ReviewIndexEntry,
    record: StateRecord,
    indexed: NonNullable<ReviewIndexEntry['messageHistory']>['responses'][number],
  ): ReviewMessageResponsePayload {
    if (
      record.kind !== 'review.message-response' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== indexed.responseIdentity ||
      record.workflowIdentity !== entry.reviewIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const response = parseReviewMessageResponse(decodeReviewingPayload(record.payload));
    if (
      response.reviewIdentity !== entry.reviewIdentity ||
      response.responseIdentity !== indexed.responseIdentity ||
      response.reviewMessageIdentity !== indexed.reviewMessageIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return response;
  }

  /** The Snapshot taken right after a Response that changed code. */
  async #snapshotAfterResponse(
    entry: ReviewIndexEntry,
    reviewBasisIdentity: ReviewBasisIdentity | undefined,
    stateVersion: number,
  ): Promise<ReviewSnapshotPayload> {
    const tree = await this.#basisPayloads(entry, stateVersion);
    const basis = tree.payloads.find(item => item.reviewBasisIdentity === reviewBasisIdentity);
    if (basis?.kind !== 'change-event') throw new ProjectionRecordsInvalid();
    const [snapshotRecord] = await this.#readRecords([basis.reviewSnapshotIdentity], stateVersion);
    if (snapshotRecord?.kind !== 'review.snapshot' || snapshotRecord.recordClass !== 'immutable') {
      throw new ProjectionRecordsInvalid();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    if (
      snapshot.reviewIdentity !== entry.reviewIdentity ||
      snapshot.reviewSnapshotIdentity !== basis.reviewSnapshotIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    return snapshot;
  }

  /**
   * The code at a sent or answered point; undefined when BuildFrame did not keep
   * it. Fingerprints only are cached, since these points never change.
   */
  async #messagePointState(
    entry: ReviewIndexEntry,
    point: Extract<ReviewHistoryPoint, { readonly reviewMessageIdentity: unknown }>,
    stateVersion: number,
    withContent: boolean,
  ): Promise<HistoryPointState | undefined> {
    const key = `${entry.reviewIdentity}:${historyPointKey(point)}`;
    if (!withContent) {
      const cached = this.#historyPointStates.get(key);
      if (cached !== undefined) return await cached;
    }
    const pending = (async (): Promise<HistoryPointState | undefined> => {
      const history = entry.messageHistory;
      const indexed = history?.messages.find(item => item.reviewMessageIdentity === point.reviewMessageIdentity);
      if (history === undefined || indexed === undefined) return undefined;
      const sent = async (): Promise<HistoryPointState | undefined> => {
        const [message, files] = await Promise.all([
          this.#readReviewMessage(entry, indexed, stateVersion),
          readMessageCodeState(this.#state, entry.reviewIdentity, point.reviewMessageIdentity, withContent),
        ]);
        const basis = message.repositoryStateAtCommitment.basis;
        return files === undefined
          ? undefined
          : {
              point,
              basisKey: JSON.stringify(basis),
              basisObjectIdentity: headObjectIdentity(basis),
              files,
            };
      };
      if (point.kind === 'sent') return await sent();
      const observation = history.changeObservations.find(
        item => item.reviewMessageIdentity === point.reviewMessageIdentity,
      );
      if (observation === undefined) return undefined;
      if (observation.outcome === 'unchanged') {
        const atSend = await sent();
        return atSend === undefined ? undefined : { ...atSend, point };
      }
      const snapshot = await this.#snapshotAfterResponse(entry, observation.reviewBasisIdentity, stateVersion);
      const files = withContent
        ? await this.#snapshotTransition.reconstructComparisonFiles(snapshot)
        : await this.#snapshotTransition.comparisonFileList(snapshot);
      return {
        point,
        basisKey: JSON.stringify(snapshot.basis),
        basisObjectIdentity: headObjectIdentity(snapshot.basis),
        files,
      };
    })();
    if (withContent) return await pending;
    this.#historyPointStates.set(key, pending);
    while (this.#historyPointStates.size > MAX_HISTORY_POINT_STATES) {
      const oldest = this.#historyPointStates.keys().next().value;
      if (oldest === undefined) break;
      this.#historyPointStates.delete(oldest);
    }
    try {
      const state = await pending;
      // An unknown point may become known (a Message gets answered), so only
      // known points stay cached.
      if (state === undefined) this.#historyPointStates.delete(key);
      return state;
    } catch (error) {
      this.#historyPointStates.delete(key);
      throw error;
    }
  }

  /**
   * History covers Reviews of current changes. Now is known only for the
   * current Review, from the verified working tree.
   */
  async #historyScope(
    entry: ReviewIndexEntry,
    index: LoadedIndex,
  ): Promise<{ readonly fixed: true } | { readonly fixed: false; readonly now: LiveCaptureEntry | undefined }> {
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison !== undefined) return { fixed: true };
    if (entry.reviewIdentity !== index.payload.currentReviewIdentity) return { fixed: false, now: undefined };
    return { fixed: false, now: await this.#verifiedLiveChanges(entry.reviewIdentity) };
  }

  async #pointState(
    entry: ReviewIndexEntry,
    point: ReviewHistoryPoint,
    now: LiveCaptureEntry | undefined,
    stateVersion: number,
    withContent: boolean,
  ): Promise<HistoryPointState | undefined> {
    if (point.kind === 'start') return { point, basisKey: undefined, files: [] };
    if (point.kind === 'now') {
      return now === undefined
        ? undefined
        : {
            point,
            basisKey: JSON.stringify(now.captured.capture.basis),
            basisObjectIdentity: headObjectIdentity(now.captured.capture.basis),
            files: now.captured.files,
          };
    }
    return await this.#messagePointState(entry, point, stateVersion, withContent);
  }

  #positionOf(entry: ReviewIndexEntry): (point: ReviewHistoryPoint) => number {
    const messages = entry.messageHistory?.messages ?? [];
    const ordinals = new Map(messages.map((message, index) => [message.reviewMessageIdentity, index + 1] as const));
    return point =>
      historyPosition(point, candidate => ordinals.get(candidate.reviewMessageIdentity) ?? 0, messages.length);
  }

  async #history(
    request: ReviewHistoryViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewHistoryView> {
    const base = {
      kind: 'review.history',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
    } as const;
    if (entry === undefined) return { ...base, status: 'not-found' };
    const scope = await this.#historyScope(entry, index);
    if (scope.fixed) return { ...base, status: 'unavailable', reason: 'fixed-comparison' };
    const candidates: ReviewHistoryPoint[] = [{ kind: 'start' }];
    for (const message of entry.messageHistory?.messages ?? []) {
      candidates.push(
        { kind: 'sent', reviewMessageIdentity: message.reviewMessageIdentity },
        { kind: 'answered', reviewMessageIdentity: message.reviewMessageIdentity },
      );
    }
    candidates.push({ kind: 'now' });
    const states = await Promise.all(
      candidates.map(point => this.#pointState(entry, point, scope.now, index.stateVersion, false)),
    );
    const known = states.filter((state): state is HistoryPointState => state !== undefined);
    const crossings = new Map<HistoryPointState, CommitCrossing | undefined>();
    await Promise.all(
      known.slice(1).map(async (later, index) => {
        const earlier = known[index]!;
        if (commitMovedBetween(earlier, later)) crossings.set(later, await this.#commitCrossing(earlier, later));
      }),
    );
    return {
      ...base,
      status: 'available',
      reachesNow: known.at(-1)?.point.kind === 'now',
      messages: (entry.messageHistory?.messages ?? []).map(message => message.reviewMessageIdentity),
      steps: historySteps(known, this.#positionOf(entry), (_earlier, later) => crossings.get(later)),
    };
  }

  /**
   * What changed between the commits two points compare against; undefined
   * when either is unknown or unborn, or Git can no longer read them.
   */
  async #commitCrossing(earlier: HistoryPointState, later: HistoryPointState): Promise<CommitCrossing | undefined> {
    const from = earlier.basisObjectIdentity;
    const to = later.basisObjectIdentity;
    if (typeof from !== 'string' || typeof to !== 'string') return undefined;
    const key = `${from}>${to}`;
    const cached = this.#commitCrossings.get(key);
    if (cached !== undefined) return await cached;
    const pending = (async (): Promise<CommitCrossing | undefined> => {
      const captured = await this.#snapshotTransition.capture({
        kind: 'comparison-refresh',
        selection: {
          kind: 'revision-pair',
          basis: { kind: 'object', objectKind: 'commit', objectIdentity: from },
          compared: { kind: 'object', objectKind: 'commit', objectIdentity: to },
        },
      });
      if ('reason' in captured) return undefined;
      const { basis, comparedState } = captured.capture;
      if (
        basis.kind !== 'commit' ||
        basis.objectIdentity !== from ||
        comparedState.kind !== 'commit' ||
        comparedState.objectIdentity !== to
      ) {
        return undefined;
      }
      const commit = (endpoint: typeof basis): ReviewBasisCommit => ({
        kind: 'commit',
        objectFormat: endpoint.objectFormat,
        objectIdentity: endpoint.objectIdentity,
        abbreviatedObjectIdentity: endpoint.abbreviatedObjectIdentity,
        subject: endpoint.subject,
      });
      const count = await this.#evidence.readCommitsOnTop(from, to);
      return {
        headMove:
          count === undefined
            ? { kind: 'moved', from: commit(basis), to: commit(comparedState) }
            : { kind: 'commits', from: commit(basis), to: commit(comparedState), count },
        files: captured.files,
      };
    })();
    this.#commitCrossings.set(key, pending);
    while (this.#commitCrossings.size > MAX_COMMIT_CROSSINGS) {
      const oldest = this.#commitCrossings.keys().next().value;
      if (oldest === undefined) break;
      this.#commitCrossings.delete(oldest);
    }
    try {
      const crossing = await pending;
      // Git may read it later (a fetch, say), so only a read crossing stays cached.
      if (crossing === undefined) this.#commitCrossings.delete(key);
      return crossing;
    } catch (error) {
      this.#commitCrossings.delete(key);
      throw error;
    }
  }

  /** The files that differ between two points, with contents for their rows. */
  async #stepChangeSet(
    entry: ReviewIndexEntry,
    index: LoadedIndex,
    from: ReviewHistoryPoint,
    to: ReviewHistoryPoint,
  ): Promise<StepChangeSet> {
    const positionOf = this.#positionOf(entry);
    if (positionOf(from) >= positionOf(to)) return { status: 'not-found', reason: 'point-not-found' };
    const scope = await this.#historyScope(entry, index);
    if (scope.fixed) return { status: 'not-found', reason: 'point-not-found' };
    const touchesNow = from.kind === 'now' || to.kind === 'now';
    if (touchesNow && scope.now === undefined) return { status: 'not-found', reason: 'point-not-found' };
    const key = `${entry.reviewIdentity}:${historyPointKey(from)}>${historyPointKey(to)}${
      touchesNow ? `@${scope.now!.liveChangesIdentity}` : ''
    }`;
    const cached = this.#stepChangeSets.get(key);
    if (cached !== undefined) return await cached;
    const pending = (async (): Promise<StepChangeSet> => {
      const [earlier, later] = await Promise.all([
        this.#pointState(entry, from, scope.now, index.stateVersion, true),
        this.#pointState(entry, to, scope.now, index.stateVersion, true),
      ]);
      if (earlier === undefined || later === undefined) return { status: 'not-found', reason: 'point-not-found' };
      if (!commitMovedBetween(earlier, later)) {
        return { status: 'available', files: stepChangedFiles(key, earlier.files, later.files) };
      }
      const crossing = await this.#commitCrossing(earlier, later);
      if (crossing === undefined) return { status: 'unavailable', reason: 'commit-moved' };
      return { status: 'available', files: stepChangedFiles(key, earlier.files, later.files, crossing.files) };
    })();
    this.#stepChangeSets.set(key, pending);
    while (this.#stepChangeSets.size > MAX_STEP_CHANGE_SETS) {
      const oldest = this.#stepChangeSets.keys().next().value;
      if (oldest === undefined) break;
      this.#stepChangeSets.delete(oldest);
    }
    try {
      return await pending;
    } catch (error) {
      this.#stepChangeSets.delete(key);
      throw error;
    }
  }

  /**
   * Which files changed while one Message was answered, from fingerprints
   * alone, counting what a commit made meanwhile; undefined when its code at
   * send was not kept or what the commit changed can't be read.
   */
  async #changedPathsDuring(
    entry: ReviewIndexEntry,
    reviewMessageIdentity: ReviewMessageIdentity,
    stateVersion: number,
  ): Promise<MessageChangedPaths> {
    const [sent, answered] = await Promise.all([
      this.#messagePointState(entry, { kind: 'sent', reviewMessageIdentity }, stateVersion, false),
      this.#messagePointState(entry, { kind: 'answered', reviewMessageIdentity }, stateVersion, false),
    ]);
    if (sent === undefined || answered === undefined) return undefined;
    const crossing = commitMovedBetween(sent, answered) ? await this.#commitCrossing(sent, answered) : undefined;
    if (commitMovedBetween(sent, answered) && crossing === undefined) return undefined;
    const paths = stepChangedPaths(sent.files, answered.files, crossing?.files);
    return { paths: paths.slice(0, MAX_STEP_CHANGED_PATHS), total: paths.length };
  }

  async #stepChanges(
    request: ReviewStepChangesViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewStepChangesView> {
    const base = {
      kind: 'review.step-changes',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      from: request.from,
      to: request.to,
    } as const;
    if (entry === undefined) return { ...base, status: 'not-found' };
    const changes = await this.#stepChangeSet(entry, index, request.from, request.to);
    if (changes.status !== 'available') return { ...base, status: changes.status, reason: changes.reason };
    const items = changes.files.slice(request.offset, request.offset + request.limit).map(item => item.file);
    const next = request.offset + items.length;
    return {
      ...base,
      status: 'available',
      files: {
        total: changes.files.length,
        offset: request.offset,
        items,
        nextOffset: next < changes.files.length ? next : null,
      },
    };
  }

  async #stepChangesDiff(
    request: ReviewStepChangesDiffViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewStepChangesDiffView> {
    const base = {
      kind: 'review.step-changes-diff',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      from: request.from,
      to: request.to,
      fileIdentity: request.fileIdentity,
    } as const;
    if (entry === undefined) return { ...base, status: 'not-found' };
    const changes = await this.#stepChangeSet(entry, index, request.from, request.to);
    if (changes.status !== 'available') return { ...base, status: changes.status, reason: changes.reason };
    const changed = changes.files.find(item => item.file.fileIdentity === request.fileIdentity);
    if (changed === undefined) return { ...base, status: 'not-found' };
    if (changed.diff.index.status === 'unavailable') {
      return { ...base, status: 'unavailable', reason: changed.diff.index.reason, file: changed.file };
    }
    const rows = projectedStepChangeRows(changed, request.offset, request.limit);
    const next = request.offset + rows.length;
    const { fileIdentity: _fileIdentity, ...view } = base;
    return {
      ...view,
      status: 'available',
      file: changed.file,
      window: {
        totalRows: changed.diff.rows.length,
        offset: request.offset,
        rows,
        nextOffset: next < changed.diff.rows.length ? next : null,
      },
    };
  }

  async #messageBody(
    request: ReviewMessageBodyViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewMessageBodyView> {
    const indexed = entry?.messageHistory?.messages.find(
      message => message.reviewMessageIdentity === request.reviewMessageIdentity,
    );
    const notFound = (): ReviewMessageBodyView => ({
      kind: 'review.message-body',
      status: 'not-found',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      reviewMessageIdentity: request.reviewMessageIdentity,
    });
    if (entry === undefined || indexed === undefined) return notFound();
    let body: string;
    if (request.part === 'response') {
      const indexedResponse = entry.messageHistory?.responses.find(
        response => response.reviewMessageIdentity === request.reviewMessageIdentity,
      );
      if (indexedResponse === undefined) return notFound();
      const [record] = await this.#readRecords([indexedResponse.responseIdentity], index.stateVersion);
      if (record === undefined) throw new ProjectionRecordsInvalid();
      body = this.#validatedReviewMessageResponse(entry, record, indexedResponse).body;
    } else {
      body = (await this.#readReviewMessage(entry, indexed, index.stateVersion)).body;
    }
    const bytes = Buffer.from(body, 'utf8');
    const window = bytes.subarray(request.offset, request.offset + request.length);
    return {
      kind: 'review.message-body',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewMessageIdentity: indexed.reviewMessageIdentity,
      body: {
        encoding: 'utf8',
        bytesBase64: encodeBytesBase64(window),
        byteLength: window.byteLength,
        totalByteLength: bytes.byteLength,
        truncated: request.offset + window.byteLength < bytes.byteLength,
      },
    };
  }

  /**
   * A Review start just captured this working tree. The first live read then
   * verifies it is still current instead of capturing everything again.
   */
  adoptLiveCapture(reviewIdentity: ReviewIdentity, captured: CapturedReviewSnapshot): void {
    this.#retainLiveCapture(reviewIdentity, captured);
  }

  async #captureLiveChanges(reviewIdentity: ReviewIdentity): Promise<LiveCaptureEntry | undefined> {
    this.#onLiveChangesCapture?.();
    const captured = await this.#snapshotTransition.capture({
      kind: 'current-changes',
    });
    if ('reason' in captured) return undefined;
    return this.#retainLiveCapture(reviewIdentity, captured);
  }

  #retainLiveCapture(reviewIdentity: ReviewIdentity, captured: CapturedReviewSnapshot): LiveCaptureEntry {
    const liveChangesIdentity = capturedLiveChangesIdentity(captured);
    const key = `${reviewIdentity}:${liveChangesIdentity}`;
    // Adopt the fresh capture even when an entry for the same live-changes
    // identity exists: the retained entry's evidence may already have been
    // evicted, and returning it unchanged would make every later read
    // verify-miss and capture again, evicting unrelated entries (WF-247).
    const entry: LiveCaptureEntry = {
      reviewIdentity,
      liveChangesIdentity,
      captured,
      projection: this.#snapshotTransition.project(captured, liveChangesIdentity),
    };
    this.#liveCaptures.delete(key);
    this.#liveCaptures.set(key, entry);
    while (this.#liveCaptures.size > MAX_LIVE_CAPTURES) {
      const oldest = this.#liveCaptures.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#liveCaptures.delete(oldest);
    }
    return entry;
  }

  async #verifiedLiveChanges(reviewIdentity: ReviewIdentity): Promise<LiveCaptureEntry | undefined> {
    const shared = this.#liveVerifications.get(reviewIdentity);
    const watching = this.#unsubscribeFromEvidenceInvalidation !== undefined;
    if (
      shared !== undefined &&
      shared.generation === this.#liveGeneration &&
      (shared.settledAt === undefined || watching)
    ) {
      return await shared.promise;
    }
    const verification: {
      readonly generation: number;
      settledAt: number | undefined;
      readonly promise: Promise<LiveCaptureEntry | undefined>;
    } = {
      generation: this.#liveGeneration,
      settledAt: undefined,
      promise: this.#verifyLiveChangesNow(reviewIdentity),
    };
    this.#liveVerifications.set(reviewIdentity, verification);
    try {
      return await verification.promise;
    } catch (error) {
      if (this.#liveVerifications.get(reviewIdentity) === verification) this.#liveVerifications.delete(reviewIdentity);
      throw error;
    } finally {
      verification.settledAt = performance.now();
    }
  }

  async #verifyLiveChangesNow(reviewIdentity: ReviewIdentity): Promise<LiveCaptureEntry | undefined> {
    const retained = [...this.#liveCaptures.values()]
      .reverse()
      .find(candidate => candidate.reviewIdentity === reviewIdentity);
    if (retained !== undefined && (await this.#snapshotTransition.stillDescribes(retained.captured))) {
      const key = `${reviewIdentity}:${retained.liveChangesIdentity}`;
      this.#liveCaptures.delete(key);
      this.#liveCaptures.set(key, retained);
      return retained;
    }
    return await this.#captureLiveChanges(reviewIdentity);
  }

  async #continuation(
    request: ReviewContinuationViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewContinuationView> {
    if (entry === undefined) {
      return {
        kind: 'review.continuation',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        reason: 'review-not-found',
      };
    }
    if (
      entry.reviewIdentity !== index.payload.currentReviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return {
        kind: 'review.continuation',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        sourceReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'review-not-current',
      };
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison === undefined || snapshot.comparedState.kind !== 'commit') {
      return {
        kind: 'review.continuation',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        sourceReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'review-not-fixed',
      };
    }
    const live = await this.#verifiedLiveChanges(entry.reviewIdentity);
    if (live === undefined || live.captured.capture.kind !== 'workspace.current-changes.capture') {
      return {
        kind: 'review.continuation',
        status: 'unverified',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        sourceReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'inspection-failed',
      };
    }
    const blockers: ReviewProjectedBlocker[] = [];
    if (index.payload.reviews.length >= MAX_REVIEWS) {
      blockers.push(blocker('review-capacity-reached', [], 'none'));
    }
    if (live.captured.capture.manifest.totalFiles === 0) {
      blockers.push(blocker('comparison-has-no-changes', [], 'return-to-review'));
    }
    const currentHead = live.captured.capture.basis;
    return {
      kind: 'review.continuation',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      sourceReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      sourceBasis: snapshot.basis,
      savedEndpoint: snapshot.comparedState,
      currentHead,
      headMoved: currentHead.objectIdentity !== snapshot.comparedState.objectIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      currentHeadAction: projectedAction('review.comparison.continue-live', index.stateVersion, entry, blockers, [
        snapshot.comparedState.objectIdentity,
        ...(currentHead.objectIdentity === null ? [] : [currentHead.objectIdentity]),
        live.liveChangesIdentity,
      ]),
      savedEndpointChoice: {
        kind: 'review.comparison.continue-composite',
        status: 'separate-intent',
      },
    };
  }

  async #liveManifest(
    request: ReviewLiveManifestViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewLiveManifestView> {
    if (entry === undefined) {
      return {
        kind: 'review.live-manifest',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        reason: 'review-not-found',
      };
    }
    if (entry.reviewIdentity !== index.payload.currentReviewIdentity) {
      return {
        kind: 'review.live-manifest',
        status: 'fixed',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'review-not-current',
      };
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison !== undefined) {
      return {
        kind: 'review.live-manifest',
        status: 'fixed',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'fixed-comparison',
      };
    }
    const live = await this.#verifiedLiveChanges(entry.reviewIdentity);
    if (live === undefined) {
      return {
        kind: 'review.live-manifest',
        status: 'unverified',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reason: 'inspection-failed',
      };
    }
    const files = live.projection.files.slice(request.offset, request.offset + request.limit);
    const next = request.offset + files.length;
    return {
      kind: 'review.live-manifest',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      matchesLatestSnapshot: live.liveChangesIdentity === snapshotLiveChangesIdentity(snapshot),
      manifest: {
        totalFiles: live.projection.files.length,
        offset: request.offset,
        files: files.map(projectedFile),
        nextOffset: next < live.projection.files.length ? next : null,
      },
    };
  }

  async #liveFiles(
    request: ReviewLiveFilesViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewLiveFilesView> {
    const unavailable = (
      status: Exclude<ReviewLiveFilesView['status'], 'available'>,
      reason: Extract<
        ReviewLiveFilesView,
        { readonly status: Exclude<ReviewLiveFilesView['status'], 'available'> }
      >['reason'],
    ): ReviewLiveFilesView => ({
      kind: 'review.live-files',
      status,
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      liveChangesIdentity: request.liveChangesIdentity,
      reason,
    });
    if (entry === undefined) return unavailable('not-found', 'review-not-found');
    if (entry.reviewIdentity !== index.payload.currentReviewIdentity) {
      return unavailable('fixed', 'review-not-current');
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison !== undefined) return unavailable('fixed', 'fixed-comparison');
    const live = await this.#verifiedLiveChanges(entry.reviewIdentity);
    if (live === undefined) return unavailable('unavailable', 'inspection-failed');
    if (live.liveChangesIdentity !== request.liveChangesIdentity) {
      return unavailable('moved', 'live-changes-moved');
    }
    let listing = this.#repositoryFiles.get(live);
    if (listing === undefined) {
      listing = this.#evidence.readCurrentRepositoryFiles();
      this.#repositoryFiles.set(live, listing);
      listing.catch(() => this.#repositoryFiles.delete(live));
    }
    const repository = await listing;
    if (repository.status !== 'available') {
      this.#repositoryFiles.delete(live);
      return unavailable('unavailable', repository.reason);
    }

    const byPath = new Map<string, ReviewLiveFileItem>();
    for (const file of repository.files) {
      byPath.set(file.path.bytesBase64, {
        fileIdentity: file.fileIdentity,
        path: file.path,
        status: 'unchanged',
      });
    }
    for (const captured of live.projection.files) {
      const selected = captured.newSide ?? captured.oldSide;
      if (selected === undefined) throw new ProjectionRecordsInvalid();
      const changedFile = projectedFile(captured);
      byPath.set(selected.path.bytesBase64, {
        fileIdentity: captured.fileIdentity,
        path: selected.path,
        status: captured.status,
        changedFile,
      });
    }
    const all = [...byPath.values()].sort((left, right) => {
      const changedOrder = Number(right.status !== 'unchanged') - Number(left.status !== 'unchanged');
      if (changedOrder !== 0) return changedOrder;
      return Buffer.compare(
        Buffer.from(left.path.bytesBase64, 'base64'),
        Buffer.from(right.path.bytesBase64, 'base64'),
      );
    });
    const items = all.slice(request.offset, request.offset + request.limit);
    const next = request.offset + items.length;
    return {
      kind: 'review.live-files',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      files: {
        total: all.length,
        offset: request.offset,
        items,
        nextOffset: next < all.length ? next : null,
      },
    };
  }

  async #liveFileContent(
    request: ReviewLiveFileContentViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewLiveFileContentView> {
    const unavailable = (
      status: Exclude<ReviewLiveFileContentView['status'], 'available'>,
      reason: Extract<
        ReviewLiveFileContentView,
        { readonly status: Exclude<ReviewLiveFileContentView['status'], 'available'> }
      >['reason'],
    ): ReviewLiveFileContentView => ({
      kind: 'review.live-file-content',
      status,
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      liveChangesIdentity: request.liveChangesIdentity,
      reason,
    });
    if (entry === undefined) return unavailable('not-found', 'review-not-found');
    if (entry.reviewIdentity !== index.payload.currentReviewIdentity) {
      return unavailable('fixed', 'review-not-current');
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison !== undefined) return unavailable('fixed', 'fixed-comparison');
    const live = await this.#verifiedLiveChanges(entry.reviewIdentity);
    if (live === undefined) return unavailable('unavailable', 'inspection-failed');
    if (live.liveChangesIdentity !== request.liveChangesIdentity) {
      return unavailable('moved', 'live-changes-moved');
    }
    const pathBytes = Buffer.from(request.pathBytesBase64, 'base64');
    // Changed files are shown through their Diff; this view is for the rest.
    const captured = live.projection.files.some(
      file => (file.newSide ?? file.oldSide)?.path.bytesBase64 === request.pathBytesBase64,
    );
    if (captured) return unavailable('unavailable', 'file-unavailable');
    const content = await this.#evidence.readCurrentRepositoryFileContent(pathBytes, request.anchorLine);
    if (content.status === 'too-large') return unavailable('unavailable', 'too-large');
    if (content.status === 'unsupported') return unavailable('unavailable', content.classification);
    if (content.status !== 'available') return unavailable('unavailable', 'file-unavailable');
    return {
      kind: 'review.live-file-content',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      path: evidencePath(pathBytes),
      content: {
        encoding: 'utf8',
        bytesBase64: content.bytesBase64,
        byteLength: content.byteLength,
        totalByteLength: content.totalByteLength,
        firstLine: content.firstLine,
        lineCount: content.lineCount,
        totalLines: content.totalLines,
        truncated: content.truncated,
      },
    };
  }

  async #liveDiff(
    request: ReviewLiveDiffViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewLiveDiffView> {
    const unavailable = (
      status: ReviewLiveDiffUnavailableView['status'],
      reason: ReviewLiveDiffUnavailableView['reason'],
    ): ReviewLiveDiffUnavailableView => ({
      kind: 'review.live-diff',
      status,
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      liveChangesIdentity: request.liveChangesIdentity,
      fileIdentity: request.fileIdentity,
      reason,
    });
    if (entry === undefined) return unavailable('not-found', 'review-not-found');
    if (entry.reviewIdentity !== index.payload.currentReviewIdentity) {
      return unavailable('fixed', 'review-not-current');
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    if (snapshot.comparison !== undefined) {
      return unavailable('fixed', 'fixed-comparison');
    }
    // Only one working-tree state is current, so the shared check answers for
    // the requested identity too: it either is that state or the tree moved.
    const live = await this.#verifiedLiveChanges(entry.reviewIdentity);
    if (live === undefined) return unavailable('unavailable', 'inspection-failed');
    if (live.liveChangesIdentity !== request.liveChangesIdentity) {
      return unavailable('moved', 'live-changes-moved');
    }
    const projected = live.projection.projectedFiles.find(
      candidate => candidate.captured.file.fileIdentity === request.fileIdentity,
    );
    if (projected === undefined) return unavailable('not-found', 'file-not-found');
    const actions = [
      projectedAction(
        'review.question.ask',
        index.stateVersion,
        entry,
        [
          ...(entry.batchIdentities.length >= MAX_REVIEW_BATCHES || entry.questionIdentities.length >= MAX_REVIEW_DRAFTS
            ? [blocker('review-capacity-reached', [], 'none')]
            : []),
        ],
        [request.fileIdentity],
      ),
    ];
    if (projected.diff.index.status === 'unavailable') {
      return {
        ...unavailable('unavailable', projected.diff.index.reason),
        file: projectedFile(projected.captured.file),
        actions,
      };
    }
    const anchorLocal =
      request.anchorLine === undefined
        ? -1
        : (() => {
            const byNewLine = projected.diff.rows.findIndex(row => row.newLine === request.anchorLine);
            return byNewLine >= 0
              ? byNewLine
              : projected.diff.rows.findIndex(row => row.oldLine === request.anchorLine);
          })();
    const offset =
      anchorLocal < 0 ? request.offset : Math.floor(anchorLocal / REVIEW_DIFF_WINDOW_ROWS) * REVIEW_DIFF_WINDOW_ROWS;
    const rows = projected.diff.rows.slice(offset, offset + request.limit);
    const projectedRows = rows.map((row): ReviewProjectedDiffRow => {
      const content = row.content.side === 'old' ? projected.captured.oldContent : projected.captured.newContent;
      if (content === undefined) throw new ProjectionRecordsInvalid();
      const bytes = content.subarray(
        row.content.byteOffset,
        row.content.byteOffset + Math.min(row.content.byteLength, MAX_DIFF_ROW_BYTES),
      );
      return {
        rowIdentity: row.rowIdentity,
        kind: row.kind,
        ...(row.oldLine === undefined ? {} : { oldLine: row.oldLine }),
        ...(row.newLine === undefined ? {} : { newLine: row.newLine }),
        text: {
          encoding: 'utf8',
          bytesBase64: encodeBytesBase64(bytes),
          byteLength: bytes.byteLength,
          totalByteLength: row.content.byteLength,
          truncated: bytes.byteLength < row.content.byteLength,
        },
      };
    });
    const next = offset + projectedRows.length;
    const firstChangedOrdinal = projected.diff.rows.findIndex(
      row => row.kind === 'addition' || row.kind === 'deletion',
    );
    return {
      kind: 'review.live-diff',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      latestReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      matchesLatestSnapshot: live.liveChangesIdentity === snapshotLiveChangesIdentity(snapshot),
      file: projectedFile(projected.captured.file),
      ...(firstChangedOrdinal < 0 ? {} : { firstChangedRow: firstChangedOrdinal }),
      window: {
        totalRows: projected.diff.index.totalRows,
        offset,
        rows: projectedRows,
        nextOffset: next < projected.diff.index.totalRows ? next : null,
      },
      actions,
    };
  }

  async #diff(
    request: ReviewDiffViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewDiffView> {
    if (entry === undefined) {
      return {
        kind: 'review.diff',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: 'review-not-found',
      };
    }
    const selectedEntry = await this.#selectedSnapshotEntry(entry, request.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) {
      return {
        kind: 'review.diff',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: 'snapshot-not-found',
      };
    }
    const [snapshot, records] = await Promise.all([
      this.#snapshot(selectedEntry, index.stateVersion),
      this.#readOptionalRecords(
        [fileRecordIdentity(selectedEntry.reviewSnapshotIdentity, request.fileIdentity)],
        index.stateVersion,
      ),
    ]);
    const fileRecord = records[0];
    if (fileRecord === undefined) {
      const { status: snapshotStatus, contextStatus } = await this.#snapshotStatus(snapshot);
      return {
        kind: 'review.diff',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: 'file-not-found',
        header: this.#header(
          selectedEntry,
          snapshotStatus,
          snapshot,
          index.payload.currentReviewIdentity,
          contextStatus,
        ),
        actions:
          selectedEntry.reviewSnapshotIdentity === entry.reviewSnapshotIdentity
            ? reviewActions(entry, index.stateVersion, snapshotStatus)
            : [],
      };
    }
    if (fileRecord.kind !== 'review.snapshot-file') {
      throw new ProjectionRecordsInvalid();
    }
    const filePayload = parseReviewSnapshotFile(decodeReviewingPayload(fileRecord.payload));
    if (
      filePayload.reviewIdentity !== selectedEntry.reviewIdentity ||
      filePayload.reviewSnapshotIdentity !== selectedEntry.reviewSnapshotIdentity ||
      filePayload.file.fileIdentity !== request.fileIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    const { status: snapshotStatus, contextStatus } = await this.#snapshotStatus(snapshot);
    const header = this.#header(
      selectedEntry,
      snapshotStatus,
      snapshot,
      index.payload.currentReviewIdentity,
      contextStatus,
    );
    const askBlockers = [
      ...currentReviewBlockers(entry, index.payload.currentReviewIdentity),
      ...(entry.batchIdentities.length >= MAX_REVIEW_BATCHES || entry.questionIdentities.length >= MAX_REVIEW_DRAFTS
        ? [blocker('review-capacity-reached', [], 'none')]
        : []),
      ...snapshotBlockers(entry, snapshotStatus),
    ];
    const actions =
      selectedEntry.reviewSnapshotIdentity === entry.reviewSnapshotIdentity
        ? [projectedAction('review.question.ask', index.stateVersion, entry, askBlockers, [request.fileIdentity])]
        : [];
    if (filePayload.diff.status === 'unavailable') {
      return {
        kind: 'review.diff',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: filePayload.diff.reason,
        header,
        file: projectedFile(filePayload.file),
        actions,
      };
    }
    const offset = await this.#anchorLineOffset(
      selectedEntry,
      request.fileIdentity,
      filePayload.diff.totalRows,
      request.offset,
      request.anchorLine,
      index.stateVersion,
    );
    const rows = await this.#diffRows(
      selectedEntry,
      request.fileIdentity,
      filePayload.diff.totalRows,
      offset,
      request.limit,
      index.stateVersion,
    );
    const projectedRows = await this.#diffText(fileRecord.recordIdentity, rows, index.stateVersion);
    const next = offset + projectedRows.length;
    return {
      kind: 'review.diff',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      header,
      file: projectedFile(filePayload.file),
      window: {
        totalRows: filePayload.diff.totalRows,
        offset,
        rows: projectedRows,
        nextOffset: next < filePayload.diff.totalRows ? next : null,
      },
      actions,
    };
  }

  /**
   * Resolves an exact source line to the bounded window that contains its row.
   * Windows are scanned in bounded batches because the stored Diff exposes no
   * line index; an unresolvable line keeps the caller's requested offset.
   */
  async #anchorLineOffset(
    entry: ReviewIndexEntry,
    fileIdentity: string,
    totalRows: number,
    requestedOffset: number,
    anchorLine: number | undefined,
    stateVersion: number,
  ): Promise<number> {
    if (anchorLine === undefined) return requestedOffset;
    const batchRows = REVIEW_DIFF_WINDOW_ROWS * 8;
    for (let offset = 0; offset < totalRows; offset += batchRows) {
      const rows = await this.#diffRows(entry, fileIdentity, totalRows, offset, batchRows, stateVersion);
      const byNewLine = rows.findIndex(row => row.newLine === anchorLine);
      const local = byNewLine >= 0 ? byNewLine : rows.findIndex(row => row.oldLine === anchorLine);
      if (local >= 0) {
        return Math.floor((offset + local) / REVIEW_DIFF_WINDOW_ROWS) * REVIEW_DIFF_WINDOW_ROWS;
      }
    }
    return requestedOffset;
  }

  async #diffRows(
    entry: ReviewIndexEntry,
    fileIdentity: string,
    totalRows: number,
    offset: number,
    limit: number,
    stateVersion: number,
  ): Promise<readonly ReviewDiffRowPayload[]> {
    if (offset >= totalRows) return [];
    const end = Math.min(offset + limit, totalRows);
    const firstWindow = Math.floor(offset / REVIEW_DIFF_WINDOW_ROWS);
    const lastWindow = Math.floor((end - 1) / REVIEW_DIFF_WINDOW_ROWS);
    const identities: string[] = [];
    for (let window = firstWindow; window <= lastWindow; window += 1) {
      identities.push(diffWindowIdentity(entry.reviewSnapshotIdentity, fileIdentity, window));
    }
    const records = await this.#readRecords(identities, stateVersion);
    const all: ReviewDiffRowPayload[] = [];
    records.forEach((record, index) => {
      if (record.kind !== 'review.snapshot-diff-window') {
        throw new ProjectionRecordsInvalid();
      }
      const payload = parseReviewDiffWindow(decodeReviewingPayload(record.payload));
      const expectedOffset = (firstWindow + index) * REVIEW_DIFF_WINDOW_ROWS;
      if (
        payload.reviewIdentity !== entry.reviewIdentity ||
        payload.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        payload.fileIdentity !== fileIdentity ||
        payload.offset !== expectedOffset
      ) {
        throw new ProjectionRecordsInvalid();
      }
      all.push(...payload.rows);
    });
    const relativeOffset = offset - firstWindow * REVIEW_DIFF_WINDOW_ROWS;
    return all.slice(relativeOffset, relativeOffset + limit);
  }

  async #diffText(
    recordIdentity: string,
    rows: readonly ReviewDiffRowPayload[],
    stateVersion: number,
  ): Promise<readonly ReviewProjectedDiffRow[]> {
    const nonEmpty = rows.filter(row => row.content.byteLength > 0);
    const content =
      nonEmpty.length === 0
        ? undefined
        : await this.#state.readContent({
            windows: nonEmpty.map(row => ({
              recordIdentity,
              role: row.content.side,
              offset: row.content.byteOffset,
              length: Math.min(row.content.byteLength, MAX_DIFF_ROW_BYTES),
            })),
          });
    if (content !== undefined) {
      if (content.stateVersion !== stateVersion) throw new ProjectionVersionChanged();
      if (content.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    }
    let contentIndex = 0;
    return rows.map(row => {
      let bytes: Uint8Array = new Uint8Array();
      if (row.content.byteLength > 0) {
        const window = content?.windows[contentIndex];
        contentIndex += 1;
        if (
          window?.status !== 'available' ||
          window.digest !== row.content.digest ||
          window.offset !== row.content.byteOffset
        ) {
          throw new ProjectionRecordsInvalid();
        }
        bytes = window.bytes;
      }
      return {
        rowIdentity: row.rowIdentity,
        kind: row.kind,
        ...(row.oldLine === undefined ? {} : { oldLine: row.oldLine }),
        ...(row.newLine === undefined ? {} : { newLine: row.newLine }),
        text: {
          encoding: 'utf8',
          bytesBase64: encodeBytesBase64(bytes),
          byteLength: bytes.byteLength,
          totalByteLength: row.content.byteLength,
          truncated: bytes.byteLength < row.content.byteLength,
        },
      };
    });
  }

  async #searchPreview(
    request: ReviewSearchPreviewViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewSearchPreviewView> {
    if (entry === undefined) {
      return {
        kind: 'review.search-preview',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: 'review-not-found',
      };
    }
    const records = await this.#readOptionalRecords(
      [fileRecordIdentity(entry.reviewSnapshotIdentity, request.fileIdentity)],
      index.stateVersion,
    );
    const record = records[0];
    if (record === undefined) {
      return {
        kind: 'review.search-preview',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: 'file-not-found',
      };
    }
    if (record.kind !== 'review.snapshot-file') {
      throw new ProjectionRecordsInvalid();
    }
    const payload = parseReviewSnapshotFile(decodeReviewingPayload(record.payload));
    if (
      payload.reviewIdentity !== entry.reviewIdentity ||
      payload.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
      payload.file.fileIdentity !== request.fileIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    if (payload.diff.status === 'unavailable') {
      return {
        kind: 'review.search-preview',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        fileIdentity: request.fileIdentity,
        reason: payload.diff.reason,
      };
    }
    const rows = await this.#diffRows(
      entry,
      request.fileIdentity,
      payload.diff.totalRows,
      request.offset,
      request.limit,
      index.stateVersion,
    );
    return {
      kind: 'review.search-preview',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      file: projectedFile(payload.file),
      window: {
        totalRows: payload.diff.totalRows,
        offset: request.offset,
        rows: await this.#diffText(record.recordIdentity, rows, index.stateVersion),
      },
    };
  }

  async #search(
    request: ReviewSearchViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewSearchView> {
    if (entry === undefined) {
      return {
        kind: 'review.search',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        query: request.query,
      };
    }
    const snapshot = await this.#snapshot(entry, index.stateVersion);
    const searchIndex = await this.#searchIndex(entry, snapshot, index.stateVersion);
    const query = request.query.toLowerCase();
    const results: ReviewSearchItem[] = [];
    let totalResults = 0;
    const admit = (item: ReviewSearchItem): void => {
      if (totalResults >= request.offset && results.length < request.limit) {
        results.push(item);
      }
      totalResults += 1;
    };
    for (const file of searchIndex.files) {
      if (file.normalizedPath.includes(query)) {
        admit({
          kind: 'file',
          resultIdentity: `file:${file.fileIdentity}`,
          fileIdentity: file.fileIdentity,
          fileAbsolute: file.fileAbsolute,
          displayPath: file.displayPath,
        });
      }
      for (const change of file.changes) {
        const matchAt = change.normalizedText.indexOf(query);
        if (matchAt < 0) continue;
        admit({
          kind: 'change',
          resultIdentity: `change:${change.rowIdentity}`,
          fileIdentity: change.fileIdentity,
          fileAbsolute: change.fileAbsolute,
          displayPath: change.displayPath,
          rowIdentity: change.rowIdentity,
          rowAbsolute: change.rowAbsolute,
          change: change.change,
          ...(change.oldLine === undefined ? {} : { oldLine: change.oldLine }),
          ...(change.newLine === undefined ? {} : { newLine: change.newLine }),
          snippet: searchSnippet(change.text, matchAt, request.query.length),
        });
      }
    }
    const next = request.offset + results.length;
    return {
      kind: 'review.search',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: searchIndex.reviewSnapshotIdentity,
      query: request.query,
      totalResults,
      unsearchableChangeFiles: searchIndex.unsearchableChangeFiles,
      offset: request.offset,
      results,
      nextOffset: next < totalResults ? next : null,
    };
  }

  async #searchIndex(
    entry: ReviewIndexEntry,
    snapshot: ReviewSnapshotPayload,
    stateVersion: number,
  ): Promise<ReviewSearchIndex> {
    const existing = this.#searchIndexes.get(entry.reviewSnapshotIdentity);
    if (existing !== undefined) return await existing;
    if (this.#searchIndexes.size >= 4) {
      const oldest = this.#searchIndexes.keys().next().value as string | undefined;
      if (oldest !== undefined) this.#searchIndexes.delete(oldest);
    }
    const pending = this.#buildSearchIndex(entry, snapshot, stateVersion).catch((error: unknown) => {
      this.#searchIndexes.delete(entry.reviewSnapshotIdentity);
      throw error;
    });
    this.#searchIndexes.set(entry.reviewSnapshotIdentity, pending);
    return await pending;
  }

  async #buildSearchIndex(
    entry: ReviewIndexEntry,
    snapshot: ReviewSnapshotPayload,
    stateVersion: number,
  ): Promise<ReviewSearchIndex> {
    const files = await this.#manifestFiles(entry, snapshot, 0, snapshot.manifest.totalFiles, stateVersion);
    const indexed: IndexedReviewSearchFile[] = [];
    let unsearchableChangeFiles = 0;
    for (let fileOffset = 0; fileOffset < files.length; fileOffset += 64) {
      const selected = files.slice(fileOffset, fileOffset + 64);
      const records = await this.#readRecords(
        selected.map(file => fileRecordIdentity(entry.reviewSnapshotIdentity, file.fileIdentity)),
        stateVersion,
      );
      for (const [local, record] of records.entries()) {
        const file = selected[local];
        if (file === undefined || record.kind !== 'review.snapshot-file') {
          throw new ProjectionRecordsInvalid();
        }
        const payload = parseReviewSnapshotFile(decodeReviewingPayload(record.payload));
        if (
          payload.reviewIdentity !== entry.reviewIdentity ||
          payload.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
          payload.file.fileIdentity !== file.fileIdentity
        ) {
          throw new ProjectionRecordsInvalid();
        }
        const fileAbsolute = fileOffset + local;
        const displayPath = projectedFile(file).displayPath;
        const normalizedPath = [file.oldSide?.path.display, file.newSide?.path.display]
          .filter((candidate): candidate is string => candidate !== undefined)
          .join('\n')
          .toLowerCase();
        const changes: IndexedReviewSearchChange[] = [];
        if (payload.diff.status === 'available') {
          for (let rowOffset = 0; rowOffset < payload.diff.totalRows; rowOffset += REVIEW_DIFF_WINDOW_ROWS) {
            const rows = await this.#diffRows(
              entry,
              file.fileIdentity,
              payload.diff.totalRows,
              rowOffset,
              REVIEW_DIFF_WINDOW_ROWS,
              stateVersion,
            );
            const changed = rows
              .map((row, localRow) => ({ row, rowAbsolute: rowOffset + localRow }))
              .filter(
                (
                  item,
                ): item is {
                  readonly row: ReviewDiffRowPayload & {
                    readonly kind: 'addition' | 'deletion';
                  };
                  readonly rowAbsolute: number;
                } => item.row.kind === 'addition' || item.row.kind === 'deletion',
              );
            const texts = await this.#searchRowTexts(
              record.recordIdentity,
              changed.map(item => item.row),
              stateVersion,
            );
            changed.forEach((item, changeOffset) => {
              const text = texts[changeOffset];
              if (text === undefined) throw new ProjectionRecordsInvalid();
              changes.push({
                fileIdentity: file.fileIdentity,
                fileAbsolute,
                displayPath,
                rowIdentity: item.row.rowIdentity,
                rowAbsolute: item.rowAbsolute,
                change: item.row.kind,
                ...(item.row.oldLine === undefined ? {} : { oldLine: item.row.oldLine }),
                ...(item.row.newLine === undefined ? {} : { newLine: item.row.newLine }),
                text,
                normalizedText: text.toLowerCase(),
              });
            });
          }
        } else {
          unsearchableChangeFiles += 1;
        }
        indexed.push({
          fileIdentity: file.fileIdentity,
          fileAbsolute,
          displayPath,
          normalizedPath,
          changes,
        });
      }
    }
    return {
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      files: indexed,
      unsearchableChangeFiles,
    };
  }

  async #searchRowTexts(
    recordIdentity: string,
    rows: readonly ReviewDiffRowPayload[],
    stateVersion: number,
  ): Promise<readonly string[]> {
    const chunks = rows.map((): Uint8Array[] => []);
    const segments: SearchContentSegment[] = [];
    rows.forEach((row, rowIndex) => {
      for (let localOffset = 0; localOffset < row.content.byteLength; localOffset += SEARCH_CONTENT_WINDOW_BYTES) {
        segments.push({
          rowIndex,
          role: row.content.side,
          digest: row.content.digest,
          offset: row.content.byteOffset + localOffset,
          length: Math.min(SEARCH_CONTENT_WINDOW_BYTES, row.content.byteLength - localOffset),
        });
      }
    });
    for (let segmentOffset = 0; segmentOffset < segments.length; segmentOffset += SEARCH_CONTENT_WINDOWS_PER_READ) {
      const selected = segments.slice(segmentOffset, segmentOffset + SEARCH_CONTENT_WINDOWS_PER_READ);
      const content = await this.#state.readContent({
        windows: selected.map(segment => ({
          recordIdentity,
          role: segment.role,
          offset: segment.offset,
          length: segment.length,
        })),
      });
      if (content.stateVersion !== stateVersion) throw new ProjectionVersionChanged();
      if (content.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
      selected.forEach((segment, index) => {
        const window = content.windows[index];
        if (
          window?.status !== 'available' ||
          window.digest !== segment.digest ||
          window.offset !== segment.offset ||
          window.bytes.byteLength !== segment.length
        ) {
          throw new ProjectionRecordsInvalid();
        }
        chunks[segment.rowIndex]?.push(window.bytes);
      });
    }
    return rows.map((row, index) => {
      if (row.content.byteLength === 0) return '';
      const selected = chunks[index];
      if (selected === undefined) throw new ProjectionRecordsInvalid();
      const bytes = Buffer.concat(selected.map(chunk => Buffer.from(chunk)));
      if (bytes.byteLength !== row.content.byteLength) {
        throw new ProjectionRecordsInvalid();
      }
      return bytes.toString('utf8');
    });
  }

  async #questions(
    request: ReviewQuestionsViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewQuestionsView> {
    if (entry === undefined) {
      return {
        kind: 'review.questions',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const selectedEntry = await this.#selectedSnapshotEntry(entry, request.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) {
      return {
        kind: 'review.questions',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
      };
    }
    const snapshot = await this.#snapshot(selectedEntry, index.stateVersion);
    const { status: snapshotStatus, contextStatus } = await this.#snapshotStatus(snapshot);
    const allIdentities = [...entry.openDraftIdentities, ...entry.questionIdentities];
    let identities: readonly string[] = allIdentities;
    let selected: readonly string[];
    let records: readonly StateRecord[];
    if (request.reviewSnapshotIdentity === undefined) {
      selected = identities.slice(request.offset, request.offset + request.limit);
      records = await this.#readRecords(selected, index.stateVersion);
    } else {
      const allRecords = await this.#readRecords(allIdentities, index.stateVersion);
      const recordsByIdentity = new Map(allRecords.map(record => [record.recordIdentity, record]));
      identities = allRecords.flatMap(record => {
        if (record.kind === 'review.question-draft') {
          const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
          if (draft.reviewIdentity !== entry.reviewIdentity) {
            throw new ProjectionRecordsInvalid();
          }
          return draft.reviewSnapshotIdentity === request.reviewSnapshotIdentity ? [record.recordIdentity] : [];
        }
        if (record.kind !== 'review.question') {
          throw new ProjectionRecordsInvalid();
        }
        const question = parseReviewQuestion(decodeReviewingPayload(record.payload));
        if (question.reviewIdentity !== entry.reviewIdentity) {
          throw new ProjectionRecordsInvalid();
        }
        return question.reviewSnapshotIdentity === request.reviewSnapshotIdentity ? [record.recordIdentity] : [];
      });
      selected = identities.slice(request.offset, request.offset + request.limit);
      records = selected.map(identity => {
        const record = recordsByIdentity.get(identity);
        if (record === undefined) throw new ProjectionRecordsInvalid();
        return record;
      });
    }
    const current = new Map(entry.currentDispositions.map(item => [item.questionIdentity, item]));
    const selectedQuestions = new Set(
      selected.filter(identity => entry.questionIdentities.includes(identity as ReviewQuestionIdentity)),
    );
    const responseLinks = entry.responses.filter(item => selectedQuestions.has(item.questionIdentity));
    const responseRecords = await this.#readRecords(
      responseLinks.map(item => item.responseIdentity),
      index.stateVersion,
    );
    const responses = new Map<
      ReviewQuestionIdentity,
      {
        readonly identity: ReviewResponseIdentity;
        readonly body: string;
      }
    >();
    responseRecords.forEach((record, responseOffset) => {
      if (record.kind !== 'review.response' || record.recordClass !== 'immutable') {
        throw new ProjectionRecordsInvalid();
      }
      const response = parseReviewResponse(decodeReviewingPayload(record.payload));
      const link = responseLinks[responseOffset];
      if (
        link === undefined ||
        response.reviewIdentity !== entry.reviewIdentity ||
        response.questionIdentity !== link.questionIdentity ||
        response.responseIdentity !== link.responseIdentity
      ) {
        throw new ProjectionRecordsInvalid();
      }
      responses.set(link.questionIdentity, {
        identity: link.responseIdentity,
        body: response.body,
      });
    });
    const items = records.map((record, offset): ReviewProjectedQuestionItem => {
      const identity = selected[offset];
      if (identity === undefined) throw new ProjectionRecordsInvalid();
      if (record.kind === 'review.question-draft') {
        const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
        if (
          draft.reviewIdentity !== entry.reviewIdentity ||
          draft.status !== 'open' ||
          record.recordIdentity !== identity
        ) {
          throw new ProjectionRecordsInvalid();
        }
        return {
          kind: 'question-draft',
          itemIdentity: record.recordIdentity as ReviewQuestionDraftIdentity,
          revision: record.revision,
          body: textPreview(draft.body),
          target: questionTarget(draft.anchor),
          actions: questionActions(
            entry,
            index.stateVersion,
            record.recordIdentity as ReviewQuestionDraftIdentity,
            'draft',
          ),
        };
      }
      if (record.kind !== 'review.question') throw new ProjectionRecordsInvalid();
      const question = parseReviewQuestion(decodeReviewingPayload(record.payload));
      if (question.reviewIdentity !== entry.reviewIdentity || record.recordIdentity !== identity) {
        throw new ProjectionRecordsInvalid();
      }
      const questionIdentity = record.recordIdentity as ReviewQuestionIdentity;
      const response = responses.get(questionIdentity);
      return {
        kind: 'question',
        itemIdentity: questionIdentity,
        reviewBatchIdentity: question.reviewBatchIdentity,
        body: textPreview(question.body),
        target: questionTarget(question.anchor),
        ...(current.get(questionIdentity) === undefined
          ? {}
          : { historicalDisposition: current.get(questionIdentity)!.disposition }),
        ...(response === undefined
          ? {}
          : {
              response: {
                responseIdentity: response.identity,
                body: completeText(response.body),
              },
            }),
        actions: questionActions(
          entry,
          index.stateVersion,
          record.recordIdentity as ReviewQuestionIdentity,
          'question',
        ),
      };
    });
    const next = request.offset + items.length;
    return {
      kind: 'review.questions',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      header: this.#header(selectedEntry, snapshotStatus, snapshot, index.payload.currentReviewIdentity, contextStatus),
      list: {
        totalItems: identities.length,
        offset: request.offset,
        items,
        nextOffset: next < identities.length ? next : null,
      },
      actions: reviewActions(entry, index.stateVersion, snapshotStatus),
    };
  }

  async #questionLocation(
    request: ReviewQuestionLocationViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewQuestionLocationView> {
    if (
      entry === undefined ||
      (!entry.draftIdentities.includes(request.itemIdentity as ReviewQuestionDraftIdentity) &&
        !entry.questionIdentities.includes(request.itemIdentity as ReviewQuestionIdentity))
    ) {
      return {
        kind: 'review.question-location',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        itemIdentity: request.itemIdentity,
        reason: 'question-not-found',
      };
    }
    const [record] = await this.#readRecords([request.itemIdentity], index.stateVersion);
    if (record === undefined) throw new ProjectionRecordsInvalid();
    let anchor: ReviewQuestionAnchor;
    if (record.kind === 'review.question-draft') {
      const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
      if (draft.reviewIdentity !== entry.reviewIdentity) {
        throw new ProjectionRecordsInvalid();
      }
      anchor = draft.anchor;
    } else if (record.kind === 'review.question') {
      const question = parseReviewQuestion(decodeReviewingPayload(record.payload));
      if (question.reviewIdentity !== entry.reviewIdentity) {
        throw new ProjectionRecordsInvalid();
      }
      anchor = question.anchor;
    } else {
      throw new ProjectionRecordsInvalid();
    }
    const selectedEntry = await this.#selectedSnapshotEntry(entry, anchor.reviewSnapshotIdentity, index.stateVersion);
    if (selectedEntry === undefined) throw new ProjectionRecordsInvalid();
    const snapshot = await this.#snapshot(selectedEntry, index.stateVersion);
    let fileAbsolute = anchor.fileAbsolute;
    if (fileAbsolute === undefined) {
      const files = await this.#manifestFiles(
        selectedEntry,
        snapshot,
        0,
        snapshot.manifest.totalFiles,
        index.stateVersion,
      );
      const located = files.findIndex(file => file.fileIdentity === anchor.fileIdentity);
      if (located < 0) throw new ProjectionRecordsInvalid();
      fileAbsolute = located;
    }
    const baseTarget = {
      ...questionTarget(anchor),
      fileAbsolute,
    };
    if (anchor.kind === 'review.whole-file') {
      return {
        kind: 'review.question-location',
        status: 'available',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        itemIdentity: request.itemIdentity,
        target: baseTarget,
      };
    }
    const lineTarget = baseTarget as Extract<ReviewProjectedQuestionTarget, { readonly kind: 'review.diff-line' }>;
    if (anchor.rowIdentity !== undefined && anchor.rowAbsolute !== undefined) {
      return {
        kind: 'review.question-location',
        status: 'available',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        itemIdentity: request.itemIdentity,
        target: lineTarget,
      };
    }
    const [fileRecord] = await this.#readRecords(
      [fileRecordIdentity(selectedEntry.reviewSnapshotIdentity, anchor.fileIdentity)],
      index.stateVersion,
    );
    if (fileRecord?.kind !== 'review.snapshot-file' || fileRecord.recordClass !== 'immutable') {
      throw new ProjectionRecordsInvalid();
    }
    const file = parseReviewSnapshotFile(decodeReviewingPayload(fileRecord.payload));
    if (
      file.reviewIdentity !== entry.reviewIdentity ||
      file.reviewSnapshotIdentity !== selectedEntry.reviewSnapshotIdentity ||
      file.file.fileIdentity !== anchor.fileIdentity
    ) {
      throw new ProjectionRecordsInvalid();
    }
    if (file.diff.status !== 'available') {
      return {
        kind: 'review.question-location',
        status: 'unavailable',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        itemIdentity: request.itemIdentity,
        reason: 'diff-unavailable',
      };
    }
    for (let offset = 0; offset < file.diff.totalRows; offset += REVIEW_DIFF_WINDOW_ROWS) {
      const rows = await this.#diffRows(
        selectedEntry,
        anchor.fileIdentity,
        file.diff.totalRows,
        offset,
        REVIEW_DIFF_WINDOW_ROWS,
        index.stateVersion,
      );
      const local = rows.findIndex(row => (anchor.side === 'old' ? row.oldLine : row.newLine) === anchor.line);
      if (local < 0) continue;
      const row = rows[local];
      if (row === undefined) throw new ProjectionRecordsInvalid();
      return {
        kind: 'review.question-location',
        status: 'available',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: entry.reviewIdentity,
        itemIdentity: request.itemIdentity,
        target: {
          ...lineTarget,
          rowIdentity: row.rowIdentity,
          rowAbsolute: offset + local,
        },
      };
    }
    throw new ProjectionRecordsInvalid();
  }

  async #questionBody(
    request: ReviewQuestionBodyViewRequest,
    index: LoadedIndex,
    entry: ReviewIndexEntry | undefined,
  ): Promise<ReviewQuestionBodyView> {
    if (
      entry === undefined ||
      (!entry.draftIdentities.includes(request.itemIdentity as ReviewQuestionDraftIdentity) &&
        !entry.questionIdentities.includes(request.itemIdentity as ReviewQuestionIdentity))
    ) {
      return {
        kind: 'review.question-body',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        reviewIdentity: request.reviewIdentity,
        itemIdentity: request.itemIdentity,
      };
    }
    const [record] = await this.#readRecords([request.itemIdentity], index.stateVersion);
    if (record === undefined) throw new ProjectionRecordsInvalid();
    let body: string;
    if (record.kind === 'review.question-draft') {
      body = parseReviewQuestionDraft(decodeReviewingPayload(record.payload)).body;
    } else if (record.kind === 'review.question') {
      body = parseReviewQuestion(decodeReviewingPayload(record.payload)).body;
    } else {
      throw new ProjectionRecordsInvalid();
    }
    const bytes = Buffer.from(body, 'utf8');
    const window = bytes.subarray(request.offset, request.offset + request.length);
    return {
      kind: 'review.question-body',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      reviewIdentity: request.reviewIdentity,
      itemIdentity: request.itemIdentity,
      window: {
        offset: request.offset,
        bytesBase64: encodeBytesBase64(window),
        byteLength: window.byteLength,
        totalByteLength: bytes.byteLength,
        complete: request.offset + window.byteLength >= bytes.byteLength,
      },
    };
  }

  async #commandResult(request: ReviewCommandResultViewRequest): Promise<ReviewCommandResultView> {
    const read = await this.#state.read({
      recordIdentities: [commandRecordIdentity(request.commandIdentity)],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new ProjectionRecordsInvalid();
    const record = read.records[0];
    if (record === undefined) {
      return {
        kind: 'review.command-result',
        status: 'not-found',
        projectionVersion: WORKSPACE_PROJECTION_VERSION,
        stateVersion: read.stateVersion,
        commandIdentity: request.commandIdentity,
      };
    }
    if (record.kind !== 'review.command' || record.recordClass !== 'immutable') {
      throw new ProjectionRecordsInvalid();
    }
    const command = parseReviewingCommandRecord(decodeReviewingPayload(record.payload));
    if (command.result.commandIdentity !== request.commandIdentity) {
      throw new ProjectionRecordsInvalid();
    }
    return {
      kind: 'review.command-result',
      status: 'available',
      projectionVersion: WORKSPACE_PROJECTION_VERSION,
      stateVersion: read.stateVersion,
      commandIdentity: request.commandIdentity,
      committedStateVersion: command.result.stateVersion,
      result: command.result,
    };
  }
}
