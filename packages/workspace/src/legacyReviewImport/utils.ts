import type { LegacyReviewSourceKind } from '../legacyReviewSource.js';
import { textDecoder, textEncoder } from '../recordCodec.js';
import type { ReviewIdentity, ReviewQuestionDraftIdentity, ReviewSnapshotIdentity } from '../reviewing/index.js';
import type { WorkspaceIdentity } from '../workspace.js';
import type {
  LegacyReviewCandidateDecisionIdentity,
  LegacyReviewCandidatePromotionIdentity,
  LegacyReviewMovedSourceAssociationIdentity,
  LegacyReviewQueueCandidateDecision,
  LegacyReviewQueueCandidateIdentity,
  LegacyReviewSourceDecision,
  LegacyReviewSourceDecisionIdentity,
  LegacyReviewSourceIdentity,
  LegacyReviewSourceLocation,
  LegacyReviewSourceOccurrenceIdentity,
} from './contracts.js';
import { LegacyReviewImportStateProblem } from './internalTypes.js';
import {
  CANDIDATE_DECISION_IDENTITY_PATTERN,
  CANDIDATE_PROMOTION_IDENTITY_PATTERN,
  DIGEST_PATTERN,
  MAX_COMMAND_IDENTITY_BYTES,
  MAX_DECIMAL_BYTES,
  MOVED_SOURCE_ASSOCIATION_IDENTITY_PATTERN,
  QUEUE_CANDIDATE_IDENTITY_PATTERN,
  REVIEW_DRAFT_IDENTITY_PATTERN,
  REVIEW_IDENTITY_PATTERN,
  REVIEW_SNAPSHOT_IDENTITY_PATTERN,
  SIGNED_DECIMAL_PATTERN,
  SOURCE_DECISION_IDENTITY_PATTERN,
  SOURCE_IDENTITY_PATTERN,
  SOURCE_OCCURRENCE_IDENTITY_PATTERN,
  UNSIGNED_DECIMAL_PATTERN,
  WORKSPACE_IDENTITY_PATTERN,
} from './limits.js';

export function boundedCommandIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes('\u0000') &&
    Buffer.byteLength(value) <= MAX_COMMAND_IDENTITY_BYTES
  );
}

export function validWorkspaceIdentity(value: unknown): value is WorkspaceIdentity {
  return typeof value === 'string' && WORKSPACE_IDENTITY_PATTERN.test(value);
}

export function validSourceIdentity(value: unknown): value is LegacyReviewSourceIdentity {
  return typeof value === 'string' && SOURCE_IDENTITY_PATTERN.test(value);
}

export function validOccurrenceIdentity(value: unknown): value is LegacyReviewSourceOccurrenceIdentity {
  return typeof value === 'string' && SOURCE_OCCURRENCE_IDENTITY_PATTERN.test(value);
}

export function validDecisionIdentity(value: unknown): value is LegacyReviewSourceDecisionIdentity {
  return typeof value === 'string' && SOURCE_DECISION_IDENTITY_PATTERN.test(value);
}

export function validQueueCandidateIdentity(value: unknown): value is LegacyReviewQueueCandidateIdentity {
  return typeof value === 'string' && QUEUE_CANDIDATE_IDENTITY_PATTERN.test(value);
}

export function validCandidateDecisionIdentity(value: unknown): value is LegacyReviewCandidateDecisionIdentity {
  return typeof value === 'string' && CANDIDATE_DECISION_IDENTITY_PATTERN.test(value);
}

export function validMovedSourceAssociationIdentity(
  value: unknown,
): value is LegacyReviewMovedSourceAssociationIdentity {
  return typeof value === 'string' && MOVED_SOURCE_ASSOCIATION_IDENTITY_PATTERN.test(value);
}

export function validCandidatePromotionIdentity(value: unknown): value is LegacyReviewCandidatePromotionIdentity {
  return typeof value === 'string' && CANDIDATE_PROMOTION_IDENTITY_PATTERN.test(value);
}

export function validReviewIdentity(value: unknown): value is ReviewIdentity {
  return typeof value === 'string' && REVIEW_IDENTITY_PATTERN.test(value);
}

export function validReviewSnapshotIdentity(value: unknown): value is ReviewSnapshotIdentity {
  return typeof value === 'string' && REVIEW_SNAPSHOT_IDENTITY_PATTERN.test(value);
}

export function validReviewDraftIdentity(value: unknown): value is ReviewQuestionDraftIdentity {
  return typeof value === 'string' && REVIEW_DRAFT_IDENTITY_PATTERN.test(value);
}

export function sourceDecision(value: unknown): value is LegacyReviewSourceDecision {
  return value === 'deferred' || value === 'dismissed';
}

export function candidateDecision(value: unknown): value is LegacyReviewQueueCandidateDecision {
  return value === 'deferred' || value === 'dismissed';
}

export function validDigest(value: unknown): value is string {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  return typeof error.code === 'string' ? error.code : undefined;
}

export function sourceKind(value: unknown): value is LegacyReviewSourceKind {
  return value === 'queue' || value === 'receipts';
}

export function sourceLocation(value: unknown): value is LegacyReviewSourceLocation {
  return value === 'current-checkout' || value === 'current-legacy-state' || value === 'moved-legacy-state';
}

export function sourceLocationMatchesKind(
  sourceKind_: LegacyReviewSourceKind,
  location: LegacyReviewSourceLocation,
): boolean {
  return sourceKind_ === 'queue'
    ? location === 'current-checkout'
    : location === 'current-legacy-state' || location === 'moved-legacy-state';
}

export function unsignedDecimal(value: unknown): value is string {
  return (
    typeof value === 'string' && Buffer.byteLength(value) <= MAX_DECIMAL_BYTES && UNSIGNED_DECIMAL_PATTERN.test(value)
  );
}

export function signedDecimal(value: unknown): value is string {
  return (
    typeof value === 'string' && Buffer.byteLength(value) <= MAX_DECIMAL_BYTES && SIGNED_DECIMAL_PATTERN.test(value)
  );
}

export function observedLegacyVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function encode(value: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(value));
}

export function decode(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(textDecoder.decode(bytes)) as unknown;
  } catch {
    throw new LegacyReviewImportStateProblem();
  }
}
