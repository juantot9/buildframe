import { decodeBytesBase64 } from '../bytesBase64.js';
import {
  normalizeContextSourceSelections,
  type ContextSourceByteScope,
  type ContextSourceCandidate,
  type ContextSourceClassification,
  type ContextSourceSelection,
} from '../contextEvidence.js';
import { hasOnlyKeys, isRecord, memberOf, safeVersion } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type {
  ReviewArtifactContextReference,
  ReviewContextContributionInput,
  ReviewContextContributionScope,
  ReviewContextExclusionTarget,
  ReviewContextRule,
  ReviewContextRuleDecision,
  ReviewContextSelectionChange,
  ReviewContextSource,
  ReviewEditorBufferProvenance,
  ReviewEditorContextContentInput,
  ReviewEditorContextSource,
} from './contracts.js';
import type {
  ReviewContextContributionIdentity,
  ReviewContextRuleIdentity,
  ReviewResponseIdentity,
  ReviewSnapshotContextItemIdentity,
  ReviewSnapshotIdentity,
} from './identities.js';
import { ReviewingStateProblem } from './internalTypes.js';
import {
  FILE_ID_PATTERN,
  MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES,
  MAX_REVIEW_CONTEXT_SCOPE_BYTES,
  QUESTION_MAX_BYTES,
} from './limits.js';
import { boundedIdentity, decodeReviewingBytesBase64, recordIdentity } from './utils.js';

export function questionBody(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    Buffer.byteLength(value) <= QUESTION_MAX_BYTES &&
    !value.includes('\u0000')
  );
}

export function evidenceSelectionForSource(source: ReviewContextSource): ContextSourceSelection {
  if (source.kind === 'outside-checkout') {
    return { kind: 'outside-checkout', form: source.form, absolutePath: source.absolutePath };
  }
  if (source.inclusion === 'ignored-explicit') {
    return { kind: 'workspace-ignored', pathBytesBase64: source.pathBytesBase64 };
  }
  return {
    kind: source.form === 'file' ? 'workspace-file' : 'workspace-directory',
    pathBytesBase64: source.pathBytesBase64,
  };
}

export function reviewContextEvidenceSelection(
  rule: Extract<ReviewContextRule, { readonly action: 'include' }>,
): ContextSourceSelection & { readonly classification?: ContextSourceClassification } {
  const selection = evidenceSelectionForSource(rule.source);
  return rule.classification === undefined ? selection : { ...selection, classification: rule.classification };
}

export function normalizeReviewContextSource(value: unknown): ReviewContextSource {
  if (!isRecord(value)) throw new TypeError('Invalid Review context source');
  if (value.kind === 'workspace') {
    if (
      !hasOnlyKeys(value, ['kind', 'form', 'inclusion', 'pathBytesBase64']) ||
      !memberOf(value.form, ['file', 'directory'] as const) ||
      !memberOf(value.inclusion, ['ordinary', 'ignored-explicit'] as const) ||
      typeof value.pathBytesBase64 !== 'string'
    ) {
      throw new TypeError('Invalid Review workspace context source');
    }
    const source: ReviewContextSource = {
      kind: 'workspace',
      form: value.form,
      inclusion: value.inclusion,
      pathBytesBase64: value.pathBytesBase64,
    };
    normalizeContextSourceSelections([evidenceSelectionForSource(source)]);
    return source;
  }
  if (
    value.kind !== 'outside-checkout' ||
    !hasOnlyKeys(value, ['kind', 'form', 'absolutePath']) ||
    !memberOf(value.form, ['file', 'directory'] as const) ||
    typeof value.absolutePath !== 'string'
  ) {
    throw new TypeError('Invalid Review outside-checkout context source');
  }
  const source: ReviewContextSource = {
    kind: 'outside-checkout',
    form: value.form,
    absolutePath: value.absolutePath,
  };
  normalizeContextSourceSelections([evidenceSelectionForSource(source)]);
  return source;
}

export function normalizeReviewContextExclusionTarget(value: unknown): ReviewContextExclusionTarget {
  if (!isRecord(value)) throw new TypeError('Invalid Review context exclusion target');
  if (value.kind === 'workspace') {
    if (
      !hasOnlyKeys(value, ['kind', 'form', 'pathBytesBase64']) ||
      !memberOf(value.form, ['file', 'directory'] as const) ||
      typeof value.pathBytesBase64 !== 'string'
    ) {
      throw new TypeError('Invalid Review workspace context exclusion target');
    }
    const target: ReviewContextExclusionTarget = {
      kind: 'workspace',
      form: value.form,
      pathBytesBase64: value.pathBytesBase64,
    };
    normalizeContextSourceSelections([
      {
        kind: target.form === 'file' ? 'workspace-file' : 'workspace-directory',
        pathBytesBase64: target.pathBytesBase64,
      },
    ]);
    return target;
  }
  if (
    value.kind !== 'outside-checkout' ||
    !hasOnlyKeys(value, ['kind', 'form', 'absolutePath']) ||
    !memberOf(value.form, ['file', 'directory'] as const) ||
    typeof value.absolutePath !== 'string'
  ) {
    throw new TypeError('Invalid Review outside-checkout context exclusion target');
  }
  const target: ReviewContextExclusionTarget = {
    kind: 'outside-checkout',
    form: value.form,
    absolutePath: value.absolutePath,
  };
  normalizeContextSourceSelections([
    { kind: 'outside-checkout', form: target.form, absolutePath: target.absolutePath },
  ]);
  return target;
}

export function normalizeReviewContextScope(value: unknown): ContextSourceByteScope {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'offset', 'length']) ||
    value.kind !== 'bytes' ||
    !safeVersion(value.offset) ||
    !safeVersion(value.length, false) ||
    value.length > MAX_REVIEW_CONTEXT_SCOPE_BYTES ||
    !Number.isSafeInteger(value.offset + value.length)
  ) {
    throw new TypeError('Invalid bounded Review context byte scope');
  }
  return { kind: 'bytes', offset: value.offset, length: value.length };
}

export function normalizeReviewContextContributionScope(value: unknown): ReviewContextContributionScope {
  if (isRecord(value) && hasOnlyKeys(value, ['kind']) && value.kind === 'whole') {
    return { kind: 'whole' };
  }
  return normalizeReviewContextScope(value);
}

export function normalizeReviewEditorContextSource(value: unknown): ReviewEditorContextSource {
  if (!isRecord(value)) throw new TypeError('Invalid Editor context source');
  if (value.kind === 'editor-buffer') {
    if (!hasOnlyKeys(value, ['kind', 'sourceIdentity']) || !boundedIdentity(value.sourceIdentity)) {
      throw new TypeError('Invalid Editor buffer source identity');
    }
    return { kind: 'editor-buffer', sourceIdentity: value.sourceIdentity };
  }
  const source = normalizeReviewContextSource(value);
  if (source.form !== 'file') throw new TypeError('Editor context sources name one file or buffer');
  return source.kind === 'workspace'
    ? {
        kind: 'workspace',
        form: 'file',
        inclusion: source.inclusion,
        pathBytesBase64: source.pathBytesBase64,
      }
    : { kind: 'outside-checkout', form: 'file', absolutePath: source.absolutePath };
}

export function normalizeReviewEditorBufferProvenance(value: unknown): ReviewEditorBufferProvenance {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['editorInstanceIdentity', 'bufferIdentity', 'bufferVersion', 'savedState']) ||
    !boundedIdentity(value.editorInstanceIdentity) ||
    !boundedIdentity(value.bufferIdentity) ||
    !safeVersion(value.bufferVersion) ||
    !memberOf(value.savedState, ['saved', 'unsaved'] as const)
  ) {
    throw new TypeError('Invalid Editor buffer provenance');
  }
  return {
    editorInstanceIdentity: value.editorInstanceIdentity,
    bufferIdentity: value.bufferIdentity,
    bufferVersion: value.bufferVersion,
    savedState: value.savedState,
  };
}

export function normalizeReviewEditorContextContent(value: unknown): ReviewEditorContextContentInput {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new TypeError('Invalid Editor context content');
  }
  if (value.status === 'available') {
    if (
      !hasOnlyKeys(value, ['status', 'bytesBase64', 'byteLength', 'sha256']) ||
      typeof value.bytesBase64 !== 'string' ||
      Buffer.byteLength(value.bytesBase64) > Math.ceil((MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES * 4) / 3) + 4 ||
      !safeVersion(value.byteLength) ||
      value.byteLength > MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES ||
      typeof value.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/u.test(value.sha256)
    ) {
      throw new TypeError('Invalid bounded Editor context bytes');
    }
    let bytes: Buffer;
    try {
      bytes = decodeBytesBase64(value.bytesBase64);
    } catch {
      throw new TypeError('Editor context bytes use canonical Base64');
    }
    if (bytes.byteLength !== value.byteLength || sha256(bytes) !== value.sha256) {
      throw new TypeError('Editor context bytes do not match their declared evidence');
    }
    return {
      status: 'available',
      bytesBase64: value.bytesBase64,
      byteLength: value.byteLength,
      sha256: value.sha256,
    };
  }
  if (
    value.status !== 'unavailable' ||
    !hasOnlyKeys(value, ['status', 'reason'], ['observedByteLength']) ||
    !memberOf(value.reason, [
      'editor-read-failed',
      'native-representation-unavailable',
      'contribution-limit',
    ] as const) ||
    (value.observedByteLength !== undefined && !safeVersion(value.observedByteLength)) ||
    (value.reason === 'contribution-limit' &&
      (value.observedByteLength === undefined || value.observedByteLength <= MAX_REVIEW_CONTEXT_CONTRIBUTION_BYTES))
  ) {
    throw new TypeError('Invalid unavailable Editor context evidence');
  }
  return {
    status: 'unavailable',
    reason: value.reason,
    ...(value.observedByteLength === undefined ? {} : { observedByteLength: value.observedByteLength }),
  };
}

export function normalizeReviewArtifactContextReference(value: unknown): ReviewArtifactContextReference {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Invalid Review Artifact context reference');
  }
  if (!memberOf(value.kind, ['review-response', 'review-snapshot-file-side'] as const)) {
    throw new TypeError('Unsupported Review Artifact context contribution');
  }
  if (value.kind === 'review-response') {
    if (!hasOnlyKeys(value, ['kind', 'responseIdentity']) || !recordIdentity(value.responseIdentity, 'rrp')) {
      throw new TypeError('Invalid Review Response context reference');
    }
    return { kind: 'review-response', responseIdentity: value.responseIdentity as ReviewResponseIdentity };
  }
  if (
    value.kind !== 'review-snapshot-file-side' ||
    !hasOnlyKeys(value, ['kind', 'reviewSnapshotIdentity', 'fileIdentity', 'side']) ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    !memberOf(value.side, ['old', 'new'] as const)
  ) {
    throw new TypeError('Invalid Review Snapshot context reference');
  }
  return {
    kind: 'review-snapshot-file-side',
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
    fileIdentity: value.fileIdentity,
    side: value.side,
  };
}

export function normalizeReviewContextContributionInput(value: unknown): ReviewContextContributionInput {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new TypeError('Invalid Review context contribution');
  }
  if (value.kind === 'editor') {
    if (
      !hasOnlyKeys(value, ['kind', 'source', 'scope', 'editor', 'content'], ['classification']) ||
      (value.classification !== undefined && !memberOf(value.classification, ['generated', 'binary'] as const))
    ) {
      throw new TypeError('Invalid Editor context contribution');
    }
    const scope = normalizeReviewContextContributionScope(value.scope);
    const content = normalizeReviewEditorContextContent(value.content);
    if (scope.kind === 'bytes' && content.status === 'available' && scope.length !== content.byteLength) {
      throw new TypeError('Editor range bytes match the exact declared range');
    }
    return {
      kind: 'editor',
      source: normalizeReviewEditorContextSource(value.source),
      scope,
      editor: normalizeReviewEditorBufferProvenance(value.editor),
      content,
      ...(value.classification === undefined ? {} : { classification: value.classification }),
    };
  }
  if (value.kind !== 'artifact' || !hasOnlyKeys(value, ['kind', 'artifact', 'scope'])) {
    throw new TypeError('Unsupported Review Artifact context contribution');
  }
  return {
    kind: 'artifact',
    artifact: normalizeReviewArtifactContextReference(value.artifact),
    scope: normalizeReviewContextContributionScope(value.scope),
  };
}

export function normalizeReviewContextSelectionChange(value: unknown): ReviewContextSelectionChange {
  if (!isRecord(value) || typeof value.action !== 'string') {
    throw new TypeError('Invalid Review context selection change');
  }
  if (value.action === 'include') {
    if (
      !hasOnlyKeys(value, ['action', 'source'], ['scope', 'classification']) ||
      (value.classification !== undefined && !memberOf(value.classification, ['generated', 'binary'] as const))
    ) {
      throw new TypeError('Invalid Review context include change');
    }
    return {
      action: 'include',
      source: normalizeReviewContextSource(value.source),
      ...(value.scope === undefined ? {} : { scope: normalizeReviewContextScope(value.scope) }),
      ...(value.classification === undefined ? {} : { classification: value.classification }),
    };
  }
  if (value.action === 'exclude') {
    if (!hasOnlyKeys(value, ['action', 'target'])) {
      throw new TypeError('Invalid Review context exclude change');
    }
    return { action: 'exclude', target: normalizeReviewContextExclusionTarget(value.target) };
  }
  if (value.action === 'pin') {
    if (
      !hasOnlyKeys(value, ['action', 'target', 'reviewSnapshotIdentity', 'itemIdentity']) ||
      !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
      !recordIdentity(value.itemIdentity, 'rsi')
    ) {
      throw new TypeError('Invalid Review context pin change');
    }
    const target = normalizeReviewContextSource(value.target);
    // Pinning freezes one exact file occurrence; directory following is never pinned.
    if (target.form !== 'file') throw new TypeError('Review context pin target must be a file');
    return {
      action: 'pin',
      target,
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      itemIdentity: value.itemIdentity as ReviewSnapshotContextItemIdentity,
    };
  }
  if (
    value.action !== 'remove' ||
    !hasOnlyKeys(value, ['action', 'ruleIdentity']) ||
    !recordIdentity(value.ruleIdentity, 'rcr')
  ) {
    throw new TypeError('Invalid Review context rule removal');
  }
  return { action: 'remove', ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity };
}

export function reviewContextLocationKey(location: ReviewContextSource | ReviewContextExclusionTarget): string {
  return location.kind === 'workspace'
    ? `workspace\u0000${location.form}\u0000${location.pathBytesBase64}`
    : `outside-checkout\u0000${location.form}\u0000${location.absolutePath}`;
}

export function sameReviewContextScope(
  left: ContextSourceByteScope | undefined,
  right: ContextSourceByteScope | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined && left.offset === right.offset && left.length === right.length;
}

export function applyReviewContextRule(
  rules: readonly ReviewContextRule[],
  rule: ReviewContextRule,
): readonly ReviewContextRule[] {
  if (rule.action === 'contribute') return [...rules, rule];
  const targetKey = reviewContextLocationKey(rule.action === 'include' ? rule.source : rule.target);
  return [
    ...rules.filter(existing => {
      if (existing.action === 'contribute') return true;
      const existingKey = reviewContextLocationKey(existing.action === 'include' ? existing.source : existing.target);
      if (existingKey !== targetKey) return true;
      // Pinning replaces every same-location rule, and any same-location rule replaces a pin.
      if (rule.action === 'pin' || existing.action === 'pin') return false;
      if (rule.action === 'exclude' || existing.action === 'exclude') return false;
      return !sameReviewContextScope(existing.scope, rule.scope);
    }),
    rule,
  ];
}

export function parseReviewContextRule(value: unknown): ReviewContextRule {
  if (!isRecord(value) || !recordIdentity(value.ruleIdentity, 'rcr')) {
    throw new ReviewingStateProblem();
  }
  try {
    if (value.action === 'include') {
      if (!hasOnlyKeys(value, ['ruleIdentity', 'action', 'source'], ['scope', 'classification'])) {
        throw new ReviewingStateProblem();
      }
      const change = normalizeReviewContextSelectionChange({
        action: 'include',
        source: value.source,
        ...(value.scope === undefined ? {} : { scope: value.scope }),
        ...(value.classification === undefined ? {} : { classification: value.classification }),
      });
      if (change.action !== 'include') throw new ReviewingStateProblem();
      return { ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity, ...change };
    }
    if (value.action === 'exclude') {
      if (!hasOnlyKeys(value, ['ruleIdentity', 'action', 'target'])) throw new ReviewingStateProblem();
      return {
        ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity,
        action: 'exclude',
        target: normalizeReviewContextExclusionTarget(value.target),
      };
    }
    if (value.action === 'pin') {
      if (
        !hasOnlyKeys(value, ['ruleIdentity', 'action', 'target', 'reviewSnapshotIdentity', 'itemIdentity']) ||
        !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
        !recordIdentity(value.itemIdentity, 'rsi')
      ) {
        throw new ReviewingStateProblem();
      }
      const change = normalizeReviewContextSelectionChange({
        action: 'pin',
        target: value.target,
        reviewSnapshotIdentity: value.reviewSnapshotIdentity,
        itemIdentity: value.itemIdentity,
      });
      if (change.action !== 'pin') throw new ReviewingStateProblem();
      return { ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity, ...change };
    }
    if (
      value.action === 'contribute' &&
      hasOnlyKeys(value, ['ruleIdentity', 'action', 'contributionIdentity']) &&
      recordIdentity(value.contributionIdentity, 'rcc')
    ) {
      return {
        ruleIdentity: value.ruleIdentity as ReviewContextRuleIdentity,
        action: 'contribute',
        contributionIdentity: value.contributionIdentity as ReviewContextContributionIdentity,
      };
    }
  } catch (error) {
    if (error instanceof ReviewingStateProblem) throw error;
    throw new ReviewingStateProblem();
  }
  throw new ReviewingStateProblem();
}

export interface ReviewContextRuleRank {
  readonly rule: ReviewContextRule;
  readonly ordinal: number;
  readonly prefixBytes: number;
  readonly exactFile: boolean;
}

export function contextPathUnder(candidate: Buffer, target: Buffer): boolean {
  if (candidate.equals(target)) return true;
  if (target.byteLength === 0) return candidate.byteLength > 0;
  if (candidate.byteLength <= target.byteLength || !candidate.subarray(0, target.byteLength).equals(target)) {
    return false;
  }
  return target[target.byteLength - 1] === 0x2f || candidate[target.byteLength] === 0x2f;
}

export function reviewContextRuleRank(
  rule: ReviewContextRule,
  ordinal: number,
  candidate: ContextSourceCandidate,
): ReviewContextRuleRank | undefined {
  if (rule.action === 'contribute') return undefined;
  const location = rule.action === 'include' ? rule.source : rule.target;
  if (location.kind === 'workspace') {
    if (candidate.pathBytesBase64 === undefined) return undefined;
    const target = decodeReviewingBytesBase64(location.pathBytesBase64);
    const selected = decodeReviewingBytesBase64(candidate.pathBytesBase64);
    const matches = location.form === 'file' ? selected.equals(target) : contextPathUnder(selected, target);
    return matches ? { rule, ordinal, prefixBytes: target.byteLength, exactFile: location.form === 'file' } : undefined;
  }
  if (candidate.absolutePath === undefined) return undefined;
  const target = Buffer.from(location.absolutePath, 'utf8');
  const selected = Buffer.from(candidate.absolutePath, 'utf8');
  const matches = location.form === 'file' ? selected.equals(target) : contextPathUnder(selected, target);
  return matches ? { rule, ordinal, prefixBytes: target.byteLength, exactFile: location.form === 'file' } : undefined;
}

export function compareReviewContextRuleRank(left: ReviewContextRuleRank, right: ReviewContextRuleRank): number {
  return (
    left.prefixBytes - right.prefixBytes ||
    Number(left.exactFile) - Number(right.exactFile) ||
    left.ordinal - right.ordinal
  );
}

export function decideReviewContextCandidate(
  rules: readonly ReviewContextRule[],
  includeRules: readonly Extract<ReviewContextRule, { readonly action: 'include' }>[],
  candidate: ContextSourceCandidate,
): ReviewContextRuleDecision {
  const admitting = candidate.origins.map(origin => includeRules[origin]).filter(rule => rule !== undefined);
  if (admitting.length !== candidate.origins.length || admitting.length === 0) {
    throw new ReviewingStateProblem();
  }
  const inclusionRuleIdentities = admitting.map(rule => rule.ruleIdentity);
  const ranks = rules
    .map((rule, ordinal) => reviewContextRuleRank(rule, ordinal, candidate))
    .filter((rank): rank is ReviewContextRuleRank => rank !== undefined)
    .sort(compareReviewContextRuleRank);
  const deciding = ranks.at(-1);
  if (deciding === undefined) throw new ReviewingStateProblem();
  return {
    status: deciding.rule.action === 'include' ? 'included' : 'excluded',
    decidingRuleIdentity: deciding.rule.ruleIdentity,
    inclusionRuleIdentities,
  };
}
