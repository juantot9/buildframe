import { hasOnlyKeys, isRecord, memberOf, safeVersion } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import {
  normalizeReviewComparisonDynamicInputs,
  normalizeReviewComparisonSelection,
  type CurrentChangeSide,
  type CurrentChangedFile,
  type CurrentChangesComparedState,
  type CurrentChangesComparisonBasis,
  type CurrentChangesManifestSummary,
  type EvidenceContentIdentity,
  type EvidencePath,
  type EvidenceScopeMembership,
  type GitObjectIdentity,
  type ReviewComparedState,
  type ReviewComparisonBasis,
  type ReviewComparisonCommitEndpoint,
  type ReviewComparisonDynamicInput,
  type ReviewComparisonIndexEndpoint,
  type ReviewComparisonRevisionEndpoint,
  type ReviewComparisonSelection,
  type ReviewComparisonTreeEndpoint,
  type ReviewComparisonWorkingStateEndpoint,
  type ReviewComparisonWorkingTreeEndpoint,
} from '../workspaceEvidence/index.js';
import type { ReviewQuestionAnchor, ReviewQuestionWholeFileAnchor } from './contracts.js';
import type { ReviewSnapshotIdentity } from './identities.js';
import { ReviewingStateProblem } from './internalTypes.js';
import { ANCHOR_LINE_MAX_BYTES, DIFF_ROW_ID_PATTERN, FILE_ID_PATTERN } from './limits.js';
import { decodeReviewingBytesBase64, recordIdentity } from './utils.js';

export function parseEvidenceContentIdentity(value: unknown): EvidenceContentIdentity {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['algorithm', 'value']) ||
    value.algorithm !== 'sha256' ||
    typeof value.value !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.value)
  ) {
    throw new ReviewingStateProblem();
  }
  return { algorithm: 'sha256', value: value.value };
}

export function parseGitObjectIdentity(value: unknown): GitObjectIdentity {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['algorithm', 'value']) ||
    !memberOf(value.algorithm, ['sha1', 'sha256', 'unknown'] as const) ||
    typeof value.value !== 'string' ||
    !/^[0-9a-f]{40,64}$/u.test(value.value)
  ) {
    throw new ReviewingStateProblem();
  }
  return { algorithm: value.algorithm, value: value.value };
}

export function parseEvidencePath(value: unknown): EvidencePath {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['bytesBase64', 'display']) ||
    typeof value.bytesBase64 !== 'string' ||
    typeof value.display !== 'string'
  ) {
    throw new ReviewingStateProblem();
  }
  if (decodeReviewingBytesBase64(value.bytesBase64).byteLength === 0) {
    throw new ReviewingStateProblem();
  }
  return { bytesBase64: value.bytesBase64, display: value.display };
}

export function parseCurrentChangeSide(value: unknown): CurrentChangeSide {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['path', 'kind', 'gitMode', 'byteLength', 'evidenceSource', 'classification', 'contentAvailability'],
      [
        'objectIdentity',
        'contentIdentity',
        'contentLimitation',
        'objectAvailability',
        'symlinkTarget',
        'specialEntry',
        'sparseAbsence',
        'gitlink',
        'largeFilePointer',
        'generated',
        'workingEvidenceLimitation',
      ],
    ) ||
    !memberOf(value.kind, ['regular', 'symlink', 'gitlink', 'special', 'unknown'] as const) ||
    typeof value.gitMode !== 'string' ||
    !/^[0-7]{6}$/u.test(value.gitMode) ||
    !(value.byteLength === null || safeVersion(value.byteLength)) ||
    !memberOf(value.evidenceSource, ['head', 'working-tree', 'commit', 'tree', 'index'] as const) ||
    !memberOf(value.classification, ['text', 'binary', 'unrenderable', 'unknown'] as const) ||
    !memberOf(value.contentAvailability, ['captured', 'not-captured', 'unavailable'] as const) ||
    (value.contentLimitation !== undefined &&
      !memberOf(value.contentLimitation, [
        'aggregate-capture-limit',
        'file-capture-limit',
        'aggregate-verification-limit',
        'file-verification-limit',
        'missing-object',
        'unsupported-file-kind',
        'unsupported-content-filter',
        'large-file-payload-unavailable',
        'unmerged-index',
        'read-failed',
      ] as const))
  ) {
    throw new ReviewingStateProblem();
  }
  const path = parseEvidencePath(value.path);
  const objectIdentity = value.objectIdentity === undefined ? undefined : parseGitObjectIdentity(value.objectIdentity);
  const contentIdentity =
    value.contentIdentity === undefined ? undefined : parseEvidenceContentIdentity(value.contentIdentity);
  if (value.contentAvailability === 'captured' && (contentIdentity === undefined || value.byteLength === null)) {
    throw new ReviewingStateProblem();
  }
  const objectAvailability =
    value.objectAvailability === undefined
      ? undefined
      : value.objectAvailability === 'missing'
        ? ('missing' as const)
        : undefined;
  if (
    (value.objectAvailability !== undefined && objectAvailability === undefined) ||
    (objectAvailability === 'missing' &&
      (objectIdentity === undefined ||
        value.contentAvailability !== 'unavailable' ||
        value.contentLimitation !== 'missing-object'))
  ) {
    throw new ReviewingStateProblem();
  }

  let symlinkTarget: CurrentChangeSide['symlinkTarget'];
  if (value.symlinkTarget !== undefined) {
    if (
      value.kind !== 'symlink' ||
      !isRecord(value.symlinkTarget) ||
      !hasOnlyKeys(value.symlinkTarget, ['byteLength', 'contentIdentity', 'bytesBase64']) ||
      !safeVersion(value.symlinkTarget.byteLength) ||
      typeof value.symlinkTarget.bytesBase64 !== 'string'
    ) {
      throw new ReviewingStateProblem();
    }
    const bytes = decodeReviewingBytesBase64(value.symlinkTarget.bytesBase64);
    const targetIdentity = parseEvidenceContentIdentity(value.symlinkTarget.contentIdentity);
    if (
      bytes.byteLength !== value.symlinkTarget.byteLength ||
      sha256(bytes) !== targetIdentity.value ||
      contentIdentity?.value !== targetIdentity.value
    ) {
      throw new ReviewingStateProblem();
    }
    symlinkTarget = {
      byteLength: value.symlinkTarget.byteLength,
      contentIdentity: targetIdentity,
      bytesBase64: value.symlinkTarget.bytesBase64,
    };
  }

  let specialEntry: CurrentChangeSide['specialEntry'];
  if (value.specialEntry !== undefined) {
    if (
      value.kind !== 'special' ||
      value.byteLength !== null ||
      value.contentAvailability !== 'unavailable' ||
      value.contentLimitation !== 'unsupported-file-kind' ||
      contentIdentity !== undefined ||
      !isRecord(value.specialEntry) ||
      !hasOnlyKeys(value.specialEntry, ['kind', 'content']) ||
      !memberOf(value.specialEntry.kind, ['fifo', 'socket', 'character-device', 'block-device', 'other'] as const) ||
      value.specialEntry.content !== 'not-applicable'
    ) {
      throw new ReviewingStateProblem();
    }
    specialEntry = {
      kind: value.specialEntry.kind,
      content: 'not-applicable',
    };
  }

  let sparseAbsence: CurrentChangeSide['sparseAbsence'];
  if (value.sparseAbsence !== undefined) {
    if (
      value.evidenceSource !== 'working-tree' ||
      objectIdentity === undefined ||
      !isRecord(value.sparseAbsence) ||
      !hasOnlyKeys(value.sparseAbsence, ['indexFlag', 'workingTree']) ||
      value.sparseAbsence.indexFlag !== 'skip-worktree' ||
      value.sparseAbsence.workingTree !== 'intentionally-absent'
    ) {
      throw new ReviewingStateProblem();
    }
    sparseAbsence = {
      indexFlag: 'skip-worktree',
      workingTree: 'intentionally-absent',
    };
  }

  let gitlink: CurrentChangeSide['gitlink'];
  if (value.gitlink !== undefined) {
    if (
      value.kind !== 'gitlink' ||
      value.byteLength !== null ||
      value.contentAvailability !== 'unavailable' ||
      value.contentLimitation !== 'unsupported-file-kind' ||
      objectIdentity === undefined ||
      !isRecord(value.gitlink) ||
      !hasOnlyKeys(value.gitlink, ['objectIdentity'], ['checkout'])
    ) {
      throw new ReviewingStateProblem();
    }
    const gitlinkIdentity = parseGitObjectIdentity(value.gitlink.objectIdentity);
    if (gitlinkIdentity.algorithm !== objectIdentity.algorithm || gitlinkIdentity.value !== objectIdentity.value) {
      throw new ReviewingStateProblem();
    }
    let checkout: NonNullable<CurrentChangeSide['gitlink']>['checkout'];
    if (value.gitlink.checkout !== undefined) {
      if (!isRecord(value.gitlink.checkout)) throw new ReviewingStateProblem();
      if (value.gitlink.checkout.availability === 'available') {
        if (
          !hasOnlyKeys(value.gitlink.checkout, ['availability', 'checkedOutCommit', 'dirty', 'untracked']) ||
          typeof value.gitlink.checkout.dirty !== 'boolean' ||
          typeof value.gitlink.checkout.untracked !== 'boolean'
        ) {
          throw new ReviewingStateProblem();
        }
        checkout = {
          availability: 'available',
          checkedOutCommit: parseGitObjectIdentity(value.gitlink.checkout.checkedOutCommit),
          dirty: value.gitlink.checkout.dirty,
          untracked: value.gitlink.checkout.untracked,
        };
      } else if (
        value.gitlink.checkout.availability === 'unavailable' &&
        hasOnlyKeys(value.gitlink.checkout, ['availability', 'reason']) &&
        memberOf(value.gitlink.checkout.reason, [
          'not-present',
          'not-repository',
          'head-unavailable',
          'inspection-failed',
        ] as const)
      ) {
        checkout = {
          availability: 'unavailable',
          reason: value.gitlink.checkout.reason,
        };
      } else {
        throw new ReviewingStateProblem();
      }
    }
    gitlink = {
      objectIdentity: gitlinkIdentity,
      ...(checkout === undefined ? {} : { checkout }),
    };
  }

  let largeFilePointer: CurrentChangeSide['largeFilePointer'];
  if (value.largeFilePointer !== undefined) {
    const pointer = value.largeFilePointer;
    if (
      value.kind !== 'regular' ||
      !isRecord(pointer) ||
      !hasOnlyKeys(pointer, ['kind', 'pointer', 'declaredPayload', 'sideRepresentation', 'localPayload']) ||
      pointer.kind !== 'git-lfs-pointer-v1' ||
      !isRecord(pointer.pointer) ||
      !hasOnlyKeys(pointer.pointer, ['byteLength', 'contentIdentity', 'bytesBase64']) ||
      !safeVersion(pointer.pointer.byteLength) ||
      typeof pointer.pointer.bytesBase64 !== 'string' ||
      !isRecord(pointer.declaredPayload) ||
      !hasOnlyKeys(pointer.declaredPayload, ['objectIdentity', 'byteLength']) ||
      !safeVersion(pointer.declaredPayload.byteLength) ||
      !memberOf(pointer.sideRepresentation, ['pointer', 'payload', 'unverified'] as const) ||
      !isRecord(pointer.localPayload) ||
      !hasOnlyKeys(
        pointer.localPayload,
        ['availability', 'contentAvailability'],
        ['contentIdentity', 'contentLimitation'],
      ) ||
      !memberOf(pointer.localPayload.availability, ['available', 'unavailable', 'unverified'] as const) ||
      !memberOf(pointer.localPayload.contentAvailability, ['captured', 'not-captured', 'unavailable'] as const)
    ) {
      throw new ReviewingStateProblem();
    }
    const pointerBytes = decodeReviewingBytesBase64(pointer.pointer.bytesBase64);
    const pointerIdentity = parseEvidenceContentIdentity(pointer.pointer.contentIdentity);
    const payloadIdentity = parseEvidenceContentIdentity(pointer.declaredPayload.objectIdentity);
    const payloadContentIdentity =
      pointer.localPayload.contentIdentity === undefined
        ? undefined
        : parseEvidenceContentIdentity(pointer.localPayload.contentIdentity);
    const payloadLimitation = pointer.localPayload.contentLimitation;
    if (
      pointerIdentity.algorithm !== 'sha256' ||
      payloadIdentity.algorithm !== 'sha256' ||
      pointerBytes.byteLength !== pointer.pointer.byteLength ||
      sha256(pointerBytes) !== pointerIdentity.value ||
      (pointer.localPayload.availability === 'available' &&
        (payloadContentIdentity?.value !== payloadIdentity.value ||
          pointer.localPayload.contentAvailability === 'unavailable')) ||
      (pointer.localPayload.availability === 'unavailable' &&
        (payloadContentIdentity !== undefined || pointer.localPayload.contentAvailability === 'captured')) ||
      (pointer.localPayload.contentAvailability === 'captured' &&
        (payloadContentIdentity === undefined || pointer.localPayload.availability !== 'available')) ||
      (contentIdentity !== undefined &&
        pointer.sideRepresentation === 'pointer' &&
        contentIdentity.value !== pointerIdentity.value) ||
      (contentIdentity !== undefined &&
        pointer.sideRepresentation === 'payload' &&
        contentIdentity.value !== payloadIdentity.value) ||
      (payloadLimitation !== undefined &&
        !memberOf(payloadLimitation, [
          'aggregate-capture-limit',
          'file-capture-limit',
          'aggregate-verification-limit',
          'file-verification-limit',
          'missing-object',
          'unsupported-file-kind',
          'unsupported-content-filter',
          'large-file-payload-unavailable',
          'unmerged-index',
          'read-failed',
        ] as const))
    ) {
      throw new ReviewingStateProblem();
    }
    largeFilePointer = {
      kind: 'git-lfs-pointer-v1',
      pointer: {
        byteLength: pointer.pointer.byteLength,
        contentIdentity: pointerIdentity,
        bytesBase64: pointer.pointer.bytesBase64,
      },
      declaredPayload: {
        objectIdentity: payloadIdentity,
        byteLength: pointer.declaredPayload.byteLength,
      },
      sideRepresentation: pointer.sideRepresentation,
      localPayload: {
        availability: pointer.localPayload.availability,
        contentAvailability: pointer.localPayload.contentAvailability,
        ...(payloadContentIdentity === undefined ? {} : { contentIdentity: payloadContentIdentity }),
        ...(payloadLimitation === undefined ? {} : { contentLimitation: payloadLimitation }),
      },
    };
  }

  let generated: CurrentChangeSide['generated'];
  if (value.generated !== undefined) {
    if (
      !isRecord(value.generated) ||
      !hasOnlyKeys(value.generated, ['classification', 'source', 'attribute']) ||
      value.generated.classification !== 'generated' ||
      value.generated.source !== 'git-attribute' ||
      !memberOf(value.generated.attribute, ['linguist-generated', 'generated'] as const)
    ) {
      throw new ReviewingStateProblem();
    }
    generated = {
      classification: 'generated',
      source: 'git-attribute',
      attribute: value.generated.attribute,
    };
  }
  const workingEvidenceLimitation =
    value.workingEvidenceLimitation === undefined
      ? undefined
      : value.workingEvidenceLimitation === 'unsupported-content-filter'
        ? ('unsupported-content-filter' as const)
        : undefined;
  if (
    value.workingEvidenceLimitation !== undefined &&
    (workingEvidenceLimitation === undefined || value.evidenceSource !== 'working-tree')
  ) {
    throw new ReviewingStateProblem();
  }

  return {
    path,
    kind: value.kind,
    gitMode: value.gitMode,
    byteLength: value.byteLength,
    evidenceSource: value.evidenceSource,
    ...(objectIdentity === undefined ? {} : { objectIdentity }),
    ...(contentIdentity === undefined ? {} : { contentIdentity }),
    classification: value.classification,
    contentAvailability: value.contentAvailability,
    ...(value.contentLimitation === undefined ? {} : { contentLimitation: value.contentLimitation }),
    ...(objectAvailability === undefined ? {} : { objectAvailability }),
    ...(symlinkTarget === undefined ? {} : { symlinkTarget }),
    ...(specialEntry === undefined ? {} : { specialEntry }),
    ...(sparseAbsence === undefined ? {} : { sparseAbsence }),
    ...(gitlink === undefined ? {} : { gitlink }),
    ...(largeFilePointer === undefined ? {} : { largeFilePointer }),
    ...(generated === undefined ? {} : { generated }),
    ...(workingEvidenceLimitation === undefined ? {} : { workingEvidenceLimitation }),
  };
}

/**
 * Durable verifier contract: this return order deliberately matches Workspace
 * Evidence's public-file tree because Harness hashes parsed manifest windows
 * with plain JSON.stringify. The golden manifest-digest scenario pins the pair.
 */
export function validScopeMembershipPath(value: EvidencePath): boolean {
  const bytes = decodeReviewingBytesBase64(value.bytesBase64);
  if (bytes.byteLength === 0 || bytes[0] === 0x2f || bytes.includes(0)) {
    return false;
  }
  let start = 0;
  while (start <= bytes.byteLength) {
    const slash = bytes.indexOf(0x2f, start);
    const end = slash < 0 ? bytes.byteLength : slash;
    const component = bytes.subarray(start, end);
    if (
      component.byteLength === 0 ||
      (component.byteLength === 1 && component[0] === 0x2e) ||
      (component.byteLength === 2 && component[0] === 0x2e && component[1] === 0x2e)
    ) {
      return false;
    }
    if (slash < 0) return true;
    start = slash + 1;
  }
  return true;
}

export function parseEvidenceScopeMembership(value: unknown): EvidenceScopeMembership {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['selectionPath', 'selectionKind', 'inclusion', 'matchedSides']) ||
    (value.selectionKind !== 'file' && value.selectionKind !== 'directory') ||
    (value.inclusion !== 'ordinary' && value.inclusion !== 'explicit-ignored') ||
    !Array.isArray(value.matchedSides) ||
    value.matchedSides.length < 1 ||
    value.matchedSides.length > 2 ||
    !value.matchedSides.every(side => side === 'old' || side === 'new') ||
    new Set(value.matchedSides).size !== value.matchedSides.length ||
    !['["old"]', '["new"]', '["old","new"]'].includes(JSON.stringify(value.matchedSides)) ||
    (value.inclusion === 'explicit-ignored' && !(value.matchedSides as readonly unknown[]).includes('new'))
  ) {
    throw new ReviewingStateProblem();
  }
  const selectionPath = parseEvidencePath(value.selectionPath);
  if (!validScopeMembershipPath(selectionPath)) {
    throw new ReviewingStateProblem();
  }
  return {
    selectionPath,
    selectionKind: value.selectionKind,
    inclusion: value.inclusion,
    matchedSides: value.matchedSides as readonly ('old' | 'new')[],
  };
}

export function parseCurrentChangedFile(value: unknown): CurrentChangedFile {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['fileIdentity', 'status', 'staging'], ['oldSide', 'newSide', 'scopeMembership']) ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    !memberOf(value.status, [
      'added',
      'deleted',
      'modified',
      'renamed',
      'copied',
      'mode-changed',
      'type-changed',
      'staging-only',
    ] as const) ||
    !isRecord(value.staging) ||
    !hasOnlyKeys(value.staging, ['index', 'workingTree']) ||
    !memberOf(value.staging.index, [
      'unchanged',
      'added',
      'deleted',
      'modified',
      'renamed',
      'copied',
      'type-changed',
      'unmerged',
      'untracked',
    ] as const) ||
    !memberOf(value.staging.workingTree, [
      'unchanged',
      'added',
      'deleted',
      'modified',
      'renamed',
      'copied',
      'type-changed',
      'unmerged',
      'untracked',
    ] as const) ||
    (value.oldSide === undefined && value.newSide === undefined)
  ) {
    throw new ReviewingStateProblem();
  }
  const oldSide = value.oldSide === undefined ? undefined : parseCurrentChangeSide(value.oldSide);
  const newSide = value.newSide === undefined ? undefined : parseCurrentChangeSide(value.newSide);
  const scopeMembership =
    value.scopeMembership === undefined
      ? undefined
      : Array.isArray(value.scopeMembership) && value.scopeMembership.length >= 1 && value.scopeMembership.length <= 128
        ? value.scopeMembership.map(parseEvidenceScopeMembership)
        : (() => {
            throw new ReviewingStateProblem();
          })();
  if (
    scopeMembership?.some(
      membership =>
        (membership.matchedSides.includes('old') && oldSide === undefined) ||
        (membership.matchedSides.includes('new') && newSide === undefined),
    )
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    fileIdentity: value.fileIdentity,
    status: value.status,
    staging: {
      index: value.staging.index,
      workingTree: value.staging.workingTree,
    },
    ...(oldSide === undefined ? {} : { oldSide }),
    ...(newSide === undefined ? {} : { newSide }),
    ...(scopeMembership === undefined ? {} : { scopeMembership }),
  };
}

export function parseCommitEndpoint(value: unknown): ReviewComparisonCommitEndpoint {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['kind', 'selector', 'objectFormat', 'objectIdentity', 'abbreviatedObjectIdentity', 'subject'],
      ['scopeFingerprint'],
    ) ||
    value.kind !== 'commit' ||
    typeof value.selector !== 'string' ||
    !memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) ||
    typeof value.objectIdentity !== 'string' ||
    !/^[0-9a-f]{40,64}$/u.test(value.objectIdentity) ||
    typeof value.abbreviatedObjectIdentity !== 'string' ||
    !/^[0-9a-f]{7,64}$/u.test(value.abbreviatedObjectIdentity) ||
    typeof value.subject !== 'string' ||
    (value.scopeFingerprint !== undefined &&
      (typeof value.scopeFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.scopeFingerprint)))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'commit',
    selector: value.selector,
    objectFormat: value.objectFormat,
    objectIdentity: value.objectIdentity,
    abbreviatedObjectIdentity: value.abbreviatedObjectIdentity,
    subject: value.subject,
    ...(value.scopeFingerprint === undefined ? {} : { scopeFingerprint: value.scopeFingerprint }),
  };
}

export function parseTreeEndpoint(value: unknown): ReviewComparisonTreeEndpoint {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['kind', 'selector', 'objectFormat', 'objectIdentity', 'abbreviatedObjectIdentity'],
      ['scopeFingerprint'],
    ) ||
    value.kind !== 'tree' ||
    typeof value.selector !== 'string' ||
    !memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) ||
    typeof value.objectIdentity !== 'string' ||
    !/^[0-9a-f]{40,64}$/u.test(value.objectIdentity) ||
    typeof value.abbreviatedObjectIdentity !== 'string' ||
    !/^[0-9a-f]{7,64}$/u.test(value.abbreviatedObjectIdentity) ||
    (value.scopeFingerprint !== undefined &&
      (typeof value.scopeFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.scopeFingerprint)))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'tree',
    selector: value.selector,
    objectFormat: value.objectFormat,
    objectIdentity: value.objectIdentity,
    abbreviatedObjectIdentity: value.abbreviatedObjectIdentity,
    ...(value.scopeFingerprint === undefined ? {} : { scopeFingerprint: value.scopeFingerprint }),
  };
}

export function parseRevisionEndpoint(value: unknown): ReviewComparisonRevisionEndpoint {
  if (isRecord(value) && value.kind === 'commit') {
    return parseCommitEndpoint(value);
  }
  if (isRecord(value) && value.kind === 'tree') {
    return parseTreeEndpoint(value);
  }
  throw new ReviewingStateProblem();
}

export function parseReviewComparisonBasis(value: unknown): ReviewComparisonBasis {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new ReviewingStateProblem();
  }
  if (value.kind === 'commit' || value.kind === 'tree') {
    return parseRevisionEndpoint(value);
  }
  if (
    value.kind === 'head' &&
    hasOnlyKeys(value, ['kind', 'selector', 'objectFormat', 'objectIdentity', 'state']) &&
    value.selector === 'HEAD' &&
    memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
    (value.objectIdentity === null ||
      (typeof value.objectIdentity === 'string' && /^[0-9a-f]{40,64}$/u.test(value.objectIdentity))) &&
    memberOf(value.state, ['resolved', 'unborn'] as const) &&
    ((value.state === 'unborn' && value.objectIdentity === null) ||
      (value.state === 'resolved' && value.objectIdentity !== null))
  ) {
    return {
      kind: 'head',
      selector: 'HEAD',
      objectFormat: value.objectFormat,
      objectIdentity: value.objectIdentity,
      state: value.state,
    } satisfies CurrentChangesComparisonBasis;
  }
  if (
    value.kind === 'empty-tree' &&
    hasOnlyKeys(value, ['kind', 'selector', 'objectFormat', 'objectIdentity'], ['scopeFingerprint']) &&
    value.selector === 'root parent' &&
    memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
    value.objectIdentity === null &&
    (value.scopeFingerprint === undefined ||
      (typeof value.scopeFingerprint === 'string' && /^[0-9a-f]{64}$/u.test(value.scopeFingerprint)))
  ) {
    return {
      kind: 'empty-tree',
      selector: 'root parent',
      objectFormat: value.objectFormat,
      objectIdentity: null,
      ...(value.scopeFingerprint === undefined ? {} : { scopeFingerprint: value.scopeFingerprint }),
    };
  }
  if (
    value.kind === 'index' &&
    hasOnlyKeys(value, ['kind', 'selector', 'objectFormat', 'entryCount', 'indexFingerprint']) &&
    value.selector === 'index' &&
    memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
    safeVersion(value.entryCount) &&
    typeof value.indexFingerprint === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.indexFingerprint)
  ) {
    return {
      kind: 'index',
      selector: 'index',
      objectFormat: value.objectFormat,
      entryCount: value.entryCount,
      indexFingerprint: value.indexFingerprint,
    } satisfies ReviewComparisonIndexEndpoint;
  }
  throw new ReviewingStateProblem();
}

export function parseReviewComparedState(value: unknown): ReviewComparedState {
  if (isRecord(value) && (value.kind === 'commit' || value.kind === 'tree')) {
    return parseRevisionEndpoint(value);
  }
  if (
    isRecord(value) &&
    hasOnlyKeys(
      value,
      ['kind', 'staged', 'unstaged', 'nonIgnoredUntracked', 'ignoredUntracked'],
      ['selector', 'objectFormat', 'entryCount', 'workingFingerprint', 'explicitlyScopedIgnoredUntracked'],
    ) &&
    value.kind === 'effective-working-state' &&
    value.staged === 'included' &&
    value.unstaged === 'included' &&
    value.nonIgnoredUntracked === 'included' &&
    value.ignoredUntracked === 'excluded'
  ) {
    if (value.workingFingerprint === undefined) {
      if (value.explicitlyScopedIgnoredUntracked !== undefined) {
        throw new ReviewingStateProblem();
      }
      return {
        kind: 'effective-working-state',
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
      } satisfies CurrentChangesComparedState;
    }
    if (
      value.selector === 'effective-working-state' &&
      memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
      safeVersion(value.entryCount) &&
      typeof value.workingFingerprint === 'string' &&
      /^[0-9a-f]{64}$/u.test(value.workingFingerprint) &&
      (value.explicitlyScopedIgnoredUntracked === undefined || value.explicitlyScopedIgnoredUntracked === 'included')
    ) {
      return {
        kind: 'effective-working-state',
        selector: 'effective-working-state',
        objectFormat: value.objectFormat,
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
        ...(value.explicitlyScopedIgnoredUntracked === undefined
          ? {}
          : { explicitlyScopedIgnoredUntracked: 'included' as const }),
        entryCount: value.entryCount,
        workingFingerprint: value.workingFingerprint,
      } satisfies ReviewComparisonWorkingStateEndpoint;
    }
    throw new ReviewingStateProblem();
  }
  if (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'selector', 'objectFormat', 'entryCount', 'workingFingerprint']) &&
    value.kind === 'working-tree' &&
    value.selector === 'working-tree' &&
    memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
    safeVersion(value.entryCount) &&
    typeof value.workingFingerprint === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.workingFingerprint)
  ) {
    return {
      kind: 'working-tree',
      selector: 'working-tree',
      objectFormat: value.objectFormat,
      entryCount: value.entryCount,
      workingFingerprint: value.workingFingerprint,
    } satisfies ReviewComparisonWorkingTreeEndpoint;
  }
  if (
    isRecord(value) &&
    hasOnlyKeys(value, ['kind', 'selector', 'objectFormat', 'entryCount', 'indexFingerprint']) &&
    value.kind === 'index' &&
    value.selector === 'index' &&
    memberOf(value.objectFormat, ['sha1', 'sha256', 'unknown'] as const) &&
    safeVersion(value.entryCount) &&
    typeof value.indexFingerprint === 'string' &&
    /^[0-9a-f]{64}$/u.test(value.indexFingerprint)
  ) {
    return {
      kind: 'index',
      selector: 'index',
      objectFormat: value.objectFormat,
      entryCount: value.entryCount,
      indexFingerprint: value.indexFingerprint,
    } satisfies ReviewComparisonIndexEndpoint;
  }
  throw new ReviewingStateProblem();
}

export function endpointCarriesScopeFingerprint(endpoint: ReviewComparisonBasis | ReviewComparedState): boolean {
  return 'scopeFingerprint' in endpoint && endpoint.scopeFingerprint !== undefined;
}

export function endpointRequiresScopeFingerprint(endpoint: ReviewComparisonBasis | ReviewComparedState): boolean {
  return endpoint.kind === 'commit' || endpoint.kind === 'tree' || endpoint.kind === 'empty-tree';
}

export function parseManifestSummary(value: unknown): CurrentChangesManifestSummary {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'totalFiles', 'digest'], ['inspectabilityFingerprint']) ||
    value.formatVersion !== 1 ||
    !safeVersion(value.totalFiles) ||
    value.totalFiles > 100_000 ||
    (value.inspectabilityFingerprint !== undefined &&
      (typeof value.inspectabilityFingerprint !== 'string' || !/^[0-9a-f]{64}$/u.test(value.inspectabilityFingerprint)))
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    totalFiles: value.totalFiles,
    digest: parseEvidenceContentIdentity(value.digest),
    ...(value.inspectabilityFingerprint === undefined
      ? {}
      : { inspectabilityFingerprint: value.inspectabilityFingerprint }),
  };
}

export function parseDurableComparisonSelection(value: unknown): ReviewComparisonSelection {
  try {
    return normalizeReviewComparisonSelection(value);
  } catch {
    throw new ReviewingStateProblem();
  }
}

export function parseDurableComparisonDynamicInputs(value: unknown): readonly ReviewComparisonDynamicInput[] {
  try {
    return normalizeReviewComparisonDynamicInputs(value);
  } catch {
    throw new ReviewingStateProblem();
  }
}

export function parseReviewQuestionAnchor(value: unknown): ReviewQuestionAnchor {
  if (isRecord(value) && value.kind === 'review.whole-file') {
    if (
      !hasOnlyKeys(
        value,
        ['kind', 'reviewSnapshotIdentity', 'fileIdentity', 'side', 'scope', 'content'],
        ['fileAbsolute'],
      ) ||
      !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
      typeof value.fileIdentity !== 'string' ||
      !FILE_ID_PATTERN.test(value.fileIdentity) ||
      !memberOf(value.side, ['old', 'new'] as const) ||
      value.scope !== 'file' ||
      (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute)) ||
      !isRecord(value.content) ||
      !memberOf(value.content.classification, ['text', 'binary', 'unrenderable', 'unknown'] as const)
    ) {
      throw new ReviewingStateProblem();
    }
    let content: ReviewQuestionWholeFileAnchor['content'];
    if (value.content.status === 'available') {
      if (
        !hasOnlyKeys(value.content, ['status', 'classification', 'byteLength', 'contentIdentity']) ||
        !safeVersion(value.content.byteLength)
      ) {
        throw new ReviewingStateProblem();
      }
      content = {
        status: 'available',
        classification: value.content.classification,
        byteLength: value.content.byteLength,
        contentIdentity: parseEvidenceContentIdentity(value.content.contentIdentity),
      };
    } else if (value.content.status === 'unavailable') {
      if (
        !hasOnlyKeys(
          value.content,
          ['status', 'classification', 'availability', 'byteLength'],
          ['contentIdentity', 'limitation'],
        ) ||
        !memberOf(value.content.availability, ['not-captured', 'unavailable'] as const) ||
        (value.content.byteLength !== null && !safeVersion(value.content.byteLength)) ||
        (value.content.limitation !== undefined &&
          !memberOf(value.content.limitation, [
            'aggregate-capture-limit',
            'file-capture-limit',
            'aggregate-verification-limit',
            'file-verification-limit',
            'missing-object',
            'unsupported-file-kind',
            'unsupported-content-filter',
            'large-file-payload-unavailable',
            'unmerged-index',
            'read-failed',
          ] as const))
      ) {
        throw new ReviewingStateProblem();
      }
      content = {
        status: 'unavailable',
        classification: value.content.classification,
        availability: value.content.availability,
        byteLength: value.content.byteLength,
        ...(value.content.contentIdentity === undefined
          ? {}
          : {
              contentIdentity: parseEvidenceContentIdentity(value.content.contentIdentity),
            }),
        ...(value.content.limitation === undefined ? {} : { limitation: value.content.limitation }),
      };
    } else {
      throw new ReviewingStateProblem();
    }
    return {
      kind: 'review.whole-file',
      reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
      fileIdentity: value.fileIdentity,
      side: value.side,
      scope: 'file',
      ...(value.fileAbsolute === undefined ? {} : { fileAbsolute: value.fileAbsolute }),
      content,
    };
  }
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      ['kind', 'reviewSnapshotIdentity', 'fileIdentity', 'side', 'line', 'byteOffset', 'byteLength', 'lineContent'],
      ['fileAbsolute', 'rowIdentity', 'rowAbsolute'],
    ) ||
    value.kind !== 'review.diff-line' ||
    !recordIdentity(value.reviewSnapshotIdentity, 'rsn') ||
    typeof value.fileIdentity !== 'string' ||
    !FILE_ID_PATTERN.test(value.fileIdentity) ||
    !memberOf(value.side, ['old', 'new'] as const) ||
    !safeVersion(value.line, false) ||
    !safeVersion(value.byteOffset) ||
    !safeVersion(value.byteLength) ||
    value.byteLength > ANCHOR_LINE_MAX_BYTES ||
    !isRecord(value.lineContent) ||
    !hasOnlyKeys(value.lineContent, ['algorithm', 'value', 'bytesBase64']) ||
    value.lineContent.algorithm !== 'sha256' ||
    typeof value.lineContent.value !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(value.lineContent.value) ||
    typeof value.lineContent.bytesBase64 !== 'string'
  ) {
    throw new ReviewingStateProblem();
  }
  const lineBytes = decodeReviewingBytesBase64(value.lineContent.bytesBase64);
  const hasRowCoordinates = value.rowIdentity !== undefined || value.rowAbsolute !== undefined;
  if (
    (value.fileAbsolute !== undefined && !safeVersion(value.fileAbsolute)) ||
    (hasRowCoordinates &&
      (typeof value.rowIdentity !== 'string' ||
        !DIFF_ROW_ID_PATTERN.test(value.rowIdentity) ||
        !safeVersion(value.rowAbsolute))) ||
    lineBytes.byteLength !== value.byteLength ||
    sha256(lineBytes) !== value.lineContent.value
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    kind: 'review.diff-line',
    reviewSnapshotIdentity: value.reviewSnapshotIdentity as ReviewSnapshotIdentity,
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
    byteOffset: value.byteOffset,
    byteLength: value.byteLength,
    lineContent: {
      algorithm: 'sha256',
      value: value.lineContent.value,
      bytesBase64: value.lineContent.bytesBase64,
    },
  };
}
