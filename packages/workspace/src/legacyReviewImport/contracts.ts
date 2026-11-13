import type { StateRecordWrite } from '../authoritativeState.js';
import type {
  LegacyReviewBatchReceipt,
  LegacyReviewRecognitionReason,
  LegacyReviewSourceKind,
  LegacyReviewSourceUnavailableReason,
} from '../legacyReviewSource.js';
import type { ReviewIdentity, ReviewQuestionDraftIdentity, ReviewSnapshotIdentity } from '../reviewing/index.js';
import type { WorkspaceIdentity } from '../workspace.js';

export const MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES: number = 4_096;

export const LEGACY_REVIEW_SOURCES_PROJECTION_VERSION: 1 = 1;

export const LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION: 1 = 1;

export const LEGACY_REVIEW_QUEUE_PROJECTION_VERSION: 1 = 1;

export const LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION: 1 = 1;

export declare const legacyReviewSourceIdentityBrand: unique symbol;

export type LegacyReviewSourceIdentity = string & {
  readonly [legacyReviewSourceIdentityBrand]: 'LegacyReviewSourceIdentity';
};

export declare const legacyReviewSourceOccurrenceIdentityBrand: unique symbol;

export type LegacyReviewSourceOccurrenceIdentity = string & {
  readonly [legacyReviewSourceOccurrenceIdentityBrand]: 'LegacyReviewSourceOccurrenceIdentity';
};

export declare const legacyReviewSourceDecisionIdentityBrand: unique symbol;

export type LegacyReviewSourceDecisionIdentity = string & {
  readonly [legacyReviewSourceDecisionIdentityBrand]: 'LegacyReviewSourceDecisionIdentity';
};

export declare const legacyReviewQueueCandidateIdentityBrand: unique symbol;

export type LegacyReviewQueueCandidateIdentity = string & {
  readonly [legacyReviewQueueCandidateIdentityBrand]: 'LegacyReviewQueueCandidateIdentity';
};

export declare const legacyReviewCandidateDecisionIdentityBrand: unique symbol;

export type LegacyReviewCandidateDecisionIdentity = string & {
  readonly [legacyReviewCandidateDecisionIdentityBrand]: 'LegacyReviewCandidateDecisionIdentity';
};

export declare const legacyReviewMovedSourceAssociationIdentityBrand: unique symbol;

export type LegacyReviewMovedSourceAssociationIdentity = string & {
  readonly [legacyReviewMovedSourceAssociationIdentityBrand]: 'LegacyReviewMovedSourceAssociationIdentity';
};

export declare const legacyReviewCandidatePromotionIdentityBrand: unique symbol;

export type LegacyReviewCandidatePromotionIdentity = string & {
  readonly [legacyReviewCandidatePromotionIdentityBrand]: 'LegacyReviewCandidatePromotionIdentity';
};

export type LegacyReviewSourceDecision = 'deferred' | 'dismissed';

export type LegacyReviewQueueCandidateDecision = 'deferred' | 'dismissed';

export type LegacyReviewSourceLocation = 'current-checkout' | 'current-legacy-state' | 'moved-legacy-state';

export interface LegacyReviewSourcesViewRequest {
  readonly kind: 'legacy-review.sources';
}

export interface LegacyReviewRecognitionFailure {
  readonly status: 'unrecognized';
  readonly reason: LegacyReviewRecognitionReason;
  readonly observedVersion?: number;
}

export interface LegacyReviewQueueRecognitionSummary {
  readonly status: 'recognized';
  readonly format: 'queue-array-v1' | 'queue-v1' | 'queue-v2';
  readonly totalAnnotations: number;
}

export interface LegacyReviewReceiptRecognitionSummary {
  readonly status: 'recognized';
  readonly format: 'receipts-v1';
  readonly totalBatches: number;
  readonly totalAnnotations: number;
  readonly legacyWorkspacePaths: {
    readonly totalDistinct: number;
    readonly values: readonly string[];
    readonly omitted: number;
  };
}

export type LegacyReviewSourceMigrationStatus =
  | { readonly status: 'undecided' }
  | {
      readonly status: 'imported';
      readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
    }
  | {
      readonly status: LegacyReviewSourceDecision;
      readonly sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity;
    }
  | {
      readonly status: 'changed-since-decision';
      readonly currentDecision: 'undecided';
      readonly priorDecision: 'imported' | LegacyReviewSourceDecision;
    };

export type LegacyReviewSourcePathFailure =
  | { readonly status: 'missing' }
  | {
      readonly status: 'unavailable';
      readonly reason: Exclude<LegacyReviewSourceUnavailableReason, 'missing'>;
    };

export interface LegacyReviewSourceFileObservation {
  readonly status: 'detected';
  readonly byteLength: number;
  readonly digest: string;
  readonly mode: number;
  readonly modifiedNanoseconds: string;
  readonly changedNanoseconds: string;
  readonly migration: LegacyReviewSourceMigrationStatus;
}

export type LegacyReviewQueueSourceObservation =
  | LegacyReviewSourcePathFailure
  | (LegacyReviewSourceFileObservation & {
      readonly recognition: LegacyReviewQueueRecognitionSummary | LegacyReviewRecognitionFailure;
    });

export type LegacyReviewReceiptSourceObservation =
  | LegacyReviewSourcePathFailure
  | (LegacyReviewSourceFileObservation & {
      readonly recognition: LegacyReviewReceiptRecognitionSummary | LegacyReviewRecognitionFailure;
    });

export interface LegacyReviewQueueSourceSlot {
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: 'queue';
  readonly location: 'current-checkout';
  readonly sourcePath: string;
  readonly observation: LegacyReviewQueueSourceObservation;
}

export interface LegacyReviewReceiptSourceSlot {
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: 'receipts';
  readonly location: 'current-legacy-state';
  readonly sourcePath: string;
  readonly observation: LegacyReviewReceiptSourceObservation;
}

export interface LegacyReviewSourcesView {
  readonly kind: 'legacy-review.sources';
  readonly projectionVersion: typeof LEGACY_REVIEW_SOURCES_PROJECTION_VERSION;
  readonly stateVersion: number;
  /** Stable source order is current queue followed by current legacy receipts. */
  readonly sources: readonly [LegacyReviewQueueSourceSlot, LegacyReviewReceiptSourceSlot];
}

export interface LegacyReviewTextWindow {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly shownUtf8Bytes: number;
  readonly truncated: boolean;
}

export type LegacyReviewMovedReceiptSearch =
  | { readonly kind: 'legacy-state-directory' }
  | {
      readonly kind: 'former-checkout-path';
      readonly exactFormerCanonicalCheckout: string;
    };

export type LegacyReviewMovedReceiptSearchSummary =
  | { readonly kind: 'legacy-state-directory' }
  | {
      readonly kind: 'former-checkout-path';
      readonly exactFormerCanonicalCheckout: LegacyReviewTextWindow;
    };

export type LegacyReviewMovedReceiptMigrationStatus =
  | { readonly status: 'unassociated' }
  | {
      readonly status: 'associated-and-imported';
      readonly associationIdentity: LegacyReviewMovedSourceAssociationIdentity;
      readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
    };

export interface LegacyReviewMovedReceiptRecognitionSummary {
  readonly status: 'recognized';
  readonly format: 'receipts-v1';
  readonly totalBatches: number;
  readonly totalAnnotations: number;
  readonly totalLegacyWorkspacePaths: number;
}

export type LegacyReviewMovedReceiptSourceObservation =
  | LegacyReviewSourcePathFailure
  | {
      readonly status: 'detected';
      readonly byteLength: number;
      readonly digest: string;
      readonly mode: number;
      readonly modifiedNanoseconds: string;
      readonly changedNanoseconds: string;
      readonly migration: LegacyReviewMovedReceiptMigrationStatus;
      readonly recognition: LegacyReviewMovedReceiptRecognitionSummary | LegacyReviewRecognitionFailure;
    };

export interface LegacyReviewMovedReceiptSourceSummary {
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: 'receipts';
  readonly location: 'moved-legacy-state';
  readonly legacyCheckoutHash: string;
  readonly legacyReceiptPath: LegacyReviewTextWindow;
  readonly observation: LegacyReviewMovedReceiptSourceObservation;
}

export interface LegacyReviewMovedReceiptSourcesViewRequest {
  readonly kind: 'legacy-review.moved-receipt-sources';
  readonly search: LegacyReviewMovedReceiptSearch;
  readonly sourceOffset: number;
  readonly sourceLimit: number;
}

export type LegacyReviewMovedReceiptSearchUnavailableReason =
  | 'search-root-unavailable'
  | 'search-entry-limit'
  | 'projection-limit';

export interface LegacyReviewMovedReceiptSourcesAvailableView {
  readonly kind: 'legacy-review.moved-receipt-sources';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly search: LegacyReviewMovedReceiptSearchSummary;
  readonly totalSources: number;
  readonly sourceOffset: number;
  readonly sources: readonly LegacyReviewMovedReceiptSourceSummary[];
}

export interface LegacyReviewMovedReceiptSourcesUnavailableView {
  readonly kind: 'legacy-review.moved-receipt-sources';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly search: LegacyReviewMovedReceiptSearchSummary;
  readonly reason: LegacyReviewMovedReceiptSearchUnavailableReason;
}

export type LegacyReviewMovedReceiptSourcesView =
  | LegacyReviewMovedReceiptSourcesAvailableView
  | LegacyReviewMovedReceiptSourcesUnavailableView;

export interface LegacyReviewMovedReceiptSourceViewRequest {
  readonly kind: 'legacy-review.moved-receipt-source';
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly legacyCheckoutHash: string;
  readonly legacyWorkspacePathOffset: number;
  readonly legacyWorkspacePathLimit: number;
}

export type LegacyReviewMovedReceiptSourceUnavailableReason =
  | 'source-identity-mismatch'
  | 'current-source-ineligible'
  | 'source-missing'
  | 'source-unavailable'
  | 'source-unrecognized'
  | 'projection-limit';

export interface LegacyReviewMovedReceiptSourceAvailableView {
  readonly kind: 'legacy-review.moved-receipt-source';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: 'receipts';
  readonly location: 'moved-legacy-state';
  readonly legacyCheckoutHash: string;
  readonly legacyReceiptPath: LegacyReviewTextWindow;
  readonly byteLength: number;
  readonly digest: string;
  readonly mode: number;
  readonly modifiedNanoseconds: string;
  readonly changedNanoseconds: string;
  readonly migration: LegacyReviewMovedReceiptMigrationStatus;
  readonly recognition: LegacyReviewMovedReceiptRecognitionSummary;
  readonly totalLegacyWorkspacePaths: number;
  readonly legacyWorkspacePathOffset: number;
  readonly legacyWorkspacePaths: readonly LegacyReviewTextWindow[];
  readonly omittedLegacyWorkspacePathsBefore: number;
  readonly omittedLegacyWorkspacePathsAfter: number;
}

export interface LegacyReviewMovedReceiptSourceUnavailableView {
  readonly kind: 'legacy-review.moved-receipt-source';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly legacyCheckoutHash: string;
  readonly reason: LegacyReviewMovedReceiptSourceUnavailableReason;
  readonly sourceFailure?: Exclude<LegacyReviewSourceUnavailableReason, 'missing'>;
  readonly recognition?: LegacyReviewRecognitionFailure;
}

export type LegacyReviewMovedReceiptSourceView =
  | LegacyReviewMovedReceiptSourceAvailableView
  | LegacyReviewMovedReceiptSourceUnavailableView;

export type LegacyReviewProjectedHarnessOutcome = LegacyReviewBatchReceipt['harnessOutcome'];

export type LegacyReviewProjectedQueueDisposition = LegacyReviewBatchReceipt['queueDisposition'];

export type LegacyReviewProjectedQueueReason = NonNullable<LegacyReviewBatchReceipt['queueReason']>;

export interface LegacyReviewReceiptHistoryDisclosure {
  readonly label: 'LEGACY REVIEW HISTORY';
  readonly provenance: 'imported-legacy-receipt-source';
  readonly recordStatus: 'migration-evidence-not-v1-history';
  readonly sourceMutability: 'legacy-source-was-mutable';
  readonly retention: 'at-most-100-terminal-batches';
  readonly cannotProve: readonly [
    'complete-history',
    'human-consent',
    'delivery',
    'harness-start',
    'terminal-correlation',
    'human-disposition',
    'correctness',
    'v1-workflow-facts',
  ];
}

export interface LegacyReviewReceiptHarnessSummary {
  readonly legacyHarnessId: LegacyReviewTextWindow;
  readonly legacyName: LegacyReviewTextWindow;
  readonly legacyVersion?: LegacyReviewTextWindow;
  readonly legacySessionId: LegacyReviewTextWindow;
  readonly legacyModel?: LegacyReviewTextWindow;
  readonly legacyWorkspacePath: LegacyReviewTextWindow;
}

export interface LegacyReviewReceiptBatchSummary {
  readonly batchAbsolute: number;
  readonly legacyBatchId: LegacyReviewTextWindow;
  readonly legacyWorkspacePath: LegacyReviewTextWindow;
  readonly legacyHarness: LegacyReviewReceiptHarnessSummary;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly harnessOutcome: LegacyReviewProjectedHarnessOutcome;
  readonly harnessCompletedAt?: string;
  readonly legacyHarnessError?: LegacyReviewTextWindow;
  readonly queueDisposition: LegacyReviewProjectedQueueDisposition;
  readonly queueUpdatedAt?: string;
  readonly queueReason?: LegacyReviewProjectedQueueReason;
  readonly legacyQueueError?: LegacyReviewTextWindow;
  readonly totalAnnotations: number;
}

export interface LegacyReviewReceiptAnnotation {
  readonly annotationAbsolute: number;
  readonly legacyAnnotationId: LegacyReviewTextWindow;
  readonly legacyKind: 'question' | 'change' | 'edit';
  readonly legacyFile?: LegacyReviewTextWindow;
  readonly legacyAnchor: {
    readonly side: 'old' | 'new' | 'both' | 'file';
    readonly oldLine?: number;
    readonly newLine?: number;
  };
  readonly legacyText: LegacyReviewTextWindow;
  readonly legacyExcerpt?: LegacyReviewTextWindow;
}

export interface LegacyReviewReceiptHistoryViewRequest {
  readonly kind: 'legacy-review.receipt-history';
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly batchOffset: number;
  readonly batchLimit: number;
}

export interface LegacyReviewReceiptBatchViewRequest {
  readonly kind: 'legacy-review.receipt-batch';
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly batchAbsolute: number;
  readonly annotationOffset: number;
  readonly annotationLimit: number;
}

export type LegacyReviewReceiptProjectionUnavailableReason =
  | 'source-not-imported'
  | 'source-kind-mismatch'
  | 'source-unrecognized'
  | 'content-unavailable'
  | 'projection-limit';

export interface LegacyReviewReceiptHistoryAvailableView {
  readonly kind: 'legacy-review.receipt-history';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly disclosure: LegacyReviewReceiptHistoryDisclosure;
  readonly legacyUpdatedAt: string;
  readonly totalBatches: number;
  readonly totalAnnotations: number;
  readonly batchOffset: number;
  readonly batches: readonly LegacyReviewReceiptBatchSummary[];
}

export interface LegacyReviewReceiptHistoryUnavailableView {
  readonly kind: 'legacy-review.receipt-history';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly reason: LegacyReviewReceiptProjectionUnavailableReason;
}

export type LegacyReviewReceiptHistoryView =
  | LegacyReviewReceiptHistoryAvailableView
  | LegacyReviewReceiptHistoryUnavailableView;

export interface LegacyReviewReceiptBatchAvailableView {
  readonly kind: 'legacy-review.receipt-batch';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly disclosure: LegacyReviewReceiptHistoryDisclosure;
  readonly batch: LegacyReviewReceiptBatchSummary;
  readonly annotationOffset: number;
  readonly annotations: readonly LegacyReviewReceiptAnnotation[];
}

export interface LegacyReviewReceiptBatchUnavailableView {
  readonly kind: 'legacy-review.receipt-batch';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly reason: LegacyReviewReceiptProjectionUnavailableReason | 'batch-not-found';
}

export type LegacyReviewReceiptBatchView =
  | LegacyReviewReceiptBatchAvailableView
  | LegacyReviewReceiptBatchUnavailableView;

export interface LegacyReviewQueueCandidateDisclosure {
  readonly label: 'LEGACY QUEUE CANDIDATE';
  readonly recordStatus: 'migration-candidate-not-v1-draft';
  readonly authority: 'none';
  readonly legacyValues: 'intent-path-lines-and-excerpt-are-hints-only';
  readonly promotionRequires: 'explicit-intent-and-exact-anchor-on-verified-current-v1-snapshot';
}

export interface LegacyReviewQueueCandidatePromotionSummary {
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly intent: 'question';
}

export interface LegacyReviewQueueCandidateSummary {
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly candidateAbsolute: number;
  readonly migrationDecision: 'undecided' | LegacyReviewQueueCandidateDecision | 'promoted';
  readonly promotion?: LegacyReviewQueueCandidatePromotionSummary;
  readonly legacyAnnotationId: LegacyReviewTextWindow;
  readonly legacyKind: 'question' | 'change' | 'edit';
  readonly legacyFile?: LegacyReviewTextWindow;
  readonly legacyAnchorHint: {
    readonly side: 'old' | 'new' | 'both' | 'file';
    readonly oldLine?: number;
    readonly newLine?: number;
  };
  readonly legacyTextPreview: LegacyReviewTextWindow;
  readonly legacyExcerptPreview?: LegacyReviewTextWindow;
}

export interface LegacyReviewUtf8TextPage {
  readonly text: string;
  readonly totalUtf8Bytes: number;
  readonly utf8Offset: number;
  readonly shownUtf8Bytes: number;
  readonly complete: boolean;
}

export interface LegacyReviewQueueCandidatesViewRequest {
  readonly kind: 'legacy-review.queue-candidates';
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateOffset: number;
  readonly candidateLimit: number;
}

export interface LegacyReviewQueueCandidateViewRequest {
  readonly kind: 'legacy-review.queue-candidate';
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly textUtf8Offset: number;
  readonly textUtf8Limit: number;
  readonly excerptUtf8Offset: number;
  readonly excerptUtf8Limit: number;
}

export type LegacyReviewQueueProjectionUnavailableReason =
  | 'source-not-imported'
  | 'source-kind-mismatch'
  | 'source-location-ineligible'
  | 'source-unrecognized'
  | 'content-unavailable'
  | 'candidate-not-found'
  | 'text-offset-out-of-range'
  | 'text-offset-not-scalar-boundary'
  | 'excerpt-not-present'
  | 'excerpt-offset-out-of-range'
  | 'excerpt-offset-not-scalar-boundary'
  | 'projection-limit';

export interface LegacyReviewQueueCandidatesAvailableView {
  readonly kind: 'legacy-review.queue-candidates';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_QUEUE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly legacySourceFormat: 'queue-array-v1' | 'queue-v1' | 'queue-v2';
  readonly disclosure: LegacyReviewQueueCandidateDisclosure;
  readonly totalCandidates: number;
  readonly candidateOffset: number;
  readonly candidates: readonly LegacyReviewQueueCandidateSummary[];
}

export interface LegacyReviewQueueCandidatesUnavailableView {
  readonly kind: 'legacy-review.queue-candidates';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_QUEUE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly reason: LegacyReviewQueueProjectionUnavailableReason;
}

export type LegacyReviewQueueCandidatesView =
  | LegacyReviewQueueCandidatesAvailableView
  | LegacyReviewQueueCandidatesUnavailableView;

export interface LegacyReviewQueueCandidateAvailableView {
  readonly kind: 'legacy-review.queue-candidate';
  readonly status: 'available';
  readonly projectionVersion: typeof LEGACY_REVIEW_QUEUE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly legacySourceFormat: 'queue-array-v1' | 'queue-v1' | 'queue-v2';
  readonly disclosure: LegacyReviewQueueCandidateDisclosure;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly candidateAbsolute: number;
  readonly migrationDecision: 'undecided' | LegacyReviewQueueCandidateDecision | 'promoted';
  readonly promotion?: LegacyReviewQueueCandidatePromotionSummary;
  readonly legacyAnnotationId: LegacyReviewTextWindow;
  readonly legacyKind: 'question' | 'change' | 'edit';
  readonly legacyFile?: LegacyReviewTextWindow;
  readonly legacyAnchorHint: LegacyReviewQueueCandidateSummary['legacyAnchorHint'];
  readonly legacyText: LegacyReviewUtf8TextPage;
  readonly legacyExcerpt?: LegacyReviewUtf8TextPage;
}

export interface LegacyReviewQueueCandidateUnavailableView {
  readonly kind: 'legacy-review.queue-candidate';
  readonly status: 'unavailable';
  readonly projectionVersion: typeof LEGACY_REVIEW_QUEUE_PROJECTION_VERSION;
  readonly stateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly reason: LegacyReviewQueueProjectionUnavailableReason;
}

export type LegacyReviewQueueCandidateView =
  | LegacyReviewQueueCandidateAvailableView
  | LegacyReviewQueueCandidateUnavailableView;

export type LegacyReviewImportViewRequest =
  | LegacyReviewSourcesViewRequest
  | LegacyReviewReceiptHistoryViewRequest
  | LegacyReviewReceiptBatchViewRequest
  | LegacyReviewQueueCandidatesViewRequest
  | LegacyReviewQueueCandidateViewRequest
  | LegacyReviewMovedReceiptSourcesViewRequest
  | LegacyReviewMovedReceiptSourceViewRequest;

export type LegacyReviewImportView =
  | LegacyReviewSourcesView
  | LegacyReviewReceiptHistoryView
  | LegacyReviewReceiptBatchView
  | LegacyReviewQueueCandidatesView
  | LegacyReviewQueueCandidateView
  | LegacyReviewMovedReceiptSourcesView
  | LegacyReviewMovedReceiptSourceView;

export type LegacyReviewImportViewFor<Request extends LegacyReviewImportViewRequest> =
  Request extends LegacyReviewSourcesViewRequest
    ? LegacyReviewSourcesView
    : Request extends LegacyReviewReceiptHistoryViewRequest
      ? LegacyReviewReceiptHistoryView
      : Request extends LegacyReviewReceiptBatchViewRequest
        ? LegacyReviewReceiptBatchView
        : Request extends LegacyReviewQueueCandidatesViewRequest
          ? LegacyReviewQueueCandidatesView
          : Request extends LegacyReviewQueueCandidateViewRequest
            ? LegacyReviewQueueCandidateView
            : Request extends LegacyReviewMovedReceiptSourcesViewRequest
              ? LegacyReviewMovedReceiptSourcesView
              : Request extends LegacyReviewMovedReceiptSourceViewRequest
                ? LegacyReviewMovedReceiptSourceView
                : never;

export interface ImportLegacyReviewSourceCommand {
  readonly kind: 'legacy-review.source.import';
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly expectedDigest: string;
}

export interface SetLegacyReviewSourceDecisionCommand {
  readonly kind: 'legacy-review.source.decision.set';
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly expectedDigest: string;
  readonly decision: LegacyReviewSourceDecision;
}

export interface SetLegacyReviewQueueCandidateDecisionCommand {
  readonly kind: 'legacy-review.queue-candidate.decision.set';
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly decision: LegacyReviewQueueCandidateDecision;
}

export interface AssociateAndImportMovedLegacyReceiptSourceCommand {
  readonly kind: 'legacy-review.moved-receipt-source.associate-and-import';
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly confirmedWorkspaceIdentity: WorkspaceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly legacyCheckoutHash: string;
  readonly expectedDigest: string;
}

export type LegacyReviewCommand =
  | ImportLegacyReviewSourceCommand
  | SetLegacyReviewSourceDecisionCommand
  | SetLegacyReviewQueueCandidateDecisionCommand
  | AssociateAndImportMovedLegacyReceiptSourceCommand;

export interface LegacyReviewSourceImported {
  readonly kind: 'legacy-review.source.imported';
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly digest: string;
  readonly preservation: 'preserved' | 'already-preserved';
}

export interface LegacyReviewMovedReceiptSourceAssociatedAndImported {
  readonly kind: 'legacy-review.moved-receipt-source.associated-and-imported';
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly associationIdentity: LegacyReviewMovedSourceAssociationIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceKind: 'receipts';
  readonly location: 'moved-legacy-state';
  readonly legacyCheckoutHash: string;
  readonly digest: string;
  readonly association: 'recorded' | 'already-recorded';
  readonly preservation: 'preserved' | 'already-preserved';
}

export interface LegacyReviewSourceDecisionRecorded {
  readonly kind: 'legacy-review.source.decision-recorded';
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly digest: string;
  readonly decision: LegacyReviewSourceDecision;
  readonly recording: 'recorded' | 'already-recorded';
}

export interface LegacyReviewQueueCandidateDecisionRecorded {
  readonly kind: 'legacy-review.queue-candidate.decision-recorded';
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly candidateDecisionIdentity: LegacyReviewCandidateDecisionIdentity;
  readonly decision: LegacyReviewQueueCandidateDecision;
  readonly recording: 'recorded' | 'already-recorded';
}

export type LegacyReviewSourceCommandRejectionReason =
  | 'state-version-mismatch'
  | 'command-identity-conflict'
  | 'state-conflict'
  | 'source-identity-unknown'
  | 'source-not-found'
  | 'source-unavailable'
  | 'source-changed'
  | 'source-already-imported'
  | 'source-occurrence-limit'
  | 'source-decision-limit';

export type LegacyReviewMovedReceiptCommandRejectionReason =
  | 'state-version-mismatch'
  | 'command-identity-conflict'
  | 'state-conflict'
  | 'workspace-identity-mismatch'
  | 'current-source-ineligible'
  | 'source-identity-mismatch'
  | 'source-not-found'
  | 'source-unavailable'
  | 'source-changed'
  | 'source-unrecognized'
  | 'moved-source-association-limit';

export type LegacyReviewQueueCandidateCommandRejectionReason =
  | 'state-version-mismatch'
  | 'command-identity-conflict'
  | 'state-conflict'
  | 'source-occurrence-not-imported'
  | 'candidate-source-unavailable'
  | 'candidate-not-found'
  | 'candidate-already-promoted'
  | 'candidate-decision-limit';

export type LegacyReviewCommandRejectionReason =
  | LegacyReviewSourceCommandRejectionReason
  | LegacyReviewMovedReceiptCommandRejectionReason
  | LegacyReviewQueueCandidateCommandRejectionReason;

export interface LegacyReviewSourceCommandRejected {
  readonly kind: 'legacy-review.command.rejected';
  readonly status: 'rejected';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly reason: LegacyReviewSourceCommandRejectionReason | LegacyReviewMovedReceiptCommandRejectionReason;
  readonly sourceFailure?: Exclude<LegacyReviewSourceUnavailableReason, 'missing'>;
  readonly observedDigest?: string;
}

export interface LegacyReviewQueueCandidateCommandRejected {
  readonly kind: 'legacy-review.command.rejected';
  readonly status: 'rejected';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly reason: LegacyReviewQueueCandidateCommandRejectionReason;
}

export type LegacyReviewCommandRejected = LegacyReviewSourceCommandRejected | LegacyReviewQueueCandidateCommandRejected;

export type LegacyReviewCommandAccepted =
  | LegacyReviewSourceImported
  | LegacyReviewMovedReceiptSourceAssociatedAndImported
  | LegacyReviewSourceDecisionRecorded
  | LegacyReviewQueueCandidateDecisionRecorded;

export type LegacyReviewCommandResult = LegacyReviewCommandAccepted | LegacyReviewCommandRejected;

export type LegacyQuestionCandidatePromotionPreparationRejectionReason =
  | 'state-version-mismatch'
  | 'source-occurrence-not-imported'
  | 'candidate-source-unavailable'
  | 'candidate-source-digest-mismatch'
  | 'candidate-not-found'
  | 'candidate-intent-unsupported'
  | 'candidate-already-promoted'
  | 'candidate-promotion-limit';

export interface PrepareLegacyQuestionCandidatePromotionRequest {
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly expectedSourceDigest: string;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
}

export type PreparedLegacyQuestionCandidatePromotion =
  | {
      readonly status: 'rejected';
      readonly stateVersion: number;
      readonly reason: LegacyQuestionCandidatePromotionPreparationRejectionReason;
    }
  | {
      readonly status: 'prepared';
      readonly stateVersion: number;
      readonly sourceIdentity: LegacyReviewSourceIdentity;
      readonly digest: string;
      readonly body: string;
      readonly promotion: LegacyReviewQueueCandidatePromotionSummary;
      readonly records: readonly StateRecordWrite[];
    };

export interface ValidateLegacyQuestionCandidatePromotionRequest {
  readonly commandIdentity: string;
  readonly promotedStateVersion: number;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly digest: string;
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
}

export interface ValidatedLegacyQuestionCandidatePromotion {
  readonly body: string;
  readonly promotion: LegacyReviewQueueCandidatePromotionSummary;
}
