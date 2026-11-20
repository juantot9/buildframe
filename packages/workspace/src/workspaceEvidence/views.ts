import { encodeBytesBase64 } from '../bytesBase64.js';
import { GitInspectionError } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type { WorkspaceIdentity } from '../workspace.js';
import {
  stage,
  type CurrentChangeSide,
  type CurrentChangeStatus,
  type CurrentChangedFile,
  type CurrentChangesCaptureUnverifiedView,
  type CurrentChangesComparedState,
  type CurrentChangesComparisonBasis,
  type CurrentChangesContentRequest,
  type CurrentChangesContentUnavailableView,
  type EvidenceContentIdentity,
  type EvidenceLargeFilePointer,
  type EvidencePath,
  type ReviewCommitGraph,
  type ReviewCommitGraphRow,
  type WorkspaceEvidenceLimits,
  type WorkspaceVerification,
  type WorkspaceVerificationReason,
  type WorkspaceVerificationState,
} from './contracts.js';
import type { FileDraft, Inspection, LargeFileDraft, RawStatusEntry, SideDraft } from './internalTypes.js';
import { now, splitBuffer } from './utils.js';

export function parseCommitGraph(output: Buffer, maximumCommits: number): ReviewCommitGraph {
  const rows: ReviewCommitGraphRow[] = [];
  let commits = 0;
  let headObjectIdentity: string | undefined;
  let truncated = false;
  for (const line of splitBuffer(output, 0x0a)) {
    if (line.byteLength === 0) continue;
    const marker = line.indexOf(0x1e);
    if (marker < 0) {
      const graph = line.toString('ascii');
      if (!/^[*|\\/_. -]+$/u.test(graph)) {
        throw new GitInspectionError('invalid-commit-graph');
      }
      if (commits <= maximumCommits) {
        rows.push(deepFreeze({ kind: 'connector', graph }));
      }
      continue;
    }
    commits += 1;
    if (commits > maximumCommits) {
      truncated = true;
      break;
    }
    const graph = line.subarray(0, marker).toString('ascii');
    if (!/^[*|\\/_. -]+$/u.test(graph)) {
      throw new GitInspectionError('invalid-commit-graph');
    }
    const fields = splitBuffer(line.subarray(marker + 1), 0);
    if (fields.length !== 4) throw new GitInspectionError('invalid-commit-graph');
    const objectIdentity = fields[0]?.toString('ascii') ?? '';
    const parentsText = fields[1]?.toString('ascii') ?? '';
    if (!/^[0-9a-f]{40,64}$/u.test(objectIdentity)) {
      throw new GitInspectionError('invalid-commit-graph');
    }
    const parentIdentities = parentsText.length === 0 ? [] : parentsText.split(' ');
    if (parentIdentities.some(parent => !/^[0-9a-f]{40,64}$/u.test(parent))) {
      throw new GitInspectionError('invalid-commit-graph');
    }
    if (headObjectIdentity === undefined) headObjectIdentity = objectIdentity;
    rows.push(
      deepFreeze({
        kind: 'commit',
        graph,
        objectIdentity,
        abbreviatedObjectIdentity: objectIdentity.slice(0, 12),
        parentIdentities,
        decorations: fields[2]?.toString('utf8') ?? '',
        subject: fields[3]?.toString('utf8') ?? '',
      }),
    );
  }
  if (headObjectIdentity === undefined) {
    return deepFreeze({ status: 'unavailable', reason: 'revision-not-found' });
  }
  return deepFreeze({
    status: 'available',
    headObjectIdentity,
    rows,
    truncated,
  });
}

export function evidencePath(bytes: Buffer): EvidencePath {
  let display: string;
  try {
    display = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    display = display.replace(/[\u0000-\u001f\u007f]/gu, character => {
      const code = character.codePointAt(0) ?? 0;
      if (code === 0x09) return '\\t';
      if (code === 0x0a) return '\\n';
      if (code === 0x0d) return '\\r';
      return `\\x${code.toString(16).padStart(2, '0')}`;
    });
  } catch {
    display = `<path-bytes:${bytes.toString('hex')}>`;
  }
  return deepFreeze({
    bytesBase64: encodeBytesBase64(bytes),
    display,
  });
}

function publicLargeFilePointer(value: LargeFileDraft): EvidenceLargeFilePointer {
  return deepFreeze({
    kind: 'git-lfs-pointer-v1',
    pointer: deepFreeze({
      byteLength: value.pointerBytes.byteLength,
      contentIdentity: value.pointerIdentity,
      bytesBase64: encodeBytesBase64(value.pointerBytes),
    }),
    declaredPayload: deepFreeze({
      objectIdentity: value.payloadIdentity,
      byteLength: value.payloadByteLength,
    }),
    sideRepresentation: value.sideRepresentation,
    localPayload: deepFreeze({
      availability: value.payloadAvailability,
      contentAvailability: value.payloadContentAvailability,
      ...(value.payloadContentIdentity === undefined ? {} : { contentIdentity: value.payloadContentIdentity }),
      ...(value.payloadContentLimitation === undefined ? {} : { contentLimitation: value.payloadContentLimitation }),
    }),
  });
}

function publicSide(side: SideDraft): CurrentChangeSide {
  return deepFreeze({
    path: evidencePath(side.pathBytes),
    kind: side.kind,
    gitMode: side.gitMode,
    byteLength: side.byteLength,
    evidenceSource: side.evidenceSource,
    ...(side.objectIdentity === undefined ? {} : { objectIdentity: side.objectIdentity }),
    ...(side.contentIdentity === undefined ? {} : { contentIdentity: side.contentIdentity }),
    classification: side.classification,
    contentAvailability: side.contentAvailability,
    ...(side.contentLimitation === undefined ? {} : { contentLimitation: side.contentLimitation }),
    ...(side.objectAvailability === undefined ? {} : { objectAvailability: side.objectAvailability }),
    ...(side.symlinkTarget === undefined ? {} : { symlinkTarget: side.symlinkTarget }),
    ...(side.specialEntry === undefined ? {} : { specialEntry: side.specialEntry }),
    ...(side.sparseAbsence === undefined ? {} : { sparseAbsence: side.sparseAbsence }),
    ...(side.gitlink === undefined ? {} : { gitlink: side.gitlink }),
    ...(side.largeFile === undefined ? {} : { largeFilePointer: publicLargeFilePointer(side.largeFile) }),
    ...(side.generated === undefined ? {} : { generated: side.generated }),
    ...(side.workingEvidenceLimitation === undefined
      ? {}
      : { workingEvidenceLimitation: side.workingEvidenceLimitation }),
    ...(side.lineEndingRule === undefined || side.containsCrlf !== true
      ? {}
      : { lineEndingConversion: side.lineEndingRule }),
  });
}

function changeStatus(draft: FileDraft): CurrentChangeStatus {
  if (draft.raw.renameKind === 'copy') return 'copied';
  if (draft.raw.renameKind === 'rename') return 'renamed';
  if (draft.oldSide === undefined) return 'added';
  if (draft.newSide === undefined) return 'deleted';
  if (draft.oldSide.contentLimitation === 'unmerged-index' || draft.newSide.contentLimitation === 'unmerged-index') {
    // No stage side is chosen; the working bytes remain the only exact side.
    return 'modified';
  }
  if (draft.oldSide.kind !== draft.newSide.kind) return 'type-changed';
  if (draft.oldSide.gitMode !== draft.newSide.gitMode) return 'mode-changed';
  const oldDigest = draft.oldSide.contentIdentity?.value;
  const newDigest = draft.newSide.contentIdentity?.value;
  if (oldDigest !== undefined && newDigest !== undefined && oldDigest === newDigest) {
    return 'staging-only';
  }
  return 'modified';
}

export function publicFile(draft: FileDraft): CurrentChangedFile {
  return deepFreeze({
    fileIdentity: draft.fileIdentity,
    status: changeStatus(draft),
    staging: deepFreeze({
      index: stage(draft.raw.indexCode),
      workingTree: stage(draft.raw.workingCode),
    }),
    ...(draft.oldSide === undefined ? {} : { oldSide: publicSide(draft.oldSide) }),
    ...(draft.newSide === undefined ? {} : { newSide: publicSide(draft.newSide) }),
    ...(draft.scopeMembership === undefined ? {} : { scopeMembership: draft.scopeMembership }),
  });
}

export function fileIdentity(entry: RawStatusEntry): string {
  return `fil_${sha256(
    Buffer.concat([
      Buffer.from(`${entry.recordKind}\0${entry.renameKind ?? ''}\0`, 'ascii'),
      entry.oldPath ?? entry.path,
      Buffer.from([0]),
      entry.path,
    ]),
  )}`;
}

export function capturedKey(
  fileIdentity_: string,
  side: 'old' | 'new',
  representation: 'side' | 'large-file-payload' = 'side',
): string {
  return `${fileIdentity_}:${side}:${representation}`;
}

/**
 * Durable format contract: plain JSON serialization preserves the exact nested
 * key order emitted by evidencePath, publicSide, and publicFile. The golden
 * manifest-digest scenario pins that historical order; changing it requires a
 * durable migration rather than sorting or cosmetic literal reordering.
 */
export function manifestDigest(files: readonly CurrentChangedFile[]): EvidenceContentIdentity {
  return deepFreeze({
    algorithm: 'sha256',
    value: sha256(JSON.stringify(files)),
  });
}

export function verification(
  state: WorkspaceVerificationState,
  reason: WorkspaceVerificationReason,
): WorkspaceVerification {
  return deepFreeze({ state, observedAt: now(), reason });
}

export function unavailableCapture(
  workspaceIdentity: WorkspaceIdentity,
  limits: WorkspaceEvidenceLimits,
  attempts: number,
  reason: 'inspection-failed' | 'unstable-workspace',
): CurrentChangesCaptureUnverifiedView {
  return deepFreeze({
    kind: 'workspace.current-changes.capture',
    status: 'unverified',
    workspaceIdentity,
    verification: verification('unverified', reason),
    captureAttempts: attempts,
    limits,
  });
}

export function basis(inspection: Inspection): CurrentChangesComparisonBasis {
  return deepFreeze({
    kind: 'head',
    selector: 'HEAD',
    objectFormat: inspection.objectFormat,
    objectIdentity: inspection.headObject,
    state: inspection.headObject === null ? 'unborn' : 'resolved',
  });
}

export const COMPARED_STATE: CurrentChangesComparedState = deepFreeze({
  kind: 'effective-working-state',
  staged: 'included',
  unstaged: 'included',
  nonIgnoredUntracked: 'included',
  ignoredUntracked: 'excluded',
});

export function contentUnavailable(
  request: CurrentChangesContentRequest,
  reason: CurrentChangesContentUnavailableView['reason'],
): CurrentChangesContentUnavailableView {
  return deepFreeze({
    kind: 'workspace.current-changes.content',
    status: 'unavailable',
    evidenceIdentity: request.evidenceIdentity,
    fileIdentity: request.fileIdentity,
    side: request.side,
    ...(request.representation === undefined ? {} : { representation: request.representation }),
    reason,
  });
}
