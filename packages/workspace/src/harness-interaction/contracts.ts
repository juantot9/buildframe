import type {
  ReviewBatchIdentity,
  ReviewIdentity,
  ReviewAnchorInput,
  ReviewBasisIdentity,
  ReviewMessageIdentity,
  ReviewMessageLocation,
  ReviewMessageMaterialIdentity,
  ReviewQuestionAnchor,
  ReviewQuestionIdentity,
  ReviewResponseIdentity,
  ReviewSnapshotIdentity,
} from '../reviewing/index.js';
import type { CurrentChangedFile } from '../workspaceEvidence/index.js';
import type { WorkspaceIdentity } from '../workspace.js';

declare const harnessAttachmentIdentityBrand: unique symbol;
declare const harnessCompatibilityIdentityBrand: unique symbol;
declare const harnessHandoffIdentityBrand: unique symbol;
declare const harnessCommitmentReceiptIdentityBrand: unique symbol;
declare const harnessAcknowledgementRequirementIdentityBrand: unique symbol;
declare const harnessAcknowledgementIdentityBrand: unique symbol;
declare const harnessCapabilitySnapshotIdentityBrand: unique symbol;
declare const harnessInvocationIdentityBrand: unique symbol;
declare const userPullPreparationIdentityBrand: unique symbol;
declare const userPullArmOccurrenceIdentityBrand: unique symbol;
declare const harnessInterruptionIntentIdentityBrand: unique symbol;

export type HarnessAttachmentIdentity = string & {
  readonly [harnessAttachmentIdentityBrand]: 'HarnessAttachmentIdentity';
};
export type HarnessCompatibilityIdentity = string & {
  readonly [harnessCompatibilityIdentityBrand]: 'HarnessCompatibilityIdentity';
};
export type HarnessHandoffIdentity = string & {
  readonly [harnessHandoffIdentityBrand]: 'HarnessHandoffIdentity';
};
export type HarnessCommitmentReceiptIdentity = string & {
  readonly [harnessCommitmentReceiptIdentityBrand]: 'HarnessCommitmentReceiptIdentity';
};
export type HarnessAcknowledgementRequirementIdentity = string & {
  readonly [harnessAcknowledgementRequirementIdentityBrand]: 'HarnessAcknowledgementRequirementIdentity';
};
export type HarnessAcknowledgementIdentity = string & {
  readonly [harnessAcknowledgementIdentityBrand]: 'HarnessAcknowledgementIdentity';
};
export type HarnessCapabilitySnapshotIdentity = string & {
  readonly [harnessCapabilitySnapshotIdentityBrand]: 'HarnessCapabilitySnapshotIdentity';
};
export type HarnessInvocationIdentity = string & {
  readonly [harnessInvocationIdentityBrand]: 'HarnessInvocationIdentity';
};
export type UserPullPreparationIdentity = string & {
  readonly [userPullPreparationIdentityBrand]: 'UserPullPreparationIdentity';
};
export type UserPullArmOccurrenceIdentity = string & {
  readonly [userPullArmOccurrenceIdentityBrand]: 'UserPullArmOccurrenceIdentity';
};
export type HarnessInterruptionIntentIdentity = string & {
  readonly [harnessInterruptionIntentIdentityBrand]: 'HarnessInterruptionIntentIdentity';
};

export type HarnessAvailability =
  | { readonly status: 'available' }
  | {
      readonly status: 'blocked';
      readonly reason: 'busy' | 'disconnected' | 'host-unavailable';
    }
  | {
      readonly status: 'unknown';
      readonly reason: 'readiness-unavailable';
    };

/** What one direct Review Handoff may change: discussion only, or the workspace. */
export type DirectReviewAuthority = 'discussion-only' | 'workspace-write';

/**
 * Read-only authority is enforced by narrowing the harness tool set; write
 * authority is communicated and bounded by the tools the session actually has,
 * because BuildFrame does not sandbox the operating system.
 */
export type DirectReviewEffectConstraint =
  | {
      readonly strength: 'enforced';
      readonly scope: 'workspace-read-only';
      readonly limitation: string;
    }
  | {
      readonly strength: 'communicated';
      readonly scope: 'harness-tools';
      readonly limitation: string;
    };

export interface DirectReviewCapabilityContract {
  readonly contractVersion: 1;
  readonly capabilityIdentity: string;
  readonly handoffKind: 'submit-review-batch';
  readonly route: 'direct';
  readonly authority: DirectReviewAuthority;
  readonly effectConstraint: DirectReviewEffectConstraint;
  readonly evidenceProfile: {
    readonly dispatchRejection: 'correlated';
    readonly start: 'correlated';
    readonly normalEnd: 'correlated';
    readonly failure: 'correlated';
    readonly interruption: 'correlated';
    readonly replay: 'unavailable';
  };
  readonly interruption: {
    readonly route: 'direct-request';
  };
  readonly artifactResultContract: {
    readonly contractVersion: 1;
    readonly contractIdentity: string;
    readonly artifactKind: 'review-response';
    readonly source: 'settled-final-assistant-text';
    readonly completeness: 'all-final-text-blocks-after-correlated-user-message';
    readonly maximumBytes: number;
  };
  readonly noStartTimeoutMs: number;
  readonly knownLimitations: readonly string[];
}

/**
 * A Review the user pulls from inside the Harness. BuildFrame never dispatches it,
 * cannot interrupt it, and has no directive to replay, so this contract has no
 * dispatch, interruption, or no-start fields to fill in. Keeping it separate
 * from the direct contract is deliberate: a direct Adapter must not be able to
 * declare the weaker profile by leaving fields out.
 */
export interface UserPullReviewCapabilityContract {
  readonly contractVersion: 1;
  readonly capabilityIdentity: string;
  readonly handoffKind: 'submit-review-batch';
  readonly route: 'user-pull';
  readonly authority: DirectReviewAuthority;
  readonly effectConstraint: DirectReviewEffectConstraint;
  readonly evidenceProfile: {
    /** The correlated user submission is the only start signal this route has. */
    readonly submission: 'correlated';
    readonly normalEnd: 'correlated';
    readonly failure: 'correlated';
    readonly interruption: 'unavailable';
    readonly replay: 'unavailable';
  };
  /** Present only when the route can preserve one complete exact Response source. */
  readonly artifactResultContract?: {
    readonly contractVersion: 1;
    readonly contractIdentity: string;
    readonly artifactKind: 'review-response';
    readonly source: 'settled-final-assistant-text';
    readonly completeness: 'all-final-text-blocks-after-correlated-user-message';
    readonly maximumBytes: number;
  };
  readonly knownLimitations: readonly string[];
}

export type ReviewedCapabilityContract = DirectReviewCapabilityContract | UserPullReviewCapabilityContract;

export interface ReviewedCapabilityManifest {
  readonly schema: 'neoflow.harness-capabilities/1';
  readonly adapterImplementationIdentity: string;
  readonly adapterDisplayName: string;
  readonly reviewedHostVersions: readonly string[];
  readonly capabilities: readonly ReviewedCapabilityContract[];
}

export interface HarnessAttachmentDestination {
  readonly harnessLabel: string;
  readonly sessionLabel: string;
  readonly repositoryLabel: string;
  readonly canonicalCheckout: string;
}

export interface ReviewedHarnessAttachment {
  /** Stable identity of this normalized establishment occurrence. */
  readonly evidenceIdentity: string;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly hostVersion: string;
  readonly destination: HarnessAttachmentDestination;
  readonly availability: HarnessAvailability;
}

export interface ReviewDisclosureQuestion {
  readonly sourceQuestionIdentity: ReviewQuestionIdentity;
  readonly ordinal: number;
  readonly intent: 'question';
  /** Exact user-authored text, including whitespace. */
  readonly body: string;
  readonly anchor: ReviewQuestionAnchor;
}

/**
 * The exact accepted destination projection for the first Question-only Review
 * Handoff. Local receipts, consent evidence, dispositions, drafts, State, Git,
 * and Adapter-native facts are deliberately absent.
 */
export interface ExactReviewHandoffDisclosure {
  readonly contractVersion: 1;
  readonly handoffKind: 'submit-review-batch';
  readonly authority: DirectReviewAuthority;
  readonly reviewIdentity: ReviewIdentity;
  readonly changeSetIdentity: string;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly manifest: {
    readonly formatVersion: 1;
    readonly totalFiles: number;
    readonly digest: {
      readonly algorithm: 'sha256';
      readonly value: string;
    };
    readonly files: readonly CurrentChangedFile[];
  };
  readonly questions: readonly ReviewDisclosureQuestion[];
  readonly sha256: string;
  readonly byteLength: number;
}

export interface FrozenDirectReviewCapabilitySnapshot {
  readonly snapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly compatibilityIdentity: HarnessCompatibilityIdentity;
  readonly manifestSha256: string;
  readonly capability: DirectReviewCapabilityContract;
  readonly availabilityAtCommit: 'available';
}

export interface FrozenUserPullReviewCapabilitySnapshot {
  readonly snapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly compatibilityIdentity: HarnessCompatibilityIdentity;
  readonly manifestSha256: string;
  readonly capability: UserPullReviewCapabilityContract;
  readonly availabilityAtCommit: 'available';
}

export type UserPullPreparationStatus = 'prepared' | 'claimed' | 'withdrawn' | 'expired';

export type UserPullPreparationTerminalReason =
  | 'explicit-withdrawal'
  | 'workflow-cancellation'
  | 'identity-lost'
  | 'capability-incompatible'
  | 'route-deadline-passed';

export interface ExactReviewMessageHandoffDisclosure {
  readonly contractVersion: 1;
  readonly handoffKind: 'submit-review-batch';
  readonly payloadKind: 'review-message';
  readonly authority: DirectReviewAuthority;
  readonly outgoingMaterial: {
    readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
    readonly representation: 'live-repository-reference' | 'saved-origin';
    readonly encoding: 'utf8';
    readonly bytesBase64: string;
    readonly byteLength: number;
    readonly characterLength: number;
    readonly sha256: string;
  };
  /** Alias of the exact outgoing bytes' digest for route correlation. */
  readonly sha256: string;
  readonly byteLength: number;
  readonly characterLength: number;
}

/** The only thing a Review Message commit may ask to confirm: an earlier turn never reported back. */
export interface ReviewMessageAcknowledgementRequirementView {
  readonly requirementIdentity: HarnessAcknowledgementRequirementIdentity;
  readonly kind: 'unresolved-invocation-risk';
  readonly invocationIdentity: HarnessInvocationIdentity;
}

/** A Review Message is never scanned for secrets; it goes to the Harness as written. */
export interface ReviewMessageCommitmentAssessmentView {
  readonly assessmentIdentity: string;
  readonly status: 'direct' | 'gate';
  /** Requirements this exact commit action must acknowledge. */
  readonly requirements: readonly ReviewMessageAcknowledgementRequirementView[];
}

export interface DispatchDirectReviewInvocationDirective {
  readonly kind: 'harness.direct-review.dispatch';
  readonly contractVersion: 1;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly capabilitySnapshot: FrozenDirectReviewCapabilitySnapshot;
  readonly disclosure: ExactReviewHandoffDisclosure;
}

export interface DispatchDirectReviewMessageInvocationDirective {
  readonly kind: 'harness.direct-review-message.dispatch';
  readonly contractVersion: 1;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly capabilitySnapshot: FrozenDirectReviewCapabilitySnapshot;
  readonly disclosure: ExactReviewMessageHandoffDisclosure;
}

export interface RequestDirectInvocationInterruptionDirective {
  readonly kind: 'harness.direct-invocation.interrupt';
  readonly contractVersion: 1;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly interruptionIntentIdentity: HarnessInterruptionIntentIdentity;
}

export type CommittedHarnessDirective =
  | DispatchDirectReviewInvocationDirective
  | DispatchDirectReviewMessageInvocationDirective
  | RequestDirectInvocationInterruptionDirective;

export type HarnessDirectiveObservation =
  | { readonly status: 'accepted-for-observation' }
  | {
      readonly status: 'proven-not-dispatched';
      readonly evidenceIdentity: string;
      readonly reason: 'harness-rejected' | 'host-unavailable' | 'capability-withdrawn';
    };

export interface NormalizedReviewResponseResult {
  readonly contractVersion: 1;
  readonly contractIdentity: string;
  readonly source: 'settled-final-assistant-text';
  /** Every finalized assistant text block concatenated in native source order. */
  readonly body: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export type UserPullInvocationUnresolvedReason =
  | 'start-observation-window-expired'
  | 'start-evidence-lost'
  | 'session-ended-without-terminal'
  | 'host-disconnected'
  | 'attachment-identity-changed'
  | 'background-activity-remains'
  | 'background-activity-unverified'
  | 'stop-continuation-active';

export interface UserPullEvidenceCorrelation {
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly occurrenceIdentity: UserPullArmOccurrenceIdentity;
  readonly sessionId: string;
  readonly promptId: string;
  readonly canonicalGitRoot: string;
  readonly canonicalGitDir: string;
  readonly bridgeProtocolVersion: 1;
}

export type NormalizedHarnessEvidence =
  | {
      readonly kind: 'harness.availability.observed';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly availability: HarnessAvailability;
    }
  | {
      readonly kind: 'harness.invocation.start-observed';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
    }
  | {
      readonly kind: 'harness.invocation.terminal-observed';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly outcome: 'ended-normally' | 'failed' | 'interrupted';
      readonly result?: NormalizedReviewResponseResult;
      readonly reason?: 'harness-failed' | 'effect-constraint-failed' | 'interruption-observed';
    }
  | {
      readonly kind: 'harness.invocation.rejected';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly reason: 'harness-rejected' | 'host-unavailable' | 'capability-withdrawn';
    }
  | {
      readonly kind: 'harness.invocation.correlation-lost';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly reason: 'attachment-lost' | 'correlation-lost' | 'terminal-evidence-lost';
    }
  | ({
      readonly kind: 'harness.user-pull.start-observed';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
    } & UserPullEvidenceCorrelation)
  | ({
      readonly kind: 'harness.user-pull.terminal-observed';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly terminalEvent: 'normal-stop' | 'stop-failure';
      readonly outcome: 'ended-normally' | 'failed';
      readonly backgroundTaskCount?: number;
      readonly sessionCronCount?: number;
      readonly stopHookActive?: boolean;
      readonly errorType?: string;
      readonly failureType?: string;
    } & UserPullEvidenceCorrelation)
  | ({
      readonly kind: 'harness.user-pull.correlation-lost';
      readonly evidenceIdentity: string;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly reason: UserPullInvocationUnresolvedReason;
      readonly trigger:
        | 'start-observation-window'
        | 'normal-stop-before-start'
        | 'stop-failure-before-start'
        | 'session-end'
        | 'normal-stop'
        | 'reconciliation';
      readonly backgroundTaskCount?: number;
      readonly sessionCronCount?: number;
      readonly stopHookActive?: boolean;
      readonly errorType?: string;
      readonly failureType?: string;
      readonly sessionReason?: string;
      readonly observedCanonicalGitRoot?: string;
      readonly observedCanonicalGitDir?: string;
    } & UserPullEvidenceCorrelation);

export type HarnessEvidenceRefusalReason =
  | 'invalid-evidence'
  | 'attachment-not-found'
  | 'attachment-identity-mismatch'
  | 'invocation-not-found'
  | 'evidence-identity-conflict'
  | 'illegal-evidence-order'
  | 'conflicting-terminal-evidence'
  | 'state-version-changed'
  | 'state-conflict'
  | 'state-unavailable';

export type HarnessEvidenceAcknowledgement =
  | {
      readonly status: 'applied';
      readonly evidenceIdentity: string;
      readonly stateVersion: number;
    }
  | {
      readonly status: 'refused';
      readonly evidenceIdentity?: string;
      readonly reason: HarnessEvidenceRefusalReason;
    };

export interface HarnessEvidenceSink {
  /** Acknowledges only after the complete normalized evidence transition commits. */
  accept(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement>;
}

export interface ReviewedHarnessConnection {
  perform(directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation>;
  /**
   * Tells the session it is no longer connected because another session in
   * this checkout connected after it. It must not reconnect on its own.
   */
  release?(reason: 'replaced'): void;
}

/** The reviewed internal Adapter Interface. Native host facts stop before here. */
export interface ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection;
}

export type HarnessAttachmentRefusalReason =
  | 'invalid-manifest'
  | 'unsupported-host-version'
  | 'invalid-attachment'
  | 'workspace-mismatch'
  | 'checkout-mismatch'
  | 'attachment-identity-conflict'
  | 'evidence-identity-conflict'
  | 'state-version-changed'
  | 'state-conflict'
  | 'state-unavailable';

export type HarnessAttachmentEstablishment =
  | {
      readonly status: 'established';
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly compatibilityIdentity: HarnessCompatibilityIdentity;
      readonly stateVersion: number;
    }
  | {
      readonly status: 'refused';
      readonly reason: HarnessAttachmentRefusalReason;
    };

/** Runtime-only host for reviewed Adapters; never part of the Workspace Interface. */
export interface WorkspaceHarnessAdapterHost {
  establish(adapter: ReviewedHarnessAdapter): Promise<HarnessAttachmentEstablishment>;
}

interface HarnessInteractionCommandBase {
  readonly commandIdentity: string;
  readonly expectedStateVersion: number;
}

export interface ReviewMessageLocationInput {
  /** Canonical Base64 of exact repository-relative path bytes. */
  readonly pathBytesBase64: string;
  /** One-based line selected by the user. */
  readonly line: number;
}

export interface CommitReviewMessageCommand extends HarnessInteractionCommandBase {
  readonly kind: 'review.message.commit';
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly location: ReviewMessageLocationInput;
  /** Exact user-authored text. Whitespace is preserved. */
  readonly body: string;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly inspectionIdentity: string;
  /** Exact ordered requirements from the bound inspection; empty for `direct`. */
  readonly acceptedAcknowledgementRequirementIdentities: readonly HarnessAcknowledgementRequirementIdentity[];
}

export interface AskPiReviewQuestionCommand extends HarnessInteractionCommandBase {
  readonly kind: 'review.question.ask';
  readonly reviewIdentity: ReviewIdentity;
  readonly anchor: ReviewAnchorInput;
  /** Exact Question text. Whitespace is preserved. */
  readonly body: string;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly inspectionIdentity: string;
}

/** Historical staged Handoff command retained only for old command recovery. */
export interface CommitDirectReviewHandoffCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.review-handoff.commit';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly inspectionIdentity: string;
  readonly acknowledgeUnresolvedInvocationRisk: boolean;
}

export interface RequestHarnessInterruptionCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.invocation.interruption.request';
  readonly invocationIdentity: HarnessInvocationIdentity;
}

/**
 * Establishes one Claude User Pull attachment from native hook facts. The
 * bridge carries the reviewed manifest and the observed host version; the four
 * identity parts are the exact facts every later arm and claim revalidates.
 */
export interface AttachUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.attach';
  readonly sessionId: string;
  readonly canonicalGitRoot: string;
  readonly canonicalGitDir: string;
  readonly hostVersion: string;
  readonly manifest: ReviewedCapabilityManifest;
}

export interface PrepareUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.prepare';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly inspectionIdentity: string;
  /** An exact disclosed route deadline; elapsed time alone otherwise never expires a Preparation. */
  readonly disclosedDeadline?: string;
}

export interface ArmUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.arm';
  readonly bridgeProtocolVersion: number;
  readonly sessionId: string;
  readonly promptId: string;
  readonly canonicalGitRoot: string;
  readonly canonicalGitDir: string;
}

export interface ClaimUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.claim';
  readonly bridgeProtocolVersion: number;
  readonly canonicalGitRoot: string;
  readonly canonicalGitDir: string;
}

export interface WithdrawUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.withdraw';
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly reason: 'explicit-withdrawal' | 'workflow-cancellation';
}

export type UserPullObservation =
  | {
      readonly kind: 'prompt-submitted';
      readonly sessionId: string;
      readonly promptId: string;
      readonly canonicalGitRoot: string;
      readonly canonicalGitDir: string;
    }
  | {
      readonly kind: 'normal-stop';
      readonly sessionId: string;
      readonly promptId: string;
      readonly canonicalGitRoot: string;
      readonly canonicalGitDir: string;
      readonly backgroundTaskCount?: number;
      readonly sessionCronCount?: number;
      readonly stopHookActive: boolean;
    }
  | {
      readonly kind: 'stop-failure';
      readonly sessionId: string;
      readonly promptId: string;
      readonly canonicalGitRoot: string;
      readonly canonicalGitDir: string;
      readonly errorType?: string;
      readonly failureType?: string;
    }
  | {
      readonly kind: 'session-ended';
      readonly sessionId: string;
      readonly canonicalGitRoot: string;
      readonly canonicalGitDir: string;
      readonly sessionReason?: string;
    }
  | {
      readonly kind: 'correlation-lost';
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly invocationIdentity: HarnessInvocationIdentity;
      readonly reason: 'host-disconnected' | 'attachment-identity-changed';
    };

export interface ObserveUserPullCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.observe';
  readonly bridgeProtocolVersion: number;
  readonly observation: UserPullObservation;
}

export interface HarnessReportedContextUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
}

export type UserPullObservabilityObservation =
  | {
      readonly kind: 'context-budget';
      readonly evidenceIdentity: string;
      readonly compatibilityIdentity: HarnessCompatibilityIdentity;
      readonly source: 'claude-status-line';
      readonly modelId: string;
      readonly modelDisplayName: string;
      readonly contextWindowSize: number;
      readonly totalInputTokens: number;
      readonly totalOutputTokens: number;
      readonly currentUsage: HarnessReportedContextUsage | null;
      readonly usedPercentage?: number;
      readonly remainingPercentage?: number;
      readonly promptId?: string;
    }
  | {
      readonly kind: 'compaction';
      readonly evidenceIdentity: string;
      readonly phase: 'started' | 'completed';
      readonly trigger: 'manual' | 'auto';
    }
  | {
      readonly kind: 'availability-blocked';
      readonly evidenceIdentity: string;
      readonly reason: 'session-ended';
    };

/**
 * Records optional, non-authoritative awareness for one exact User Pull
 * Attachment. This command can never transition a Preparation or Invocation.
 */
export interface RecordUserPullObservabilityCommand extends HarnessInteractionCommandBase {
  readonly kind: 'harness.user-pull.observability.record';
  readonly bridgeProtocolVersion: number;
  readonly sessionId: string;
  readonly canonicalGitRoot: string;
  readonly canonicalGitDir: string;
  readonly observation: UserPullObservabilityObservation;
}

export type HarnessInteractionCommand =
  | CommitReviewMessageCommand
  | AskPiReviewQuestionCommand
  | CommitDirectReviewHandoffCommand
  | RequestHarnessInterruptionCommand
  | AttachUserPullCommand
  | PrepareUserPullCommand
  | ArmUserPullCommand
  | ClaimUserPullCommand
  | WithdrawUserPullCommand
  | ObserveUserPullCommand
  | RecordUserPullObservabilityCommand;

interface HarnessCommandAcceptedBase {
  readonly status: 'accepted';
  readonly commandIdentity: string;
  readonly stateVersion: number;
}

export interface ReviewMessageCommitted extends HarnessCommandAcceptedBase {
  readonly kind: 'review.message.committed';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
  readonly outgoingMaterial: {
    readonly outgoingMaterialIdentity: ReviewMessageMaterialIdentity;
    readonly byteLength: number;
    readonly characterLength: number;
    readonly sha256: string;
  };
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly commitmentAssessmentIdentity: string;
  readonly acknowledgementRequirementIdentities: readonly HarnessAcknowledgementRequirementIdentity[];
  readonly acknowledgementIdentities: readonly HarnessAcknowledgementIdentity[];
}

export interface ReviewQuestionAsked extends HarnessCommandAcceptedBase {
  readonly kind: 'review.question.asked';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly questionIdentity: ReviewQuestionIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
}

export interface DirectReviewHandoffCommitted extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.review-handoff.direct-committed';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
}

export interface HarnessInterruptionRequested extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.invocation.interruption-requested';
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly interruptionIntentIdentity: HarnessInterruptionIntentIdentity;
  readonly route: 'direct-request';
}

export interface UserPullAttached extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.attached';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly compatibilityIdentity: HarnessCompatibilityIdentity;
  readonly destination: HarnessAttachmentDestination;
}

export interface UserPullPrepared extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.prepared';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly disclosedDeadline?: string;
}

export interface UserPullArmed extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.armed';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly occurrenceIdentity: UserPullArmOccurrenceIdentity;
}

interface UserPullClaimResultBase extends HarnessCommandAcceptedBase {
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly occurrenceIdentity: UserPullArmOccurrenceIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
}

/** Durable recovery result. It deliberately contains no payload bytes. */
export interface UserPullClaimCommitted extends UserPullClaimResultBase {
  readonly kind: 'harness.user-pull.claim-committed';
  readonly payloadSha256: string;
  readonly payloadByteLength: number;
}

/** Returned only by the process that won the claim commit. It is never persisted or replayed. */
export interface UserPullClaimed extends UserPullClaimResultBase {
  readonly kind: 'harness.user-pull.claimed';
  readonly payload: string;
  readonly payloadSha256: string;
  readonly payloadByteLength: number;
}

export interface UserPullClaimDuplicate extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.claim-duplicate';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
}

export interface UserPullWithdrawn extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.withdrawn';
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly reason: 'explicit-withdrawal' | 'workflow-cancellation';
}

export interface UserPullObserved extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.observed';
  readonly observationKind: UserPullObservation['kind'];
  readonly disposition: 'started' | 'ended-normally' | 'failed' | 'unresolved';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly evidenceIdentity: string;
}

export interface UserPullObservationIgnored extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.observation-ignored';
  readonly observationKind: UserPullObservation['kind'];
  readonly reason: 'no-correlated-invocation';
}

export interface UserPullObservabilityRecorded extends HarnessCommandAcceptedBase {
  readonly kind: 'harness.user-pull.observability-recorded';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly observationKind: UserPullObservabilityObservation['kind'];
  readonly evidenceIdentity: string;
}

export type HarnessInteractionCommandAccepted =
  | ReviewMessageCommitted
  | ReviewQuestionAsked
  | DirectReviewHandoffCommitted
  | HarnessInterruptionRequested
  | UserPullAttached
  | UserPullPrepared
  | UserPullArmed
  | UserPullClaimCommitted
  | UserPullClaimDuplicate
  | UserPullWithdrawn;

export type HarnessCommandRejectionReason =
  | 'state-version-mismatch'
  | 'command-identity-conflict'
  | 'state-conflict'
  | 'inspection-changed'
  | 'attachment-not-found'
  | 'attachment-not-live'
  | 'attachment-identity-conflict'
  | 'unsupported-host-version'
  | 'capability-unsupported'
  | 'availability-blocked'
  | 'availability-unknown'
  | 'active-invocation-exists'
  | 'unresolved-invocation-risk-not-acknowledged'
  | 'commitment-requirements-not-acknowledged'
  | 'review-not-found'
  | 'review-not-active'
  | 'review-not-current'
  | 'batch-not-found'
  | 'batch-already-handed-off'
  | 'preparation-already-open'
  | 'preparation-not-found'
  | 'preparation-not-open'
  | 'preparation-expired'
  | 'identity-lost'
  | 'capability-incompatible'
  | 'route-deadline-passed'
  | 'no-armed-occurrence'
  | 'ambiguous-armed-occurrence'
  | 'armed-occurrence-limit-reached'
  | 'occurrence-identity-conflict'
  | 'observation-conflict'
  | 'bridge-protocol-mismatch'
  | 'checkout-mismatch'
  | 'user-pull-payload-too-large'
  | 'snapshot-stale'
  | 'snapshot-unverified'
  | 'snapshot-context-disclosure-unavailable'
  | 'review-basis-not-found'
  /** The Review was saved before Messages and has no review points to anchor one. */
  | 'review-predates-messages'
  | 'review-message-limit-reached'
  | 'message-file-not-found'
  | 'message-file-unavailable'
  | 'message-line-not-found'
  | 'message-line-too-large'
  | 'message-source-unrenderable'
  | 'anchor-file-not-found'
  | 'anchor-side-not-present'
  | 'anchor-content-unavailable'
  | 'anchor-line-not-found'
  | 'anchor-line-too-large'
  | 'invocation-not-found'
  | 'invocation-not-interruptible';

export interface HarnessInteractionCommandRejected {
  readonly kind: 'harness.command.rejected';
  readonly status: 'rejected';
  readonly commandIdentity: string;
  readonly stateVersion: number;
  readonly reason: HarnessCommandRejectionReason;
  readonly blockerIdentities?: readonly string[];
}

export type HarnessInteractionCommandResult =
  | HarnessInteractionCommandAccepted
  | UserPullClaimed
  | UserPullObserved
  | UserPullObservationIgnored
  | UserPullObservabilityRecorded
  | HarnessInteractionCommandRejected;

export interface InspectDefaultReviewMessageViewRequest {
  readonly kind: 'harness.review-message.inspect-default';
  readonly reviewIdentity: ReviewIdentity;
  readonly originReviewBasisIdentity: ReviewBasisIdentity;
  readonly location: ReviewMessageLocationInput;
  readonly body: string;
  /**
   * Optional exact user template. A live template uses `{{message}}` and
   * `{{location}}` exactly once each. A saved-origin template uses `{{message}}`
   * exactly once and `{{source}}`/`{{origin}}` together; `{{location}}` is then
   * optional. A live template leaves a saved-origin Message's fixed quoted-source
   * structure intact; a saved-origin template on a live Message is invalid.
   */
  readonly outgoingTemplate?: string;
  /**
   * A preview returns the exact material without the commitment-time
   * repository stability proof, which the commit still requires. Absent means
   * the full inspection path.
   */
  readonly purpose?: 'preview' | 'submit';
}

export interface InspectDefaultReviewQuestionAskViewRequest {
  readonly kind: 'harness.review-question.inspect-default';
  readonly reviewIdentity: ReviewIdentity;
}

export interface InspectDirectReviewHandoffViewRequest {
  readonly kind: 'harness.review-handoff.inspect';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
}

export interface InspectDefaultDirectReviewHandoffViewRequest {
  readonly kind: 'harness.review-handoff.inspect-default';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
}

export interface InspectUserPullReviewHandoffViewRequest {
  readonly kind: 'harness.user-pull.review-handoff.inspect';
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
}

export interface UserPullPreparationViewRequest {
  readonly kind: 'harness.user-pull.preparation';
  readonly attachmentIdentity: HarnessAttachmentIdentity;
}

export interface ReviewHarnessInteractionViewRequest {
  readonly kind: 'harness.review-interaction';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

export interface HarnessCommandResultViewRequest {
  readonly kind: 'harness.command-result';
  readonly commandIdentity: string;
}

/** Which agents this Workspace knows, and whether each can take a Message now. */
export interface HarnessConnectionViewRequest {
  readonly kind: 'harness.connection';
}

export type HarnessInteractionViewRequest =
  | InspectDefaultReviewMessageViewRequest
  | InspectDefaultReviewQuestionAskViewRequest
  | InspectDirectReviewHandoffViewRequest
  | InspectDefaultDirectReviewHandoffViewRequest
  | InspectUserPullReviewHandoffViewRequest
  | UserPullPreparationViewRequest
  | ReviewHarnessInteractionViewRequest
  | HarnessCommandResultViewRequest
  | HarnessConnectionViewRequest;

export type DefaultReviewMessageInspectionView =
  | {
      readonly kind: 'harness.review-message.default-inspection';
      readonly status: 'available';
      readonly stateVersion: number;
      readonly inspectionIdentity: string;
      readonly reviewIdentity: ReviewIdentity;
      readonly originReviewBasisIdentity: ReviewBasisIdentity;
      readonly location: ReviewMessageLocation;
      readonly destination: HarnessDestinationView;
      readonly capability: DirectReviewCapabilityView;
      readonly outgoingMaterial: ExactReviewMessageHandoffDisclosure['outgoingMaterial'];
      readonly commitment: ReviewMessageCommitmentAssessmentView;
      readonly limitations: readonly [
        'The agent may read newer code later.',
        'Naming a file does not limit what the agent can read.',
      ];
    }
  | {
      readonly kind: 'harness.review-message.default-inspection';
      readonly status: 'unavailable';
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly originReviewBasisIdentity: ReviewBasisIdentity;
      readonly reason: DefaultDirectReviewHandoffUnavailabilityReason;
      readonly blockerIdentities?: readonly string[];
    };

export interface HarnessDestinationView extends HarnessAttachmentDestination {
  readonly attachmentIdentity: HarnessAttachmentIdentity;
}

export interface DirectReviewCapabilityView {
  readonly route: 'direct';
  readonly authority: DirectReviewAuthority;
  readonly effectConstraint: DirectReviewCapabilityContract['effectConstraint'];
  readonly evidenceProfile: DirectReviewCapabilityContract['evidenceProfile'];
  readonly interruption: DirectReviewCapabilityContract['interruption'];
  readonly artifactResultContract: DirectReviewCapabilityContract['artifactResultContract'];
  readonly knownLimitations: readonly string[];
}

export type DefaultReviewQuestionAskInspectionView =
  | {
      readonly kind: 'harness.review-question.default-inspection';
      readonly status: 'available';
      readonly stateVersion: number;
      readonly inspectionIdentity: string;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
      /** Present only for a verified current-change inspection. */
      readonly liveChangesIdentity?: string;
      readonly destination: HarnessDestinationView;
      readonly capability: DirectReviewCapabilityView;
    }
  | {
      readonly kind: 'harness.review-question.default-inspection';
      readonly status: 'unavailable';
      readonly stateVersion: number;
      readonly reviewIdentity: ReviewIdentity;
      readonly reason: DefaultDirectReviewHandoffUnavailabilityReason;
      readonly blockerIdentities?: readonly string[];
    };

export interface ReviewHandoffDisclosureSummary {
  readonly fileCount: number;
  readonly questionCount: number;
  /** Present only for the one-type Review Message contract. */
  readonly messageCount?: 1;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface DirectReviewHandoffAvailableView {
  readonly kind: 'harness.review-handoff.inspection';
  readonly status: 'available';
  readonly stateVersion: number;
  readonly inspectionIdentity: string;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly destination: HarnessDestinationView;
  readonly capability: DirectReviewCapabilityView;
  readonly disclosure: ReviewHandoffDisclosureSummary;
  readonly requiresUnresolvedInvocationRiskAcknowledgement: boolean;
}

export interface DirectReviewHandoffUnavailableView {
  readonly kind: 'harness.review-handoff.inspection';
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly reason: HarnessCommandRejectionReason;
  readonly blockerIdentities?: readonly string[];
}

export type DirectReviewHandoffInspectionView = DirectReviewHandoffAvailableView | DirectReviewHandoffUnavailableView;

export type DefaultDirectReviewHandoffUnavailabilityReason =
  | HarnessCommandRejectionReason
  | 'attachment-selection-required'
  | 'message-template-invalid';

export interface DefaultDirectReviewHandoffAvailableView extends Omit<DirectReviewHandoffAvailableView, 'kind'> {
  readonly kind: 'harness.review-handoff.default-inspection';
}

export interface DefaultDirectReviewHandoffUnavailableView {
  readonly kind: 'harness.review-handoff.default-inspection';
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly reason: DefaultDirectReviewHandoffUnavailabilityReason;
  readonly blockerIdentities?: readonly string[];
}

export type DefaultDirectReviewHandoffInspectionView =
  | DefaultDirectReviewHandoffAvailableView
  | DefaultDirectReviewHandoffUnavailableView;

export interface UserPullReviewCapabilityView {
  readonly route: 'user-pull';
  readonly authority: DirectReviewAuthority;
  readonly effectConstraint: UserPullReviewCapabilityContract['effectConstraint'];
  readonly evidenceProfile: UserPullReviewCapabilityContract['evidenceProfile'];
  readonly artifactResultContract?: NonNullable<UserPullReviewCapabilityContract['artifactResultContract']>;
  readonly knownLimitations: readonly string[];
}

export interface UserPullReviewHandoffAvailableView {
  readonly kind: 'harness.user-pull.review-handoff.inspection';
  readonly status: 'available';
  readonly stateVersion: number;
  readonly inspectionIdentity: string;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly destination: HarnessDestinationView;
  readonly capability: UserPullReviewCapabilityView;
  readonly disclosure: ReviewHandoffDisclosureSummary;
}

export interface UserPullReviewHandoffUnavailableView {
  readonly kind: 'harness.user-pull.review-handoff.inspection';
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly reason: HarnessCommandRejectionReason;
  readonly blockerIdentities?: readonly string[];
}

export type UserPullReviewHandoffInspectionView =
  | UserPullReviewHandoffAvailableView
  | UserPullReviewHandoffUnavailableView;

export type UserPullPreparationView =
  | {
      readonly kind: 'harness.user-pull.preparation';
      readonly status: 'not-found';
      readonly stateVersion: number;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
    }
  | {
      readonly kind: 'harness.user-pull.preparation';
      readonly status: UserPullPreparationStatus;
      readonly stateVersion: number;
      readonly attachmentIdentity: HarnessAttachmentIdentity;
      readonly preparationIdentity: UserPullPreparationIdentity;
      readonly handoffIdentity: HarnessHandoffIdentity;
      readonly reviewIdentity: ReviewIdentity;
      readonly reviewBatchIdentity: ReviewBatchIdentity;
      readonly disclosure: ReviewHandoffDisclosureSummary;
      readonly disclosedDeadline?: string;
      readonly liveArmCount: number;
      readonly invocationIdentity?: HarnessInvocationIdentity;
      readonly startObservationDeadline?: string;
      readonly terminalReason?: UserPullPreparationTerminalReason;
    };

export type HarnessInvocationStatus =
  | 'awaiting-start'
  | 'active'
  | 'rejected'
  | 'ended-normally'
  | 'failed'
  | 'interrupted'
  | 'unresolved';

export interface HarnessHandoffView {
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  /** Present when the handoff carries one committed Review Message. */
  readonly reviewMessageIdentity?: ReviewMessageIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly disclosure: ReviewHandoffDisclosureSummary;
}

export interface UserPullContextBudgetAvailableView {
  readonly status: 'available';
  readonly source: 'claude-status-line';
  readonly evidenceIdentity: string;
  readonly modelId: string;
  readonly modelDisplayName: string;
  readonly contextWindowSize: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly currentUsage: HarnessReportedContextUsage;
  readonly usedPercentage?: number;
  readonly remainingPercentage?: number;
  readonly promptId?: string;
}

export interface UserPullContextBudgetUnknownView {
  readonly status: 'unknown';
  readonly source: 'claude-status-line';
  readonly reason:
    | 'awaiting-response'
    | 'model-changed'
    | 'host-report-inconsistent'
    | 'compacted'
    | 'session-ended'
    | 'attachment-stale';
  readonly evidenceIdentity: string;
  readonly modelId?: string;
  readonly modelDisplayName?: string;
  readonly contextWindowSize?: number;
  readonly promptId?: string;
}

export interface UserPullContextBudgetUnavailableView {
  readonly status: 'unavailable';
  readonly reason: 'status-line-bridge-not-verified';
}

export type UserPullContextBudgetView =
  | UserPullContextBudgetAvailableView
  | UserPullContextBudgetUnknownView
  | UserPullContextBudgetUnavailableView;

export interface UserPullCompactionView {
  readonly phase: 'started' | 'completed';
  readonly trigger: 'manual' | 'auto';
  readonly evidenceIdentity: string;
}

export type UserPullAvailabilityView =
  | {
      readonly state: 'unavailable';
      readonly reason: 'attachment-not-observed' | 'attachment-not-selected' | 'attachment-lost';
    }
  | {
      readonly state: 'blocked-by-runtime';
      readonly reason: 'session-ended' | 'busy' | 'disconnected' | 'host-unavailable';
    }
  | {
      readonly state: 'revalidated';
      readonly reason: 'exact-identity-and-contract';
    }
  | {
      readonly state: 'stale';
      readonly reason: 'freshness-unverified' | 'runtime-revalidation-required';
    };

export interface UserPullAttachmentView {
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly destination: HarnessDestinationView;
  readonly availability: UserPullAvailabilityView;
  readonly contextBudget: UserPullContextBudgetView;
  readonly compaction?: UserPullCompactionView;
}

export interface ReviewUserPullInteractionView {
  readonly action: '/neoflow:review';
  readonly availability: UserPullAvailabilityView;
  readonly attachment?: UserPullAttachmentView;
  readonly preparations: readonly Exclude<UserPullPreparationView, { readonly status: 'not-found' }>[];
}

export interface HarnessInvocationView {
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly status: HarnessInvocationStatus;
  readonly missingStartEvidence: boolean;
  readonly missingTerminalEvidence: boolean;
  readonly totalEvidence: number;
  /** Most recent normalized evidence identities, bounded by the projection contract. */
  readonly evidenceIdentities: readonly string[];
  readonly interruptionIntentIdentities: readonly HarnessInterruptionIntentIdentity[];
  readonly startObservationDeadline?: string;
  readonly terminalReason?: string;
  readonly responseIdentity?: ReviewResponseIdentity;
}

export interface ReviewHarnessInteractionView {
  readonly kind: 'harness.review-interaction';
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly totalInteractions: number;
  readonly offset: number;
  readonly nextOffset: number | null;
  readonly handoffs: readonly HarnessHandoffView[];
  readonly invocations: readonly HarnessInvocationView[];
  readonly userPull: ReviewUserPullInteractionView;
}

export interface HarnessCommandResultView {
  readonly kind: 'harness.command-result';
  readonly status: 'available' | 'not-found';
  readonly stateVersion: number;
  readonly commandIdentity: string;
  readonly committedStateVersion?: number;
  readonly result?: HarnessInteractionCommandAccepted;
}

export interface HarnessConnectionEntry {
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly harnessLabel: string;
  readonly sessionLabel: string;
  /**
   * True when the agent's bridge is live in this runtime and can take a
   * direct Message; false for an agent seen before that is gone now.
   */
  readonly connected: boolean;
  readonly availability: HarnessAvailability;
}

export interface HarnessConnectionView {
  readonly kind: 'harness.connection';
  readonly stateVersion: number;
  /** Connected agents first, then by label. */
  readonly harnesses: readonly HarnessConnectionEntry[];
}

export type HarnessInteractionView =
  | DefaultReviewMessageInspectionView
  | DefaultReviewQuestionAskInspectionView
  | DirectReviewHandoffInspectionView
  | DefaultDirectReviewHandoffInspectionView
  | UserPullReviewHandoffInspectionView
  | UserPullPreparationView
  | ReviewHarnessInteractionView
  | HarnessCommandResultView
  | HarnessConnectionView;

export type HarnessInteractionViewFor<Request extends HarnessInteractionViewRequest> =
  Request extends InspectDefaultReviewMessageViewRequest
    ? DefaultReviewMessageInspectionView
    : Request extends InspectDefaultReviewQuestionAskViewRequest
      ? DefaultReviewQuestionAskInspectionView
      : Request extends InspectDirectReviewHandoffViewRequest
        ? DirectReviewHandoffInspectionView
        : Request extends InspectDefaultDirectReviewHandoffViewRequest
          ? DefaultDirectReviewHandoffInspectionView
          : Request extends InspectUserPullReviewHandoffViewRequest
            ? UserPullReviewHandoffInspectionView
            : Request extends UserPullPreparationViewRequest
              ? UserPullPreparationView
              : Request extends ReviewHarnessInteractionViewRequest
                ? ReviewHarnessInteractionView
                : Request extends HarnessCommandResultViewRequest
                  ? HarnessCommandResultView
                  : Request extends HarnessConnectionViewRequest
                    ? HarnessConnectionView
                    : never;

export interface ReviewHarnessInteractionViewScope {
  readonly kind: 'harness.review-interaction';
  readonly reviewIdentity: ReviewIdentity;
  readonly offset: number;
  readonly limit: number;
}

/** Updates whenever an agent connects, disconnects or changes availability. */
export type HarnessConnectionViewScope = HarnessConnectionViewRequest;

export type HarnessInteractionViewScope = ReviewHarnessInteractionViewScope | HarnessConnectionViewScope;
export type HarnessInteractionViewUpdate = ReviewHarnessInteractionView | HarnessConnectionView;
export type HarnessInteractionViewUpdateFor<Scope extends HarnessInteractionViewScope> =
  Scope extends ReviewHarnessInteractionViewScope
    ? ReviewHarnessInteractionView
    : Scope extends HarnessConnectionViewScope
      ? HarnessConnectionView
      : never;
