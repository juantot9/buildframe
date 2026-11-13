import { decodeBytesBase64, encodeBytesBase64 } from '../bytesBase64.js';
import { deepFreeze } from '../recordCodec.js';
import type {
  ReviewComparisonFileScope,
  ReviewComparisonSelection,
  ReviewRevisionEndpointSelection,
} from './contracts.js';
import { FULL_OBJECT_ID_PATTERN, validateRelativePath } from './utils.js';

const MAX_REVIEW_SCOPE_ENTRIES = 64;

const MAX_REVIEW_SCOPE_PATH_BYTES = 4096;

const MAX_REVIEW_SCOPE_TOTAL_PATH_BYTES = 4096;

function validLegacyRevision(revision: unknown): revision is string {
  return (
    typeof revision === 'string' &&
    Buffer.byteLength(revision) >= 1 &&
    Buffer.byteLength(revision) <= 256 &&
    revision === revision.trim() &&
    /^[A-Za-z0-9._/@+][A-Za-z0-9._/@+/-]*$/u.test(revision) &&
    !revision.includes('..') &&
    !revision.includes('//') &&
    !revision.endsWith('.lock')
  );
}

export function validLocalReference(reference: unknown): reference is string {
  if (reference === 'HEAD') return true;
  if (
    typeof reference !== 'string' ||
    Buffer.byteLength(reference) < 11 ||
    Buffer.byteLength(reference) > 256 ||
    !['refs/heads/', 'refs/tags/', 'refs/remotes/'].some(prefix => reference.startsWith(prefix)) ||
    /[\u0000-\u0020\u007f~^:?*\\[]/u.test(reference) ||
    reference.includes('..') ||
    reference.includes('//') ||
    reference.includes('@{') ||
    reference.endsWith('/') ||
    reference.endsWith('.') ||
    reference.endsWith('.lock')
  ) {
    return false;
  }
  return reference
    .split('/')
    .every(
      component =>
        component.length > 0 && !component.startsWith('.') && !component.endsWith('.') && !component.endsWith('.lock'),
    );
}

function normalizeRevisionEndpointSelection(value: unknown): ReviewRevisionEndpointSelection {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Invalid exact Review revision endpoint');
  }
  const endpoint = value as Record<string, unknown>;
  if (
    endpoint.kind === 'object' &&
    Object.keys(endpoint).length === 3 &&
    (endpoint.objectKind === 'commit' || endpoint.objectKind === 'tree') &&
    typeof endpoint.objectIdentity === 'string' &&
    FULL_OBJECT_ID_PATTERN.test(endpoint.objectIdentity)
  ) {
    return deepFreeze({
      kind: 'object',
      objectKind: endpoint.objectKind,
      objectIdentity: endpoint.objectIdentity,
    });
  }
  if (
    endpoint.kind === 'local-ref' &&
    Object.keys(endpoint).length === 3 &&
    (endpoint.objectKind === 'commit' || endpoint.objectKind === 'tree') &&
    validLocalReference(endpoint.reference)
  ) {
    return deepFreeze({
      kind: 'local-ref',
      objectKind: endpoint.objectKind,
      reference: endpoint.reference,
    });
  }
  throw new TypeError('Invalid exact Review revision endpoint');
}

export function reviewComparisonUsesExactResolution(selection: ReviewComparisonSelection): boolean {
  return (
    selection.kind === 'revision-pair' ||
    selection.kind === 'local-ref-merge-base' ||
    selection.kind === 'revision-to-index' ||
    selection.kind === 'revision-to-working-state' ||
    selection.kind === 'index-to-working-tree'
  );
}

export function isPairedEndpointSelection(selection: ReviewComparisonSelection): boolean {
  return (
    selection.kind === 'revision-to-index' ||
    selection.kind === 'revision-to-working-state' ||
    selection.kind === 'index-to-working-tree'
  );
}

function caseCollisionKey(value: Buffer): string {
  try {
    return `utf8:${new TextDecoder('utf-8', { fatal: true }).decode(value).toLowerCase()}`;
  } catch {
    const folded = Buffer.from(value);
    for (let index = 0; index < folded.byteLength; index += 1) {
      const byte = folded[index] ?? 0;
      if (byte >= 0x41 && byte <= 0x5a) folded[index] = byte + 0x20;
    }
    return `bytes:${folded.toString('hex')}`;
  }
}

function normalizeReviewComparisonFileScope(value: unknown): ReviewComparisonFileScope {
  if (
    typeof value !== 'object' ||
    value === null ||
    Object.keys(value).length !== 2 ||
    !('kind' in value) ||
    value.kind !== 'exact-paths' ||
    !('entries' in value) ||
    !Array.isArray(value.entries) ||
    value.entries.length < 1 ||
    value.entries.length > MAX_REVIEW_SCOPE_ENTRIES
  ) {
    throw new TypeError('Invalid exact Review file scope');
  }
  const exactPaths = new Set<string>();
  const caseKeys = new Set<string>();
  let totalPathBytes = 0;
  const entries = value.entries.map(candidate => {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Object.keys(candidate).length !== 2 ||
      !('pathBytesBase64' in candidate) ||
      !('inclusion' in candidate) ||
      (candidate.inclusion !== 'ordinary' && candidate.inclusion !== 'include-ignored')
    ) {
      throw new TypeError('Invalid exact Review file scope entry');
    }
    const bytes = decodeBytesBase64(candidate.pathBytesBase64);
    totalPathBytes += bytes.byteLength;
    if (
      bytes.includes(0) ||
      bytes.byteLength > MAX_REVIEW_SCOPE_PATH_BYTES ||
      totalPathBytes > MAX_REVIEW_SCOPE_TOTAL_PATH_BYTES
    ) {
      throw new TypeError('Invalid exact Review file scope path');
    }
    try {
      validateRelativePath(bytes);
    } catch {
      throw new TypeError('Invalid exact Review file scope path');
    }
    const exactKey = bytes.toString('hex');
    const caseKey = caseCollisionKey(bytes);
    if (exactPaths.has(exactKey)) {
      throw new TypeError('Duplicate exact Review file scope path');
    }
    if (caseKeys.has(caseKey)) {
      throw new TypeError('Case-colliding exact Review file scope path');
    }
    exactPaths.add(exactKey);
    caseKeys.add(caseKey);
    return deepFreeze({
      pathBytesBase64: encodeBytesBase64(bytes),
      inclusion: candidate.inclusion,
    });
  });
  return deepFreeze({ kind: 'exact-paths', entries: deepFreeze(entries) });
}

function selectionScopeFields(selection: Record<string, unknown>): { readonly scope?: ReviewComparisonFileScope } {
  if (!Object.hasOwn(selection, 'scope')) return {};
  if (selection.scope === undefined) {
    throw new TypeError('Invalid exact Review file scope');
  }
  return { scope: normalizeReviewComparisonFileScope(selection.scope) };
}

function hasSelectionKeys(
  selection: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(selection);
  return (
    required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key))
  );
}

export function normalizeReviewComparisonSelection(value: unknown): ReviewComparisonSelection {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new TypeError('Unknown Review comparison selection');
  }
  const selection = value as Record<string, unknown>;
  const scope = selectionScopeFields(selection);
  if (selection.kind === 'last-commit' && hasSelectionKeys(selection, ['kind'], ['scope'])) {
    return deepFreeze({ kind: 'last-commit', ...scope });
  }
  if (selection.kind === 'head-ancestry') {
    if (
      !hasSelectionKeys(selection, ['kind', 'commitCount'], ['scope']) ||
      !Number.isSafeInteger(selection.commitCount) ||
      (selection.commitCount as number) < 1 ||
      (selection.commitCount as number) > 10_000
    ) {
      throw new TypeError('Commit count must be between 1 and 10,000');
    }
    return deepFreeze({
      kind: 'head-ancestry',
      commitCount: selection.commitCount as number,
      ...scope,
    });
  }
  if (selection.kind === 'commit' || selection.kind === 'commit-to-head') {
    const revision = selection.revision;
    const parentRevision = selection.parentRevision;
    if (
      !validLegacyRevision(revision) ||
      (selection.kind === 'commit-to-head' && !hasSelectionKeys(selection, ['kind', 'revision'], ['scope'])) ||
      (selection.kind === 'commit' &&
        !hasSelectionKeys(selection, ['kind', 'revision'], ['parentRevision', 'scope'])) ||
      (parentRevision !== undefined && !validLegacyRevision(parentRevision))
    ) {
      throw new TypeError('Revision must be one bounded local commit or ref name');
    }
    return deepFreeze({
      kind: selection.kind,
      revision,
      ...(selection.kind === 'commit' && parentRevision !== undefined ? { parentRevision } : {}),
      ...scope,
    });
  }
  if (selection.kind === 'revision-pair' && hasSelectionKeys(selection, ['kind', 'basis', 'compared'], ['scope'])) {
    return deepFreeze({
      kind: 'revision-pair',
      basis: normalizeRevisionEndpointSelection(selection.basis),
      compared: normalizeRevisionEndpointSelection(selection.compared),
      ...scope,
    });
  }
  if (
    selection.kind === 'local-ref-merge-base' &&
    hasSelectionKeys(selection, ['kind', 'selectedReference', 'comparedCommitIdentity'], ['scope']) &&
    validLocalReference(selection.selectedReference) &&
    typeof selection.comparedCommitIdentity === 'string' &&
    FULL_OBJECT_ID_PATTERN.test(selection.comparedCommitIdentity)
  ) {
    return deepFreeze({
      kind: 'local-ref-merge-base',
      selectedReference: selection.selectedReference,
      comparedCommitIdentity: selection.comparedCommitIdentity,
      ...scope,
    });
  }
  if (
    (selection.kind === 'revision-to-index' || selection.kind === 'revision-to-working-state') &&
    hasSelectionKeys(selection, ['kind', 'basis'], ['scope'])
  ) {
    return deepFreeze({
      kind: selection.kind,
      basis: normalizeRevisionEndpointSelection(selection.basis),
      ...scope,
    });
  }
  if (selection.kind === 'index-to-working-tree' && hasSelectionKeys(selection, ['kind'], ['scope'])) {
    return deepFreeze({ kind: 'index-to-working-tree', ...scope });
  }
  throw new TypeError('Unknown Review comparison selection');
}
