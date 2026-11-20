import { createHash } from 'node:crypto';
import { constants as fsConstants, type Stats } from 'node:fs';
import { lstat, open, readFile, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { encodeBytesBase64 } from '../bytesBase64.js';
import { prepareGitInspectionContext, type GitInspectionContext } from '../gitProcess.js';
import { deepFreeze } from '../recordCodec.js';
import { sha256 } from '../sha256.js';
import type {
  EvidenceContentClassification,
  EvidenceContentIdentity,
  EvidenceGitlinkCheckout,
  EvidenceSideKind,
  EvidenceSpecialEntry,
  EvidenceSpecialEntryKind,
  WorkspaceEvidenceLimits,
} from './contracts.js';
import { inspectGitObjects, readGitObjects, runGit } from './inspection.js';
import type { FileDraft, GitObjectMetadata, SideDraft, StreamResult } from './internalTypes.js';
import { FULL_OBJECT_ID_PATTERN, splitBuffer } from './utils.js';

export { decorateAttributes } from './attributes.js';

export function modeKind(mode: string, objectType?: string | null): EvidenceSideKind {
  if (mode === '100644' || mode === '100755') return 'regular';
  if (mode === '120000') return 'symlink';
  if (mode === '160000' || objectType === 'commit') return 'gitlink';
  return 'unknown';
}

export function modeFromStat(stat: Stats): string {
  if (stat.isSymbolicLink()) return '120000';
  if (stat.isFile()) return (stat.mode & 0o111) === 0 ? '100644' : '100755';
  return '000000';
}

export function statKind(stat: Stats): EvidenceSideKind {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isFile()) return 'regular';
  if (stat.isDirectory()) return 'gitlink';
  return 'special';
}

export function specialEntryKind(stat: Stats): EvidenceSpecialEntryKind {
  if (stat.isFIFO()) return 'fifo';
  if (stat.isSocket()) return 'socket';
  if (stat.isCharacterDevice()) return 'character-device';
  if (stat.isBlockDevice()) return 'block-device';
  return 'other';
}

export function specialEntry(stat: Stats): EvidenceSpecialEntry {
  return deepFreeze({
    kind: specialEntryKind(stat),
    content: 'not-applicable',
  });
}

export function safeSize(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const LFS_POINTER_VERSION = 'https://git-lfs.github.com/spec/v1';

export const MAX_LFS_POINTER_BYTES = 1024;

interface ParsedLargeFilePointer {
  readonly bytes: Buffer;
  readonly pointerIdentity: EvidenceContentIdentity;
  readonly payloadIdentity: EvidenceContentIdentity;
  readonly payloadByteLength: number;
}

export function parseLargeFilePointer(bytes: Buffer): ParsedLargeFilePointer | undefined {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_LFS_POINTER_BYTES || bytes.includes(0) || bytes.includes(0x0d)) {
    return undefined;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const lines = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (lines[0] !== `version ${LFS_POINTER_VERSION}`) return undefined;
  let payloadIdentity: string | undefined;
  let payloadByteLength: number | undefined;
  for (const line of lines.slice(1)) {
    const oid = /^oid sha256:([0-9a-f]{64})$/u.exec(line);
    if (oid?.[1] !== undefined) {
      if (payloadIdentity !== undefined) return undefined;
      payloadIdentity = oid[1];
      continue;
    }
    const size = /^size ([0-9]+)$/u.exec(line);
    if (size?.[1] !== undefined) {
      if (payloadByteLength !== undefined) return undefined;
      const parsed = Number(size[1]);
      if (!Number.isSafeInteger(parsed) || parsed < 0) return undefined;
      payloadByteLength = parsed;
      continue;
    }
    // Git LFS v1 permits ordered extension declarations. Their values remain
    // pointer bytes; BuildFrame does not interpret or execute them.
    if (/^ext-[A-Za-z0-9][A-Za-z0-9.-]* .+$/u.test(line)) continue;
    return undefined;
  }
  if (payloadIdentity === undefined || payloadByteLength === undefined) {
    return undefined;
  }
  return {
    bytes: Buffer.from(bytes),
    pointerIdentity: deepFreeze({ algorithm: 'sha256', value: sha256(bytes) }),
    payloadIdentity: deepFreeze({ algorithm: 'sha256', value: payloadIdentity }),
    payloadByteLength,
  };
}

function contentClassification(bytes: Buffer): EvidenceContentClassification {
  if (bytes.includes(0)) return 'binary';
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text';
  } catch {
    return 'unrenderable';
  }
}

export async function streamRegularFile(
  filename: Buffer,
  maximumBytes: number,
  retain: boolean,
): Promise<StreamResult> {
  const handle = await open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW).catch(() => undefined);
  if (handle === undefined) return { status: 'failed' };
  return await new Promise<StreamResult>(resolve => {
    const hash = createHash('sha256');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks: Buffer[] = [];
    let bytesRead = 0;
    let binary = false;
    let invalidText = false;
    let crlf = false;
    let endedWithCr = false;
    let settled = false;
    const stream = handle.createReadStream();
    const finish = (result: StreamResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    stream.on('data', (value: string | Buffer) => {
      const chunk = typeof value === 'string' ? Buffer.from(value) : value;
      bytesRead += chunk.byteLength;
      if (bytesRead > maximumBytes) {
        stream.destroy();
        finish({ status: 'limit' });
        return;
      }
      hash.update(chunk);
      if (chunk.includes(0)) binary = true;
      if (!crlf) crlf = (endedWithCr && chunk[0] === 0x0a) || chunk.includes('\r\n');
      endedWithCr = chunk.at(-1) === 0x0d;
      if (!invalidText) {
        try {
          decoder.decode(chunk, { stream: true });
        } catch {
          invalidText = true;
        }
      }
      if (retain) chunks.push(Buffer.from(chunk));
    });
    stream.once('error', () => finish({ status: 'failed' }));
    stream.once('end', () => {
      if (settled) return;
      if (!invalidText) {
        try {
          decoder.decode();
        } catch {
          invalidText = true;
        }
      }
      const classification: EvidenceContentClassification = binary ? 'binary' : invalidText ? 'unrenderable' : 'text';
      const base = {
        status: 'read' as const,
        bytesRead,
        digest: hash.digest('hex'),
        classification,
        ...(crlf ? { crlf: true as const } : {}),
      };
      finish(retain ? { ...base, content: Buffer.concat(chunks, bytesRead) } : base);
    });
  });
}

export async function readWorkingSide(side: SideDraft, maximumBytes: number): Promise<StreamResult> {
  if (side.workingPath === undefined) return { status: 'failed' };
  if (side.kind === 'symlink') {
    try {
      const target = await readlink(side.workingPath, { encoding: 'buffer' });
      if (target.byteLength > maximumBytes) return { status: 'limit' };
      const bytes = Buffer.from(target);
      const base = {
        status: 'read' as const,
        bytesRead: bytes.byteLength,
        digest: sha256(bytes),
        classification: contentClassification(bytes),
      };
      // Raw target bytes are structural symlink evidence. recordSideBytes still
      // honors capturePlanned for the separately windowed side content.
      return { ...base, content: bytes };
    } catch {
      return { status: 'failed' };
    }
  }
  if (side.kind !== 'regular') return { status: 'failed' };
  const result = await streamRegularFile(side.workingPath, maximumBytes, side.capturePlanned);
  if (result.status === 'read') side.containsCrlf = result.crlf === true;
  return result;
}

export function recordSideBytes(
  side: SideDraft,
  bytes: Buffer,
  digest: string = sha256(bytes),
  classification: EvidenceContentClassification = contentClassification(bytes),
): void {
  side.contentIdentity = deepFreeze({ algorithm: 'sha256', value: digest });
  side.classification = classification;
  if (side.capturePlanned) {
    side.content = Buffer.from(bytes);
    side.contentAvailability = 'captured';
    delete side.contentLimitation;
  } else if (side.contentAvailability !== 'unavailable') {
    side.contentAvailability = 'not-captured';
  }
  if (side.kind === 'symlink') {
    side.symlinkTarget = deepFreeze({
      byteLength: bytes.byteLength,
      contentIdentity: side.contentIdentity,
      bytesBase64: encodeBytesBase64(bytes),
    });
  }
  const largeFile = side.largeFile;
  if (largeFile === undefined) return;
  if (
    bytes.byteLength === largeFile.pointerBytes.byteLength &&
    digest === largeFile.pointerIdentity.value &&
    bytes.equals(largeFile.pointerBytes)
  ) {
    largeFile.sideRepresentation = 'pointer';
    return;
  }
  if (bytes.byteLength === largeFile.payloadByteLength && digest === largeFile.payloadIdentity.value) {
    largeFile.sideRepresentation = 'payload';
    largeFile.payloadAvailability = 'available';
    largeFile.payloadContentIdentity = largeFile.payloadIdentity;
    largeFile.payloadSharesSideContent = true;
    if (side.content !== undefined) {
      largeFile.payloadContent = side.content;
      largeFile.payloadContentAvailability = 'captured';
      delete largeFile.payloadContentLimitation;
    } else {
      largeFile.payloadContentAvailability = 'not-captured';
    }
    return;
  }
  if (side.filterDriver === 'lfs') {
    side.workingEvidenceLimitation = 'unsupported-content-filter';
    largeFile.sideRepresentation = 'unverified';
  }
}

function exactPathString(value: Buffer): string | undefined {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(value);
    return Buffer.from(decoded).equals(value) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

async function nestedGitDirectory(checkout: string): Promise<string | undefined> {
  const marker = path.join(checkout, '.git');
  let status: Stats;
  try {
    status = await lstat(marker);
  } catch {
    return undefined;
  }
  if (status.isDirectory()) {
    return await realpath(marker).catch(() => undefined);
  }
  if (!status.isFile() || status.size > 4096) return undefined;
  try {
    const contents = await readFile(marker, 'utf8');
    const match = /^gitdir: (.+)$/mu.exec(contents.trimEnd());
    if (match?.[1] === undefined || match[1].includes('\0')) return undefined;
    return await realpath(path.resolve(checkout, match[1]));
  } catch {
    return undefined;
  }
}

export async function inspectGitlinkCheckout(
  workingPath: Buffer,
  limits: WorkspaceEvidenceLimits,
): Promise<EvidenceGitlinkCheckout> {
  const checkout = exactPathString(workingPath);
  if (checkout === undefined) {
    return deepFreeze({ availability: 'unavailable', reason: 'not-repository' });
  }
  let status: Stats;
  try {
    status = await lstat(workingPath);
  } catch {
    return deepFreeze({ availability: 'unavailable', reason: 'not-present' });
  }
  if (!status.isDirectory()) {
    return deepFreeze({ availability: 'unavailable', reason: 'not-repository' });
  }
  const gitDirectory = await nestedGitDirectory(checkout);
  if (gitDirectory === undefined) {
    return deepFreeze({ availability: 'unavailable', reason: 'not-repository' });
  }

  let context: GitInspectionContext | undefined;
  try {
    context = await prepareGitInspectionContext(checkout, gitDirectory, {
      allowConfiguredWorkTree: true,
    });
    const objectFormat = await runGit(context, ['rev-parse', '--show-object-format'], { maxStdoutBytes: 64 });
    const format = objectFormat.stdout.toString('ascii').trim();
    if (format !== 'sha1' && format !== 'sha256') {
      return deepFreeze({ availability: 'unavailable', reason: 'inspection-failed' });
    }
    const head = await runGit(context, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], {
      maxStdoutBytes: 1024,
      allowedExitCodes: [0, 1, 128],
    });
    if (head.exitCode !== 0) {
      return deepFreeze({ availability: 'unavailable', reason: 'head-unavailable' });
    }
    const checkedOutCommit = head.stdout.toString('ascii').trim();
    if (!FULL_OBJECT_ID_PATTERN.test(checkedOutCommit)) {
      return deepFreeze({ availability: 'unavailable', reason: 'inspection-failed' });
    }
    const statusResult = await runGit(
      context,
      [
        '-c',
        'core.quotePath=false',
        'status',
        '--porcelain=v2',
        '-z',
        '--untracked-files=all',
        '--ignore-submodules=all',
        '--no-renames',
        '--',
      ],
      { maxStdoutBytes: limits.maxManifestBytes },
    );
    let dirty = false;
    let untracked = false;
    for (const record of splitBuffer(
      statusResult.stdout.subarray(
        0,
        statusResult.stdout.at(-1) === 0 ? statusResult.stdout.byteLength - 1 : statusResult.stdout.byteLength,
      ),
      0,
    )) {
      if (record.byteLength === 0) continue;
      if (record[0] === 0x3f) untracked = true;
      else if (record[0] !== 0x21) dirty = true;
    }
    return deepFreeze({
      availability: 'available',
      checkedOutCommit: deepFreeze({ algorithm: format, value: checkedOutCommit }),
      dirty,
      untracked,
    });
  } catch {
    return deepFreeze({ availability: 'unavailable', reason: 'inspection-failed' });
  } finally {
    await context?.dispose().catch(() => undefined);
  }
}

async function localLfsObjectPath(
  context: GitInspectionContext,
  oid: string,
  expectedBytes: number,
): Promise<Buffer | undefined> {
  const components = [
    path.join(context.commonDirectory, 'lfs'),
    path.join(context.commonDirectory, 'lfs', 'objects'),
    path.join(context.commonDirectory, 'lfs', 'objects', oid.slice(0, 2)),
    path.join(context.commonDirectory, 'lfs', 'objects', oid.slice(0, 2), oid.slice(2, 4)),
  ];
  try {
    for (const component of components) {
      const status = await lstat(component);
      if (!status.isDirectory() || status.isSymbolicLink()) return undefined;
    }
    const candidate = path.join(components.at(-1) as string, oid);
    const status = await lstat(candidate);
    if (!status.isFile() || status.isSymbolicLink() || safeSize(status.size) !== expectedBytes) {
      return undefined;
    }
    const canonical = await realpath(candidate);
    const relative = path.relative(context.commonDirectory, canonical);
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return undefined;
    }
    return Buffer.from(candidate);
  } catch {
    return undefined;
  }
}

export async function recognizeLargeFilePointers(
  context: GitInspectionContext,
  drafts: readonly FileDraft[],
  /** Object details the caller already read; only the rest are looked up. */
  knownMetadata: ReadonlyMap<string, GitObjectMetadata> = new Map(),
): Promise<void> {
  const sides = drafts.flatMap(draft =>
    [draft.oldSide, draft.newSide].filter((side): side is SideDraft => side !== undefined && side.kind === 'regular'),
  );
  const requestedObjectIds = sides.flatMap(side => [
    ...(side.objectId !== undefined &&
    side.objectAvailability !== 'missing' &&
    side.byteLength !== null &&
    side.byteLength <= MAX_LFS_POINTER_BYTES
      ? [side.objectId]
      : []),
    ...(side.pointerObjectId === undefined ? [] : [side.pointerObjectId]),
  ]);
  const unknownObjectIds = requestedObjectIds.filter(oid => !knownMetadata.has(oid));
  const looked = await inspectGitObjects(context, unknownObjectIds);
  const metadata = new Map([...knownMetadata, ...looked]);
  const readableObjectIds = [...new Set(requestedObjectIds)].filter(oid => {
    const item = metadata.get(oid);
    return (
      item !== undefined &&
      !item.missing &&
      item.objectType === 'blob' &&
      item.byteLength !== null &&
      item.byteLength <= MAX_LFS_POINTER_BYTES
    );
  });
  let objectBytes: ReadonlyMap<string, Buffer> = new Map();
  if (readableObjectIds.length > 0) {
    objectBytes = await readGitObjects(context, readableObjectIds, readableObjectIds.length * MAX_LFS_POINTER_BYTES);
  }

  for (const side of sides) {
    let ownBytes = side.objectId === undefined ? undefined : objectBytes.get(side.objectId);
    if (
      ownBytes === undefined &&
      side.workingPath !== undefined &&
      side.byteLength !== null &&
      side.byteLength <= MAX_LFS_POINTER_BYTES
    ) {
      const read = await streamRegularFile(side.workingPath, MAX_LFS_POINTER_BYTES, true);
      if (read.status === 'read') ownBytes = read.content;
    }
    const ownPointer = ownBytes === undefined ? undefined : parseLargeFilePointer(ownBytes);
    const indexPointerBytes = side.pointerObjectId === undefined ? undefined : objectBytes.get(side.pointerObjectId);
    const pointer =
      ownPointer ?? (indexPointerBytes === undefined ? undefined : parseLargeFilePointer(indexPointerBytes));
    if (pointer === undefined) continue;

    const localStorePath = await localLfsObjectPath(context, pointer.payloadIdentity.value, pointer.payloadByteLength);
    const ownDigest = ownBytes === undefined ? undefined : sha256(ownBytes);
    const workingPayloadCandidate =
      side.workingPath !== undefined &&
      side.byteLength === pointer.payloadByteLength &&
      side.byteLength !== null &&
      ownPointer === undefined;
    const ownIsPayload = workingPayloadCandidate && ownDigest === pointer.payloadIdentity.value;
    side.largeFile = {
      pointerBytes: pointer.bytes,
      pointerIdentity: pointer.pointerIdentity,
      payloadIdentity: pointer.payloadIdentity,
      payloadByteLength: pointer.payloadByteLength,
      sideRepresentation: ownPointer !== undefined ? 'pointer' : ownIsPayload ? 'payload' : 'unverified',
      payloadAvailability: ownIsPayload || localStorePath !== undefined ? 'unverified' : 'unavailable',
      payloadContentAvailability: ownIsPayload || localStorePath !== undefined ? 'not-captured' : 'unavailable',
      ...(workingPayloadCandidate
        ? { payloadPath: side.workingPath }
        : localStorePath === undefined
          ? { payloadContentLimitation: 'large-file-payload-unavailable' as const }
          : { payloadPath: localStorePath }),
      payloadCapturePlanned: false,
      payloadSharesSideContent: false,
    };
    if (
      side.filterDriver !== undefined &&
      !(side.filterDriver === 'lfs' && side.largeFile.sideRepresentation !== 'unverified')
    ) {
      side.workingEvidenceLimitation = 'unsupported-content-filter';
    }
  }

  for (const side of sides) {
    if (side.filterDriver !== undefined && side.largeFile === undefined) {
      side.workingEvidenceLimitation = 'unsupported-content-filter';
    }
  }
}
