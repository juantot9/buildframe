import { encodeBytesBase64 } from '../bytesBase64.js';
import type { AuthoritativeState, StateCommitResult, StateRecord, StateRecordWrite } from '../authoritativeState.js';
import { type ContextItemVerdict } from '../contextEvidence.js';
import type { LegacyReviewImportOwner } from '../legacyReviewImport/index.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import { WorkspaceEvidence, reviewComparisonUsesExactResolution } from '../workspaceEvidence/index.js';
import type { WorkspaceIdentity } from '../workspace.js';

import {
  occurrenceIdentity,
  reviewContextContributionIdentity,
  reviewContextSelectionIdentity,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewLiveChangesIdentity,
  reviewSnapshotBasisIdentity,
  reviewingRecordIdentity,
  stableRecordIdentity,
  type ReviewBatchIdentity,
  type ReviewContextContributionIdentity,
  type ReviewContextRuleIdentity,
  type ReviewDispositionIdentity,
  type ReviewIdentity,
  type ReviewQuestionDraftIdentity,
  type ReviewQuestionIdentity,
  type ReviewResultIdentity,
  type ReviewSnapshotIdentity,
} from './identities.js';
import type {
  AddReviewContextContributionCommand,
  CancelReviewCommand,
  CaptureReviewGitCommitBasisCommand,
  ChangeReviewContextSelectionCommand,
  CommitReviewQuestionBatchCommand,
  CompleteReviewCommand,
  ContinueReviewComparisonWithLiveChangesCommand,
  CreateReviewQuestionDraftCommand,
  CurrentChangesReviewStarted,
  ForkReviewBasisCommand,
  LegacyQuestionCandidatePromoted,
  PromoteLegacyQuestionCandidateCommand,
  RecordReviewChangeObservationCommand,
  RefreshReviewChangeSetCommand,
  RefreshReviewContextCommand,
  ReviewAnchorInput,
  ReviewArtifactContextContributionInput,
  ReviewBasisCommit,
  ReviewBasisForked,
  ReviewCancelled,
  ReviewChangeObservationRecorded,
  ReviewChangeSetRefreshed,
  ReviewComparisonContinuedWithLiveChanges,
  ReviewComparisonStarted,
  ReviewCompleted,
  ReviewContextContributionAdded,
  ReviewContextRefreshDelta,
  ReviewContextRefreshed,
  ReviewContextRule,
  ReviewContextSelectionChanged,
  ReviewEditorContextContributionInput,
  ReviewGitCommitBasisCaptured,
  ReviewQuestionAnchor,
  ReviewQuestionBatchCommitted,
  ReviewQuestionDispositionRecorded,
  ReviewQuestionDraftCreated,
  ReviewQuestionDraftRevised,
  ReviewingCommand,
  ReviewingCommandAccepted,
  ReviewingCommandRejected,
  ReviewingCommandRejectionReason,
  ReviewingCommandResult,
  ReviseReviewQuestionDraftCommand,
  SetReviewQuestionDispositionCommand,
  StartCurrentChangesReviewCommand,
  StartReviewComparisonCommand,
} from './contracts.js';
import {
  ReviewingStateProblem,
  type CapturedReviewSnapshot,
  type LoadedReviewContextSelection,
  type LoadedReviewIndex,
  type PreparedReviewArtifactContribution,
  type PreparedReviewContextContribution,
  type ReviewArtifactContextProvenance,
  type ReviewBasisPayload,
  type ReviewContextContributionContent,
  type ReviewContextContributionSensitivity,
  type ReviewContextSelectionPayload,
  type ReviewDispositionPayload,
  type ReviewIndexEntry,
  type ReviewIndexPayload,
  type ReviewMessageRepositoryState,
  type ReviewQuestionDraftLegacyCandidateProvenance,
  type ReviewQuestionDraftPayload,
  type ReviewSnapshotPayload,
  type ReviewingCommandRecordPayload,
} from './internalTypes.js';
import { requiredWholeFileAnchorContent, reviewSnapshotContextMatches } from './diff.js';
import {
  contentEqual,
  decodeReviewingBytesBase64,
  decodeReviewingPayload,
  encode,
  nthLine,
  reviewMessageRepositoryStateMatches,
} from './utils.js';
import {
  ANCHOR_LINE_MAX_BYTES,
  MAX_BATCHES,
  MAX_DRAFTS,
  MAX_REVIEWS,
  MAX_REVIEW_BASES,
  MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES,
  MAX_REVIEW_CONTEXT_RULES,
  MAX_REVIEW_SNAPSHOTS,
  REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
} from './limits.js';
import { applyReviewContextRule, questionBody } from './context.js';
import { normalizeCommand, normalizedCommand } from './normalization.js';
import {
  emptyReviewContextSelection,
  parseReviewContextSelection,
  parseReviewIndex,
  parseReviewingCommandAccepted,
  reviewEditorContextSensitivity,
} from './parsingCommands.js';
import {
  immutableRecord,
  parseReviewDiffWindow,
  parseReviewDisposition,
  parseReviewManifestWindow,
  parseReviewMessage,
  parseReviewMessageResponse,
  parseReviewQuestionDraft,
  parseReviewResponse,
  parseReviewSnapshot,
  parseReviewSnapshotFile,
  parseReviewingCommandRecord,
} from './parsingReview.js';
import {
  activeReview,
  legacyPromotionRejectionReason,
  rejected,
  replaceCurrentReview,
  replaceReview,
  revisionedRecord,
} from './records.js';
import { ReviewSnapshotTransition } from './transition.js';

export {
  reviewContextSelectionIdentity,
  reviewGitCommitBasisIdentity,
  reviewLiveBasisIdentity,
  reviewLiveChangesIdentity,
  reviewMessageIdentity,
  reviewMessageMaterialIdentity,
  reviewSnapshotBasisIdentity,
  reviewSnapshotContextIdentity,
  reviewSnapshotContextManifestWindowIdentity,
  reviewingRecordIdentity,
} from './identities.js';
export type {
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
export type {
  AddReviewContextContributionCommand,
  CancelReviewCommand,
  CaptureReviewGitCommitBasisCommand,
  ChangeReviewContextSelectionCommand,
  CommitReviewQuestionBatchCommand,
  CompleteReviewCommand,
  ContinueReviewComparisonWithLiveChangesCommand,
  CreateReviewQuestionDraftCommand,
  CurrentChangesReviewStarted,
  ForkReviewBasisCommand,
  LegacyQuestionCandidatePromoted,
  PromoteLegacyQuestionCandidateCommand,
  RecordReviewChangeObservationCommand,
  RefreshReviewChangeSetCommand,
  RefreshReviewContextCommand,
  ReviewAnchorInput,
  ReviewAnchorRejectionReason,
  ReviewArtifactContextContributionInput,
  ReviewArtifactContextReference,
  ReviewBasisCommit,
  ReviewBasisForked,
  ReviewCancelled,
  ReviewChangeObservationRecorded,
  ReviewChangeSetRefreshed,
  ReviewComparisonContinuedWithLiveChanges,
  ReviewComparisonStarted,
  ReviewCompleted,
  ReviewContextContributionAdded,
  ReviewContextContributionInput,
  ReviewContextContributionScope,
  ReviewContextExclusionTarget,
  ReviewContextRefreshDelta,
  ReviewContextRefreshed,
  ReviewContextRule,
  ReviewContextRuleDecision,
  ReviewContextSelectionChange,
  ReviewContextSelectionChanged,
  ReviewContextSource,
  ReviewDiffLineAnchorInput,
  ReviewEditorBufferProvenance,
  ReviewEditorContextContentInput,
  ReviewEditorContextContributionInput,
  ReviewEditorContextSource,
  ReviewGitCommitBasisCaptured,
  ReviewQuestionAnchor,
  ReviewQuestionBatchCommitted,
  ReviewQuestionDisposition,
  ReviewQuestionDispositionRecorded,
  ReviewQuestionDraftCreated,
  ReviewQuestionDraftRevised,
  ReviewQuestionLineAnchor,
  ReviewQuestionWholeFileAnchor,
  ReviewWholeFileAnchorInput,
  ReviewingCommand,
  ReviewingCommandAccepted,
  ReviewingCommandRejected,
  ReviewingCommandRejectionReason,
  ReviewingCommandResult,
  ReviseReviewQuestionDraftCommand,
  SetReviewQuestionDispositionCommand,
  StartCurrentChangesReviewCommand,
  StartReviewComparisonCommand,
} from './contracts.js';
export type {
  CapturedReviewContext,
  CapturedReviewContextItem,
  CapturedReviewSnapshot,
  CapturedSnapshotFile,
  ReviewArtifactContextProvenance,
  ReviewBasisPayload,
  ReviewBasisTreeIndex,
  ReviewContextContributionContent,
  ReviewContextContributionPayload,
  ReviewContextContributionSensitivity,
  ReviewContextContributionUnavailableReason,
  ReviewContextSelectionPayload,
  ReviewContextSensitivityReason,
  ReviewContextVerification,
  ReviewCurrentDispositionIndexEntry,
  ReviewDiffRowContentReference,
  ReviewDiffRowPayload,
  ReviewDiffWindowPayload,
  ReviewDispositionPayload,
  ReviewIndexEntry,
  ReviewIndexPayload,
  ReviewManifestWindowPayload,
  ReviewMessageBatchPayload,
  ReviewMessageHistoryIndex,
  ReviewMessageLocation,
  ReviewMessageOutgoingMaterialPayload,
  ReviewMessagePayload,
  ReviewMessageRepositoryState,
  ReviewMessageResponsePayload,
  ReviewProjectedDiffUnavailableReason,
  ReviewQuestionBatchPayload,
  ReviewQuestionDraftLegacyCandidateProvenance,
  ReviewQuestionDraftPayload,
  ReviewQuestionPayload,
  ReviewResponsePayload,
  ReviewSnapshotCaptureRequest,
  ReviewSnapshotContextContentPayload,
  ReviewSnapshotContextContentReference,
  ReviewSnapshotContextItem,
  ReviewSnapshotContextManifestWindowPayload,
  ReviewSnapshotContextPayload,
  ReviewSnapshotContextScope,
  ReviewSnapshotContextSourceGroup,
  ReviewSnapshotDiffIndex,
  ReviewSnapshotFilePayload,
  ReviewSnapshotPayload,
  ReviewingCommandRecordPayload,
} from './internalTypes.js';
export { exactWholeFileAnchorContent, reviewSnapshotContextMatches, sameDiffLine } from './diff.js';
export type {
  PrepareReviewSnapshotRequest,
  PreparedReviewSnapshot,
  ProjectedReviewCapture,
  ProjectedReviewCaptureFile,
} from './diff.js';
export { decodeReviewingPayload } from './utils.js';
export {
  MAX_REVIEW_BASES,
  MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES,
  MAX_REVIEW_CONTEXT_RULES,
  MAX_REVIEW_MESSAGES,
  MAX_REVIEW_SNAPSHOTS,
  REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES,
  REVIEW_DIFF_WINDOW_ROWS,
  REVIEW_MANIFEST_WINDOW_FILES,
  REVIEW_SNAPSHOT_CONTEXT_CONTENT_WINDOW_BYTES,
  REVIEW_SNAPSHOT_CONTEXT_MANIFEST_WINDOW_ITEMS,
} from './limits.js';
export { decideReviewContextCandidate, reviewContextEvidenceSelection } from './context.js';
export {
  emptyReviewContextSelection,
  parseReviewContextContribution,
  parseReviewContextSelection,
  parseReviewIndex,
  parseReviewIndexEntry,
} from './parsingCommands.js';
export {
  parseReviewBasis,
  parseReviewDiffWindow,
  parseReviewDisposition,
  parseReviewManifestWindow,
  parseReviewMessage,
  parseReviewMessageBatch,
  parseReviewMessageOutgoingMaterial,
  parseReviewMessageResponse,
  parseReviewQuestion,
  parseReviewQuestionBatch,
  parseReviewQuestionDraft,
  parseReviewResponse,
  parseReviewSnapshot,
  parseReviewSnapshotContextContent,
  parseReviewSnapshotContextManifestWindow,
  parseReviewSnapshotFile,
  parseReviewingCommandRecord,
} from './parsingReview.js';
export { ReviewSnapshotTransition, capturedSnapshotMatches } from './transition.js';
export { messageCodeStateRecords, readMessageCodeState } from './messageCodeState.js';
export { buildReviewDiff } from './diff.js';

export interface ReviewingOwnerOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly state: AuthoritativeState;
  readonly evidence: WorkspaceEvidence;
  /** Package-private collaboration for one exact migration transition. */
  readonly legacyReviewImport: LegacyReviewImportOwner;
  /** Private deterministic clock seam for durable Review chronology. */
  readonly now?: () => Date;
  /**
   * A committed start's working-tree capture. Live reads verify it instead
   * of capturing the same working tree again.
   */
  readonly onCurrentChangesCaptured?: (reviewIdentity: ReviewIdentity, captured: CapturedReviewSnapshot) => void;
}

/** Private Reviewing owner. Callers reach it only through Workspace.execute. */
export class ReviewingOwner {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #canonicalCheckout: string;
  readonly #onCurrentChangesCaptured:
    | ((reviewIdentity: ReviewIdentity, captured: CapturedReviewSnapshot) => void)
    | undefined;
  readonly #state: AuthoritativeState;
  readonly #evidence: WorkspaceEvidence;
  readonly #legacyReviewImport: LegacyReviewImportOwner;
  readonly #snapshots: ReviewSnapshotTransition;
  readonly #now: () => Date;
  readonly #indexIdentity: string;
  readonly #authorityIdentity: string;

  constructor(options: ReviewingOwnerOptions) {
    this.#workspaceIdentity = options.workspaceIdentity;
    this.#canonicalCheckout = options.canonicalCheckout;
    this.#state = options.state;
    this.#evidence = options.evidence;
    this.#legacyReviewImport = options.legacyReviewImport;
    this.#snapshots = new ReviewSnapshotTransition({ evidence: options.evidence, state: options.state });
    this.#now = options.now ?? (() => new Date());
    this.#onCurrentChangesCaptured = options.onCurrentChangesCaptured;
    this.#indexIdentity = stableRecordIdentity('rvi', options.workspaceIdentity);
    this.#authorityIdentity = this.#indexIdentity;
  }

  async execute(value: unknown): Promise<ReviewingCommandResult> {
    const command = normalizeCommand(value);
    const normalized = normalizedCommand(command);
    const recalled = await this.#recall(command, normalized);
    if (recalled !== undefined) return recalled;

    const index = await this.#loadIndex();
    if (command.expectedStateVersion !== index.stateVersion) {
      return rejected(command, index.stateVersion, 'state-version-mismatch');
    }

    switch (command.kind) {
      case 'review.current-changes.start':
      case 'review.comparison.start':
      case 'review.comparison.continue-live':
        return await this.#start(command, normalized, index);
      case 'review.change-set.refresh':
        return await this.#refreshChangeSet(command, normalized, index);
      case 'review.context.refresh':
        return await this.#refreshContext(command, normalized, index);
      case 'review.basis.git-commit.capture':
        return await this.#captureGitCommitBasis(command, normalized, index);
      case 'review.basis.fork':
        return await this.#forkBasis(command, normalized, index);
      case 'review.change-observation.record':
        return await this.#recordChangeObservation(command, normalized, index);
      case 'review.context-selection.change':
        return await this.#changeContextSelection(command, normalized, index);
      case 'review.context-contribution.add':
        return await this.#addContextContribution(command, normalized, index);
      case 'review.question-draft.create':
        return await this.#createDraft(command, normalized, index);
      case 'review.legacy-question-candidate.promote':
        return await this.#promoteLegacyQuestionCandidate(command, normalized, index);
      case 'review.question-draft.revise':
        return await this.#reviseDraft(command, normalized, index);
      case 'review.question-batch.commit':
        return await this.#commitBatch(command, normalized, index);
      case 'review.question.disposition.set':
        return await this.#setDisposition(command, normalized, index);
      case 'review.complete':
        return await this.#complete(command, normalized, index);
      case 'review.cancel':
        return await this.#cancel(command, normalized, index);
    }
  }

  async #loadIndex(): Promise<LoadedReviewIndex> {
    const read = await this.#state.read({
      recordIdentities: [this.#indexIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const record = read.records[0];
    if (record === undefined) {
      return {
        stateVersion: read.stateVersion,
        revision: 0,
        payload: { formatVersion: 1, reviews: [] },
      };
    }
    if (record.kind !== 'review.index' || record.recordClass !== 'revisioned' || record.schemaVersion !== 1) {
      throw new ReviewingStateProblem();
    }
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload: parseReviewIndex(decodeReviewingPayload(record.payload)),
    };
  }

  async #loadContextSelection(
    reviewIdentity: ReviewIdentity,
    expectedStateVersion: number,
  ): Promise<LoadedReviewContextSelection> {
    const identity = reviewContextSelectionIdentity(reviewIdentity);
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: false,
    });
    if (read.stateVersion !== expectedStateVersion) {
      return {
        stateVersion: read.stateVersion,
        revision: 0,
        payload: emptyReviewContextSelection(reviewIdentity),
      };
    }
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const record = read.records[0];
    if (record === undefined) {
      return {
        stateVersion: read.stateVersion,
        revision: 0,
        payload: emptyReviewContextSelection(reviewIdentity),
      };
    }
    if (
      record.kind !== 'review.context-selection' ||
      record.recordClass !== 'revisioned' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== identity ||
      record.workflowIdentity !== reviewIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    const payload = parseReviewContextSelection(decodeReviewingPayload(record.payload));
    if (payload.reviewIdentity !== reviewIdentity || payload.selectionIdentity !== identity) {
      throw new ReviewingStateProblem();
    }
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload,
    };
  }

  async #recall(
    command: ReviewingCommand,
    normalized: string,
  ): Promise<ReviewingCommandAccepted | ReviewingCommandRejected | undefined> {
    const identity = stableRecordIdentity('rcm', command.commandIdentity);
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.kind !== 'review.command' || record.recordClass !== 'immutable' || record.schemaVersion !== 1) {
      throw new ReviewingStateProblem();
    }
    const payload = parseReviewingCommandRecord(decodeReviewingPayload(record.payload));
    if (payload.result.commandIdentity !== command.commandIdentity) {
      throw new ReviewingStateProblem();
    }
    if (payload.normalizedCommand !== normalized) {
      return rejected(command, read.stateVersion, 'command-identity-conflict');
    }
    if (payload.result.kind === 'review.legacy-question-candidate.promoted') {
      await this.#validateRecalledLegacyQuestionPromotion(payload.result);
    }
    return deepFreeze(payload.result);
  }

  async #validateRecalledLegacyQuestionPromotion(result: LegacyQuestionCandidatePromoted): Promise<void> {
    const validated = await this.#legacyReviewImport.validateQuestionCandidatePromotion({
      commandIdentity: result.commandIdentity,
      promotedStateVersion: result.stateVersion,
      sourceOccurrenceIdentity: result.sourceOccurrenceIdentity,
      candidateIdentity: result.candidateIdentity,
      sourceIdentity: result.sourceIdentity,
      digest: result.sourceDigest,
      promotionIdentity: result.promotionIdentity,
      reviewIdentity: result.reviewIdentity,
      reviewSnapshotIdentity: result.reviewSnapshotIdentity,
      draftIdentity: result.draftIdentity,
    });
    if (!questionBody(validated.body)) throw new ReviewingStateProblem();
    const index = await this.#loadIndex();
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === result.reviewIdentity);
    if (entry === undefined || !entry.draftIdentities.includes(result.draftIdentity)) {
      throw new ReviewingStateProblem();
    }
    const [record] = await this.#readRecords([result.draftIdentity], false);
    if (
      record === undefined ||
      record.kind !== 'review.question-draft' ||
      record.recordClass !== 'revisioned' ||
      record.revision < result.draftRevision
    ) {
      throw new ReviewingStateProblem();
    }
    const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
    const provenance = draft.provenance;
    if (
      draft.reviewIdentity !== result.reviewIdentity ||
      draft.reviewSnapshotIdentity !== result.reviewSnapshotIdentity ||
      provenance === undefined ||
      provenance.sourceIdentity !== result.sourceIdentity ||
      provenance.sourceOccurrenceIdentity !== result.sourceOccurrenceIdentity ||
      provenance.sourceDigest !== result.sourceDigest ||
      provenance.candidateIdentity !== result.candidateIdentity ||
      provenance.promotionIdentity !== result.promotionIdentity ||
      validated.promotion.promotionIdentity !== result.promotionIdentity ||
      validated.promotion.reviewIdentity !== result.reviewIdentity ||
      validated.promotion.reviewSnapshotIdentity !== result.reviewSnapshotIdentity ||
      validated.promotion.draftIdentity !== result.draftIdentity ||
      (record.revision === result.draftRevision &&
        (draft.body !== validated.body || !contentEqual(draft.anchor, result.anchor)))
    ) {
      throw new ReviewingStateProblem();
    }
  }

  async #readRecords(identities: readonly string[], includeContent: boolean): Promise<readonly StateRecord[]> {
    if (identities.length === 0) return [];
    const read = await this.#state.read({
      recordIdentities: identities,
      includeContent,
    });
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    return read.records.map(record => {
      if (record === undefined) throw new ReviewingStateProblem();
      return record;
    });
  }

  async #readSnapshot(entry: ReviewIndexEntry): Promise<ReviewSnapshotPayload> {
    const [record] = await this.#readRecords([entry.reviewSnapshotIdentity], false);
    if (record === undefined || record.kind !== 'review.snapshot' || record.recordClass !== 'immutable') {
      throw new ReviewingStateProblem();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(record.payload));
    if (
      snapshot.reviewIdentity !== entry.reviewIdentity ||
      snapshot.reviewPassIdentity !== entry.reviewPassIdentity ||
      snapshot.changeSetIdentity !== entry.changeSetIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    return snapshot;
  }

  async #verifySnapshot(snapshot: ReviewSnapshotPayload): Promise<'current' | 'stale' | 'unverified'> {
    const comparison = await this.#verifyComparisonOnly(snapshot);
    if (comparison === 'unverified') return 'unverified';
    const context = (await this.#snapshots.verifyPersistedContext(snapshot)).verdict;
    if (comparison === 'stale' || context === 'stale') return 'stale';
    return context;
  }

  /**
   * A command-level Snapshot rejection is subordinate to the serialization
   * check. When verification reports a moving workspace, a concurrent command
   * may already have committed: the State version has moved, so the command is
   * stale regardless of the Snapshot verdict. Report the truer
   * `state-version-mismatch` instead of the snapshot symptom.
   */
  async #snapshotRejection(
    command: ReviewingCommand,
    index: LoadedReviewIndex,
    reason: ReviewingCommandRejectionReason,
    reviewSnapshotIdentities: readonly ReviewSnapshotIdentity[],
  ): Promise<ReviewingCommandResult> {
    const status = await this.#state.status();
    if (status.stateVersion !== undefined && status.stateVersion !== command.expectedStateVersion) {
      return rejected(command, status.stateVersion, 'state-version-mismatch');
    }
    return rejected(command, index.stateVersion, reason, reviewSnapshotIdentities);
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
    return contentEqual(capture.basis, snapshot.basis) &&
      contentEqual(capture.comparedState, snapshot.comparedState) &&
      contentEqual(capture.manifest, snapshot.manifest)
      ? 'current'
      : 'stale';
  }

  async #resolveAnchor(
    entry: ReviewIndexEntry,
    input: ReviewAnchorInput,
  ): Promise<ReviewQuestionAnchor | ReviewingCommandRejectionReason> {
    const identity = stableRecordIdentity('rsf', entry.reviewSnapshotIdentity, input.fileIdentity);
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: true,
    });
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const record = read.records[0];
    if (record === undefined) return 'anchor-file-not-found';
    if (record.kind !== 'review.snapshot-file' || record.recordClass !== 'immutable') {
      throw new ReviewingStateProblem();
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
    const content = record.content.find(candidate => candidate.role === input.side);
    if (input.fileAbsolute !== undefined) {
      const window = Math.floor(input.fileAbsolute / REVIEW_MANIFEST_WINDOW_FILES);
      const manifestRead = await this.#state.read({
        recordIdentities: [stableRecordIdentity('rmw', entry.reviewSnapshotIdentity, String(window))],
        includeContent: false,
      });
      if (manifestRead.quarantineReports.length > 0) {
        throw new ReviewingStateProblem();
      }
      const manifestRecord = manifestRead.records[0];
      if (manifestRecord?.kind !== 'review.snapshot-manifest-window' || manifestRecord.recordClass !== 'immutable') {
        throw new ReviewingStateProblem();
      }
      const manifest = parseReviewManifestWindow(decodeReviewingPayload(manifestRecord.payload));
      const expectedOffset = window * REVIEW_MANIFEST_WINDOW_FILES;
      if (
        manifest.reviewIdentity !== entry.reviewIdentity ||
        manifest.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        manifest.offset !== expectedOffset ||
        manifest.files[input.fileAbsolute - expectedOffset]?.fileIdentity !== input.fileIdentity
      ) {
        return 'anchor-file-not-found';
      }
    }
    if (input.kind === 'review.whole-file') {
      return deepFreeze({
        kind: 'review.whole-file',
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        fileIdentity: input.fileIdentity,
        side: input.side,
        scope: 'file',
        ...(input.fileAbsolute === undefined ? {} : { fileAbsolute: input.fileAbsolute }),
        content: requiredWholeFileAnchorContent(side, content?.bytes),
      });
    }
    if (side.contentAvailability !== 'captured' || side.contentIdentity === undefined) {
      return 'anchor-content-unavailable';
    }
    if (content?.bytes === undefined || content.digest !== side.contentIdentity.value) {
      throw new ReviewingStateProblem();
    }
    const line = nthLine(content.bytes, input.line);
    if (line === undefined) return 'anchor-line-not-found';
    if (line.bytes.byteLength > ANCHOR_LINE_MAX_BYTES) {
      return 'anchor-line-too-large';
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
      const diffRead = await this.#state.read({
        recordIdentities: [
          stableRecordIdentity('rdw', entry.reviewSnapshotIdentity, input.fileIdentity, String(window)),
        ],
        includeContent: false,
      });
      if (diffRead.quarantineReports.length > 0) {
        throw new ReviewingStateProblem();
      }
      const diffRecord = diffRead.records[0];
      if (diffRecord?.kind !== 'review.snapshot-diff-window' || diffRecord.recordClass !== 'immutable') {
        throw new ReviewingStateProblem();
      }
      const diffWindow = parseReviewDiffWindow(decodeReviewingPayload(diffRecord.payload));
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
        rowIdentity: row.rowIdentity,
        rowAbsolute: input.rowAbsolute,
      };
    }
    return deepFreeze({
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

  #indexWrite(index: LoadedReviewIndex, payload: ReviewIndexPayload): StateRecordWrite {
    return revisionedRecord(this.#indexIdentity, this.#authorityIdentity, 'review.index', index.revision, payload);
  }

  async #commit(
    command: ReviewingCommand,
    normalized: string,
    accepted: ReviewingCommandAccepted,
    records: readonly StateRecordWrite[],
  ): Promise<ReviewingCommandResult> {
    const commandRecord: ReviewingCommandRecordPayload = {
      formatVersion: 1,
      normalizedCommand: normalized,
      result: accepted,
    };
    const resultBytes = encode(accepted);
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        ...records,
        immutableRecord(
          stableRecordIdentity('rcm', command.commandIdentity),
          accepted.reviewIdentity,
          'review.command',
          commandRecord,
        ),
      ],
      result: {
        kind: 'reviewing.command-result',
        schemaVersion: 1,
        payload: resultBytes,
      },
    });
    if ('result' in committed) {
      return await this.#decodeCommittedResult(committed, command);
    }
    if (committed.reason === 'state-version-mismatch') {
      return rejected(command, committed.stateVersion, 'state-version-mismatch');
    }
    if (committed.reason === 'command-identity-conflict') {
      const recalled = await this.#recall(command, normalized);
      return recalled ?? rejected(command, committed.stateVersion, 'command-identity-conflict');
    }
    return rejected(command, committed.stateVersion, 'state-conflict');
  }

  async #decodeCommittedResult(
    committed: Extract<StateCommitResult, { readonly status: 'committed' | 'duplicate' }>,
    command: ReviewingCommand,
  ): Promise<ReviewingCommandAccepted> {
    if (committed.result.kind !== 'reviewing.command-result' || committed.result.schemaVersion !== 1) {
      throw new ReviewingStateProblem();
    }
    const value = parseReviewingCommandAccepted(decodeReviewingPayload(committed.result.payload));
    if (value.commandIdentity !== command.commandIdentity || value.stateVersion !== committed.stateVersion) {
      throw new ReviewingStateProblem();
    }
    if (value.kind === 'review.legacy-question-candidate.promoted') {
      await this.#validateRecalledLegacyQuestionPromotion(value);
    }
    return deepFreeze(value);
  }

  #prepareEditorContextContribution(
    reviewIdentity: ReviewIdentity,
    contributionIdentity: ReviewContextContributionIdentity,
    input: ReviewEditorContextContributionInput,
  ): PreparedReviewContextContribution {
    const content: ReviewContextContributionContent =
      input.content.status === 'available'
        ? {
            status: 'available',
            byteLength: input.content.byteLength,
            sha256: input.content.sha256,
          }
        : {
            status: 'unavailable',
            reason: input.content.reason,
            ...(input.content.observedByteLength === undefined
              ? {}
              : { observedByteLength: input.content.observedByteLength }),
          };
    return {
      payload: {
        formatVersion: 1,
        reviewIdentity,
        contributionIdentity,
        kind: 'editor',
        source: input.source,
        scope: input.scope,
        editor: {
          ...input.editor,
          attestation: 'unattested-editor-command',
        },
        content,
        sensitivity: reviewEditorContextSensitivity(input.source, input.editor),
        ...(input.classification === undefined ? {} : { classification: input.classification }),
      },
      ...(input.content.status === 'available' ? { bytes: decodeReviewingBytesBase64(input.content.bytesBase64) } : {}),
    };
  }

  async #readArtifactContent(
    record: StateRecord,
    role: 'old' | 'new',
    sourceByteLength: number,
    sourceSha256: string,
    offset: number,
    length: number,
    expectedStateVersion: number,
  ): Promise<
    | { readonly status: 'ready'; readonly bytes: Buffer }
    | { readonly status: 'state-version-mismatch'; readonly stateVersion: number }
  > {
    const reference = record.content.find(content => content.role === role);
    if (reference === undefined || reference.digest !== sourceSha256) throw new ReviewingStateProblem();
    if (length === 0) {
      if (sourceByteLength !== 0 || sourceSha256 !== sha256(Buffer.alloc(0))) throw new ReviewingStateProblem();
      return { status: 'ready', bytes: Buffer.alloc(0) };
    }
    const output = Buffer.alloc(length);
    let selectedOffset = 0;
    while (selectedOffset < length) {
      const requested = Math.min(REVIEW_CONTEXT_CONTRIBUTION_CONTENT_WINDOW_BYTES, length - selectedOffset);
      const read = await this.#state.readContent({
        windows: [
          {
            recordIdentity: record.recordIdentity,
            role,
            offset: offset + selectedOffset,
            length: requested,
          },
        ],
      });
      if (read.stateVersion !== expectedStateVersion) {
        return { status: 'state-version-mismatch', stateVersion: read.stateVersion };
      }
      if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
      const [window] = read.windows;
      if (
        window === undefined ||
        window.status !== 'available' ||
        window.recordIdentity !== record.recordIdentity ||
        window.role !== role ||
        window.offset !== offset + selectedOffset ||
        window.byteLength !== requested ||
        window.bytes.byteLength !== requested ||
        window.totalByteLength !== sourceByteLength ||
        window.digest !== sourceSha256
      ) {
        throw new ReviewingStateProblem();
      }
      Buffer.from(window.bytes).copy(output, selectedOffset);
      selectedOffset += requested;
    }
    return { status: 'ready', bytes: output };
  }

  async #prepareArtifactContextContribution(
    targetReviewIdentity: ReviewIdentity,
    contributionIdentity: ReviewContextContributionIdentity,
    input: ReviewArtifactContextContributionInput,
    index: LoadedReviewIndex,
  ): Promise<PreparedReviewArtifactContribution> {
    if (input.artifact.kind === 'review-response') {
      const responseIdentity = input.artifact.responseIdentity;
      const sourceEntry = index.payload.reviews.find(entry =>
        entry.responses.some(response => response.responseIdentity === responseIdentity),
      );
      if (sourceEntry === undefined) {
        return {
          status: 'rejected',
          reason: 'context-artifact-not-found',
          blockerIdentities: [input.artifact.responseIdentity],
        };
      }
      if (sourceEntry.reviewIdentity === targetReviewIdentity) {
        return {
          status: 'rejected',
          reason: 'context-artifact-cycle',
          blockerIdentities: [input.artifact.responseIdentity],
        };
      }
      const read = await this.#state.read({
        recordIdentities: [input.artifact.responseIdentity],
        includeContent: false,
      });
      if (read.stateVersion !== index.stateVersion) {
        return { status: 'state-version-mismatch', stateVersion: read.stateVersion };
      }
      if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
      const [record] = read.records;
      if (record === undefined) {
        return {
          status: 'rejected',
          reason: 'context-artifact-not-found',
          blockerIdentities: [input.artifact.responseIdentity],
        };
      }
      if (
        record.kind !== 'review.response' ||
        record.recordClass !== 'immutable' ||
        record.schemaVersion !== 1 ||
        record.recordIdentity !== input.artifact.responseIdentity ||
        record.workflowIdentity !== sourceEntry.reviewIdentity ||
        record.content.length !== 0
      ) {
        throw new ReviewingStateProblem();
      }
      const response = parseReviewResponse(decodeReviewingPayload(record.payload));
      if (
        response.responseIdentity !== input.artifact.responseIdentity ||
        response.reviewIdentity !== sourceEntry.reviewIdentity ||
        !sourceEntry.questionIdentities.includes(response.questionIdentity)
      ) {
        throw new ReviewingStateProblem();
      }
      const sourceBytes = Buffer.from(response.body, 'utf8');
      const selectedOffset = input.scope.kind === 'whole' ? 0 : input.scope.offset;
      const selectedLength = input.scope.kind === 'whole' ? sourceBytes.byteLength : input.scope.length;
      if (selectedOffset + selectedLength > sourceBytes.byteLength) {
        return {
          status: 'rejected',
          reason: 'context-artifact-range-invalid',
          blockerIdentities: [input.artifact.responseIdentity],
        };
      }
      const provenance: ReviewArtifactContextProvenance = {
        kind: 'review-response',
        artifactIdentity: response.responseIdentity,
        sourceReviewIdentity: response.reviewIdentity,
        questionIdentity: response.questionIdentity,
        sourceByteLength: response.bodyByteLength,
        sourceSha256: response.bodySha256,
        sourceRecordChecksum: record.checksum,
      };
      if (selectedLength > MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES) {
        return {
          status: 'ready',
          contribution: {
            payload: {
              formatVersion: 1,
              reviewIdentity: targetReviewIdentity,
              contributionIdentity,
              kind: 'artifact',
              artifact: provenance,
              scope: input.scope,
              content: {
                status: 'unavailable',
                reason: 'contribution-limit',
                observedByteLength: selectedLength,
              },
              sensitivity: { sensitive: false, reasons: [] },
            },
          },
        };
      }
      const bytes = sourceBytes.subarray(selectedOffset, selectedOffset + selectedLength);
      return {
        status: 'ready',
        contribution: {
          payload: {
            formatVersion: 1,
            reviewIdentity: targetReviewIdentity,
            contributionIdentity,
            kind: 'artifact',
            artifact: provenance,
            scope: input.scope,
            content: { status: 'available', byteLength: bytes.byteLength, sha256: sha256(bytes) },
            sensitivity: { sensitive: false, reasons: [] },
          },
          bytes,
        },
      };
    }

    const reviewSnapshotIdentity = input.artifact.reviewSnapshotIdentity;
    const selectedSide = input.artifact.side;
    const sourceEntry = index.payload.reviews.find(entry =>
      entry.reviewSnapshotIdentities.includes(reviewSnapshotIdentity),
    );
    if (sourceEntry === undefined) {
      return {
        status: 'rejected',
        reason: 'context-artifact-not-found',
        blockerIdentities: [input.artifact.reviewSnapshotIdentity],
      };
    }
    if (sourceEntry.reviewIdentity === targetReviewIdentity) {
      return {
        status: 'rejected',
        reason: 'context-artifact-cycle',
        blockerIdentities: [input.artifact.reviewSnapshotIdentity],
      };
    }
    const fileRecordIdentity = stableRecordIdentity(
      'rsf',
      input.artifact.reviewSnapshotIdentity,
      input.artifact.fileIdentity,
    );
    const read = await this.#state.read({
      recordIdentities: [input.artifact.reviewSnapshotIdentity, fileRecordIdentity],
      includeContent: false,
    });
    if (read.stateVersion !== index.stateVersion) {
      return { status: 'state-version-mismatch', stateVersion: read.stateVersion };
    }
    if (read.quarantineReports.length > 0) throw new ReviewingStateProblem();
    const [snapshotRecord, fileRecord] = read.records;
    if (snapshotRecord === undefined || fileRecord === undefined) {
      return {
        status: 'rejected',
        reason: 'context-artifact-not-found',
        blockerIdentities: [
          ...(snapshotRecord === undefined ? [input.artifact.reviewSnapshotIdentity] : []),
          ...(fileRecord === undefined ? [fileRecordIdentity] : []),
        ],
      };
    }
    if (
      snapshotRecord.kind !== 'review.snapshot' ||
      snapshotRecord.recordClass !== 'immutable' ||
      snapshotRecord.schemaVersion !== 1 ||
      snapshotRecord.recordIdentity !== input.artifact.reviewSnapshotIdentity ||
      snapshotRecord.workflowIdentity !== sourceEntry.reviewIdentity ||
      snapshotRecord.content.length !== 0 ||
      fileRecord.kind !== 'review.snapshot-file' ||
      fileRecord.recordClass !== 'immutable' ||
      fileRecord.schemaVersion !== 1 ||
      fileRecord.recordIdentity !== fileRecordIdentity ||
      fileRecord.workflowIdentity !== sourceEntry.reviewIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    const snapshot = parseReviewSnapshot(decodeReviewingPayload(snapshotRecord.payload));
    const snapshotFile = parseReviewSnapshotFile(decodeReviewingPayload(fileRecord.payload));
    if (
      snapshot.reviewIdentity !== sourceEntry.reviewIdentity ||
      snapshot.reviewSnapshotIdentity !== input.artifact.reviewSnapshotIdentity ||
      snapshotFile.reviewIdentity !== sourceEntry.reviewIdentity ||
      snapshotFile.reviewSnapshotIdentity !== input.artifact.reviewSnapshotIdentity ||
      snapshotFile.file.fileIdentity !== input.artifact.fileIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    const side = input.artifact.side === 'old' ? snapshotFile.file.oldSide : snapshotFile.file.newSide;
    const sourceSensitive =
      side !== undefined &&
      (snapshotFile.file.scopeMembership?.some(
        membership => membership.inclusion === 'explicit-ignored' && membership.matchedSides.includes(selectedSide),
      ) ??
        false);
    const provenance: ReviewArtifactContextProvenance = {
      kind: 'review-snapshot-file-side',
      artifactIdentity: snapshot.reviewSnapshotIdentity,
      sourceReviewIdentity: snapshot.reviewIdentity,
      fileIdentity: snapshotFile.file.fileIdentity,
      side: input.artifact.side,
      ...(side === undefined ? {} : { path: side.path }),
      sourceByteLength: side?.byteLength ?? null,
      ...(side?.contentIdentity === undefined ? {} : { sourceContentIdentity: side.contentIdentity }),
      ...(side === undefined ? {} : { sourceClassification: side.classification }),
      sourceContentAvailability: side?.contentAvailability ?? 'absent',
      ...(side?.contentLimitation === undefined ? {} : { sourceContentLimitation: side.contentLimitation }),
      sourceSensitive,
      snapshotRecordChecksum: snapshotRecord.checksum,
      fileRecordChecksum: fileRecord.checksum,
    };
    const sensitivity: ReviewContextContributionSensitivity = sourceSensitive
      ? { sensitive: true, reasons: ['ignored-untracked'] }
      : { sensitive: false, reasons: [] };
    if (side === undefined) {
      if (input.scope.kind === 'bytes') {
        return {
          status: 'rejected',
          reason: 'context-artifact-range-invalid',
          blockerIdentities: [input.artifact.reviewSnapshotIdentity, input.artifact.fileIdentity],
        };
      }
      return {
        status: 'ready',
        contribution: {
          payload: {
            formatVersion: 1,
            reviewIdentity: targetReviewIdentity,
            contributionIdentity,
            kind: 'artifact',
            artifact: provenance,
            scope: input.scope,
            content: { status: 'unavailable', reason: 'artifact-side-absent' },
            sensitivity,
          },
        },
      };
    }
    if (
      input.scope.kind === 'bytes' &&
      (side.byteLength === null || input.scope.offset + input.scope.length > side.byteLength)
    ) {
      return {
        status: 'rejected',
        reason: 'context-artifact-range-invalid',
        blockerIdentities: [input.artifact.reviewSnapshotIdentity, input.artifact.fileIdentity],
      };
    }
    const selectedOffset = input.scope.kind === 'whole' ? 0 : input.scope.offset;
    const selectedLength = input.scope.kind === 'whole' ? side.byteLength : input.scope.length;
    if (selectedLength !== null && selectedLength > MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES) {
      return {
        status: 'ready',
        contribution: {
          payload: {
            formatVersion: 1,
            reviewIdentity: targetReviewIdentity,
            contributionIdentity,
            kind: 'artifact',
            artifact: provenance,
            scope: input.scope,
            content: {
              status: 'unavailable',
              reason: 'contribution-limit',
              observedByteLength: selectedLength,
            },
            sensitivity,
          },
        },
      };
    }
    if (
      side.contentAvailability !== 'captured' ||
      side.byteLength === null ||
      side.contentIdentity === undefined ||
      selectedLength === null
    ) {
      return {
        status: 'ready',
        contribution: {
          payload: {
            formatVersion: 1,
            reviewIdentity: targetReviewIdentity,
            contributionIdentity,
            kind: 'artifact',
            artifact: provenance,
            scope: input.scope,
            content: {
              status: 'unavailable',
              reason:
                side.contentAvailability === 'not-captured'
                  ? 'artifact-content-not-captured'
                  : 'artifact-content-unavailable',
              ...(side.byteLength === null ? {} : { observedByteLength: selectedLength ?? side.byteLength }),
              ...(side.contentLimitation === undefined ? {} : { sourceLimitation: side.contentLimitation }),
            },
            sensitivity,
          },
        },
      };
    }
    const exact = await this.#readArtifactContent(
      fileRecord,
      input.artifact.side,
      side.byteLength,
      side.contentIdentity.value,
      selectedOffset,
      selectedLength,
      index.stateVersion,
    );
    if (exact.status === 'state-version-mismatch') return exact;
    return {
      status: 'ready',
      contribution: {
        payload: {
          formatVersion: 1,
          reviewIdentity: targetReviewIdentity,
          contributionIdentity,
          kind: 'artifact',
          artifact: provenance,
          scope: input.scope,
          content: {
            status: 'available',
            byteLength: exact.bytes.byteLength,
            sha256: sha256(exact.bytes),
          },
          sensitivity,
        },
        bytes: exact.bytes,
      },
    };
  }

  async #addContextContribution(
    command: AddReviewContextContributionCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) return rejected(command, index.stateVersion, 'review-not-found');
    if (
      index.payload.currentReviewIdentity !== entry.reviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current', [entry.reviewIdentity]);
    }
    const selection = await this.#loadContextSelection(entry.reviewIdentity, index.stateVersion);
    if (selection.stateVersion !== index.stateVersion) {
      return rejected(command, selection.stateVersion, 'state-version-mismatch');
    }
    if (selection.revision !== command.expectedSelectionRevision) {
      return rejected(command, index.stateVersion, 'context-selection-revision-mismatch', [
        selection.payload.selectionIdentity,
      ]);
    }
    if (selection.payload.rules.length >= MAX_REVIEW_CONTEXT_RULES) {
      return rejected(command, index.stateVersion, 'context-rule-limit-reached', [selection.payload.selectionIdentity]);
    }

    const contributionIdentity = reviewContextContributionIdentity(command.commandIdentity);
    const prepared =
      command.contribution.kind === 'editor'
        ? {
            status: 'ready' as const,
            contribution: this.#prepareEditorContextContribution(
              entry.reviewIdentity,
              contributionIdentity,
              command.contribution,
            ),
          }
        : await this.#prepareArtifactContextContribution(
            entry.reviewIdentity,
            contributionIdentity,
            command.contribution,
            index,
          );
    if (prepared.status === 'state-version-mismatch') {
      return rejected(command, prepared.stateVersion, 'state-version-mismatch');
    }
    if (prepared.status === 'rejected') {
      return rejected(command, index.stateVersion, prepared.reason, prepared.blockerIdentities);
    }

    const ruleIdentity = occurrenceIdentity(
      'rcr',
      command.commandIdentity,
      'context-rule',
    ) as ReviewContextRuleIdentity;
    const rule: ReviewContextRule = {
      ruleIdentity,
      action: 'contribute',
      contributionIdentity,
    };
    const rules = [...selection.payload.rules, rule];
    const nextRevision = selection.revision + 1;
    const result: ReviewContextContributionAdded = deepFreeze({
      kind: 'review.context-contribution.added',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      selectionIdentity: selection.payload.selectionIdentity,
      selectionRevision: nextRevision,
      ruleIdentity,
      contributionIdentity,
      contributionKind: prepared.contribution.payload.kind,
    });
    return await this.#commit(command, normalized, result, [
      immutableRecord(
        contributionIdentity,
        entry.reviewIdentity,
        'review.context-contribution',
        prepared.contribution.payload,
        prepared.contribution.bytes === undefined ? [] : [{ role: 'content', bytes: prepared.contribution.bytes }],
      ),
      revisionedRecord(
        selection.payload.selectionIdentity,
        entry.reviewIdentity,
        'review.context-selection',
        selection.revision,
        {
          ...selection.payload,
          rules,
        } satisfies ReviewContextSelectionPayload,
      ),
    ]);
  }

  async #changeContextSelection(
    command: ChangeReviewContextSelectionCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) {
      return rejected(command, index.stateVersion, 'review-not-found');
    }
    if (
      index.payload.currentReviewIdentity !== entry.reviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current', [entry.reviewIdentity]);
    }
    const selection = await this.#loadContextSelection(entry.reviewIdentity, index.stateVersion);
    if (selection.stateVersion !== index.stateVersion) {
      return rejected(command, selection.stateVersion, 'state-version-mismatch');
    }
    if (selection.revision !== command.expectedSelectionRevision) {
      return rejected(command, index.stateVersion, 'context-selection-revision-mismatch', [
        selection.payload.selectionIdentity,
      ]);
    }

    let rules: readonly ReviewContextRule[];
    let ruleIdentity: ReviewContextRuleIdentity;
    let action: ReviewContextSelectionChanged['action'];
    const change = command.change;
    if (change.action === 'remove') {
      const existing = selection.payload.rules.find(rule => rule.ruleIdentity === change.ruleIdentity);
      if (existing === undefined) {
        return rejected(command, index.stateVersion, 'context-rule-not-found', [change.ruleIdentity]);
      }
      rules = selection.payload.rules.filter(rule => rule.ruleIdentity !== change.ruleIdentity);
      ruleIdentity = change.ruleIdentity;
      action = 'removed';
    } else {
      ruleIdentity = occurrenceIdentity('rcr', command.commandIdentity, 'context-rule') as ReviewContextRuleIdentity;
      const rule: ReviewContextRule =
        change.action === 'include'
          ? {
              ruleIdentity,
              action: 'include',
              source: change.source,
              ...(change.scope === undefined ? {} : { scope: change.scope }),
              ...(change.classification === undefined ? {} : { classification: change.classification }),
            }
          : change.action === 'pin'
            ? {
                ruleIdentity,
                action: 'pin',
                target: change.target,
                reviewSnapshotIdentity: change.reviewSnapshotIdentity,
                itemIdentity: change.itemIdentity,
              }
            : {
                ruleIdentity,
                action: 'exclude',
                target: change.target,
              };
      rules = applyReviewContextRule(selection.payload.rules, rule);
      if (rules.length > MAX_REVIEW_CONTEXT_RULES) {
        return rejected(command, index.stateVersion, 'context-rule-limit-reached', [
          selection.payload.selectionIdentity,
        ]);
      }
      action = change.action === 'include' ? 'included' : change.action === 'pin' ? 'pinned' : 'excluded';
    }

    const nextRevision = selection.revision + 1;
    const result: ReviewContextSelectionChanged = deepFreeze({
      kind: 'review.context-selection.changed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      selectionIdentity: selection.payload.selectionIdentity,
      selectionRevision: nextRevision,
      action,
      ruleIdentity,
    });
    return await this.#commit(command, normalized, result, [
      revisionedRecord(
        selection.payload.selectionIdentity,
        entry.reviewIdentity,
        'review.context-selection',
        selection.revision,
        {
          ...selection.payload,
          rules,
        } satisfies ReviewContextSelectionPayload,
      ),
    ]);
  }

  async #start(
    command:
      | StartCurrentChangesReviewCommand
      | StartReviewComparisonCommand
      | ContinueReviewComparisonWithLiveChangesCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    if (index.payload.reviews.length >= MAX_REVIEWS) {
      return rejected(command, index.stateVersion, 'review-limit-reached');
    }

    let sourceReviewIdentity: ReviewIdentity | undefined;
    if (command.kind === 'review.comparison.continue-live') {
      const source = index.payload.reviews.find(entry => entry.reviewIdentity === command.reviewIdentity);
      if (
        source === undefined ||
        source.reviewIdentity !== index.payload.currentReviewIdentity ||
        (source.status !== 'retained' && source.status !== 'active')
      ) {
        return rejected(
          command,
          index.stateVersion,
          'continuation-source-not-current',
          source === undefined ? [] : [source.reviewIdentity],
        );
      }
      const snapshot = await this.#readSnapshot(source);
      if (snapshot.comparison === undefined || snapshot.comparedState.kind !== 'commit') {
        return rejected(command, index.stateVersion, 'continuation-source-not-fixed', [source.reviewIdentity]);
      }
      if (
        source.reviewSnapshotIdentity !== command.expectedReviewSnapshotIdentity ||
        snapshot.comparedState.objectIdentity !== command.expectedSavedEndpointObjectIdentity
      ) {
        return rejected(command, index.stateVersion, 'continuation-generation-changed', [
          source.reviewSnapshotIdentity,
        ]);
      }
      sourceReviewIdentity = source.reviewIdentity;
    }

    const captured = await this.#snapshots.capture(
      command.kind === 'review.comparison.start'
        ? {
            kind: 'comparison',
            selection: command.selection,
            expectedBasisObjectIdentity: command.expectedBasisObjectIdentity,
            expectedComparedObjectIdentity: command.expectedComparedObjectIdentity,
            ...(command.expectedComparisonResolutionIdentity === undefined
              ? {}
              : {
                  expectedComparisonResolutionIdentity: command.expectedComparisonResolutionIdentity,
                }),
          }
        : { kind: 'current-changes' },
    );
    if ('reason' in captured) {
      return rejected(command, index.stateVersion, captured.reason);
    }
    if (command.kind === 'review.comparison.continue-live') {
      const liveChangesIdentity = reviewLiveChangesIdentity(
        captured.capture.basis,
        captured.capture.comparedState,
        captured.capture.manifest,
      );
      if (
        captured.capture.kind !== 'workspace.current-changes.capture' ||
        captured.capture.basis.objectIdentity !== command.expectedCurrentHeadObjectIdentity ||
        liveChangesIdentity !== command.expectedLiveChangesIdentity
      ) {
        return rejected(command, index.stateVersion, 'continuation-generation-changed', [
          command.expectedReviewSnapshotIdentity,
        ]);
      }
    }
    // WF-226 slice 1: an empty manifest is a valid live review (clean checkout,
    // unchanged files), not a rejection. The empty-diff review stays fully
    // retained, navigable, and questionable once message records exist.

    const reviewIdentity = occurrenceIdentity('rev', command.commandIdentity, 'review') as ReviewIdentity;
    const changeSetIdentity = occurrenceIdentity('cst', command.commandIdentity, 'change-set');
    const reviewSnapshotIdentity = occurrenceIdentity(
      'rsn',
      command.commandIdentity,
      'review-snapshot',
    ) as ReviewSnapshotIdentity;
    const prepared = this.#snapshots.prepare({
      reviewIdentity,
      reviewSnapshotIdentity,
      changeSetIdentity,
      captured,
    });
    const liveReviewBasisIdentity = reviewLiveBasisIdentity(reviewIdentity);
    // Review Snapshot lineage is capture machinery, not the change-event tree.
    // Only an explicitly selected historical comparison starts on a saved basis;
    // ordinary current reviews start with the one live singleton.
    const initialReviewBasis: ReviewBasisPayload | undefined =
      command.kind !== 'review.comparison.start'
        ? undefined
        : prepared.snapshot.comparedState.kind === 'commit'
          ? {
              formatVersion: 1,
              reviewIdentity,
              reviewBasisIdentity: reviewGitCommitBasisIdentity(
                reviewIdentity,
                prepared.snapshot.comparedState.objectIdentity,
              ),
              kind: 'git-commit',
              parentReviewBasisIdentity: liveReviewBasisIdentity,
              reviewSnapshotIdentity,
              commit: {
                kind: 'commit',
                objectFormat: prepared.snapshot.comparedState.objectFormat,
                objectIdentity: prepared.snapshot.comparedState.objectIdentity,
                abbreviatedObjectIdentity: prepared.snapshot.comparedState.abbreviatedObjectIdentity,
                subject: prepared.snapshot.comparedState.subject,
              },
            }
          : {
              formatVersion: 1,
              reviewIdentity,
              reviewBasisIdentity: reviewSnapshotBasisIdentity(reviewIdentity, reviewSnapshotIdentity),
              kind: 'saved-review-point',
              parentReviewBasisIdentity: liveReviewBasisIdentity,
              reviewSnapshotIdentity,
            };
    const startedAt = this.#timestamp();
    const nextStateVersion = command.expectedStateVersion + 1;
    const entry: ReviewIndexEntry = {
      reviewIdentity,
      status: 'retained',
      startedAt,
      changeSetIdentity,
      ...(sourceReviewIdentity === undefined ? {} : { continuedFromReviewIdentity: sourceReviewIdentity }),
      reviewSnapshotIdentities: [reviewSnapshotIdentity],
      reviewSnapshotIdentity,
      basisTree: {
        formatVersion: 1,
        liveReviewBasisIdentity,
        reviewBasisIdentities: [
          liveReviewBasisIdentity,
          ...(initialReviewBasis === undefined ? [] : [initialReviewBasis.reviewBasisIdentity]),
        ],
      },
      messageHistory: {
        formatVersion: 1,
        messages: [],
        responses: [],
        changeObservations: [],
      },
      draftIdentities: [],
      openDraftIdentities: [],
      batchIdentities: [],
      questionIdentities: [],
      dispositionIdentities: [],
      currentDispositions: [],
      responses: [],
    };
    const result: CurrentChangesReviewStarted | ReviewComparisonStarted | ReviewComparisonContinuedWithLiveChanges =
      deepFreeze(
        command.kind === 'review.comparison.continue-live'
          ? {
              kind: 'review.comparison.continued-live',
              status: 'accepted',
              commandIdentity: command.commandIdentity,
              stateVersion: nextStateVersion,
              reviewIdentity,
              sourceReviewIdentity: sourceReviewIdentity as ReviewIdentity,
              changeSetIdentity,
              reviewSnapshotIdentity,
              manifest: captured.capture.manifest,
            }
          : {
              kind:
                command.kind === 'review.current-changes.start'
                  ? 'review.current-changes.started'
                  : 'review.comparison.started',
              status: 'accepted',
              commandIdentity: command.commandIdentity,
              stateVersion: nextStateVersion,
              reviewIdentity,
              changeSetIdentity,
              reviewSnapshotIdentity,
              manifest: captured.capture.manifest,
            },
      );

    const committed = await this.#commit(command, normalized, result, [
      immutableRecord(reviewIdentity, reviewIdentity, 'review', {
        formatVersion: 1,
        reviewIdentity,
        startedAt,
        changeSetIdentity,
        ...(sourceReviewIdentity === undefined ? {} : { continuedFromReviewIdentity: sourceReviewIdentity }),
        reviewSnapshotIdentity,
      }),
      immutableRecord(changeSetIdentity, reviewIdentity, 'review.change-set', {
        formatVersion: 1,
        reviewIdentity,
        changeSetIdentity,
        workspaceIdentity: this.#workspaceIdentity,
        canonicalCheckout: this.#canonicalCheckout,
        basis: captured.capture.basis,
        comparedState: captured.capture.comparedState,
        ...(captured.capture.kind === 'workspace.review-comparison.capture'
          ? {
              comparison: captured.capture.selection,
              ...(captured.capture.comparisonResolutionIdentity === undefined
                ? {}
                : {
                    comparisonResolutionIdentity: captured.capture.comparisonResolutionIdentity,
                    comparisonDynamicInputs: captured.capture.comparisonDynamicInputs ?? [],
                  }),
            }
          : {}),
      }),
      immutableRecord(liveReviewBasisIdentity, reviewIdentity, 'review.basis', {
        formatVersion: 1,
        reviewIdentity,
        reviewBasisIdentity: liveReviewBasisIdentity,
        kind: 'live',
      } satisfies ReviewBasisPayload),
      ...(initialReviewBasis === undefined
        ? []
        : [
            immutableRecord(initialReviewBasis.reviewBasisIdentity, reviewIdentity, 'review.basis', initialReviewBasis),
          ]),
      ...prepared.records,
      this.#indexWrite(index, {
        formatVersion: 1,
        currentReviewIdentity: reviewIdentity,
        reviews: [
          ...index.payload.reviews.map(existing =>
            existing.reviewIdentity === index.payload.currentReviewIdentity && existing.status === 'active'
              ? { ...existing, status: 'retained' as const }
              : existing,
          ),
          entry,
        ],
      }),
    ]);
    if (committed.status === 'accepted' && captured.capture.kind === 'workspace.current-changes.capture') {
      try {
        this.#onCurrentChangesCaptured?.(reviewIdentity, captured);
      } catch {
        // A live-view hint; the committed Review stands without it.
      }
    }
    return committed;
  }

  #basisChangeSetRecord(
    reviewIdentity: ReviewIdentity,
    changeSetIdentity: string,
    capture: CapturedReviewSnapshot['capture'],
  ): StateRecordWrite {
    return immutableRecord(changeSetIdentity, reviewIdentity, 'review.change-set', {
      formatVersion: 1,
      reviewIdentity,
      changeSetIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      canonicalCheckout: this.#canonicalCheckout,
      basis: capture.basis,
      comparedState: capture.comparedState,
      ...(capture.kind === 'workspace.review-comparison.capture'
        ? {
            comparison: capture.selection,
            ...(capture.comparisonResolutionIdentity === undefined
              ? {}
              : {
                  comparisonResolutionIdentity: capture.comparisonResolutionIdentity,
                  comparisonDynamicInputs: capture.comparisonDynamicInputs ?? [],
                }),
          }
        : {}),
    });
  }

  async #captureGitCommitBasis(
    command: CaptureReviewGitCommitBasisCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) return rejected(command, index.stateVersion, 'review-not-found');
    if (entry.basisTree === undefined) {
      return rejected(command, index.stateVersion, 'review-basis-not-found', [command.reviewBasisIdentity]);
    }
    const tree = entry.basisTree;
    if (tree.reviewBasisIdentities.includes(command.reviewBasisIdentity)) {
      return rejected(command, index.stateVersion, 'review-basis-already-captured', [command.reviewBasisIdentity]);
    }
    if (tree.reviewBasisIdentities.length >= MAX_REVIEW_BASES) {
      return rejected(command, index.stateVersion, 'review-basis-limit-reached', [entry.reviewIdentity]);
    }
    const captured = await this.#snapshots.capture({
      kind: 'comparison-refresh',
      selection: { kind: 'commit', revision: command.commitObjectIdentity },
    });
    if ('reason' in captured) return rejected(command, index.stateVersion, captured.reason);
    if (
      captured.capture.kind !== 'workspace.review-comparison.capture' ||
      captured.capture.comparedState.kind !== 'commit' ||
      captured.capture.comparedState.objectIdentity !== command.commitObjectIdentity
    ) {
      return rejected(command, index.stateVersion, 'comparison-changed', [command.commitObjectIdentity]);
    }
    const changeSetIdentity = occurrenceIdentity('cst', command.commandIdentity, 'git-basis-change-set');
    const reviewSnapshotIdentity = occurrenceIdentity(
      'rsn',
      command.commandIdentity,
      'git-basis-review-snapshot',
    ) as ReviewSnapshotIdentity;
    const prepared = this.#snapshots.prepare({
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity,
      changeSetIdentity,
      captured,
    });
    const commit: ReviewBasisCommit = {
      kind: 'commit',
      objectFormat: captured.capture.comparedState.objectFormat,
      objectIdentity: captured.capture.comparedState.objectIdentity,
      abbreviatedObjectIdentity: captured.capture.comparedState.abbreviatedObjectIdentity,
      subject: captured.capture.comparedState.subject,
    };
    const basis: ReviewBasisPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBasisIdentity: command.reviewBasisIdentity,
      kind: 'git-commit',
      parentReviewBasisIdentity: tree.liveReviewBasisIdentity,
      reviewSnapshotIdentity,
      commit,
    };
    const result: ReviewGitCommitBasisCaptured = deepFreeze({
      kind: 'review.basis.git-commit.captured',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBasisIdentity: basis.reviewBasisIdentity,
      parentReviewBasisIdentity: basis.parentReviewBasisIdentity,
      reviewSnapshotIdentity,
      commit,
    });
    return await this.#commit(command, normalized, result, [
      this.#basisChangeSetRecord(entry.reviewIdentity, changeSetIdentity, captured.capture),
      ...prepared.records,
      immutableRecord(basis.reviewBasisIdentity, entry.reviewIdentity, 'review.basis', basis),
      this.#indexWrite(index, {
        ...index.payload,
        reviews: index.payload.reviews.map(candidate =>
          candidate.reviewIdentity === entry.reviewIdentity
            ? {
                ...entry,
                basisTree: {
                  ...tree,
                  reviewBasisIdentities: [...tree.reviewBasisIdentities, basis.reviewBasisIdentity],
                },
              }
            : candidate,
        ),
      }),
    ]);
  }

  async #forkBasis(
    command: ForkReviewBasisCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) return rejected(command, index.stateVersion, 'review-not-found');
    if (
      entry.reviewIdentity !== index.payload.currentReviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current', [entry.reviewIdentity]);
    }
    if (
      entry.basisTree === undefined ||
      !entry.basisTree.reviewBasisIdentities.includes(command.parentReviewBasisIdentity)
    ) {
      return rejected(command, index.stateVersion, 'review-basis-not-found', [command.parentReviewBasisIdentity]);
    }
    const tree = entry.basisTree;
    if (tree.reviewBasisIdentities.length >= MAX_REVIEW_BASES) {
      return rejected(command, index.stateVersion, 'review-basis-limit-reached', [entry.reviewIdentity]);
    }
    const [captured, context] = await Promise.all([
      this.#snapshots.capture({ kind: 'current-changes' }),
      this.#snapshots.captureContext(entry.reviewIdentity, index.stateVersion),
    ]);
    if ('reason' in captured) return rejected(command, index.stateVersion, captured.reason);
    if ('reason' in context) return rejected(command, index.stateVersion, context.reason);
    const changeSetIdentity = occurrenceIdentity('cst', command.commandIdentity, 'fork-basis-change-set');
    const reviewSnapshotIdentity = occurrenceIdentity(
      'rsn',
      command.commandIdentity,
      'fork-basis-review-snapshot',
    ) as ReviewSnapshotIdentity;
    const prepared = this.#snapshots.prepare({
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity,
      changeSetIdentity,
      captured,
      context,
    });
    const basis: ReviewBasisPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBasisIdentity: reviewSnapshotBasisIdentity(entry.reviewIdentity, reviewSnapshotIdentity),
      kind: 'saved-review-point',
      parentReviewBasisIdentity: command.parentReviewBasisIdentity,
      reviewSnapshotIdentity,
    };
    const result: ReviewBasisForked = deepFreeze({
      kind: 'review.basis.forked',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBasisIdentity: basis.reviewBasisIdentity,
      parentReviewBasisIdentity: basis.parentReviewBasisIdentity,
      reviewSnapshotIdentity,
    });
    return await this.#commit(command, normalized, result, [
      this.#basisChangeSetRecord(entry.reviewIdentity, changeSetIdentity, captured.capture),
      ...prepared.records,
      immutableRecord(basis.reviewBasisIdentity, entry.reviewIdentity, 'review.basis', basis),
      this.#indexWrite(index, {
        ...index.payload,
        reviews: index.payload.reviews.map(candidate =>
          candidate.reviewIdentity === entry.reviewIdentity
            ? {
                ...entry,
                basisTree: {
                  ...tree,
                  reviewBasisIdentities: [...tree.reviewBasisIdentities, basis.reviewBasisIdentity],
                },
              }
            : candidate,
        ),
      }),
    ]);
  }

  async #recordChangeObservation(
    command: RecordReviewChangeObservationCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) return rejected(command, index.stateVersion, 'review-not-found');
    const indexedMessage = entry.messageHistory?.messages.find(
      message => message.reviewMessageIdentity === command.reviewMessageIdentity,
    );
    if (entry.basisTree === undefined || entry.messageHistory === undefined || indexedMessage === undefined) {
      return rejected(command, index.stateVersion, 'review-message-not-found', [command.reviewMessageIdentity]);
    }
    const indexedResponse = entry.messageHistory.responses.find(
      response =>
        response.reviewMessageIdentity === command.reviewMessageIdentity &&
        response.responseIdentity === command.responseIdentity,
    );
    if (indexedResponse === undefined) {
      return rejected(command, index.stateVersion, 'review-response-not-found', [command.responseIdentity]);
    }
    if (
      entry.messageHistory.changeObservations.some(
        observation =>
          observation.reviewMessageIdentity === command.reviewMessageIdentity ||
          observation.responseIdentity === command.responseIdentity,
      )
    ) {
      return rejected(command, index.stateVersion, 'change-observation-already-recorded', [command.responseIdentity]);
    }
    const [messageRecord, responseRecord] = await this.#readRecords(
      [command.reviewMessageIdentity, command.responseIdentity],
      false,
    );
    if (
      messageRecord?.kind !== 'review.message' ||
      messageRecord.recordClass !== 'immutable' ||
      messageRecord.workflowIdentity !== entry.reviewIdentity ||
      responseRecord?.kind !== 'review.message-response' ||
      responseRecord.recordClass !== 'immutable' ||
      responseRecord.workflowIdentity !== entry.reviewIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    const message = parseReviewMessage(decodeReviewingPayload(messageRecord.payload));
    const response = parseReviewMessageResponse(decodeReviewingPayload(responseRecord.payload));
    if (
      message.reviewIdentity !== entry.reviewIdentity ||
      message.reviewMessageIdentity !== command.reviewMessageIdentity ||
      message.originReviewBasisIdentity !== indexedMessage.originReviewBasisIdentity ||
      response.reviewIdentity !== entry.reviewIdentity ||
      response.reviewMessageIdentity !== command.reviewMessageIdentity ||
      response.responseIdentity !== command.responseIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    const [captured, context] = await Promise.all([
      this.#snapshots.capture({ kind: 'current-changes' }),
      this.#snapshots.captureContext(entry.reviewIdentity, index.stateVersion),
    ]);
    if ('reason' in captured) return rejected(command, index.stateVersion, captured.reason);
    if ('reason' in context) return rejected(command, index.stateVersion, context.reason);
    if (captured.capture.kind !== 'workspace.current-changes.capture') {
      throw new ReviewingStateProblem();
    }
    const observedState: ReviewMessageRepositoryState = {
      kind: 'current-repository-state',
      basis: captured.capture.basis,
      comparedState: captured.capture.comparedState,
      manifest: captured.capture.manifest,
    };
    const changed = !reviewMessageRepositoryStateMatches(message.repositoryStateAtCommitment, observedState);
    const tree = entry.basisTree;
    const history = entry.messageHistory;
    if (!changed) {
      const result: ReviewChangeObservationRecorded = deepFreeze({
        kind: 'review.change-observation.recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion + 1,
        reviewIdentity: entry.reviewIdentity,
        outcome: 'unchanged',
        reviewMessageIdentity: command.reviewMessageIdentity,
        responseIdentity: command.responseIdentity,
        parentReviewBasisIdentity: message.originReviewBasisIdentity,
      });
      return await this.#commit(command, normalized, result, [
        this.#indexWrite(index, {
          ...index.payload,
          reviews: index.payload.reviews.map(candidate =>
            candidate.reviewIdentity === entry.reviewIdentity
              ? {
                  ...entry,
                  messageHistory: {
                    ...history,
                    changeObservations: [
                      ...history.changeObservations,
                      {
                        reviewMessageIdentity: command.reviewMessageIdentity,
                        responseIdentity: command.responseIdentity,
                        outcome: 'unchanged',
                      },
                    ],
                  },
                }
              : candidate,
          ),
        }),
      ]);
    }
    if (tree.reviewBasisIdentities.length >= MAX_REVIEW_BASES) {
      return rejected(command, index.stateVersion, 'review-basis-limit-reached', [entry.reviewIdentity]);
    }
    const changeSetIdentity = occurrenceIdentity('cst', command.commandIdentity, 'change-event-basis-change-set');
    const reviewSnapshotIdentity = occurrenceIdentity(
      'rsn',
      command.commandIdentity,
      'change-event-basis-review-snapshot',
    ) as ReviewSnapshotIdentity;
    const prepared = this.#snapshots.prepare({
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity,
      changeSetIdentity,
      captured,
      context,
    });
    const basis: ReviewBasisPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBasisIdentity: reviewSnapshotBasisIdentity(entry.reviewIdentity, reviewSnapshotIdentity),
      kind: 'change-event',
      parentReviewBasisIdentity: message.originReviewBasisIdentity,
      reviewSnapshotIdentity,
      provenance: {
        kind: 'changes-observed-after-response',
        responseIdentity: command.responseIdentity,
      },
    };
    const result: ReviewChangeObservationRecorded = deepFreeze({
      kind: 'review.change-observation.recorded',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: index.stateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      outcome: 'forked',
      reviewMessageIdentity: command.reviewMessageIdentity,
      responseIdentity: command.responseIdentity,
      parentReviewBasisIdentity: message.originReviewBasisIdentity,
      reviewBasisIdentity: basis.reviewBasisIdentity,
      reviewSnapshotIdentity,
    });
    return await this.#commit(command, normalized, result, [
      this.#basisChangeSetRecord(entry.reviewIdentity, changeSetIdentity, captured.capture),
      ...prepared.records,
      immutableRecord(basis.reviewBasisIdentity, entry.reviewIdentity, 'review.basis', basis),
      this.#indexWrite(index, {
        ...index.payload,
        reviews: index.payload.reviews.map(candidate =>
          candidate.reviewIdentity === entry.reviewIdentity
            ? {
                ...entry,
                basisTree: {
                  ...tree,
                  reviewBasisIdentities: [...tree.reviewBasisIdentities, basis.reviewBasisIdentity],
                },
                messageHistory: {
                  ...history,
                  changeObservations: [
                    ...history.changeObservations,
                    {
                      reviewMessageIdentity: command.reviewMessageIdentity,
                      responseIdentity: command.responseIdentity,
                      outcome: 'forked',
                      reviewBasisIdentity: basis.reviewBasisIdentity,
                    },
                  ],
                },
              }
            : candidate,
        ),
      }),
    ]);
  }

  /**
   * Explicit human refresh of every mutable Snapshot input. Change Set and
   * supporting context are captured independently but commit as one successor.
   */
  async #refreshChangeSet(
    command: RefreshReviewChangeSetCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) {
      return rejected(command, index.stateVersion, 'review-not-found', []);
    }
    if (
      entry.reviewIdentity !== index.payload.currentReviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current', [entry.reviewIdentity]);
    }
    if (entry.reviewSnapshotIdentity !== command.expectedReviewSnapshotIdentity) {
      return rejected(command, index.stateVersion, 'review-snapshot-identity-mismatch', [entry.reviewSnapshotIdentity]);
    }
    const snapshot = await this.#readSnapshot(entry);
    if (snapshot.comparison === undefined || !reviewComparisonUsesExactResolution(snapshot.comparison)) {
      return rejected(command, index.stateVersion, 'change-set-refresh-unsupported', [entry.reviewSnapshotIdentity]);
    }

    const context = await this.#snapshots.captureContext(entry.reviewIdentity, index.stateVersion);
    if ('reason' in context) {
      return rejected(command, index.stateVersion, context.reason, [entry.reviewSnapshotIdentity]);
    }
    const verified = await this.#snapshots.verifyPersistedComparison(snapshot);
    if (verified === 'unverified') {
      return await this.#snapshotRejection(command, index, 'snapshot-unverified', [entry.reviewSnapshotIdentity]);
    }
    if (verified === 'current' && reviewSnapshotContextMatches(snapshot, context)) {
      // Deterministic observation: replay re-derives the identical result
      // without committing any record or advancing the State version.
      return deepFreeze({
        kind: 'review.change-set.refreshed',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: command.expectedStateVersion,
        reviewIdentity: entry.reviewIdentity,
        outcome: 'unchanged',
        changeSetIdentity: entry.changeSetIdentity,
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        manifest: snapshot.manifest,
      }) as ReviewChangeSetRefreshed;
    }

    const captured = await this.#snapshots.capture({
      kind: 'comparison-refresh',
      selection: snapshot.comparison,
    });
    if ('reason' in captured) {
      return rejected(command, index.stateVersion, captured.reason, [entry.reviewSnapshotIdentity]);
    }
    if (captured.capture.verification.state !== 'current') {
      return await this.#snapshotRejection(command, index, 'snapshot-unverified', [entry.reviewSnapshotIdentity]);
    }
    if (entry.reviewSnapshotIdentities.length >= MAX_REVIEW_SNAPSHOTS) {
      return rejected(command, index.stateVersion, 'change-set-lineage-limit-reached', [entry.reviewSnapshotIdentity]);
    }
    const reviewSnapshotIdentity = reviewingRecordIdentity(
      'rsn',
      command.commandIdentity,
      'refresh-successor',
    ) as ReviewSnapshotIdentity;
    const prepared = this.#snapshots.prepare({
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity,
      previousReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      changeSetIdentity: entry.changeSetIdentity,
      captured,
      context,
    });
    const nextStateVersion = command.expectedStateVersion + 1;
    const result: ReviewChangeSetRefreshed = deepFreeze({
      kind: 'review.change-set.refreshed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: entry.reviewIdentity,
      outcome: 'changed',
      changeSetIdentity: entry.changeSetIdentity,
      reviewSnapshotIdentity,
      previousReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      manifest: captured.capture.manifest,
    });
    return await this.#commit(command, normalized, result, [
      ...prepared.records,
      this.#indexWrite(index, {
        ...index.payload,
        reviews: index.payload.reviews.map(candidate =>
          candidate.reviewIdentity === entry.reviewIdentity
            ? {
                ...entry,
                reviewSnapshotIdentities: [...entry.reviewSnapshotIdentities, reviewSnapshotIdentity],
                reviewSnapshotIdentity,
              }
            : candidate,
        ),
      }),
    ]);
  }

  async #refreshContext(
    command: RefreshReviewContextCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) {
      return rejected(command, index.stateVersion, 'review-not-found', []);
    }
    if (
      entry.reviewIdentity !== index.payload.currentReviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current', [entry.reviewIdentity]);
    }
    if (entry.reviewSnapshotIdentity !== command.expectedReviewSnapshotIdentity) {
      return rejected(command, index.stateVersion, 'review-snapshot-identity-mismatch', [entry.reviewSnapshotIdentity]);
    }
    const snapshot = await this.#readSnapshot(entry);
    const comparisonVerdict = await this.#verifyComparisonOnly(snapshot);
    if (comparisonVerdict !== 'current') {
      // Comparison movement needs the combined refresh; context movement alone never widens it.
      return await this.#snapshotRejection(
        command,
        index,
        comparisonVerdict === 'stale' ? 'snapshot-stale' : 'snapshot-unverified',
        [entry.reviewSnapshotIdentity],
      );
    }
    const verification = await this.#snapshots.verifyPersistedContext(snapshot);
    if (verification.verdict === 'unverified') {
      return await this.#snapshotRejection(command, index, 'snapshot-unverified', [entry.reviewSnapshotIdentity]);
    }
    const context = await this.#snapshots.captureContext(entry.reviewIdentity, index.stateVersion);
    if ('reason' in context) {
      return rejected(command, index.stateVersion, context.reason, [entry.reviewSnapshotIdentity]);
    }
    if (context.selectionRevision === 0 && context.rules.length === 0 && snapshot.context === undefined) {
      return rejected(command, index.stateVersion, 'change-set-refresh-unsupported', [entry.reviewSnapshotIdentity]);
    }
    if (reviewSnapshotContextMatches(snapshot, context)) {
      // Deterministic observation: replay re-derives the identical result
      // without committing any record or advancing the State version.
      return deepFreeze({
        kind: 'review.context.refreshed',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: command.expectedStateVersion,
        reviewIdentity: entry.reviewIdentity,
        outcome: 'unchanged',
        changeSetIdentity: entry.changeSetIdentity,
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        manifest: snapshot.manifest,
        delta: { selectionChanged: false, verdicts: [] },
      }) as ReviewContextRefreshed;
    }
    if (entry.reviewSnapshotIdentities.length >= MAX_REVIEW_SNAPSHOTS) {
      return rejected(command, index.stateVersion, 'change-set-lineage-limit-reached', [entry.reviewSnapshotIdentity]);
    }
    const delta: ReviewContextRefreshDelta = {
      selectionChanged: verification.selectionChanged,
      verdicts: verification.verdicts
        .filter(
          (
            verdict,
          ): verdict is ContextItemVerdict & {
            readonly currency: 'changed' | 'missing' | 'unavailable' | 'over-limit' | 'added';
          } => verdict.currency !== 'current',
        )
        .map(verdict => ({
          ...(verdict.pathBytesBase64 === undefined ? {} : { pathBytesBase64: verdict.pathBytesBase64 }),
          ...(verdict.absolutePath === undefined ? {} : { absolutePath: verdict.absolutePath }),
          currency: verdict.currency,
          ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
        })),
    };
    const reviewSnapshotIdentity = reviewingRecordIdentity(
      'rsn',
      command.commandIdentity,
      'context-refresh-successor',
    ) as ReviewSnapshotIdentity;
    const files = await this.#snapshots.reconstructComparisonFiles(snapshot);
    const prepared = this.#snapshots.prepareContextSuccessor({
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity,
      previousReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      changeSetIdentity: entry.changeSetIdentity,
      snapshot,
      files,
      context,
    });
    const nextStateVersion = command.expectedStateVersion + 1;
    const result: ReviewContextRefreshed = deepFreeze({
      kind: 'review.context.refreshed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: nextStateVersion,
      reviewIdentity: entry.reviewIdentity,
      outcome: 'changed',
      changeSetIdentity: entry.changeSetIdentity,
      reviewSnapshotIdentity,
      previousReviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      manifest: snapshot.manifest,
      delta,
    });
    return await this.#commit(command, normalized, result, [
      ...prepared.records,
      this.#indexWrite(index, {
        ...index.payload,
        reviews: index.payload.reviews.map(candidate =>
          candidate.reviewIdentity === entry.reviewIdentity
            ? {
                ...entry,
                reviewSnapshotIdentities: [...entry.reviewSnapshotIdentities, reviewSnapshotIdentity],
                reviewSnapshotIdentity,
              }
            : candidate,
        ),
      }),
    ]);
  }

  async #createDraft(
    command: CreateReviewQuestionDraftCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) {
      return this.#inactiveRejection(command, index);
    }
    if (entry.draftIdentities.length >= MAX_DRAFTS) {
      return rejected(command, index.stateVersion, 'review-limit-reached');
    }
    const anchor = await this.#resolveAnchor(entry, command.anchor);
    if (typeof anchor === 'string') {
      return rejected(command, index.stateVersion, anchor);
    }
    const draftIdentity = occurrenceIdentity(
      'qdr',
      command.commandIdentity,
      'question-draft',
    ) as ReviewQuestionDraftIdentity;
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      draftIdentities: [...entry.draftIdentities, draftIdentity],
      openDraftIdentities: [...entry.openDraftIdentities, draftIdentity],
    };
    const result: ReviewQuestionDraftCreated = deepFreeze({
      kind: 'review.question-draft.created',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      draftIdentity,
      draftRevision: 1,
      anchor,
    });
    const draft: ReviewQuestionDraftPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      status: 'open',
      body: command.body,
      anchor,
    };
    return await this.#commit(command, normalized, result, [
      revisionedRecord(draftIdentity, entry.reviewIdentity, 'review.question-draft', 0, draft),
      this.#indexWrite(index, replaceReview(index.payload, nextEntry)),
    ]);
  }

  async #promoteLegacyQuestionCandidate(
    command: PromoteLegacyQuestionCandidateCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = index.payload.reviews.find(candidate => candidate.reviewIdentity === command.reviewIdentity);
    if (entry === undefined) {
      return rejected(command, index.stateVersion, 'review-not-found');
    }
    if (
      index.payload.currentReviewIdentity !== entry.reviewIdentity ||
      (entry.status !== 'retained' && entry.status !== 'active')
    ) {
      return rejected(command, index.stateVersion, 'review-not-current');
    }
    if (entry.reviewSnapshotIdentity !== command.expectedReviewSnapshotIdentity) {
      return rejected(command, index.stateVersion, 'review-snapshot-identity-mismatch', [entry.reviewSnapshotIdentity]);
    }
    if (entry.draftIdentities.length >= MAX_DRAFTS) {
      return rejected(command, index.stateVersion, 'review-limit-reached');
    }
    const draftIdentity = occurrenceIdentity(
      'qdr',
      command.commandIdentity,
      'question-draft',
    ) as ReviewQuestionDraftIdentity;
    const prepared = await this.#legacyReviewImport.prepareQuestionCandidatePromotion({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
      candidateIdentity: command.candidateIdentity,
      expectedSourceDigest: command.expectedSourceDigest,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      draftIdentity,
    });
    if (prepared.status === 'rejected') {
      return rejected(command, prepared.stateVersion, legacyPromotionRejectionReason(prepared.reason));
    }
    if (!questionBody(prepared.body)) {
      return rejected(command, index.stateVersion, 'legacy-candidate-body-ineligible');
    }
    const snapshot = await this.#readSnapshot(entry);
    const verification = await this.#verifySnapshot(snapshot);
    if (verification !== 'current') {
      return await this.#snapshotRejection(
        command,
        index,
        verification === 'stale' ? 'snapshot-stale' : 'snapshot-unverified',
        [entry.reviewSnapshotIdentity],
      );
    }
    const anchor = await this.#resolveAnchor(entry, command.anchor);
    if (typeof anchor === 'string') {
      return rejected(command, index.stateVersion, anchor);
    }
    const provenance: ReviewQuestionDraftLegacyCandidateProvenance = {
      kind: 'legacy-review.queue-candidate',
      sourceIdentity: prepared.sourceIdentity,
      sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
      sourceDigest: prepared.digest,
      candidateIdentity: command.candidateIdentity,
      promotionIdentity: prepared.promotion.promotionIdentity,
    };
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      draftIdentities: [...entry.draftIdentities, draftIdentity],
      openDraftIdentities: [...entry.openDraftIdentities, draftIdentity],
    };
    const result: LegacyQuestionCandidatePromoted = deepFreeze({
      kind: 'review.legacy-question-candidate.promoted',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      draftIdentity,
      draftRevision: 1,
      anchor,
      sourceIdentity: prepared.sourceIdentity,
      sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
      sourceDigest: prepared.digest,
      candidateIdentity: command.candidateIdentity,
      promotionIdentity: prepared.promotion.promotionIdentity,
      intent: 'question',
    });
    const draft: ReviewQuestionDraftPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      status: 'open',
      body: prepared.body,
      anchor,
      provenance,
    };
    return await this.#commit(command, normalized, result, [
      revisionedRecord(draftIdentity, entry.reviewIdentity, 'review.question-draft', 0, draft),
      this.#indexWrite(index, replaceCurrentReview(index.payload, nextEntry)),
      ...prepared.records,
    ]);
  }

  async #reviseDraft(
    command: ReviseReviewQuestionDraftCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) return this.#inactiveRejection(command, index);
    if (!entry.draftIdentities.includes(command.draftIdentity)) {
      return rejected(command, index.stateVersion, 'draft-not-found');
    }
    const [record] = await this.#readRecords([command.draftIdentity], false);
    if (record === undefined || record.kind !== 'review.question-draft' || record.recordClass !== 'revisioned') {
      throw new ReviewingStateProblem();
    }
    const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
    if (draft.status !== 'open') {
      return rejected(command, index.stateVersion, 'draft-not-open');
    }
    if (record.revision !== command.expectedDraftRevision) {
      return rejected(command, index.stateVersion, 'draft-revision-mismatch');
    }
    const anchor = await this.#resolveAnchor(entry, command.anchor);
    if (typeof anchor === 'string') {
      return rejected(command, index.stateVersion, anchor);
    }
    const result: ReviewQuestionDraftRevised = deepFreeze({
      kind: 'review.question-draft.revised',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      draftIdentity: command.draftIdentity,
      draftRevision: record.revision + 1,
      anchor,
    });
    return await this.#commit(command, normalized, result, [
      revisionedRecord(command.draftIdentity, entry.reviewIdentity, 'review.question-draft', record.revision, {
        ...draft,
        body: command.body,
        anchor,
      } satisfies ReviewQuestionDraftPayload),
    ]);
  }

  async #commitBatch(
    command: CommitReviewQuestionBatchCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) return this.#inactiveRejection(command, index);
    if (command.draftIdentities.length === 0) {
      return rejected(command, index.stateVersion, 'batch-empty');
    }
    if (
      entry.batchIdentities.length >= MAX_BATCHES ||
      entry.questionIdentities.length + command.draftIdentities.length > MAX_DRAFTS
    ) {
      return rejected(command, index.stateVersion, 'batch-limit-reached');
    }
    if (command.draftIdentities.some(identity => !entry.draftIdentities.includes(identity))) {
      return rejected(command, index.stateVersion, 'draft-not-found');
    }

    const snapshot = await this.#readSnapshot(entry);
    const verification = await this.#verifySnapshot(snapshot);
    if (verification !== 'current') {
      return await this.#snapshotRejection(
        command,
        index,
        verification === 'stale' ? 'snapshot-stale' : 'snapshot-unverified',
        [entry.reviewSnapshotIdentity],
      );
    }

    const draftRecords = await this.#readRecords(command.draftIdentities, false);
    const drafts = draftRecords.map(record => {
      if (record.kind !== 'review.question-draft' || record.recordClass !== 'revisioned') {
        throw new ReviewingStateProblem();
      }
      const draft = parseReviewQuestionDraft(decodeReviewingPayload(record.payload));
      if (
        draft.reviewIdentity !== entry.reviewIdentity ||
        draft.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity
      ) {
        throw new ReviewingStateProblem();
      }
      return { record, draft };
    });
    const closed = drafts.filter(item => item.draft.status !== 'open');
    if (closed.length > 0) {
      return rejected(
        command,
        index.stateVersion,
        'draft-not-open',
        closed.map(item => item.record.recordIdentity),
      );
    }

    const reviewBatchIdentity = occurrenceIdentity(
      'rbt',
      command.commandIdentity,
      'review-batch',
    ) as ReviewBatchIdentity;
    const questionIdentities = drafts.map(
      (item, ordinal) =>
        occurrenceIdentity(
          'qst',
          command.commandIdentity,
          `question:${ordinal}:${item.record.recordIdentity}`,
        ) as ReviewQuestionIdentity,
    );
    const committedDrafts = new Set(command.draftIdentities);
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      openDraftIdentities: entry.openDraftIdentities.filter(identity => !committedDrafts.has(identity)),
      batchIdentities: [...entry.batchIdentities, reviewBatchIdentity],
      questionIdentities: [...entry.questionIdentities, ...questionIdentities],
    };
    const result: ReviewQuestionBatchCommitted = deepFreeze({
      kind: 'review.question-batch.committed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      reviewBatchIdentity,
      questionIdentities,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
    });

    const questionRecords = drafts.map((item, ordinal) =>
      immutableRecord(questionIdentities[ordinal] as ReviewQuestionIdentity, entry.reviewIdentity, 'review.question', {
        formatVersion: 1,
        reviewIdentity: entry.reviewIdentity,
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reviewBatchIdentity,
        questionIdentity: questionIdentities[ordinal],
        draftIdentity: item.record.recordIdentity,
        intent: 'question',
        body: item.draft.body,
        anchor: item.draft.anchor,
        ordinal,
      }),
    );
    const draftWrites = drafts.map((item, ordinal) =>
      revisionedRecord(
        item.record.recordIdentity,
        entry.reviewIdentity,
        'review.question-draft',
        item.record.revision,
        {
          ...item.draft,
          status: 'committed',
          reviewBatchIdentity,
          questionIdentity: questionIdentities[ordinal] as ReviewQuestionIdentity,
        } satisfies ReviewQuestionDraftPayload,
      ),
    );

    return await this.#commit(command, normalized, result, [
      immutableRecord(reviewBatchIdentity, entry.reviewIdentity, 'review.question-batch', {
        formatVersion: 1,
        reviewIdentity: entry.reviewIdentity,
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reviewBatchIdentity,
        intent: 'question-only',
        questionIdentities,
      }),
      ...questionRecords,
      ...draftWrites,
      this.#indexWrite(index, replaceReview(index.payload, nextEntry)),
    ]);
  }

  async #setDisposition(
    command: SetReviewQuestionDispositionCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) return this.#inactiveRejection(command, index);
    if (!entry.questionIdentities.includes(command.questionIdentity)) {
      return rejected(command, index.stateVersion, 'question-not-found');
    }
    const dispositionIdentity = occurrenceIdentity(
      'dsp',
      command.commandIdentity,
      'human-disposition',
    ) as ReviewDispositionIdentity;
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      dispositionIdentities: [...entry.dispositionIdentities, dispositionIdentity],
      currentDispositions: [
        ...entry.currentDispositions.filter(item => item.questionIdentity !== command.questionIdentity),
        {
          questionIdentity: command.questionIdentity,
          dispositionIdentity,
          disposition: command.disposition,
        },
      ],
    };
    const result: ReviewQuestionDispositionRecorded = deepFreeze({
      kind: 'review.question.disposition-recorded',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      questionIdentity: command.questionIdentity,
      dispositionIdentity,
      disposition: command.disposition,
    });
    const disposition: ReviewDispositionPayload = {
      formatVersion: 1,
      reviewIdentity: entry.reviewIdentity,
      questionIdentity: command.questionIdentity,
      disposition: command.disposition,
      decidedBy: 'human',
      stateVersion: command.expectedStateVersion + 1,
    };
    return await this.#commit(command, normalized, result, [
      immutableRecord(dispositionIdentity, entry.reviewIdentity, 'review.question-disposition', disposition),
      this.#indexWrite(index, replaceReview(index.payload, nextEntry)),
    ]);
  }

  async #complete(
    command: CompleteReviewCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) return this.#inactiveRejection(command, index);
    if (entry.reviewPassIdentity === undefined) {
      return rejected(command, index.stateVersion, 'review-not-active');
    }

    const draftRecords = await this.#readRecords(entry.draftIdentities, false);
    const openDrafts = draftRecords.filter(record => {
      if (record.kind !== 'review.question-draft' || record.recordClass !== 'revisioned') {
        throw new ReviewingStateProblem();
      }
      return parseReviewQuestionDraft(decodeReviewingPayload(record.payload)).status === 'open';
    });
    if (openDrafts.length > 0) {
      return rejected(
        command,
        index.stateVersion,
        'open-draft-blocks-completion',
        openDrafts.map(record => record.recordIdentity),
      );
    }
    const mode = entry.questionIdentities.length === 0 ? 'no-findings' : 'normal';
    const dispositions = await this.#currentDispositions(entry);
    const undispositioned = entry.questionIdentities.filter(identity => !dispositions.has(identity));
    if (undispositioned.length > 0) {
      return rejected(command, index.stateVersion, 'undispositioned-question-blocks-completion', undispositioned);
    }
    const open = entry.questionIdentities.filter(
      identity => dispositions.get(identity)?.payload.disposition === 'open',
    );
    if (open.length > 0) {
      return rejected(command, index.stateVersion, 'open-question-blocks-completion', open);
    }

    const snapshot = await this.#readSnapshot(entry);
    const verification = await this.#verifySnapshot(snapshot);
    if (verification !== 'current') {
      return await this.#snapshotRejection(
        command,
        index,
        verification === 'stale' ? 'snapshot-stale' : 'snapshot-unverified',
        [entry.reviewSnapshotIdentity],
      );
    }

    const reviewResultIdentity = occurrenceIdentity(
      'rrs',
      command.commandIdentity,
      'review-result',
    ) as ReviewResultIdentity;
    const findings = entry.questionIdentities.map(questionIdentity => {
      const disposition = dispositions.get(questionIdentity);
      if (disposition === undefined) {
        throw new ReviewingStateProblem();
      }
      return {
        questionIdentity,
        ...(disposition === undefined
          ? {}
          : {
              dispositionIdentity: disposition.identity,
              disposition: disposition.payload.disposition,
            }),
      };
    });
    const completedAt = this.#timestamp();
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      status: 'completed',
      completedAt,
      resultIdentity: reviewResultIdentity,
    };
    const result: ReviewCompleted = deepFreeze({
      kind: 'review.completed',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      reviewPassIdentity: entry.reviewPassIdentity,
      reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
      reviewResultIdentity,
      mode,
    });
    return await this.#commit(command, normalized, result, [
      immutableRecord(reviewResultIdentity, entry.reviewIdentity, 'review.result', {
        formatVersion: 1,
        reviewIdentity: entry.reviewIdentity,
        reviewPassIdentity: entry.reviewPassIdentity,
        reviewSnapshotIdentity: entry.reviewSnapshotIdentity,
        reviewResultIdentity,
        completedAt,
        mode,
        findings,
      }),
      this.#indexWrite(index, replaceReview(index.payload, nextEntry)),
    ]);
  }

  async #currentDispositions(entry: ReviewIndexEntry): Promise<
    ReadonlyMap<
      ReviewQuestionIdentity,
      {
        readonly identity: ReviewDispositionIdentity;
        readonly payload: ReviewDispositionPayload;
      }
    >
  > {
    const records = await this.#readRecords(entry.dispositionIdentities, false);
    const current = new Map<
      ReviewQuestionIdentity,
      {
        readonly identity: ReviewDispositionIdentity;
        readonly payload: ReviewDispositionPayload;
      }
    >();
    records.forEach((record, index) => {
      if (record.kind !== 'review.question-disposition' || record.recordClass !== 'immutable') {
        throw new ReviewingStateProblem();
      }
      const payload = parseReviewDisposition(decodeReviewingPayload(record.payload));
      if (
        payload.reviewIdentity !== entry.reviewIdentity ||
        !entry.questionIdentities.includes(payload.questionIdentity)
      ) {
        throw new ReviewingStateProblem();
      }
      current.set(payload.questionIdentity, {
        identity: entry.dispositionIdentities[index] as ReviewDispositionIdentity,
        payload,
      });
    });
    return current;
  }

  async #cancel(
    command: CancelReviewCommand,
    normalized: string,
    index: LoadedReviewIndex,
  ): Promise<ReviewingCommandResult> {
    const entry = activeReview(index.payload, command.reviewIdentity);
    if (entry === undefined) return this.#inactiveRejection(command, index);
    const cancellationIdentity = occurrenceIdentity('rcl', command.commandIdentity, 'review-cancellation');
    const cancelledAt = this.#timestamp();
    const nextEntry: ReviewIndexEntry = {
      ...entry,
      status: 'cancelled',
      cancelledAt,
      cancellationIdentity,
    };
    const result: ReviewCancelled = deepFreeze({
      kind: 'review.cancelled',
      status: 'accepted',
      commandIdentity: command.commandIdentity,
      stateVersion: command.expectedStateVersion + 1,
      reviewIdentity: entry.reviewIdentity,
      cancellationIdentity,
    });
    return await this.#commit(command, normalized, result, [
      immutableRecord(cancellationIdentity, entry.reviewIdentity, 'review.cancellation', {
        formatVersion: 1,
        reviewIdentity: entry.reviewIdentity,
        cancellationIdentity,
        cancelledAt,
        preservedDraftIdentities: entry.draftIdentities,
        preservedBatchIdentities: entry.batchIdentities,
        preservedQuestionIdentities: entry.questionIdentities,
        preservedDispositionIdentities: entry.dispositionIdentities,
      }),
      this.#indexWrite(index, replaceReview(index.payload, nextEntry)),
    ]);
  }

  #timestamp(): string {
    const value = this.#now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new ReviewingStateProblem();
    }
    return value.toISOString();
  }

  #inactiveRejection(
    command: ReviewingCommand & { readonly reviewIdentity: ReviewIdentity },
    index: LoadedReviewIndex,
  ): ReviewingCommandRejected {
    const existing = index.payload.reviews.find(entry => entry.reviewIdentity === command.reviewIdentity);
    return rejected(command, index.stateVersion, existing === undefined ? 'review-not-found' : 'review-not-active');
  }
}
