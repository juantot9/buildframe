import { hasOnlyKeys, isRecord, safeVersion, unicodeScalarText } from '../recordCodec.js';
import type {
  LegacyReviewCommand,
  LegacyReviewMovedReceiptSearch,
  LegacyReviewMovedReceiptSourceViewRequest,
  LegacyReviewMovedReceiptSourcesViewRequest,
  LegacyReviewQueueCandidateViewRequest,
  LegacyReviewQueueCandidatesViewRequest,
  LegacyReviewReceiptBatchViewRequest,
  LegacyReviewReceiptHistoryViewRequest,
  LegacyReviewSourceIdentity,
} from './contracts.js';
import { LEGACY_CHECKOUT_HASH_PATTERN, MAX_FORMER_CANONICAL_CHECKOUT_BYTES } from './limits.js';
import {
  boundedCommandIdentity,
  candidateDecision,
  sourceDecision,
  validDigest,
  validOccurrenceIdentity,
  validQueueCandidateIdentity,
  validSourceIdentity,
  validWorkspaceIdentity,
} from './utils.js';
import path from 'node:path';

export function normalizeReceiptHistoryRequest(value: Record<string, unknown>): LegacyReviewReceiptHistoryViewRequest {
  if (
    !hasOnlyKeys(value, ['kind', 'sourceOccurrenceIdentity', 'batchOffset', 'batchLimit']) ||
    value.kind !== 'legacy-review.receipt-history' ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !safeVersion(value.batchOffset) ||
    !safeVersion(value.batchLimit, false) ||
    !Number.isSafeInteger(value.batchOffset + value.batchLimit)
  ) {
    throw new TypeError('Invalid legacy receipt history request');
  }
  return {
    kind: 'legacy-review.receipt-history',
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    batchOffset: value.batchOffset,
    batchLimit: value.batchLimit,
  };
}

export function normalizeReceiptBatchRequest(value: Record<string, unknown>): LegacyReviewReceiptBatchViewRequest {
  if (
    !hasOnlyKeys(value, ['kind', 'sourceOccurrenceIdentity', 'batchAbsolute', 'annotationOffset', 'annotationLimit']) ||
    value.kind !== 'legacy-review.receipt-batch' ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !safeVersion(value.batchAbsolute) ||
    !safeVersion(value.annotationOffset) ||
    !safeVersion(value.annotationLimit, false) ||
    !Number.isSafeInteger(value.annotationOffset + value.annotationLimit)
  ) {
    throw new TypeError('Invalid legacy receipt batch request');
  }
  return {
    kind: 'legacy-review.receipt-batch',
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    batchAbsolute: value.batchAbsolute,
    annotationOffset: value.annotationOffset,
    annotationLimit: value.annotationLimit,
  };
}

export function normalizeQueueCandidatesRequest(
  value: Record<string, unknown>,
): LegacyReviewQueueCandidatesViewRequest {
  if (
    !hasOnlyKeys(value, ['kind', 'sourceOccurrenceIdentity', 'candidateOffset', 'candidateLimit']) ||
    value.kind !== 'legacy-review.queue-candidates' ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !safeVersion(value.candidateOffset) ||
    !safeVersion(value.candidateLimit, false) ||
    !Number.isSafeInteger(value.candidateOffset + value.candidateLimit)
  ) {
    throw new TypeError('Invalid legacy queue candidates request');
  }
  return {
    kind: 'legacy-review.queue-candidates',
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    candidateOffset: value.candidateOffset,
    candidateLimit: value.candidateLimit,
  };
}

export function normalizeQueueCandidateRequest(value: Record<string, unknown>): LegacyReviewQueueCandidateViewRequest {
  if (
    !hasOnlyKeys(value, [
      'kind',
      'sourceOccurrenceIdentity',
      'candidateIdentity',
      'textUtf8Offset',
      'textUtf8Limit',
      'excerptUtf8Offset',
      'excerptUtf8Limit',
    ]) ||
    value.kind !== 'legacy-review.queue-candidate' ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validQueueCandidateIdentity(value.candidateIdentity) ||
    !safeVersion(value.textUtf8Offset) ||
    !safeVersion(value.textUtf8Limit, false) ||
    !Number.isSafeInteger(value.textUtf8Offset + value.textUtf8Limit) ||
    !safeVersion(value.excerptUtf8Offset) ||
    !safeVersion(value.excerptUtf8Limit, false) ||
    !Number.isSafeInteger(value.excerptUtf8Offset + value.excerptUtf8Limit)
  ) {
    throw new TypeError('Invalid legacy queue candidate request');
  }
  return {
    kind: 'legacy-review.queue-candidate',
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    candidateIdentity: value.candidateIdentity,
    textUtf8Offset: value.textUtf8Offset,
    textUtf8Limit: value.textUtf8Limit,
    excerptUtf8Offset: value.excerptUtf8Offset,
    excerptUtf8Limit: value.excerptUtf8Limit,
  };
}

export function normalizeMovedReceiptSearch(value: unknown): LegacyReviewMovedReceiptSearch {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Invalid moved legacy receipt search');
  }
  if (value.kind === 'legacy-state-directory') {
    if (!hasOnlyKeys(value, ['kind'])) {
      throw new TypeError('Invalid moved legacy receipt search');
    }
    return { kind: 'legacy-state-directory' };
  }
  if (
    value.kind !== 'former-checkout-path' ||
    !hasOnlyKeys(value, ['kind', 'exactFormerCanonicalCheckout']) ||
    typeof value.exactFormerCanonicalCheckout !== 'string' ||
    value.exactFormerCanonicalCheckout.length === 0 ||
    !path.isAbsolute(value.exactFormerCanonicalCheckout) ||
    path.normalize(value.exactFormerCanonicalCheckout) !== value.exactFormerCanonicalCheckout ||
    !unicodeScalarText(value.exactFormerCanonicalCheckout) ||
    value.exactFormerCanonicalCheckout.includes('\u0000') ||
    Buffer.byteLength(value.exactFormerCanonicalCheckout) > MAX_FORMER_CANONICAL_CHECKOUT_BYTES
  ) {
    throw new TypeError('Invalid moved legacy receipt search');
  }
  return {
    kind: 'former-checkout-path',
    exactFormerCanonicalCheckout: value.exactFormerCanonicalCheckout,
  };
}

export function normalizeMovedReceiptSourcesRequest(
  value: Record<string, unknown>,
): LegacyReviewMovedReceiptSourcesViewRequest {
  if (
    !hasOnlyKeys(value, ['kind', 'search', 'sourceOffset', 'sourceLimit']) ||
    value.kind !== 'legacy-review.moved-receipt-sources' ||
    !safeVersion(value.sourceOffset) ||
    !safeVersion(value.sourceLimit, false) ||
    !Number.isSafeInteger(value.sourceOffset + value.sourceLimit)
  ) {
    throw new TypeError('Invalid moved legacy receipt sources request');
  }
  return {
    kind: 'legacy-review.moved-receipt-sources',
    search: normalizeMovedReceiptSearch(value.search),
    sourceOffset: value.sourceOffset,
    sourceLimit: value.sourceLimit,
  };
}

export function normalizeMovedReceiptSourceRequest(
  value: Record<string, unknown>,
): LegacyReviewMovedReceiptSourceViewRequest {
  if (
    !hasOnlyKeys(value, [
      'kind',
      'sourceIdentity',
      'legacyCheckoutHash',
      'legacyWorkspacePathOffset',
      'legacyWorkspacePathLimit',
    ]) ||
    value.kind !== 'legacy-review.moved-receipt-source' ||
    !validSourceIdentity(value.sourceIdentity) ||
    typeof value.legacyCheckoutHash !== 'string' ||
    !LEGACY_CHECKOUT_HASH_PATTERN.test(value.legacyCheckoutHash) ||
    !safeVersion(value.legacyWorkspacePathOffset) ||
    !safeVersion(value.legacyWorkspacePathLimit, false) ||
    !Number.isSafeInteger(value.legacyWorkspacePathOffset + value.legacyWorkspacePathLimit)
  ) {
    throw new TypeError('Invalid moved legacy receipt source request');
  }
  return {
    kind: 'legacy-review.moved-receipt-source',
    sourceIdentity: value.sourceIdentity,
    legacyCheckoutHash: value.legacyCheckoutHash,
    legacyWorkspacePathOffset: value.legacyWorkspacePathOffset,
    legacyWorkspacePathLimit: value.legacyWorkspacePathLimit,
  };
}

export function normalizeCommand(value: unknown): LegacyReviewCommand {
  if (!isRecord(value)) {
    throw new TypeError('Invalid legacy Review command');
  }
  if (value.kind === 'legacy-review.queue-candidate.decision.set') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'sourceOccurrenceIdentity',
        'candidateIdentity',
        'decision',
      ]) ||
      !boundedCommandIdentity(value.commandIdentity) ||
      !safeVersion(value.expectedStateVersion) ||
      !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
      !validQueueCandidateIdentity(value.candidateIdentity) ||
      !candidateDecision(value.decision)
    ) {
      throw new TypeError('Invalid legacy Review candidate decision command');
    }
    return {
      kind: 'legacy-review.queue-candidate.decision.set',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
      candidateIdentity: value.candidateIdentity,
      decision: value.decision,
    };
  }
  if (value.kind === 'legacy-review.moved-receipt-source.associate-and-import') {
    if (
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'confirmedWorkspaceIdentity',
        'sourceIdentity',
        'legacyCheckoutHash',
        'expectedDigest',
      ]) ||
      !boundedCommandIdentity(value.commandIdentity) ||
      !safeVersion(value.expectedStateVersion) ||
      !validWorkspaceIdentity(value.confirmedWorkspaceIdentity) ||
      !validSourceIdentity(value.sourceIdentity) ||
      typeof value.legacyCheckoutHash !== 'string' ||
      !LEGACY_CHECKOUT_HASH_PATTERN.test(value.legacyCheckoutHash) ||
      !validDigest(value.expectedDigest)
    ) {
      throw new TypeError('Invalid moved legacy receipt association command');
    }
    return {
      kind: 'legacy-review.moved-receipt-source.associate-and-import',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      confirmedWorkspaceIdentity: value.confirmedWorkspaceIdentity,
      sourceIdentity: value.sourceIdentity,
      legacyCheckoutHash: value.legacyCheckoutHash,
      expectedDigest: value.expectedDigest,
    };
  }
  const common =
    boundedCommandIdentity(value.commandIdentity) &&
    safeVersion(value.expectedStateVersion) &&
    validSourceIdentity(value.sourceIdentity) &&
    validDigest(value.expectedDigest);
  if (value.kind === 'legacy-review.source.import') {
    if (
      !common ||
      !hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'sourceIdentity', 'expectedDigest'])
    ) {
      throw new TypeError('Invalid legacy Review import command');
    }
    return {
      kind: 'legacy-review.source.import',
      commandIdentity: value.commandIdentity as string,
      expectedStateVersion: value.expectedStateVersion as number,
      sourceIdentity: value.sourceIdentity as LegacyReviewSourceIdentity,
      expectedDigest: value.expectedDigest as string,
    };
  }
  if (value.kind === 'legacy-review.source.decision.set') {
    if (
      !common ||
      !hasOnlyKeys(value, [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'sourceIdentity',
        'expectedDigest',
        'decision',
      ]) ||
      !sourceDecision(value.decision)
    ) {
      throw new TypeError('Invalid legacy Review source decision command');
    }
    return {
      kind: 'legacy-review.source.decision.set',
      commandIdentity: value.commandIdentity as string,
      expectedStateVersion: value.expectedStateVersion as number,
      sourceIdentity: value.sourceIdentity as LegacyReviewSourceIdentity,
      expectedDigest: value.expectedDigest as string,
      decision: value.decision,
    };
  }
  throw new TypeError('Unknown legacy Review command');
}
