import type { LegacyReviewSourceCaptured, LegacyReviewSourceResult } from '../legacyReviewSource.js';
import { deepFreeze } from '../recordCodec.js';
import type {
  LegacyReviewMovedReceiptMigrationStatus,
  LegacyReviewMovedReceiptSourceSummary,
  LegacyReviewSourceFileObservation,
  LegacyReviewSourceMigrationStatus,
  LegacyReviewSourcePathFailure,
} from './contracts.js';
import type {
  LegacyReviewImportIndexPayload,
  LegacyReviewMovedReceiptLocator,
  LegacyReviewSourceDescriptor,
} from './internalTypes.js';
import { LEGACY_PATH_WINDOW_BYTES } from './limits.js';
import { textWindow } from './projections.js';
import { movedRecognitionSummary } from './sources.js';

export function migrationStatus(
  descriptor: LegacyReviewSourceDescriptor,
  digest: string,
  index: LegacyReviewImportIndexPayload,
): LegacyReviewSourceMigrationStatus {
  const exact = index.occurrences.find(
    entry =>
      entry.sourceIdentity === descriptor.sourceIdentity &&
      entry.sourceKind === descriptor.sourceKind &&
      entry.digest === digest,
  );
  if (exact !== undefined) {
    return deepFreeze({
      status: 'imported',
      sourceOccurrenceIdentity: exact.sourceOccurrenceIdentity,
    });
  }
  const exactDecision = index.decisions.find(
    entry =>
      entry.sourceIdentity === descriptor.sourceIdentity &&
      entry.sourceKind === descriptor.sourceKind &&
      entry.digest === digest,
  );
  if (exactDecision !== undefined) {
    return deepFreeze({
      status: exactDecision.decision,
      sourceDecisionIdentity: exactDecision.sourceDecisionIdentity,
    });
  }
  const imported = index.occurrences.some(
    entry => entry.sourceIdentity === descriptor.sourceIdentity && entry.sourceKind === descriptor.sourceKind,
  );
  const priorDecision = [...index.decisions]
    .reverse()
    .find(
      entry => entry.sourceIdentity === descriptor.sourceIdentity && entry.sourceKind === descriptor.sourceKind,
    )?.decision;
  return imported || priorDecision !== undefined
    ? deepFreeze({
        status: 'changed-since-decision',
        currentDecision: 'undecided',
        priorDecision: imported ? 'imported' : priorDecision!,
      })
    : Object.freeze({ status: 'undecided' });
}

export function fileObservation(
  descriptor: LegacyReviewSourceDescriptor,
  capture: LegacyReviewSourceCaptured,
  index: LegacyReviewImportIndexPayload,
): LegacyReviewSourceFileObservation {
  return {
    status: 'detected',
    byteLength: capture.byteLength,
    digest: capture.digest,
    mode: capture.metadata.mode,
    modifiedNanoseconds: capture.metadata.modifiedNanoseconds,
    changedNanoseconds: capture.metadata.changedNanoseconds,
    migration: migrationStatus(descriptor, capture.digest, index),
  };
}

export function pathFailure(
  result: Exclude<LegacyReviewSourceResult, LegacyReviewSourceCaptured>,
): LegacyReviewSourcePathFailure {
  return result.reason === 'missing'
    ? Object.freeze({ status: 'missing' })
    : Object.freeze({ status: 'unavailable', reason: result.reason });
}

export function movedReceiptSourceSummary(
  locator: LegacyReviewMovedReceiptLocator,
  result: LegacyReviewSourceResult,
  migration: LegacyReviewMovedReceiptMigrationStatus,
): LegacyReviewMovedReceiptSourceSummary {
  return {
    sourceIdentity: locator.descriptor.sourceIdentity,
    sourceKind: 'receipts',
    location: 'moved-legacy-state',
    legacyCheckoutHash: locator.legacyCheckoutHash,
    legacyReceiptPath: textWindow(result.sourcePath, LEGACY_PATH_WINDOW_BYTES),
    observation:
      result.status === 'captured'
        ? {
            status: 'detected',
            byteLength: result.byteLength,
            digest: result.digest,
            mode: result.metadata.mode,
            modifiedNanoseconds: result.metadata.modifiedNanoseconds,
            changedNanoseconds: result.metadata.changedNanoseconds,
            migration,
            recognition: movedRecognitionSummary(result.recognition),
          }
        : pathFailure(result),
  };
}
