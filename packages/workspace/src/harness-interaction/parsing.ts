import { hasOnlyKeys, isRecord, isoTimestamp, memberOf, safeVersion, unicodeScalarText } from '../recordCodec.js';
import type {
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewIdentity,
  ReviewMessageIdentity,
  ReviewMessageMaterialIdentity,
  ReviewQuestionIdentity,
  ReviewResponseIdentity,
  ReviewSnapshotIdentity,
} from '../reviewing/index.js';
import { sha256 } from '../sha256.js';
import type {
  HarnessAcknowledgementIdentity,
  HarnessAcknowledgementRequirementIdentity,
  HarnessAttachmentDestination,
  HarnessAttachmentEstablishment,
  HarnessAttachmentIdentity,
  HarnessAvailability,
  HarnessCapabilitySnapshotIdentity,
  HarnessCommitmentReceiptIdentity,
  HarnessCompatibilityIdentity,
  HarnessEvidenceAcknowledgement,
  HarnessHandoffIdentity,
  HarnessInteractionCommandAccepted,
  HarnessInterruptionIntentIdentity,
  HarnessInvocationIdentity,
  UserPullArmOccurrenceIdentity,
  UserPullPreparationIdentity,
  UserPullPreparationTerminalReason,
} from './contracts.js';
import {
  HarnessStateProblem,
  type AttachmentCompatibilityPayload,
  type HarnessAttachmentIndexEntry,
  type HarnessCommandRecordPayload,
  type HarnessEvidenceRecordPayload,
  type HarnessHandoffIndexEntry,
  type HarnessIndexPayload,
  type HarnessInvocationIndexEntry,
  type HarnessReviewHistoryPayload,
  type UserPullArmRecordPayload,
  type UserPullAttachmentRecordPayload,
  type UserPullContextBudgetRecord,
  type UserPullObservabilityRecordPayload,
  type UserPullPreparationIndexEntry,
  type UserPullPreparationRecordPayload,
} from './internalTypes.js';
import {
  ACKNOWLEDGEMENT_PATTERN,
  ACKNOWLEDGEMENT_REQUIREMENT_PATTERN,
  ARM_OCCURRENCE_PATTERN,
  ATTACHMENT_PATTERN,
  BATCH_PATTERN,
  COMPATIBILITY_PATTERN,
  HANDOFF_PATTERN,
  INTERRUPTION_PATTERN,
  INVOCATION_PATTERN,
  MAX_ARMED_OCCURRENCES,
  MAX_ATTACHMENTS,
  MAX_CANONICAL_PATH_BYTES,
  MAX_EVIDENCE_PER_INVOCATION,
  MAX_HANDOFFS,
  MAX_INTERRUPTION_INTENTS,
  MAX_INVOCATIONS,
  MAX_PREPARATIONS,
  MAX_REVIEW_HANDOFFS,
  MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS,
  PREPARATION_PATTERN,
  QUESTION_PATTERN,
  RECEIPT_PATTERN,
  RESPONSE_PATTERN,
  REVIEW_BASIS_PATTERN,
  REVIEW_MESSAGE_PATTERN,
  REVIEW_PATTERN,
  SHA256_PATTERN,
  SNAPSHOT_PATTERN,
} from './limits.js';
import {
  normalizeAttachment,
  normalizeAvailability,
  normalizeDestination,
  normalizeManifest,
} from './normalization.js';
import { boundedEvidenceIdentity, boundedText, sameValue, stableIdentity } from './utils.js';

export function parseDestination(value: unknown): HarnessAttachmentDestination {
  try {
    return normalizeDestination(value);
  } catch {
    throw new HarnessStateProblem();
  }
}

export function parseAvailability(value: unknown): HarnessAvailability {
  try {
    return normalizeAvailability(value);
  } catch {
    throw new HarnessStateProblem();
  }
}

function parseHandoffEntry(item: unknown): HarnessHandoffIndexEntry {
  if (
    !isRecord(item) ||
    !hasOnlyKeys(
      item,
      [
        'handoffIdentity',
        'reviewIdentity',
        'reviewBatchIdentity',
        'attachmentIdentity',
        'commitmentReceiptIdentity',
        'capabilitySnapshotIdentity',
        'disclosure',
      ],
      ['invocationIdentity'],
    ) ||
    typeof item.handoffIdentity !== 'string' ||
    !HANDOFF_PATTERN.test(item.handoffIdentity) ||
    typeof item.reviewIdentity !== 'string' ||
    !REVIEW_PATTERN.test(item.reviewIdentity) ||
    typeof item.reviewBatchIdentity !== 'string' ||
    !BATCH_PATTERN.test(item.reviewBatchIdentity) ||
    typeof item.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(item.attachmentIdentity) ||
    typeof item.commitmentReceiptIdentity !== 'string' ||
    !RECEIPT_PATTERN.test(item.commitmentReceiptIdentity) ||
    typeof item.capabilitySnapshotIdentity !== 'string' ||
    !SNAPSHOT_PATTERN.test(item.capabilitySnapshotIdentity) ||
    (item.invocationIdentity !== undefined &&
      (typeof item.invocationIdentity !== 'string' || !INVOCATION_PATTERN.test(item.invocationIdentity))) ||
    !isRecord(item.disclosure) ||
    !hasOnlyKeys(item.disclosure, ['fileCount', 'questionCount', 'byteLength', 'sha256'], ['messageCount']) ||
    !safeVersion(item.disclosure.fileCount) ||
    !safeVersion(item.disclosure.questionCount) ||
    (item.disclosure.messageCount === undefined
      ? item.disclosure.questionCount < 1
      : item.disclosure.messageCount !== 1 || item.disclosure.questionCount !== 0 || item.disclosure.fileCount !== 0) ||
    !safeVersion(item.disclosure.byteLength) ||
    typeof item.disclosure.sha256 !== 'string' ||
    !SHA256_PATTERN.test(item.disclosure.sha256)
  ) {
    throw new HarnessStateProblem();
  }
  return {
    handoffIdentity: item.handoffIdentity as HarnessHandoffIdentity,
    reviewIdentity: item.reviewIdentity as ReviewIdentity,
    reviewBatchIdentity: item.reviewBatchIdentity as ReviewBatchIdentity,
    attachmentIdentity: item.attachmentIdentity as HarnessAttachmentIdentity,
    commitmentReceiptIdentity: item.commitmentReceiptIdentity as HarnessCommitmentReceiptIdentity,
    capabilitySnapshotIdentity: item.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
    ...(item.invocationIdentity === undefined
      ? {}
      : { invocationIdentity: item.invocationIdentity as HarnessInvocationIdentity }),
    disclosure: {
      fileCount: item.disclosure.fileCount,
      questionCount: item.disclosure.questionCount,
      ...(item.disclosure.messageCount === undefined ? {} : { messageCount: 1 as const }),
      byteLength: item.disclosure.byteLength,
      sha256: item.disclosure.sha256,
    },
  } satisfies HarnessHandoffIndexEntry;
}

function parseInvocationEntry(item: unknown, allowStartObservationDeadline: boolean): HarnessInvocationIndexEntry {
  if (
    !isRecord(item) ||
    !hasOnlyKeys(
      item,
      [
        'invocationIdentity',
        'handoffIdentity',
        'reviewIdentity',
        'attachmentIdentity',
        'status',
        'evidenceIdentities',
        'interruptionIntentIdentities',
      ],
      allowStartObservationDeadline
        ? ['startObservationDeadline', 'terminalReason', 'responseIdentity']
        : ['terminalReason', 'responseIdentity'],
    ) ||
    typeof item.invocationIdentity !== 'string' ||
    !INVOCATION_PATTERN.test(item.invocationIdentity) ||
    typeof item.handoffIdentity !== 'string' ||
    !HANDOFF_PATTERN.test(item.handoffIdentity) ||
    typeof item.reviewIdentity !== 'string' ||
    !REVIEW_PATTERN.test(item.reviewIdentity) ||
    typeof item.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(item.attachmentIdentity) ||
    !memberOf(item.status, [
      'awaiting-start',
      'active',
      'rejected',
      'ended-normally',
      'failed',
      'interrupted',
      'unresolved',
    ] as const) ||
    !Array.isArray(item.evidenceIdentities) ||
    item.evidenceIdentities.length > MAX_EVIDENCE_PER_INVOCATION ||
    !item.evidenceIdentities.every(identity => boundedEvidenceIdentity(identity)) ||
    new Set(item.evidenceIdentities).size !== item.evidenceIdentities.length ||
    !Array.isArray(item.interruptionIntentIdentities) ||
    item.interruptionIntentIdentities.length > MAX_INTERRUPTION_INTENTS ||
    !item.interruptionIntentIdentities.every(
      identity => typeof identity === 'string' && INTERRUPTION_PATTERN.test(identity),
    ) ||
    (item.startObservationDeadline !== undefined && !isoTimestamp(item.startObservationDeadline)) ||
    (item.terminalReason !== undefined && !boundedText(item.terminalReason)) ||
    (item.responseIdentity !== undefined &&
      (typeof item.responseIdentity !== 'string' || !RESPONSE_PATTERN.test(item.responseIdentity)))
  ) {
    throw new HarnessStateProblem();
  }
  return {
    invocationIdentity: item.invocationIdentity as HarnessInvocationIdentity,
    handoffIdentity: item.handoffIdentity as HarnessHandoffIdentity,
    reviewIdentity: item.reviewIdentity as ReviewIdentity,
    attachmentIdentity: item.attachmentIdentity as HarnessAttachmentIdentity,
    status: item.status,
    evidenceIdentities: item.evidenceIdentities.map(identity => {
      if (!boundedEvidenceIdentity(identity)) throw new HarnessStateProblem();
      return identity;
    }),
    interruptionIntentIdentities: item.interruptionIntentIdentities.map(
      identity => identity as HarnessInterruptionIntentIdentity,
    ),
    ...(item.startObservationDeadline === undefined ? {} : { startObservationDeadline: item.startObservationDeadline }),
    ...(item.terminalReason === undefined ? {} : { terminalReason: item.terminalReason }),
    ...(item.responseIdentity === undefined
      ? {}
      : { responseIdentity: item.responseIdentity as ReviewResponseIdentity }),
  } satisfies HarnessInvocationIndexEntry;
}

export function parseIndex(value: unknown): HarnessIndexPayload {
  if (!isRecord(value)) throw new HarnessStateProblem();
  const versionOne =
    value.formatVersion === 1 && hasOnlyKeys(value, ['formatVersion', 'attachments', 'handoffs', 'invocations']);
  const versionTwo =
    value.formatVersion === 2 &&
    hasOnlyKeys(value, ['formatVersion', 'attachments', 'handoffs', 'invocations', 'preparations']);
  const versionThree =
    value.formatVersion === 3 &&
    hasOnlyKeys(value, ['formatVersion', 'attachments', 'handoffs', 'invocations', 'preparations']);
  // Older formats kept settled entries live; they stay live in memory until the next write moves them.
  const versionFour =
    value.formatVersion === 4 &&
    hasOnlyKeys(value, ['formatVersion', 'attachments', 'handoffs', 'invocations', 'preparations']);
  if (
    (!versionOne && !versionTwo && !versionThree && !versionFour) ||
    !Array.isArray(value.attachments) ||
    !Array.isArray(value.handoffs) ||
    !Array.isArray(value.invocations) ||
    (!versionOne && !Array.isArray(value.preparations)) ||
    value.attachments.length > MAX_ATTACHMENTS ||
    value.handoffs.length > MAX_HANDOFFS ||
    value.invocations.length > MAX_INVOCATIONS ||
    (!versionOne && (value.preparations as unknown[]).length > MAX_PREPARATIONS)
  ) {
    throw new HarnessStateProblem();
  }
  const attachments = value.attachments.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(item, [
        'attachmentIdentity',
        'compatibilityIdentity',
        'establishmentEvidenceIdentity',
        'destination',
        'availability',
      ]) ||
      typeof item.attachmentIdentity !== 'string' ||
      !ATTACHMENT_PATTERN.test(item.attachmentIdentity) ||
      typeof item.compatibilityIdentity !== 'string' ||
      !COMPATIBILITY_PATTERN.test(item.compatibilityIdentity) ||
      !boundedEvidenceIdentity(item.establishmentEvidenceIdentity)
    ) {
      throw new HarnessStateProblem();
    }
    return {
      attachmentIdentity: item.attachmentIdentity as HarnessAttachmentIdentity,
      compatibilityIdentity: item.compatibilityIdentity,
      establishmentEvidenceIdentity: item.establishmentEvidenceIdentity,
      destination: parseDestination(item.destination),
      availability: parseAvailability(item.availability),
    } satisfies HarnessAttachmentIndexEntry;
  });
  const handoffs = value.handoffs.map(parseHandoffEntry);
  const invocations = value.invocations.map(item => parseInvocationEntry(item, versionThree || versionFour));
  const rawPreparations = versionOne ? [] : (value.preparations as unknown[]);
  const preparations = rawPreparations.map(item => {
    if (
      !isRecord(item) ||
      !hasOnlyKeys(
        item,
        [
          'preparationIdentity',
          'handoffIdentity',
          'reviewIdentity',
          'reviewBatchIdentity',
          'attachmentIdentity',
          'status',
          'payloadSha256',
          'armedOccurrenceIdentities',
        ],
        ['disclosedDeadline', 'claimedOccurrenceIdentity', 'invocationIdentity', 'terminalReason'],
      ) ||
      typeof item.preparationIdentity !== 'string' ||
      !PREPARATION_PATTERN.test(item.preparationIdentity) ||
      typeof item.handoffIdentity !== 'string' ||
      !HANDOFF_PATTERN.test(item.handoffIdentity) ||
      typeof item.reviewIdentity !== 'string' ||
      !REVIEW_PATTERN.test(item.reviewIdentity) ||
      typeof item.reviewBatchIdentity !== 'string' ||
      !BATCH_PATTERN.test(item.reviewBatchIdentity) ||
      typeof item.attachmentIdentity !== 'string' ||
      !ATTACHMENT_PATTERN.test(item.attachmentIdentity) ||
      !memberOf(item.status, ['prepared', 'claimed', 'withdrawn', 'expired'] as const) ||
      typeof item.payloadSha256 !== 'string' ||
      !SHA256_PATTERN.test(item.payloadSha256) ||
      !Array.isArray(item.armedOccurrenceIdentities) ||
      item.armedOccurrenceIdentities.length > MAX_ARMED_OCCURRENCES ||
      !item.armedOccurrenceIdentities.every(
        identity => typeof identity === 'string' && ARM_OCCURRENCE_PATTERN.test(identity),
      ) ||
      new Set(item.armedOccurrenceIdentities).size !== item.armedOccurrenceIdentities.length ||
      (item.disclosedDeadline !== undefined && !isoTimestamp(item.disclosedDeadline)) ||
      (item.claimedOccurrenceIdentity !== undefined &&
        (typeof item.claimedOccurrenceIdentity !== 'string' ||
          !ARM_OCCURRENCE_PATTERN.test(item.claimedOccurrenceIdentity))) ||
      (item.invocationIdentity !== undefined &&
        (typeof item.invocationIdentity !== 'string' || !INVOCATION_PATTERN.test(item.invocationIdentity))) ||
      (item.terminalReason !== undefined &&
        !memberOf(item.terminalReason, [
          'explicit-withdrawal',
          'workflow-cancellation',
          'identity-lost',
          'capability-incompatible',
          'route-deadline-passed',
        ] as const))
    ) {
      throw new HarnessStateProblem();
    }
    const claimed =
      item.status === 'claimed' &&
      item.claimedOccurrenceIdentity !== undefined &&
      item.invocationIdentity !== undefined &&
      item.terminalReason === undefined &&
      item.armedOccurrenceIdentities.includes(item.claimedOccurrenceIdentity);
    const prepared =
      item.status === 'prepared' &&
      item.claimedOccurrenceIdentity === undefined &&
      item.invocationIdentity === undefined &&
      item.terminalReason === undefined;
    const withdrawn =
      item.status === 'withdrawn' &&
      item.claimedOccurrenceIdentity === undefined &&
      item.invocationIdentity === undefined &&
      (item.terminalReason === 'explicit-withdrawal' || item.terminalReason === 'workflow-cancellation');
    const expired =
      item.status === 'expired' &&
      item.claimedOccurrenceIdentity === undefined &&
      item.invocationIdentity === undefined &&
      (item.terminalReason === 'identity-lost' ||
        item.terminalReason === 'capability-incompatible' ||
        item.terminalReason === 'route-deadline-passed');
    if (!claimed && !prepared && !withdrawn && !expired) throw new HarnessStateProblem();
    return {
      preparationIdentity: item.preparationIdentity as UserPullPreparationIdentity,
      handoffIdentity: item.handoffIdentity as HarnessHandoffIdentity,
      reviewIdentity: item.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: item.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: item.attachmentIdentity as HarnessAttachmentIdentity,
      status: item.status,
      payloadSha256: item.payloadSha256,
      armedOccurrenceIdentities: item.armedOccurrenceIdentities.map(
        identity => identity as UserPullArmOccurrenceIdentity,
      ),
      ...(item.disclosedDeadline === undefined ? {} : { disclosedDeadline: item.disclosedDeadline }),
      ...(item.claimedOccurrenceIdentity === undefined
        ? {}
        : { claimedOccurrenceIdentity: item.claimedOccurrenceIdentity as UserPullArmOccurrenceIdentity }),
      ...(item.invocationIdentity === undefined
        ? {}
        : { invocationIdentity: item.invocationIdentity as HarnessInvocationIdentity }),
      ...(item.terminalReason === undefined
        ? {}
        : { terminalReason: item.terminalReason as UserPullPreparationTerminalReason }),
    } satisfies UserPullPreparationIndexEntry;
  });
  const authoritativeHandoffs = handoffs.filter(handoff => {
    const preparation = preparations.find(candidate => candidate.handoffIdentity === handoff.handoffIdentity);
    return (
      handoff.invocationIdentity !== undefined ||
      preparation?.status === 'prepared' ||
      preparation?.status === 'claimed'
    );
  });
  if (
    new Set(attachments.map(item => item.attachmentIdentity)).size !== attachments.length ||
    new Set(attachments.map(item => item.compatibilityIdentity)).size !== attachments.length ||
    new Set(handoffs.map(item => item.handoffIdentity)).size !== handoffs.length ||
    new Set(authoritativeHandoffs.map(item => item.reviewBatchIdentity)).size !== authoritativeHandoffs.length ||
    new Set(invocations.map(item => item.invocationIdentity)).size !== invocations.length ||
    new Set(preparations.map(item => item.preparationIdentity)).size !== preparations.length ||
    new Set(preparations.map(item => item.handoffIdentity)).size !== preparations.length ||
    new Set(preparations.filter(item => item.status === 'prepared').map(item => item.attachmentIdentity)).size !==
      preparations.filter(item => item.status === 'prepared').length ||
    new Set(preparations.flatMap(item => item.armedOccurrenceIdentities)).size !==
      preparations.reduce((total, item) => total + item.armedOccurrenceIdentities.length, 0) ||
    handoffs.some(handoff => {
      const invocation =
        handoff.invocationIdentity === undefined
          ? undefined
          : invocations.find(candidate => candidate.invocationIdentity === handoff.invocationIdentity);
      const preparation = preparations.find(candidate => candidate.handoffIdentity === handoff.handoffIdentity);
      return (
        !attachments.some(attachment => attachment.attachmentIdentity === handoff.attachmentIdentity) ||
        (handoff.invocationIdentity === undefined
          ? preparation === undefined || preparation.invocationIdentity !== undefined
          : invocation === undefined ||
            invocation.handoffIdentity !== handoff.handoffIdentity ||
            invocation.reviewIdentity !== handoff.reviewIdentity ||
            invocation.attachmentIdentity !== handoff.attachmentIdentity ||
            (preparation !== undefined && preparation.invocationIdentity !== handoff.invocationIdentity))
      );
    }) ||
    invocations.some(invocation => {
      const handoff = handoffs.find(candidate => candidate.handoffIdentity === invocation.handoffIdentity);
      const preparation = preparations.find(
        candidate => candidate.invocationIdentity === invocation.invocationIdentity,
      );
      return (
        handoff === undefined ||
        handoff.invocationIdentity !== invocation.invocationIdentity ||
        handoff.reviewIdentity !== invocation.reviewIdentity ||
        handoff.attachmentIdentity !== invocation.attachmentIdentity ||
        (invocation.startObservationDeadline !== undefined &&
          (preparation === undefined ||
            preparation.status !== 'claimed' ||
            preparation.handoffIdentity !== invocation.handoffIdentity))
      );
    }) ||
    preparations.some(preparation => {
      const handoff = handoffs.find(candidate => candidate.handoffIdentity === preparation.handoffIdentity);
      return (
        handoff === undefined ||
        handoff.reviewIdentity !== preparation.reviewIdentity ||
        handoff.reviewBatchIdentity !== preparation.reviewBatchIdentity ||
        handoff.attachmentIdentity !== preparation.attachmentIdentity ||
        handoff.invocationIdentity !== preparation.invocationIdentity
      );
    })
  ) {
    throw new HarnessStateProblem();
  }
  return { formatVersion: 4, attachments, handoffs, invocations, preparations };
}

export function parseReviewHistory(value: unknown, reviewIdentity: ReviewIdentity): HarnessReviewHistoryPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'handoffs', 'invocations']) ||
    value.formatVersion !== 1 ||
    value.reviewIdentity !== reviewIdentity ||
    !Array.isArray(value.handoffs) ||
    !Array.isArray(value.invocations) ||
    value.handoffs.length > MAX_REVIEW_HANDOFFS ||
    value.invocations.length !== value.handoffs.length
  ) {
    throw new HarnessStateProblem();
  }
  const handoffs = value.handoffs.map(parseHandoffEntry);
  const invocations = value.invocations.map(item => parseInvocationEntry(item, false));
  if (
    new Set(handoffs.map(item => item.handoffIdentity)).size !== handoffs.length ||
    new Set(handoffs.map(item => item.reviewBatchIdentity)).size !== handoffs.length ||
    new Set(invocations.map(item => item.invocationIdentity)).size !== invocations.length ||
    handoffs.some((handoff, position) => {
      const invocation = invocations[position];
      return (
        handoff.reviewIdentity !== reviewIdentity ||
        invocation === undefined ||
        handoff.invocationIdentity !== invocation.invocationIdentity ||
        invocation.handoffIdentity !== handoff.handoffIdentity ||
        invocation.reviewIdentity !== reviewIdentity ||
        invocation.attachmentIdentity !== handoff.attachmentIdentity ||
        invocation.status === 'awaiting-start' ||
        invocation.status === 'active'
      );
    })
  ) {
    throw new HarnessStateProblem();
  }
  return { formatVersion: 1, reviewIdentity, handoffs, invocations };
}

export function parseUserPullAttachmentRecord(value: unknown): UserPullAttachmentRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'attachmentIdentity',
      'compatibilityIdentity',
      'harnessKind',
      'sessionId',
      'canonicalGitRoot',
      'canonicalGitDir',
      'hostVersion',
      'manifestSha256',
      'destination',
      'manifest',
      'establishedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity) ||
    typeof value.compatibilityIdentity !== 'string' ||
    !COMPATIBILITY_PATTERN.test(value.compatibilityIdentity) ||
    value.harnessKind !== 'claude-code' ||
    !boundedText(value.sessionId) ||
    !unicodeScalarText(value.sessionId) ||
    !boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitRoot) ||
    !boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitDir) ||
    !boundedText(value.hostVersion) ||
    !unicodeScalarText(value.hostVersion) ||
    typeof value.manifestSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.manifestSha256) ||
    !safeVersion(value.establishedStateVersion, false)
  ) {
    throw new HarnessStateProblem();
  }
  try {
    const destination = parseDestination(value.destination);
    const manifest = normalizeManifest(value.manifest);
    if (
      sha256(JSON.stringify(manifest)) !== value.manifestSha256 ||
      stableIdentity('att', 'claude-code', value.sessionId, value.canonicalGitRoot, value.canonicalGitDir) !==
        value.attachmentIdentity ||
      stableIdentity('hcp', value.attachmentIdentity, value.hostVersion, value.manifestSha256) !==
        value.compatibilityIdentity ||
      destination.canonicalCheckout !== value.canonicalGitRoot ||
      destination.sessionLabel !== value.sessionId ||
      destination.harnessLabel !== manifest.adapterDisplayName ||
      !manifest.reviewedHostVersions.includes(value.hostVersion) ||
      !manifest.capabilities.some(capability => capability.route === 'user-pull')
    ) {
      throw new HarnessStateProblem();
    }
    return {
      formatVersion: 1,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      compatibilityIdentity: value.compatibilityIdentity as HarnessCompatibilityIdentity,
      harnessKind: 'claude-code',
      sessionId: value.sessionId,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
      hostVersion: value.hostVersion,
      manifestSha256: value.manifestSha256,
      destination,
      manifest,
      establishedStateVersion: value.establishedStateVersion,
    };
  } catch (error) {
    if (error instanceof HarnessStateProblem) throw error;
    throw new HarnessStateProblem();
  }
}

function parseUserPullContextBudget(value: unknown): UserPullContextBudgetRecord {
  if (
    !isRecord(value) ||
    typeof value.status !== 'string' ||
    value.source !== 'claude-status-line' ||
    !boundedText(value.runtimeGeneration) ||
    !boundedEvidenceIdentity(value.evidenceIdentity)
  ) {
    throw new HarnessStateProblem();
  }
  const modelFieldsAreValid = (): boolean =>
    boundedText(value.modelId, 256) &&
    unicodeScalarText(value.modelId) &&
    boundedText(value.modelDisplayName, 256) &&
    unicodeScalarText(value.modelDisplayName) &&
    safeVersion(value.contextWindowSize, false) &&
    (value.promptId === undefined || (boundedText(value.promptId) && unicodeScalarText(value.promptId)));
  if (
    value.status === 'available' &&
    hasOnlyKeys(
      value,
      [
        'status',
        'source',
        'runtimeGeneration',
        'evidenceIdentity',
        'modelId',
        'modelDisplayName',
        'contextWindowSize',
        'totalInputTokens',
        'totalOutputTokens',
        'currentUsage',
      ],
      ['usedPercentage', 'remainingPercentage', 'promptId'],
    ) &&
    modelFieldsAreValid() &&
    safeVersion(value.totalInputTokens) &&
    safeVersion(value.totalOutputTokens) &&
    isRecord(value.currentUsage) &&
    hasOnlyKeys(value.currentUsage, [
      'inputTokens',
      'outputTokens',
      'cacheCreationInputTokens',
      'cacheReadInputTokens',
    ]) &&
    safeVersion(value.currentUsage.inputTokens) &&
    safeVersion(value.currentUsage.outputTokens) &&
    safeVersion(value.currentUsage.cacheCreationInputTokens) &&
    safeVersion(value.currentUsage.cacheReadInputTokens) &&
    (value.usedPercentage === undefined ||
      (typeof value.usedPercentage === 'number' &&
        Number.isFinite(value.usedPercentage) &&
        value.usedPercentage >= 0 &&
        value.usedPercentage <= 10_000)) &&
    (value.remainingPercentage === undefined ||
      (typeof value.remainingPercentage === 'number' &&
        Number.isFinite(value.remainingPercentage) &&
        value.remainingPercentage >= 0 &&
        value.remainingPercentage <= 10_000))
  ) {
    return {
      status: 'available',
      source: 'claude-status-line',
      runtimeGeneration: value.runtimeGeneration,
      evidenceIdentity: value.evidenceIdentity,
      modelId: value.modelId as string,
      modelDisplayName: value.modelDisplayName as string,
      contextWindowSize: value.contextWindowSize as number,
      totalInputTokens: value.totalInputTokens,
      totalOutputTokens: value.totalOutputTokens,
      currentUsage: {
        inputTokens: value.currentUsage.inputTokens,
        outputTokens: value.currentUsage.outputTokens,
        cacheCreationInputTokens: value.currentUsage.cacheCreationInputTokens,
        cacheReadInputTokens: value.currentUsage.cacheReadInputTokens,
      },
      ...(value.usedPercentage === undefined ? {} : { usedPercentage: value.usedPercentage }),
      ...(value.remainingPercentage === undefined ? {} : { remainingPercentage: value.remainingPercentage }),
      ...(value.promptId === undefined ? {} : { promptId: value.promptId as string }),
    };
  }
  if (
    value.status === 'unknown' &&
    hasOnlyKeys(
      value,
      ['status', 'source', 'runtimeGeneration', 'evidenceIdentity', 'reason'],
      ['modelId', 'modelDisplayName', 'contextWindowSize', 'promptId'],
    ) &&
    memberOf(value.reason, [
      'awaiting-response',
      'model-changed',
      'host-report-inconsistent',
      'compacted',
      'session-ended',
    ] as const) &&
    ((value.modelId === undefined && value.modelDisplayName === undefined && value.contextWindowSize === undefined) ||
      modelFieldsAreValid())
  ) {
    return {
      status: 'unknown',
      source: 'claude-status-line',
      runtimeGeneration: value.runtimeGeneration,
      evidenceIdentity: value.evidenceIdentity,
      reason: value.reason,
      ...(value.modelId === undefined ? {} : { modelId: value.modelId as string }),
      ...(value.modelDisplayName === undefined ? {} : { modelDisplayName: value.modelDisplayName as string }),
      ...(value.contextWindowSize === undefined ? {} : { contextWindowSize: value.contextWindowSize as number }),
      ...(value.promptId === undefined ? {} : { promptId: value.promptId as string }),
    };
  }
  throw new HarnessStateProblem();
}

export function parseUserPullObservabilityRecord(value: unknown): UserPullObservabilityRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['formatVersion', 'attachmentIdentity', 'compatibilityIdentity', 'availability'],
      ['contextBudget', 'compaction'],
    ) ||
    value.formatVersion !== 1 ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity) ||
    typeof value.compatibilityIdentity !== 'string' ||
    !COMPATIBILITY_PATTERN.test(value.compatibilityIdentity) ||
    !isRecord(value.availability) ||
    !boundedText(value.availability.runtimeGeneration) ||
    !boundedEvidenceIdentity(value.availability.evidenceIdentity)
  ) {
    throw new HarnessStateProblem();
  }
  const availability =
    value.availability.state === 'revalidated' &&
    value.availability.reason === 'exact-identity-and-contract' &&
    hasOnlyKeys(value.availability, ['state', 'reason', 'runtimeGeneration', 'evidenceIdentity'])
      ? {
          state: 'revalidated' as const,
          reason: 'exact-identity-and-contract' as const,
          runtimeGeneration: value.availability.runtimeGeneration,
          evidenceIdentity: value.availability.evidenceIdentity,
        }
      : value.availability.state === 'blocked-by-runtime' &&
          value.availability.reason === 'session-ended' &&
          hasOnlyKeys(value.availability, ['state', 'reason', 'runtimeGeneration', 'evidenceIdentity'])
        ? {
            state: 'blocked-by-runtime' as const,
            reason: 'session-ended' as const,
            runtimeGeneration: value.availability.runtimeGeneration,
            evidenceIdentity: value.availability.evidenceIdentity,
          }
        : undefined;
  if (availability === undefined) throw new HarnessStateProblem();
  let compaction: UserPullObservabilityRecordPayload['compaction'];
  if (value.compaction !== undefined) {
    if (
      !isRecord(value.compaction) ||
      !hasOnlyKeys(value.compaction, ['phase', 'trigger', 'runtimeGeneration', 'evidenceIdentity']) ||
      (value.compaction.phase !== 'started' && value.compaction.phase !== 'completed') ||
      (value.compaction.trigger !== 'manual' && value.compaction.trigger !== 'auto') ||
      !boundedText(value.compaction.runtimeGeneration) ||
      !boundedEvidenceIdentity(value.compaction.evidenceIdentity)
    ) {
      throw new HarnessStateProblem();
    }
    compaction = {
      phase: value.compaction.phase,
      trigger: value.compaction.trigger,
      runtimeGeneration: value.compaction.runtimeGeneration,
      evidenceIdentity: value.compaction.evidenceIdentity,
    };
  }
  return {
    formatVersion: 1,
    attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
    compatibilityIdentity: value.compatibilityIdentity as HarnessCompatibilityIdentity,
    availability,
    ...(value.contextBudget === undefined ? {} : { contextBudget: parseUserPullContextBudget(value.contextBudget) }),
    ...(compaction === undefined ? {} : { compaction }),
  };
}

export function parseUserPullPreparationRecord(value: unknown): UserPullPreparationRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'formatVersion',
        'preparationIdentity',
        'handoffIdentity',
        'reviewIdentity',
        'reviewBatchIdentity',
        'attachmentIdentity',
        'status',
        'payloadSha256',
        'armedOccurrenceIdentities',
        'claimHandle',
        'capabilitySnapshotIdentity',
      ],
      ['disclosedDeadline', 'claimedOccurrenceIdentity', 'invocationIdentity', 'terminalReason'],
    ) ||
    value.formatVersion !== 1 ||
    typeof value.preparationIdentity !== 'string' ||
    !PREPARATION_PATTERN.test(value.preparationIdentity) ||
    typeof value.handoffIdentity !== 'string' ||
    !HANDOFF_PATTERN.test(value.handoffIdentity) ||
    typeof value.reviewIdentity !== 'string' ||
    !REVIEW_PATTERN.test(value.reviewIdentity) ||
    typeof value.reviewBatchIdentity !== 'string' ||
    !BATCH_PATTERN.test(value.reviewBatchIdentity) ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity) ||
    !memberOf(value.status, ['prepared', 'claimed', 'withdrawn', 'expired'] as const) ||
    typeof value.payloadSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.payloadSha256) ||
    !Array.isArray(value.armedOccurrenceIdentities) ||
    value.armedOccurrenceIdentities.length > MAX_ARMED_OCCURRENCES ||
    !value.armedOccurrenceIdentities.every(
      identity => typeof identity === 'string' && ARM_OCCURRENCE_PATTERN.test(identity),
    ) ||
    new Set(value.armedOccurrenceIdentities).size !== value.armedOccurrenceIdentities.length ||
    typeof value.claimHandle !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.claimHandle) ||
    typeof value.capabilitySnapshotIdentity !== 'string' ||
    !SNAPSHOT_PATTERN.test(value.capabilitySnapshotIdentity) ||
    (value.disclosedDeadline !== undefined && !isoTimestamp(value.disclosedDeadline)) ||
    (value.claimedOccurrenceIdentity !== undefined &&
      (typeof value.claimedOccurrenceIdentity !== 'string' ||
        !ARM_OCCURRENCE_PATTERN.test(value.claimedOccurrenceIdentity))) ||
    (value.invocationIdentity !== undefined &&
      (typeof value.invocationIdentity !== 'string' || !INVOCATION_PATTERN.test(value.invocationIdentity))) ||
    (value.terminalReason !== undefined &&
      !memberOf(value.terminalReason, [
        'explicit-withdrawal',
        'workflow-cancellation',
        'identity-lost',
        'capability-incompatible',
        'route-deadline-passed',
      ] as const))
  ) {
    throw new HarnessStateProblem();
  }
  const claimed =
    value.status === 'claimed' &&
    value.claimedOccurrenceIdentity !== undefined &&
    value.invocationIdentity !== undefined &&
    value.terminalReason === undefined &&
    value.armedOccurrenceIdentities.includes(value.claimedOccurrenceIdentity);
  const prepared =
    value.status === 'prepared' &&
    value.claimedOccurrenceIdentity === undefined &&
    value.invocationIdentity === undefined &&
    value.terminalReason === undefined;
  const withdrawn =
    value.status === 'withdrawn' &&
    value.claimedOccurrenceIdentity === undefined &&
    value.invocationIdentity === undefined &&
    (value.terminalReason === 'explicit-withdrawal' || value.terminalReason === 'workflow-cancellation');
  const expired =
    value.status === 'expired' &&
    value.claimedOccurrenceIdentity === undefined &&
    value.invocationIdentity === undefined &&
    (value.terminalReason === 'identity-lost' ||
      value.terminalReason === 'capability-incompatible' ||
      value.terminalReason === 'route-deadline-passed');
  if (!claimed && !prepared && !withdrawn && !expired) throw new HarnessStateProblem();
  return {
    formatVersion: 1,
    preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
    handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
    attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
    status: value.status,
    payloadSha256: value.payloadSha256,
    armedOccurrenceIdentities: value.armedOccurrenceIdentities.map(
      identity => identity as UserPullArmOccurrenceIdentity,
    ),
    claimHandle: value.claimHandle,
    capabilitySnapshotIdentity: value.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
    ...(value.disclosedDeadline === undefined ? {} : { disclosedDeadline: value.disclosedDeadline }),
    ...(value.claimedOccurrenceIdentity === undefined
      ? {}
      : { claimedOccurrenceIdentity: value.claimedOccurrenceIdentity as UserPullArmOccurrenceIdentity }),
    ...(value.invocationIdentity === undefined
      ? {}
      : { invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity }),
    ...(value.terminalReason === undefined
      ? {}
      : { terminalReason: value.terminalReason as UserPullPreparationTerminalReason }),
  };
}

export function parseUserPullArmRecord(value: unknown): UserPullArmRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'occurrenceIdentity',
      'preparationIdentity',
      'attachmentIdentity',
      'sessionId',
      'promptId',
      'canonicalGitRoot',
      'canonicalGitDir',
      'bridgeProtocolVersion',
      'armedStateVersion',
    ]) ||
    value.formatVersion !== 1 ||
    typeof value.occurrenceIdentity !== 'string' ||
    !ARM_OCCURRENCE_PATTERN.test(value.occurrenceIdentity) ||
    typeof value.preparationIdentity !== 'string' ||
    !PREPARATION_PATTERN.test(value.preparationIdentity) ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity) ||
    !boundedText(value.sessionId) ||
    !unicodeScalarText(value.sessionId) ||
    !boundedText(value.promptId) ||
    !unicodeScalarText(value.promptId) ||
    !boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitRoot) ||
    !boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitDir) ||
    stableIdentity('hpa', value.attachmentIdentity, value.promptId) !== value.occurrenceIdentity ||
    value.bridgeProtocolVersion !== 1 ||
    !safeVersion(value.armedStateVersion, false)
  ) {
    throw new HarnessStateProblem();
  }
  return {
    formatVersion: 1,
    occurrenceIdentity: value.occurrenceIdentity as UserPullArmOccurrenceIdentity,
    preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
    attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
    sessionId: value.sessionId,
    promptId: value.promptId,
    canonicalGitRoot: value.canonicalGitRoot,
    canonicalGitDir: value.canonicalGitDir,
    bridgeProtocolVersion: 1,
    armedStateVersion: value.armedStateVersion,
  };
}

export function preparationRecordMatchesIndex(
  record: UserPullPreparationRecordPayload,
  entry: UserPullPreparationIndexEntry,
): boolean {
  const {
    formatVersion: _formatVersion,
    claimHandle: _claimHandle,
    capabilitySnapshotIdentity: _capabilitySnapshotIdentity,
    ...projected
  } = record;
  return sameValue(projected, entry);
}

export function parseCompatibility(value: unknown): AttachmentCompatibilityPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'formatVersion',
      'normalizedAttachment',
      'manifest',
      'manifestSha256',
      'compatibilityIdentity',
      'result',
    ]) ||
    value.formatVersion !== 1 ||
    typeof value.manifestSha256 !== 'string' ||
    !SHA256_PATTERN.test(value.manifestSha256) ||
    typeof value.compatibilityIdentity !== 'string' ||
    !COMPATIBILITY_PATTERN.test(value.compatibilityIdentity) ||
    !isRecord(value.result) ||
    !hasOnlyKeys(value.result, ['status', 'attachmentIdentity', 'compatibilityIdentity', 'stateVersion']) ||
    value.result.status !== 'established' ||
    typeof value.result.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.result.attachmentIdentity) ||
    typeof value.result.compatibilityIdentity !== 'string' ||
    !COMPATIBILITY_PATTERN.test(value.result.compatibilityIdentity) ||
    !safeVersion(value.result.stateVersion, false)
  ) {
    throw new HarnessStateProblem();
  }
  try {
    const normalizedAttachment = normalizeAttachment(value.normalizedAttachment);
    const manifest = normalizeManifest(value.manifest);
    // Durable verifier: keep plain JSON serialization paired with the
    // establishment producer; the golden manifest-digest scenario pins its order.
    if (sha256(JSON.stringify(manifest)) !== value.manifestSha256) {
      throw new HarnessStateProblem();
    }
    const result: Extract<HarnessAttachmentEstablishment, { readonly status: 'established' }> = {
      status: 'established',
      attachmentIdentity: value.result.attachmentIdentity as HarnessAttachmentIdentity,
      compatibilityIdentity: value.result.compatibilityIdentity as HarnessCompatibilityIdentity,
      stateVersion: value.result.stateVersion,
    };
    if (
      result.attachmentIdentity !== normalizedAttachment.attachmentIdentity ||
      result.compatibilityIdentity !== value.compatibilityIdentity
    ) {
      throw new HarnessStateProblem();
    }
    return {
      formatVersion: 1,
      normalizedAttachment,
      manifest,
      manifestSha256: value.manifestSha256,
      compatibilityIdentity: value.compatibilityIdentity,
      result,
    };
  } catch (error) {
    if (error instanceof HarnessStateProblem) throw error;
    throw new HarnessStateProblem();
  }
}

export function parseHarnessCommandAccepted(value: unknown): HarnessInteractionCommandAccepted {
  if (
    !isRecord(value) ||
    value.status !== 'accepted' ||
    !boundedText(value.commandIdentity) ||
    !safeVersion(value.stateVersion, false) ||
    typeof value.kind !== 'string'
  ) {
    throw new HarnessStateProblem();
  }
  const base = {
    status: 'accepted' as const,
    commandIdentity: value.commandIdentity,
    stateVersion: value.stateVersion,
  };
  if (
    value.kind === 'review.message.committed' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'status',
        'commandIdentity',
        'stateVersion',
        'reviewIdentity',
        'reviewBatchIdentity',
        'reviewMessageIdentity',
        'originReviewBasisIdentity',
        'outgoingMaterialIdentity',
        'outgoingMaterial',
        'handoffIdentity',
        'commitmentReceiptIdentity',
        'capabilitySnapshotIdentity',
        'invocationIdentity',
      ],
      ['commitmentAssessmentIdentity', 'acknowledgementRequirementIdentities', 'acknowledgementIdentities'],
    ) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.reviewMessageIdentity === 'string' &&
    REVIEW_MESSAGE_PATTERN.test(value.reviewMessageIdentity) &&
    typeof value.originReviewBasisIdentity === 'string' &&
    REVIEW_BASIS_PATTERN.test(value.originReviewBasisIdentity) &&
    typeof value.outgoingMaterialIdentity === 'string' &&
    /^rmo_[0-9a-f]{64}$/u.test(value.outgoingMaterialIdentity) &&
    isRecord(value.outgoingMaterial) &&
    hasOnlyKeys(value.outgoingMaterial, ['outgoingMaterialIdentity', 'byteLength', 'characterLength', 'sha256']) &&
    value.outgoingMaterial.outgoingMaterialIdentity === value.outgoingMaterialIdentity &&
    safeVersion(value.outgoingMaterial.byteLength, false) &&
    safeVersion(value.outgoingMaterial.characterLength, false) &&
    value.outgoingMaterial.characterLength <= value.outgoingMaterial.byteLength &&
    typeof value.outgoingMaterial.sha256 === 'string' &&
    SHA256_PATTERN.test(value.outgoingMaterial.sha256) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.commitmentReceiptIdentity === 'string' &&
    RECEIPT_PATTERN.test(value.commitmentReceiptIdentity) &&
    typeof value.capabilitySnapshotIdentity === 'string' &&
    SNAPSHOT_PATTERN.test(value.capabilitySnapshotIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    (value.commitmentAssessmentIdentity === undefined ||
      (typeof value.commitmentAssessmentIdentity === 'string' &&
        SHA256_PATTERN.test(value.commitmentAssessmentIdentity))) &&
    (value.acknowledgementRequirementIdentities === undefined ||
      (Array.isArray(value.acknowledgementRequirementIdentities) &&
        value.acknowledgementRequirementIdentities.length <= MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS &&
        new Set(value.acknowledgementRequirementIdentities).size ===
          value.acknowledgementRequirementIdentities.length &&
        value.acknowledgementRequirementIdentities.every(
          identity => typeof identity === 'string' && ACKNOWLEDGEMENT_REQUIREMENT_PATTERN.test(identity),
        ))) &&
    (value.acknowledgementIdentities === undefined ||
      (Array.isArray(value.acknowledgementIdentities) &&
        value.acknowledgementIdentities.length <= MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS &&
        new Set(value.acknowledgementIdentities).size === value.acknowledgementIdentities.length &&
        value.acknowledgementIdentities.every(
          identity => typeof identity === 'string' && ACKNOWLEDGEMENT_PATTERN.test(identity),
        ))) &&
    (value.acknowledgementRequirementIdentities === undefined) === (value.acknowledgementIdentities === undefined) &&
    (value.acknowledgementRequirementIdentities === undefined ||
      value.acknowledgementRequirementIdentities.length === value.acknowledgementIdentities!.length)
  ) {
    return {
      kind: value.kind,
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
      originReviewBasisIdentity: value.originReviewBasisIdentity as ReviewBasisIdentity,
      outgoingMaterialIdentity: value.outgoingMaterialIdentity as ReviewMessageMaterialIdentity,
      outgoingMaterial: {
        outgoingMaterialIdentity: value.outgoingMaterial.outgoingMaterialIdentity as ReviewMessageMaterialIdentity,
        byteLength: value.outgoingMaterial.byteLength,
        characterLength: value.outgoingMaterial.characterLength,
        sha256: value.outgoingMaterial.sha256,
      },
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      commitmentReceiptIdentity: value.commitmentReceiptIdentity as HarnessCommitmentReceiptIdentity,
      capabilitySnapshotIdentity: value.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      commitmentAssessmentIdentity:
        value.commitmentAssessmentIdentity ??
        sha256(JSON.stringify({ legacyReviewMessageCommandIdentity: value.commandIdentity })),
      acknowledgementRequirementIdentities:
        (value.acknowledgementRequirementIdentities as HarnessAcknowledgementRequirementIdentity[] | undefined) ?? [],
      acknowledgementIdentities:
        (value.acknowledgementIdentities as HarnessAcknowledgementIdentity[] | undefined) ?? [],
    };
  }
  if (
    value.kind === 'review.question.asked' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewSnapshotIdentity',
      'reviewBatchIdentity',
      'questionIdentity',
      'handoffIdentity',
      'commitmentReceiptIdentity',
      'capabilitySnapshotIdentity',
      'invocationIdentity',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewSnapshotIdentity === 'string' &&
    /^rsn_[0-9a-f]{64}$/u.test(value.reviewSnapshotIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.questionIdentity === 'string' &&
    QUESTION_PATTERN.test(value.questionIdentity) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.commitmentReceiptIdentity === 'string' &&
    RECEIPT_PATTERN.test(value.commitmentReceiptIdentity) &&
    typeof value.capabilitySnapshotIdentity === 'string' &&
    SNAPSHOT_PATTERN.test(value.capabilitySnapshotIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return {
      kind: 'review.question.asked',
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      questionIdentity: value.questionIdentity as ReviewQuestionIdentity,
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      commitmentReceiptIdentity: value.commitmentReceiptIdentity as HarnessCommitmentReceiptIdentity,
      capabilitySnapshotIdentity: value.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    };
  }
  if (
    value.kind === 'harness.review-handoff.direct-committed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'handoffIdentity',
      'commitmentReceiptIdentity',
      'capabilitySnapshotIdentity',
      'invocationIdentity',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.commitmentReceiptIdentity === 'string' &&
    RECEIPT_PATTERN.test(value.commitmentReceiptIdentity) &&
    typeof value.capabilitySnapshotIdentity === 'string' &&
    SNAPSHOT_PATTERN.test(value.capabilitySnapshotIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return {
      kind: 'harness.review-handoff.direct-committed',
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      commitmentReceiptIdentity: value.commitmentReceiptIdentity as HarnessCommitmentReceiptIdentity,
      capabilitySnapshotIdentity: value.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    };
  }
  if (
    value.kind === 'harness.invocation.interruption-requested' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'invocationIdentity',
      'interruptionIntentIdentity',
      'route',
    ]) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    typeof value.interruptionIntentIdentity === 'string' &&
    INTERRUPTION_PATTERN.test(value.interruptionIntentIdentity) &&
    value.route === 'direct-request'
  ) {
    return {
      kind: 'harness.invocation.interruption-requested',
      ...base,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      interruptionIntentIdentity: value.interruptionIntentIdentity as HarnessInterruptionIntentIdentity,
      route: 'direct-request',
    };
  }
  if (
    value.kind === 'harness.user-pull.attached' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'attachmentIdentity',
      'compatibilityIdentity',
      'destination',
    ]) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.compatibilityIdentity === 'string' &&
    COMPATIBILITY_PATTERN.test(value.compatibilityIdentity)
  ) {
    return {
      kind: 'harness.user-pull.attached',
      ...base,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      compatibilityIdentity: value.compatibilityIdentity as HarnessCompatibilityIdentity,
      destination: parseDestination(value.destination),
    };
  }
  if (
    value.kind === 'harness.user-pull.prepared' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'status',
        'commandIdentity',
        'stateVersion',
        'reviewIdentity',
        'reviewBatchIdentity',
        'attachmentIdentity',
        'handoffIdentity',
        'commitmentReceiptIdentity',
        'capabilitySnapshotIdentity',
        'preparationIdentity',
      ],
      ['disclosedDeadline'],
    ) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.commitmentReceiptIdentity === 'string' &&
    RECEIPT_PATTERN.test(value.commitmentReceiptIdentity) &&
    typeof value.capabilitySnapshotIdentity === 'string' &&
    SNAPSHOT_PATTERN.test(value.capabilitySnapshotIdentity) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    (value.disclosedDeadline === undefined || isoTimestamp(value.disclosedDeadline))
  ) {
    return {
      kind: 'harness.user-pull.prepared',
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      commitmentReceiptIdentity: value.commitmentReceiptIdentity as HarnessCommitmentReceiptIdentity,
      capabilitySnapshotIdentity: value.capabilitySnapshotIdentity as HarnessCapabilitySnapshotIdentity,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      ...(value.disclosedDeadline === undefined ? {} : { disclosedDeadline: value.disclosedDeadline }),
    };
  }
  if (
    value.kind === 'harness.user-pull.armed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'attachmentIdentity',
      'preparationIdentity',
      'occurrenceIdentity',
    ]) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    typeof value.occurrenceIdentity === 'string' &&
    ARM_OCCURRENCE_PATTERN.test(value.occurrenceIdentity)
  ) {
    return {
      kind: 'harness.user-pull.armed',
      ...base,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      occurrenceIdentity: value.occurrenceIdentity as UserPullArmOccurrenceIdentity,
    };
  }
  if (
    value.kind === 'harness.user-pull.claim-committed' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'attachmentIdentity',
      'handoffIdentity',
      'preparationIdentity',
      'occurrenceIdentity',
      'invocationIdentity',
      'payloadSha256',
      'payloadByteLength',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    typeof value.occurrenceIdentity === 'string' &&
    ARM_OCCURRENCE_PATTERN.test(value.occurrenceIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    typeof value.payloadSha256 === 'string' &&
    SHA256_PATTERN.test(value.payloadSha256) &&
    safeVersion(value.payloadByteLength, false)
  ) {
    return {
      kind: 'harness.user-pull.claim-committed',
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      occurrenceIdentity: value.occurrenceIdentity as UserPullArmOccurrenceIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      payloadSha256: value.payloadSha256,
      payloadByteLength: value.payloadByteLength,
    };
  }
  if (
    value.kind === 'harness.user-pull.claim-duplicate' &&
    hasOnlyKeys(value, [
      'kind',
      'status',
      'commandIdentity',
      'stateVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'attachmentIdentity',
      'handoffIdentity',
      'preparationIdentity',
      'invocationIdentity',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.handoffIdentity === 'string' &&
    HANDOFF_PATTERN.test(value.handoffIdentity) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return {
      kind: 'harness.user-pull.claim-duplicate',
      ...base,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      handoffIdentity: value.handoffIdentity as HarnessHandoffIdentity,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    };
  }
  if (
    value.kind === 'harness.user-pull.withdrawn' &&
    hasOnlyKeys(value, ['kind', 'status', 'commandIdentity', 'stateVersion', 'preparationIdentity', 'reason']) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    (value.reason === 'explicit-withdrawal' || value.reason === 'workflow-cancellation')
  ) {
    return {
      kind: 'harness.user-pull.withdrawn',
      ...base,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      reason: value.reason,
    };
  }
  throw new HarnessStateProblem();
}

export function parseHarnessCommandRecord(value: unknown): HarnessCommandRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'normalizedCommand', 'result']) ||
    value.formatVersion !== 1 ||
    typeof value.normalizedCommand !== 'string'
  ) {
    throw new HarnessStateProblem();
  }
  return {
    formatVersion: 1,
    normalizedCommand: value.normalizedCommand,
    result: parseHarnessCommandAccepted(value.result),
  };
}

export function parseAppliedEvidenceAcknowledgement(
  value: unknown,
): Extract<HarnessEvidenceAcknowledgement, { readonly status: 'applied' }> {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['status', 'evidenceIdentity', 'stateVersion']) ||
    value.status !== 'applied' ||
    !boundedEvidenceIdentity(value.evidenceIdentity) ||
    !safeVersion(value.stateVersion, false)
  ) {
    throw new HarnessStateProblem();
  }
  return {
    status: 'applied',
    evidenceIdentity: value.evidenceIdentity,
    stateVersion: value.stateVersion,
  };
}

export function parseHarnessEvidenceRecord(value: unknown): HarnessEvidenceRecordPayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'normalizedEvidence', 'acknowledgement']) ||
    value.formatVersion !== 1 ||
    typeof value.normalizedEvidence !== 'string'
  ) {
    throw new HarnessStateProblem();
  }
  return {
    formatVersion: 1,
    normalizedEvidence: value.normalizedEvidence,
    acknowledgement: parseAppliedEvidenceAcknowledgement(value.acknowledgement),
  };
}
