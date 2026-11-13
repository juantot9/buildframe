import { GitInspectionError } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type {
  ReviewComparedState,
  ReviewComparisonBasis,
  ReviewComparisonCommitEndpoint,
  ReviewComparisonDynamicInput,
  ReviewComparisonIndexEndpoint,
  ReviewComparisonResolutionIdentity,
  ReviewComparisonRevisionEndpoint,
  ReviewComparisonSelection,
  ReviewComparisonTreeEndpoint,
  ReviewComparisonWorkingStateEndpoint,
  ReviewComparisonWorkingTreeEndpoint,
  ReviewRevisionEndpointSelection,
  ReviewRevisionObjectKind,
} from './contracts.js';
import type {
  IndexEnumeration,
  PairedEnumeration,
  PairedFacts,
  ResolvedCommit,
  ResolvedReviewComparison,
  ResolvedRevisionEndpoint,
  ResolvedTree,
} from './internalTypes.js';
import { reviewComparisonUsesExactResolution, validLocalReference } from './selection.js';
import { FULL_OBJECT_ID_PATTERN } from './utils.js';

const COMPARISON_RESOLUTION_ID_PATTERN = /^rcp_[0-9a-f]{64}$/u;

/**
 * Stable comparable identity of one resolved comparison endpoint: the exact
 * scoped projection fingerprint when scope is present, otherwise the object
 * identity for revisions or enumeration fingerprint for local endpoints.
 */
export function reviewComparisonEndpointIdentity(endpoint: ReviewComparisonBasis | ReviewComparedState): string | null {
  if ('scopeFingerprint' in endpoint && endpoint.scopeFingerprint !== undefined) {
    return endpoint.scopeFingerprint;
  }
  switch (endpoint.kind) {
    case 'head':
    case 'empty-tree':
      return endpoint.objectIdentity;
    case 'commit':
    case 'tree':
      return endpoint.objectIdentity;
    case 'index':
      return endpoint.indexFingerprint;
    case 'effective-working-state':
    case 'working-tree':
      return 'workingFingerprint' in endpoint ? endpoint.workingFingerprint : null;
  }
}

export function comparisonEndpointMatchesScope(
  selection: ReviewComparisonSelection,
  fresh: ReviewComparisonBasis | ReviewComparedState,
  expected: ReviewComparisonBasis | ReviewComparedState,
): boolean {
  if (selection.scope === undefined) {
    return JSON.stringify(fresh) === JSON.stringify(expected);
  }
  return (
    fresh.kind === expected.kind &&
    ('objectFormat' in fresh ? fresh.objectFormat : undefined) ===
      ('objectFormat' in expected ? expected.objectFormat : undefined) &&
    reviewComparisonEndpointIdentity(fresh) === reviewComparisonEndpointIdentity(expected)
  );
}

export function noWorkingFacts(): PairedFacts {
  return {
    scopePaths: [],
    factPaths: [],
    canonical: Buffer.alloc(0),
    entryCount: 0,
    digestComplete: true,
  };
}

function indexFingerprintValue(index: IndexEnumeration): string {
  return sha256(Buffer.concat([Buffer.from('index\0', 'ascii'), index.canonical]));
}

function workingFingerprintValue(
  kind: 'effective-working-state' | 'working-tree',
  enumeration: PairedEnumeration,
  facts: PairedFacts,
): string {
  const parts: Buffer[] = [Buffer.from(`${kind}\0`, 'ascii')];
  if (kind === 'effective-working-state') {
    if (enumeration.index === null || enumeration.untracked === null || enumeration.unstaged === null) {
      throw new GitInspectionError('invalid-comparison');
    }
    parts.push(enumeration.index.canonical, enumeration.untracked.canonical, enumeration.unstaged.canonical);
  }
  parts.push(facts.canonical);
  return sha256(Buffer.concat(parts));
}

export function pairedComparisonEndpoints(
  resolved: ResolvedReviewComparison,
  enumeration: PairedEnumeration,
  facts: PairedFacts,
  scopeEntryCount: number,
): {
  readonly basis: ReviewComparisonBasis;
  readonly comparedState: ReviewComparedState;
} {
  const format = resolved.objectFormat;
  const form = resolved.workingComparison;
  if (form === undefined || enumeration.index === null) {
    throw new GitInspectionError('invalid-comparison');
  }
  const indexEnumeration = enumeration.index;
  const indexEndpoint = (): ReviewComparisonIndexEndpoint =>
    deepFreeze({
      kind: 'index',
      selector: 'index',
      objectFormat: format,
      entryCount: indexEnumeration.entryCount,
      indexFingerprint: indexFingerprintValue(indexEnumeration),
    });
  if (form.kind === 'revision-to-index') {
    return {
      basis: revisionEndpoint(form.basis, format, resolved.basisScopeFingerprint),
      comparedState: indexEndpoint(),
    };
  }
  if (form.kind === 'revision-to-working-state') {
    if (enumeration.untracked === null || enumeration.unstaged === null) {
      throw new GitInspectionError('invalid-comparison');
    }
    return {
      basis: revisionEndpoint(form.basis, format, resolved.basisScopeFingerprint),
      comparedState: deepFreeze({
        kind: 'effective-working-state',
        selector: 'effective-working-state',
        objectFormat: format,
        staged: 'included',
        unstaged: 'included',
        nonIgnoredUntracked: 'included',
        ignoredUntracked: 'excluded',
        ...(enumeration.explicitIgnoredPaths.size === 0
          ? {}
          : { explicitlyScopedIgnoredUntracked: 'included' as const }),
        entryCount: scopeEntryCount,
        workingFingerprint: workingFingerprintValue('effective-working-state', enumeration, facts),
      }),
    };
  }
  return {
    basis: indexEndpoint(),
    comparedState: deepFreeze({
      kind: 'working-tree',
      selector: 'working-tree',
      objectFormat: format,
      entryCount: enumeration.index.entryCount,
      workingFingerprint: workingFingerprintValue('working-tree', enumeration, facts),
    }),
  };
}

export function freshPairedScopeCount(enumeration: PairedEnumeration): number {
  const paths = new Set<string>();
  for (const record of enumeration.tree?.records ?? []) {
    paths.add(record.path.toString('hex'));
  }
  for (const record of enumeration.index?.records ?? []) {
    paths.add(record.path.toString('hex'));
  }
  for (const item of enumeration.untracked?.paths ?? []) {
    paths.add(item.toString('hex'));
  }
  return paths.size;
}

function commitEndpoint(
  commit: ResolvedCommit,
  format: 'sha1' | 'sha256' | 'unknown',
  scopeFingerprint?: string,
): ReviewComparisonCommitEndpoint {
  return deepFreeze({
    kind: 'commit',
    selector: commit.selector,
    objectFormat: format,
    objectIdentity: commit.objectIdentity,
    abbreviatedObjectIdentity: commit.objectIdentity.slice(0, 12),
    subject: commit.subject,
    ...(scopeFingerprint === undefined ? {} : { scopeFingerprint }),
  });
}

function treeEndpoint(
  tree: ResolvedTree,
  format: 'sha1' | 'sha256' | 'unknown',
  scopeFingerprint?: string,
): ReviewComparisonTreeEndpoint {
  return deepFreeze({
    kind: 'tree',
    selector: tree.selector,
    objectFormat: format,
    objectIdentity: tree.objectIdentity,
    abbreviatedObjectIdentity: tree.objectIdentity.slice(0, 12),
    ...(scopeFingerprint === undefined ? {} : { scopeFingerprint }),
  });
}

export function revisionEndpoint(
  endpoint: ResolvedRevisionEndpoint,
  format: 'sha1' | 'sha256' | 'unknown',
  scopeFingerprint?: string,
): ReviewComparisonRevisionEndpoint {
  return endpoint.kind === 'commit'
    ? commitEndpoint(endpoint, format, scopeFingerprint)
    : treeEndpoint(endpoint, format, scopeFingerprint);
}

export function comparisonBasisEndpoint(resolved: ResolvedReviewComparison): ReviewComparisonBasis {
  if (resolved.workingComparison !== undefined) {
    throw new GitInspectionError('invalid-comparison');
  }
  const basis = resolved.basis;
  return basis === null || basis === undefined
    ? deepFreeze({
        kind: 'empty-tree',
        selector: 'root parent',
        objectFormat: resolved.objectFormat,
        objectIdentity: null,
        ...(resolved.basisScopeFingerprint === undefined ? {} : { scopeFingerprint: resolved.basisScopeFingerprint }),
      })
    : revisionEndpoint(basis, resolved.objectFormat, resolved.basisScopeFingerprint);
}

export function normalizeReviewComparisonDynamicInputs(value: unknown): readonly ReviewComparisonDynamicInput[] {
  if (!Array.isArray(value) || value.length > 2) {
    throw new TypeError('Invalid Review comparison dynamic inputs');
  }
  const inputs = value.map(item => {
    if (typeof item !== 'object' || item === null) {
      throw new TypeError('Invalid Review comparison dynamic input');
    }
    const input = item as Record<string, unknown>;
    if (
      Object.keys(input).length !== 7 ||
      input.kind !== 'local-ref' ||
      !['basis', 'compared', 'merge-base-reference'].includes(input.role as string) ||
      !validLocalReference(input.reference) ||
      !['sha1', 'sha256', 'unknown'].includes(input.objectFormat as string) ||
      typeof input.referenceObjectIdentity !== 'string' ||
      !FULL_OBJECT_ID_PATTERN.test(input.referenceObjectIdentity) ||
      (input.resolvedObjectKind !== 'commit' && input.resolvedObjectKind !== 'tree') ||
      typeof input.resolvedObjectIdentity !== 'string' ||
      !FULL_OBJECT_ID_PATTERN.test(input.resolvedObjectIdentity)
    ) {
      throw new TypeError('Invalid Review comparison dynamic input');
    }
    return deepFreeze({
      kind: 'local-ref' as const,
      role: input.role as ReviewComparisonDynamicInput['role'],
      reference: input.reference,
      objectFormat: input.objectFormat as ReviewComparisonDynamicInput['objectFormat'],
      referenceObjectIdentity: input.referenceObjectIdentity,
      resolvedObjectKind: input.resolvedObjectKind as ReviewRevisionObjectKind,
      resolvedObjectIdentity: input.resolvedObjectIdentity,
    });
  });
  if (new Set(inputs.map(input => input.role)).size !== inputs.length) {
    throw new TypeError('Invalid Review comparison dynamic inputs');
  }
  return deepFreeze(inputs);
}

export const WORKING_FINGERPRINT_PATTERN: RegExp = /^[0-9a-f]{64}$/u;

function isReviewComparisonIndexEndpoint(
  value: ReviewComparisonBasis | ReviewComparedState,
): value is ReviewComparisonIndexEndpoint {
  return (
    value.kind === 'index' &&
    value.selector === 'index' &&
    ['sha1', 'sha256', 'unknown'].includes(value.objectFormat) &&
    Number.isSafeInteger(value.entryCount) &&
    value.entryCount >= 0 &&
    typeof value.indexFingerprint === 'string' &&
    WORKING_FINGERPRINT_PATTERN.test(value.indexFingerprint)
  );
}

function isReviewComparisonWorkingStateEndpoint(
  value: ReviewComparedState,
): value is ReviewComparisonWorkingStateEndpoint {
  if (value.kind !== 'effective-working-state' || !('workingFingerprint' in value)) {
    return false;
  }
  return (
    value.staged === 'included' &&
    value.unstaged === 'included' &&
    value.nonIgnoredUntracked === 'included' &&
    value.ignoredUntracked === 'excluded' &&
    (!('explicitlyScopedIgnoredUntracked' in value) ||
      value.explicitlyScopedIgnoredUntracked === undefined ||
      value.explicitlyScopedIgnoredUntracked === 'included') &&
    value.selector === 'effective-working-state' &&
    ['sha1', 'sha256', 'unknown'].includes(value.objectFormat) &&
    Number.isSafeInteger(value.entryCount) &&
    value.entryCount >= 0 &&
    typeof value.workingFingerprint === 'string' &&
    WORKING_FINGERPRINT_PATTERN.test(value.workingFingerprint)
  );
}

function isReviewComparisonWorkingTreeEndpoint(
  value: ReviewComparedState,
): value is ReviewComparisonWorkingTreeEndpoint {
  return (
    value.kind === 'working-tree' &&
    value.selector === 'working-tree' &&
    ['sha1', 'sha256', 'unknown'].includes(value.objectFormat) &&
    Number.isSafeInteger(value.entryCount) &&
    value.entryCount >= 0 &&
    typeof value.workingFingerprint === 'string' &&
    WORKING_FINGERPRINT_PATTERN.test(value.workingFingerprint)
  );
}

export function isRevisionComparisonEndpoint(
  value: ReviewComparisonBasis | ReviewComparedState | ReviewComparisonRevisionEndpoint,
): value is ReviewComparisonRevisionEndpoint {
  return value.kind === 'commit' || value.kind === 'tree';
}

function scopedEndpointWitness(endpoint: ReviewComparisonBasis | ReviewComparedState): unknown {
  if ('scopeFingerprint' in endpoint) {
    return [endpoint.kind, endpoint.objectFormat, endpoint.scopeFingerprint];
  }
  if (endpoint.kind === 'index') {
    return [endpoint.kind, endpoint.objectFormat, endpoint.indexFingerprint];
  }
  if (
    (endpoint.kind === 'effective-working-state' || endpoint.kind === 'working-tree') &&
    'workingFingerprint' in endpoint
  ) {
    return [endpoint.kind, endpoint.objectFormat, endpoint.workingFingerprint];
  }
  return [endpoint.kind, 'objectFormat' in endpoint ? endpoint.objectFormat : null, null];
}

export function reviewComparisonResolutionIdentity(
  selection: ReviewComparisonSelection,
  basis: ReviewComparisonBasis,
  comparedState: ReviewComparedState,
  dynamicInputs: readonly ReviewComparisonDynamicInput[],
): ReviewComparisonResolutionIdentity {
  const resolutionEvidence =
    selection.scope === undefined
      ? [selection, basis, comparedState, dynamicInputs]
      : [
          selection,
          scopedEndpointWitness(basis),
          scopedEndpointWitness(comparedState),
          dynamicInputs.map(input => [input.role, input.reference, input.resolvedObjectKind]),
        ];
  return `rcp_${sha256(JSON.stringify(resolutionEvidence))}` as ReviewComparisonResolutionIdentity;
}

function selectedEndpointMatches(
  selection: ReviewRevisionEndpointSelection,
  endpoint: ReviewComparisonBasis | ReviewComparedState,
  dynamicInput: ReviewComparisonDynamicInput | undefined,
): boolean {
  if (endpoint.kind !== selection.objectKind) return false;
  if (selection.kind === 'object') {
    return (
      dynamicInput === undefined &&
      endpoint.selector === selection.objectIdentity &&
      endpoint.objectIdentity === selection.objectIdentity
    );
  }
  return (
    dynamicInput !== undefined &&
    endpoint.selector === selection.reference &&
    dynamicInput.reference === selection.reference &&
    dynamicInput.resolvedObjectKind === selection.objectKind &&
    dynamicInput.resolvedObjectIdentity === endpoint.objectIdentity &&
    dynamicInput.objectFormat === endpoint.objectFormat
  );
}

export function endpointHasScopeWitness(endpoint: ReviewComparisonBasis | ReviewComparedState): boolean {
  if (endpoint.kind === 'commit' || endpoint.kind === 'tree' || endpoint.kind === 'empty-tree') {
    return typeof endpoint.scopeFingerprint === 'string' && WORKING_FINGERPRINT_PATTERN.test(endpoint.scopeFingerprint);
  }
  return true;
}

export function validReviewComparisonResolution(
  selection: ReviewComparisonSelection,
  basis: ReviewComparisonBasis,
  comparedState: ReviewComparedState,
  dynamicInputs: readonly ReviewComparisonDynamicInput[],
  identity: string,
): boolean {
  if (
    !reviewComparisonUsesExactResolution(selection) ||
    !COMPARISON_RESOLUTION_ID_PATTERN.test(identity) ||
    dynamicInputs.length > 2 ||
    (selection.scope !== undefined && (!endpointHasScopeWitness(basis) || !endpointHasScopeWitness(comparedState))) ||
    identity !== reviewComparisonResolutionIdentity(selection, basis, comparedState, dynamicInputs)
  ) {
    return false;
  }

  if (selection.kind === 'revision-pair') {
    if (!isRevisionComparisonEndpoint(basis) || !isRevisionComparisonEndpoint(comparedState)) {
      return false;
    }
    const basisInput = dynamicInputs.find(input => input.role === 'basis');
    const comparedInput = dynamicInputs.find(input => input.role === 'compared');
    const expectedRoles = [
      ...(selection.basis.kind === 'local-ref' ? ['basis' as const] : []),
      ...(selection.compared.kind === 'local-ref' ? ['compared' as const] : []),
    ];
    return (
      JSON.stringify(dynamicInputs.map(input => input.role)) === JSON.stringify(expectedRoles) &&
      selectedEndpointMatches(selection.basis, basis, basisInput) &&
      selectedEndpointMatches(selection.compared, comparedState, comparedInput) &&
      basis.objectFormat === comparedState.objectFormat
    );
  }

  if (selection.kind === 'revision-to-index' || selection.kind === 'revision-to-working-state') {
    if (
      !isRevisionComparisonEndpoint(basis) ||
      (selection.kind === 'revision-to-index'
        ? !isReviewComparisonIndexEndpoint(comparedState)
        : !isReviewComparisonWorkingStateEndpoint(comparedState))
    ) {
      return false;
    }
    const basisInput = dynamicInputs.find(input => input.role === 'basis');
    const expectedRoles = selection.basis.kind === 'local-ref' ? ['basis' as const] : [];
    return (
      JSON.stringify(dynamicInputs.map(input => input.role)) === JSON.stringify(expectedRoles) &&
      selectedEndpointMatches(selection.basis, basis, basisInput) &&
      'objectFormat' in comparedState &&
      basis.objectFormat === comparedState.objectFormat
    );
  }

  const input = dynamicInputs[0];
  if (selection.kind === 'local-ref-merge-base') {
    return (
      basis.kind === 'commit' &&
      isRevisionComparisonEndpoint(comparedState) &&
      comparedState.kind === 'commit' &&
      comparedState.selector === selection.comparedCommitIdentity &&
      comparedState.objectIdentity === selection.comparedCommitIdentity &&
      basis.selector === basis.objectIdentity &&
      dynamicInputs.length === 1 &&
      input?.role === 'merge-base-reference' &&
      input.reference === selection.selectedReference &&
      input.resolvedObjectKind === 'commit' &&
      input.objectFormat === basis.objectFormat &&
      comparedState.objectFormat === basis.objectFormat
    );
  }
  return (
    selection.kind === 'index-to-working-tree' &&
    isReviewComparisonIndexEndpoint(basis) &&
    isReviewComparisonWorkingTreeEndpoint(comparedState) &&
    dynamicInputs.length === 0 &&
    basis.objectFormat === comparedState.objectFormat
  );
}

export function comparisonResolutionFields(
  resolved: ResolvedReviewComparison,
  basis: ReviewComparisonBasis,
  comparedState: ReviewComparedState,
):
  | {
      readonly comparisonResolutionIdentity: ReviewComparisonResolutionIdentity;
      readonly comparisonDynamicInputs: readonly ReviewComparisonDynamicInput[];
    }
  | undefined {
  if (!resolved.exactResolution) return undefined;
  const comparisonDynamicInputs = deepFreeze([...resolved.comparisonDynamicInputs]);
  return {
    comparisonResolutionIdentity: reviewComparisonResolutionIdentity(
      resolved.selection,
      basis,
      comparedState,
      comparisonDynamicInputs,
    ),
    comparisonDynamicInputs,
  };
}
