import type {
  LegacyReviewQueueValue,
  LegacyReviewReceiptsValue,
  LegacyReviewSourceKind,
  LegacyReviewSourceMetadata,
  LegacyReviewSourceRecognition,
  LegacyReviewSourceRequest,
} from '../legacyReviewSource.js';
import type { ReviewIdentity, ReviewQuestionDraftIdentity, ReviewSnapshotIdentity } from '../reviewing/index.js';
import type { WorkspaceIdentity } from '../baseTypes.js';
import type {
  LegacyReviewCandidateDecisionIdentity,
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewCommandAccepted,
  LegacyReviewMovedReceiptSearchUnavailableReason,
  LegacyReviewMovedSourceAssociationIdentity,
  LegacyReviewQueueCandidateDecision,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewQueueProjectionUnavailableReason,
  LegacyReviewQueueRecognitionSummary,
  LegacyReviewReceiptProjectionUnavailableReason,
  LegacyReviewReceiptRecognitionSummary,
  LegacyReviewRecognitionFailure,
  LegacyReviewSourceDecision,
  LegacyReviewSourceDecisionIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceLocation,
  LegacyReviewSourceOccurrenceIdentity,
} from './contracts.js';

export interface LegacyReviewSourceDescriptor {
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly location: LegacyReviewSourceLocation;
  readonly request: LegacyReviewSourceRequest;
}

export interface LegacyReviewMovedReceiptSourceDescriptor {
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: 'receipts';
  readonly location: 'moved-legacy-state';
  readonly request: LegacyReviewSourceRequest;
}

export interface LegacyReviewMovedReceiptLocator {
  readonly legacyCheckoutHash: string;
  readonly descriptor: LegacyReviewMovedReceiptSourceDescriptor;
}

export interface LegacyReviewMovedReceiptLocatorSearchAvailable {
  readonly status: 'available';
  readonly locators: readonly LegacyReviewMovedReceiptLocator[];
}

export interface LegacyReviewMovedReceiptLocatorSearchUnavailable {
  readonly status: 'unavailable';
  readonly reason: Exclude<LegacyReviewMovedReceiptSearchUnavailableReason, 'projection-limit'>;
}

export type LegacyReviewMovedReceiptLocatorSearch =
  | LegacyReviewMovedReceiptLocatorSearchAvailable
  | LegacyReviewMovedReceiptLocatorSearchUnavailable;

export interface LegacyReviewImportIndexEntry {
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly digest: string;
  readonly decision: 'imported';
}

export interface LegacyReviewSourceDecisionIndexEntry {
  readonly sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly digest: string;
  readonly decision: LegacyReviewSourceDecision;
}

export interface LegacyReviewCandidateDecisionIndexEntry {
  readonly candidateDecisionIdentity: LegacyReviewCandidateDecisionIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly decision: LegacyReviewQueueCandidateDecision;
}

export interface LegacyReviewMovedSourceAssociationIndexEntry {
  readonly associationIdentity: LegacyReviewMovedSourceAssociationIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly digest: string;
  readonly legacyCheckoutHash: string;
}

export interface LegacyReviewCandidatePromotionIndexEntry {
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly digest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly intent: 'question';
}

export interface LegacyReviewImportIndexPayload {
  readonly formatVersion: 1;
  readonly occurrences: readonly LegacyReviewImportIndexEntry[];
  readonly decisions: readonly LegacyReviewSourceDecisionIndexEntry[];
  readonly candidateDecisions?: readonly LegacyReviewCandidateDecisionIndexEntry[];
  readonly movedSourceAssociations?: readonly LegacyReviewMovedSourceAssociationIndexEntry[];
  readonly candidatePromotions?: readonly LegacyReviewCandidatePromotionIndexEntry[];
}

export interface LoadedLegacyReviewImportIndex {
  readonly stateVersion: number;
  readonly revision: number;
  readonly payload: LegacyReviewImportIndexPayload;
}

export interface LoadedLegacyImportedSource {
  readonly status: 'available';
  readonly stateVersion: number;
  readonly indexRevision: number;
  readonly index: LegacyReviewImportIndexPayload;
  readonly entry: LegacyReviewImportIndexEntry;
  readonly occurrence: LegacyReviewSourceOccurrencePayload;
  readonly recognition: LegacyReviewSourceRecognition;
}

export interface UnavailableLegacyImportedSource {
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reason: 'source-not-imported' | 'content-unavailable';
}

export type LegacyImportedSourceLoad = LoadedLegacyImportedSource | UnavailableLegacyImportedSource;

export interface LoadedLegacyReceiptHistory {
  readonly status: 'available';
  readonly stateVersion: number;
  readonly entry: LegacyReviewImportIndexEntry;
  readonly receipts: LegacyReviewReceiptsValue;
}

export interface UnavailableLegacyReceiptHistory {
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reason: LegacyReviewReceiptProjectionUnavailableReason;
}

export type LegacyReceiptHistoryLoad = LoadedLegacyReceiptHistory | UnavailableLegacyReceiptHistory;

export interface LoadedLegacyQueueCandidates {
  readonly status: 'available';
  readonly stateVersion: number;
  readonly indexRevision: number;
  readonly index: LegacyReviewImportIndexPayload;
  readonly entry: LegacyReviewImportIndexEntry;
  readonly format: 'queue-array-v1' | 'queue-v1' | 'queue-v2';
  readonly queue: LegacyReviewQueueValue;
  readonly decisions: readonly LegacyReviewCandidateDecisionIndexEntry[];
  readonly promotions: readonly LegacyReviewCandidatePromotionIndexEntry[];
}

export interface UnavailableLegacyQueueCandidates {
  readonly status: 'unavailable';
  readonly stateVersion: number;
  readonly reason: LegacyReviewQueueProjectionUnavailableReason;
}

export type LegacyQueueCandidatesLoad = LoadedLegacyQueueCandidates | UnavailableLegacyQueueCandidates;

export interface LegacyReviewSourceOccurrencePayload {
  readonly formatVersion: 1;
  readonly parserVersion: 1;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly location: LegacyReviewSourceLocation;
  readonly sourcePath: string;
  readonly digest: string;
  readonly byteLength: number;
  readonly metadata: LegacyReviewSourceMetadata;
  readonly recognition:
    | LegacyReviewQueueRecognitionSummary
    | LegacyReviewReceiptRecognitionSummary
    | LegacyReviewRecognitionFailure;
  readonly decision: 'imported';
  readonly importCommandIdentity: string;
  readonly importedStateVersion: number;
}

export interface LegacyReviewSourceDecisionPayload {
  readonly formatVersion: 1;
  readonly parserVersion: 1;
  readonly sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly sourceKind: LegacyReviewSourceKind;
  readonly location: LegacyReviewSourceLocation;
  readonly sourcePath: string;
  readonly digest: string;
  readonly byteLength: number;
  readonly metadata: LegacyReviewSourceMetadata;
  readonly recognition:
    | LegacyReviewQueueRecognitionSummary
    | LegacyReviewReceiptRecognitionSummary
    | LegacyReviewRecognitionFailure;
  readonly decision: LegacyReviewSourceDecision;
  readonly decisionCommandIdentity: string;
  readonly decidedStateVersion: number;
}

export interface LegacyReviewMovedSourceAssociationPayload {
  readonly formatVersion: 1;
  readonly associationIdentity: LegacyReviewMovedSourceAssociationIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly legacyCheckoutHash: string;
  readonly associationCommandIdentity: string;
  readonly associatedStateVersion: number;
}

export interface LegacyReviewCandidateDecisionPayload {
  readonly formatVersion: 1;
  readonly candidateDecisionIdentity: LegacyReviewCandidateDecisionIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly decision: LegacyReviewQueueCandidateDecision;
  readonly decisionCommandIdentity: string;
  readonly decidedStateVersion: number;
}

export interface LegacyReviewCandidatePromotionPayload {
  readonly formatVersion: 1;
  readonly promotionIdentity: LegacyReviewCandidatePromotionIdentity;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly sourceIdentity: LegacyReviewSourceIdentity;
  readonly sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity;
  readonly digest: string;
  readonly candidateIdentity: LegacyReviewQueueCandidateIdentity;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly draftIdentity: ReviewQuestionDraftIdentity;
  readonly intent: 'question';
  readonly promotionCommandIdentity: string;
  readonly promotedStateVersion: number;
}

export interface LegacyReviewCommandRecordPayload {
  readonly formatVersion: 1;
  readonly normalizedCommand: string;
  readonly result: LegacyReviewCommandAccepted;
}

export class LegacyReviewImportStateProblem extends Error {
  constructor() {
    super('legacy-review-import-state-invalid');
    this.name = 'LegacyReviewImportStateProblem';
  }
}
