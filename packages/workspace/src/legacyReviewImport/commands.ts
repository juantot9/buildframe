import type { LegacyReviewSourceUnavailableReason } from '../legacyReviewSource.js';
import { deepFreeze, hasOnlyKeys, isRecord, safeVersion } from '../recordCodec.js';
import type {
  LegacyReviewCommand,
  LegacyReviewCommandRejected,
  LegacyReviewCommandRejectionReason,
  LegacyReviewCommandResult,
  LegacyReviewMovedReceiptCommandRejectionReason,
  LegacyReviewMovedReceiptSourceAssociatedAndImported,
  LegacyReviewQueueCandidateCommandRejected,
  LegacyReviewQueueCandidateCommandRejectionReason,
  LegacyReviewQueueCandidateDecisionRecorded,
  LegacyReviewSourceCommandRejected,
  LegacyReviewSourceCommandRejectionReason,
  LegacyReviewSourceDecisionRecorded,
  LegacyReviewSourceImported,
} from './contracts.js';
import { LegacyReviewImportStateProblem } from './internalTypes.js';
import { LEGACY_CHECKOUT_HASH_PATTERN } from './limits.js';
import {
  boundedCommandIdentity,
  candidateDecision,
  sourceDecision,
  sourceKind,
  validCandidateDecisionIdentity,
  validDecisionIdentity,
  validDigest,
  validMovedSourceAssociationIdentity,
  validOccurrenceIdentity,
  validQueueCandidateIdentity,
  validSourceIdentity,
} from './utils.js';

export function normalizedCommand(command: LegacyReviewCommand): string {
  return JSON.stringify(command);
}

export function parseAccepted(value: unknown): LegacyReviewSourceImported {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'sourceKind',
      'digest',
      'preservation',
    ]) ||
    value.kind !== 'legacy-review.source.imported' ||
    value.status !== 'accepted' ||
    !boundedCommandIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !sourceKind(value.sourceKind) ||
    !validDigest(value.digest) ||
    (value.preservation !== 'preserved' && value.preservation !== 'already-preserved')
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return value as unknown as LegacyReviewSourceImported;
}

export function parseMovedAssociationAccepted(value: unknown): LegacyReviewMovedReceiptSourceAssociatedAndImported {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'sourceIdentity',
      'associationIdentity',
      'sourceOccurrenceIdentity',
      'sourceKind',
      'location',
      'legacyCheckoutHash',
      'digest',
      'association',
      'preservation',
    ]) ||
    value.kind !== 'legacy-review.moved-receipt-source.associated-and-imported' ||
    value.status !== 'accepted' ||
    !boundedCommandIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validMovedSourceAssociationIdentity(value.associationIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    value.sourceKind !== 'receipts' ||
    value.location !== 'moved-legacy-state' ||
    typeof value.legacyCheckoutHash !== 'string' ||
    !LEGACY_CHECKOUT_HASH_PATTERN.test(value.legacyCheckoutHash) ||
    !validDigest(value.digest) ||
    (value.association !== 'recorded' && value.association !== 'already-recorded') ||
    (value.preservation !== 'preserved' && value.preservation !== 'already-preserved')
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return value as unknown as LegacyReviewMovedReceiptSourceAssociatedAndImported;
}

export function parseDecisionAccepted(value: unknown): LegacyReviewSourceDecisionRecorded {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'sourceIdentity',
      'sourceDecisionIdentity',
      'sourceKind',
      'digest',
      'decision',
      'recording',
    ]) ||
    value.kind !== 'legacy-review.source.decision-recorded' ||
    value.status !== 'accepted' ||
    !boundedCommandIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validDecisionIdentity(value.sourceDecisionIdentity) ||
    !sourceKind(value.sourceKind) ||
    !validDigest(value.digest) ||
    !sourceDecision(value.decision) ||
    (value.recording !== 'recorded' && value.recording !== 'already-recorded')
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return value as unknown as LegacyReviewSourceDecisionRecorded;
}

export function parseCandidateDecisionAccepted(value: unknown): LegacyReviewQueueCandidateDecisionRecorded {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'digest',
      'candidateIdentity',
      'candidateDecisionIdentity',
      'decision',
      'recording',
    ]) ||
    value.kind !== 'legacy-review.queue-candidate.decision-recorded' ||
    value.status !== 'accepted' ||
    !boundedCommandIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validDigest(value.digest) ||
    !validQueueCandidateIdentity(value.candidateIdentity) ||
    !validCandidateDecisionIdentity(value.candidateDecisionIdentity) ||
    !candidateDecision(value.decision) ||
    (value.recording !== 'recorded' && value.recording !== 'already-recorded')
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return value as unknown as LegacyReviewQueueCandidateDecisionRecorded;
}

export function parseRejected(value: unknown): LegacyReviewCommandRejected {
  const sourceReasons: readonly (
    | LegacyReviewSourceCommandRejectionReason
    | LegacyReviewMovedReceiptCommandRejectionReason
  )[] = [
    'state-version-mismatch',
    'command-identity-conflict',
    'state-conflict',
    'source-identity-unknown',
    'source-not-found',
    'source-unavailable',
    'source-changed',
    'source-already-imported',
    'source-occurrence-limit',
    'source-decision-limit',
    'workspace-identity-mismatch',
    'current-source-ineligible',
    'source-identity-mismatch',
    'source-unrecognized',
    'moved-source-association-limit',
  ];
  const candidateReasons: readonly LegacyReviewQueueCandidateCommandRejectionReason[] = [
    'state-version-mismatch',
    'command-identity-conflict',
    'state-conflict',
    'source-occurrence-not-imported',
    'candidate-source-unavailable',
    'candidate-not-found',
    'candidate-already-promoted',
    'candidate-decision-limit',
  ];
  const failures: readonly Exclude<LegacyReviewSourceUnavailableReason, 'missing'>[] = [
    'unsafe-path',
    'not-regular-file',
    'unreadable',
    'source-too-large',
    'changed-during-read',
  ];
  if (
    !isRecord(value) ||
    value.kind !== 'legacy-review.command.rejected' ||
    value.status !== 'rejected' ||
    !boundedCommandIdentity(value.commandIdentity) ||
    !safeVersion(value.stateVersion)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  if (Object.hasOwn(value, 'sourceIdentity')) {
    if (
      !hasOnlyKeys(
        value,
        ['kind', 'status', 'commandIdentity', 'stateVersion', 'sourceIdentity', 'reason'],
        ['sourceFailure', 'observedDigest'],
      ) ||
      !validSourceIdentity(value.sourceIdentity) ||
      !sourceReasons.includes(
        value.reason as LegacyReviewSourceCommandRejectionReason | LegacyReviewMovedReceiptCommandRejectionReason,
      ) ||
      (value.reason === 'source-unavailable'
        ? !failures.includes(value.sourceFailure as (typeof failures)[number])
        : value.sourceFailure !== undefined) ||
      (value.reason === 'source-changed' ? !validDigest(value.observedDigest) : value.observedDigest !== undefined)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return value as unknown as LegacyReviewSourceCommandRejected;
  }
  if (
    !hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'sourceOccurrenceIdentity',
      'candidateIdentity',
      'reason',
    ]) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validQueueCandidateIdentity(value.candidateIdentity) ||
    !candidateReasons.includes(value.reason as LegacyReviewQueueCandidateCommandRejectionReason)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return value as unknown as LegacyReviewQueueCandidateCommandRejected;
}

export function parseResult(value: unknown): LegacyReviewCommandResult {
  if (!isRecord(value)) throw new LegacyReviewImportStateProblem();
  if (value.status !== 'accepted') return parseRejected(value);
  if (value.kind === 'legacy-review.source.imported') {
    return parseAccepted(value);
  }
  if (value.kind === 'legacy-review.moved-receipt-source.associated-and-imported') {
    return parseMovedAssociationAccepted(value);
  }
  return value.kind === 'legacy-review.source.decision-recorded'
    ? parseDecisionAccepted(value)
    : parseCandidateDecisionAccepted(value);
}

export function rejected(
  command: LegacyReviewCommand,
  stateVersion: number,
  reason: LegacyReviewCommandRejectionReason,
  details: {
    readonly sourceFailure?: Exclude<LegacyReviewSourceUnavailableReason, 'missing'>;
    readonly observedDigest?: string;
  } = {},
): LegacyReviewCommandRejected {
  if (command.kind === 'legacy-review.queue-candidate.decision.set') {
    return deepFreeze({
      kind: 'legacy-review.command.rejected',
      status: 'rejected',
      commandIdentity: command.commandIdentity,
      stateVersion,
      sourceOccurrenceIdentity: command.sourceOccurrenceIdentity,
      candidateIdentity: command.candidateIdentity,
      reason: reason as LegacyReviewQueueCandidateCommandRejectionReason,
    });
  }
  return deepFreeze({
    kind: 'legacy-review.command.rejected',
    status: 'rejected',
    commandIdentity: command.commandIdentity,
    stateVersion,
    sourceIdentity: command.sourceIdentity,
    reason: reason as LegacyReviewSourceCommandRejectionReason | LegacyReviewMovedReceiptCommandRejectionReason,
    ...(details.sourceFailure === undefined ? {} : { sourceFailure: details.sourceFailure }),
    ...(details.observedDigest === undefined ? {} : { observedDigest: details.observedDigest }),
  });
}
