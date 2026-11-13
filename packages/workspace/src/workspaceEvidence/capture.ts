import type { Stats } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { GitInspectionError, type GitInspectionContext } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import {
  decorateAttributes,
  inspectGitlinkCheckout,
  modeFromStat,
  modeKind,
  readWorkingSide,
  recognizeLargeFilePointers,
  recordSideBytes,
  safeSize,
  specialEntry,
  specialEntryKind,
  statKind,
  streamRegularFile,
} from './content.js';
import type { CurrentChangedFile, CurrentChangesManifestSummary, WorkspaceEvidenceLimits } from './contracts.js';
import { inspectGitObjects, readGitObjects } from './inspection.js';
import type {
  FileDraft,
  IndexRecord,
  Inspection,
  RawCommitDiffEntry,
  RawStatusEntry,
  ResolvedFileScope,
  ResolvedRevisionEndpoint,
  SideDraft,
  WorkingBaseline,
} from './internalTypes.js';
import { scopeMembershipForPaths } from './scope.js';
import { absolutePath } from './utils.js';
import { capturedKey, fileIdentity, manifestDigest } from './views.js';

export async function prepareDrafts(
  context: GitInspectionContext,
  inspection: Inspection,
  limits: WorkspaceEvidenceLimits,
): Promise<readonly FileDraft[]> {
  const indexByPath = new Map<string, IndexRecord>();
  for (const record of inspection.index.records) {
    if (record.stage === 0) indexByPath.set(record.path.toString('hex'), record);
  }
  const objectIds = inspection.entries.flatMap(entry => [
    ...(entry.headObject === null ? [] : [entry.headObject]),
    ...(entry.indexObject === null ? [] : [entry.indexObject]),
  ]);
  const objectMetadata = await inspectGitObjects(context, objectIds);
  const drafts: FileDraft[] = [];

  const objectWorkingSide = (entry: RawStatusEntry, indexRecord: IndexRecord, sparse: boolean): SideDraft => {
    const metadata = objectMetadata.get(indexRecord.oid);
    const missing = metadata?.missing ?? true;
    const kind = modeKind(indexRecord.mode, metadata?.objectType);
    const missingContent = missing && kind !== 'gitlink';
    return {
      pathBytes: Buffer.from(entry.path),
      kind,
      gitMode: indexRecord.mode,
      byteLength: kind === 'gitlink' ? null : (metadata?.byteLength ?? null),
      evidenceSource: 'working-tree',
      objectIdentity: deepFreeze({
        algorithm: inspection.objectFormat,
        value: indexRecord.oid,
      }),
      objectId: indexRecord.oid,
      pointerObjectId: indexRecord.oid,
      attributeSource: { kind: 'working-tree' },
      capturePlanned: false,
      classification: 'unknown',
      contentAvailability: kind === 'gitlink' || missingContent ? 'unavailable' : 'not-captured',
      ...(kind === 'gitlink'
        ? {
            contentLimitation: 'unsupported-file-kind' as const,
            gitlink: deepFreeze({
              objectIdentity: deepFreeze({
                algorithm: inspection.objectFormat,
                value: indexRecord.oid,
              }),
              checkout: deepFreeze({
                availability: 'unavailable' as const,
                reason: 'not-present' as const,
              }),
            }),
          }
        : {}),
      ...(missingContent
        ? {
            contentLimitation: 'missing-object' as const,
            objectAvailability: 'missing' as const,
          }
        : {}),
      ...(sparse
        ? {
            sparseAbsence: deepFreeze({
              indexFlag: 'skip-worktree' as const,
              workingTree: 'intentionally-absent' as const,
            }),
          }
        : {}),
    };
  };

  for (const entry of inspection.entries) {
    const indexRecord = indexByPath.get(entry.path.toString('hex'));
    let raw = entry;
    let oldSide: SideDraft | undefined;
    if (entry.headObject !== null && entry.headMode !== '000000') {
      const metadata = objectMetadata.get(entry.headObject);
      const missing = metadata?.missing ?? true;
      const kind = modeKind(entry.headMode, metadata?.objectType);
      const missingContent = missing && kind !== 'gitlink';
      const objectIdentity = deepFreeze({
        algorithm: inspection.objectFormat,
        value: entry.headObject,
      });
      oldSide = {
        pathBytes: Buffer.from(entry.oldPath ?? entry.path),
        kind,
        gitMode: entry.headMode,
        byteLength: kind === 'gitlink' ? null : (metadata?.byteLength ?? null),
        evidenceSource: 'head',
        objectIdentity,
        objectId: entry.headObject,
        ...(inspection.headObject === null
          ? {}
          : {
              attributeSource: {
                kind: 'object' as const,
                selector: inspection.headObject,
              },
            }),
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
    }

    let newSide: SideDraft | undefined;
    const filename = absolutePath(context.checkout, entry.path);
    let diskStatus: Stats | undefined;
    try {
      diskStatus = await lstat(filename);
    } catch {
      // The exact failure is interpreted below from index and sparse facts.
    }
    const sparseAbsent = indexRecord?.skipWorktree === true && diskStatus === undefined;
    const expectedGitlink = indexRecord?.mode === '160000';
    if (sparseAbsent && indexRecord !== undefined) {
      newSide = objectWorkingSide(entry, indexRecord, true);
      if (raw.workingCode === 'D') raw = { ...raw, workingCode: '.' };
    } else if (expectedGitlink && indexRecord !== undefined) {
      const objectIdentity = deepFreeze({
        algorithm: inspection.objectFormat,
        value: indexRecord.oid,
      });
      const checkout = await inspectGitlinkCheckout(filename, limits);
      newSide = {
        pathBytes: Buffer.from(entry.path),
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
      if (checkout.availability === 'unavailable' && raw.workingCode === 'D') {
        raw = { ...raw, workingCode: 'M' };
      }
    } else if (diskStatus !== undefined) {
      const kind = statKind(diskStatus);
      const mode =
        kind === 'special'
          ? '000000'
          : entry.recordKind === 'untracked'
            ? modeFromStat(diskStatus)
            : entry.workingMode === '000000'
              ? modeFromStat(diskStatus)
              : entry.workingMode;
      newSide = {
        pathBytes: Buffer.from(entry.path),
        kind,
        gitMode: mode,
        byteLength: kind === 'special' ? null : safeSize(diskStatus.size),
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
              specialEntry: specialEntry(diskStatus),
            }
          : {}),
      };
    } else {
      const expectedPresent = entry.recordKind === 'untracked' || entry.workingMode !== '000000';
      if (expectedPresent) {
        newSide = {
          pathBytes: Buffer.from(entry.path),
          kind: modeKind(entry.workingMode),
          gitMode: entry.workingMode,
          byteLength: null,
          evidenceSource: 'working-tree',
          workingPath: filename,
          ...(indexRecord === undefined ? {} : { pointerObjectId: indexRecord.oid }),
          attributeSource: { kind: 'working-tree' },
          capturePlanned: false,
          classification: 'unknown',
          contentAvailability: 'unavailable',
          contentLimitation: 'read-failed',
        };
      }
    }

    drafts.push({
      raw,
      fileIdentity: fileIdentity(raw),
      ...(oldSide === undefined ? {} : { oldSide }),
      ...(newSide === undefined ? {} : { newSide }),
    });
  }
  await decorateAttributes(context, drafts, limits);
  await recognizeLargeFilePointers(context, drafts, objectMetadata);
  return drafts;
}

export async function prepareCommitDrafts(
  context: GitInspectionContext,
  entries: readonly RawCommitDiffEntry[],
  format: 'sha1' | 'sha256' | 'unknown',
  basisEndpoint: ResolvedRevisionEndpoint | null,
  comparedEndpoint: ResolvedRevisionEndpoint,
  limits: WorkspaceEvidenceLimits,
  scope?: ResolvedFileScope,
): Promise<readonly FileDraft[]> {
  const objects = entries.flatMap(entry =>
    [entry.oldObject, entry.newObject].filter((value): value is string => value !== null),
  );
  const metadata = await inspectGitObjects(context, objects);
  const drafts: FileDraft[] = [];
  for (const entry of entries) {
    const raw: RawStatusEntry = {
      recordKind: entry.renameKind === null ? 'ordinary' : 'rename',
      indexCode: '.',
      workingCode: '.',
      headMode: entry.oldMode,
      indexMode: entry.newMode,
      workingMode: entry.newMode,
      headObject: entry.oldObject,
      indexObject: entry.newObject,
      path: Buffer.from(entry.path),
      oldPath: entry.oldPath === null ? null : Buffer.from(entry.oldPath),
      renameKind: entry.renameKind,
    };
    const identity = fileIdentity(raw);
    const side = (
      objectIdentityValue: string | null,
      mode: string,
      pathBytes: Buffer,
      endpoint: ResolvedRevisionEndpoint | null,
    ): SideDraft | undefined => {
      if (objectIdentityValue === null || mode === '000000' || endpoint === null) {
        return undefined;
      }
      const object = metadata.get(objectIdentityValue);
      const missing = object?.missing ?? true;
      const kind = modeKind(mode, object?.objectType);
      const missingContent = missing && kind !== 'gitlink';
      const objectIdentity = deepFreeze({
        algorithm: format,
        value: objectIdentityValue,
      });
      return {
        pathBytes: Buffer.from(pathBytes),
        kind,
        gitMode: mode,
        byteLength: kind === 'gitlink' ? null : (object?.byteLength ?? null),
        evidenceSource: endpoint.kind,
        objectIdentity,
        objectId: objectIdentityValue,
        attributeSource: { kind: 'object', selector: endpoint.objectIdentity },
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
    const oldSide = side(entry.oldObject, entry.oldMode, entry.oldPath ?? entry.path, basisEndpoint);
    const newSide = side(entry.newObject, entry.newMode, entry.path, comparedEndpoint);
    const scopeMembership = scopeMembershipForPaths(
      scope,
      entry.oldObject === null ? undefined : (entry.oldPath ?? entry.path),
      entry.newObject === null ? undefined : entry.path,
    );
    drafts.push({
      raw,
      fileIdentity: identity,
      ...(oldSide === undefined ? {} : { oldSide }),
      ...(newSide === undefined ? {} : { newSide }),
      ...(scopeMembership === undefined ? {} : { scopeMembership }),
    });
  }
  await decorateAttributes(context, drafts, limits);
  await recognizeLargeFilePointers(context, drafts, metadata);
  return drafts;
}

export function planCapture(drafts: readonly FileDraft[], limits: WorkspaceEvidenceLimits): number {
  let remaining = limits.maxCapturedContentBytes;
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      if (side === undefined || side.contentAvailability === 'unavailable') continue;
      if (side.kind !== 'regular' && side.kind !== 'symlink') {
        side.contentAvailability = 'not-captured';
        side.contentLimitation = 'unsupported-file-kind';
        continue;
      }
      const size = side.byteLength;
      if (size === null) {
        side.contentAvailability = 'unavailable';
        side.contentLimitation = 'read-failed';
        continue;
      }
      if (size > limits.maxCapturedFileBytes) {
        side.contentAvailability = 'not-captured';
        side.contentLimitation = 'file-capture-limit';
        continue;
      }
      if (size > remaining) {
        side.contentAvailability = 'not-captured';
        side.contentLimitation = 'aggregate-capture-limit';
        continue;
      }
      side.capturePlanned = true;
      remaining -= size;
    }
  }
  return remaining;
}

export function planLargeFilePayloadCapture(
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
  initialRemaining: number,
): void {
  let remaining = initialRemaining;
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      const pointer = side?.largeFile;
      if (side === undefined || pointer === undefined || pointer.payloadPath === undefined) {
        continue;
      }
      if (side.workingPath !== undefined && side.workingPath.equals(pointer.payloadPath)) {
        // The endpoint-side capture is also the payload capture when its digest
        // proves the declared LFS identity.
        continue;
      }
      if (pointer.payloadByteLength > limits.maxCapturedFileBytes) {
        pointer.payloadContentAvailability = 'not-captured';
        pointer.payloadContentLimitation = 'file-capture-limit';
        continue;
      }
      if (pointer.payloadByteLength > remaining) {
        pointer.payloadContentAvailability = 'not-captured';
        pointer.payloadContentLimitation = 'aggregate-capture-limit';
        continue;
      }
      pointer.payloadCapturePlanned = true;
      remaining -= pointer.payloadByteLength;
    }
  }
}

export async function captureLargeFilePayloads(
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
  initialVerificationBytes: number = limits.maxVerifiedContentBytes,
): Promise<void> {
  let remaining = initialVerificationBytes;
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      const pointer = side?.largeFile;
      if (side === undefined || pointer === undefined) continue;
      if (
        side.contentIdentity?.value === pointer.payloadIdentity.value &&
        side.byteLength === pointer.payloadByteLength
      ) {
        pointer.sideRepresentation = 'payload';
        pointer.payloadAvailability = 'available';
        pointer.payloadContentIdentity = pointer.payloadIdentity;
        pointer.payloadSharesSideContent = true;
        if (side.content !== undefined) {
          pointer.payloadContent = side.content;
          pointer.payloadContentAvailability = 'captured';
          delete pointer.payloadContentLimitation;
        } else {
          pointer.payloadContentAvailability = 'not-captured';
        }
        continue;
      }
      if (pointer.payloadPath === undefined) {
        pointer.payloadAvailability = 'unavailable';
        pointer.payloadContentAvailability = 'unavailable';
        pointer.payloadContentLimitation = 'large-file-payload-unavailable';
        continue;
      }
      if (pointer.payloadByteLength > limits.maxVerifiedFileBytes || pointer.payloadByteLength > remaining) {
        pointer.payloadAvailability = 'unverified';
        pointer.payloadContentAvailability = 'not-captured';
        pointer.payloadContentLimitation =
          pointer.payloadByteLength > limits.maxVerifiedFileBytes
            ? 'file-verification-limit'
            : 'aggregate-verification-limit';
        continue;
      }
      remaining -= pointer.payloadByteLength;
      let status: Stats;
      try {
        status = await lstat(pointer.payloadPath);
      } catch {
        pointer.payloadAvailability = 'unavailable';
        pointer.payloadContentAvailability = 'unavailable';
        pointer.payloadContentLimitation = 'large-file-payload-unavailable';
        continue;
      }
      if (!status.isFile() || safeSize(status.size) !== pointer.payloadByteLength) {
        pointer.payloadAvailability = 'unverified';
        pointer.payloadContentAvailability = 'unavailable';
        pointer.payloadContentLimitation = 'read-failed';
        continue;
      }
      const result = await streamRegularFile(
        pointer.payloadPath,
        limits.maxVerifiedFileBytes,
        pointer.payloadCapturePlanned,
      );
      if (
        result.status !== 'read' ||
        result.bytesRead !== pointer.payloadByteLength ||
        result.digest !== pointer.payloadIdentity.value
      ) {
        pointer.payloadAvailability = 'unverified';
        pointer.payloadContentAvailability = 'unavailable';
        pointer.payloadContentLimitation = 'read-failed';
        continue;
      }
      pointer.payloadAvailability = 'available';
      pointer.payloadContentIdentity = pointer.payloadIdentity;
      if (pointer.payloadCapturePlanned && result.content !== undefined) {
        pointer.payloadContent = result.content;
        pointer.payloadContentAvailability = 'captured';
        delete pointer.payloadContentLimitation;
      } else {
        pointer.payloadContentAvailability = 'not-captured';
      }
    }
  }
}

export function inspectabilityFingerprint(drafts: readonly FileDraft[]): string | undefined {
  let present = false;
  const facts = drafts.map(draft => ({
    fileIdentity: draft.fileIdentity,
    sides: (['old', 'new'] as const).flatMap(role => {
      const side = role === 'old' ? draft.oldSide : draft.newSide;
      if (side === undefined) return [];
      const checkout = side.gitlink?.checkout;
      if (
        side.objectAvailability === 'missing' ||
        checkout !== undefined ||
        side.largeFile !== undefined ||
        side.workingEvidenceLimitation !== undefined ||
        side.contentLimitation === 'read-failed'
      ) {
        present = true;
      }
      return [
        {
          role,
          path: side.pathBytes.toString('hex'),
          object:
            side.objectId === undefined
              ? undefined
              : {
                  identity: side.objectId,
                  availability: side.objectAvailability ?? 'available',
                },
          checkout,
          payload:
            side.largeFile === undefined
              ? undefined
              : {
                  identity: side.largeFile.payloadIdentity.value,
                  availability: side.largeFile.payloadAvailability,
                },
          workingEvidenceLimitation: side.workingEvidenceLimitation,
          readAvailability: side.contentLimitation === 'read-failed' ? 'unavailable' : 'available',
        },
      ];
    }),
  }));
  return present ? sha256(JSON.stringify(facts)) : undefined;
}

export function workingEvidenceComplete(drafts: readonly FileDraft[]): boolean {
  return drafts.every(draft => {
    const side = draft.newSide;
    if (side === undefined || side.evidenceSource !== 'working-tree') return true;
    if (side.workingEvidenceLimitation !== undefined) return false;
    if (side.gitlink?.checkout?.availability === 'unavailable') return false;
    return side.contentLimitation !== 'read-failed';
  });
}

export function summaryForDrafts(
  drafts: readonly FileDraft[],
  manifest: readonly CurrentChangedFile[],
): CurrentChangesManifestSummary {
  const inspectability = inspectabilityFingerprint(drafts);
  return deepFreeze({
    formatVersion: 1,
    totalFiles: manifest.length,
    digest: manifestDigest(manifest),
    ...(inspectability === undefined ? {} : { inspectabilityFingerprint: inspectability }),
  });
}

export async function captureOldSides(
  context: GitInspectionContext,
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  const planned = drafts
    .flatMap(draft => [draft.oldSide, draft.newSide])
    .filter((side): side is SideDraft => side !== undefined && side.capturePlanned && side.objectId !== undefined);
  const objectIds = planned.map(side => side.objectId as string);
  const maximumBytes = planned.reduce((total, side) => total + (side.byteLength ?? 0), 0);
  const contents = await readGitObjects(context, objectIds, Math.min(maximumBytes, limits.maxCapturedContentBytes));
  for (const side of planned) {
    const content = contents.get(side.objectId as string);
    if (content === undefined || content.byteLength !== side.byteLength) {
      throw new GitInspectionError('head-content-unavailable');
    }
    recordSideBytes(side, content);
  }
}

export async function captureObjectSymlinkTargets(
  context: GitInspectionContext,
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  let remaining = Math.min(limits.maxVerifiedContentBytes, Math.floor((limits.maxManifestBytes * 3) / 4));
  const sides: SideDraft[] = [];
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      if (
        side?.kind !== 'symlink' ||
        side.symlinkTarget !== undefined ||
        side.objectId === undefined ||
        side.objectAvailability === 'missing' ||
        side.byteLength === null ||
        side.byteLength > limits.maxVerifiedFileBytes ||
        side.byteLength > remaining
      ) {
        continue;
      }
      sides.push(side);
      remaining -= side.byteLength;
    }
  }
  if (sides.length === 0) return;
  const maximumBytes = sides.reduce((total, side) => total + (side.byteLength ?? 0), 0);
  const contents = await readGitObjects(
    context,
    sides.map(side => side.objectId as string),
    maximumBytes,
  );
  for (const side of sides) {
    const content = contents.get(side.objectId as string);
    if (content === undefined || content.byteLength !== side.byteLength) {
      throw new GitInspectionError('symlink-content-unavailable');
    }
    recordSideBytes(side, content);
  }
}

export async function captureCommitSides(
  context: GitInspectionContext,
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
): Promise<void> {
  const planned = drafts.flatMap(draft =>
    [draft.oldSide, draft.newSide].filter(
      (side): side is SideDraft => side !== undefined && side.capturePlanned && side.objectId !== undefined,
    ),
  );
  const maximumBytes = planned.reduce((total, side) => total + (side.byteLength ?? 0), 0);
  const contents = await readGitObjects(
    context,
    planned.map(side => side.objectId as string),
    Math.min(maximumBytes, limits.maxCapturedContentBytes),
  );
  for (const side of planned) {
    const content = contents.get(side.objectId as string);
    if (content === undefined || content.byteLength !== side.byteLength) {
      throw new GitInspectionError('commit-content-unavailable');
    }
    recordSideBytes(side, content);
  }
}

export async function captureWorkingSides(
  drafts: readonly FileDraft[],
  limits: WorkspaceEvidenceLimits,
): Promise<{
  readonly baselines: readonly WorkingBaseline[];
  readonly complete: boolean;
  readonly retry: boolean;
  readonly remainingVerificationBytes: number;
}> {
  let remainingVerification = limits.maxVerifiedContentBytes;
  const baselines: WorkingBaseline[] = [];
  let complete = true;
  for (const draft of drafts) {
    const side = draft.newSide;
    if (side === undefined) continue;
    if (side.workingPath === undefined) continue;
    if (side.kind === 'gitlink') {
      side.contentAvailability = 'unavailable';
      side.contentLimitation = 'unsupported-file-kind';
      if (side.gitlink?.checkout?.availability !== 'available') complete = false;
      continue;
    }
    if (side.kind === 'special') {
      side.contentAvailability = 'unavailable';
      side.contentLimitation = 'unsupported-file-kind';
      baselines.push({
        fileIdentity: draft.fileIdentity,
        path: Buffer.from(side.workingPath),
        kind: 'special',
        gitMode: side.gitMode,
        specialEntryKind: side.specialEntry?.kind ?? 'other',
        expectedBytes: null,
      });
      continue;
    }
    if (side.kind !== 'regular' && side.kind !== 'symlink') {
      side.contentAvailability = 'unavailable';
      side.contentLimitation = 'unsupported-file-kind';
      complete = false;
      continue;
    }
    const expectedSize = side.byteLength;
    if (expectedSize === null) {
      complete = false;
      continue;
    }
    if (expectedSize > limits.maxVerifiedFileBytes) {
      side.contentAvailability = 'not-captured';
      side.contentLimitation = 'file-verification-limit';
      side.capturePlanned = false;
      complete = false;
      continue;
    }
    if (expectedSize > remainingVerification) {
      side.contentAvailability = 'not-captured';
      side.contentLimitation = 'aggregate-verification-limit';
      side.capturePlanned = false;
      complete = false;
      continue;
    }
    remainingVerification -= expectedSize;
    const result = await readWorkingSide(side, limits.maxVerifiedFileBytes);
    if (result.status === 'limit') {
      return {
        baselines,
        complete: false,
        retry: true,
        remainingVerificationBytes: remainingVerification,
      };
    }
    if (result.status === 'failed') {
      side.contentAvailability = 'unavailable';
      side.contentLimitation = 'read-failed';
      side.capturePlanned = false;
      complete = false;
      continue;
    }
    if (result.bytesRead !== expectedSize) {
      return {
        baselines,
        complete: false,
        retry: true,
        remainingVerificationBytes: remainingVerification,
      };
    }
    if (result.content !== undefined) {
      recordSideBytes(side, result.content, result.digest, result.classification);
    } else {
      side.contentIdentity = deepFreeze({ algorithm: 'sha256', value: result.digest });
      side.classification = result.classification;
      if (side.contentAvailability !== 'unavailable') {
        side.contentAvailability = 'not-captured';
      }
    }
    if (side.workingEvidenceLimitation !== undefined) complete = false;
    baselines.push({
      fileIdentity: draft.fileIdentity,
      path: Buffer.from(side.workingPath),
      kind: side.kind,
      gitMode: side.gitMode,
      expectedBytes: expectedSize,
      digest: result.digest,
    });
  }
  return {
    baselines,
    complete,
    retry: false,
    remainingVerificationBytes: remainingVerification,
  };
}

export async function revalidateWorking(
  baselines: readonly WorkingBaseline[],
  limits: WorkspaceEvidenceLimits,
): Promise<'same' | 'different' | 'unverified'> {
  let remaining = limits.maxVerifiedContentBytes;
  for (const baseline of baselines) {
    let status: Stats;
    try {
      status = await lstat(baseline.path);
    } catch (cause) {
      return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT' ? 'different' : 'unverified';
    }
    const kind = statKind(status);
    const mode = modeFromStat(status);
    if (kind !== baseline.kind || mode !== baseline.gitMode) return 'different';
    if (kind === 'special') {
      if (specialEntryKind(status) !== baseline.specialEntryKind) return 'different';
      continue;
    }
    const expectedBytes = baseline.expectedBytes;
    if (
      expectedBytes === null ||
      baseline.digest === undefined ||
      expectedBytes > limits.maxVerifiedFileBytes ||
      expectedBytes > remaining
    ) {
      return 'unverified';
    }
    remaining -= expectedBytes;
    const draft: SideDraft = {
      pathBytes: Buffer.alloc(0),
      kind,
      gitMode: mode,
      byteLength: expectedBytes,
      evidenceSource: 'working-tree',
      workingPath: baseline.path,
      capturePlanned: false,
      classification: 'unknown',
      contentAvailability: 'not-captured',
    };
    const result = await readWorkingSide(draft, limits.maxVerifiedFileBytes);
    if (result.status !== 'read') return 'unverified';
    if (result.bytesRead !== expectedBytes || result.digest !== baseline.digest) {
      return 'different';
    }
  }
  return 'same';
}

export function capturedBytes(drafts: readonly FileDraft[]): number {
  let total = 0;
  for (const draft of drafts) {
    for (const side of [draft.oldSide, draft.newSide]) {
      if (side?.content !== undefined) total += side.content.byteLength;
      if (side?.largeFile?.payloadContent !== undefined && !side.largeFile.payloadSharesSideContent) {
        total += side.largeFile.payloadContent.byteLength;
      }
    }
  }
  return total;
}

export function capturedContents(drafts: readonly FileDraft[]): ReadonlyMap<string, Buffer> {
  const contents = new Map<string, Buffer>();
  for (const draft of drafts) {
    if (draft.oldSide?.content !== undefined) {
      contents.set(capturedKey(draft.fileIdentity, 'old'), draft.oldSide.content);
    }
    if (draft.oldSide?.largeFile?.payloadContent !== undefined) {
      contents.set(
        capturedKey(draft.fileIdentity, 'old', 'large-file-payload'),
        draft.oldSide.largeFile.payloadContent,
      );
    }
    if (draft.newSide?.content !== undefined) {
      contents.set(capturedKey(draft.fileIdentity, 'new'), draft.newSide.content);
    }
    if (draft.newSide?.largeFile?.payloadContent !== undefined) {
      contents.set(
        capturedKey(draft.fileIdentity, 'new', 'large-file-payload'),
        draft.newSide.largeFile.payloadContent,
      );
    }
  }
  return contents;
}
