import { decodeBytesBase64 } from '../bytesBase64.js';
import { GitInspectionError, type GitInspectionContext } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type { EvidenceScopeMembership, ReviewComparisonSelection, WorkspaceEvidenceLimits } from './contracts.js';
import { commitEntriesFingerprint, enumerateTree, indexCanonical } from './enumeration.js';
import type {
  IndexEnumeration,
  RawCommitDiffEntry,
  ResolvedFileScope,
  ResolvedReviewComparison,
  ResolvedScopeEntry,
  TreeEnumeration,
  TreeRecord,
  UnstagedEnumeration,
  UnstagedRecord,
  UntrackedEnumeration,
} from './internalTypes.js';
import { ComparisonResolutionError, commitTreeIdentity } from './resolution.js';
import { evidencePath } from './views.js';

export const MAX_SCOPED_MEMBERSHIP_PATHS = 250_000;

export function requestedScopeEntries(selection: ReviewComparisonSelection): readonly ResolvedScopeEntry[] | undefined {
  return selection.scope?.entries.map(entry => ({
    path: decodeBytesBase64(entry.pathBytesBase64),
    inclusion: entry.inclusion,
  }));
}

function pathMatchesScopeEntry(pathBytes: Buffer, scopePath: Buffer): boolean {
  return (
    pathBytes.equals(scopePath) ||
    (pathBytes.byteLength > scopePath.byteLength &&
      pathBytes[scopePath.byteLength] === 0x2f &&
      pathBytes.subarray(0, scopePath.byteLength).equals(scopePath))
  );
}

function scopeMatchesPath(
  entries: readonly ResolvedScopeEntry[],
  pathBytes: Buffer,
  includeIgnoredOnly = false,
): boolean {
  return entries.some(
    entry =>
      (!includeIgnoredOnly || entry.inclusion === 'include-ignored') && pathMatchesScopeEntry(pathBytes, entry.path),
  );
}

export function resolveFileScope(
  entries: readonly ResolvedScopeEntry[],
  ordinaryPaths: readonly Buffer[],
  ignoredPaths: readonly Buffer[],
  allowIgnored: boolean,
): ResolvedFileScope {
  for (const entry of entries) {
    const ordinary = ordinaryPaths.some(item => pathMatchesScopeEntry(item, entry.path));
    const ignored =
      entry.inclusion === 'include-ignored' && ignoredPaths.some(item => pathMatchesScopeEntry(item, entry.path));
    if (!ordinary && !ignored) {
      if (entry.inclusion === 'include-ignored' && !allowIgnored) {
        throw new ComparisonResolutionError('scope-ignored-unavailable');
      }
      throw new ComparisonResolutionError('scope-path-not-found');
    }
  }
  const explicitIgnoredPaths = new Set(
    ignoredPaths.filter(item => scopeMatchesPath(entries, item, true)).map(item => item.toString('hex')),
  );
  return { entries, explicitIgnoredPaths };
}

export function scopeMembershipForPaths(
  scope: ResolvedFileScope | undefined,
  oldPath: Buffer | undefined,
  newPath: Buffer | undefined,
): readonly EvidenceScopeMembership[] | undefined {
  if (scope === undefined) return undefined;
  const ignoredNew = newPath !== undefined && scope.explicitIgnoredPaths.has(newPath.toString('hex'));
  const memberships: EvidenceScopeMembership[] = [];
  for (const entry of scope.entries) {
    const matchesOld = oldPath !== undefined && pathMatchesScopeEntry(oldPath, entry.path);
    const matchesNew =
      newPath !== undefined &&
      pathMatchesScopeEntry(newPath, entry.path) &&
      (!ignoredNew || entry.inclusion === 'include-ignored');
    if (!matchesOld && !matchesNew) continue;
    const common = {
      selectionPath: evidencePath(entry.path),
      selectionKind:
        (oldPath?.equals(entry.path) ?? false) || (newPath?.equals(entry.path) ?? false)
          ? ('file' as const)
          : ('directory' as const),
    };
    if (ignoredNew && matchesNew) {
      if (matchesOld) {
        memberships.push(
          deepFreeze({
            ...common,
            inclusion: 'ordinary' as const,
            matchedSides: deepFreeze(['old'] as const),
          }),
        );
      }
      memberships.push(
        deepFreeze({
          ...common,
          inclusion: 'explicit-ignored' as const,
          matchedSides: deepFreeze(['new'] as const),
        }),
      );
      continue;
    }
    memberships.push(
      deepFreeze({
        ...common,
        inclusion: 'ordinary' as const,
        matchedSides: deepFreeze([...(matchesOld ? ['old' as const] : []), ...(matchesNew ? ['new' as const] : [])]),
      }),
    );
  }
  return deepFreeze(memberships);
}

export function scopedTreeCanonical(records: readonly TreeRecord[]): Buffer {
  const parts: Buffer[] = [Buffer.from('scope-tree\0', 'ascii')];
  for (const record of records) {
    parts.push(
      Buffer.from(`${record.mode} ${record.objectKind} ${record.oid}\0`, 'ascii'),
      record.path,
      Buffer.from([0]),
    );
  }
  return Buffer.concat(parts);
}

export function filterTreeEnumeration(tree: TreeEnumeration, entries: readonly ResolvedScopeEntry[]): TreeEnumeration {
  return {
    records: tree.records.filter(record => scopeMatchesPath(entries, record.path)),
  };
}

export function filterIndexEnumeration(
  index: IndexEnumeration,
  entries: readonly ResolvedScopeEntry[],
): IndexEnumeration {
  const records = index.records.filter(record => scopeMatchesPath(entries, record.path));
  const paths = new Set(records.map(record => record.path.toString('hex')));
  return {
    records,
    canonical: indexCanonical(records),
    entryCount: paths.size,
    unmergedPaths: new Set(records.filter(record => record.stage !== 0).map(record => record.path.toString('hex'))),
  };
}

export function filterUnstagedEnumeration(
  unstaged: UnstagedEnumeration,
  entries: readonly ResolvedScopeEntry[],
): UnstagedEnumeration {
  const records = [...unstaged.paths.values()].filter(record => scopeMatchesPath(entries, record.path));
  const paths = new Map<string, UnstagedRecord>();
  const parts: Buffer[] = [];
  for (const record of records) {
    paths.set(record.path.toString('hex'), record);
    parts.push(Buffer.from(`${record.deleted ? 'D' : 'M'}\0`, 'ascii'), record.path, Buffer.from([0]));
  }
  return { paths, canonical: Buffer.concat(parts) };
}

export function scopedUntrackedEnumeration(
  ordinary: UntrackedEnumeration,
  ignored: UntrackedEnumeration,
  scope: ResolvedFileScope,
): UntrackedEnumeration {
  const byPath = new Map<string, Buffer>();
  for (const item of ordinary.paths) {
    if (scopeMatchesPath(scope.entries, item)) {
      byPath.set(item.toString('hex'), item);
    }
  }
  for (const item of ignored.paths) {
    if (scope.explicitIgnoredPaths.has(item.toString('hex'))) {
      byPath.set(item.toString('hex'), item);
    }
  }
  const paths = [...byPath.values()].sort((left, right) => Buffer.compare(left, right));
  const nestedRepositories = ordinary.nestedRepositories.filter(item => scopeMatchesPath(scope.entries, item));
  const parts: Buffer[] = [];
  for (const item of paths) {
    parts.push(
      Buffer.from(scope.explicitIgnoredPaths.has(item.toString('hex')) ? 'ignored\0' : 'ordinary\0', 'ascii'),
      item,
      Buffer.from([0]),
    );
  }
  // A nested repository in scope is working-state movement, never manifest content.
  for (const item of nestedRepositories) {
    parts.push(Buffer.from('nested\0', 'ascii'), item, Buffer.from([0]));
  }
  return { paths, nestedRepositories, canonical: Buffer.concat(parts) };
}

export async function prepareRevisionFileScope(
  context: GitInspectionContext,
  resolved: ResolvedReviewComparison,
  limits: WorkspaceEvidenceLimits,
): Promise<ResolvedFileScope | undefined> {
  const requested = requestedScopeEntries(resolved.selection);
  if (requested === undefined) return undefined;
  if (resolved.compared === undefined || resolved.basis === undefined) {
    throw new GitInspectionError('invalid-comparison');
  }
  const comparedTree = await enumerateTree(
    context,
    resolved.compared.kind === 'commit'
      ? await commitTreeIdentity(context, resolved.compared.objectIdentity)
      : resolved.compared.objectIdentity,
    limits,
    MAX_SCOPED_MEMBERSHIP_PATHS,
  );
  const basisTree =
    resolved.basis === null
      ? { records: [] as readonly TreeRecord[] }
      : await enumerateTree(
          context,
          resolved.basis.kind === 'commit'
            ? await commitTreeIdentity(context, resolved.basis.objectIdentity)
            : resolved.basis.objectIdentity,
          limits,
          MAX_SCOPED_MEMBERSHIP_PATHS,
        );
  const scope = resolveFileScope(
    requested,
    [...basisTree.records.map(record => record.path), ...comparedTree.records.map(record => record.path)],
    [],
    false,
  );
  const scopedBasis = filterTreeEnumeration(basisTree, scope.entries);
  const scopedCompared = filterTreeEnumeration(comparedTree, scope.entries);
  resolved.fileScope = scope;
  resolved.basisScopeFingerprint = sha256(scopedTreeCanonical(scopedBasis.records));
  resolved.comparedScopeFingerprint = sha256(scopedTreeCanonical(scopedCompared.records));
  return scope;
}

export function finalizeRevisionScopeFingerprints(
  resolved: ResolvedReviewComparison,
  entries: readonly RawCommitDiffEntry[],
): void {
  if (
    resolved.fileScope === undefined ||
    resolved.basisScopeFingerprint === undefined ||
    resolved.comparedScopeFingerprint === undefined
  ) {
    return;
  }
  const comparison = commitEntriesFingerprint(entries);
  resolved.basisScopeFingerprint = sha256(`basis\0${resolved.basisScopeFingerprint}\0${comparison}`);
  resolved.comparedScopeFingerprint = sha256(`compared\0${resolved.comparedScopeFingerprint}\0${comparison}`);
}

export function pairExactObjectRenames(entries: readonly RawCommitDiffEntry[]): readonly RawCommitDiffEntry[] {
  const additions = new Map<string, RawCommitDiffEntry[]>();
  const deletions = new Map<string, RawCommitDiffEntry[]>();
  const key = (oid: string, mode: string): string => `${mode}:${oid}`;
  for (const entry of entries) {
    if (entry.oldObject === null && entry.newObject !== null) {
      const itemKey = key(entry.newObject, entry.newMode);
      additions.set(itemKey, [...(additions.get(itemKey) ?? []), entry]);
    } else if (entry.oldObject !== null && entry.newObject === null) {
      const itemKey = key(entry.oldObject, entry.oldMode);
      deletions.set(itemKey, [...(deletions.get(itemKey) ?? []), entry]);
    }
  }
  const consumed = new Set<RawCommitDiffEntry>();
  const paired: RawCommitDiffEntry[] = [];
  for (const [itemKey, removed] of deletions) {
    const added = additions.get(itemKey);
    if (removed.length !== 1 || added?.length !== 1) continue;
    const oldEntry = removed[0];
    const newEntry = added[0];
    if (oldEntry === undefined || newEntry === undefined) continue;
    consumed.add(oldEntry);
    consumed.add(newEntry);
    paired.push({
      oldMode: oldEntry.oldMode,
      newMode: newEntry.newMode,
      oldObject: oldEntry.oldObject,
      newObject: newEntry.newObject,
      path: newEntry.path,
      oldPath: oldEntry.path,
      renameKind: 'rename',
    });
  }
  return [...entries.filter(entry => !consumed.has(entry)), ...paired].sort((left, right) => {
    const byCurrent = Buffer.compare(left.path, right.path);
    return byCurrent !== 0 ? byCurrent : Buffer.compare(left.oldPath ?? left.path, right.oldPath ?? right.path);
  });
}

export function filterCommitDiffToScope(
  entries: readonly RawCommitDiffEntry[],
  scope: ResolvedFileScope | undefined,
  limits: WorkspaceEvidenceLimits,
): readonly RawCommitDiffEntry[] {
  const filtered =
    scope === undefined
      ? entries
      : entries.filter(
          entry =>
            scopeMatchesPath(scope.entries, entry.path) ||
            (entry.oldPath !== null && scopeMatchesPath(scope.entries, entry.oldPath)),
        );
  if (filtered.length > limits.maxManifestFiles) {
    throw new GitInspectionError('manifest-file-limit');
  }
  return filtered;
}
