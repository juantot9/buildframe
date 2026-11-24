import type {
  ContextSourceCandidate,
  ContextSourceIncompleteReason,
  ContextSourceOccurrenceConflict,
} from '../contextEvidence.js';
import type {
  ReviewBasisCommit,
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewContextContributionIdentity,
  ReviewContextContributionPayload,
  ReviewContextContributionUnavailableReason,
  ReviewContextRule,
  ReviewContextRuleDecision,
  ReviewContextRuleIdentity,
  ReviewContextSelectionIdentity,
  ReviewIdentity,
  ReviewMessageIdentity,
  ReviewMessageMaterialIdentity,
  ReviewProjectedDiffUnavailableReason,
  ReviewQuestionAnchor,
  ReviewQuestionDisposition,
  ReviewQuestionDraftIdentity,
  ReviewQuestionIdentity,
  ReviewResponseIdentity,
  ReviewSnapshotContextContentIdentity,
  ReviewSnapshotContextContentPayload,
  ReviewSnapshotContextItem,
  ReviewSnapshotContextPayload,
  ReviewSnapshotIdentity,
  ReviewSnapshotPayload,
  ReviewingCommandAccepted,
} from '../reviewing/index.js';
import type {
  CurrentChangesComparisonBasis,
  EvidencePath,
  ReviewCommitGraphRow,
  ReviewComparedState,
  ReviewComparisonBasis,
  ReviewComparisonCommitEndpoint,
  ReviewComparisonResolutionIdentity,
  ReviewComparisonSelection,
  ReviewComparisonUnavailableReason,
} from '../workspaceEvidence/index.js';
import { WORKSPACE_PROJECTION_VERSION } from './limits.js';
import type {
  ReviewSearchItem,
  ReviewSearchPreviewView,
  ReviewSearchPreviewViewRequest,
  ReviewSearchSnippet,
  ReviewSearchView,
  ReviewSearchViewRequest,
} from './searchContracts.js';
import type {
  ReviewLiveFilesView,
  ReviewLiveFilesViewRequest,
  ReviewLiveFolderView,
  ReviewLiveFolderViewRequest,
  ReviewLiveFoldersView,
  ReviewLiveFoldersViewRequest,
  ReviewLiveFileContentView,
  ReviewLiveFileContentViewRequest,
} from './liveFileContracts.js';

export type {
  ReviewSearchItem,
  ReviewSearchPreviewView,
  ReviewSearchPreviewViewRequest,
  ReviewSearchSnippet,
  ReviewSearchView,
  ReviewSearchViewRequest,
};
export type * from './liveFileContracts.js';

export interface WorkspaceHomeViewRequest {
  readonly kind: 'workspace.home';
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewManifestViewRequest {
  readonly kind: 'review.manifest';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewDiffViewRequest {
  readonly kind: 'review.diff';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly fileIdentity: string;
  readonly offset: number;
  readonly limit: number;
  /** One-based source line whose row should be the first row of the window. */
  readonly anchorLine?: number;
}

export interface ReviewLiveManifestViewRequest {
  readonly kind: 'review.live-manifest';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewContinuationViewRequest {
  readonly kind: 'review.continuation';
  readonly reviewIdentity: ReviewIdentity;
}

export interface ReviewLiveDiffViewRequest {
  readonly kind: 'review.live-diff';
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly fileIdentity: string;
  readonly offset: number;
  readonly limit: number;
  /** One-based source line whose row should be the first row of the window. */
  readonly anchorLine?: number;
}

export interface ReviewVersionsViewRequest {
  readonly kind: 'review.versions';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewBasesViewRequest {
  readonly kind: 'review.bases';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewMessagesViewRequest {
  readonly kind: 'review.messages';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBasisIdentity?: ReviewBasisIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewMessageOriginViewRequest {
  readonly kind: 'review.message-origin';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
}

export interface ReviewMessageBodyViewRequest {
  readonly kind: 'review.message-body';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  /** Bodies are read one part at a time; absent means the committed Message body. */
  readonly part?: 'message' | 'response';
  readonly offset: number;
  readonly length: number;
}

/**
 * A moment in a Review's history whose code BuildFrame knows: the last commit
 * (start), the code when a Message was sent, the code right after it was
 * answered, and the working tree now.
 */
export type ReviewHistoryPoint =
  | { readonly kind: 'start' }
  | { readonly kind: 'sent'; readonly reviewMessageIdentity: ReviewMessageIdentity }
  | { readonly kind: 'answered'; readonly reviewMessageIdentity: ReviewMessageIdentity }
  | { readonly kind: 'now' };

/** The steps of a Review's history, oldest first. */
export interface ReviewHistoryViewRequest {
  readonly kind: 'review.history';
  readonly reviewIdentity: ReviewIdentity;
}

/** The files that changed between two points of a Review's history. */
export interface ReviewStepChangesViewRequest {
  readonly kind: 'review.step-changes';
  readonly reviewIdentity: ReviewIdentity;
  readonly from: ReviewHistoryPoint;
  readonly to: ReviewHistoryPoint;
  readonly offset: number;
  readonly limit: number;
}

/** One file's before → after rows between two points of a Review's history. */
export interface ReviewStepChangesDiffViewRequest {
  readonly kind: 'review.step-changes-diff';
  readonly reviewIdentity: ReviewIdentity;
  readonly from: ReviewHistoryPoint;
  readonly to: ReviewHistoryPoint;
  readonly fileIdentity: string;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewQuestionsViewRequest {
  readonly kind: 'review.questions';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewQuestionLocationViewRequest {
  readonly kind: 'review.question-location';
  readonly reviewIdentity: ReviewIdentity;
  readonly itemIdentity: ReviewQuestionDraftIdentity | ReviewQuestionIdentity;
}

export interface ReviewQuestionBodyViewRequest {
  readonly kind: 'review.question-body';
  readonly reviewIdentity: ReviewIdentity;
  readonly itemIdentity: ReviewQuestionDraftIdentity | ReviewQuestionIdentity;
  readonly offset: number;
  readonly length: number;
}

export interface ReviewCommandResultViewRequest {
  readonly kind: 'review.command-result';
  readonly commandIdentity: string;
}

export interface ReviewContextSelectionViewRequest {
  readonly kind: 'review.context-selection';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewContextContributionContentViewRequest {
  readonly kind: 'review.context-contribution-content';
  readonly reviewIdentity: ReviewIdentity;
  readonly contributionIdentity: ReviewContextContributionIdentity;
  readonly offset: number;
  readonly length: number;
}

export interface ReviewSnapshotContextViewRequest {
  readonly kind: 'review.snapshot-context';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface ReviewSnapshotContextContentViewRequest {
  readonly kind: 'review.snapshot-context-content';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly contentIdentity: ReviewSnapshotContextContentIdentity;
  readonly offset: number;
  readonly length: number;
}

export interface ReviewComparisonPreviewViewRequest {
  readonly kind: 'review.comparison-preview';
  readonly selection: ReviewComparisonSelection;
}

export interface ReviewCommitGraphViewRequest {
  readonly kind: 'review.commit-graph';
}

export type WorkspaceProjectionViewRequest =
  | WorkspaceHomeViewRequest
  | ReviewManifestViewRequest
  | ReviewDiffViewRequest
  | ReviewLiveManifestViewRequest
  | ReviewContinuationViewRequest
  | ReviewLiveDiffViewRequest
  | ReviewLiveFilesViewRequest
  | ReviewLiveFolderViewRequest
  | ReviewLiveFoldersViewRequest
  | ReviewLiveFileContentViewRequest
  | ReviewVersionsViewRequest
  | ReviewBasesViewRequest
  | ReviewMessagesViewRequest
  | ReviewMessageOriginViewRequest
  | ReviewMessageBodyViewRequest
  | ReviewHistoryViewRequest
  | ReviewStepChangesViewRequest
  | ReviewStepChangesDiffViewRequest
  | ReviewQuestionsViewRequest
  | ReviewQuestionLocationViewRequest
  | ReviewSearchViewRequest
  | ReviewSearchPreviewViewRequest
  | ReviewQuestionBodyViewRequest
  | ReviewCommandResultViewRequest
  | ReviewContextSelectionViewRequest
  | ReviewContextContributionContentViewRequest
  | ReviewSnapshotContextViewRequest
  | ReviewSnapshotContextContentViewRequest
  | ReviewComparisonPreviewViewRequest
  | ReviewCommitGraphViewRequest;

export type WorkspaceProjectionViewScope =
  | WorkspaceHomeViewRequest
  | ReviewManifestViewRequest
  | ReviewDiffViewRequest
  | ReviewLiveManifestViewRequest
  | ReviewLiveFilesViewRequest
  | ReviewLiveFileContentViewRequest
  | ReviewContinuationViewRequest
  | ReviewVersionsViewRequest
  | ReviewBasesViewRequest
  | ReviewMessagesViewRequest
  | ReviewQuestionsViewRequest;

export interface ReviewProjectionHeader {
  readonly title: 'Review current changes' | 'Review selected changes';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: string;
  readonly latestReviewSnapshotIdentity: string;
  /** Present when the projected Snapshot belongs to the saved Version lineage; basis-only captures are not Versions. */
  readonly version?: {
    readonly ordinal: number;
    readonly total: number;
    readonly isLatest: boolean;
  };
  readonly retention: 'current' | 'previous';
  readonly continuedFromReviewIdentity?: ReviewIdentity;
  readonly historicalOutcome?: 'completed' | 'cancelled';
  readonly snapshotStatus: 'current' | 'stale' | 'unverified';
  /** Owner-derived verdict for the supporting-context basis alone. */
  readonly contextStatus: 'current' | 'stale' | 'unverified';
  readonly comparison?: {
    readonly basis: string;
    readonly compared: string;
    readonly scope?: {
      readonly kind: 'exact-paths';
      readonly entries: readonly {
        readonly pathBytesBase64: string;
        readonly inclusion: 'ordinary' | 'include-ignored';
      }[];
    };
  };
}

export type ReviewProjectionBlockerCode =
  | 'another-review-is-active'
  | 'review-capacity-reached'
  | 'review-is-not-active'
  | 'review-is-not-current'
  | 'no-question-drafts'
  | 'open-question-drafts'
  | 'questions-need-judgment'
  | 'questions-remain-open'
  | 'review-snapshot-changed'
  | 'review-snapshot-unavailable'
  | 'comparison-has-no-changes';

export interface ReviewProjectedBlocker {
  readonly code: ReviewProjectionBlockerCode;
  readonly identities: readonly string[];
  readonly correctiveAction:
    | 'open-active-review'
    | 'create-question'
    | 'commit-question-drafts'
    | 'record-question-judgment'
    | 'resolve-open-question'
    | 'return-to-review'
    | 'start-new-review'
    | 'retry-inspection'
    | 'choose-comparison'
    | 'none';
}

export interface ReviewGateBasis {
  readonly action: ReviewProjectedActionKind;
  readonly expectedStateVersion: number;
  readonly reviewIdentity?: ReviewIdentity;
  readonly reviewSnapshotIdentity?: string;
  readonly targetIdentities: readonly string[];
}

export type ReviewProjectedActionKind =
  | 'review.current-changes.start'
  | 'review.comparison.start'
  | 'review.comparison.continue-live'
  | 'review.question.ask'
  | 'review.question-draft.create'
  | 'review.question-draft.revise'
  | 'review.question-batch.commit'
  | 'review.question.disposition.answered'
  | 'review.question.disposition.open'
  | 'review.question.disposition.dismissed'
  | 'review.complete'
  | 'review.cancel';

export interface ReviewProjectedAction {
  readonly kind: ReviewProjectedActionKind;
  readonly availability: 'direct' | 'blocked';
  /** Exact same-version basis from which a caller may form the closed command. */
  readonly gateBasis: ReviewGateBasis;
  readonly blockers: readonly ReviewProjectedBlocker[];
}

export interface WorkspaceHomeReviewItem {
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: string;
  readonly retention: 'current' | 'previous';
  readonly continuedFromReviewIdentity?: ReviewIdentity;
  readonly historicalOutcome?: 'completed' | 'cancelled';
  /** Review outcome time, or start time for a pre-outcome item. */
  readonly recordedAt?: string;
  readonly totalFiles: number;
  /** Messages sent to an agent in this Review. */
  readonly messages: number;
  /** The counts below cover Questions from Reviews made before Messages. */
  readonly openDrafts: number;
  readonly questions: number;
  readonly questionsNeedingJudgment: number;
  readonly openQuestions: number;
}

export interface WorkspaceHomeView {
  readonly kind: 'workspace.home';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly header: {
    readonly title: 'Home';
    readonly totalReviews: number;
    readonly totalPastReviews: number;
    readonly currentReviewIdentity?: ReviewIdentity;
  };
  readonly currentReview?: WorkspaceHomeReviewItem;
  /** Every retained non-current Review, newest first. */
  readonly reviews: {
    readonly offset: number;
    readonly items: readonly WorkspaceHomeReviewItem[];
    readonly nextOffset: number | null;
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export type ReviewProjectedContentStatus = 'available' | 'too-large' | 'unavailable' | 'unsupported';

export interface ReviewProjectedFileSide {
  readonly path: string;
  readonly pathBytesBase64: string;
  readonly kind: 'regular' | 'symlink' | 'nested-workspace' | 'special' | 'unknown';
  readonly byteLength: number | null;
  readonly content: ReviewProjectedContentStatus;
}

export interface ReviewProjectedScopeMembership {
  readonly selectionPath: string;
  readonly selectionPathBytesBase64: string;
  readonly selectionKind: 'file' | 'directory';
  readonly inclusion: 'ordinary' | 'explicit-ignored';
  readonly matchedSides: readonly ('old' | 'new')[];
}

export interface ReviewProjectedFile {
  readonly fileIdentity: string;
  readonly status:
    | 'added'
    | 'deleted'
    | 'modified'
    | 'renamed'
    | 'copied'
    | 'mode-changed'
    | 'type-changed'
    | 'staging-only';
  readonly displayPath: string;
  readonly oldSide?: ReviewProjectedFileSide;
  readonly newSide?: ReviewProjectedFileSide;
  readonly scopeMembership?: readonly ReviewProjectedScopeMembership[];
}

export interface ReviewManifestAvailableView {
  readonly kind: 'review.manifest';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly header: ReviewProjectionHeader;
  readonly manifest: {
    readonly totalFiles: number;
    readonly identity: string;
    readonly offset: number;
    readonly files: readonly ReviewProjectedFile[];
    readonly nextOffset: number | null;
  };
  readonly questions: {
    readonly openDrafts: number;
    readonly total: number;
    readonly needingJudgment: number;
    readonly open: number;
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export interface ReviewManifestNotFoundView {
  readonly kind: 'review.manifest';
  readonly status: 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
}

export type ReviewManifestView = ReviewManifestAvailableView | ReviewManifestNotFoundView;

export interface ReviewProjectedDiffRow {
  readonly rowIdentity: string;
  readonly kind: 'context' | 'deletion' | 'addition';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly text: {
    readonly encoding: 'utf8';
    readonly bytesBase64: string;
    readonly byteLength: number;
    readonly totalByteLength: number;
    readonly truncated: boolean;
  };
}

export interface ReviewDiffAvailableView {
  readonly kind: 'review.diff';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly header: ReviewProjectionHeader;
  readonly file: ReviewProjectedFile;
  /** Absolute row ordinal of the first addition/deletion, if the file has one. */
  readonly firstChangedRow?: number;
  readonly window: {
    readonly totalRows: number;
    readonly offset: number;
    readonly rows: readonly ReviewProjectedDiffRow[];
    readonly nextOffset: number | null;
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export interface ReviewDiffUnavailableView {
  readonly kind: 'review.diff';
  readonly status: 'unavailable' | 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly fileIdentity: string;
  readonly reason: ReviewProjectedDiffUnavailableReason | 'review-not-found' | 'snapshot-not-found' | 'file-not-found';
  readonly header?: ReviewProjectionHeader;
  readonly file?: ReviewProjectedFile;
  readonly actions?: readonly ReviewProjectedAction[];
}

export type ReviewDiffView = ReviewDiffAvailableView | ReviewDiffUnavailableView;

export interface ReviewLiveManifestAvailableView {
  readonly kind: 'review.live-manifest';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly latestReviewSnapshotIdentity: string;
  readonly liveChangesIdentity: string;
  readonly matchesLatestSnapshot: boolean;
  readonly manifest: {
    readonly totalFiles: number;
    readonly offset: number;
    readonly files: readonly ReviewProjectedFile[];
    readonly nextOffset: number | null;
  };
}

export interface ReviewLiveManifestUnavailableView {
  readonly kind: 'review.live-manifest';
  readonly status: 'unverified' | 'not-found' | 'fixed';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly latestReviewSnapshotIdentity?: string;
  readonly reason: 'inspection-failed' | 'review-not-found' | 'review-not-current' | 'fixed-comparison';
}

export type ReviewLiveManifestView = ReviewLiveManifestAvailableView | ReviewLiveManifestUnavailableView;

export interface ReviewLiveDiffAvailableView {
  readonly kind: 'review.live-diff';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly latestReviewSnapshotIdentity: string;
  readonly liveChangesIdentity: string;
  readonly matchesLatestSnapshot: boolean;
  readonly file: ReviewProjectedFile;
  /** Absolute row ordinal of the first addition/deletion, if the file has one. */
  readonly firstChangedRow?: number;
  readonly window: {
    readonly totalRows: number;
    readonly offset: number;
    readonly rows: readonly ReviewProjectedDiffRow[];
    readonly nextOffset: number | null;
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export interface ReviewLiveDiffUnavailableView {
  readonly kind: 'review.live-diff';
  readonly status: 'unavailable' | 'not-found' | 'fixed' | 'moved';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly liveChangesIdentity: string;
  readonly fileIdentity: string;
  readonly reason:
    | ReviewProjectedDiffUnavailableReason
    | 'inspection-failed'
    | 'review-not-found'
    | 'review-not-current'
    | 'file-not-found'
    | 'fixed-comparison'
    | 'live-changes-moved';
  readonly file?: ReviewProjectedFile;
  readonly actions?: readonly ReviewProjectedAction[];
}

export type ReviewLiveDiffView = ReviewLiveDiffAvailableView | ReviewLiveDiffUnavailableView;

export interface ReviewContinuationAvailableView {
  readonly kind: 'review.continuation';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly sourceReviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly sourceBasis: ReviewComparisonBasis;
  readonly savedEndpoint: ReviewComparisonCommitEndpoint;
  readonly currentHead: CurrentChangesComparisonBasis;
  readonly headMoved: boolean;
  readonly liveChangesIdentity: string;
  readonly currentHeadAction: ReviewProjectedAction;
  /** Choosing the saved endpoint remains a distinct, non-inferred composite intent. */
  readonly savedEndpointChoice: {
    readonly kind: 'review.comparison.continue-composite';
    readonly status: 'separate-intent';
  };
}

export interface ReviewContinuationUnavailableView {
  readonly kind: 'review.continuation';
  readonly status: 'unavailable' | 'unverified' | 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly sourceReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly reason: 'review-not-found' | 'review-not-current' | 'review-not-fixed' | 'inspection-failed';
}

export type ReviewContinuationView = ReviewContinuationAvailableView | ReviewContinuationUnavailableView;

export interface ReviewVersionItem {
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly ordinal: number;
  readonly isLatest: boolean;
  readonly totalFiles: number;
  readonly verificationAtCapture: ReviewSnapshotPayload['workspaceVerificationAtCapture'];
}

export interface ReviewVersionsAvailableView {
  readonly kind: 'review.versions';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly latestReviewSnapshotIdentity: string;
  readonly versions: {
    readonly total: number;
    readonly offset: number;
    /** Newest first; ordinal remains the stable oldest-first chronology. */
    readonly items: readonly ReviewVersionItem[];
    readonly nextOffset: number | null;
  };
}

export interface ReviewVersionsNotFoundView {
  readonly kind: 'review.versions';
  readonly status: 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
}

export type ReviewVersionsView = ReviewVersionsAvailableView | ReviewVersionsNotFoundView;

export interface ReviewBasisItemBase {
  readonly reviewBasisIdentity: ReviewBasisIdentity;
  readonly parentReviewBasisIdentity?: ReviewBasisIdentity;
  /** Parent-link depth in this Review's navigational tree. */
  readonly depth: number;
}

export type ReviewBasisItem =
  | (ReviewBasisItemBase & {
      readonly kind: 'live';
      readonly source: { readonly kind: 'live-working-diff' };
      readonly capture: { readonly status: 'live' };
    })
  | (ReviewBasisItemBase & {
      readonly kind: 'git-commit';
      readonly source: { readonly kind: 'git-commit'; readonly commit: ReviewBasisCommit };
      readonly capture:
        | { readonly status: 'captured'; readonly reviewSnapshotIdentity: ReviewSnapshotIdentity }
        | { readonly status: 'capture-on-open' };
    })
  | (ReviewBasisItemBase & {
      readonly kind: 'saved-review-point';
      readonly source: {
        readonly kind: 'review-snapshot';
        readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      };
      readonly capture: { readonly status: 'captured'; readonly reviewSnapshotIdentity: ReviewSnapshotIdentity };
    })
  | (ReviewBasisItemBase & {
      readonly kind: 'change-event';
      readonly source: {
        readonly kind: 'changes-observed-after-response';
        readonly responseIdentity: ReviewResponseIdentity;
        readonly label: 'changes observed after this Response';
      };
      readonly capture: { readonly status: 'captured'; readonly reviewSnapshotIdentity: ReviewSnapshotIdentity };
    });

export type ReviewBasisGitDiscovery =
  | { readonly status: 'available'; readonly truncated: boolean }
  | { readonly status: 'unavailable'; readonly reason: 'revision-not-found' | 'inspection-failed' };

export interface ReviewBasesAvailableView {
  readonly kind: 'review.bases';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly liveReviewBasisIdentity: ReviewBasisIdentity;
  readonly gitDiscovery: ReviewBasisGitDiscovery;
  readonly bases: {
    readonly total: number;
    readonly offset: number;
    /** Recorded tree nodes first, followed by uncaptured commits in Git's observed order. */
    readonly items: readonly ReviewBasisItem[];
    readonly nextOffset: number | null;
  };
}

export interface ReviewBasesNotFoundView {
  readonly kind: 'review.bases';
  readonly status: 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
}

export type ReviewBasesView = ReviewBasesAvailableView | ReviewBasesNotFoundView;

export interface ReviewMessageListItem {
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly location: { readonly file: EvidencePath; readonly line: number };
  readonly body: ReviewProjectedTextWindow;
  readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
  readonly changeObservation?:
    | { readonly outcome: 'unchanged' }
    | {
        readonly outcome: 'forked';
        readonly reviewBasisIdentity: ReviewBasisIdentity;
        /**
         * The files that changed while it was answered, by the agent or anyone
         * else; the first few paths and how many in all. Absent when the code
         * at send was not kept or a commit moved in between.
         */
        readonly changedFiles?: { readonly paths: readonly EvidencePath[]; readonly total: number };
      };
  readonly response?: {
    readonly responseIdentity: ReviewResponseIdentity;
    readonly body: ReviewProjectedTextWindow;
  };
}

export interface ReviewStepChangedFile {
  readonly fileIdentity: string;
  readonly path: EvidencePath;
  readonly change: 'modified' | 'added' | 'deleted';
  /** Absent when the file is not text or too large to compare. */
  readonly lines?: { readonly added: number; readonly removed: number };
}

/**
 * One stretch of a Review's history between two neighbouring points.
 * `answer`: while one Message was answered, by the agent or anyone else.
 * `outside`: between answers, most likely the person reviewing.
 * `mixed`: both, where BuildFrame did not keep the code at send time, or a
 * Message was never answered.
 */
export interface ReviewHistoryStep {
  readonly from: ReviewHistoryPoint;
  readonly to: ReviewHistoryPoint;
  readonly kind: 'answer' | 'outside' | 'mixed';
  /** The Messages (1-based, in send order) sent during this step. */
  readonly messageOrdinals: readonly number[];
  readonly changes:
    | {
        readonly status: 'changed';
        /** The first few paths; `total` counts every file. */
        readonly paths: readonly EvidencePath[];
        readonly total: number;
      }
    | { readonly status: 'unchanged' }
    /** A commit was made in this stretch and BuildFrame couldn't read what it changed. */
    | { readonly status: 'unavailable'; readonly reason: 'commit-moved' };
  /**
   * Where HEAD moved in this stretch, when it moved. The changes then count
   * what the move brought in as well as what was left uncommitted. Whoever
   * moved it is not known.
   */
  readonly headMove?: ReviewHistoryHeadMove;
}

/**
 * HEAD moving within one stretch of history: `commits` when the new HEAD
 * descends from the old one (`count` commits were added on top), `moved` for
 * anything else, such as a reset, checkout or rebase.
 */
export type ReviewHistoryHeadMove =
  | {
      readonly kind: 'commits';
      readonly from: ReviewBasisCommit;
      readonly to: ReviewBasisCommit;
      readonly count: number;
    }
  | { readonly kind: 'moved'; readonly from: ReviewBasisCommit; readonly to: ReviewBasisCommit };

export type ReviewHistoryView =
  | {
      readonly kind: 'review.history';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      /** Whether the last step ends at the working tree now (the current live Review). */
      readonly reachesNow: boolean;
      /** Every Message in send order, so "#3" names the third. */
      readonly messages: readonly ReviewMessageIdentity[];
      readonly steps: readonly ReviewHistoryStep[];
    }
  | {
      readonly kind: 'review.history';
      readonly status: 'unavailable' | 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      /** History covers Reviews of current changes, not fixed comparisons. */
      readonly reason?: 'fixed-comparison';
    };

/** Why two points cannot be compared: one is unknown, or a commit moved between them. */
export type ReviewStepChangesUnavailableReason = 'point-not-found' | 'commit-moved';

export type ReviewStepChangesView =
  | {
      readonly kind: 'review.step-changes';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
      readonly files: {
        readonly total: number;
        readonly offset: number;
        readonly items: readonly ReviewStepChangedFile[];
        readonly nextOffset: number | null;
      };
    }
  | {
      readonly kind: 'review.step-changes';
      readonly status: 'unavailable' | 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
      readonly reason?: ReviewStepChangesUnavailableReason;
    };

export type ReviewStepChangesDiffView =
  | {
      readonly kind: 'review.step-changes-diff';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
      readonly file: ReviewStepChangedFile;
      readonly window: {
        readonly totalRows: number;
        readonly offset: number;
        readonly rows: readonly ReviewProjectedDiffRow[];
        readonly nextOffset: number | null;
      };
    }
  | {
      readonly kind: 'review.step-changes-diff';
      readonly status: 'unavailable' | 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly from: ReviewHistoryPoint;
      readonly to: ReviewHistoryPoint;
      readonly fileIdentity: string;
      readonly reason?: ReviewStepChangesUnavailableReason | ReviewProjectedDiffUnavailableReason;
      readonly file?: ReviewStepChangedFile;
    };

export interface ReviewMessagesAvailableView {
  readonly kind: 'review.messages';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBasisIdentity?: ReviewBasisIdentity;
  readonly messages: {
    readonly total: number;
    readonly offset: number;
    readonly items: readonly ReviewMessageListItem[];
    readonly nextOffset: number | null;
  };
}

export interface ReviewMessagesNotFoundView {
  readonly kind: 'review.messages';
  readonly status: 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBasisIdentity?: ReviewBasisIdentity;
}

export type ReviewMessagesView = ReviewMessagesAvailableView | ReviewMessagesNotFoundView;

export type ReviewMessageOriginView =
  | {
      readonly kind: 'review.message-origin';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly location: { readonly file: EvidencePath; readonly line: number };
      readonly basis: ReviewBasisItem;
      readonly source:
        | { readonly kind: 'live-working-diff'; readonly drift: 'accepted' }
        | { readonly kind: 'review-snapshot'; readonly reviewSnapshotIdentity: ReviewSnapshotIdentity };
    }
  | {
      readonly kind: 'review.message-origin';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
    };

export type ReviewMessageBodyView =
  | {
      readonly kind: 'review.message-body';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly body: ReviewProjectedTextWindow;
    }
  | {
      readonly kind: 'review.message-body';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewMessageIdentity: ReviewMessageIdentity;
    };

export interface ReviewProjectedTextWindow {
  readonly encoding: 'utf8';
  readonly bytesBase64: string;
  readonly byteLength: number;
  readonly totalByteLength: number;
  readonly truncated: boolean;
}

export type ReviewProjectedQuestionTarget =
  | {
      readonly kind: 'review.diff-line';
      readonly reviewSnapshotIdentity: string;
      readonly fileIdentity: string;
      readonly side: 'old' | 'new';
      readonly line: number;
      /** Exact presentation coordinates; absent only on historical Anchors. */
      readonly fileAbsolute?: number;
      readonly rowIdentity?: string;
      readonly rowAbsolute?: number;
    }
  | {
      readonly kind: 'review.whole-file';
      readonly reviewSnapshotIdentity: string;
      readonly fileIdentity: string;
      readonly side: 'old' | 'new';
      readonly scope: 'file';
      readonly fileAbsolute?: number;
      readonly content: Extract<ReviewQuestionAnchor, { readonly kind: 'review.whole-file' }>['content'];
    };

export interface ReviewQuestionDraftListItem {
  readonly kind: 'question-draft';
  readonly itemIdentity: ReviewQuestionDraftIdentity;
  readonly revision: number;
  readonly body: ReviewProjectedTextWindow;
  readonly target: ReviewProjectedQuestionTarget;
  readonly actions: readonly ReviewProjectedAction[];
}

export interface ReviewQuestionListItem {
  readonly kind: 'question';
  readonly itemIdentity: ReviewQuestionIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly body: ReviewProjectedTextWindow;
  readonly target: ReviewProjectedQuestionTarget;
  /** Historical fact only; ordinary Questions never request a disposition. */
  readonly historicalDisposition?: ReviewQuestionDisposition;
  readonly response?: {
    readonly responseIdentity: ReviewResponseIdentity;
    /** Complete bounded Response body; never a transcript preview. */
    readonly body: ReviewProjectedTextWindow & { readonly truncated: false };
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export type ReviewProjectedQuestionItem = ReviewQuestionDraftListItem | ReviewQuestionListItem;

export interface ReviewQuestionsAvailableView {
  readonly kind: 'review.questions';
  readonly status: 'available';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly header: ReviewProjectionHeader;
  readonly list: {
    readonly totalItems: number;
    readonly offset: number;
    readonly items: readonly ReviewProjectedQuestionItem[];
    readonly nextOffset: number | null;
  };
  readonly actions: readonly ReviewProjectedAction[];
}

export interface ReviewQuestionsNotFoundView {
  readonly kind: 'review.questions';
  readonly status: 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
}

export type ReviewQuestionsView = ReviewQuestionsAvailableView | ReviewQuestionsNotFoundView;

export type ReviewQuestionLocationView =
  | {
      readonly kind: 'review.question-location';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly itemIdentity: ReviewQuestionDraftIdentity | ReviewQuestionIdentity;
      readonly target: ReviewProjectedQuestionTarget;
    }
  | {
      readonly kind: 'review.question-location';
      readonly status: 'not-found' | 'unavailable';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly itemIdentity: ReviewQuestionDraftIdentity | ReviewQuestionIdentity;
      readonly reason: 'question-not-found' | 'diff-unavailable';
    };

export interface ReviewQuestionBodyView {
  readonly kind: 'review.question-body';
  readonly status: 'available' | 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly itemIdentity: ReviewQuestionDraftIdentity | ReviewQuestionIdentity;
  readonly window?: {
    readonly offset: number;
    readonly bytesBase64: string;
    readonly byteLength: number;
    readonly totalByteLength: number;
    readonly complete: boolean;
  };
}

export type ReviewComparisonPreviewView =
  | {
      readonly kind: 'review.comparison-preview';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly selection: ReviewComparisonSelection;
      readonly basis: ReviewComparisonBasis;
      readonly comparedState: ReviewComparedState;
      /** Stable start-command identity of the resolved basis endpoint. */
      readonly basisEndpointIdentity: string | null;
      /** Stable start-command identity of the resolved compared endpoint. */
      readonly comparedEndpointIdentity: string;
      readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
      readonly totalFiles: number;
      readonly action: ReviewProjectedAction;
    }
  | {
      readonly kind: 'review.comparison-preview';
      readonly status: 'unavailable';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly selection: ReviewComparisonSelection;
      readonly reason: ReviewComparisonUnavailableReason;
    };

export type ReviewCommitGraphView =
  | {
      readonly kind: 'review.commit-graph';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly headObjectIdentity: string;
      readonly rows: readonly ReviewCommitGraphRow[];
      readonly truncated: boolean;
    }
  | {
      readonly kind: 'review.commit-graph';
      readonly status: 'unavailable';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reason: 'revision-not-found' | 'inspection-failed';
    };

export interface ReviewContextSelectionCandidate extends ContextSourceCandidate {
  readonly decision: ReviewContextRuleDecision;
}

export type ReviewContextSelectionSourceGroup =
  | {
      readonly kind: 'locator';
      readonly order: number;
      readonly origin: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
    }
  | {
      readonly kind: 'contribution';
      readonly order: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly contributionIdentity: ReviewContextContributionIdentity;
    };

export interface ReviewContextSelectionContribution {
  readonly order: number;
  readonly ruleIdentity: ReviewContextRuleIdentity;
  readonly contribution: ReviewContextContributionPayload;
}

export type ReviewContextSelectionView =
  | {
      readonly kind: 'review.context-selection';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly selectionIdentity: ReviewContextSelectionIdentity;
      readonly selectionRevision: number;
      readonly rules: readonly ReviewContextRule[];
      readonly sourceGroups: readonly ReviewContextSelectionSourceGroup[];
      readonly contributions: readonly ReviewContextSelectionContribution[];
      readonly conflicts: readonly ContextSourceOccurrenceConflict[];
      readonly defaultIgnoredUntracked: 'excluded';
      readonly manifest: {
        readonly status: 'complete' | 'incomplete';
        readonly incompleteReason?: ContextSourceIncompleteReason;
        readonly totalCandidates: number;
        readonly offset: number;
        readonly candidates: readonly ReviewContextSelectionCandidate[];
        readonly nextOffset: number | null;
      };
    }
  | {
      readonly kind: 'review.context-selection';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
    };

export type ReviewContextContributionContentView =
  | {
      readonly kind: 'review.context-contribution-content';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly contributionIdentity: ReviewContextContributionIdentity;
      readonly contribution: ReviewContextContributionPayload;
      readonly window: {
        readonly offset: number;
        readonly bytesBase64: string;
        readonly byteLength: number;
        readonly totalByteLength: number;
        readonly complete: boolean;
      };
    }
  | {
      readonly kind: 'review.context-contribution-content';
      readonly status: 'unavailable';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly contributionIdentity: ReviewContextContributionIdentity;
      readonly contribution: ReviewContextContributionPayload;
      readonly reason: ReviewContextContributionUnavailableReason;
    }
  | {
      readonly kind: 'review.context-contribution-content';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly contributionIdentity: ReviewContextContributionIdentity;
    };

export type ReviewSnapshotContextBasisView =
  | {
      readonly status: 'empty';
      readonly selectionIdentity: ReviewContextSelectionIdentity;
      readonly selectionRevision: 0;
      readonly rules: readonly [];
      readonly defaultIgnoredUntracked: 'excluded';
    }
  | {
      readonly status: 'frozen';
      readonly context: ReviewSnapshotContextPayload;
    };

export type ReviewSnapshotContextView =
  | {
      readonly kind: 'review.snapshot-context';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly basis: ReviewSnapshotContextBasisView;
      readonly manifest: {
        readonly totalItems: number;
        readonly identity: string | null;
        readonly offset: number;
        readonly items: readonly ReviewSnapshotContextItem[];
        readonly nextOffset: number | null;
      };
    }
  | {
      readonly kind: 'review.snapshot-context';
      readonly status: 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
    };

export type ReviewSnapshotContextContentView =
  | {
      readonly kind: 'review.snapshot-context-content';
      readonly status: 'available';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly content: ReviewSnapshotContextContentPayload;
      readonly window: {
        readonly offset: number;
        readonly bytesBase64: string;
        readonly byteLength: number;
        readonly totalByteLength: number;
        readonly complete: boolean;
      };
    }
  | {
      readonly kind: 'review.snapshot-context-content';
      readonly status: 'unavailable' | 'not-found';
      readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity?: ReviewSnapshotIdentity;
      readonly contentIdentity: ReviewSnapshotContextContentIdentity;
      readonly reason?: 'context-empty';
    };

export interface ReviewCommandResultView {
  readonly kind: 'review.command-result';
  readonly status: 'available' | 'not-found';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly commandIdentity: string;
  readonly committedStateVersion?: number;
  readonly result?: ReviewingCommandAccepted;
}

export interface WorkspaceProjectionFailureUpdate<
  Scope extends WorkspaceProjectionViewScope = WorkspaceProjectionViewScope,
> {
  readonly kind: 'workspace.projection-failed';
  readonly status: 'failed';
  readonly projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly scope: Scope;
  readonly reason: 'records-invalid';
}

export type WorkspaceProjectionView =
  | WorkspaceHomeView
  | ReviewManifestView
  | ReviewDiffView
  | ReviewLiveManifestView
  | ReviewContinuationView
  | ReviewLiveDiffView
  | ReviewLiveFilesView
  | ReviewLiveFolderView
  | ReviewLiveFoldersView
  | ReviewLiveFileContentView
  | ReviewVersionsView
  | ReviewBasesView
  | ReviewMessagesView
  | ReviewMessageOriginView
  | ReviewMessageBodyView
  | ReviewHistoryView
  | ReviewStepChangesView
  | ReviewStepChangesDiffView
  | ReviewSearchView
  | ReviewSearchPreviewView
  | ReviewQuestionsView
  | ReviewQuestionLocationView
  | ReviewQuestionBodyView
  | ReviewCommandResultView
  | ReviewContextSelectionView
  | ReviewContextContributionContentView
  | ReviewSnapshotContextView
  | ReviewSnapshotContextContentView
  | ReviewComparisonPreviewView
  | ReviewCommitGraphView; /** Flat request-kind → view lookup; total over every WorkspaceProjectionViewRequest kind. */
export interface WorkspaceProjectionViewByKind {
  'workspace.home': WorkspaceHomeView;
  'review.manifest': ReviewManifestView;
  'review.diff': ReviewDiffView;
  'review.live-manifest': ReviewLiveManifestView;
  'review.continuation': ReviewContinuationView;
  'review.live-diff': ReviewLiveDiffView;
  'review.live-files': ReviewLiveFilesView;
  'review.live-folder': ReviewLiveFolderView;
  'review.live-folders': ReviewLiveFoldersView;
  'review.live-file-content': ReviewLiveFileContentView;
  'review.versions': ReviewVersionsView;
  'review.bases': ReviewBasesView;
  'review.messages': ReviewMessagesView;
  'review.message-origin': ReviewMessageOriginView;
  'review.message-body': ReviewMessageBodyView;
  'review.history': ReviewHistoryView;
  'review.step-changes': ReviewStepChangesView;
  'review.step-changes-diff': ReviewStepChangesDiffView;
  'review.search': ReviewSearchView;
  'review.search-preview': ReviewSearchPreviewView;
  'review.questions': ReviewQuestionsView;
  'review.question-location': ReviewQuestionLocationView;
  'review.question-body': ReviewQuestionBodyView;
  'review.command-result': ReviewCommandResultView;
  'review.context-selection': ReviewContextSelectionView;
  'review.context-contribution-content': ReviewContextContributionContentView;
  'review.snapshot-context': ReviewSnapshotContextView;
  'review.snapshot-context-content': ReviewSnapshotContextContentView;
  'review.comparison-preview': ReviewComparisonPreviewView;
  'review.commit-graph': ReviewCommitGraphView;
}

export type WorkspaceProjectionViewFor<Request extends WorkspaceProjectionViewRequest> =
  WorkspaceProjectionViewByKind[Request['kind']];

export type WorkspaceProjectionViewUpdate = WorkspaceProjectionView | WorkspaceProjectionFailureUpdate;

export type WorkspaceProjectionViewUpdateFor<Scope extends WorkspaceProjectionViewScope> =
  | WorkspaceProjectionViewFor<Scope>
  | WorkspaceProjectionFailureUpdate<Scope>;
