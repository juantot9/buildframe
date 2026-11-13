import type { Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { GitInspectionError, type GitInspectionContext } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import {
  MAX_LFS_POINTER_BYTES,
  decorateAttributes,
  inspectGitlinkCheckout,
  modeFromStat,
  modeKind,
  parseLargeFilePointer,
  readWorkingSide,
  recognizeLargeFilePointers,
  safeSize,
  specialEntry,
  specialEntryKind,
  statKind,
} from './content.js';
import type { WorkspaceEvidenceLimits } from './contracts.js';
import {
  enumerateIndex,
  enumerateTree,
  enumerateUnstaged,
  enumerateUntracked,
  parseCommitDiff,
} from './enumeration.js';
import { inspectGitObjects, readGitObjects, runGit } from './inspection.js';
import type {
  AttributeSource,
  FileDraft,
  IndexRecord,
  PairedDraftPreparation,
  PairedEnumeration,
  PairedFacts,
  RawCommitDiffEntry,
  RawStatusEntry,
  ResolvedReviewComparison,
  SideDraft,
  TreeRecord,
  UntrackedEnumeration,
} from './internalTypes.js';
import { commitTreeIdentity } from './resolution.js';
import {
  MAX_SCOPED_MEMBERSHIP_PATHS,
  filterCommitDiffToScope,
  filterIndexEnumeration,
  filterTreeEnumeration,
  filterUnstagedEnumeration,
  finalizeRevisionScopeFingerprints,
  pairExactObjectRenames,
  prepareRevisionFileScope,
  requestedScopeEntries,
  resolveFileScope,
  scopeMembershipForPaths,
  scopedTreeCanonical,
  scopedUntrackedEnumeration,
} from './scope.js';
import { absolutePath } from './utils.js';
import { fileIdentity } from './views.js';

export async function enumeratePairedFacts(
  context: GitInspectionContext,
  resolved: ResolvedReviewComparison,
  limits: WorkspaceEvidenceLimits,
): Promise<PairedEnumeration> {
  const form = resolved.workingComparison;
  if (form === undefined) throw new GitInspectionError('invalid-comparison');
  const objectFormat = resolved.objectFormat;
  const requestedScope = requestedScopeEntries(resolved.selection);
  const maximumFiles = requestedScope === undefined ? limits.maxManifestFiles : MAX_SCOPED_MEMBERSHIP_PATHS;
  const emptyIgnored: UntrackedEnumeration = {
    paths: [],
    nestedRepositories: [],
    canonical: Buffer.alloc(0),
  };

  const fullIndex = await enumerateIndex(context, limits, maximumFiles);
  if (form.kind === 'index-to-working-tree') {
    const fullUnstaged = await enumerateUnstaged(context, limits, maximumFiles);
    if (requestedScope === undefined) {
      return {
        objectFormat,
        index: fullIndex,
        tree: null,
        untracked: null,
        unstaged: fullUnstaged,
        explicitIgnoredPaths: new Set(),
      };
    }
    const scope = resolveFileScope(
      requestedScope,
      fullIndex.records.map(record => record.path),
      [],
      false,
    );
    resolved.fileScope = scope;
    return {
      objectFormat,
      index: filterIndexEnumeration(fullIndex, scope.entries),
      tree: null,
      untracked: null,
      unstaged: filterUnstagedEnumeration(fullUnstaged, scope.entries),
      explicitIgnoredPaths: scope.explicitIgnoredPaths,
    };
  }

  const fullTree = await enumerateTree(
    context,
    form.basis.kind === 'commit'
      ? await commitTreeIdentity(context, form.basis.objectIdentity)
      : form.basis.objectIdentity,
    limits,
    maximumFiles,
  );
  if (form.kind === 'revision-to-index') {
    if (requestedScope === undefined) {
      return {
        objectFormat,
        index: fullIndex,
        tree: fullTree,
        untracked: null,
        unstaged: null,
        explicitIgnoredPaths: new Set(),
      };
    }
    const scope = resolveFileScope(
      requestedScope,
      [...fullTree.records.map(record => record.path), ...fullIndex.records.map(record => record.path)],
      [],
      false,
    );
    const tree = filterTreeEnumeration(fullTree, scope.entries);
    resolved.fileScope = scope;
    resolved.basisScopeFingerprint = sha256(scopedTreeCanonical(tree.records));
    return {
      objectFormat,
      index: filterIndexEnumeration(fullIndex, scope.entries),
      tree,
      untracked: null,
      unstaged: null,
      explicitIgnoredPaths: scope.explicitIgnoredPaths,
    };
  }

  const fullUntracked = await enumerateUntracked(context, limits, maximumFiles);
  const fullUnstaged = await enumerateUnstaged(context, limits, maximumFiles);
  const wantsIgnored = requestedScope?.some(entry => entry.inclusion === 'include-ignored') ?? false;
  const ignored = wantsIgnored ? await enumerateUntracked(context, limits, maximumFiles, true) : emptyIgnored;
  if (requestedScope === undefined) {
    return {
      objectFormat,
      index: fullIndex,
      tree: fullTree,
      untracked: fullUntracked,
      unstaged: fullUnstaged,
      explicitIgnoredPaths: new Set(),
    };
  }
  const scope = resolveFileScope(
    requestedScope,
    [
      ...fullTree.records.map(record => record.path),
      ...fullIndex.records.map(record => record.path),
      ...fullUntracked.paths,
    ],
    ignored.paths,
    true,
  );
  const tree = filterTreeEnumeration(fullTree, scope.entries);
  resolved.fileScope = scope;
  resolved.basisScopeFingerprint = sha256(scopedTreeCanonical(tree.records));
  return {
    objectFormat,
    index: filterIndexEnumeration(fullIndex, scope.entries),
    tree,
    untracked: scopedUntrackedEnumeration(fullUntracked, ignored, scope),
    unstaged: filterUnstagedEnumeration(fullUnstaged, scope.entries),
    explicitIgnoredPaths: scope.explicitIgnoredPaths,
  };
}

export async function preparePairedDrafts(
  context: GitInspectionContext,
  resolved: ResolvedReviewComparison,
  enumeration: PairedEnumeration,
  limits: WorkspaceEvidenceLimits,
): Promise<PairedDraftPreparation> {
  const form = resolved.workingComparison;
  if (
    form === undefined ||
    enumeration.index === null ||
    (form.kind !== 'index-to-working-tree' && enumeration.tree === null) ||
    (form.kind === 'revision-to-working-state' && (enumeration.untracked === null || enumeration.unstaged === null))
  ) {
    throw new GitInspectionError('invalid-comparison');
  }
  const format = enumeration.objectFormat;
  const basisSource: 'commit' | 'tree' | null =
    form.kind === 'index-to-working-tree' ? null : form.basis.kind === 'commit' ? 'commit' : 'tree';

  const treeByPath = new Map<string, TreeRecord>();
  if (enumeration.tree !== null) {
    for (const record of enumeration.tree.records) {
      treeByPath.set(record.path.toString('hex'), record);
    }
  }
  const indexByPath = new Map<string, { stage0?: IndexRecord; unmerged: boolean }>();
  for (const record of enumeration.index.records) {
    const key = record.path.toString('hex');
    const entry = indexByPath.get(key) ?? { unmerged: false };
    if (record.stage === 0) entry.stage0 = record;
    else entry.unmerged = true;
    indexByPath.set(key, entry);
  }
  const untrackedPaths = new Set<string>((enumeration.untracked?.paths ?? []).map(item => item.toString('hex')));

  const paths = new Map<string, Buffer>();
  const addPath = (item: Buffer): void => {
    paths.set(item.toString('hex'), item);
  };
  for (const record of treeByPath.values()) addPath(record.path);
  for (const key of indexByPath.keys()) {
    addPath(Buffer.from(key, 'hex'));
  }
  for (const item of enumeration.untracked?.paths ?? []) addPath(item);
  const scopePaths = [...paths.values()].sort((left, right) => Buffer.compare(left, right));
  if (scopePaths.length > limits.maxManifestFiles) {
    throw new GitInspectionError('manifest-file-limit');
  }

  const objectIds = [
    ...[...treeByPath.values()].map(record => record.oid),
    ...[...indexByPath.values()]
      .map(entry => entry.stage0?.oid)
      .filter((value): value is string => value !== undefined),
  ];
  const metadata = await inspectGitObjects(context, objectIds);

  const objectSide = (
    objectId: string,
    mode: string,
    pathBytes: Buffer,
    evidenceSource: SideDraft['evidenceSource'],
    attributeSource: AttributeSource,
    unmerged: boolean,
  ): SideDraft => {
    if (unmerged) {
      return {
        pathBytes,
        kind: 'unknown',
        gitMode: '000000',
        byteLength: null,
        evidenceSource,
        attributeSource,
        capturePlanned: false,
        classification: 'unknown',
        contentAvailability: 'unavailable',
        contentLimitation: 'unmerged-index',
      };
    }
    const object = metadata.get(objectId);
    const missing = object?.missing ?? true;
    const kind = modeKind(mode, object?.objectType);
    const missingContent = missing && kind !== 'gitlink';
    const objectIdentity = deepFreeze({ algorithm: format, value: objectId });
    return {
      pathBytes,
      kind,
      gitMode: mode,
      byteLength: kind === 'gitlink' ? null : (object?.byteLength ?? null),
      evidenceSource,
      objectIdentity,
      objectId,
      attributeSource,
      capturePlanned: false,
      classification: 'unknown',
      contentAvailability: kind === 'gitlink' || missingContent ? 'unavailable' : 'not-captured',
      ...(kind === 'gitlink'
        ? {
            contentLimitation: 'unsupported-file-kind' as const,
            gitlink: deepFreeze({ objectIdentity }),
          }
        : {}),
      ...(missingContent
        ? {
            contentLimitation: 'missing-object' as const,
            objectAvailability: 'missing' as const,
          }
        : {}),
    };
  };

  const workingDiskSide = async (
    pathBytes: Buffer,
    indexRecord: IndexRecord | undefined,
  ): Promise<SideDraft | undefined> => {
    const filename = absolutePath(context.checkout, pathBytes);
    let stat: Stats | undefined;
    try {
      stat = await lstat(filename);
    } catch {
      // Interpreted from the index facts below.
    }
    if (indexRecord?.skipWorktree === true && stat === undefined) {
      const side = objectSide(
        indexRecord.oid,
        indexRecord.mode,
        pathBytes,
        'working-tree',
        { kind: 'working-tree' },
        false,
      );
      side.sparseAbsence = deepFreeze({
        indexFlag: 'skip-worktree',
        workingTree: 'intentionally-absent',
      });
      side.pointerObjectId = indexRecord.oid;
      return side;
    }
    if (indexRecord?.mode === '160000') {
      const objectIdentity = deepFreeze({ algorithm: format, value: indexRecord.oid });
      const checkout = await inspectGitlinkCheckout(filename, limits);
      return {
        pathBytes,
        kind: 'gitlink',
        gitMode: '160000',
        byteLength: null,
        evidenceSource: 'working-tree',
        objectIdentity,
        workingPath: filename,
        pointerObjectId: indexRecord.oid,
        attributeSource: { kind: 'working-tree' },
        capturePlanned: false,
        classification: 'unknown',
        contentAvailability: 'unavailable',
        contentLimitation: 'unsupported-file-kind',
        gitlink: deepFreeze({ objectIdentity, checkout }),
      };
    }
    if (stat === undefined) return undefined;
    const kind = statKind(stat);
    return {
      pathBytes,
      kind,
      gitMode: modeFromStat(stat),
      byteLength: kind === 'special' ? null : safeSize(stat.size),
      evidenceSource: 'working-tree',
      workingPath: filename,
      ...(indexRecord === undefined ? {} : { pointerObjectId: indexRecord.oid }),
      attributeSource: { kind: 'working-tree' },
      capturePlanned: false,
      classification: 'unknown',
      contentAvailability: kind === 'special' ? 'unavailable' : 'not-captured',
      ...(kind === 'special'
        ? {
            contentLimitation: 'unsupported-file-kind' as const,
            specialEntry: specialEntry(stat),
          }
        : {}),
    };
  };

  const drafts: FileDraft[] = [];
  const factDraftByPath = new Map<string, FileDraft>();

  for (const pathBytes of scopePaths) {
    const key = pathBytes.toString('hex');
    const treeRecord = treeByPath.get(key);
    const indexEntry = indexByPath.get(key);
    const untracked = untrackedPaths.has(key);
    const unstagedRecord = enumeration.unstaged?.paths.get(key);

    const stagedEqual =
      treeRecord !== undefined &&
      indexEntry?.stage0 !== undefined &&
      !indexEntry.unmerged &&
      treeRecord.oid === indexEntry.stage0.oid &&
      treeRecord.mode === indexEntry.stage0.mode &&
      modeKind(treeRecord.mode) === modeKind(indexEntry.stage0.mode);
    if (form.kind === 'revision-to-index' && stagedEqual) continue;
    if (
      form.kind === 'index-to-working-tree' &&
      indexEntry !== undefined &&
      !indexEntry.unmerged &&
      unstagedRecord === undefined
    ) {
      continue;
    }
    if (form.kind === 'revision-to-working-state' && stagedEqual && !untracked && unstagedRecord === undefined) {
      continue;
    }

    let oldSide: SideDraft | undefined;
    let newSide: SideDraft | undefined;
    let indexCode = '.';
    let workingCode = '.';
    let isFactPath = false;

    const basisAttributes: AttributeSource = {
      kind: 'object',
      selector: form.kind === 'index-to-working-tree' ? '' : form.basis.objectIdentity,
    };
    if (form.kind === 'revision-to-index') {
      if (treeRecord !== undefined) {
        oldSide = objectSide(
          treeRecord.oid,
          treeRecord.mode,
          treeRecord.path,
          basisSource === 'tree' ? 'tree' : 'commit',
          basisAttributes,
          false,
        );
      }
      if (indexEntry !== undefined) {
        newSide = objectSide(
          indexEntry.stage0?.oid ?? '',
          indexEntry.stage0?.mode ?? '000000',
          pathBytes,
          'index',
          { kind: 'index' },
          indexEntry.unmerged,
        );
      }
      if (indexEntry?.unmerged === true) {
        indexCode = 'U';
      } else if (treeRecord === undefined && indexEntry !== undefined) {
        indexCode = 'A';
      } else if (treeRecord !== undefined && indexEntry === undefined) {
        indexCode = 'D';
      } else if (
        treeRecord !== undefined &&
        indexEntry?.stage0 !== undefined &&
        (treeRecord.oid !== indexEntry.stage0.oid ||
          treeRecord.mode !== indexEntry.stage0.mode ||
          modeKind(treeRecord.mode) !== modeKind(indexEntry.stage0.mode))
      ) {
        indexCode = modeKind(treeRecord.mode) === modeKind(indexEntry.stage0.mode) ? 'M' : 'T';
      }
    } else if (form.kind === 'index-to-working-tree') {
      if (indexEntry !== undefined) {
        oldSide = objectSide(
          indexEntry.stage0?.oid ?? '',
          indexEntry.stage0?.mode ?? '000000',
          pathBytes,
          'index',
          { kind: 'index' },
          indexEntry.unmerged,
        );
        newSide = await workingDiskSide(pathBytes, indexEntry.stage0);
        if (indexEntry.unmerged) {
          indexCode = 'U';
          workingCode = newSide === undefined ? 'D' : 'M';
          isFactPath = true;
        } else if (unstagedRecord !== undefined) {
          workingCode = unstagedRecord.deleted ? 'D' : 'M';
          if (newSide?.sparseAbsence !== undefined) workingCode = '.';
          else if (newSide?.gitlink?.checkout?.availability === 'unavailable') {
            workingCode = 'M';
          } else if (newSide !== undefined && modeKind(indexEntry.stage0?.mode ?? '000000') !== newSide.kind) {
            workingCode = 'T';
          }
          isFactPath = true;
        }
      }
    } else {
      // revision-to-working-state
      if (treeRecord !== undefined) {
        oldSide = objectSide(
          treeRecord.oid,
          treeRecord.mode,
          treeRecord.path,
          basisSource === 'tree' ? 'tree' : 'commit',
          basisAttributes,
          false,
        );
      }
      if (untracked && indexEntry === undefined) {
        newSide = await workingDiskSide(pathBytes, undefined);
        indexCode = '?';
        workingCode = '?';
        isFactPath = true;
      } else if (unstagedRecord !== undefined && indexEntry !== undefined) {
        newSide =
          unstagedRecord.deleted && indexEntry.stage0?.skipWorktree !== true && indexEntry.stage0?.mode !== '160000'
            ? undefined
            : await workingDiskSide(pathBytes, indexEntry.stage0);
        workingCode = unstagedRecord.deleted ? 'D' : 'M';
        if (newSide?.sparseAbsence !== undefined) workingCode = '.';
        else if (newSide?.gitlink?.checkout?.availability === 'unavailable') {
          workingCode = 'M';
        }
        isFactPath = true;
      } else if (indexEntry?.stage0 !== undefined) {
        newSide =
          indexEntry.stage0.skipWorktree || indexEntry.stage0.mode === '160000'
            ? await workingDiskSide(pathBytes, indexEntry.stage0)
            : objectSide(
                indexEntry.stage0.oid,
                indexEntry.stage0.mode,
                pathBytes,
                'working-tree',
                { kind: 'working-tree' },
                false,
              );
        if (newSide !== undefined && newSide.pointerObjectId === undefined) {
          newSide.pointerObjectId = indexEntry.stage0.oid;
        }
      }
      if (indexEntry?.unmerged === true) {
        indexCode = 'U';
      } else if (treeRecord === undefined && indexEntry?.stage0 !== undefined) {
        indexCode = 'A';
      } else if (treeRecord !== undefined && indexEntry === undefined) {
        indexCode = 'D';
      } else if (
        treeRecord !== undefined &&
        indexEntry?.stage0 !== undefined &&
        (treeRecord.oid !== indexEntry.stage0.oid ||
          treeRecord.mode !== indexEntry.stage0.mode ||
          modeKind(treeRecord.mode) !== modeKind(indexEntry.stage0.mode))
      ) {
        indexCode = modeKind(treeRecord.mode) === modeKind(indexEntry.stage0.mode) ? 'M' : 'T';
      }
      if (newSide !== undefined && workingCode === 'M' && oldSide === undefined) {
        workingCode = 'A';
      }
      if (newSide !== undefined && oldSide !== undefined && workingCode === 'M' && oldSide.kind !== newSide.kind) {
        workingCode = 'T';
      }
    }

    const raw: RawStatusEntry = {
      recordKind: 'ordinary',
      indexCode,
      workingCode,
      headMode: oldSide?.gitMode ?? '000000',
      indexMode: indexEntry?.stage0?.mode ?? '000000',
      workingMode: newSide?.gitMode ?? '000000',
      headObject: oldSide?.objectId ?? null,
      indexObject: indexEntry?.stage0?.oid ?? null,
      path: Buffer.from(pathBytes),
      oldPath: null,
      renameKind: null,
    };
    const scopeMembership = scopeMembershipForPaths(resolved.fileScope, oldSide?.pathBytes, newSide?.pathBytes);
    const draft: FileDraft = {
      raw,
      fileIdentity: fileIdentity(raw),
      ...(oldSide === undefined ? {} : { oldSide }),
      ...(newSide === undefined ? {} : { newSide }),
      ...(scopeMembership === undefined ? {} : { scopeMembership }),
    };
    drafts.push(draft);
    if (isFactPath) factDraftByPath.set(key, draft);
  }

  const factPaths = [
    ...new Map(
      [
        ...factDraftByPath.keys(),
        ...enumeration.index.records
          .filter(record => record.skipWorktree || record.mode === '160000')
          .map(record => record.path.toString('hex')),
      ].map(key => [key, Buffer.from(key, 'hex')] as const),
    ).values(),
  ].sort((left, right) => Buffer.compare(left, right));
  await decorateAttributes(context, drafts, limits);
  await recognizeLargeFilePointers(context, drafts, metadata);
  return { drafts, factPaths, scopePaths };
}

export async function freshWorkingFacts(
  context: GitInspectionContext,
  enumeration: PairedEnumeration,
  workingState: boolean,
  limits: WorkspaceEvidenceLimits,
): Promise<PairedFacts> {
  const parts: Buffer[] = [];
  let remaining = limits.maxVerifiedContentBytes;
  let digestComplete = true;
  const factPaths = new Map<string, Buffer>();
  const indexByPath = new Map<string, IndexRecord>();
  const addFact = (item: Buffer): void => {
    factPaths.set(item.toString('hex'), item);
  };
  for (const record of enumeration.index?.records ?? []) {
    if (record.stage !== 0) continue;
    indexByPath.set(record.path.toString('hex'), record);
    if (record.skipWorktree || record.mode === '160000') addFact(record.path);
  }
  for (const record of enumeration.unstaged?.paths.values() ?? []) {
    addFact(record.path);
  }
  if (workingState) {
    for (const item of enumeration.untracked?.paths ?? []) addFact(item);
  }
  const sorted = [...factPaths.values()].sort((left, right) => Buffer.compare(left, right));

  const attributeDrafts: FileDraft[] = sorted.map(item => {
    const side: SideDraft = {
      pathBytes: item,
      kind: 'unknown',
      gitMode: '000000',
      byteLength: null,
      evidenceSource: 'working-tree',
      attributeSource: { kind: 'working-tree' },
      capturePlanned: false,
      classification: 'unknown',
      contentAvailability: 'not-captured',
    };
    const raw: RawStatusEntry = {
      recordKind: 'ordinary',
      indexCode: '.',
      workingCode: '.',
      headMode: '000000',
      indexMode: '000000',
      workingMode: '000000',
      headObject: null,
      indexObject: null,
      path: item,
      oldPath: null,
      renameKind: null,
    };
    return { raw, fileIdentity: fileIdentity(raw), newSide: side };
  });
  await decorateAttributes(context, attributeDrafts, limits);
  const filterByPath = new Map(
    attributeDrafts.map(draft => [draft.raw.path.toString('hex'), draft.newSide?.filterDriver] as const),
  );
  const lfsIndexObjects = [
    ...new Set(
      sorted.flatMap(item => {
        const record = indexByPath.get(item.toString('hex'));
        return filterByPath.get(item.toString('hex')) === 'lfs' && record !== undefined && record.mode.startsWith('100')
          ? [record.oid]
          : [];
      }),
    ),
  ];
  const lfsMetadata = await inspectGitObjects(context, lfsIndexObjects);
  const readablePointers = lfsIndexObjects.filter(oid => {
    const item = lfsMetadata.get(oid);
    return (
      item?.missing === false &&
      item.objectType === 'blob' &&
      item.byteLength !== null &&
      item.byteLength <= MAX_LFS_POINTER_BYTES
    );
  });
  const lfsObjectBytes =
    readablePointers.length === 0
      ? new Map<string, Buffer>()
      : await readGitObjects(context, readablePointers, readablePointers.length * MAX_LFS_POINTER_BYTES);

  for (const rawPath of sorted) {
    const key = rawPath.toString('hex');
    const filename = absolutePath(context.checkout, rawPath);
    const indexRecord = indexByPath.get(key);
    let stat: Stats | undefined;
    let statFailure: string | undefined;
    try {
      stat = await lstat(filename);
    } catch (cause) {
      statFailure = cause instanceof Error ? ((cause as NodeJS.ErrnoException).code ?? 'other') : 'other';
    }

    if (stat === undefined) {
      if (indexRecord?.skipWorktree === true && statFailure === 'ENOENT') {
        parts.push(Buffer.from(`s ${indexRecord.mode} ${indexRecord.oid}\0`, 'ascii'), rawPath, Buffer.from([0]));
        continue;
      }
      if (indexRecord?.mode === '160000') {
        const checkout = await inspectGitlinkCheckout(filename, limits);
        parts.push(
          Buffer.from(`g ${indexRecord.oid} ${JSON.stringify(checkout)}\0`, 'utf8'),
          rawPath,
          Buffer.from([0]),
        );
        digestComplete = false;
        continue;
      }
      parts.push(
        Buffer.from(statFailure === 'ENOENT' ? 'a - - - -\0' : `u ${statFailure ?? 'other'}\0`, 'ascii'),
        rawPath,
        Buffer.from([0]),
      );
      if (statFailure !== 'ENOENT' || enumeration.unstaged?.paths.get(key)?.deleted !== true) {
        digestComplete = false;
      }
      continue;
    }

    if (indexRecord?.mode === '160000') {
      const checkout = await inspectGitlinkCheckout(filename, limits);
      parts.push(Buffer.from(`g ${indexRecord.oid} ${JSON.stringify(checkout)}\0`, 'utf8'), rawPath, Buffer.from([0]));
      if (checkout.availability === 'unavailable') digestComplete = false;
      continue;
    }

    const kind = statKind(stat);
    const gitMode = modeFromStat(stat);
    if (kind === 'special') {
      parts.push(Buffer.from(`p special ${gitMode} - ${specialEntryKind(stat)}\0`, 'ascii'), rawPath, Buffer.from([0]));
      continue;
    }

    const byteLength = safeSize(stat.size);
    let digest: string | null = null;
    if (
      (kind === 'regular' || kind === 'symlink') &&
      byteLength !== null &&
      byteLength <= limits.maxVerifiedFileBytes &&
      byteLength <= remaining
    ) {
      remaining -= byteLength;
      const side: SideDraft = {
        pathBytes: rawPath,
        kind,
        gitMode,
        byteLength,
        evidenceSource: 'working-tree',
        workingPath: filename,
        capturePlanned: false,
        classification: 'unknown',
        contentAvailability: 'not-captured',
      };
      const result = await readWorkingSide(side, limits.maxVerifiedFileBytes);
      if (result.status === 'read') {
        digest = result.digest;
      } else {
        digestComplete = false;
      }
    } else {
      digestComplete = false;
    }

    const filter = filterByPath.get(key);
    if (filter !== undefined) {
      let supported = false;
      if (filter === 'lfs' && indexRecord !== undefined && digest !== null) {
        const pointerBytes = lfsObjectBytes.get(indexRecord.oid);
        const pointer = pointerBytes === undefined ? undefined : parseLargeFilePointer(pointerBytes);
        supported =
          pointer !== undefined &&
          ((byteLength === pointer.bytes.byteLength && digest === pointer.pointerIdentity.value) ||
            (byteLength === pointer.payloadByteLength && digest === pointer.payloadIdentity.value));
      }
      if (!supported) digestComplete = false;
    }
    parts.push(
      Buffer.from(`p ${kind} ${gitMode} ${byteLength ?? '-'} ${digest ?? 'x'}\0`, 'ascii'),
      rawPath,
      Buffer.from([0]),
    );
  }
  return {
    scopePaths: [],
    factPaths: sorted,
    canonical: Buffer.concat(parts),
    entryCount: 0,
    digestComplete,
  };
}

export async function inspectResolvedReviewComparison(
  context: GitInspectionContext,
  resolved: ResolvedReviewComparison,
  limits: WorkspaceEvidenceLimits,
): Promise<readonly RawCommitDiffEntry[]> {
  if (resolved.workingComparison !== undefined || resolved.compared === undefined || resolved.basis === undefined) {
    throw new GitInspectionError('invalid-comparison');
  }
  const basisEndpoint = resolved.basis;
  const comparedEndpoint = resolved.compared;
  const scope = await prepareRevisionFileScope(context, resolved, limits);
  const maximumFiles = scope === undefined ? limits.maxManifestFiles : MAX_SCOPED_MEMBERSHIP_PATHS;
  const argumentsFor = (rename: string): readonly string[] => [
    'diff-tree',
    '-r',
    '--raw',
    '-z',
    '--no-abbrev',
    rename,
    '--no-commit-id',
    ...(resolved.rootComparison ? ['--root'] : []),
    ...(basisEndpoint === null ? [] : [basisEndpoint.objectIdentity]),
    comparedEndpoint.objectIdentity,
    '--',
  ];
  // Enumerate without similarity first: this needs tree structure and object
  // identities, but never blob content. Missing blobs therefore degrade only
  // their own side instead of erasing complete sibling entries.
  const exact = await runGit(context, argumentsFor('--no-renames'), {
    maxStdoutBytes: limits.maxManifestBytes,
  });
  const parsedExactEntries = parseCommitDiff(exact.stdout, maximumFiles);
  if (scope !== undefined) {
    let scopedEntries: readonly RawCommitDiffEntry[];
    try {
      const derived = await runGit(context, argumentsFor('--find-renames=50%'), {
        maxStdoutBytes: limits.maxManifestBytes,
      });
      scopedEntries = filterCommitDiffToScope(parseCommitDiff(derived.stdout, maximumFiles), scope, limits);
    } catch {
      // Exact object identity still proves a bounded crossing rename when
      // similarity evidence is unavailable; ambiguous cases stay degraded.
      scopedEntries = filterCommitDiffToScope(pairExactObjectRenames(parsedExactEntries), scope, limits);
    }
    finalizeRevisionScopeFingerprints(resolved, scopedEntries);
    return scopedEntries;
  }
  const exactEntries = filterCommitDiffToScope(parsedExactEntries, undefined, limits);
  const metadata = await inspectGitObjects(
    context,
    exactEntries.flatMap(entry => [
      ...(entry.oldObject === null || entry.oldMode === '160000' ? [] : [entry.oldObject]),
      ...(entry.newObject === null || entry.newMode === '160000' ? [] : [entry.newObject]),
    ]),
  );
  if ([...metadata.values()].some(item => item.missing)) return exactEntries;
  try {
    const derived = await runGit(context, argumentsFor('--find-renames=50%'), {
      maxStdoutBytes: limits.maxManifestBytes,
    });
    return filterCommitDiffToScope(parseCommitDiff(derived.stdout, maximumFiles), scope, limits);
  } catch {
    return exactEntries;
  }
}
