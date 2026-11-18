import type { StateRecordWrite } from '../authoritativeState.js';
import type {
  CapturedReviewSnapshot,
  ReviewBasisPayload,
  ReviewBatchIdentity,
  ReviewIdentity,
  ReviewIndexEntry,
  ReviewIndexPayload,
  ReviewMessageLocation,
  ReviewMessageRepositoryState,
  ReviewQuestionBatchPayload,
  ReviewQuestionPayload,
  ReviewResponseIdentity,
  ReviewSnapshotPayload,
} from '../reviewing/index.js';
import type { CurrentChangedFile } from '../workspaceEvidence/index.js';
import type {
  DefaultReviewMessageInspectionView,
  DefaultReviewQuestionAskInspectionView,
  DirectReviewCapabilityContract,
  DirectReviewHandoffInspectionView,
  ExactReviewHandoffDisclosure,
  HarnessAcknowledgementIdentity,
  HarnessAttachmentDestination,
  HarnessAttachmentEstablishment,
  HarnessAttachmentIdentity,
  HarnessAvailability,
  HarnessCapabilitySnapshotIdentity,
  HarnessCommitmentReceiptIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessHandoffIdentity,
  HarnessInteractionCommandAccepted,
  HarnessInteractionViewScope,
  HarnessInteractionViewUpdate,
  HarnessInterruptionIntentIdentity,
  HarnessInvocationIdentity,
  HarnessInvocationStatus,
  ReviewHandoffDisclosureSummary,
  UserPullArmOccurrenceIdentity,
  UserPullPreparationIdentity,
  UserPullPreparationStatus,
  UserPullPreparationTerminalReason,
  ReviewMessageAcknowledgementRequirementView,
  ReviewedCapabilityManifest,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from './contracts.js';

export interface HarnessAttachmentIndexEntry {
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly compatibilityIdentity: string;
  readonly establishmentEvidenceIdentity: string;
  readonly destination: HarnessAttachmentDestination;
  readonly availability: HarnessAvailability;
}

export interface HarnessHandoffIndexEntry {
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly commitmentReceiptIdentity: HarnessCommitmentReceiptIdentity;
  readonly capabilitySnapshotIdentity: HarnessCapabilitySnapshotIdentity;
  readonly invocationIdentity?: HarnessInvocationIdentity;
  readonly disclosure: ReviewHandoffDisclosureSummary;
}

export interface HarnessInvocationIndexEntry {
  readonly invocationIdentity: HarnessInvocationIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly status: HarnessInvocationStatus;
  readonly evidenceIdentities: readonly string[];
  readonly interruptionIntentIdentities: readonly HarnessInterruptionIntentIdentity[];
  readonly startObservationDeadline?: string;
  readonly terminalReason?: string;
  readonly responseIdentity?: ReviewResponseIdentity;
}

export interface UserPullPreparationIndexEntry {
  readonly preparationIdentity: UserPullPreparationIdentity;
  readonly handoffIdentity: HarnessHandoffIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewBatchIdentity: ReviewBatchIdentity;
  readonly attachmentIdentity: HarnessAttachmentIdentity;
  readonly status: UserPullPreparationStatus;
  readonly payloadSha256: string;
  readonly armedOccurrenceIdentities: readonly UserPullArmOccurrenceIdentity[];
  readonly disclosedDeadline?: string;
  readonly claimedOccurrenceIdentity?: UserPullArmOccurrenceIdentity;
  readonly invocationIdentity?: HarnessInvocationIdentity;
  readonly terminalReason?: UserPullPreparationTerminalReason;
}

/**
 * The live index: current Attachments and the Handoffs and Invocations still
 * in play. Format 4 moves every settled entry into its Review's history; older
 * formats parse with every entry live and convert on their next write.
 */
export interface HarnessIndexPayload {
  readonly formatVersion: 4;
  readonly attachments: readonly HarnessAttachmentIndexEntry[];
  readonly handoffs: readonly HarnessHandoffIndexEntry[];
  readonly invocations: readonly HarnessInvocationIndexEntry[];
  readonly preparations: readonly UserPullPreparationIndexEntry[];
}

/** One Review's settled Handoffs and their Invocations, in the order they settled. */
export interface HarnessReviewHistoryPayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly handoffs: readonly HarnessHandoffIndexEntry[];
  readonly invocations: readonly HarnessInvocationIndexEntry[];
}

export interface LoadedReviewHistory {
  readonly revision: number;
  readonly payload: HarnessReviewHistoryPayload;
}

export interface LoadedReviewIndex {
  readonly stateVersion: number;
  readonly revision: number;
  readonly payload: ReviewIndexPayload;
}

export interface LoadedHarnessIndex {
  readonly stateVersion: number;
  readonly revision: number;
  readonly payload: HarnessIndexPayload;
}

export interface AttachmentCompatibilityPayload {
  readonly formatVersion: 1;
  readonly normalizedAttachment: ReviewedHarnessAttachment;
  readonly manifest: ReviewedCapabilityManifest;
  readonly manifestSha256: string;
  readonly compatibilityIdentity: string;
  readonly result: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }>;
}

export interface HarnessCommandRecordPayload {
  readonly formatVersion: 1;
  readonly normalizedCommand: string;
  readonly result: HarnessInteractionCommandAccepted;
}

export interface ReviewMessageAcknowledgementPayload {
  readonly formatVersion: 1;
  readonly acknowledgementIdentity: HarnessAcknowledgementIdentity;
  readonly requirement: ReviewMessageAcknowledgementRequirementView;
  readonly acceptedByCommandIdentity: string;
  readonly acceptedStateVersion: number;
}

export interface HarnessEvidenceRecordPayload {
  readonly formatVersion: 1;
  readonly normalizedEvidence: string;
  readonly acknowledgement: Extract<HarnessEvidenceAcknowledgement, { readonly status: 'applied' }>;
}

export interface LiveAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly manifestSha256: string;
  readonly attachment: ReviewedHarnessAttachment;
  readonly compatibilityIdentity: string;
  readonly connection: ReviewedHarnessConnection;
}

export interface ReviewDisclosureBasis {
  readonly snapshot: ReviewSnapshotPayload;
  readonly batch: ReviewQuestionBatchPayload;
  readonly questions: readonly ReviewQuestionPayload[];
  readonly files: readonly CurrentChangedFile[];
  readonly disclosure: ExactReviewHandoffDisclosure;
}

export interface PreparedReviewMessageTarget {
  readonly location: ReviewMessageLocation;
  readonly originBasis: ReviewBasisPayload;
  readonly repositoryState: ReviewMessageRepositoryState;
  /** Whole selected source bytes; this, not unrelated repository churn, binds composition. */
  readonly sourceSha256: string;
  readonly capturedRepository: CapturedReviewSnapshot;
  /** Retained exact-source witness used by the targeted commit revalidation. */
  readonly liveSourceCaptureIdentity?: string;
  readonly historicalLine?: Uint8Array;
}

export interface PreparedReviewMessageInspection {
  readonly view: DefaultReviewMessageInspectionView;
  readonly reviewIndex?: LoadedReviewIndex;
  readonly entry?: ReviewIndexEntry;
  readonly target?: PreparedReviewMessageTarget;
  /** Exact template used for the previewed material, replayed at commit. */
  readonly outgoingTemplate?: string;
  readonly attachment?: HarnessAttachmentIndexEntry;
  readonly live?: LiveAdapter;
  readonly capability?: DirectReviewCapabilityContract;
  readonly manifestSha256?: string;
  readonly compatibilityIdentity?: string;
}

export interface PreparedAskInspection {
  readonly view: DefaultReviewQuestionAskInspectionView;
  readonly reviewIndex?: LoadedReviewIndex;
  readonly entry?: ReviewIndexEntry;
  readonly snapshot?: ReviewSnapshotPayload;
  readonly captured?: CapturedReviewSnapshot;
  readonly files?: readonly CurrentChangedFile[];
  readonly attachment?: HarnessAttachmentIndexEntry;
  readonly live?: LiveAdapter;
  readonly capability?: DirectReviewCapabilityContract;
  readonly manifestSha256?: string;
  readonly compatibilityIdentity?: string;
}

export interface PreparedReviewResponse {
  readonly responseIdentity: ReviewResponseIdentity;
  readonly records: readonly StateRecordWrite[];
  readonly reviewIndex: LoadedReviewIndex;
  readonly nextReviewIndex: ReviewIndexPayload;
}

export interface PreparedInspection {
  readonly view: DirectReviewHandoffInspectionView;
  readonly basis?: ReviewDisclosureBasis;
  readonly attachment?: HarnessAttachmentIndexEntry;
  readonly live?: LiveAdapter;
  readonly capability?: DirectReviewCapabilityContract;
  readonly manifestSha256?: string;
  readonly compatibilityIdentity?: string;
}

export interface Subscription {
  readonly scope: HarnessInteractionViewScope;
  readonly onUpdate: (update: HarnessInteractionViewUpdate) => void;
  active: boolean;
  scheduled: boolean;
  lastStateVersion: number;
  /** Connection views change without a new State version; the last one delivered. */
  lastDelivered?: string;
}

export class HarnessStateProblem extends Error {
  constructor() {
    super('harness-interaction-state-invalid');
    this.name = 'HarnessStateProblem';
  }
}

export class HarnessProjectionVersionChanged extends Error {
  constructor() {
    super('harness-interaction-version-changed');
    this.name = 'HarnessProjectionVersionChanged';
  }
}
