import type {
  ContextItemVerdict,
  ContextSourceByteScope,
  ContextSourceCaptureItem,
  ContextSourceClassification,
  ContextSourceOccurrenceConflict,
} from '../contextEvidence.js';
import type {
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from '../legacyReviewImport/index.js';
import type {
  CurrentChangedFile,
  CurrentChangesCaptureReadyView,
  CurrentChangesComparedState,
  CurrentChangesComparisonBasis,
  CurrentChangesManifestSummary,
  EvidenceContentAvailability,
  EvidenceContentClassification,
  EvidenceContentIdentity,
  EvidenceContentLimitation,
  EvidencePath,
  ReviewComparedState,
  ReviewComparisonBasis,
  ReviewComparisonCaptureReadyView,
  ReviewComparisonDynamicInput,
  ReviewComparisonResolutionIdentity,
  ReviewComparisonSelection,
} from '../workspaceEvidence/index.js';
import type {
  ReviewBasisCommit,
  ReviewContextContributionScope,
  ReviewContextRule,
  ReviewContextRuleDecision,
  ReviewEditorBufferProvenance,
  ReviewEditorContextSource,
  ReviewQuestionAnchor,
  ReviewQuestionDisposition,
  ReviewingCommandAccepted,
  ReviewingCommandRejectionReason,
} from './contracts.js';
import type {
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewContextContributionIdentity,
  ReviewContextRuleIdentity,
  ReviewContextSelectionIdentity,
  ReviewDispositionIdentity,
  ReviewIdentity,
  ReviewMessageIdentity,
  ReviewMessageMaterialIdentity,
  ReviewPassIdentity,
  ReviewQuestionDraftIdentity,
  ReviewQuestionIdentity,
  ReviewResponseIdentity,
  ReviewResultIdentity,
  ReviewSnapshotContextContentIdentity,
  ReviewSnapshotContextIdentity,
  ReviewSnapshotContextItemIdentity,
  ReviewSnapshotIdentity,
} from './identities.js';
import { REVIEW_DIFF_WINDOW_ROWS, REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS } from './limits.js';

export interface ReviewCurrentDispositionIndexEntry {
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly dispositionIdentity: ReviewDispositionIdentity;
  readonly disposition: ReviewQuestionDisposition;
}

export interface ReviewBasisTreeIndex {
  readonly formatVersion: 1;
  readonly liveReviewBasisIdentity: ReviewBasisIdentity;
  /** Parent-before-child durable basis order; the live singleton is first. */
  readonly reviewBasisIdentities: readonly ReviewBasisIdentity[];
}

export interface ReviewMessageHistoryIndex {
  readonly formatVersion: 1;
  /** Durable commitment order; historical Question identities never appear here. */
  readonly messages: readonly {
    readonly reviewMessageIdentity: ReviewMessageIdentity;
    readonly originReviewBasisIdentity: ReviewBasisIdentity;
  }[];
  readonly responses: readonly {
    readonly reviewMessageIdentity: ReviewMessageIdentity;
    readonly responseIdentity: ReviewResponseIdentity;
  }[];
  /** One terminal post-Response repository observation per settled Message. */
  readonly changeObservations: readonly {
    readonly reviewMessageIdentity: ReviewMessageIdentity;
    readonly responseIdentity: ReviewResponseIdentity;
    readonly outcome: 'unchanged' | 'forked';
    readonly reviewBasisIdentity?: ReviewBasisIdentity;
  }[];
}

export interface ReviewIndexEntry {
  readonly reviewIdentity: ReviewIdentity;
  /** `active` is accepted only as a historical lifecycle fact; new Reviews are retained. */
  readonly status: 'retained' | 'active' | 'completed' | 'cancelled';
  /** Optional only while reading pre-chronology dogfood records. */
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly cancelledAt?: string;
  readonly changeSetIdentity: string;
  /** Fixed Review retained as explicit supporting context for this continuation. */
  readonly continuedFromReviewIdentity?: ReviewIdentity;
  /** Present only on Reviews created by the superseded pass lifecycle. */
  readonly reviewPassIdentity?: ReviewPassIdentity;
  /** Chronological immutable Snapshot lineage; latest is the final identity. */
  readonly reviewSnapshotIdentities: readonly ReviewSnapshotIdentity[];
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  /** Absent only on Reviews recorded before the change-driven basis tree. */
  readonly basisTree?: ReviewBasisTreeIndex;
  /** Absent only on Reviews recorded before one-type Review Messages. */
  readonly messageHistory?: ReviewMessageHistoryIndex;
  readonly draftIdentities: readonly ReviewQuestionDraftIdentity[];
  readonly openDraftIdentities: readonly ReviewQuestionDraftIdentity[];
  readonly batchIdentities: readonly ReviewBatchIdentity[];
  readonly questionIdentities: readonly ReviewQuestionIdentity[];
  readonly dispositionIdentities: readonly ReviewDispositionIdentity[];
  readonly currentDispositions: readonly ReviewCurrentDispositionIndexEntry[];
  readonly responses: readonly {
    readonly questionIdentity: ReviewQuestionIdentity;
    readonly responseIdentity: ReviewResponseIdentity;
  }[];
  readonly resultIdentity?: ReviewResultIdentity;
  readonly cancellationIdentity?: string;
}

export interface ReviewIndexPayload {
  readonly formatVersion: 1;
  /** The explicit ordinary-continuation pointer; absent in historical indexes. */
  readonly currentReviewIdentity?: ReviewIdentity;
  readonly reviews: readonly ReviewIndexEntry[];
}

export interface LoadedReviewIndex {
  readonly stateVersion: number;
  readonly revision: number;
  readonly payload: ReviewIndexPayload;
}

export interface ReviewContextSelectionPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly selectionIdentity: ReviewContextSelectionIdentity;
  readonly rules: readonly ReviewContextRule[];
}

export type ReviewContextSensitivityReason = 'unsaved-editor' | 'ignored-untracked' | 'outside-checkout';

export interface ReviewContextContributionSensitivity {
  readonly sensitive: boolean;
  readonly reasons: readonly ReviewContextSensitivityReason[];
}

export type ReviewContextContributionUnavailableReason =
  | 'editor-read-failed'
  | 'native-representation-unavailable'
  | 'contribution-limit'
  | 'artifact-side-absent'
  | 'artifact-content-not-captured'
  | 'artifact-content-unavailable';

export type ReviewContextContributionContent =
  | {
      readonly status: 'available';
      readonly byteLength: number;
      readonly sha256: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: ReviewContextContributionUnavailableReason;
      readonly observedByteLength?: number;
      readonly sourceLimitation?: EvidenceContentLimitation;
    };

export type ReviewArtifactContextProvenance =
  | {
      readonly kind: 'review-response';
      readonly artifactIdentity: ReviewResponseIdentity;
      readonly sourceReviewIdentity: ReviewIdentity;
      readonly questionIdentity: ReviewQuestionIdentity;
      readonly sourceByteLength: number;
      readonly sourceSha256: string;
      readonly sourceRecordChecksum: string;
    }
  | {
      readonly kind: 'review-snapshot-file-side';
      readonly artifactIdentity: ReviewSnapshotIdentity;
      readonly sourceReviewIdentity: ReviewIdentity;
      readonly fileIdentity: string;
      readonly side: 'old' | 'new';
      readonly path?: EvidencePath;
      readonly sourceByteLength: number | null;
      readonly sourceContentIdentity?: EvidenceContentIdentity;
      readonly sourceClassification?: EvidenceContentClassification;
      readonly sourceContentAvailability: 'absent' | EvidenceContentAvailability;
      readonly sourceContentLimitation?: EvidenceContentLimitation;
      readonly sourceSensitive: boolean;
      readonly snapshotRecordChecksum: string;
      readonly fileRecordChecksum: string;
    };

export interface ReviewContextContributionPayloadBase {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly contributionIdentity: ReviewContextContributionIdentity;
  readonly scope: ReviewContextContributionScope;
  readonly content: ReviewContextContributionContent;
  readonly sensitivity: ReviewContextContributionSensitivity;
}

export type ReviewContextContributionPayload =
  | (ReviewContextContributionPayloadBase & {
      readonly kind: 'editor';
      readonly source: ReviewEditorContextSource;
      readonly editor: ReviewEditorBufferProvenance & {
        readonly attestation: 'unattested-editor-command';
      };
      readonly classification?: ContextSourceClassification;
    })
  | (ReviewContextContributionPayloadBase & {
      readonly kind: 'artifact';
      readonly artifact: ReviewArtifactContextProvenance;
    });

export interface LoadedReviewContextSelection {
  readonly stateVersion: number;
  readonly revision: number;
  readonly payload: ReviewContextSelectionPayload;
}

export interface PreparedReviewContextContribution {
  readonly payload: ReviewContextContributionPayload;
  readonly bytes?: Uint8Array;
}

export type PreparedReviewArtifactContribution =
  | { readonly status: 'ready'; readonly contribution: PreparedReviewContextContribution }
  | { readonly status: 'state-version-mismatch'; readonly stateVersion: number }
  | {
      readonly status: 'rejected';
      readonly reason: 'context-artifact-not-found' | 'context-artifact-cycle' | 'context-artifact-range-invalid';
      readonly blockerIdentities: readonly string[];
    };

export type ReviewSnapshotContextScope =
  | { readonly kind: 'whole' }
  | { readonly kind: 'bytes'; readonly intervals: readonly ContextSourceByteScope[] };

export interface ReviewSnapshotContextContentReference {
  readonly contentIdentity: ReviewSnapshotContextContentIdentity;
  readonly ordinal: number;
  readonly scope: ReviewContextContributionScope;
  readonly byteLength: number;
  readonly sha256: string;
}

export type ReviewSnapshotContextItem =
  | {
      readonly kind: 'locator';
      readonly itemIdentity: ReviewSnapshotContextItemIdentity;
      readonly order: number;
      readonly source: ContextSourceCaptureItem;
      readonly decision: ReviewContextRuleDecision;
      readonly scope: ReviewSnapshotContextScope;
      readonly contents: readonly ReviewSnapshotContextContentReference[];
      /** Present when the occurrence freezes one exact prior occurrence instead of following its live locator. */
      readonly pinnedFrom?: {
        readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
        readonly itemIdentity: ReviewSnapshotContextItemIdentity;
      };
    }
  | {
      readonly kind: 'contribution';
      readonly itemIdentity: ReviewSnapshotContextItemIdentity;
      readonly order: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly contribution: ReviewContextContributionPayload;
      readonly contents: readonly ReviewSnapshotContextContentReference[];
    };

export type ReviewSnapshotContextSourceGroup =
  | {
      readonly kind: 'locator';
      readonly order: number;
      readonly origin: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
    }
  | {
      readonly kind: 'pin';
      readonly order: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly itemIdentity: ReviewSnapshotContextItemIdentity;
    }
  | {
      readonly kind: 'contribution';
      readonly order: number;
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly contributionIdentity: ReviewContextContributionIdentity;
    };

export interface ReviewSnapshotContextPayload {
  readonly formatVersion: 1;
  readonly contextIdentity: ReviewSnapshotContextIdentity;
  readonly selectionIdentity: ReviewContextSelectionIdentity;
  readonly selectionRevision: number;
  readonly rules: readonly ReviewContextRule[];
  readonly defaultIgnoredUntracked: 'excluded';
  readonly semanticDigest: { readonly algorithm: 'sha256'; readonly value: string };
  readonly manifest: {
    readonly formatVersion: 1;
    readonly totalItems: number;
    readonly digest: { readonly algorithm: 'sha256'; readonly value: string };
    readonly windowSize: typeof REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS;
  };
  readonly sourceGroups: readonly ReviewSnapshotContextSourceGroup[];
  readonly conflicts: readonly ContextSourceOccurrenceConflict[];
  readonly totals: {
    readonly availableItems: number;
    readonly unavailableItems: number;
    readonly excludedItems: number;
    readonly sensitiveItems: number;
    readonly contentSegments: number;
    readonly contentBytes: number;
  };
}

export interface ReviewSnapshotContextManifestWindowPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly contextIdentity: ReviewSnapshotContextIdentity;
  readonly offset: number;
  readonly items: readonly ReviewSnapshotContextItem[];
}

export interface ReviewSnapshotContextContentPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly contextIdentity: ReviewSnapshotContextIdentity;
  readonly itemIdentity: ReviewSnapshotContextItemIdentity;
  readonly itemOrder: number;
  readonly contentIdentity: ReviewSnapshotContextContentIdentity;
  readonly ordinal: number;
  readonly scope: ReviewContextContributionScope;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface ReviewBasisPayloadBase {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBasisIdentity: ReviewBasisIdentity;
}

export type ReviewBasisPayload =
  | (ReviewBasisPayloadBase & {
      readonly kind: 'live';
    })
  | (ReviewBasisPayloadBase & {
      readonly kind: 'git-commit';
      readonly parentReviewBasisIdentity: ReviewBasisIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly commit: ReviewBasisCommit;
    })
  | (ReviewBasisPayloadBase & {
      readonly kind: 'saved-review-point';
      readonly parentReviewBasisIdentity: ReviewBasisIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    })
  | (ReviewBasisPayloadBase & {
      readonly kind: 'change-event';
      readonly parentReviewBasisIdentity: ReviewBasisIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly provenance: {
        readonly kind: 'changes-observed-after-response';
        readonly responseIdentity: ReviewResponseIdentity;
      };
    });

export interface ReviewMessageLocation {
  readonly file: EvidencePath;
  /** One-based source line as committed; it is never silently re-anchored. */
  readonly line: number;
}

export interface ReviewMessageRepositoryState {
  readonly kind: 'current-repository-state';
  readonly basis: CurrentChangesComparisonBasis;
  readonly comparedState: CurrentChangesComparedState;
  readonly manifest: CurrentChangesManifestSummary;
}

export interface ReviewMessagePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly location: ReviewMessageLocation;
  /** Exact user-authored text, including whitespace. */
  readonly body: string;
  /** Exact outgoing material committed atomically by Harness Interaction. */
  readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
  /** Digest-bearing observation only; never an automatic source Snapshot. */
  readonly repositoryStateAtCommitment: ReviewMessageRepositoryState;
}

export interface ReviewMessageBatchPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
}

export interface ReviewMessageOutgoingMaterialPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
  readonly representation: 'live-repository-reference' | 'saved-origin';
  readonly encoding: 'utf8';
  readonly byteLength: number;
  readonly characterLength: number;
  readonly sha256: string;
}

export interface ReviewMessageResponsePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly responseIdentity: ReviewResponseIdentity;
  readonly handoffIdentity: string;
  readonly invocationIdentity: string;
  readonly terminalEvidenceIdentity: string;
  readonly artifactResultContractIdentity: string;
  /** Complete finalized assistant text accepted under the frozen Result contract. */
  readonly body: string;
  readonly bodySha256: string;
  readonly bodyByteLength: number;
}

export interface ReviewSnapshotPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  /** Present only on Snapshots created by the superseded pass lifecycle. */
  readonly reviewPassIdentity?: ReviewPassIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  /** Absent on the first Snapshot and on records created before lineage support. */
  readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly changeSetIdentity: string;
  /** Retained only as an internal fast-verification hint; immutable Snapshot bytes remain authoritative. */
  readonly sourceEvidenceIdentity?: string;
  readonly basis: ReviewComparisonBasis;
  readonly comparedState: ReviewComparedState;
  /** Absent only for pre-selector current-change Review records. */
  readonly comparison?: ReviewComparisonSelection;
  /** Present for explicit revision-pair and local-ref merge-base evidence. */
  readonly comparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
  readonly comparisonDynamicInputs?: readonly ReviewComparisonDynamicInput[];
  readonly manifest: CurrentChangesManifestSummary;
  /** Absent is the canonical exact revision-0 empty supporting-context basis. */
  readonly context?: ReviewSnapshotContextPayload;
  readonly workspaceVerificationAtCapture: 'current' | 'unverified';
}

export type ReviewProjectedDiffUnavailableReason = 'content-unavailable' | 'not-text' | 'comparison-limit';

export type ReviewSnapshotDiffIndex =
  | {
      readonly status: 'available';
      readonly totalRows: number;
      readonly windowSize: typeof REVIEW_DIFF_WINDOW_ROWS;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: ReviewProjectedDiffUnavailableReason;
    };

export interface ReviewSnapshotFilePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly file: CurrentChangedFile;
  readonly diff: ReviewSnapshotDiffIndex;
}

export interface ReviewManifestWindowPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly offset: number;
  readonly files: readonly CurrentChangedFile[];
}

export interface ReviewDiffRowContentReference {
  readonly side: 'old' | 'new';
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly digest: string;
}

export interface ReviewDiffRowPayload {
  readonly rowIdentity: string;
  readonly kind: 'context' | 'deletion' | 'addition';
  readonly oldLine?: number;
  readonly newLine?: number;
  readonly content: ReviewDiffRowContentReference;
}

export interface ReviewDiffWindowPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly fileIdentity: string;
  readonly offset: number;
  readonly rows: readonly ReviewDiffRowPayload[];
}

export interface ReviewQuestionDraftLegacyCandidateProvenance {
  readonly kind: 'legacy-review.queue-candidate';
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceDigest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
}

export interface ReviewQuestionDraftPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly status: 'open' | 'committed';
  readonly body: string;
  readonly anchor: ReviewQuestionAnchor;
  readonly provenance?: ReviewQuestionDraftLegacyCandidateProvenance;
  readonly reviewBatchIdentity?: ReviewBatchIdentity;
  readonly questionIdentity?: ReviewQuestionIdentity;
}

export interface ReviewQuestionBatchPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly intent: 'question-only';
  readonly questionIdentities: readonly ReviewQuestionIdentity[];
}

export interface ReviewQuestionPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly questionIdentity: ReviewQuestionIdentity;
  /** Present only for Questions committed through the superseded Draft flow. */
  readonly draftIdentity?: ReviewQuestionDraftIdentity;
  readonly intent: 'question';
  readonly body: string;
  readonly anchor: ReviewQuestionAnchor;
  readonly ordinal: number;
}

export interface ReviewDispositionPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly disposition: ReviewQuestionDisposition;
  readonly decidedBy: 'human';
  readonly stateVersion: number;
}

export interface ReviewResponsePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly responseIdentity: ReviewResponseIdentity;
  readonly handoffIdentity: string;
  readonly invocationIdentity: string;
  readonly terminalEvidenceIdentity: string;
  readonly artifactResultContractIdentity: string;
  /** Complete finalized assistant text accepted under the frozen Result contract. */
  readonly body: string;
  readonly bodySha256: string;
  readonly bodyByteLength: number;
}

export interface ReviewingCommandRecordPayload {
  readonly formatVersion: 1;
  readonly normalizedCommand: string;
  readonly result: ReviewingCommandAccepted;
}

export interface CapturedSnapshotFile {
  readonly file: CurrentChangedFile;
  readonly oldContent?: Uint8Array;
  readonly newContent?: Uint8Array;
}

export interface CapturedReviewSnapshot {
  readonly capture: CurrentChangesCaptureReadyView | ReviewComparisonCaptureReadyView;
  readonly files: readonly CapturedSnapshotFile[];
}

export interface CapturedReviewContextContent {
  readonly scope: ReviewContextContributionScope;
  readonly bytes: Uint8Array;
}

export type CapturedReviewContextItem =
  | {
      readonly kind: 'locator';
      readonly source: ContextSourceCaptureItem;
      readonly decision: ReviewContextRuleDecision;
      readonly scope: ReviewSnapshotContextScope;
      readonly contents: readonly CapturedReviewContextContent[];
      readonly pinnedFrom?: {
        readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
        readonly itemIdentity: ReviewSnapshotContextItemIdentity;
      };
    }
  | {
      readonly kind: 'contribution';
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly contribution: ReviewContextContributionPayload;
      readonly contents: readonly CapturedReviewContextContent[];
    };

export interface CapturedReviewContext {
  readonly selectionIdentity: ReviewContextSelectionIdentity;
  readonly selectionRevision: number;
  readonly rules: readonly ReviewContextRule[];
  readonly sourceGroups: readonly ReviewSnapshotContextSourceGroup[];
  readonly conflicts: readonly ContextSourceOccurrenceConflict[];
  readonly items: readonly CapturedReviewContextItem[];
  readonly semanticDigest: string;
}

export type ReviewSnapshotCaptureRequest =
  | { readonly kind: 'current-changes' }
  | {
      readonly kind: 'comparison';
      readonly selection: ReviewComparisonSelection;
      readonly expectedBasisObjectIdentity: string | null;
      readonly expectedComparedObjectIdentity: string;
      readonly expectedComparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
    }
  | {
      /** Refresh re-resolves declared intent without pinning the old endpoints. */
      readonly kind: 'comparison-refresh';
      readonly selection: ReviewComparisonSelection;
    };

export interface CaptureSnapshotFailure {
  readonly reason: ReviewingCommandRejectionReason;
}

export interface ReviewContextVerification {
  readonly verdict: 'current' | 'stale' | 'unverified';
  readonly selectionChanged: boolean;
  readonly verdicts: readonly ContextItemVerdict[];
}

export class ReviewingStateProblem extends Error {
  constructor() {
    super('reviewing-state-invalid');
    this.name = 'ReviewingStateProblem';
  }
}
