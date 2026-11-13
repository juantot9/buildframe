import type { ContextSourceByteScope, ContextSourceClassification } from '../contextEvidence.js';
import type {
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceOccurrenceIdentity,
} from '../legacyReviewImport/index.js';
import type {
  CurrentChangesManifestSummary,
  EvidenceContentAvailability,
  EvidenceContentClassification,
  EvidenceContentIdentity,
  EvidenceContentLimitation,
  ReviewComparisonResolutionIdentity,
  ReviewComparisonSelection,
} from '../workspaceEvidence/index.js';
import type {
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewContextContributionIdentity,
  ReviewContextRuleIdentity,
  ReviewContextSelectionIdentity,
  ReviewDispositionIdentity,
  ReviewIdentity,
  ReviewMessageIdentity,
  ReviewPassIdentity,
  ReviewQuestionDraftIdentity,
  ReviewQuestionIdentity,
  ReviewResponseIdentity,
  ReviewResultIdentity,
  ReviewSnapshotContextItemIdentity,
  ReviewSnapshotIdentity,
} from './identities.js';

export type ReviewContextSource =
  | {
      readonly kind: 'workspace';
      readonly form: 'file' | 'directory';
      readonly inclusion: 'ordinary' | 'ignored-explicit';
      readonly pathBytesBase64: string;
    }
  | {
      readonly kind: 'outside-checkout';
      readonly form: 'file' | 'directory';
      readonly absolutePath: string;
    };

export type ReviewContextExclusionTarget =
  | {
      readonly kind: 'workspace';
      readonly form: 'file' | 'directory';
      readonly pathBytesBase64: string;
    }
  | {
      readonly kind: 'outside-checkout';
      readonly form: 'file' | 'directory';
      readonly absolutePath: string;
    };

export type ReviewContextSelectionChange =
  | {
      readonly action: 'include';
      readonly source: ReviewContextSource;
      readonly scope?: ContextSourceByteScope;
      readonly classification?: ContextSourceClassification;
    }
  | {
      readonly action: 'exclude';
      readonly target: ReviewContextExclusionTarget;
    }
  | {
      /** Freezes one exact prior occurrence and stops following its live locator. */
      readonly action: 'pin';
      readonly target: ReviewContextSource;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly itemIdentity: ReviewSnapshotContextItemIdentity;
    }
  | {
      readonly action: 'remove';
      readonly ruleIdentity: ReviewContextRuleIdentity;
    };

export type ReviewContextContributionScope = { readonly kind: 'whole' } | ContextSourceByteScope;

export type ReviewEditorContextSource =
  | {
      readonly kind: 'workspace';
      readonly form: 'file';
      readonly inclusion: 'ordinary' | 'ignored-explicit';
      readonly pathBytesBase64: string;
    }
  | {
      readonly kind: 'outside-checkout';
      readonly form: 'file';
      readonly absolutePath: string;
    }
  | {
      readonly kind: 'editor-buffer';
      readonly sourceIdentity: string;
    };

export interface ReviewEditorBufferProvenance {
  readonly editorInstanceIdentity: string;
  readonly bufferIdentity: string;
  readonly bufferVersion: number;
  readonly savedState: 'saved' | 'unsaved';
}

export type ReviewEditorContextContentInput =
  | {
      readonly status: 'available';
      readonly bytesBase64: string;
      readonly byteLength: number;
      readonly sha256: string;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'editor-read-failed' | 'native-representation-unavailable' | 'contribution-limit';
      readonly observedByteLength?: number;
    };

export interface ReviewEditorContextContributionInput {
  readonly kind: 'editor';
  readonly source: ReviewEditorContextSource;
  readonly scope: ReviewContextContributionScope;
  readonly editor: ReviewEditorBufferProvenance;
  readonly content: ReviewEditorContextContentInput;
  readonly classification?: ContextSourceClassification;
}

export type ReviewArtifactContextReference =
  | {
      readonly kind: 'review-response';
      readonly responseIdentity: ReviewResponseIdentity;
    }
  | {
      readonly kind: 'review-snapshot-file-side';
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly fileIdentity: string;
      readonly side: 'old' | 'new';
    };

export interface ReviewArtifactContextContributionInput {
  readonly kind: 'artifact';
  readonly artifact: ReviewArtifactContextReference;
  readonly scope: ReviewContextContributionScope;
}

export type ReviewContextContributionInput =
  | ReviewEditorContextContributionInput
  | ReviewArtifactContextContributionInput;

export type ReviewContextRule =
  | {
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly action: 'include';
      readonly source: ReviewContextSource;
      readonly scope?: ContextSourceByteScope;
      readonly classification?: ContextSourceClassification;
    }
  | {
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly action: 'exclude';
      readonly target: ReviewContextExclusionTarget;
    }
  | {
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly action: 'pin';
      readonly target: ReviewContextSource;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      readonly itemIdentity: ReviewSnapshotContextItemIdentity;
    }
  | {
      readonly ruleIdentity: ReviewContextRuleIdentity;
      readonly action: 'contribute';
      readonly contributionIdentity: ReviewContextContributionIdentity;
    };

export interface ReviewContextRuleDecision {
  readonly status: 'included' | 'excluded';
  readonly decidingRuleIdentity: ReviewContextRuleIdentity;
  readonly inclusionRuleIdentities: readonly ReviewContextRuleIdentity[];
}

export interface ReviewDiffLineAnchorInput {
  readonly kind: 'review.diff-line';
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  /** One-based display hint resolved against exact immutable Snapshot bytes. */
  readonly line: number;
  /** Exact immutable file coordinate; row coordinates remain an all-or-none pair. */
  readonly fileAbsolute?: number;
  readonly rowIdentity?: string;
  readonly rowAbsolute?: number;
}

export interface ReviewWholeFileAnchorInput {
  readonly kind: 'review.whole-file';
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  readonly fileAbsolute?: number;
}

export type ReviewAnchorInput = ReviewDiffLineAnchorInput | ReviewWholeFileAnchorInput;

export type ReviewAnchorRejectionReason =
  | 'anchor-file-not-found'
  | 'anchor-side-not-present'
  | 'anchor-content-unavailable'
  | 'anchor-line-not-found'
  | 'anchor-line-too-large';

export interface ReviewQuestionLineAnchor {
  readonly kind: 'review.diff-line';
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  readonly line: number;
  /** Exact immutable presentation coordinates; absent on historical Anchors. */
  readonly fileAbsolute?: number;
  readonly rowIdentity?: string;
  readonly rowAbsolute?: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly lineContent: EvidenceContentIdentity & {
    readonly bytesBase64: string;
  };
}

export interface ReviewQuestionWholeFileAnchor {
  readonly kind: 'review.whole-file';
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly fileIdentity: string;
  readonly side: 'old' | 'new';
  readonly scope: 'file';
  readonly fileAbsolute?: number;
  readonly content:
    | {
        readonly status: 'available';
        readonly classification: EvidenceContentClassification;
        readonly byteLength: number;
        readonly contentIdentity: EvidenceContentIdentity;
      }
    | {
        readonly status: 'unavailable';
        readonly classification: EvidenceContentClassification;
        readonly availability: Exclude<EvidenceContentAvailability, 'captured'>;
        readonly byteLength: number | null;
        readonly contentIdentity?: EvidenceContentIdentity;
        readonly limitation?: EvidenceContentLimitation;
      };
}

export type ReviewQuestionAnchor = ReviewQuestionLineAnchor | ReviewQuestionWholeFileAnchor;

export interface ReviewingCommandBase {
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
}

export interface StartCurrentChangesReviewCommand extends ReviewingCommandBase {
  readonly kind: 'review.current-changes.start';
}

export interface StartReviewComparisonCommand extends ReviewingCommandBase {
  readonly kind: 'review.comparison.start';
  readonly selection: ReviewComparisonSelection;
  /** Object identity when unscoped; exact endpoint projection identity when scoped. */
  readonly expectedBasisObjectIdentity: string | null;
  /** Object identity when unscoped; exact endpoint projection identity when scoped. */
  readonly expectedComparedObjectIdentity: string;
  /** Required only for explicit revision-pair and local-ref merge-base intent. */
  readonly expectedComparisonResolutionIdentity?: ReviewComparisonResolutionIdentity;
}

/** Explicit fixed-comparison continuation through the current local HEAD. */
export interface ContinueReviewComparisonWithLiveChangesCommand extends ReviewingCommandBase {
  readonly kind: 'review.comparison.continue-live';
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedReviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly expectedSavedEndpointObjectIdentity: string;
  readonly expectedCurrentHeadObjectIdentity: string | null;
  readonly expectedLiveChangesIdentity: string;
}

/** Explicit human-invoked refresh of the Active Review's retained Change Set. */
export interface RefreshReviewChangeSetCommand extends ReviewingCommandBase {
  readonly kind: 'review.change-set.refresh';
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedReviewSnapshotIdentity: ReviewSnapshotIdentity;
}

export interface RefreshReviewContextCommand extends ReviewingCommandBase {
  readonly kind: 'review.context.refresh';
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedReviewSnapshotIdentity: ReviewSnapshotIdentity;
}

/** Captures one automatically discovered, read-only Git commit on first open. */
export interface CaptureReviewGitCommitBasisCommand extends ReviewingCommandBase {
  readonly kind: 'review.basis.git-commit.capture';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBasisIdentity: ReviewBasisIdentity;
  readonly commitObjectIdentity: string;
}

/** Deliberate user-owned snapshot point; ordinary repository churn never calls this. */
export interface ForkReviewBasisCommand extends ReviewingCommandBase {
  readonly kind: 'review.basis.fork';
  readonly reviewIdentity: ReviewIdentity;
  readonly parentReviewBasisIdentity: ReviewBasisIdentity;
}

/** Internal follow-up to one correlated, completely captured Message Response. */
export interface RecordReviewChangeObservationCommand extends ReviewingCommandBase {
  readonly kind: 'review.change-observation.record';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly responseIdentity: ReviewResponseIdentity;
}

export interface ChangeReviewContextSelectionCommand extends ReviewingCommandBase {
  readonly kind: 'review.context-selection.change';
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedSelectionRevision: number;
  readonly change: ReviewContextSelectionChange;
}

export interface AddReviewContextContributionCommand extends ReviewingCommandBase {
  readonly kind: 'review.context-contribution.add';
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedSelectionRevision: number;
  readonly contribution: ReviewContextContributionInput;
}

export interface CreateReviewQuestionDraftCommand extends ReviewingCommandBase {
  readonly kind: 'review.question-draft.create';
  readonly reviewIdentity: ReviewIdentity;
  readonly anchor: ReviewAnchorInput;
  /** Exact Question text. Whitespace is preserved rather than normalized. */
  readonly body: string;
}

export interface PromoteLegacyQuestionCandidateCommand extends ReviewingCommandBase {
  readonly kind: 'review.legacy-question-candidate.promote';
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly expectedSourceDigest: string;
  readonly reviewIdentity: ReviewIdentity;
  readonly expectedReviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly intent: 'question';
  readonly anchor: ReviewAnchorInput;
}

export interface ReviseReviewQuestionDraftCommand extends ReviewingCommandBase {
  readonly kind: 'review.question-draft.revise';
  readonly reviewIdentity: ReviewIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly expectedDraftRevision: number;
  readonly anchor: ReviewAnchorInput;
  /** Exact replacement Question text. */
  readonly body: string;
}

export interface CommitReviewQuestionBatchCommand extends ReviewingCommandBase {
  readonly kind: 'review.question-batch.commit';
  readonly reviewIdentity: ReviewIdentity;
  /** Deliberate immutable Batch order. */
  readonly draftIdentities: readonly ReviewQuestionDraftIdentity[];
}

export type ReviewQuestionDisposition = 'answered' | 'open' | 'dismissed';

/** This command records a human judgment; no Harness command can create one. */
export interface SetReviewQuestionDispositionCommand extends ReviewingCommandBase {
  readonly kind: 'review.question.disposition.set';
  readonly reviewIdentity: ReviewIdentity;
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly disposition: ReviewQuestionDisposition;
}

export interface CompleteReviewCommand extends ReviewingCommandBase {
  readonly kind: 'review.complete';
  readonly reviewIdentity: ReviewIdentity;
}

export interface CancelReviewCommand extends ReviewingCommandBase {
  readonly kind: 'review.cancel';
  readonly reviewIdentity: ReviewIdentity;
}

export type ReviewingCommand =
  | StartCurrentChangesReviewCommand
  | StartReviewComparisonCommand
  | ContinueReviewComparisonWithLiveChangesCommand
  | RefreshReviewChangeSetCommand
  | RefreshReviewContextCommand
  | CaptureReviewGitCommitBasisCommand
  | ForkReviewBasisCommand
  | RecordReviewChangeObservationCommand
  | ChangeReviewContextSelectionCommand
  | AddReviewContextContributionCommand
  | CreateReviewQuestionDraftCommand
  | PromoteLegacyQuestionCandidateCommand
  | ReviseReviewQuestionDraftCommand
  | CommitReviewQuestionBatchCommand
  | SetReviewQuestionDispositionCommand
  | CompleteReviewCommand
  | CancelReviewCommand;

export interface ReviewingCommandAcceptedBase {
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
}

export interface CurrentChangesReviewStarted extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.current-changes.started';
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly manifest: CurrentChangesManifestSummary;
}

export interface ReviewComparisonStarted extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.comparison.started';
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly manifest: CurrentChangesManifestSummary;
}

export interface ReviewComparisonContinuedWithLiveChanges extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.comparison.continued-live';
  readonly sourceReviewIdentity: ReviewIdentity;
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly manifest: CurrentChangesManifestSummary;
}

/**
 * Closed refresh observation. `unchanged` reuses the latest Snapshot and
 * carries the unchanged expected State version; `changed` Durable-Commits
 * exactly one successor and carries the advanced State version.
 */
export interface ReviewChangeSetRefreshed extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.change-set.refreshed';
  readonly outcome: 'unchanged' | 'changed';
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly manifest: CurrentChangesManifestSummary;
}

/** Bounded, deterministic context movement derived at one exact State version. */
export interface ReviewContextRefreshDelta {
  readonly selectionChanged: boolean;
  readonly verdicts: readonly {
    readonly pathBytesBase64?: string;
    readonly absolutePath?: string;
    readonly currency: 'changed' | 'missing' | 'unavailable' | 'over-limit' | 'added';
    readonly reason?: string;
  }[];
}

/** Closed context-only refresh observation with the same unchanged/changed vocabulary. */
export interface ReviewContextRefreshed extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.context.refreshed';
  readonly outcome: 'unchanged' | 'changed';
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly manifest: CurrentChangesManifestSummary;
  readonly delta: ReviewContextRefreshDelta;
}

export interface ReviewGitCommitBasisCaptured extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.basis.git-commit.captured';
  readonly reviewBasisIdentity: ReviewBasisIdentity;
  readonly parentReviewBasisIdentity: ReviewBasisIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly commit: ReviewBasisCommit;
}

export interface ReviewBasisForked extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.basis.forked';
  readonly reviewBasisIdentity: ReviewBasisIdentity;
  readonly parentReviewBasisIdentity: ReviewBasisIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
}

export type ReviewChangeObservationRecorded =
  | (ReviewingCommandAcceptedBase & {
      readonly kind: 'review.change-observation.recorded';
      readonly outcome: 'unchanged';
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly responseIdentity: ReviewResponseIdentity;
      readonly parentReviewBasisIdentity: ReviewBasisIdentity;
    })
  | (ReviewingCommandAcceptedBase & {
      readonly kind: 'review.change-observation.recorded';
      readonly outcome: 'forked';
      readonly reviewMessageIdentity: ReviewMessageIdentity;
      readonly responseIdentity: ReviewResponseIdentity;
      readonly parentReviewBasisIdentity: ReviewBasisIdentity;
      readonly reviewBasisIdentity: ReviewBasisIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    });

export interface ReviewContextSelectionChanged extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.context-selection.changed';
  readonly selectionIdentity: ReviewContextSelectionIdentity;
  readonly selectionRevision: number;
  readonly action: 'included' | 'excluded' | 'pinned' | 'removed';
  readonly ruleIdentity: ReviewContextRuleIdentity;
}

export interface ReviewContextContributionAdded extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.context-contribution.added';
  readonly selectionIdentity: ReviewContextSelectionIdentity;
  readonly selectionRevision: number;
  readonly ruleIdentity: ReviewContextRuleIdentity;
  readonly contributionIdentity: ReviewContextContributionIdentity;
  readonly contributionKind: 'editor' | 'artifact';
}

export interface ReviewQuestionDraftCreated extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.question-draft.created';
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly draftRevision: number;
  readonly anchor: ReviewQuestionAnchor;
}

export interface LegacyQuestionCandidatePromoted extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.legacy-question-candidate.promoted';
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly draftRevision: 1;
  readonly anchor: ReviewQuestionAnchor;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceDigest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
  readonly intent: 'question';
}

export interface ReviewQuestionDraftRevised extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.question-draft.revised';
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly draftRevision: number;
  readonly anchor: ReviewQuestionAnchor;
}

export interface ReviewQuestionBatchCommitted extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.question-batch.committed';
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly questionIdentities: readonly ReviewQuestionIdentity[];
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
}

export interface ReviewQuestionDispositionRecorded extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.question.disposition-recorded';
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly dispositionIdentity: ReviewDispositionIdentity;
  readonly disposition: ReviewQuestionDisposition;
}

export interface ReviewCompleted extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.completed';
  readonly reviewPassIdentity: ReviewPassIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewResultIdentity: ReviewResultIdentity;
  readonly mode: 'normal' | 'no-findings';
}

export interface ReviewCancelled extends ReviewingCommandAcceptedBase {
  readonly kind: 'review.cancelled';
  readonly cancellationIdentity: string;
}

export type ReviewingCommandAccepted =
  | CurrentChangesReviewStarted
  | ReviewComparisonStarted
  | ReviewComparisonContinuedWithLiveChanges
  | ReviewChangeSetRefreshed
  | ReviewContextRefreshed
  | ReviewGitCommitBasisCaptured
  | ReviewBasisForked
  | ReviewChangeObservationRecorded
  | ReviewContextSelectionChanged
  | ReviewContextContributionAdded
  | ReviewQuestionDraftCreated
  | LegacyQuestionCandidatePromoted
  | ReviewQuestionDraftRevised
  | ReviewQuestionBatchCommitted
  | ReviewQuestionDispositionRecorded
  | ReviewCompleted
  | ReviewCancelled;

export type ReviewingCommandRejectionReason =
  | 'state-version-mismatch'
  | 'command-identity-conflict'
  | 'state-conflict'
  | 'active-review-exists'
  | 'review-limit-reached'
  | 'review-not-found'
  | 'review-not-active'
  | 'review-not-current'
  | 'review-snapshot-identity-mismatch'
  | 'legacy-source-occurrence-not-imported'
  | 'legacy-candidate-source-unavailable'
  | 'legacy-candidate-source-digest-mismatch'
  | 'legacy-candidate-not-found'
  | 'legacy-candidate-intent-unsupported'
  | 'legacy-candidate-body-ineligible'
  | 'legacy-candidate-already-promoted'
  | 'legacy-candidate-promotion-limit'
  | 'comparison-not-found'
  | 'comparison-ambiguous'
  | 'comparison-changed'
  | 'change-set-refresh-unsupported'
  | 'change-set-lineage-limit-reached'
  | 'review-basis-not-found'
  | 'review-basis-already-captured'
  | 'review-basis-limit-reached'
  | 'review-message-not-found'
  | 'review-response-not-found'
  | 'change-observation-already-recorded'
  | 'context-selection-revision-mismatch'
  | 'context-rule-not-found'
  | 'context-rule-limit-reached'
  | 'context-artifact-not-found'
  | 'context-artifact-cycle'
  | 'context-artifact-range-invalid'
  | 'continuation-source-not-current'
  | 'continuation-source-not-fixed'
  | 'continuation-generation-changed'
  | 'snapshot-stale'
  | 'snapshot-unverified'
  | 'anchor-file-not-found'
  | 'anchor-side-not-present'
  | 'anchor-content-unavailable'
  | 'anchor-line-not-found'
  | 'anchor-line-too-large'
  | 'draft-not-found'
  | 'draft-not-open'
  | 'draft-revision-mismatch'
  | 'batch-empty'
  | 'batch-limit-reached'
  | 'question-not-found'
  | 'open-draft-blocks-completion'
  | 'undispositioned-question-blocks-completion'
  | 'open-question-blocks-completion';

export interface ReviewingCommandRejected {
  readonly kind: 'review.command.rejected';
  readonly status: 'rejected';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly reason: ReviewingCommandRejectionReason;
  readonly blockerIdentities?: readonly string[];
}

export type ReviewingCommandResult = ReviewingCommandAccepted | ReviewingCommandRejected;

export interface ReviewBasisCommit {
  readonly kind: 'commit';
  readonly objectFormat: 'sha1' | 'sha256' | 'unknown';
  readonly objectIdentity: string;
  readonly abbreviatedObjectIdentity: string;
  readonly subject: string;
}
