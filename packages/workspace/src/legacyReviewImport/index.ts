import path from 'node:path';
import type { AuthoritativeState, StateCommitResult, StateRecordWrite } from '../authoritativeState.js';
import {
  captureLegacyReviewSource,
  recognizeLegacyReviewSourceBytes,
  type LegacyReviewSourceCaptured,
  type LegacyReviewSourceResult,
  type LegacyReviewSourceTestControl,
  type LegacyReviewSourceUnavailableReason,
} from '../legacyReviewSource.js';
import { deepFreeze, hasOnlyKeys, isRecord } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type { WorkspaceIdentity } from '../workspace.js';

import {
  LEGACY_ID_WINDOW_BYTES,
  LEGACY_PATH_WINDOW_BYTES,
  MAX_LEGACY_CANDIDATE_EXCERPT_PAGE_BYTES,
  MAX_LEGACY_CANDIDATE_TEXT_PAGE_BYTES,
  MAX_LEGACY_QUEUE_CANDIDATES,
  MAX_LEGACY_RECEIPT_BATCH_ANNOTATIONS,
  MAX_LEGACY_RECEIPT_HISTORY_BATCHES,
  MAX_MOVED_RECEIPT_SOURCES,
  MAX_MOVED_RECEIPT_WORKSPACE_PATHS,
} from './limits.js';
import { decode, encode } from './utils.js';
import {
  LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
  LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
  LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
  LEGACY_REVIEW_SOURCES_PROJECTION_VERSION,
  MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES,
  type AssociateAndImportMovedLegacyReceiptSourceCommand,
  type ImportLegacyReviewSourceCommand,
  type LegacyReviewCandidateDecisionIdentity,
  type LegacyReviewCandidatePromotionIdentity,
  type LegacyReviewCommand,
  type LegacyReviewCommandAccepted,
  type LegacyReviewCommandResult,
  type LegacyReviewImportView,
  type LegacyReviewMovedReceiptMigrationStatus,
  type LegacyReviewMovedReceiptSourceAssociatedAndImported,
  type LegacyReviewMovedReceiptSourceSummary,
  type LegacyReviewMovedReceiptSourceUnavailableReason,
  type LegacyReviewMovedReceiptSourceUnavailableView,
  type LegacyReviewMovedReceiptSourceView,
  type LegacyReviewMovedReceiptSourceViewRequest,
  type LegacyReviewMovedReceiptSourcesView,
  type LegacyReviewMovedReceiptSourcesViewRequest,
  type LegacyReviewMovedSourceAssociationIdentity,
  type LegacyReviewQueueCandidateDecision,
  type LegacyReviewQueueCandidateDecisionRecorded,
  type LegacyReviewQueueCandidateIdentity,
  type LegacyReviewQueueCandidatePromotionSummary,
  type LegacyReviewQueueCandidateView,
  type LegacyReviewQueueCandidateViewRequest,
  type LegacyReviewQueueCandidatesView,
  type LegacyReviewQueueCandidatesViewRequest,
  type LegacyReviewQueueRecognitionSummary,
  type LegacyReviewQueueSourceSlot,
  type LegacyReviewReceiptBatchView,
  type LegacyReviewReceiptBatchViewRequest,
  type LegacyReviewReceiptHistoryView,
  type LegacyReviewReceiptHistoryViewRequest,
  type LegacyReviewReceiptRecognitionSummary,
  type LegacyReviewReceiptSourceSlot,
  type LegacyReviewRecognitionFailure,
  type LegacyReviewSourceDecisionIdentity,
  type LegacyReviewSourceDecisionRecorded,
  type LegacyReviewSourceImported,
  type LegacyReviewSourceOccurrenceIdentity,
  type LegacyReviewUtf8TextPage,
  type PrepareLegacyQuestionCandidatePromotionRequest,
  type PreparedLegacyQuestionCandidatePromotion,
  type SetLegacyReviewQueueCandidateDecisionCommand,
  type SetLegacyReviewSourceDecisionCommand,
  type ValidateLegacyQuestionCandidatePromotionRequest,
  type ValidatedLegacyQuestionCandidatePromotion,
} from './contracts.js';
import {
  LegacyReviewImportStateProblem,
  type LegacyImportedSourceLoad,
  type LegacyQueueCandidatesLoad,
  type LegacyReceiptHistoryLoad,
  type LegacyReviewCandidateDecisionIndexEntry,
  type LegacyReviewCandidateDecisionPayload,
  type LegacyReviewCandidatePromotionIndexEntry,
  type LegacyReviewCandidatePromotionPayload,
  type LegacyReviewCommandRecordPayload,
  type LegacyReviewImportIndexEntry,
  type LegacyReviewImportIndexPayload,
  type LegacyReviewMovedReceiptLocator,
  type LegacyReviewMovedReceiptLocatorSearch,
  type LegacyReviewMovedSourceAssociationIndexEntry,
  type LegacyReviewMovedSourceAssociationPayload,
  type LegacyReviewSourceDecisionIndexEntry,
  type LegacyReviewSourceDecisionPayload,
  type LegacyReviewSourceDescriptor,
  type LegacyReviewSourceOccurrencePayload,
  type LoadedLegacyQueueCandidates,
  type LoadedLegacyReviewImportIndex,
} from './internalTypes.js';
import {
  LEGACY_QUEUE_CANDIDATE_DISCLOSURE,
  LEGACY_RECEIPT_HISTORY_DISCLOSURE,
  candidateAnchorHint,
  queueCandidateSummary,
  receiptAnnotation,
  receiptBatchSummary,
  textPage,
  textWindow,
} from './projections.js';
import { immutableRecord, revisionedRecord } from './records.js';
import {
  legacyReviewCandidateDecisionIdentity,
  legacyReviewCandidatePromotionIdentity,
  legacyReviewImportCommandRecordIdentity,
  legacyReviewImportIndexIdentity,
  legacyReviewMovedSourceAssociationIdentity,
  legacyReviewQueueCandidateIdentity,
  legacyReviewSourceDecisionIdentity,
  legacyReviewSourceOccurrenceIdentity,
  legacyReviewStateDirectory,
} from './identities.js';
import {
  distinctLegacyWorkspacePaths,
  inspectMovedReceiptDirectory,
  movedReceiptDescriptor,
  movedRecognitionSummary,
  movedSearchSummary,
  recognitionSummary,
  sourceDescriptors,
} from './sources.js';
import {
  parseCandidateDecision,
  parseCandidatePromotion,
  parseDecision,
  parseIndex,
  parseMovedSourceAssociation,
  parseOccurrence,
} from './parsing.js';
import {
  normalizeCommand,
  normalizeMovedReceiptSourceRequest,
  normalizeMovedReceiptSourcesRequest,
  normalizeQueueCandidateRequest,
  normalizeQueueCandidatesRequest,
  normalizeReceiptBatchRequest,
  normalizeReceiptHistoryRequest,
} from './normalization.js';
import { normalizedCommand, parseResult, rejected } from './commands.js';
import { fileObservation, movedReceiptSourceSummary, pathFailure } from './observations.js';

export {
  LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
  LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
  LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
  LEGACY_REVIEW_SOURCES_PROJECTION_VERSION,
  MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES,
} from './contracts.js';
export type {
  AssociateAndImportMovedLegacyReceiptSourceCommand,
  ImportLegacyReviewSourceCommand,
  LegacyQuestionCandidatePromotionPreparationRejectionReason,
  LegacyReviewCandidateDecisionIdentity,
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewCommand,
  LegacyReviewCommandAccepted,
  LegacyReviewCommandRejected,
  LegacyReviewCommandRejectionReason,
  LegacyReviewCommandResult,
  LegacyReviewImportView,
  LegacyReviewImportViewFor,
  LegacyReviewImportViewRequest,
  LegacyReviewMovedReceiptCommandRejectionReason,
  LegacyReviewMovedReceiptMigrationStatus,
  LegacyReviewMovedReceiptRecognitionSummary,
  LegacyReviewMovedReceiptSearch,
  LegacyReviewMovedReceiptSearchSummary,
  LegacyReviewMovedReceiptSearchUnavailableReason,
  LegacyReviewMovedReceiptSourceAssociatedAndImported,
  LegacyReviewMovedReceiptSourceAvailableView,
  LegacyReviewMovedReceiptSourceObservation,
  LegacyReviewMovedReceiptSourceSummary,
  LegacyReviewMovedReceiptSourceUnavailableReason,
  LegacyReviewMovedReceiptSourceUnavailableView,
  LegacyReviewMovedReceiptSourceView,
  LegacyReviewMovedReceiptSourceViewRequest,
  LegacyReviewMovedReceiptSourcesAvailableView,
  LegacyReviewMovedReceiptSourcesUnavailableView,
  LegacyReviewMovedReceiptSourcesView,
  LegacyReviewMovedReceiptSourcesViewRequest,
  LegacyReviewMovedSourceAssociationIdentity,
  LegacyReviewProjectedHarnessOutcome,
  LegacyReviewProjectedQueueDisposition,
  LegacyReviewProjectedQueueReason,
  LegacyReviewQueueCandidateAvailableView,
  LegacyReviewQueueCandidateCommandRejected,
  LegacyReviewQueueCandidateCommandRejectionReason,
  LegacyReviewQueueCandidateDecision,
  LegacyReviewQueueCandidateDecisionRecorded,
  LegacyReviewQueueCandidateDisclosure,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewQueueCandidatePromotionSummary,
  LegacyReviewQueueCandidateSummary,
  LegacyReviewQueueCandidateUnavailableView,
  LegacyReviewQueueCandidateView,
  LegacyReviewQueueCandidateViewRequest,
  LegacyReviewQueueCandidatesAvailableView,
  LegacyReviewQueueCandidatesUnavailableView,
  LegacyReviewQueueCandidatesView,
  LegacyReviewQueueCandidatesViewRequest,
  LegacyReviewQueueProjectionUnavailableReason,
  LegacyReviewQueueRecognitionSummary,
  LegacyReviewQueueSourceObservation,
  LegacyReviewQueueSourceSlot,
  LegacyReviewReceiptAnnotation,
  LegacyReviewReceiptBatchAvailableView,
  LegacyReviewReceiptBatchSummary,
  LegacyReviewReceiptBatchUnavailableView,
  LegacyReviewReceiptBatchView,
  LegacyReviewReceiptBatchViewRequest,
  LegacyReviewReceiptHarnessSummary,
  LegacyReviewReceiptHistoryAvailableView,
  LegacyReviewReceiptHistoryDisclosure,
  LegacyReviewReceiptHistoryUnavailableView,
  LegacyReviewReceiptHistoryView,
  LegacyReviewReceiptHistoryViewRequest,
  LegacyReviewReceiptProjectionUnavailableReason,
  LegacyReviewReceiptRecognitionSummary,
  LegacyReviewReceiptSourceObservation,
  LegacyReviewReceiptSourceSlot,
  LegacyReviewRecognitionFailure,
  LegacyReviewSourceCommandRejected,
  LegacyReviewSourceCommandRejectionReason,
  LegacyReviewSourceDecision,
  LegacyReviewSourceDecisionIdentity,
  LegacyReviewSourceDecisionRecorded,
  LegacyReviewSourceFileObservation,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceImported,
  LegacyReviewSourceLocation,
  LegacyReviewSourceMigrationStatus,
  LegacyReviewSourceOccurrenceIdentity,
  LegacyReviewSourcePathFailure,
  LegacyReviewSourcesView,
  LegacyReviewSourcesViewRequest,
  LegacyReviewTextWindow,
  LegacyReviewUtf8TextPage,
  PrepareLegacyQuestionCandidatePromotionRequest,
  PreparedLegacyQuestionCandidatePromotion,
  SetLegacyReviewQueueCandidateDecisionCommand,
  SetLegacyReviewSourceDecisionCommand,
  ValidateLegacyQuestionCandidatePromotionRequest,
  ValidatedLegacyQuestionCandidatePromotion,
} from './contracts.js';
export {
  legacyReviewCandidateDecisionIdentity,
  legacyReviewCandidatePromotionIdentity,
  legacyReviewImportCommandRecordIdentity,
  legacyReviewImportIndexIdentity,
  legacyReviewMovedSourceAssociationIdentity,
  legacyReviewQueueCandidateIdentity,
  legacyReviewSourceDecisionIdentity,
  legacyReviewSourceOccurrenceIdentity,
  legacyReviewStateDirectory,
} from './identities.js';

export interface LegacyReviewImportOwnerOptions {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly state: AuthoritativeState;
  readonly legacyStateDirectory?: string;
  /** Package-private deterministic aggregate index bound for contract tests. */
  readonly maximumOccurrences?: number;
  /** Package-private source-race seam inherited from exact capture. */
  readonly sourceTestControl?: LegacyReviewSourceTestControl;
}

/**
 * Private legacy Reviewing import owner. One small Workspace read/execute
 * vocabulary plus one Reviewing-owned internal transition seam hides locators,
 * capture, parsing, durable evidence, and recall.
 */
export class LegacyReviewImportOwner {
  readonly #workspaceIdentity: WorkspaceIdentity;
  readonly #state: AuthoritativeState;
  readonly #indexIdentity: string;
  readonly #sources: readonly [LegacyReviewSourceDescriptor, LegacyReviewSourceDescriptor];
  readonly #legacyStateRoot: string;
  readonly #currentCheckoutHash: string;
  readonly #maximumOccurrences: number;
  readonly #sourceTestControl: LegacyReviewSourceTestControl;

  constructor(options: LegacyReviewImportOwnerOptions) {
    if (
      options.maximumOccurrences !== undefined &&
      (!Number.isSafeInteger(options.maximumOccurrences) ||
        options.maximumOccurrences < 1 ||
        options.maximumOccurrences > MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES)
    ) {
      throw new TypeError('Legacy Review occurrence bound is invalid');
    }
    this.#workspaceIdentity = options.workspaceIdentity;
    this.#state = options.state;
    this.#indexIdentity = legacyReviewImportIndexIdentity(options.workspaceIdentity);
    this.#legacyStateRoot = path.resolve(options.legacyStateDirectory ?? legacyReviewStateDirectory());
    this.#currentCheckoutHash = sha256(options.canonicalCheckout);
    this.#sources = sourceDescriptors(options.canonicalCheckout, this.#legacyStateRoot);
    this.#maximumOccurrences = options.maximumOccurrences ?? MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES;
    this.#sourceTestControl = options.sourceTestControl ?? {};
  }

  async read(value: unknown): Promise<LegacyReviewImportView> {
    if (!isRecord(value)) {
      throw new TypeError('Invalid legacy Review view request');
    }
    if (value.kind === 'legacy-review.receipt-history') {
      return await this.#readReceiptHistory(normalizeReceiptHistoryRequest(value));
    }
    if (value.kind === 'legacy-review.receipt-batch') {
      return await this.#readReceiptBatch(normalizeReceiptBatchRequest(value));
    }
    if (value.kind === 'legacy-review.queue-candidates') {
      return await this.#readQueueCandidates(normalizeQueueCandidatesRequest(value));
    }
    if (value.kind === 'legacy-review.queue-candidate') {
      return await this.#readQueueCandidate(normalizeQueueCandidateRequest(value));
    }
    if (value.kind === 'legacy-review.moved-receipt-sources') {
      return await this.#readMovedReceiptSources(normalizeMovedReceiptSourcesRequest(value));
    }
    if (value.kind === 'legacy-review.moved-receipt-source') {
      return await this.#readMovedReceiptSource(normalizeMovedReceiptSourceRequest(value));
    }
    if (!hasOnlyKeys(value, ['kind']) || value.kind !== 'legacy-review.sources') {
      throw new TypeError('Invalid legacy Review discovery request');
    }
    const index = await this.#loadIndex();
    const [queue, receipts] = await Promise.all([this.#capture(this.#sources[0]), this.#capture(this.#sources[1])]);
    const occurrenceReferences: LegacyReviewImportIndexEntry[] = [];
    const decisionReferences: LegacyReviewSourceDecisionIndexEntry[] = [];
    for (const { descriptor, result } of [queue, receipts]) {
      if (result.status !== 'captured') continue;
      const exactOccurrence = index.payload.occurrences.find(
        entry =>
          entry.sourceIdentity === descriptor.sourceIdentity &&
          entry.sourceKind === descriptor.sourceKind &&
          entry.digest === result.digest,
      );
      if (exactOccurrence !== undefined) {
        occurrenceReferences.push(exactOccurrence);
        continue;
      }
      const exactDecision = index.payload.decisions.find(
        entry =>
          entry.sourceIdentity === descriptor.sourceIdentity &&
          entry.sourceKind === descriptor.sourceKind &&
          entry.digest === result.digest,
      );
      if (exactDecision !== undefined) {
        decisionReferences.push(exactDecision);
        continue;
      }
      const priorOccurrence = index.payload.occurrences.find(
        entry => entry.sourceIdentity === descriptor.sourceIdentity && entry.sourceKind === descriptor.sourceKind,
      );
      if (priorOccurrence !== undefined) {
        occurrenceReferences.push(priorOccurrence);
        continue;
      }
      const priorDecision = [...index.payload.decisions]
        .reverse()
        .find(
          entry => entry.sourceIdentity === descriptor.sourceIdentity && entry.sourceKind === descriptor.sourceKind,
        );
      if (priorDecision !== undefined) decisionReferences.push(priorDecision);
    }
    await Promise.all([
      ...occurrenceReferences.map(async entry => this.#validateExistingOccurrence(entry)),
      ...decisionReferences.map(async entry => this.#validateExistingDecision(entry)),
    ]);
    const queueSlot: LegacyReviewQueueSourceSlot =
      queue.result.status === 'captured'
        ? {
            sourceIdentity: queue.descriptor.sourceIdentity,
            sourceKind: 'queue',
            location: 'current-checkout',
            sourcePath: queue.result.sourcePath,
            observation: {
              ...fileObservation(queue.descriptor, queue.result, index.payload),
              recognition: recognitionSummary(queue.result.sourceKind, queue.result.recognition) as
                | LegacyReviewQueueRecognitionSummary
                | LegacyReviewRecognitionFailure,
            },
          }
        : {
            sourceIdentity: queue.descriptor.sourceIdentity,
            sourceKind: 'queue',
            location: 'current-checkout',
            sourcePath: queue.result.sourcePath,
            observation: pathFailure(queue.result),
          };
    const receiptSlot: LegacyReviewReceiptSourceSlot =
      receipts.result.status === 'captured'
        ? {
            sourceIdentity: receipts.descriptor.sourceIdentity,
            sourceKind: 'receipts',
            location: 'current-legacy-state',
            sourcePath: receipts.result.sourcePath,
            observation: {
              ...fileObservation(receipts.descriptor, receipts.result, index.payload),
              recognition: recognitionSummary(receipts.result.sourceKind, receipts.result.recognition) as
                | LegacyReviewReceiptRecognitionSummary
                | LegacyReviewRecognitionFailure,
            },
          }
        : {
            sourceIdentity: receipts.descriptor.sourceIdentity,
            sourceKind: 'receipts',
            location: 'current-legacy-state',
            sourcePath: receipts.result.sourcePath,
            observation: pathFailure(receipts.result),
          };
    return deepFreeze({
      kind: 'legacy-review.sources',
      projectionVersion: LEGACY_REVIEW_SOURCES_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      sources: [queueSlot, receiptSlot],
    });
  }

  /** Package-private preparation for one Reviewing-owned atomic transition. */
  async prepareQuestionCandidatePromotion(
    request: PrepareLegacyQuestionCandidatePromotionRequest,
  ): Promise<PreparedLegacyQuestionCandidatePromotion> {
    const loaded = await this.#loadQueueCandidates(request.sourceOccurrenceIdentity);
    if (loaded.stateVersion !== request.expectedStateVersion) {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'state-version-mismatch',
      };
    }
    if (loaded.status === 'unavailable') {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason:
          loaded.reason === 'source-not-imported' ? 'source-occurrence-not-imported' : 'candidate-source-unavailable',
      };
    }
    if (loaded.entry.digest !== request.expectedSourceDigest) {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'candidate-source-digest-mismatch',
      };
    }
    const annotation = loaded.queue.annotations.find(
      candidate =>
        legacyReviewQueueCandidateIdentity(
          this.#workspaceIdentity,
          loaded.entry.sourceOccurrenceIdentity,
          candidate.id,
        ) === request.candidateIdentity,
    );
    if (annotation === undefined) {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'candidate-not-found',
      };
    }
    if (annotation.kind !== 'question') {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'candidate-intent-unsupported',
      };
    }
    await this.#loadCandidateDecisionStatuses(loaded, [request.candidateIdentity]);
    const existing = loaded.promotions.find(entry => entry.candidateIdentity === request.candidateIdentity);
    if (existing !== undefined) {
      await this.#validateExistingCandidatePromotion(existing, loaded.entry);
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'candidate-already-promoted',
      };
    }
    const promotionIdentity = legacyReviewCandidatePromotionIdentity(
      this.#workspaceIdentity,
      loaded.entry.sourceOccurrenceIdentity,
      request.candidateIdentity,
    );
    if ((await this.#readCandidatePromotion(promotionIdentity)) !== undefined) {
      throw new LegacyReviewImportStateProblem();
    }
    if (
      loaded.index.occurrences.length +
        loaded.index.decisions.length +
        (loaded.index.candidateDecisions?.length ?? 0) +
        (loaded.index.movedSourceAssociations?.length ?? 0) +
        (loaded.index.candidatePromotions?.length ?? 0) +
        1 >
      this.#maximumOccurrences
    ) {
      return {
        status: 'rejected',
        stateVersion: loaded.stateVersion,
        reason: 'candidate-promotion-limit',
      };
    }
    const promotion: LegacyReviewQueueCandidatePromotionSummary = {
      promotionIdentity,
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      draftIdentity: request.draftIdentity,
      intent: 'question',
    };
    const entry: LegacyReviewCandidatePromotionIndexEntry = {
      promotionIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      sourceIdentity: loaded.entry.sourceIdentity,
      digest: loaded.entry.digest,
      candidateIdentity: request.candidateIdentity,
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      draftIdentity: request.draftIdentity,
      intent: 'question',
    };
    const nextIndex: LegacyReviewImportIndexPayload = {
      formatVersion: 1,
      occurrences: loaded.index.occurrences,
      decisions: loaded.index.decisions,
      ...(loaded.index.candidateDecisions === undefined ? {} : { candidateDecisions: loaded.index.candidateDecisions }),
      ...(loaded.index.movedSourceAssociations === undefined
        ? {}
        : {
            movedSourceAssociations: loaded.index.movedSourceAssociations,
          }),
      candidatePromotions: [...(loaded.index.candidatePromotions ?? []), entry],
    };
    const payload: LegacyReviewCandidatePromotionPayload = {
      formatVersion: 1,
      promotionIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      candidateIdentity: request.candidateIdentity,
      reviewIdentity: request.reviewIdentity,
      reviewSnapshotIdentity: request.reviewSnapshotIdentity,
      draftIdentity: request.draftIdentity,
      intent: 'question',
      promotionCommandIdentity: request.commandIdentity,
      promotedStateVersion: request.expectedStateVersion + 1,
    };
    return {
      status: 'prepared',
      stateVersion: loaded.stateVersion,
      sourceIdentity: loaded.entry.sourceIdentity,
      digest: loaded.entry.digest,
      body: annotation.text,
      promotion,
      records: [
        immutableRecord(promotionIdentity, this.#indexIdentity, 'legacy-review.candidate-promotion', payload),
        revisionedRecord(this.#indexIdentity, loaded.indexRevision, nextIndex),
      ],
    };
  }

  /** Package-private recall validation; throws rather than inventing authority. */
  async validateQuestionCandidatePromotion(
    request: ValidateLegacyQuestionCandidatePromotionRequest,
  ): Promise<ValidatedLegacyQuestionCandidatePromotion> {
    const loaded = await this.#loadQueueCandidates(request.sourceOccurrenceIdentity);
    if (
      loaded.status === 'unavailable' ||
      loaded.entry.sourceIdentity !== request.sourceIdentity ||
      loaded.entry.digest !== request.digest
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const annotation = loaded.queue.annotations.find(
      candidate =>
        legacyReviewQueueCandidateIdentity(
          this.#workspaceIdentity,
          loaded.entry.sourceOccurrenceIdentity,
          candidate.id,
        ) === request.candidateIdentity,
    );
    const entry = loaded.promotions.find(candidate => candidate.candidateIdentity === request.candidateIdentity);
    if (annotation?.kind !== 'question' || entry === undefined) {
      throw new LegacyReviewImportStateProblem();
    }
    await this.#loadCandidateDecisionStatuses(loaded, [request.candidateIdentity]);
    const promotion = await this.#validateExistingCandidatePromotion(entry, loaded.entry);
    if (
      promotion.promotionIdentity !== request.promotionIdentity ||
      promotion.reviewIdentity !== request.reviewIdentity ||
      promotion.reviewSnapshotIdentity !== request.reviewSnapshotIdentity ||
      promotion.draftIdentity !== request.draftIdentity ||
      promotion.promotionCommandIdentity !== request.commandIdentity ||
      promotion.promotedStateVersion !== request.promotedStateVersion
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      body: annotation.text,
      promotion: {
        promotionIdentity: promotion.promotionIdentity,
        reviewIdentity: promotion.reviewIdentity,
        reviewSnapshotIdentity: promotion.reviewSnapshotIdentity,
        draftIdentity: promotion.draftIdentity,
        intent: 'question',
      },
    };
  }

  async #readMovedReceiptSources(
    request: LegacyReviewMovedReceiptSourcesViewRequest,
  ): Promise<LegacyReviewMovedReceiptSourcesView> {
    const index = await this.#loadIndex();
    const search = movedSearchSummary(request.search);
    if (request.sourceLimit > MAX_MOVED_RECEIPT_SOURCES) {
      return deepFreeze({
        kind: 'legacy-review.moved-receipt-sources',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        search,
        reason: 'projection-limit',
      });
    }
    const located: LegacyReviewMovedReceiptLocatorSearch =
      request.search.kind === 'legacy-state-directory'
        ? await inspectMovedReceiptDirectory(this.#legacyStateRoot, this.#currentCheckoutHash)
        : {
            status: 'available',
            locators:
              sha256(request.search.exactFormerCanonicalCheckout) === this.#currentCheckoutHash
                ? []
                : [movedReceiptDescriptor(this.#legacyStateRoot, sha256(request.search.exactFormerCanonicalCheckout))],
          };
    if (located.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.moved-receipt-sources',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        search,
        reason: located.reason,
      });
    }
    const selected = located.locators.slice(request.sourceOffset, request.sourceOffset + request.sourceLimit);
    const sources: LegacyReviewMovedReceiptSourceSummary[] = [];
    for (const locator of selected) {
      const result = await captureLegacyReviewSource(locator.descriptor.request, this.#sourceTestControl);
      sources.push(
        movedReceiptSourceSummary(
          locator,
          result,
          result.status === 'captured'
            ? await this.#movedReceiptMigrationStatus(locator, result.digest, index.payload)
            : { status: 'unassociated' },
        ),
      );
    }
    return deepFreeze({
      kind: 'legacy-review.moved-receipt-sources',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      search,
      totalSources: located.locators.length,
      sourceOffset: request.sourceOffset,
      sources,
    });
  }

  async #readMovedReceiptSource(
    request: LegacyReviewMovedReceiptSourceViewRequest,
  ): Promise<LegacyReviewMovedReceiptSourceView> {
    const index = await this.#loadIndex();
    const unavailable = (
      reason: LegacyReviewMovedReceiptSourceUnavailableReason,
      details: {
        readonly sourceFailure?: Exclude<LegacyReviewSourceUnavailableReason, 'missing'>;
        readonly recognition?: LegacyReviewRecognitionFailure;
      } = {},
    ): LegacyReviewMovedReceiptSourceUnavailableView =>
      deepFreeze({
        kind: 'legacy-review.moved-receipt-source',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        sourceIdentity: request.sourceIdentity,
        legacyCheckoutHash: request.legacyCheckoutHash,
        reason,
        ...(details.sourceFailure === undefined ? {} : { sourceFailure: details.sourceFailure }),
        ...(details.recognition === undefined ? {} : { recognition: details.recognition }),
      });
    if (request.legacyWorkspacePathLimit > MAX_MOVED_RECEIPT_WORKSPACE_PATHS) {
      return unavailable('projection-limit');
    }
    if (request.legacyCheckoutHash === this.#currentCheckoutHash) {
      return unavailable('current-source-ineligible');
    }
    const locator = movedReceiptDescriptor(this.#legacyStateRoot, request.legacyCheckoutHash);
    if (locator.descriptor.sourceIdentity !== request.sourceIdentity) {
      return unavailable('source-identity-mismatch');
    }
    const result = await captureLegacyReviewSource(locator.descriptor.request, this.#sourceTestControl);
    if (result.status === 'unavailable') {
      return result.reason === 'missing'
        ? unavailable('source-missing')
        : unavailable('source-unavailable', {
            sourceFailure: result.reason,
          });
    }
    const migration = await this.#movedReceiptMigrationStatus(locator, result.digest, index.payload);
    const recognition = movedRecognitionSummary(result.recognition);
    if (recognition.status === 'unrecognized') {
      return unavailable('source-unrecognized', { recognition });
    }
    if (result.recognition.status !== 'recognized' || result.recognition.format !== 'receipts-v1') {
      throw new LegacyReviewImportStateProblem();
    }
    const paths = distinctLegacyWorkspacePaths(result.recognition);
    const selectedPaths = paths.slice(
      request.legacyWorkspacePathOffset,
      request.legacyWorkspacePathOffset + request.legacyWorkspacePathLimit,
    );
    return deepFreeze({
      kind: 'legacy-review.moved-receipt-source',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_MOVED_RECEIPT_PROJECTION_VERSION,
      stateVersion: index.stateVersion,
      sourceIdentity: locator.descriptor.sourceIdentity,
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      legacyCheckoutHash: locator.legacyCheckoutHash,
      legacyReceiptPath: textWindow(result.sourcePath, LEGACY_PATH_WINDOW_BYTES),
      byteLength: result.byteLength,
      digest: result.digest,
      mode: result.metadata.mode,
      modifiedNanoseconds: result.metadata.modifiedNanoseconds,
      changedNanoseconds: result.metadata.changedNanoseconds,
      migration,
      recognition,
      totalLegacyWorkspacePaths: paths.length,
      legacyWorkspacePathOffset: request.legacyWorkspacePathOffset,
      legacyWorkspacePaths: selectedPaths.map(value => textWindow(value, LEGACY_PATH_WINDOW_BYTES)),
      omittedLegacyWorkspacePathsBefore: Math.min(request.legacyWorkspacePathOffset, paths.length),
      omittedLegacyWorkspacePathsAfter: Math.max(
        0,
        paths.length - request.legacyWorkspacePathOffset - selectedPaths.length,
      ),
    });
  }

  async #readQueueCandidates(
    request: LegacyReviewQueueCandidatesViewRequest,
  ): Promise<LegacyReviewQueueCandidatesView> {
    if (request.candidateLimit > MAX_LEGACY_QUEUE_CANDIDATES) {
      const index = await this.#loadIndex();
      return deepFreeze({
        kind: 'legacy-review.queue-candidates',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'projection-limit',
      });
    }
    const loaded = await this.#loadQueueCandidates(request.sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.queue-candidates',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: loaded.reason,
      });
    }
    const selected = loaded.queue.annotations.slice(
      request.candidateOffset,
      request.candidateOffset + request.candidateLimit,
    );
    const identities = selected.map(annotation =>
      legacyReviewQueueCandidateIdentity(this.#workspaceIdentity, loaded.entry.sourceOccurrenceIdentity, annotation.id),
    );
    const [decisions, promotions] = await Promise.all([
      this.#loadCandidateDecisionStatuses(loaded, identities),
      this.#loadCandidatePromotionStatuses(loaded, identities),
    ]);
    const candidates = selected.map((annotation, index) => {
      const candidateIdentity = identities[index];
      if (candidateIdentity === undefined) {
        throw new LegacyReviewImportStateProblem();
      }
      const promotion = promotions.get(candidateIdentity);
      return queueCandidateSummary(
        this.#workspaceIdentity,
        loaded.entry.sourceOccurrenceIdentity,
        annotation,
        request.candidateOffset + index,
        promotion === undefined ? (decisions.get(candidateIdentity) ?? 'undecided') : 'promoted',
        promotion,
      );
    });
    return deepFreeze({
      kind: 'legacy-review.queue-candidates',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
      stateVersion: loaded.stateVersion,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      legacySourceFormat: loaded.format,
      disclosure: LEGACY_QUEUE_CANDIDATE_DISCLOSURE,
      totalCandidates: loaded.queue.annotations.length,
      candidateOffset: request.candidateOffset,
      candidates,
    });
  }

  async #readQueueCandidate(request: LegacyReviewQueueCandidateViewRequest): Promise<LegacyReviewQueueCandidateView> {
    if (
      request.textUtf8Limit > MAX_LEGACY_CANDIDATE_TEXT_PAGE_BYTES ||
      request.excerptUtf8Limit > MAX_LEGACY_CANDIDATE_EXCERPT_PAGE_BYTES
    ) {
      const index = await this.#loadIndex();
      return deepFreeze({
        kind: 'legacy-review.queue-candidate',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'projection-limit',
      });
    }
    const loaded = await this.#loadQueueCandidates(request.sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.queue-candidate',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: loaded.reason,
      });
    }
    const candidateAbsolute = loaded.queue.annotations.findIndex(
      annotation =>
        legacyReviewQueueCandidateIdentity(
          this.#workspaceIdentity,
          loaded.entry.sourceOccurrenceIdentity,
          annotation.id,
        ) === request.candidateIdentity,
    );
    const annotation = loaded.queue.annotations[candidateAbsolute];
    if (candidateAbsolute < 0 || annotation === undefined) {
      return deepFreeze({
        kind: 'legacy-review.queue-candidate',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'candidate-not-found',
      });
    }
    const [decisions, promotions] = await Promise.all([
      this.#loadCandidateDecisionStatuses(loaded, [request.candidateIdentity]),
      this.#loadCandidatePromotionStatuses(loaded, [request.candidateIdentity]),
    ]);
    const promotion = promotions.get(request.candidateIdentity);
    const migrationDecision =
      promotion === undefined ? (decisions.get(request.candidateIdentity) ?? 'undecided') : 'promoted';
    const text = textPage(annotation.text, request.textUtf8Offset, request.textUtf8Limit);
    if (text.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.queue-candidate',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: text.reason === 'out-of-range' ? 'text-offset-out-of-range' : 'text-offset-not-scalar-boundary',
      });
    }
    let excerpt: LegacyReviewUtf8TextPage | undefined;
    if (annotation.excerpt === undefined) {
      if (request.excerptUtf8Offset !== 0) {
        return deepFreeze({
          kind: 'legacy-review.queue-candidate',
          status: 'unavailable',
          projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
          stateVersion: loaded.stateVersion,
          sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
          reason: 'excerpt-not-present',
        });
      }
    } else {
      const page = textPage(annotation.excerpt, request.excerptUtf8Offset, request.excerptUtf8Limit);
      if (page.status === 'unavailable') {
        return deepFreeze({
          kind: 'legacy-review.queue-candidate',
          status: 'unavailable',
          projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
          stateVersion: loaded.stateVersion,
          sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
          reason: page.reason === 'out-of-range' ? 'excerpt-offset-out-of-range' : 'excerpt-offset-not-scalar-boundary',
        });
      }
      excerpt = page.page;
    }
    return deepFreeze({
      kind: 'legacy-review.queue-candidate',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_QUEUE_PROJECTION_VERSION,
      stateVersion: loaded.stateVersion,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      legacySourceFormat: loaded.format,
      disclosure: LEGACY_QUEUE_CANDIDATE_DISCLOSURE,
      candidateIdentity: request.candidateIdentity,
      candidateAbsolute,
      migrationDecision,
      ...(promotion === undefined ? {} : { promotion }),
      legacyAnnotationId: textWindow(annotation.id, LEGACY_ID_WINDOW_BYTES),
      legacyKind: annotation.kind,
      ...(annotation.file === undefined
        ? {}
        : {
            legacyFile: textWindow(annotation.file, LEGACY_PATH_WINDOW_BYTES),
          }),
      legacyAnchorHint: candidateAnchorHint(annotation),
      legacyText: text.page,
      ...(excerpt === undefined ? {} : { legacyExcerpt: excerpt }),
    });
  }

  async #readReceiptHistory(request: LegacyReviewReceiptHistoryViewRequest): Promise<LegacyReviewReceiptHistoryView> {
    if (request.batchLimit > MAX_LEGACY_RECEIPT_HISTORY_BATCHES) {
      const index = await this.#loadIndex();
      return deepFreeze({
        kind: 'legacy-review.receipt-history',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'projection-limit',
      });
    }
    const loaded = await this.#loadReceiptHistory(request.sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.receipt-history',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: loaded.reason,
      });
    }
    const batches = loaded.receipts.batches
      .slice(request.batchOffset, request.batchOffset + request.batchLimit)
      .map((batch, index) => receiptBatchSummary(batch, request.batchOffset + index));
    return deepFreeze({
      kind: 'legacy-review.receipt-history',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
      stateVersion: loaded.stateVersion,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      disclosure: LEGACY_RECEIPT_HISTORY_DISCLOSURE,
      legacyUpdatedAt: loaded.receipts.updatedAt,
      totalBatches: loaded.receipts.batches.length,
      totalAnnotations: loaded.receipts.batches.reduce((total, batch) => total + batch.annotations.length, 0),
      batchOffset: request.batchOffset,
      batches,
    });
  }

  async #readReceiptBatch(request: LegacyReviewReceiptBatchViewRequest): Promise<LegacyReviewReceiptBatchView> {
    if (request.annotationLimit > MAX_LEGACY_RECEIPT_BATCH_ANNOTATIONS) {
      const index = await this.#loadIndex();
      return deepFreeze({
        kind: 'legacy-review.receipt-batch',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
        stateVersion: index.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'projection-limit',
      });
    }
    const loaded = await this.#loadReceiptHistory(request.sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') {
      return deepFreeze({
        kind: 'legacy-review.receipt-batch',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: loaded.reason,
      });
    }
    const batch = loaded.receipts.batches[request.batchAbsolute];
    if (batch === undefined) {
      return deepFreeze({
        kind: 'legacy-review.receipt-batch',
        status: 'unavailable',
        projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
        stateVersion: loaded.stateVersion,
        sourceOccurrenceIdentity: request.sourceOccurrenceIdentity,
        reason: 'batch-not-found',
      });
    }
    const annotations = batch.annotations
      .slice(request.annotationOffset, request.annotationOffset + request.annotationLimit)
      .map((annotation, index) => receiptAnnotation(annotation, request.annotationOffset + index));
    return deepFreeze({
      kind: 'legacy-review.receipt-batch',
      status: 'available',
      projectionVersion: LEGACY_REVIEW_RECEIPT_PROJECTION_VERSION,
      stateVersion: loaded.stateVersion,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      disclosure: LEGACY_RECEIPT_HISTORY_DISCLOSURE,
      batch: receiptBatchSummary(batch, request.batchAbsolute),
      annotationOffset: request.annotationOffset,
      annotations,
    });
  }

  async #loadImportedSource(
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  ): Promise<LegacyImportedSourceLoad> {
    const index = await this.#loadIndex();
    const entry = index.payload.occurrences.find(
      candidate => candidate.sourceOccurrenceIdentity === sourceOccurrenceIdentity,
    );
    if (entry === undefined) {
      return {
        status: 'unavailable',
        stateVersion: index.stateVersion,
        reason: 'source-not-imported',
      };
    }
    const read = await this.#state.read({
      recordIdentities: [entry.sourceOccurrenceIdentity],
      includeContent: true,
    });
    if (read.quarantineReports.length > 0) {
      return {
        status: 'unavailable',
        stateVersion: index.stateVersion,
        reason: 'content-unavailable',
      };
    }
    const record = read.records[0];
    if (record === undefined || record.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    const occurrence = parseOccurrence(record, this.#workspaceIdentity);
    if (
      occurrence.sourceOccurrenceIdentity !== entry.sourceOccurrenceIdentity ||
      occurrence.sourceIdentity !== entry.sourceIdentity ||
      occurrence.sourceKind !== entry.sourceKind ||
      occurrence.digest !== entry.digest
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const association = (index.payload.movedSourceAssociations ?? []).find(
      candidate => candidate.sourceOccurrenceIdentity === occurrence.sourceOccurrenceIdentity,
    );
    if ((occurrence.location === 'moved-legacy-state') !== (association !== undefined)) {
      throw new LegacyReviewImportStateProblem();
    }
    const bytes = record.content[0]?.bytes;
    if (bytes === undefined) {
      return {
        status: 'unavailable',
        stateVersion: index.stateVersion,
        reason: 'content-unavailable',
      };
    }
    if (bytes.byteLength !== occurrence.byteLength || sha256(bytes) !== occurrence.digest) {
      throw new LegacyReviewImportStateProblem();
    }
    const recognition = recognizeLegacyReviewSourceBytes(occurrence.sourceKind, bytes);
    if (
      JSON.stringify(recognitionSummary(occurrence.sourceKind, recognition)) !== JSON.stringify(occurrence.recognition)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    if (association !== undefined) {
      await this.#validateMovedSourceAssociation(association, occurrence);
    }
    return {
      status: 'available',
      stateVersion: index.stateVersion,
      indexRevision: index.revision,
      index: index.payload,
      entry,
      occurrence,
      recognition,
    };
  }

  async #loadQueueCandidates(
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  ): Promise<LegacyQueueCandidatesLoad> {
    const loaded = await this.#loadImportedSource(sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') return loaded;
    if (loaded.entry.sourceKind !== 'queue') {
      return {
        status: 'unavailable',
        stateVersion: loaded.stateVersion,
        reason: 'source-kind-mismatch',
      };
    }
    if (loaded.occurrence.location !== 'current-checkout') {
      return {
        status: 'unavailable',
        stateVersion: loaded.stateVersion,
        reason: 'source-location-ineligible',
      };
    }
    if (loaded.recognition.status !== 'recognized' || loaded.recognition.format === 'receipts-v1') {
      return {
        status: 'unavailable',
        stateVersion: loaded.stateVersion,
        reason: 'source-unrecognized',
      };
    }
    const candidateIdentities = new Set(
      loaded.recognition.value.annotations.map(annotation =>
        legacyReviewQueueCandidateIdentity(
          this.#workspaceIdentity,
          loaded.entry.sourceOccurrenceIdentity,
          annotation.id,
        ),
      ),
    );
    const decisions = (loaded.index.candidateDecisions ?? []).filter(
      entry => entry.sourceOccurrenceIdentity === loaded.entry.sourceOccurrenceIdentity,
    );
    const promotions = (loaded.index.candidatePromotions ?? []).filter(
      entry => entry.sourceOccurrenceIdentity === loaded.entry.sourceOccurrenceIdentity,
    );
    if (
      decisions.some(entry => !candidateIdentities.has(entry.candidateIdentity)) ||
      promotions.some(entry => !candidateIdentities.has(entry.candidateIdentity))
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      status: 'available',
      stateVersion: loaded.stateVersion,
      indexRevision: loaded.indexRevision,
      index: loaded.index,
      entry: loaded.entry,
      format: loaded.recognition.format,
      queue: loaded.recognition.value,
      decisions,
      promotions,
    };
  }

  async #loadCandidateDecisionStatuses(
    loaded: LoadedLegacyQueueCandidates,
    candidateIdentities: readonly LegacyReviewQueueCandidateIdentity[],
  ): Promise<Map<LegacyReviewQueueCandidateIdentity, LegacyReviewQueueCandidateDecision>> {
    const requested = new Set(candidateIdentities);
    const entries = loaded.decisions.filter(entry => requested.has(entry.candidateIdentity));
    if (entries.length === 0) return new Map();
    const read = await this.#state.read({
      recordIdentities: entries.map(entry => entry.candidateDecisionIdentity),
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const result = new Map<LegacyReviewQueueCandidateIdentity, LegacyReviewQueueCandidateDecision>();
    for (const [index, entry] of entries.entries()) {
      const record = read.records[index];
      if (record === undefined || record.workflowIdentity !== this.#indexIdentity) {
        throw new LegacyReviewImportStateProblem();
      }
      const decision = parseCandidateDecision(record, this.#workspaceIdentity);
      if (
        decision.candidateDecisionIdentity !== entry.candidateDecisionIdentity ||
        decision.sourceIdentity !== loaded.entry.sourceIdentity ||
        decision.sourceOccurrenceIdentity !== loaded.entry.sourceOccurrenceIdentity ||
        decision.digest !== loaded.entry.digest ||
        decision.candidateIdentity !== entry.candidateIdentity ||
        decision.decision !== entry.decision
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      result.set(entry.candidateIdentity, entry.decision);
    }
    return result;
  }

  async #loadCandidatePromotionStatuses(
    loaded: LoadedLegacyQueueCandidates,
    candidateIdentities: readonly LegacyReviewQueueCandidateIdentity[],
  ): Promise<Map<LegacyReviewQueueCandidateIdentity, LegacyReviewQueueCandidatePromotionSummary>> {
    const requested = new Set(candidateIdentities);
    const entries = loaded.promotions.filter(entry => requested.has(entry.candidateIdentity));
    if (entries.length === 0) return new Map();
    const read = await this.#state.read({
      recordIdentities: entries.map(entry => entry.promotionIdentity),
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const result = new Map<LegacyReviewQueueCandidateIdentity, LegacyReviewQueueCandidatePromotionSummary>();
    for (const [index, entry] of entries.entries()) {
      const record = read.records[index];
      if (record === undefined || record.workflowIdentity !== this.#indexIdentity) {
        throw new LegacyReviewImportStateProblem();
      }
      const promotion = parseCandidatePromotion(record, this.#workspaceIdentity);
      if (
        promotion.promotionIdentity !== entry.promotionIdentity ||
        promotion.sourceIdentity !== loaded.entry.sourceIdentity ||
        promotion.sourceOccurrenceIdentity !== loaded.entry.sourceOccurrenceIdentity ||
        promotion.digest !== loaded.entry.digest ||
        promotion.candidateIdentity !== entry.candidateIdentity ||
        promotion.reviewIdentity !== entry.reviewIdentity ||
        promotion.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
        promotion.draftIdentity !== entry.draftIdentity ||
        promotion.intent !== entry.intent
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      result.set(entry.candidateIdentity, {
        promotionIdentity: promotion.promotionIdentity,
        reviewIdentity: promotion.reviewIdentity,
        reviewSnapshotIdentity: promotion.reviewSnapshotIdentity,
        draftIdentity: promotion.draftIdentity,
        intent: 'question',
      });
    }
    return result;
  }

  async #loadReceiptHistory(
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  ): Promise<LegacyReceiptHistoryLoad> {
    const loaded = await this.#loadImportedSource(sourceOccurrenceIdentity);
    if (loaded.status === 'unavailable') return loaded;
    if (loaded.entry.sourceKind !== 'receipts') {
      return {
        status: 'unavailable',
        stateVersion: loaded.stateVersion,
        reason: 'source-kind-mismatch',
      };
    }
    if (loaded.recognition.status !== 'recognized' || loaded.recognition.format !== 'receipts-v1') {
      return {
        status: 'unavailable',
        stateVersion: loaded.stateVersion,
        reason: 'source-unrecognized',
      };
    }
    return {
      status: 'available',
      stateVersion: loaded.stateVersion,
      entry: loaded.entry,
      receipts: loaded.recognition.value,
    };
  }

  async execute(value: unknown): Promise<LegacyReviewCommandResult> {
    const command = normalizeCommand(value);
    const normalized = normalizedCommand(command);
    const recalled = await this.#recall(command, normalized);
    if (recalled !== undefined) return recalled;

    const index = await this.#loadIndex();
    if (command.expectedStateVersion !== index.stateVersion) {
      return rejected(command, index.stateVersion, 'state-version-mismatch');
    }
    if (command.kind === 'legacy-review.queue-candidate.decision.set') {
      return await this.#setCandidateDecision(command, normalized, index);
    }
    if (command.kind === 'legacy-review.moved-receipt-source.associate-and-import') {
      return await this.#associateAndImportMovedReceipt(command, normalized, index);
    }
    const descriptor = this.#sources.find(candidate => candidate.sourceIdentity === command.sourceIdentity);
    if (descriptor === undefined) {
      return rejected(command, index.stateVersion, 'source-identity-unknown');
    }
    const capture = await captureLegacyReviewSource(descriptor.request, this.#sourceTestControl);
    if (capture.status === 'unavailable') {
      return capture.reason === 'missing'
        ? rejected(command, index.stateVersion, 'source-not-found')
        : rejected(command, index.stateVersion, 'source-unavailable', {
            sourceFailure: capture.reason,
          });
    }
    if (capture.digest !== command.expectedDigest) {
      return rejected(command, index.stateVersion, 'source-changed', {
        observedDigest: capture.digest,
      });
    }
    if (command.kind === 'legacy-review.source.decision.set') {
      return await this.#setDecision(command, normalized, index, capture, descriptor);
    }

    const sourceOccurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      this.#workspaceIdentity,
      descriptor.sourceIdentity,
      capture.digest,
    );
    const existing = index.payload.occurrences.find(
      entry => entry.sourceOccurrenceIdentity === sourceOccurrenceIdentity,
    );
    if (existing !== undefined) {
      await this.#validateExistingOccurrence(existing);
      return await this.#commit(
        command,
        normalized,
        index,
        capture,
        descriptor,
        sourceOccurrenceIdentity,
        'already-preserved',
        [],
      );
    }
    const remainingDecisions = index.payload.decisions.filter(
      entry => entry.sourceIdentity !== descriptor.sourceIdentity || entry.digest !== capture.digest,
    );
    if (
      index.payload.occurrences.length +
        1 +
        remainingDecisions.length +
        (index.payload.candidateDecisions?.length ?? 0) +
        (index.payload.movedSourceAssociations?.length ?? 0) +
        (index.payload.candidatePromotions?.length ?? 0) >
      this.#maximumOccurrences
    ) {
      return rejected(command, index.stateVersion, 'source-occurrence-limit');
    }

    const nextIndex: LegacyReviewImportIndexPayload = {
      formatVersion: 1,
      occurrences: [
        ...index.payload.occurrences,
        {
          sourceOccurrenceIdentity,
          sourceIdentity: descriptor.sourceIdentity,
          sourceKind: descriptor.sourceKind,
          digest: capture.digest,
          decision: 'imported',
        },
      ],
      decisions: remainingDecisions,
      ...(index.payload.candidateDecisions === undefined
        ? {}
        : { candidateDecisions: index.payload.candidateDecisions }),
      ...(index.payload.movedSourceAssociations === undefined
        ? {}
        : {
            movedSourceAssociations: index.payload.movedSourceAssociations,
          }),
      ...(index.payload.candidatePromotions === undefined
        ? {}
        : { candidatePromotions: index.payload.candidatePromotions }),
    };
    const occurrence: LegacyReviewSourceOccurrencePayload = {
      formatVersion: 1,
      parserVersion: 1,
      sourceOccurrenceIdentity,
      sourceIdentity: descriptor.sourceIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceKind: descriptor.sourceKind,
      location: descriptor.location,
      sourcePath: capture.sourcePath,
      digest: capture.digest,
      byteLength: capture.byteLength,
      metadata: capture.metadata,
      recognition: recognitionSummary(capture.sourceKind, capture.recognition),
      decision: 'imported',
      importCommandIdentity: command.commandIdentity,
      importedStateVersion: index.stateVersion + 1,
    };
    return await this.#commit(command, normalized, index, capture, descriptor, sourceOccurrenceIdentity, 'preserved', [
      immutableRecord(sourceOccurrenceIdentity, this.#indexIdentity, 'legacy-review.source-occurrence', occurrence, [
        { role: 'legacy-source', bytes: capture.bytes },
      ]),
      revisionedRecord(this.#indexIdentity, index.revision, nextIndex),
    ]);
  }

  async #associateAndImportMovedReceipt(
    command: AssociateAndImportMovedLegacyReceiptSourceCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
  ): Promise<LegacyReviewCommandResult> {
    if (command.confirmedWorkspaceIdentity !== this.#workspaceIdentity) {
      return rejected(command, index.stateVersion, 'workspace-identity-mismatch');
    }
    if (command.legacyCheckoutHash === this.#currentCheckoutHash) {
      return rejected(command, index.stateVersion, 'current-source-ineligible');
    }
    const locator = movedReceiptDescriptor(this.#legacyStateRoot, command.legacyCheckoutHash);
    if (locator.descriptor.sourceIdentity !== command.sourceIdentity) {
      return rejected(command, index.stateVersion, 'source-identity-mismatch');
    }
    const capture = await captureLegacyReviewSource(locator.descriptor.request, this.#sourceTestControl);
    if (capture.status === 'unavailable') {
      return capture.reason === 'missing'
        ? rejected(command, index.stateVersion, 'source-not-found')
        : rejected(command, index.stateVersion, 'source-unavailable', {
            sourceFailure: capture.reason,
          });
    }
    if (capture.digest !== command.expectedDigest) {
      return rejected(command, index.stateVersion, 'source-changed', {
        observedDigest: capture.digest,
      });
    }
    if (capture.recognition.status !== 'recognized' || capture.recognition.format !== 'receipts-v1') {
      return rejected(command, index.stateVersion, 'source-unrecognized');
    }
    const sourceOccurrenceIdentity = legacyReviewSourceOccurrenceIdentity(
      this.#workspaceIdentity,
      command.sourceIdentity,
      capture.digest,
    );
    const associationIdentity = legacyReviewMovedSourceAssociationIdentity(
      this.#workspaceIdentity,
      command.sourceIdentity,
      capture.digest,
    );
    const existingAssociation = (index.payload.movedSourceAssociations ?? []).find(
      entry => entry.associationIdentity === associationIdentity,
    );
    const existingOccurrence = index.payload.occurrences.find(
      entry => entry.sourceOccurrenceIdentity === sourceOccurrenceIdentity,
    );
    if (existingAssociation !== undefined) {
      if (
        existingOccurrence === undefined ||
        existingAssociation.sourceOccurrenceIdentity !== sourceOccurrenceIdentity ||
        existingAssociation.sourceIdentity !== command.sourceIdentity ||
        existingAssociation.digest !== capture.digest ||
        existingAssociation.legacyCheckoutHash !== command.legacyCheckoutHash
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      await this.#validateMovedSourceAssociation(existingAssociation);
      return await this.#commitMovedReceiptAssociation(
        command,
        normalized,
        index,
        associationIdentity,
        sourceOccurrenceIdentity,
        'already-recorded',
        'already-preserved',
        [],
      );
    }
    if (
      existingOccurrence !== undefined ||
      index.payload.decisions.some(entry => entry.sourceIdentity === command.sourceIdentity)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const identitiesAreUnused = await this.#movedAssociationIdentitiesAreUnused(
      associationIdentity,
      sourceOccurrenceIdentity,
    );
    if (!identitiesAreUnused) {
      const latest = await this.#loadIndex();
      if (latest.stateVersion !== index.stateVersion) {
        return rejected(command, latest.stateVersion, 'state-version-mismatch');
      }
      throw new LegacyReviewImportStateProblem();
    }
    if (
      index.payload.occurrences.length +
        index.payload.decisions.length +
        (index.payload.candidateDecisions?.length ?? 0) +
        (index.payload.movedSourceAssociations?.length ?? 0) +
        (index.payload.candidatePromotions?.length ?? 0) +
        2 >
      this.#maximumOccurrences
    ) {
      return rejected(command, index.stateVersion, 'moved-source-association-limit');
    }
    const associationEntry: LegacyReviewMovedSourceAssociationIndexEntry = {
      associationIdentity,
      sourceOccurrenceIdentity,
      sourceIdentity: command.sourceIdentity,
      digest: capture.digest,
      legacyCheckoutHash: command.legacyCheckoutHash,
    };
    const nextIndex: LegacyReviewImportIndexPayload = {
      formatVersion: 1,
      occurrences: [
        ...index.payload.occurrences,
        {
          sourceOccurrenceIdentity,
          sourceIdentity: command.sourceIdentity,
          sourceKind: 'receipts',
          digest: capture.digest,
          decision: 'imported',
        },
      ],
      decisions: index.payload.decisions,
      ...(index.payload.candidateDecisions === undefined
        ? {}
        : { candidateDecisions: index.payload.candidateDecisions }),
      movedSourceAssociations: [...(index.payload.movedSourceAssociations ?? []), associationEntry],
      ...(index.payload.candidatePromotions === undefined
        ? {}
        : { candidatePromotions: index.payload.candidatePromotions }),
    };
    const association: LegacyReviewMovedSourceAssociationPayload = {
      formatVersion: 1,
      associationIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceIdentity: command.sourceIdentity,
      sourceOccurrenceIdentity,
      digest: capture.digest,
      legacyCheckoutHash: command.legacyCheckoutHash,
      associationCommandIdentity: command.commandIdentity,
      associatedStateVersion: index.stateVersion + 1,
    };
    const occurrence: LegacyReviewSourceOccurrencePayload = {
      formatVersion: 1,
      parserVersion: 1,
      sourceOccurrenceIdentity,
      sourceIdentity: command.sourceIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceKind: 'receipts',
      location: 'moved-legacy-state',
      sourcePath: capture.sourcePath,
      digest: capture.digest,
      byteLength: capture.byteLength,
      metadata: capture.metadata,
      recognition: recognitionSummary('receipts', capture.recognition),
      decision: 'imported',
      importCommandIdentity: command.commandIdentity,
      importedStateVersion: index.stateVersion + 1,
    };
    return await this.#commitMovedReceiptAssociation(
      command,
      normalized,
      index,
      associationIdentity,
      sourceOccurrenceIdentity,
      'recorded',
      'preserved',
      [
        immutableRecord(
          associationIdentity,
          this.#indexIdentity,
          'legacy-review.moved-source-association',
          association,
        ),
        immutableRecord(sourceOccurrenceIdentity, this.#indexIdentity, 'legacy-review.source-occurrence', occurrence, [
          { role: 'legacy-source', bytes: capture.bytes },
        ]),
        revisionedRecord(this.#indexIdentity, index.revision, nextIndex),
      ],
    );
  }

  async #setCandidateDecision(
    command: SetLegacyReviewQueueCandidateDecisionCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
  ): Promise<LegacyReviewCommandResult> {
    const loaded = await this.#loadQueueCandidates(command.sourceOccurrenceIdentity);
    if (loaded.stateVersion !== index.stateVersion) {
      return rejected(command, loaded.stateVersion, 'state-version-mismatch');
    }
    if (loaded.status === 'unavailable') {
      return rejected(
        command,
        loaded.stateVersion,
        loaded.reason === 'source-not-imported' ? 'source-occurrence-not-imported' : 'candidate-source-unavailable',
      );
    }
    const annotation = loaded.queue.annotations.find(
      candidate =>
        legacyReviewQueueCandidateIdentity(
          this.#workspaceIdentity,
          loaded.entry.sourceOccurrenceIdentity,
          candidate.id,
        ) === command.candidateIdentity,
    );
    if (annotation === undefined) {
      return rejected(command, index.stateVersion, 'candidate-not-found');
    }
    const promotions = await this.#loadCandidatePromotionStatuses(loaded, [command.candidateIdentity]);
    if (promotions.has(command.candidateIdentity)) {
      return rejected(command, index.stateVersion, 'candidate-already-promoted');
    }
    const candidateDecisionIdentity = legacyReviewCandidateDecisionIdentity(
      this.#workspaceIdentity,
      loaded.entry.sourceOccurrenceIdentity,
      command.candidateIdentity,
      command.decision,
    );
    const current = loaded.decisions.find(entry => entry.candidateIdentity === command.candidateIdentity);
    if (current !== undefined) {
      await this.#validateExistingCandidateDecision(current, loaded.entry);
    }
    if (current?.candidateDecisionIdentity === candidateDecisionIdentity && current.decision === command.decision) {
      return await this.#commitCandidateDecision(
        command,
        normalized,
        index,
        loaded.entry,
        candidateDecisionIdentity,
        'already-recorded',
        [],
      );
    }

    const retainedDecisions = (index.payload.candidateDecisions ?? []).filter(
      entry => entry.candidateIdentity !== command.candidateIdentity,
    );
    if (
      index.payload.occurrences.length +
        index.payload.decisions.length +
        retainedDecisions.length +
        1 +
        (index.payload.movedSourceAssociations?.length ?? 0) +
        (index.payload.candidatePromotions?.length ?? 0) >
      this.#maximumOccurrences
    ) {
      return rejected(command, index.stateVersion, 'candidate-decision-limit');
    }
    const existingFact = await this.#readCandidateDecision(candidateDecisionIdentity);
    if (
      existingFact !== undefined &&
      (existingFact.sourceIdentity !== loaded.entry.sourceIdentity ||
        existingFact.sourceOccurrenceIdentity !== loaded.entry.sourceOccurrenceIdentity ||
        existingFact.digest !== loaded.entry.digest ||
        existingFact.candidateIdentity !== command.candidateIdentity ||
        existingFact.decision !== command.decision)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const nextEntry: LegacyReviewCandidateDecisionIndexEntry = {
      candidateDecisionIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      candidateIdentity: command.candidateIdentity,
      decision: command.decision,
    };
    const nextIndex: LegacyReviewImportIndexPayload = {
      formatVersion: 1,
      occurrences: index.payload.occurrences,
      decisions: index.payload.decisions,
      candidateDecisions: [...retainedDecisions, nextEntry],
      ...(index.payload.movedSourceAssociations === undefined
        ? {}
        : {
            movedSourceAssociations: index.payload.movedSourceAssociations,
          }),
      ...(index.payload.candidatePromotions === undefined
        ? {}
        : { candidatePromotions: index.payload.candidatePromotions }),
    };
    const decisionPayload: LegacyReviewCandidateDecisionPayload = {
      formatVersion: 1,
      candidateDecisionIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceIdentity: loaded.entry.sourceIdentity,
      sourceOccurrenceIdentity: loaded.entry.sourceOccurrenceIdentity,
      digest: loaded.entry.digest,
      candidateIdentity: command.candidateIdentity,
      decision: command.decision,
      decisionCommandIdentity: command.commandIdentity,
      decidedStateVersion: index.stateVersion + 1,
    };
    return await this.#commitCandidateDecision(
      command,
      normalized,
      index,
      loaded.entry,
      candidateDecisionIdentity,
      existingFact === undefined ? 'recorded' : 'already-recorded',
      [
        ...(existingFact === undefined
          ? [
              immutableRecord(
                candidateDecisionIdentity,
                this.#indexIdentity,
                'legacy-review.candidate-decision',
                decisionPayload,
              ),
            ]
          : []),
        revisionedRecord(this.#indexIdentity, index.revision, nextIndex),
      ],
    );
  }

  async #setDecision(
    command: SetLegacyReviewSourceDecisionCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
    capture: LegacyReviewSourceCaptured,
    descriptor: LegacyReviewSourceDescriptor,
  ): Promise<LegacyReviewCommandResult> {
    const imported = index.payload.occurrences.find(
      entry =>
        entry.sourceIdentity === descriptor.sourceIdentity &&
        entry.sourceKind === descriptor.sourceKind &&
        entry.digest === capture.digest,
    );
    if (imported !== undefined) {
      await this.#validateExistingOccurrence(imported);
      return rejected(command, index.stateVersion, 'source-already-imported');
    }
    const sourceDecisionIdentity = legacyReviewSourceDecisionIdentity(
      this.#workspaceIdentity,
      descriptor.sourceIdentity,
      capture.digest,
      command.decision,
    );
    const current = index.payload.decisions.find(
      entry =>
        entry.sourceIdentity === descriptor.sourceIdentity &&
        entry.sourceKind === descriptor.sourceKind &&
        entry.digest === capture.digest,
    );
    if (current?.sourceDecisionIdentity === sourceDecisionIdentity && current.decision === command.decision) {
      await this.#validateExistingDecision(current);
      return await this.#commitDecision(
        command,
        normalized,
        index,
        capture,
        descriptor,
        sourceDecisionIdentity,
        'already-recorded',
        [],
      );
    }

    const retainedDecisions = index.payload.decisions.filter(
      entry => entry.sourceIdentity !== descriptor.sourceIdentity || entry.digest !== capture.digest,
    );
    if (
      index.payload.occurrences.length +
        retainedDecisions.length +
        1 +
        (index.payload.candidateDecisions?.length ?? 0) +
        (index.payload.movedSourceAssociations?.length ?? 0) +
        (index.payload.candidatePromotions?.length ?? 0) >
      this.#maximumOccurrences
    ) {
      return rejected(command, index.stateVersion, 'source-decision-limit');
    }
    const existingFact = await this.#readDecision(sourceDecisionIdentity);
    if (
      existingFact !== undefined &&
      (existingFact.sourceIdentity !== descriptor.sourceIdentity ||
        existingFact.sourceKind !== descriptor.sourceKind ||
        existingFact.digest !== capture.digest ||
        existingFact.decision !== command.decision)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const nextEntry: LegacyReviewSourceDecisionIndexEntry = {
      sourceDecisionIdentity,
      sourceIdentity: descriptor.sourceIdentity,
      sourceKind: descriptor.sourceKind,
      digest: capture.digest,
      decision: command.decision,
    };
    const nextIndex: LegacyReviewImportIndexPayload = {
      formatVersion: 1,
      occurrences: index.payload.occurrences,
      decisions: [...retainedDecisions, nextEntry],
      ...(index.payload.candidateDecisions === undefined
        ? {}
        : { candidateDecisions: index.payload.candidateDecisions }),
      ...(index.payload.movedSourceAssociations === undefined
        ? {}
        : {
            movedSourceAssociations: index.payload.movedSourceAssociations,
          }),
      ...(index.payload.candidatePromotions === undefined
        ? {}
        : { candidatePromotions: index.payload.candidatePromotions }),
    };
    const decisionPayload: LegacyReviewSourceDecisionPayload = {
      formatVersion: 1,
      parserVersion: 1,
      sourceDecisionIdentity,
      sourceIdentity: descriptor.sourceIdentity,
      workspaceIdentity: this.#workspaceIdentity,
      sourceKind: descriptor.sourceKind,
      location: descriptor.location,
      sourcePath: capture.sourcePath,
      digest: capture.digest,
      byteLength: capture.byteLength,
      metadata: capture.metadata,
      recognition: recognitionSummary(capture.sourceKind, capture.recognition),
      decision: command.decision,
      decisionCommandIdentity: command.commandIdentity,
      decidedStateVersion: index.stateVersion + 1,
    };
    return await this.#commitDecision(
      command,
      normalized,
      index,
      capture,
      descriptor,
      sourceDecisionIdentity,
      'recorded',
      [
        ...(existingFact === undefined
          ? [
              immutableRecord(
                sourceDecisionIdentity,
                this.#indexIdentity,
                'legacy-review.source-decision',
                decisionPayload,
              ),
            ]
          : []),
        revisionedRecord(this.#indexIdentity, index.revision, nextIndex),
      ],
    );
  }

  async #capture(descriptor: LegacyReviewSourceDescriptor): Promise<{
    readonly descriptor: LegacyReviewSourceDescriptor;
    readonly result: LegacyReviewSourceResult;
  }> {
    return {
      descriptor,
      result: await captureLegacyReviewSource(descriptor.request, this.#sourceTestControl),
    };
  }

  async #loadIndex(): Promise<LoadedLegacyReviewImportIndex> {
    const read = await this.#state.read({
      recordIdentities: [this.#indexIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined) {
      return {
        stateVersion: read.stateVersion,
        revision: 0,
        payload: { formatVersion: 1, occurrences: [], decisions: [] },
      };
    }
    if (
      record.kind !== 'legacy-review.import-index' ||
      record.recordClass !== 'revisioned' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== this.#indexIdentity ||
      record.workflowIdentity !== this.#indexIdentity ||
      record.content.length !== 0
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const payload = parseIndex(decode(record.payload));
    for (const entry of payload.occurrences) {
      const currentDescriptor = this.#sources.find(descriptor => descriptor.sourceIdentity === entry.sourceIdentity);
      if (
        entry.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, entry.sourceIdentity, entry.digest) ||
        (currentDescriptor !== undefined && currentDescriptor.sourceKind !== entry.sourceKind)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    for (const entry of payload.decisions) {
      const currentDescriptor = this.#sources.find(descriptor => descriptor.sourceIdentity === entry.sourceIdentity);
      if (
        entry.sourceDecisionIdentity !==
          legacyReviewSourceDecisionIdentity(
            this.#workspaceIdentity,
            entry.sourceIdentity,
            entry.digest,
            entry.decision,
          ) ||
        (currentDescriptor !== undefined && currentDescriptor.sourceKind !== entry.sourceKind)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    for (const entry of payload.candidateDecisions ?? []) {
      const occurrence = payload.occurrences.find(
        candidate => candidate.sourceOccurrenceIdentity === entry.sourceOccurrenceIdentity,
      );
      if (
        occurrence?.sourceKind !== 'queue' ||
        entry.candidateDecisionIdentity !==
          legacyReviewCandidateDecisionIdentity(
            this.#workspaceIdentity,
            entry.sourceOccurrenceIdentity,
            entry.candidateIdentity,
            entry.decision,
          )
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    for (const entry of payload.candidatePromotions ?? []) {
      const occurrence = payload.occurrences.find(
        candidate => candidate.sourceOccurrenceIdentity === entry.sourceOccurrenceIdentity,
      );
      if (
        occurrence?.sourceKind !== 'queue' ||
        occurrence.sourceIdentity !== entry.sourceIdentity ||
        occurrence.digest !== entry.digest ||
        entry.promotionIdentity !==
          legacyReviewCandidatePromotionIdentity(
            this.#workspaceIdentity,
            entry.sourceOccurrenceIdentity,
            entry.candidateIdentity,
          )
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    for (const entry of payload.movedSourceAssociations ?? []) {
      const locator = movedReceiptDescriptor(this.#legacyStateRoot, entry.legacyCheckoutHash);
      if (
        entry.legacyCheckoutHash === this.#currentCheckoutHash ||
        locator.descriptor.sourceIdentity !== entry.sourceIdentity ||
        entry.associationIdentity !==
          legacyReviewMovedSourceAssociationIdentity(this.#workspaceIdentity, entry.sourceIdentity, entry.digest)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    return {
      stateVersion: read.stateVersion,
      revision: record.revision,
      payload,
    };
  }

  async #validateExistingOccurrence(entry: LegacyReviewImportIndexEntry): Promise<void> {
    const read = await this.#state.read({
      recordIdentities: [entry.sourceOccurrenceIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined || record.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    const occurrence = parseOccurrence(record, this.#workspaceIdentity);
    if (
      occurrence.sourceOccurrenceIdentity !== entry.sourceOccurrenceIdentity ||
      occurrence.sourceIdentity !== entry.sourceIdentity ||
      occurrence.sourceKind !== entry.sourceKind ||
      occurrence.digest !== entry.digest
    ) {
      throw new LegacyReviewImportStateProblem();
    }
  }

  async #validateMovedSourceAssociation(
    entry: LegacyReviewMovedSourceAssociationIndexEntry,
    knownOccurrence?: LegacyReviewSourceOccurrencePayload,
  ): Promise<LegacyReviewMovedSourceAssociationPayload> {
    const read = await this.#state.read({
      recordIdentities:
        knownOccurrence === undefined
          ? [entry.associationIdentity, entry.sourceOccurrenceIdentity]
          : [entry.associationIdentity],
      includeContent: knownOccurrence === undefined,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const associationRecord = read.records[0];
    if (associationRecord === undefined || associationRecord.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    const association = parseMovedSourceAssociation(associationRecord, this.#workspaceIdentity);
    let occurrence = knownOccurrence;
    if (occurrence === undefined) {
      const occurrenceRecord = read.records[1];
      if (occurrenceRecord === undefined || occurrenceRecord.workflowIdentity !== this.#indexIdentity) {
        throw new LegacyReviewImportStateProblem();
      }
      occurrence = parseOccurrence(occurrenceRecord, this.#workspaceIdentity);
      const bytes = occurrenceRecord.content[0]?.bytes;
      if (bytes === undefined || bytes.byteLength !== occurrence.byteLength || sha256(bytes) !== occurrence.digest) {
        throw new LegacyReviewImportStateProblem();
      }
    }
    if (
      entry.associationIdentity !== association.associationIdentity ||
      entry.sourceOccurrenceIdentity !== association.sourceOccurrenceIdentity ||
      entry.sourceIdentity !== association.sourceIdentity ||
      entry.digest !== association.digest ||
      entry.legacyCheckoutHash !== association.legacyCheckoutHash ||
      occurrence.sourceOccurrenceIdentity !== entry.sourceOccurrenceIdentity ||
      occurrence.sourceIdentity !== entry.sourceIdentity ||
      occurrence.sourceKind !== 'receipts' ||
      occurrence.location !== 'moved-legacy-state' ||
      occurrence.digest !== entry.digest ||
      occurrence.importCommandIdentity !== association.associationCommandIdentity ||
      occurrence.importedStateVersion !== association.associatedStateVersion
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return association;
  }

  async #movedAssociationIdentitiesAreUnused(
    associationIdentity: LegacyReviewMovedSourceAssociationIdentity,
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  ): Promise<boolean> {
    const read = await this.#state.read({
      recordIdentities: [associationIdentity, sourceOccurrenceIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    return read.records.every(record => record === undefined);
  }

  async #movedReceiptMigrationStatus(
    locator: LegacyReviewMovedReceiptLocator,
    digest: string,
    index: LegacyReviewImportIndexPayload,
  ): Promise<LegacyReviewMovedReceiptMigrationStatus> {
    const association = (index.movedSourceAssociations ?? []).find(
      entry => entry.sourceIdentity === locator.descriptor.sourceIdentity && entry.digest === digest,
    );
    const occurrence = index.occurrences.find(
      entry => entry.sourceIdentity === locator.descriptor.sourceIdentity && entry.digest === digest,
    );
    if (association === undefined) {
      if (occurrence !== undefined) throw new LegacyReviewImportStateProblem();
      return { status: 'unassociated' };
    }
    if (
      association.legacyCheckoutHash !== locator.legacyCheckoutHash ||
      occurrence?.sourceOccurrenceIdentity !== association.sourceOccurrenceIdentity
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    await this.#validateMovedSourceAssociation(association);
    return {
      status: 'associated-and-imported',
      associationIdentity: association.associationIdentity,
      sourceOccurrenceIdentity: association.sourceOccurrenceIdentity,
    };
  }

  async #readDecision(
    sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity,
  ): Promise<LegacyReviewSourceDecisionPayload | undefined> {
    const read = await this.#state.read({
      recordIdentities: [sourceDecisionIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    return parseDecision(record, this.#workspaceIdentity);
  }

  async #validateExistingDecision(entry: LegacyReviewSourceDecisionIndexEntry): Promise<void> {
    const decision = await this.#readDecision(entry.sourceDecisionIdentity);
    if (
      decision === undefined ||
      decision.sourceDecisionIdentity !== entry.sourceDecisionIdentity ||
      decision.sourceIdentity !== entry.sourceIdentity ||
      decision.sourceKind !== entry.sourceKind ||
      decision.digest !== entry.digest ||
      decision.decision !== entry.decision
    ) {
      throw new LegacyReviewImportStateProblem();
    }
  }

  async #readCandidateDecision(
    candidateDecisionIdentity: LegacyReviewCandidateDecisionIdentity,
  ): Promise<LegacyReviewCandidateDecisionPayload | undefined> {
    const read = await this.#state.read({
      recordIdentities: [candidateDecisionIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    return parseCandidateDecision(record, this.#workspaceIdentity);
  }

  async #validateExistingCandidateDecision(
    entry: LegacyReviewCandidateDecisionIndexEntry,
    source: LegacyReviewImportIndexEntry,
  ): Promise<void> {
    const decision = await this.#readCandidateDecision(entry.candidateDecisionIdentity);
    if (
      decision === undefined ||
      decision.candidateDecisionIdentity !== entry.candidateDecisionIdentity ||
      decision.sourceIdentity !== source.sourceIdentity ||
      decision.sourceOccurrenceIdentity !== entry.sourceOccurrenceIdentity ||
      decision.sourceOccurrenceIdentity !== source.sourceOccurrenceIdentity ||
      decision.digest !== source.digest ||
      decision.candidateIdentity !== entry.candidateIdentity ||
      decision.decision !== entry.decision
    ) {
      throw new LegacyReviewImportStateProblem();
    }
  }

  async #readCandidatePromotion(
    promotionIdentity: LegacyReviewCandidatePromotionIdentity,
  ): Promise<LegacyReviewCandidatePromotionPayload | undefined> {
    const read = await this.#state.read({
      recordIdentities: [promotionIdentity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (record.workflowIdentity !== this.#indexIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    return parseCandidatePromotion(record, this.#workspaceIdentity);
  }

  async #validateExistingCandidatePromotion(
    entry: LegacyReviewCandidatePromotionIndexEntry,
    source: LegacyReviewImportIndexEntry,
  ): Promise<LegacyReviewCandidatePromotionPayload> {
    const promotion = await this.#readCandidatePromotion(entry.promotionIdentity);
    if (
      promotion === undefined ||
      promotion.promotionIdentity !== entry.promotionIdentity ||
      promotion.sourceIdentity !== source.sourceIdentity ||
      promotion.sourceOccurrenceIdentity !== entry.sourceOccurrenceIdentity ||
      promotion.sourceOccurrenceIdentity !== source.sourceOccurrenceIdentity ||
      promotion.digest !== source.digest ||
      promotion.candidateIdentity !== entry.candidateIdentity ||
      promotion.reviewIdentity !== entry.reviewIdentity ||
      promotion.reviewSnapshotIdentity !== entry.reviewSnapshotIdentity ||
      promotion.draftIdentity !== entry.draftIdentity ||
      promotion.intent !== entry.intent
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return promotion;
  }

  async #recall(command: LegacyReviewCommand, normalized: string): Promise<LegacyReviewCommandResult | undefined> {
    const identity = legacyReviewImportCommandRecordIdentity(command.commandIdentity);
    const read = await this.#state.read({
      recordIdentities: [identity],
      includeContent: false,
    });
    if (read.quarantineReports.length > 0) {
      throw new LegacyReviewImportStateProblem();
    }
    const record = read.records[0];
    if (record === undefined) return undefined;
    if (
      record.kind !== 'legacy-review.command' ||
      record.recordClass !== 'immutable' ||
      record.schemaVersion !== 1 ||
      record.recordIdentity !== identity ||
      record.workflowIdentity !== this.#indexIdentity ||
      record.content.length !== 0
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const value = decode(record.payload);
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, ['formatVersion', 'normalizedCommand', 'result']) ||
      value.formatVersion !== 1 ||
      typeof value.normalizedCommand !== 'string'
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const result = parseResult(value.result);
    if (result.commandIdentity !== command.commandIdentity) {
      throw new LegacyReviewImportStateProblem();
    }
    if (value.normalizedCommand !== normalized) {
      return rejected(command, read.stateVersion, 'command-identity-conflict');
    }
    if (result.status !== 'accepted') {
      throw new LegacyReviewImportStateProblem();
    }
    if (command.kind === 'legacy-review.queue-candidate.decision.set') {
      if (
        result.kind !== 'legacy-review.queue-candidate.decision-recorded' ||
        result.sourceOccurrenceIdentity !== command.sourceOccurrenceIdentity ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest) ||
        result.candidateIdentity !== command.candidateIdentity ||
        result.decision !== command.decision ||
        result.candidateDecisionIdentity !==
          legacyReviewCandidateDecisionIdentity(
            this.#workspaceIdentity,
            result.sourceOccurrenceIdentity,
            result.candidateIdentity,
            result.decision,
          )
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      const currentIndex = await this.#loadIndex();
      const source = currentIndex.payload.occurrences.find(
        entry =>
          entry.sourceOccurrenceIdentity === result.sourceOccurrenceIdentity &&
          entry.sourceIdentity === result.sourceIdentity &&
          entry.sourceKind === 'queue' &&
          entry.digest === result.digest,
      );
      if (source === undefined) throw new LegacyReviewImportStateProblem();
      if (
        currentIndex.stateVersion === result.stateVersion &&
        !(currentIndex.payload.candidateDecisions ?? []).some(
          entry =>
            entry.candidateDecisionIdentity === result.candidateDecisionIdentity &&
            entry.sourceOccurrenceIdentity === result.sourceOccurrenceIdentity &&
            entry.candidateIdentity === result.candidateIdentity &&
            entry.decision === result.decision,
        )
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      const decision = await this.#readCandidateDecision(result.candidateDecisionIdentity);
      if (
        decision === undefined ||
        decision.sourceIdentity !== result.sourceIdentity ||
        decision.sourceOccurrenceIdentity !== result.sourceOccurrenceIdentity ||
        decision.digest !== result.digest ||
        decision.candidateIdentity !== result.candidateIdentity ||
        decision.decision !== result.decision
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      return deepFreeze(result);
    }
    if (command.kind === 'legacy-review.moved-receipt-source.associate-and-import') {
      if (
        result.kind !== 'legacy-review.moved-receipt-source.associated-and-imported' ||
        result.sourceIdentity !== command.sourceIdentity ||
        result.legacyCheckoutHash !== command.legacyCheckoutHash ||
        result.digest !== command.expectedDigest ||
        result.associationIdentity !==
          legacyReviewMovedSourceAssociationIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest) ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      const currentIndex = await this.#loadIndex();
      const association = currentIndex.payload.movedSourceAssociations?.find(
        entry => entry.associationIdentity === result.associationIdentity,
      );
      if (association === undefined) {
        throw new LegacyReviewImportStateProblem();
      }
      const fact = await this.#validateMovedSourceAssociation(association);
      const firstCommand = fact.associationCommandIdentity === command.commandIdentity;
      if (
        result.association !== (firstCommand ? 'recorded' : 'already-recorded') ||
        result.preservation !== (firstCommand ? 'preserved' : 'already-preserved')
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      return deepFreeze(result);
    }
    if (result.sourceIdentity !== command.sourceIdentity || result.digest !== command.expectedDigest) {
      throw new LegacyReviewImportStateProblem();
    }
    if (command.kind === 'legacy-review.source.import') {
      if (
        result.kind !== 'legacy-review.source.imported' ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      const index = await this.#loadIndex();
      const entry = index.payload.occurrences.find(
        candidate =>
          candidate.sourceOccurrenceIdentity === result.sourceOccurrenceIdentity &&
          candidate.sourceIdentity === result.sourceIdentity &&
          candidate.sourceKind === result.sourceKind &&
          candidate.digest === result.digest,
      );
      if (entry === undefined) throw new LegacyReviewImportStateProblem();
      await this.#validateExistingOccurrence(entry);
      return deepFreeze(result);
    }
    if (
      result.kind !== 'legacy-review.source.decision-recorded' ||
      result.decision !== command.decision ||
      result.sourceDecisionIdentity !==
        legacyReviewSourceDecisionIdentity(
          this.#workspaceIdentity,
          result.sourceIdentity,
          result.digest,
          result.decision,
        )
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const currentIndex = await this.#loadIndex();
    if (
      currentIndex.stateVersion === result.stateVersion &&
      !currentIndex.payload.decisions.some(
        entry =>
          entry.sourceDecisionIdentity === result.sourceDecisionIdentity &&
          entry.sourceIdentity === result.sourceIdentity &&
          entry.sourceKind === result.sourceKind &&
          entry.digest === result.digest &&
          entry.decision === result.decision,
      )
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    const decision = await this.#readDecision(result.sourceDecisionIdentity);
    if (
      decision === undefined ||
      decision.sourceIdentity !== result.sourceIdentity ||
      decision.sourceKind !== result.sourceKind ||
      decision.digest !== result.digest ||
      decision.decision !== result.decision
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return deepFreeze(result);
  }

  async #commit(
    command: ImportLegacyReviewSourceCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
    capture: LegacyReviewSourceCaptured,
    descriptor: LegacyReviewSourceDescriptor,
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
    preservation: LegacyReviewSourceImported['preservation'],
    records: readonly StateRecordWrite[],
  ): Promise<LegacyReviewCommandResult> {
    return await this.#commitAccepted(
      command,
      normalized,
      {
        kind: 'legacy-review.source.imported',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion + 1,
        sourceIdentity: descriptor.sourceIdentity,
        sourceOccurrenceIdentity,
        sourceKind: descriptor.sourceKind,
        digest: capture.digest,
        preservation,
      },
      records,
    );
  }

  async #commitMovedReceiptAssociation(
    command: AssociateAndImportMovedLegacyReceiptSourceCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
    associationIdentity: LegacyReviewMovedSourceAssociationIdentity,
    sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
    association: LegacyReviewMovedReceiptSourceAssociatedAndImported['association'],
    preservation: LegacyReviewMovedReceiptSourceAssociatedAndImported['preservation'],
    records: readonly StateRecordWrite[],
  ): Promise<LegacyReviewCommandResult> {
    return await this.#commitAccepted(
      command,
      normalized,
      {
        kind: 'legacy-review.moved-receipt-source.associated-and-imported',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion + 1,
        sourceIdentity: command.sourceIdentity,
        associationIdentity,
        sourceOccurrenceIdentity,
        sourceKind: 'receipts',
        location: 'moved-legacy-state',
        legacyCheckoutHash: command.legacyCheckoutHash,
        digest: command.expectedDigest,
        association,
        preservation,
      },
      records,
    );
  }

  async #commitDecision(
    command: SetLegacyReviewSourceDecisionCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
    capture: LegacyReviewSourceCaptured,
    descriptor: LegacyReviewSourceDescriptor,
    sourceDecisionIdentity: LegacyReviewSourceDecisionIdentity,
    recording: LegacyReviewSourceDecisionRecorded['recording'],
    records: readonly StateRecordWrite[],
  ): Promise<LegacyReviewCommandResult> {
    return await this.#commitAccepted(
      command,
      normalized,
      {
        kind: 'legacy-review.source.decision-recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion + 1,
        sourceIdentity: descriptor.sourceIdentity,
        sourceDecisionIdentity,
        sourceKind: descriptor.sourceKind,
        digest: capture.digest,
        decision: command.decision,
        recording,
      },
      records,
    );
  }

  async #commitCandidateDecision(
    command: SetLegacyReviewQueueCandidateDecisionCommand,
    normalized: string,
    index: LoadedLegacyReviewImportIndex,
    source: LegacyReviewImportIndexEntry,
    candidateDecisionIdentity: LegacyReviewCandidateDecisionIdentity,
    recording: LegacyReviewQueueCandidateDecisionRecorded['recording'],
    records: readonly StateRecordWrite[],
  ): Promise<LegacyReviewCommandResult> {
    return await this.#commitAccepted(
      command,
      normalized,
      {
        kind: 'legacy-review.queue-candidate.decision-recorded',
        status: 'accepted',
        commandIdentity: command.commandIdentity,
        stateVersion: index.stateVersion + 1,
        sourceIdentity: source.sourceIdentity,
        sourceOccurrenceIdentity: source.sourceOccurrenceIdentity,
        digest: source.digest,
        candidateIdentity: command.candidateIdentity,
        candidateDecisionIdentity,
        decision: command.decision,
        recording,
      },
      records,
    );
  }

  async #commitAccepted(
    command: LegacyReviewCommand,
    normalized: string,
    accepted: LegacyReviewCommandAccepted,
    records: readonly StateRecordWrite[],
  ): Promise<LegacyReviewCommandResult> {
    const commandRecord: LegacyReviewCommandRecordPayload = {
      formatVersion: 1,
      normalizedCommand: normalized,
      result: accepted,
    };
    const committed = await this.#state.commit({
      commandIdentity: command.commandIdentity,
      expectedStateVersion: command.expectedStateVersion,
      records: [
        ...records,
        immutableRecord(
          legacyReviewImportCommandRecordIdentity(command.commandIdentity),
          this.#indexIdentity,
          'legacy-review.command',
          commandRecord,
        ),
      ],
      result: {
        kind: 'legacy-review.command-result',
        schemaVersion: 1,
        payload: encode(accepted),
      },
    });
    if ('result' in committed) {
      return this.#decodeCommittedResult(committed, command);
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

  #decodeCommittedResult(
    committed: Extract<StateCommitResult, { readonly status: 'committed' | 'duplicate' }>,
    command: LegacyReviewCommand,
  ): LegacyReviewCommandAccepted {
    if (committed.result.kind !== 'legacy-review.command-result' || committed.result.schemaVersion !== 1) {
      throw new LegacyReviewImportStateProblem();
    }
    const result = parseResult(decode(committed.result.payload));
    if (
      result.status !== 'accepted' ||
      result.commandIdentity !== command.commandIdentity ||
      result.stateVersion !== committed.stateVersion
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    if (command.kind === 'legacy-review.queue-candidate.decision.set') {
      if (
        result.kind !== 'legacy-review.queue-candidate.decision-recorded' ||
        result.sourceOccurrenceIdentity !== command.sourceOccurrenceIdentity ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest) ||
        result.candidateIdentity !== command.candidateIdentity ||
        result.decision !== command.decision ||
        result.candidateDecisionIdentity !==
          legacyReviewCandidateDecisionIdentity(
            this.#workspaceIdentity,
            result.sourceOccurrenceIdentity,
            result.candidateIdentity,
            result.decision,
          )
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      return deepFreeze(result);
    }
    if (command.kind === 'legacy-review.moved-receipt-source.associate-and-import') {
      if (
        result.kind !== 'legacy-review.moved-receipt-source.associated-and-imported' ||
        result.sourceIdentity !== command.sourceIdentity ||
        result.legacyCheckoutHash !== command.legacyCheckoutHash ||
        result.digest !== command.expectedDigest ||
        result.associationIdentity !==
          legacyReviewMovedSourceAssociationIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest) ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
      return deepFreeze(result);
    }
    if (result.sourceIdentity !== command.sourceIdentity || result.digest !== command.expectedDigest) {
      throw new LegacyReviewImportStateProblem();
    }
    if (command.kind === 'legacy-review.source.import') {
      if (
        result.kind !== 'legacy-review.source.imported' ||
        result.sourceOccurrenceIdentity !==
          legacyReviewSourceOccurrenceIdentity(this.#workspaceIdentity, result.sourceIdentity, result.digest)
      ) {
        throw new LegacyReviewImportStateProblem();
      }
    } else if (
      result.kind !== 'legacy-review.source.decision-recorded' ||
      result.decision !== command.decision ||
      result.sourceDecisionIdentity !==
        legacyReviewSourceDecisionIdentity(
          this.#workspaceIdentity,
          result.sourceIdentity,
          result.digest,
          result.decision,
        )
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return deepFreeze(result);
  }
}
