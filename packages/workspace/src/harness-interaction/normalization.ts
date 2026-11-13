import { decodeBytesBase64, encodeBytesBase64 } from '../bytesBase64.js';
import { hasOnlyKeys, isRecord, isoTimestamp, safeVersion, unicodeScalarText } from '../recordCodec.js';
import type {
  ReviewAnchorInput,
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewIdentity,
} from '../reviewing/index.js';
import { sha256 } from '../sha256.js';
import type { WorkspaceIdentity } from '../workspace.js';
import type {
  ArmUserPullCommand,
  AskPiReviewQuestionCommand,
  AttachUserPullCommand,
  ClaimUserPullCommand,
  CommitDirectReviewHandoffCommand,
  CommitReviewMessageCommand,
  DirectReviewAuthority,
  DirectReviewCapabilityContract,
  ReviewedCapabilityContract,
  UserPullReviewCapabilityContract,
  HarnessAcknowledgementRequirementIdentity,
  HarnessAttachmentDestination,
  HarnessAttachmentIdentity,
  HarnessAvailability,
  HarnessCompatibilityIdentity,
  HarnessInteractionCommand,
  HarnessInvocationIdentity,
  NormalizedHarnessEvidence,
  NormalizedReviewResponseResult,
  ObserveUserPullCommand,
  PrepareUserPullCommand,
  RecordUserPullObservabilityCommand,
  RequestHarnessInterruptionCommand,
  ReviewMessageLocationInput,
  ReviewedCapabilityManifest,
  ReviewedHarnessAttachment,
  UserPullEvidenceCorrelation,
  UserPullInvocationUnresolvedReason,
  UserPullPreparationIdentity,
  WithdrawUserPullCommand,
} from './contracts.js';
import {
  ACKNOWLEDGEMENT_REQUIREMENT_PATTERN,
  ARM_OCCURRENCE_PATTERN,
  ATTACHMENT_PATTERN,
  BATCH_PATTERN,
  COMPATIBILITY_PATTERN,
  DIFF_ROW_PATTERN,
  FILE_PATTERN,
  INVOCATION_PATTERN,
  LIMITATION_MAX_BYTES,
  MAX_CANONICAL_PATH_BYTES,
  MAX_CAPABILITIES,
  MAX_LIMITATIONS,
  MAX_NO_START_TIMEOUT_MS,
  MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS,
  MAX_REVIEW_MESSAGE_BYTES,
  MAX_REVIEW_MESSAGE_PATH_BYTES,
  MAX_REVIEW_QUESTION_BYTES,
  MAX_REVIEW_RESPONSE_BYTES,
  MIN_NO_START_TIMEOUT_MS,
  PREPARATION_PATTERN,
  REVIEW_BASIS_PATTERN,
  REVIEW_PATTERN,
  SHA256_PATTERN,
} from './limits.js';
import { boundedEvidenceIdentity, boundedLabel, boundedText, cloneFrozen } from './utils.js';

export function normalizeAvailability(value: unknown): HarnessAvailability {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new TypeError('Invalid normalized Harness Availability');
  }
  if (value.status === 'available' && hasOnlyKeys(value, ['status'])) {
    return { status: 'available' };
  }
  if (
    value.status === 'blocked' &&
    hasOnlyKeys(value, ['status', 'reason']) &&
    ['busy', 'disconnected', 'host-unavailable'].includes(String(value.reason))
  ) {
    return {
      status: 'blocked',
      reason: value.reason as Extract<HarnessAvailability, { status: 'blocked' }>['reason'],
    };
  }
  if (
    value.status === 'unknown' &&
    hasOnlyKeys(value, ['status', 'reason']) &&
    value.reason === 'readiness-unavailable'
  ) {
    return { status: 'unknown', reason: 'readiness-unavailable' };
  }
  throw new TypeError('Invalid normalized Harness Availability');
}

export function normalizeDestination(value: unknown): HarnessAttachmentDestination {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['harnessLabel', 'sessionLabel', 'repositoryLabel', 'canonicalCheckout']) ||
    !boundedLabel(value.harnessLabel) ||
    !boundedLabel(value.sessionLabel) ||
    !boundedLabel(value.repositoryLabel) ||
    !boundedLabel(value.canonicalCheckout)
  ) {
    throw new TypeError('Invalid normalized Harness destination');
  }
  return {
    harnessLabel: value.harnessLabel,
    sessionLabel: value.sessionLabel,
    repositoryLabel: value.repositoryLabel,
    canonicalCheckout: value.canonicalCheckout,
  };
}

/**
 * Durable format contract: the exact key order rebuilt here and by
 * normalizeManifest is persisted through plain JSON.stringify. The golden
 * manifest-digest scenario pins this whole nested order; changing it requires
 * a durable migration rather than cosmetic literal reordering.
 */
/** Read-only authority must be enforced; write authority is communicated and bounded by session tools. */
export function isDirectReviewEffectConstraint(
  authority: DirectReviewAuthority,
  value: Record<string, unknown>,
): boolean {
  if (authority === 'discussion-only') {
    return value.strength === 'enforced' && value.scope === 'workspace-read-only';
  }
  return value.strength === 'communicated' && value.scope === 'harness-tools';
}

function normalizeDirectCapability(value: Record<string, unknown>): DirectReviewCapabilityContract {
  if (
    !hasOnlyKeys(value, [
      'contractVersion',
      'capabilityIdentity',
      'handoffKind',
      'route',
      'authority',
      'effectConstraint',
      'evidenceProfile',
      'interruption',
      'artifactResultContract',
      'noStartTimeoutMs',
      'knownLimitations',
    ]) ||
    value.contractVersion !== 1 ||
    !boundedText(value.capabilityIdentity) ||
    value.handoffKind !== 'submit-review-batch' ||
    value.route !== 'direct' ||
    (value.authority !== 'discussion-only' && value.authority !== 'workspace-write') ||
    !isRecord(value.effectConstraint) ||
    !hasOnlyKeys(value.effectConstraint, ['strength', 'scope', 'limitation']) ||
    !isDirectReviewEffectConstraint(value.authority, value.effectConstraint) ||
    !boundedText(value.effectConstraint.limitation, LIMITATION_MAX_BYTES) ||
    !isRecord(value.evidenceProfile) ||
    !hasOnlyKeys(value.evidenceProfile, [
      'dispatchRejection',
      'start',
      'normalEnd',
      'failure',
      'interruption',
      'replay',
    ]) ||
    value.evidenceProfile.dispatchRejection !== 'correlated' ||
    value.evidenceProfile.start !== 'correlated' ||
    value.evidenceProfile.normalEnd !== 'correlated' ||
    value.evidenceProfile.failure !== 'correlated' ||
    value.evidenceProfile.interruption !== 'correlated' ||
    value.evidenceProfile.replay !== 'unavailable' ||
    !isRecord(value.interruption) ||
    !hasOnlyKeys(value.interruption, ['route']) ||
    value.interruption.route !== 'direct-request' ||
    !isRecord(value.artifactResultContract) ||
    !hasOnlyKeys(value.artifactResultContract, [
      'contractVersion',
      'contractIdentity',
      'artifactKind',
      'source',
      'completeness',
      'maximumBytes',
    ]) ||
    value.artifactResultContract.contractVersion !== 1 ||
    !boundedText(value.artifactResultContract.contractIdentity) ||
    value.artifactResultContract.artifactKind !== 'review-response' ||
    value.artifactResultContract.source !== 'settled-final-assistant-text' ||
    value.artifactResultContract.completeness !== 'all-final-text-blocks-after-correlated-user-message' ||
    value.artifactResultContract.maximumBytes !== MAX_REVIEW_RESPONSE_BYTES ||
    !safeVersion(value.noStartTimeoutMs, false) ||
    value.noStartTimeoutMs < MIN_NO_START_TIMEOUT_MS ||
    value.noStartTimeoutMs > MAX_NO_START_TIMEOUT_MS ||
    !Array.isArray(value.knownLimitations) ||
    value.knownLimitations.length > MAX_LIMITATIONS ||
    !value.knownLimitations.every(item => boundedText(item, LIMITATION_MAX_BYTES))
  ) {
    throw new TypeError('Invalid Direct Review Capability contract');
  }
  return cloneFrozen({
    contractVersion: 1,
    capabilityIdentity: value.capabilityIdentity,
    handoffKind: 'submit-review-batch',
    route: 'direct',
    authority: value.authority,
    effectConstraint:
      value.authority === 'discussion-only'
        ? {
            strength: 'enforced' as const,
            scope: 'workspace-read-only' as const,
            limitation: value.effectConstraint.limitation,
          }
        : {
            strength: 'communicated' as const,
            scope: 'harness-tools' as const,
            limitation: value.effectConstraint.limitation,
          },
    evidenceProfile: {
      dispatchRejection: 'correlated',
      start: 'correlated',
      normalEnd: 'correlated',
      failure: 'correlated',
      interruption: 'correlated',
      replay: 'unavailable',
    },
    interruption: { route: 'direct-request' },
    artifactResultContract: {
      contractVersion: 1,
      contractIdentity: value.artifactResultContract.contractIdentity,
      artifactKind: 'review-response',
      source: 'settled-final-assistant-text',
      completeness: 'all-final-text-blocks-after-correlated-user-message',
      maximumBytes: value.artifactResultContract.maximumBytes,
    },
    noStartTimeoutMs: value.noStartTimeoutMs,
    knownLimitations: value.knownLimitations.map(limitation => {
      if (!boundedText(limitation, LIMITATION_MAX_BYTES)) {
        throw new TypeError('Invalid Direct Review Capability limitation');
      }
      return limitation;
    }),
  } satisfies DirectReviewCapabilityContract);
}

function normalizeUserPullCapability(value: Record<string, unknown>): UserPullReviewCapabilityContract {
  if (
    !hasOnlyKeys(
      value,
      [
        'contractVersion',
        'capabilityIdentity',
        'handoffKind',
        'route',
        'authority',
        'effectConstraint',
        'evidenceProfile',
        'knownLimitations',
      ],
      ['artifactResultContract'],
    ) ||
    value.contractVersion !== 1 ||
    !boundedText(value.capabilityIdentity) ||
    value.handoffKind !== 'submit-review-batch' ||
    value.route !== 'user-pull' ||
    (value.authority !== 'discussion-only' && value.authority !== 'workspace-write') ||
    !isRecord(value.effectConstraint) ||
    !hasOnlyKeys(value.effectConstraint, ['strength', 'scope', 'limitation']) ||
    !isDirectReviewEffectConstraint(value.authority, value.effectConstraint) ||
    !boundedText(value.effectConstraint.limitation, LIMITATION_MAX_BYTES) ||
    !isRecord(value.evidenceProfile) ||
    !hasOnlyKeys(value.evidenceProfile, ['submission', 'normalEnd', 'failure', 'interruption', 'replay']) ||
    value.evidenceProfile.submission !== 'correlated' ||
    value.evidenceProfile.normalEnd !== 'correlated' ||
    value.evidenceProfile.failure !== 'correlated' ||
    value.evidenceProfile.interruption !== 'unavailable' ||
    value.evidenceProfile.replay !== 'unavailable' ||
    (value.artifactResultContract !== undefined &&
      (!isRecord(value.artifactResultContract) ||
        !hasOnlyKeys(value.artifactResultContract, [
          'contractVersion',
          'contractIdentity',
          'artifactKind',
          'source',
          'completeness',
          'maximumBytes',
        ]) ||
        value.artifactResultContract.contractVersion !== 1 ||
        !boundedText(value.artifactResultContract.contractIdentity) ||
        value.artifactResultContract.artifactKind !== 'review-response' ||
        value.artifactResultContract.source !== 'settled-final-assistant-text' ||
        value.artifactResultContract.completeness !== 'all-final-text-blocks-after-correlated-user-message' ||
        value.artifactResultContract.maximumBytes !== MAX_REVIEW_RESPONSE_BYTES)) ||
    !Array.isArray(value.knownLimitations) ||
    value.knownLimitations.length > MAX_LIMITATIONS ||
    !value.knownLimitations.every(item => boundedText(item, LIMITATION_MAX_BYTES))
  ) {
    throw new TypeError('Invalid User Pull Review Capability contract');
  }
  return cloneFrozen({
    contractVersion: 1,
    capabilityIdentity: value.capabilityIdentity,
    handoffKind: 'submit-review-batch',
    route: 'user-pull',
    authority: value.authority,
    effectConstraint:
      value.authority === 'discussion-only'
        ? {
            strength: 'enforced' as const,
            scope: 'workspace-read-only' as const,
            limitation: value.effectConstraint.limitation,
          }
        : {
            strength: 'communicated' as const,
            scope: 'harness-tools' as const,
            limitation: value.effectConstraint.limitation,
          },
    evidenceProfile: {
      submission: 'correlated',
      normalEnd: 'correlated',
      failure: 'correlated',
      interruption: 'unavailable',
      replay: 'unavailable',
    },
    ...(value.artifactResultContract === undefined
      ? {}
      : {
          artifactResultContract: {
            contractVersion: 1 as const,
            contractIdentity: value.artifactResultContract.contractIdentity as string,
            artifactKind: 'review-response' as const,
            source: 'settled-final-assistant-text' as const,
            completeness: 'all-final-text-blocks-after-correlated-user-message' as const,
            maximumBytes: value.artifactResultContract.maximumBytes as number,
          },
        }),
    knownLimitations: value.knownLimitations.map(limitation => {
      if (!boundedText(limitation, LIMITATION_MAX_BYTES)) {
        throw new TypeError('Invalid User Pull Review Capability limitation');
      }
      return limitation;
    }),
  } satisfies UserPullReviewCapabilityContract);
}

export function isDirectReviewCapability(
  capability: ReviewedCapabilityContract,
): capability is DirectReviewCapabilityContract {
  return capability.route === 'direct';
}

export function isUserPullReviewCapability(
  capability: ReviewedCapabilityContract,
): capability is UserPullReviewCapabilityContract {
  return capability.route === 'user-pull';
}

/** Route is the discriminator; an unknown route is refused, never coerced. */
export function normalizeCapability(value: unknown): ReviewedCapabilityContract {
  if (!isRecord(value)) throw new TypeError('Invalid reviewed Capability contract');
  if (value.route === 'user-pull') return normalizeUserPullCapability(value);
  return normalizeDirectCapability(value);
}

export function normalizeManifest(value: unknown): ReviewedCapabilityManifest {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'schema',
      'adapterImplementationIdentity',
      'adapterDisplayName',
      'reviewedHostVersions',
      'capabilities',
    ]) ||
    value.schema !== 'neoflow.harness-capabilities/1' ||
    !boundedText(value.adapterImplementationIdentity) ||
    !boundedLabel(value.adapterDisplayName) ||
    !Array.isArray(value.reviewedHostVersions) ||
    value.reviewedHostVersions.length < 1 ||
    value.reviewedHostVersions.length > 64 ||
    !value.reviewedHostVersions.every(item => boundedText(item)) ||
    new Set(value.reviewedHostVersions).size !== value.reviewedHostVersions.length ||
    !Array.isArray(value.capabilities) ||
    value.capabilities.length < 1 ||
    value.capabilities.length > MAX_CAPABILITIES
  ) {
    throw new TypeError('Invalid reviewed Capability Manifest');
  }
  const capabilities = value.capabilities.map(normalizeCapability);
  if (new Set(capabilities.map(item => item.capabilityIdentity)).size !== capabilities.length) {
    throw new TypeError('Duplicate reviewed Capability identity');
  }
  return cloneFrozen({
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: value.adapterImplementationIdentity,
    adapterDisplayName: value.adapterDisplayName,
    reviewedHostVersions: [...value.reviewedHostVersions] as string[],
    capabilities,
  });
}

export function normalizeAttachment(value: unknown): ReviewedHarnessAttachment {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'evidenceIdentity',
      'attachmentIdentity',
      'workspaceIdentity',
      'hostVersion',
      'destination',
      'availability',
    ]) ||
    !boundedEvidenceIdentity(value.evidenceIdentity) ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity) ||
    !boundedText(value.workspaceIdentity) ||
    !boundedText(value.hostVersion)
  ) {
    throw new TypeError('Invalid reviewed Harness Attachment');
  }
  return cloneFrozen({
    evidenceIdentity: value.evidenceIdentity,
    attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
    workspaceIdentity: value.workspaceIdentity as WorkspaceIdentity,
    hostVersion: value.hostVersion,
    destination: normalizeDestination(value.destination),
    availability: normalizeAvailability(value.availability),
  });
}

export function normalizeQuestionAnchor(value: unknown): ReviewAnchorInput {
  if (!isRecord(value)) {
    throw new TypeError('Invalid exact Review Question Anchor');
  }
  if (value.kind === 'review.whole-file') {
    if (
      !hasOnlyKeys(value, ['kind', 'fileIdentity', 'side'], ['fileAbsolute']) ||
      typeof value.fileIdentity !== 'string' ||
      !FILE_PATTERN.test(value.fileIdentity) ||
      (value.side !== 'old' && value.side !== 'new') ||
      (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute))
    ) {
      throw new TypeError('Invalid exact Review Question Anchor');
    }
    return {
      kind: 'review.whole-file',
      fileIdentity: value.fileIdentity,
      side: value.side,
      ...(value.fileAbsolute === undefined ? {} : { fileAbsolute: value.fileAbsolute }),
    };
  }
  const hasRowCoordinates = value.rowIdentity !== undefined || value.rowAbsolute !== undefined;
  if (
    !hasOnlyKeys(value, ['kind', 'fileIdentity', 'side', 'line'], ['fileAbsolute', 'rowIdentity', 'rowAbsolute']) ||
    value.kind !== 'review.diff-line' ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_PATTERN.test(value.fileIdentity) ||
    (value.side !== 'old' && value.side !== 'new') ||
    !safeVersion(value.line, false) ||
    (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute)) ||
    (hasRowCoordinates &&
      (typeof value.rowIdentity !== 'string' ||
        !DIFF_ROW_PATTERN.test(value.rowIdentity) ||
        !safeVersion(value.rowAbsolute)))
  ) {
    throw new TypeError('Invalid exact Review Question Anchor');
  }
  return {
    kind: 'review.diff-line',
    fileIdentity: value.fileIdentity,
    side: value.side,
    line: value.line,
    ...(value.fileAbsolute === undefined ? {} : { fileAbsolute: value.fileAbsolute }),
    ...(hasRowCoordinates
      ? {
          rowIdentity: value.rowIdentity as string,
          rowAbsolute: value.rowAbsolute as number,
        }
      : {}),
  };
}

export function normalizeMessageLocationInput(value: unknown): ReviewMessageLocationInput {
  if (!isRecord(value) || !hasOnlyKeys(value, ['pathBytesBase64', 'line']) || !safeVersion(value.line, false)) {
    throw new TypeError('Invalid Review Message location');
  }
  let pathBytes: Buffer;
  try {
    pathBytes = decodeBytesBase64(value.pathBytesBase64);
  } catch {
    throw new TypeError('Invalid Review Message path');
  }
  const components = pathBytes.toString('hex').split('2f');
  if (
    pathBytes.byteLength === 0 ||
    pathBytes.byteLength > MAX_REVIEW_MESSAGE_PATH_BYTES ||
    pathBytes[0] === 0x2f ||
    pathBytes.includes(0) ||
    components.some(component => component.length === 0 || component === '2e' || component === '2e2e')
  ) {
    throw new TypeError('Invalid Review Message path');
  }
  return { pathBytesBase64: encodeBytesBase64(pathBytes), line: value.line };
}

function normalizeUserPullObservabilityObservation(value: unknown): RecordUserPullObservabilityCommand['observation'] {
  if (!isRecord(value) || typeof value.kind !== 'string' || !boundedEvidenceIdentity(value.evidenceIdentity)) {
    throw new TypeError('Invalid User Pull observability observation');
  }
  if (
    value.kind === 'context-budget' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'evidenceIdentity',
        'compatibilityIdentity',
        'source',
        'modelId',
        'modelDisplayName',
        'contextWindowSize',
        'totalInputTokens',
        'totalOutputTokens',
        'currentUsage',
      ],
      ['usedPercentage', 'remainingPercentage', 'promptId'],
    ) &&
    typeof value.compatibilityIdentity === 'string' &&
    COMPATIBILITY_PATTERN.test(value.compatibilityIdentity) &&
    value.source === 'claude-status-line' &&
    boundedText(value.modelId, 256) &&
    unicodeScalarText(value.modelId) &&
    boundedText(value.modelDisplayName, 256) &&
    unicodeScalarText(value.modelDisplayName) &&
    safeVersion(value.contextWindowSize, false) &&
    safeVersion(value.totalInputTokens) &&
    safeVersion(value.totalOutputTokens) &&
    (value.currentUsage === null ||
      (isRecord(value.currentUsage) &&
        hasOnlyKeys(value.currentUsage, [
          'inputTokens',
          'outputTokens',
          'cacheCreationInputTokens',
          'cacheReadInputTokens',
        ]) &&
        safeVersion(value.currentUsage.inputTokens) &&
        safeVersion(value.currentUsage.outputTokens) &&
        safeVersion(value.currentUsage.cacheCreationInputTokens) &&
        safeVersion(value.currentUsage.cacheReadInputTokens))) &&
    (value.usedPercentage === undefined ||
      (typeof value.usedPercentage === 'number' &&
        Number.isFinite(value.usedPercentage) &&
        value.usedPercentage >= 0 &&
        value.usedPercentage <= 10_000)) &&
    (value.remainingPercentage === undefined ||
      (typeof value.remainingPercentage === 'number' &&
        Number.isFinite(value.remainingPercentage) &&
        value.remainingPercentage >= 0 &&
        value.remainingPercentage <= 10_000)) &&
    (value.promptId === undefined || (boundedText(value.promptId) && unicodeScalarText(value.promptId)))
  ) {
    return {
      kind: 'context-budget',
      evidenceIdentity: value.evidenceIdentity,
      compatibilityIdentity: value.compatibilityIdentity as HarnessCompatibilityIdentity,
      source: 'claude-status-line',
      modelId: value.modelId,
      modelDisplayName: value.modelDisplayName,
      contextWindowSize: value.contextWindowSize,
      totalInputTokens: value.totalInputTokens,
      totalOutputTokens: value.totalOutputTokens,
      currentUsage:
        value.currentUsage === null
          ? null
          : {
              inputTokens: value.currentUsage.inputTokens as number,
              outputTokens: value.currentUsage.outputTokens as number,
              cacheCreationInputTokens: value.currentUsage.cacheCreationInputTokens as number,
              cacheReadInputTokens: value.currentUsage.cacheReadInputTokens as number,
            },
      ...(value.usedPercentage === undefined ? {} : { usedPercentage: value.usedPercentage }),
      ...(value.remainingPercentage === undefined ? {} : { remainingPercentage: value.remainingPercentage }),
      ...(value.promptId === undefined ? {} : { promptId: value.promptId }),
    };
  }
  if (
    value.kind === 'compaction' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'phase', 'trigger']) &&
    (value.phase === 'started' || value.phase === 'completed') &&
    (value.trigger === 'manual' || value.trigger === 'auto')
  ) {
    return {
      kind: 'compaction',
      evidenceIdentity: value.evidenceIdentity,
      phase: value.phase,
      trigger: value.trigger,
    };
  }
  if (
    value.kind === 'availability-blocked' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'reason']) &&
    value.reason === 'session-ended'
  ) {
    return {
      kind: 'availability-blocked',
      evidenceIdentity: value.evidenceIdentity,
      reason: 'session-ended',
    };
  }
  throw new TypeError('Invalid User Pull observability observation');
}

function normalizeUserPullObservation(value: unknown): ObserveUserPullCommand['observation'] {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Invalid User Pull observation');
  }
  const nativeKeys = ['kind', 'sessionId', 'promptId', 'canonicalGitRoot', 'canonicalGitDir'];
  const nativeIdentityIsValid = (): boolean =>
    boundedText(value.sessionId) &&
    unicodeScalarText(value.sessionId) &&
    boundedText(value.promptId) &&
    unicodeScalarText(value.promptId) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir);
  if (value.kind === 'prompt-submitted' && hasOnlyKeys(value, nativeKeys) && nativeIdentityIsValid()) {
    return {
      kind: 'prompt-submitted',
      sessionId: value.sessionId as string,
      promptId: value.promptId as string,
      canonicalGitRoot: value.canonicalGitRoot as string,
      canonicalGitDir: value.canonicalGitDir as string,
    };
  }
  if (
    value.kind === 'normal-stop' &&
    hasOnlyKeys(value, [...nativeKeys, 'stopHookActive'], ['backgroundTaskCount', 'sessionCronCount']) &&
    nativeIdentityIsValid() &&
    typeof value.stopHookActive === 'boolean' &&
    (value.backgroundTaskCount === undefined || safeVersion(value.backgroundTaskCount)) &&
    (value.sessionCronCount === undefined || safeVersion(value.sessionCronCount))
  ) {
    return {
      kind: 'normal-stop',
      sessionId: value.sessionId as string,
      promptId: value.promptId as string,
      canonicalGitRoot: value.canonicalGitRoot as string,
      canonicalGitDir: value.canonicalGitDir as string,
      ...(value.backgroundTaskCount === undefined ? {} : { backgroundTaskCount: value.backgroundTaskCount }),
      ...(value.sessionCronCount === undefined ? {} : { sessionCronCount: value.sessionCronCount }),
      stopHookActive: value.stopHookActive,
    };
  }
  if (
    value.kind === 'stop-failure' &&
    hasOnlyKeys(value, nativeKeys, ['errorType', 'failureType']) &&
    nativeIdentityIsValid() &&
    (value.errorType === undefined || boundedLabel(value.errorType)) &&
    (value.failureType === undefined || boundedLabel(value.failureType))
  ) {
    return {
      kind: 'stop-failure',
      sessionId: value.sessionId as string,
      promptId: value.promptId as string,
      canonicalGitRoot: value.canonicalGitRoot as string,
      canonicalGitDir: value.canonicalGitDir as string,
      ...(value.errorType === undefined ? {} : { errorType: value.errorType }),
      ...(value.failureType === undefined ? {} : { failureType: value.failureType }),
    };
  }
  if (
    value.kind === 'session-ended' &&
    hasOnlyKeys(value, ['kind', 'sessionId', 'canonicalGitRoot', 'canonicalGitDir'], ['sessionReason']) &&
    boundedText(value.sessionId) &&
    unicodeScalarText(value.sessionId) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir) &&
    (value.sessionReason === undefined || boundedLabel(value.sessionReason))
  ) {
    return {
      kind: 'session-ended',
      sessionId: value.sessionId,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
      ...(value.sessionReason === undefined ? {} : { sessionReason: value.sessionReason }),
    };
  }
  if (
    value.kind === 'correlation-lost' &&
    hasOnlyKeys(value, ['kind', 'attachmentIdentity', 'invocationIdentity', 'reason']) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    (value.reason === 'host-disconnected' || value.reason === 'attachment-identity-changed')
  ) {
    return {
      kind: 'correlation-lost',
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      reason: value.reason,
    };
  }
  throw new TypeError('Invalid User Pull observation');
}

export function normalizeCommand(value: unknown): HarnessInteractionCommand {
  if (
    !isRecord(value) ||
    typeof value.kind !== 'string' ||
    !boundedText(value.commandIdentity) ||
    !safeVersion(value.expectedStateVersion)
  ) {
    throw new TypeError('Invalid Harness Interaction command');
  }
  if (
    value.kind === 'review.message.commit' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'reviewIdentity',
      'originReviewBasisIdentity',
      'location',
      'body',
      'attachmentIdentity',
      'inspectionIdentity',
      'acceptedAcknowledgementRequirementIdentities',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.originReviewBasisIdentity === 'string' &&
    REVIEW_BASIS_PATTERN.test(value.originReviewBasisIdentity) &&
    typeof value.body === 'string' &&
    value.body.trim().length > 0 &&
    Buffer.byteLength(value.body, 'utf8') <= MAX_REVIEW_MESSAGE_BYTES &&
    !value.body.includes('\u0000') &&
    unicodeScalarText(value.body) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.inspectionIdentity === 'string' &&
    SHA256_PATTERN.test(value.inspectionIdentity) &&
    Array.isArray(value.acceptedAcknowledgementRequirementIdentities) &&
    value.acceptedAcknowledgementRequirementIdentities.length <= MAX_REVIEW_MESSAGE_ACKNOWLEDGEMENTS &&
    new Set(value.acceptedAcknowledgementRequirementIdentities).size ===
      value.acceptedAcknowledgementRequirementIdentities.length &&
    value.acceptedAcknowledgementRequirementIdentities.every(
      identity => typeof identity === 'string' && ACKNOWLEDGEMENT_REQUIREMENT_PATTERN.test(identity),
    )
  ) {
    return cloneFrozen({
      kind: 'review.message.commit',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      originReviewBasisIdentity: value.originReviewBasisIdentity as ReviewBasisIdentity,
      location: normalizeMessageLocationInput(value.location),
      body: value.body,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      inspectionIdentity: value.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities:
        value.acceptedAcknowledgementRequirementIdentities as HarnessAcknowledgementRequirementIdentity[],
    } satisfies CommitReviewMessageCommand);
  }
  if (
    value.kind === 'review.question.ask' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'reviewIdentity',
      'anchor',
      'body',
      'attachmentIdentity',
      'inspectionIdentity',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.body === 'string' &&
    value.body.trim().length > 0 &&
    Buffer.byteLength(value.body, 'utf8') <= MAX_REVIEW_QUESTION_BYTES &&
    !value.body.includes('\u0000') &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.inspectionIdentity === 'string' &&
    SHA256_PATTERN.test(value.inspectionIdentity)
  ) {
    return cloneFrozen({
      kind: 'review.question.ask',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      anchor: normalizeQuestionAnchor(value.anchor),
      body: value.body,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      inspectionIdentity: value.inspectionIdentity,
    } satisfies AskPiReviewQuestionCommand);
  }
  if (
    value.kind === 'harness.review-handoff.commit' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'reviewIdentity',
      'reviewBatchIdentity',
      'attachmentIdentity',
      'inspectionIdentity',
      'acknowledgeUnresolvedInvocationRisk',
    ]) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.inspectionIdentity === 'string' &&
    SHA256_PATTERN.test(value.inspectionIdentity) &&
    typeof value.acknowledgeUnresolvedInvocationRisk === 'boolean'
  ) {
    return cloneFrozen({
      kind: 'harness.review-handoff.commit',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      inspectionIdentity: value.inspectionIdentity,
      acknowledgeUnresolvedInvocationRisk: value.acknowledgeUnresolvedInvocationRisk,
    } satisfies CommitDirectReviewHandoffCommand);
  }
  if (
    value.kind === 'harness.invocation.interruption.request' &&
    hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'invocationIdentity']) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return cloneFrozen({
      kind: 'harness.invocation.interruption.request',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    } satisfies RequestHarnessInterruptionCommand);
  }
  if (
    value.kind === 'harness.user-pull.attach' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'sessionId',
      'canonicalGitRoot',
      'canonicalGitDir',
      'hostVersion',
      'manifest',
    ]) &&
    boundedText(value.sessionId) &&
    unicodeScalarText(value.sessionId) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir) &&
    boundedText(value.hostVersion) &&
    unicodeScalarText(value.hostVersion)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.attach',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      sessionId: value.sessionId,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
      hostVersion: value.hostVersion,
      manifest: normalizeManifest(value.manifest),
    } satisfies AttachUserPullCommand);
  }
  if (
    value.kind === 'harness.user-pull.prepare' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'commandIdentity',
        'expectedStateVersion',
        'reviewIdentity',
        'reviewBatchIdentity',
        'attachmentIdentity',
        'inspectionIdentity',
      ],
      ['disclosedDeadline'],
    ) &&
    typeof value.reviewIdentity === 'string' &&
    REVIEW_PATTERN.test(value.reviewIdentity) &&
    typeof value.reviewBatchIdentity === 'string' &&
    BATCH_PATTERN.test(value.reviewBatchIdentity) &&
    typeof value.attachmentIdentity === 'string' &&
    ATTACHMENT_PATTERN.test(value.attachmentIdentity) &&
    typeof value.inspectionIdentity === 'string' &&
    SHA256_PATTERN.test(value.inspectionIdentity) &&
    (value.disclosedDeadline === undefined || isoTimestamp(value.disclosedDeadline))
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.prepare',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      reviewIdentity: value.reviewIdentity as ReviewIdentity,
      reviewBatchIdentity: value.reviewBatchIdentity as ReviewBatchIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      inspectionIdentity: value.inspectionIdentity,
      ...(value.disclosedDeadline === undefined ? {} : { disclosedDeadline: value.disclosedDeadline }),
    } satisfies PrepareUserPullCommand);
  }
  if (
    value.kind === 'harness.user-pull.arm' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'bridgeProtocolVersion',
      'sessionId',
      'promptId',
      'canonicalGitRoot',
      'canonicalGitDir',
    ]) &&
    safeVersion(value.bridgeProtocolVersion, false) &&
    boundedText(value.sessionId) &&
    unicodeScalarText(value.sessionId) &&
    boundedText(value.promptId) &&
    unicodeScalarText(value.promptId) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.arm',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      bridgeProtocolVersion: value.bridgeProtocolVersion,
      sessionId: value.sessionId,
      promptId: value.promptId,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
    } satisfies ArmUserPullCommand);
  }
  if (
    value.kind === 'harness.user-pull.claim' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'bridgeProtocolVersion',
      'canonicalGitRoot',
      'canonicalGitDir',
    ]) &&
    safeVersion(value.bridgeProtocolVersion, false) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.claim',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      bridgeProtocolVersion: value.bridgeProtocolVersion,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
    } satisfies ClaimUserPullCommand);
  }
  if (
    value.kind === 'harness.user-pull.observe' &&
    hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'bridgeProtocolVersion', 'observation']) &&
    safeVersion(value.bridgeProtocolVersion, false)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.observe',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      bridgeProtocolVersion: value.bridgeProtocolVersion,
      observation: normalizeUserPullObservation(value.observation),
    } satisfies ObserveUserPullCommand);
  }
  if (
    value.kind === 'harness.user-pull.observability.record' &&
    hasOnlyKeys(value, [
      'kind',
      'commandIdentity',
      'expectedStateVersion',
      'bridgeProtocolVersion',
      'sessionId',
      'canonicalGitRoot',
      'canonicalGitDir',
      'observation',
    ]) &&
    safeVersion(value.bridgeProtocolVersion, false) &&
    boundedText(value.sessionId) &&
    unicodeScalarText(value.sessionId) &&
    boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitRoot) &&
    boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
    unicodeScalarText(value.canonicalGitDir)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      bridgeProtocolVersion: value.bridgeProtocolVersion,
      sessionId: value.sessionId,
      canonicalGitRoot: value.canonicalGitRoot,
      canonicalGitDir: value.canonicalGitDir,
      observation: normalizeUserPullObservabilityObservation(value.observation),
    } satisfies RecordUserPullObservabilityCommand);
  }
  if (
    value.kind === 'harness.user-pull.withdraw' &&
    hasOnlyKeys(value, ['kind', 'commandIdentity', 'expectedStateVersion', 'preparationIdentity', 'reason']) &&
    typeof value.preparationIdentity === 'string' &&
    PREPARATION_PATTERN.test(value.preparationIdentity) &&
    (value.reason === 'explicit-withdrawal' || value.reason === 'workflow-cancellation')
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.withdraw',
      commandIdentity: value.commandIdentity,
      expectedStateVersion: value.expectedStateVersion,
      preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
      reason: value.reason,
    } satisfies WithdrawUserPullCommand);
  }
  throw new TypeError('Unknown Harness Interaction command');
}

export function normalizeResponseResult(value: unknown): NormalizedReviewResponseResult | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['contractVersion', 'contractIdentity', 'source', 'body', 'byteLength', 'sha256']) ||
    value.contractVersion !== 1 ||
    !boundedText(value.contractIdentity) ||
    value.source !== 'settled-final-assistant-text' ||
    typeof value.body !== 'string' ||
    Buffer.byteLength(value.body, 'utf8') === 0 ||
    Buffer.byteLength(value.body, 'utf8') > MAX_REVIEW_RESPONSE_BYTES ||
    value.byteLength !== Buffer.byteLength(value.body, 'utf8') ||
    typeof value.sha256 !== 'string' ||
    !SHA256_PATTERN.test(value.sha256) ||
    sha256(value.body) !== value.sha256
  ) {
    return undefined;
  }
  return cloneFrozen({
    contractVersion: 1,
    contractIdentity: value.contractIdentity,
    source: 'settled-final-assistant-text',
    body: value.body,
    byteLength: value.byteLength,
    sha256: value.sha256,
  } satisfies NormalizedReviewResponseResult);
}

function normalizeUserPullEvidenceCorrelation(value: Record<string, unknown>): UserPullEvidenceCorrelation {
  if (
    typeof value.preparationIdentity !== 'string' ||
    !PREPARATION_PATTERN.test(value.preparationIdentity) ||
    typeof value.occurrenceIdentity !== 'string' ||
    !ARM_OCCURRENCE_PATTERN.test(value.occurrenceIdentity) ||
    !boundedText(value.sessionId) ||
    !unicodeScalarText(value.sessionId) ||
    !boundedText(value.promptId) ||
    !unicodeScalarText(value.promptId) ||
    !boundedText(value.canonicalGitRoot, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitRoot) ||
    !boundedText(value.canonicalGitDir, MAX_CANONICAL_PATH_BYTES) ||
    !unicodeScalarText(value.canonicalGitDir) ||
    value.bridgeProtocolVersion !== 1
  ) {
    throw new TypeError('Invalid User Pull evidence correlation');
  }
  return {
    preparationIdentity: value.preparationIdentity as UserPullPreparationIdentity,
    occurrenceIdentity: value.occurrenceIdentity as UserPullEvidenceCorrelation['occurrenceIdentity'],
    sessionId: value.sessionId,
    promptId: value.promptId,
    canonicalGitRoot: value.canonicalGitRoot,
    canonicalGitDir: value.canonicalGitDir,
    bridgeProtocolVersion: 1,
  };
}

function isUserPullUnresolvedReason(value: unknown): value is UserPullInvocationUnresolvedReason {
  return (
    value === 'start-observation-window-expired' ||
    value === 'start-evidence-lost' ||
    value === 'session-ended-without-terminal' ||
    value === 'host-disconnected' ||
    value === 'attachment-identity-changed' ||
    value === 'background-activity-remains' ||
    value === 'background-activity-unverified' ||
    value === 'stop-continuation-active'
  );
}

function validUserPullLossDetail(value: Record<string, unknown>): boolean {
  const noBackgroundDetail =
    value.backgroundTaskCount === undefined &&
    value.sessionCronCount === undefined &&
    value.stopHookActive === undefined;
  const noFailureDetail = value.errorType === undefined && value.failureType === undefined;
  const noObservedCheckout =
    value.observedCanonicalGitRoot === undefined && value.observedCanonicalGitDir === undefined;
  if (value.reason === 'start-observation-window-expired') {
    return (
      value.trigger === 'start-observation-window' &&
      noBackgroundDetail &&
      noFailureDetail &&
      noObservedCheckout &&
      value.sessionReason === undefined
    );
  }
  if (value.reason === 'start-evidence-lost') {
    if (value.sessionReason !== undefined || !noObservedCheckout) return false;
    if (value.trigger === 'normal-stop-before-start') {
      return (
        noFailureDetail &&
        typeof value.stopHookActive === 'boolean' &&
        (value.backgroundTaskCount === undefined || safeVersion(value.backgroundTaskCount)) &&
        (value.sessionCronCount === undefined || safeVersion(value.sessionCronCount))
      );
    }
    return (
      value.trigger === 'stop-failure-before-start' &&
      noBackgroundDetail &&
      (value.errorType === undefined || boundedLabel(value.errorType)) &&
      (value.failureType === undefined || boundedLabel(value.failureType))
    );
  }
  if (value.reason === 'session-ended-without-terminal') {
    return (
      value.trigger === 'session-end' &&
      noBackgroundDetail &&
      noFailureDetail &&
      noObservedCheckout &&
      (value.sessionReason === undefined || boundedLabel(value.sessionReason))
    );
  }
  if (value.reason === 'host-disconnected' || value.reason === 'attachment-identity-changed') {
    const observedCheckout =
      boundedText(value.observedCanonicalGitRoot, MAX_CANONICAL_PATH_BYTES) &&
      unicodeScalarText(value.observedCanonicalGitRoot) &&
      boundedText(value.observedCanonicalGitDir, MAX_CANONICAL_PATH_BYTES) &&
      unicodeScalarText(value.observedCanonicalGitDir);
    return (
      value.trigger === 'reconciliation' &&
      noBackgroundDetail &&
      noFailureDetail &&
      value.sessionReason === undefined &&
      (noObservedCheckout || (value.reason === 'attachment-identity-changed' && observedCheckout))
    );
  }
  if (value.trigger !== 'normal-stop' || value.sessionReason !== undefined || !noFailureDetail || !noObservedCheckout) {
    return false;
  }
  if (value.reason === 'stop-continuation-active') {
    return (
      value.stopHookActive === true &&
      (value.backgroundTaskCount === undefined || safeVersion(value.backgroundTaskCount)) &&
      (value.sessionCronCount === undefined || safeVersion(value.sessionCronCount))
    );
  }
  if (value.stopHookActive !== false) return false;
  if (value.reason === 'background-activity-remains') {
    return (
      safeVersion(value.backgroundTaskCount) &&
      safeVersion(value.sessionCronCount) &&
      (value.backgroundTaskCount > 0 || value.sessionCronCount > 0)
    );
  }
  return (
    value.reason === 'background-activity-unverified' &&
    (value.backgroundTaskCount === undefined || safeVersion(value.backgroundTaskCount)) &&
    (value.sessionCronCount === undefined || safeVersion(value.sessionCronCount)) &&
    (value.backgroundTaskCount === undefined || value.sessionCronCount === undefined)
  );
}

export function normalizeEvidence(value: unknown): NormalizedHarnessEvidence {
  if (
    !isRecord(value) ||
    typeof value.kind !== 'string' ||
    !boundedEvidenceIdentity(value.evidenceIdentity) ||
    typeof value.attachmentIdentity !== 'string' ||
    !ATTACHMENT_PATTERN.test(value.attachmentIdentity)
  ) {
    throw new TypeError('Invalid normalized Harness evidence');
  }
  if (
    value.kind === 'harness.availability.observed' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'attachmentIdentity', 'availability'])
  ) {
    return cloneFrozen({
      kind: value.kind,
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      availability: normalizeAvailability(value.availability),
    });
  }
  if (
    value.kind === 'harness.invocation.start-observed' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'attachmentIdentity', 'invocationIdentity']) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return cloneFrozen({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.invocation.rejected' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'attachmentIdentity', 'invocationIdentity', 'reason']) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    (value.reason === 'harness-rejected' ||
      value.reason === 'host-unavailable' ||
      value.reason === 'capability-withdrawn')
  ) {
    return cloneFrozen({
      kind: 'harness.invocation.rejected',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      reason: value.reason,
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.invocation.correlation-lost' &&
    hasOnlyKeys(value, ['kind', 'evidenceIdentity', 'attachmentIdentity', 'invocationIdentity', 'reason']) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    (value.reason === 'attachment-lost' ||
      value.reason === 'correlation-lost' ||
      value.reason === 'terminal-evidence-lost')
  ) {
    return cloneFrozen({
      kind: 'harness.invocation.correlation-lost',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      reason: value.reason,
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.user-pull.start-observed' &&
    hasOnlyKeys(value, [
      'kind',
      'evidenceIdentity',
      'attachmentIdentity',
      'invocationIdentity',
      'preparationIdentity',
      'occurrenceIdentity',
      'sessionId',
      'promptId',
      'canonicalGitRoot',
      'canonicalGitDir',
      'bridgeProtocolVersion',
    ]) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.start-observed',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      ...normalizeUserPullEvidenceCorrelation(value),
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.user-pull.terminal-observed' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'evidenceIdentity',
        'attachmentIdentity',
        'invocationIdentity',
        'preparationIdentity',
        'occurrenceIdentity',
        'sessionId',
        'promptId',
        'canonicalGitRoot',
        'canonicalGitDir',
        'bridgeProtocolVersion',
        'terminalEvent',
        'outcome',
      ],
      ['backgroundTaskCount', 'sessionCronCount', 'stopHookActive', 'errorType', 'failureType'],
    ) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    ((value.terminalEvent === 'normal-stop' &&
      value.outcome === 'ended-normally' &&
      value.backgroundTaskCount === 0 &&
      value.sessionCronCount === 0 &&
      value.stopHookActive === false &&
      value.errorType === undefined &&
      value.failureType === undefined) ||
      (value.terminalEvent === 'stop-failure' &&
        value.outcome === 'failed' &&
        value.backgroundTaskCount === undefined &&
        value.sessionCronCount === undefined &&
        value.stopHookActive === undefined &&
        (value.errorType === undefined || boundedLabel(value.errorType)) &&
        (value.failureType === undefined || boundedLabel(value.failureType))))
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.terminal-observed',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      ...normalizeUserPullEvidenceCorrelation(value),
      terminalEvent: value.terminalEvent,
      outcome: value.outcome,
      ...(value.backgroundTaskCount === undefined ? {} : { backgroundTaskCount: value.backgroundTaskCount }),
      ...(value.sessionCronCount === undefined ? {} : { sessionCronCount: value.sessionCronCount }),
      ...(value.stopHookActive === undefined ? {} : { stopHookActive: value.stopHookActive }),
      ...(value.errorType === undefined ? {} : { errorType: value.errorType }),
      ...(value.failureType === undefined ? {} : { failureType: value.failureType }),
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.user-pull.correlation-lost' &&
    hasOnlyKeys(
      value,
      [
        'kind',
        'evidenceIdentity',
        'attachmentIdentity',
        'invocationIdentity',
        'preparationIdentity',
        'occurrenceIdentity',
        'sessionId',
        'promptId',
        'canonicalGitRoot',
        'canonicalGitDir',
        'bridgeProtocolVersion',
        'reason',
        'trigger',
      ],
      [
        'backgroundTaskCount',
        'sessionCronCount',
        'stopHookActive',
        'errorType',
        'failureType',
        'sessionReason',
        'observedCanonicalGitRoot',
        'observedCanonicalGitDir',
      ],
    ) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    isUserPullUnresolvedReason(value.reason) &&
    validUserPullLossDetail(value)
  ) {
    return cloneFrozen({
      kind: 'harness.user-pull.correlation-lost',
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
      ...normalizeUserPullEvidenceCorrelation(value),
      reason: value.reason,
      trigger: value.trigger as Extract<
        NormalizedHarnessEvidence,
        { readonly kind: 'harness.user-pull.correlation-lost' }
      >['trigger'],
      ...(value.backgroundTaskCount === undefined ? {} : { backgroundTaskCount: value.backgroundTaskCount as number }),
      ...(value.sessionCronCount === undefined ? {} : { sessionCronCount: value.sessionCronCount as number }),
      ...(value.stopHookActive === undefined ? {} : { stopHookActive: value.stopHookActive as boolean }),
      ...(value.errorType === undefined ? {} : { errorType: value.errorType as string }),
      ...(value.failureType === undefined ? {} : { failureType: value.failureType as string }),
      ...(value.sessionReason === undefined ? {} : { sessionReason: value.sessionReason as string }),
      ...(value.observedCanonicalGitRoot === undefined
        ? {}
        : { observedCanonicalGitRoot: value.observedCanonicalGitRoot as string }),
      ...(value.observedCanonicalGitDir === undefined
        ? {}
        : { observedCanonicalGitDir: value.observedCanonicalGitDir as string }),
    } satisfies NormalizedHarnessEvidence);
  }
  if (
    value.kind === 'harness.invocation.terminal-observed' &&
    hasOnlyKeys(
      value,
      ['kind', 'evidenceIdentity', 'attachmentIdentity', 'invocationIdentity', 'outcome'],
      ['reason', 'result'],
    ) &&
    typeof value.invocationIdentity === 'string' &&
    INVOCATION_PATTERN.test(value.invocationIdentity) &&
    (value.outcome === 'ended-normally' || value.outcome === 'failed' || value.outcome === 'interrupted')
  ) {
    const base = {
      kind: 'harness.invocation.terminal-observed' as const,
      evidenceIdentity: value.evidenceIdentity,
      attachmentIdentity: value.attachmentIdentity as HarnessAttachmentIdentity,
      invocationIdentity: value.invocationIdentity as HarnessInvocationIdentity,
    };
    if (value.outcome === 'ended-normally' && value.reason === undefined) {
      const result = normalizeResponseResult(value.result);
      return cloneFrozen({
        ...base,
        outcome: 'ended-normally',
        ...(result === undefined ? {} : { result }),
      } satisfies NormalizedHarnessEvidence);
    }
    if (
      value.outcome === 'failed' &&
      (value.reason === 'harness-failed' || value.reason === 'effect-constraint-failed') &&
      value.result === undefined
    ) {
      return cloneFrozen({
        ...base,
        outcome: 'failed',
        reason: value.reason,
      } satisfies NormalizedHarnessEvidence);
    }
    if (value.outcome === 'interrupted' && value.reason === 'interruption-observed' && value.result === undefined) {
      return cloneFrozen({
        ...base,
        outcome: 'interrupted',
        reason: 'interruption-observed',
      } satisfies NormalizedHarnessEvidence);
    }
  }
  throw new TypeError('Invalid normalized Harness evidence');
}
