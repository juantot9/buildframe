import type { StateRecord } from '../authoritativeState.js';
import {
  MAX_LEGACY_REVIEW_SOURCE_ENTRIES,
  type LegacyReviewRecognitionReason,
  type LegacyReviewSourceKind,
  type LegacyReviewSourceMetadata,
} from '../legacyReviewSource.js';
import { hasOnlyKeys, isRecord, safeVersion } from '../recordCodec.js';
import type { WorkspaceIdentity } from '../baseTypes.js';
import { MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES } from './contracts.js';
import {
  legacyReviewCandidateDecisionIdentity,
  legacyReviewCandidatePromotionIdentity,
  legacyReviewMovedSourceAssociationIdentity,
  legacyReviewSourceDecisionIdentity,
  legacyReviewSourceOccurrenceIdentity,
} from './identities.js';
import {
  LegacyReviewImportStateProblem,
  type LegacyReviewCandidateDecisionPayload,
  type LegacyReviewCandidatePromotionPayload,
  type LegacyReviewImportIndexPayload,
  type LegacyReviewMovedSourceAssociationPayload,
  type LegacyReviewSourceDecisionPayload,
  type LegacyReviewSourceOccurrencePayload,
} from './internalTypes.js';
import {
  LEGACY_CHECKOUT_HASH_PATTERN,
  LEGACY_REVIEW_IMPORT_FORMAT_VERSION,
  MAX_LEGACY_REVIEW_SOURCE_PATH_BYTES,
} from './limits.js';
import {
  boundedCommandIdentity,
  candidateDecision,
  decode,
  observedLegacyVersion,
  signedDecimal,
  sourceDecision,
  sourceKind,
  sourceLocation,
  sourceLocationMatchesKind,
  unsignedDecimal,
  validCandidateDecisionIdentity,
  validCandidatePromotionIdentity,
  validDecisionIdentity,
  validDigest,
  validMovedSourceAssociationIdentity,
  validOccurrenceIdentity,
  validQueueCandidateIdentity,
  validReviewDraftIdentity,
  validReviewIdentity,
  validReviewSnapshotIdentity,
  validSourceIdentity,
} from './utils.js';
import path from 'node:path';

export function parseRecognitionSummary(
  value: unknown,
  expectedKind: LegacyReviewSourceKind,
): LegacyReviewSourceOccurrencePayload['recognition'] {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new LegacyReviewImportStateProblem();
  }
  if (value.status === 'unrecognized') {
    const reasons: readonly LegacyReviewRecognitionReason[] = [
      'malformed-utf8',
      'malformed-json',
      'unsupported-newer-version',
      'unsupported-version',
      'invalid-structure',
      'duplicate-identity',
      'entry-limit-exceeded',
    ];
    if (
      !hasOnlyKeys(value, ['status', 'reason'], ['observedVersion']) ||
      !reasons.includes(value.reason as LegacyReviewRecognitionReason) ||
      (value.reason === 'unsupported-newer-version'
        ? !observedLegacyVersion(value.observedVersion)
        : value.observedVersion !== undefined)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      status: 'unrecognized',
      reason: value.reason as LegacyReviewRecognitionReason,
      ...(value.observedVersion === undefined ? {} : { observedVersion: value.observedVersion as number }),
    };
  }
  if (value.status !== 'recognized') {
    throw new LegacyReviewImportStateProblem();
  }
  if (expectedKind === 'queue') {
    if (
      !hasOnlyKeys(value, ['status', 'format', 'totalAnnotations']) ||
      (value.format !== 'queue-array-v1' && value.format !== 'queue-v1' && value.format !== 'queue-v2') ||
      !safeVersion(value.totalAnnotations) ||
      value.totalAnnotations > MAX_LEGACY_REVIEW_SOURCE_ENTRIES
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      status: 'recognized',
      format: value.format,
      totalAnnotations: value.totalAnnotations,
    };
  }
  if (
    !hasOnlyKeys(value, ['status', 'format', 'totalBatches', 'totalAnnotations', 'legacyWorkspacePaths']) ||
    value.format !== 'receipts-v1' ||
    !safeVersion(value.totalBatches) ||
    value.totalBatches > MAX_LEGACY_REVIEW_SOURCE_ENTRIES ||
    !safeVersion(value.totalAnnotations) ||
    value.totalAnnotations > MAX_LEGACY_REVIEW_SOURCE_ENTRIES ||
    value.totalBatches + value.totalAnnotations > MAX_LEGACY_REVIEW_SOURCE_ENTRIES ||
    !isRecord(value.legacyWorkspacePaths)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const paths = value.legacyWorkspacePaths;
  if (
    !hasOnlyKeys(paths, ['totalDistinct', 'values', 'omitted']) ||
    !safeVersion(paths.totalDistinct) ||
    paths.totalDistinct > MAX_LEGACY_REVIEW_SOURCE_ENTRIES ||
    !safeVersion(paths.omitted) ||
    !Array.isArray(paths.values) ||
    paths.values.length > 32 ||
    !paths.values.every(
      item => typeof item === 'string' && path.isAbsolute(item) && Buffer.byteLength(item) <= 4_096,
    ) ||
    new Set(paths.values).size !== paths.values.length ||
    paths.totalDistinct !== paths.values.length + paths.omitted
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    status: 'recognized',
    format: 'receipts-v1',
    totalBatches: value.totalBatches,
    totalAnnotations: value.totalAnnotations,
    legacyWorkspacePaths: {
      totalDistinct: paths.totalDistinct,
      values: [...paths.values] as string[],
      omitted: paths.omitted,
    },
  };
}

export function parseMetadata(value: unknown): LegacyReviewSourceMetadata {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['device', 'inode', 'mode', 'byteLength', 'modifiedNanoseconds', 'changedNanoseconds']) ||
    !unsignedDecimal(value.device) ||
    !unsignedDecimal(value.inode) ||
    !safeVersion(value.mode) ||
    !safeVersion(value.byteLength) ||
    !signedDecimal(value.modifiedNanoseconds) ||
    !signedDecimal(value.changedNanoseconds)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    device: value.device,
    inode: value.inode,
    mode: value.mode,
    byteLength: value.byteLength,
    modifiedNanoseconds: value.modifiedNanoseconds,
    changedNanoseconds: value.changedNanoseconds,
  };
}

export function parseIndex(value: unknown): LegacyReviewImportIndexPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['formatVersion', 'occurrences'],
      ['decisions', 'candidateDecisions', 'movedSourceAssociations', 'candidatePromotions'],
    ) ||
    value.formatVersion !== LEGACY_REVIEW_IMPORT_FORMAT_VERSION ||
    !Array.isArray(value.occurrences) ||
    (value.decisions !== undefined && !Array.isArray(value.decisions)) ||
    (value.candidateDecisions !== undefined && !Array.isArray(value.candidateDecisions)) ||
    (value.movedSourceAssociations !== undefined && !Array.isArray(value.movedSourceAssociations)) ||
    (value.candidatePromotions !== undefined && !Array.isArray(value.candidatePromotions))
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const decisionsValue = value.decisions ?? [];
  const candidateDecisionsValue = value.candidateDecisions ?? [];
  const movedSourceAssociationsValue = value.movedSourceAssociations ?? [];
  const candidatePromotionsValue = value.candidatePromotions ?? [];
  if (
    value.occurrences.length +
      decisionsValue.length +
      candidateDecisionsValue.length +
      movedSourceAssociationsValue.length +
      candidatePromotionsValue.length >
    MAX_LEGACY_REVIEW_IMPORT_OCCURRENCES
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const occurrences = value.occurrences.map(candidate => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, ['sourceOccurrenceIdentity', 'sourceIdentity', 'sourceKind', 'digest', 'decision']) ||
      !validOccurrenceIdentity(candidate.sourceOccurrenceIdentity) ||
      !validSourceIdentity(candidate.sourceIdentity) ||
      !sourceKind(candidate.sourceKind) ||
      !validDigest(candidate.digest) ||
      candidate.decision !== 'imported'
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      sourceOccurrenceIdentity: candidate.sourceOccurrenceIdentity,
      sourceIdentity: candidate.sourceIdentity,
      sourceKind: candidate.sourceKind,
      digest: candidate.digest,
      decision: 'imported' as const,
    };
  });
  const decisions = decisionsValue.map(candidate => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, ['sourceDecisionIdentity', 'sourceIdentity', 'sourceKind', 'digest', 'decision']) ||
      !validDecisionIdentity(candidate.sourceDecisionIdentity) ||
      !validSourceIdentity(candidate.sourceIdentity) ||
      !sourceKind(candidate.sourceKind) ||
      !validDigest(candidate.digest) ||
      !sourceDecision(candidate.decision)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      sourceDecisionIdentity: candidate.sourceDecisionIdentity,
      sourceIdentity: candidate.sourceIdentity,
      sourceKind: candidate.sourceKind,
      digest: candidate.digest,
      decision: candidate.decision,
    };
  });
  const candidateDecisions = candidateDecisionsValue.map(candidate => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        'candidateDecisionIdentity',
        'sourceOccurrenceIdentity',
        'candidateIdentity',
        'decision',
      ]) ||
      !validCandidateDecisionIdentity(candidate.candidateDecisionIdentity) ||
      !validOccurrenceIdentity(candidate.sourceOccurrenceIdentity) ||
      !validQueueCandidateIdentity(candidate.candidateIdentity) ||
      !candidateDecision(candidate.decision)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      candidateDecisionIdentity: candidate.candidateDecisionIdentity,
      sourceOccurrenceIdentity: candidate.sourceOccurrenceIdentity,
      candidateIdentity: candidate.candidateIdentity,
      decision: candidate.decision,
    };
  });
  const movedSourceAssociations = movedSourceAssociationsValue.map(candidate => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        'associationIdentity',
        'sourceOccurrenceIdentity',
        'sourceIdentity',
        'digest',
        'legacyCheckoutHash',
      ]) ||
      !validMovedSourceAssociationIdentity(candidate.associationIdentity) ||
      !validOccurrenceIdentity(candidate.sourceOccurrenceIdentity) ||
      !validSourceIdentity(candidate.sourceIdentity) ||
      !validDigest(candidate.digest) ||
      typeof candidate.legacyCheckoutHash !== 'string' ||
      !LEGACY_CHECKOUT_HASH_PATTERN.test(candidate.legacyCheckoutHash)
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      associationIdentity: candidate.associationIdentity,
      sourceOccurrenceIdentity: candidate.sourceOccurrenceIdentity,
      sourceIdentity: candidate.sourceIdentity,
      digest: candidate.digest,
      legacyCheckoutHash: candidate.legacyCheckoutHash,
    };
  });
  const candidatePromotions = candidatePromotionsValue.map(candidate => {
    if (
      !isRecord(candidate) ||
      !hasOnlyKeys(candidate, [
        'promotionIdentity',
        'sourceOccurrenceIdentity',
        'sourceIdentity',
        'digest',
        'candidateIdentity',
        'reviewIdentity',
        'reviewSnapshotIdentity',
        'draftIdentity',
        'intent',
      ]) ||
      !validCandidatePromotionIdentity(candidate.promotionIdentity) ||
      !validOccurrenceIdentity(candidate.sourceOccurrenceIdentity) ||
      !validSourceIdentity(candidate.sourceIdentity) ||
      !validDigest(candidate.digest) ||
      !validQueueCandidateIdentity(candidate.candidateIdentity) ||
      !validReviewIdentity(candidate.reviewIdentity) ||
      !validReviewSnapshotIdentity(candidate.reviewSnapshotIdentity) ||
      !validReviewDraftIdentity(candidate.draftIdentity) ||
      candidate.intent !== 'question'
    ) {
      throw new LegacyReviewImportStateProblem();
    }
    return {
      promotionIdentity: candidate.promotionIdentity,
      sourceOccurrenceIdentity: candidate.sourceOccurrenceIdentity,
      sourceIdentity: candidate.sourceIdentity,
      digest: candidate.digest,
      candidateIdentity: candidate.candidateIdentity,
      reviewIdentity: candidate.reviewIdentity,
      reviewSnapshotIdentity: candidate.reviewSnapshotIdentity,
      draftIdentity: candidate.draftIdentity,
      intent: 'question' as const,
    };
  });
  const occurrenceIdentities = new Set(occurrences.map(entry => entry.sourceOccurrenceIdentity));
  const sourceDecisionIdentities = new Set(decisions.map(entry => entry.sourceDecisionIdentity));
  const candidateDecisionIdentities = new Set(candidateDecisions.map(entry => entry.candidateDecisionIdentity));
  const associationIdentities = new Set(movedSourceAssociations.map(entry => entry.associationIdentity));
  const associationOccurrenceIdentities = new Set(movedSourceAssociations.map(entry => entry.sourceOccurrenceIdentity));
  const promotionIdentities = new Set(candidatePromotions.map(entry => entry.promotionIdentity));
  const promotedCandidateIdentities = new Set(candidatePromotions.map(entry => entry.candidateIdentity));
  const promotedDraftIdentities = new Set(candidatePromotions.map(entry => entry.draftIdentity));
  const occurrenceKeys = new Set(occurrences.map(entry => `${entry.sourceIdentity}\0${entry.digest}`));
  const decisionKeys = new Set(decisions.map(entry => `${entry.sourceIdentity}\0${entry.digest}`));
  const candidateKeys = new Set(candidateDecisions.map(entry => entry.candidateIdentity));
  const occurrenceByIdentity = new Map(occurrences.map(entry => [entry.sourceOccurrenceIdentity, entry]));
  if (
    occurrenceIdentities.size !== occurrences.length ||
    sourceDecisionIdentities.size !== decisions.length ||
    candidateDecisionIdentities.size !== candidateDecisions.length ||
    associationIdentities.size !== movedSourceAssociations.length ||
    associationOccurrenceIdentities.size !== movedSourceAssociations.length ||
    promotionIdentities.size !== candidatePromotions.length ||
    promotedCandidateIdentities.size !== candidatePromotions.length ||
    promotedDraftIdentities.size !== candidatePromotions.length ||
    occurrenceKeys.size !== occurrences.length ||
    decisionKeys.size !== decisions.length ||
    candidateKeys.size !== candidateDecisions.length ||
    [...decisionKeys].some(key => occurrenceKeys.has(key)) ||
    candidateDecisions.some(
      entry => occurrenceByIdentity.get(entry.sourceOccurrenceIdentity)?.sourceKind !== 'queue',
    ) ||
    movedSourceAssociations.some(entry => {
      const occurrence = occurrenceByIdentity.get(entry.sourceOccurrenceIdentity);
      return (
        occurrence === undefined ||
        occurrence.sourceKind !== 'receipts' ||
        occurrence.sourceIdentity !== entry.sourceIdentity ||
        occurrence.digest !== entry.digest
      );
    }) ||
    candidatePromotions.some(entry => {
      const occurrence = occurrenceByIdentity.get(entry.sourceOccurrenceIdentity);
      return (
        occurrence === undefined ||
        occurrence.sourceKind !== 'queue' ||
        occurrence.sourceIdentity !== entry.sourceIdentity ||
        occurrence.digest !== entry.digest
      );
    })
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    occurrences,
    decisions,
    ...(value.candidateDecisions === undefined ? {} : { candidateDecisions }),
    ...(value.movedSourceAssociations === undefined ? {} : { movedSourceAssociations }),
    ...(value.candidatePromotions === undefined ? {} : { candidatePromotions }),
  };
}

export function parseOccurrence(
  record: StateRecord,
  workspaceIdentity: WorkspaceIdentity,
): LegacyReviewSourceOccurrencePayload {
  if (
    record.kind !== 'legacy-review.source-occurrence' ||
    record.recordClass !== 'immutable' ||
    record.schemaVersion !== 1 ||
    record.content.length !== 1 ||
    record.content[0]?.role !== 'legacy-source'
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const value = decode(record.payload);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'parserVersion',
      'sourceOccurrenceIdentity',
      'sourceIdentity',
      'workspaceIdentity',
      'sourceKind',
      'location',
      'sourcePath',
      'digest',
      'byteLength',
      'metadata',
      'recognition',
      'decision',
      'importCommandIdentity',
      'importedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    value.parserVersion !== 1 ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    record.recordIdentity !== value.sourceOccurrenceIdentity ||
    !validSourceIdentity(value.sourceIdentity) ||
    value.workspaceIdentity !== workspaceIdentity ||
    !sourceKind(value.sourceKind) ||
    !sourceLocation(value.location) ||
    !sourceLocationMatchesKind(value.sourceKind, value.location) ||
    typeof value.sourcePath !== 'string' ||
    value.sourcePath.length === 0 ||
    !path.isAbsolute(value.sourcePath) ||
    Buffer.byteLength(value.sourcePath) > MAX_LEGACY_REVIEW_SOURCE_PATH_BYTES ||
    value.sourcePath.includes('\u0000') ||
    !validDigest(value.digest) ||
    value.sourceOccurrenceIdentity !==
      legacyReviewSourceOccurrenceIdentity(workspaceIdentity, value.sourceIdentity, value.digest) ||
    record.content[0].digest !== value.digest ||
    !safeVersion(value.byteLength) ||
    !isRecord(value.metadata) ||
    value.decision !== 'imported' ||
    !boundedCommandIdentity(value.importCommandIdentity) ||
    !safeVersion(value.importedStateVersion, false)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const metadata = parseMetadata(value.metadata);
  if (
    metadata.byteLength !== value.byteLength ||
    (record.content[0].bytes !== undefined && record.content[0].bytes.byteLength !== value.byteLength)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    parserVersion: 1,
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    sourceIdentity: value.sourceIdentity,
    workspaceIdentity,
    sourceKind: value.sourceKind,
    location: value.location,
    sourcePath: value.sourcePath,
    digest: value.digest,
    byteLength: value.byteLength,
    metadata,
    recognition: parseRecognitionSummary(value.recognition, value.sourceKind),
    decision: 'imported',
    importCommandIdentity: value.importCommandIdentity,
    importedStateVersion: value.importedStateVersion,
  };
}

export function parseDecision(
  record: StateRecord,
  workspaceIdentity: WorkspaceIdentity,
): LegacyReviewSourceDecisionPayload {
  if (
    record.kind !== 'legacy-review.source-decision' ||
    record.recordClass !== 'immutable' ||
    record.schemaVersion !== 1 ||
    record.content.length !== 0
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const value = decode(record.payload);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'parserVersion',
      'sourceDecisionIdentity',
      'sourceIdentity',
      'workspaceIdentity',
      'sourceKind',
      'location',
      'sourcePath',
      'digest',
      'byteLength',
      'metadata',
      'recognition',
      'decision',
      'decisionCommandIdentity',
      'decidedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    value.parserVersion !== 1 ||
    !validDecisionIdentity(value.sourceDecisionIdentity) ||
    record.recordIdentity !== value.sourceDecisionIdentity ||
    !validSourceIdentity(value.sourceIdentity) ||
    value.workspaceIdentity !== workspaceIdentity ||
    !sourceKind(value.sourceKind) ||
    !sourceLocation(value.location) ||
    value.location === 'moved-legacy-state' ||
    !sourceLocationMatchesKind(value.sourceKind, value.location) ||
    typeof value.sourcePath !== 'string' ||
    value.sourcePath.length === 0 ||
    !path.isAbsolute(value.sourcePath) ||
    Buffer.byteLength(value.sourcePath) > MAX_LEGACY_REVIEW_SOURCE_PATH_BYTES ||
    value.sourcePath.includes('\u0000') ||
    !validDigest(value.digest) ||
    !sourceDecision(value.decision) ||
    value.sourceDecisionIdentity !==
      legacyReviewSourceDecisionIdentity(workspaceIdentity, value.sourceIdentity, value.digest, value.decision) ||
    !safeVersion(value.byteLength) ||
    !isRecord(value.metadata) ||
    !boundedCommandIdentity(value.decisionCommandIdentity) ||
    !safeVersion(value.decidedStateVersion, false)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const metadata = parseMetadata(value.metadata);
  if (metadata.byteLength !== value.byteLength) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    parserVersion: 1,
    sourceDecisionIdentity: value.sourceDecisionIdentity,
    sourceIdentity: value.sourceIdentity,
    workspaceIdentity,
    sourceKind: value.sourceKind,
    location: value.location,
    sourcePath: value.sourcePath,
    digest: value.digest,
    byteLength: value.byteLength,
    metadata,
    recognition: parseRecognitionSummary(value.recognition, value.sourceKind),
    decision: value.decision,
    decisionCommandIdentity: value.decisionCommandIdentity,
    decidedStateVersion: value.decidedStateVersion,
  };
}

export function parseCandidateDecision(
  record: StateRecord,
  workspaceIdentity: WorkspaceIdentity,
): LegacyReviewCandidateDecisionPayload {
  if (
    record.kind !== 'legacy-review.candidate-decision' ||
    record.recordClass !== 'immutable' ||
    record.schemaVersion !== 1 ||
    record.content.length !== 0
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const value = decode(record.payload);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'candidateDecisionIdentity',
      'workspaceIdentity',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'digest',
      'candidateIdentity',
      'decision',
      'decisionCommandIdentity',
      'decidedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    !validCandidateDecisionIdentity(value.candidateDecisionIdentity) ||
    record.recordIdentity !== value.candidateDecisionIdentity ||
    value.workspaceIdentity !== workspaceIdentity ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validDigest(value.digest) ||
    value.sourceOccurrenceIdentity !==
      legacyReviewSourceOccurrenceIdentity(workspaceIdentity, value.sourceIdentity, value.digest) ||
    !validQueueCandidateIdentity(value.candidateIdentity) ||
    !candidateDecision(value.decision) ||
    value.candidateDecisionIdentity !==
      legacyReviewCandidateDecisionIdentity(
        workspaceIdentity,
        value.sourceOccurrenceIdentity,
        value.candidateIdentity,
        value.decision,
      ) ||
    !boundedCommandIdentity(value.decisionCommandIdentity) ||
    !safeVersion(value.decidedStateVersion, false)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    candidateDecisionIdentity: value.candidateDecisionIdentity,
    workspaceIdentity,
    sourceIdentity: value.sourceIdentity,
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    digest: value.digest,
    candidateIdentity: value.candidateIdentity,
    decision: value.decision,
    decisionCommandIdentity: value.decisionCommandIdentity,
    decidedStateVersion: value.decidedStateVersion,
  };
}

export function parseCandidatePromotion(
  record: StateRecord,
  workspaceIdentity: WorkspaceIdentity,
): LegacyReviewCandidatePromotionPayload {
  if (
    record.kind !== 'legacy-review.candidate-promotion' ||
    record.recordClass !== 'immutable' ||
    record.schemaVersion !== 1 ||
    record.content.length !== 0
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const value = decode(record.payload);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'promotionIdentity',
      'workspaceIdentity',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'digest',
      'candidateIdentity',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'draftIdentity',
      'intent',
      'promotionCommandIdentity',
      'promotedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    !validCandidatePromotionIdentity(value.promotionIdentity) ||
    record.recordIdentity !== value.promotionIdentity ||
    value.workspaceIdentity !== workspaceIdentity ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validDigest(value.digest) ||
    value.sourceOccurrenceIdentity !==
      legacyReviewSourceOccurrenceIdentity(workspaceIdentity, value.sourceIdentity, value.digest) ||
    !validQueueCandidateIdentity(value.candidateIdentity) ||
    value.promotionIdentity !==
      legacyReviewCandidatePromotionIdentity(
        workspaceIdentity,
        value.sourceOccurrenceIdentity,
        value.candidateIdentity,
      ) ||
    !validReviewIdentity(value.reviewIdentity) ||
    !validReviewSnapshotIdentity(value.reviewSnapshotIdentity) ||
    !validReviewDraftIdentity(value.draftIdentity) ||
    value.intent !== 'question' ||
    !boundedCommandIdentity(value.promotionCommandIdentity) ||
    !safeVersion(value.promotedStateVersion, false)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    promotionIdentity: value.promotionIdentity,
    workspaceIdentity,
    sourceIdentity: value.sourceIdentity,
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    digest: value.digest,
    candidateIdentity: value.candidateIdentity,
    reviewIdentity: value.reviewIdentity,
    reviewSnapshotIdentity: value.reviewSnapshotIdentity,
    draftIdentity: value.draftIdentity,
    intent: 'question',
    promotionCommandIdentity: value.promotionCommandIdentity,
    promotedStateVersion: value.promotedStateVersion,
  };
}

export function parseMovedSourceAssociation(
  record: StateRecord,
  workspaceIdentity: WorkspaceIdentity,
): LegacyReviewMovedSourceAssociationPayload {
  if (
    record.kind !== 'legacy-review.moved-source-association' ||
    record.recordClass !== 'immutable' ||
    record.schemaVersion !== 1 ||
    record.content.length !== 0
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  const value = decode(record.payload);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'associationIdentity',
      'workspaceIdentity',
      'sourceIdentity',
      'sourceOccurrenceIdentity',
      'digest',
      'legacyCheckoutHash',
      'associationCommandIdentity',
      'associatedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    !validMovedSourceAssociationIdentity(value.associationIdentity) ||
    record.recordIdentity !== value.associationIdentity ||
    value.workspaceIdentity !== workspaceIdentity ||
    !validSourceIdentity(value.sourceIdentity) ||
    !validOccurrenceIdentity(value.sourceOccurrenceIdentity) ||
    !validDigest(value.digest) ||
    value.sourceOccurrenceIdentity !==
      legacyReviewSourceOccurrenceIdentity(workspaceIdentity, value.sourceIdentity, value.digest) ||
    value.associationIdentity !==
      legacyReviewMovedSourceAssociationIdentity(workspaceIdentity, value.sourceIdentity, value.digest) ||
    typeof value.legacyCheckoutHash !== 'string' ||
    !LEGACY_CHECKOUT_HASH_PATTERN.test(value.legacyCheckoutHash) ||
    !boundedCommandIdentity(value.associationCommandIdentity) ||
    !safeVersion(value.associatedStateVersion, false)
  ) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    formatVersion: 1,
    associationIdentity: value.associationIdentity,
    workspaceIdentity,
    sourceIdentity: value.sourceIdentity,
    sourceOccurrenceIdentity: value.sourceOccurrenceIdentity,
    digest: value.digest,
    legacyCheckoutHash: value.legacyCheckoutHash,
    associationCommandIdentity: value.associationCommandIdentity,
    associatedStateVersion: value.associatedStateVersion,
  };
}
