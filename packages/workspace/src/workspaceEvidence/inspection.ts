import {
  DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  GitInspectionError,
  prepareGitInspectionContext,
  runGitProcess,
  type GitInspectionContext,
  type GitProcessResult,
} from '../gitProcess.js';
import type { GitObjectMetadata, RawStatusEntry } from './internalTypes.js';
import { ascii, nullableOid, splitAtSpaces, validateRelativePath } from './utils.js';

export async function runGit(
  context: GitInspectionContext,
  arguments_: readonly string[],
  options: {
    readonly maxStdoutBytes: number;
    readonly stdin?: Buffer;
    readonly allowedExitCodes?: readonly number[];
  },
): Promise<GitProcessResult> {
  return await runGitProcess({
    executable: context.executable,
    checkout: context.checkout,
    arguments: arguments_,
    environment: context.environment,
    maxStdoutBytes: options.maxStdoutBytes,
    timeoutMilliseconds: DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
    ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
    ...(options.allowedExitCodes === undefined ? {} : { allowedExitCodes: options.allowedExitCodes }),
  });
}

export async function withGitInspection<Result>(
  checkout: string,
  gitDirectory: string,
  inspect: (context: GitInspectionContext) => Promise<Result>,
): Promise<Result> {
  const context = await prepareGitInspectionContext(checkout, gitDirectory);
  try {
    return await inspect(context);
  } finally {
    await context.dispose();
  }
}

export function parseStatus(status: Buffer, maxFiles: number): readonly RawStatusEntry[] {
  const records = status.subarray(0, status.at(-1) === 0 ? status.byteLength - 1 : status.byteLength);
  const rawRecords: Buffer[] = [];
  if (records.byteLength > 0) {
    let start = 0;
    while (start <= records.byteLength) {
      const separator = records.indexOf(0, start);
      if (separator < 0) {
        rawRecords.push(records.subarray(start));
        break;
      }
      rawRecords.push(records.subarray(start, separator));
      start = separator + 1;
    }
  }

  const parsed: RawStatusEntry[] = [];
  for (let index = 0; index < rawRecords.length; index += 1) {
    const record = rawRecords[index];
    if (record === undefined || record.byteLength < 2 || record[1] !== 0x20) {
      throw new GitInspectionError('invalid-status-record');
    }
    const recordType = String.fromCharCode(record[0] ?? 0);
    if (recordType === 'u') {
      throw new GitInspectionError('unmerged-index');
    }
    if (recordType === '?') {
      const filePath = Buffer.from(record.subarray(2));
      // Git reports a nested repository it does not descend into as one `dir/`
      // entry. It is not a changed file; the raw status still fingerprints it.
      if (filePath.byteLength > 1 && filePath.at(-1) === 0x2f) {
        validateRelativePath(filePath.subarray(0, -1));
        continue;
      }
      parsed.push({
        recordKind: 'untracked',
        indexCode: '?',
        workingCode: '?',
        headMode: '000000',
        indexMode: '000000',
        workingMode: '000000',
        headObject: null,
        indexObject: null,
        path: filePath,
        oldPath: null,
        renameKind: null,
      });
    } else if (recordType === '1') {
      const fields = splitAtSpaces(record, 9);
      if (fields === null || fields.length !== 9) {
        throw new GitInspectionError('invalid-status-record');
      }
      const xy = ascii(fields[1] ?? Buffer.alloc(0));
      if (xy.length !== 2) throw new GitInspectionError('invalid-status-record');
      parsed.push({
        recordKind: 'ordinary',
        indexCode: xy[0] ?? '.',
        workingCode: xy[1] ?? '.',
        headMode: ascii(fields[3] ?? Buffer.alloc(0)),
        indexMode: ascii(fields[4] ?? Buffer.alloc(0)),
        workingMode: ascii(fields[5] ?? Buffer.alloc(0)),
        headObject: nullableOid(ascii(fields[6] ?? Buffer.alloc(0))),
        indexObject: nullableOid(ascii(fields[7] ?? Buffer.alloc(0))),
        path: Buffer.from(fields[8] ?? Buffer.alloc(0)),
        oldPath: null,
        renameKind: null,
      });
    } else if (recordType === '2') {
      const fields = splitAtSpaces(record, 10);
      const oldPath = rawRecords[index + 1];
      if (fields === null || fields.length !== 10 || oldPath === undefined) {
        throw new GitInspectionError('invalid-status-record');
      }
      index += 1;
      const xy = ascii(fields[1] ?? Buffer.alloc(0));
      const score = ascii(fields[8] ?? Buffer.alloc(0));
      if (xy.length !== 2 || !/^[RC][0-9]+$/u.test(score)) {
        throw new GitInspectionError('invalid-status-record');
      }
      parsed.push({
        recordKind: 'rename',
        indexCode: xy[0] ?? '.',
        workingCode: xy[1] ?? '.',
        headMode: ascii(fields[3] ?? Buffer.alloc(0)),
        indexMode: ascii(fields[4] ?? Buffer.alloc(0)),
        workingMode: ascii(fields[5] ?? Buffer.alloc(0)),
        headObject: nullableOid(ascii(fields[6] ?? Buffer.alloc(0))),
        indexObject: nullableOid(ascii(fields[7] ?? Buffer.alloc(0))),
        path: Buffer.from(fields[9] ?? Buffer.alloc(0)),
        oldPath: Buffer.from(oldPath),
        renameKind: score.startsWith('C') ? 'copy' : 'rename',
      });
    } else {
      throw new GitInspectionError('unsupported-status-record');
    }

    if (parsed.length > maxFiles) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }

  for (const entry of parsed) {
    validateRelativePath(entry.path);
    if (entry.oldPath !== null) validateRelativePath(entry.oldPath);
  }
  return parsed.sort((left, right) => {
    const byCurrent = Buffer.compare(left.path, right.path);
    if (byCurrent !== 0) return byCurrent;
    return Buffer.compare(left.oldPath ?? left.path, right.oldPath ?? right.path);
  });
}

export async function inspectGitObjects(
  context: GitInspectionContext,
  objectIds: readonly string[],
): Promise<ReadonlyMap<string, GitObjectMetadata>> {
  const unique = [...new Set(objectIds)];
  if (unique.length === 0) return new Map();
  const result = await runGit(context, ['cat-file', '--batch-check'], {
    maxStdoutBytes: Math.max(1024, unique.length * 256),
    stdin: Buffer.from(`${unique.join('\n')}\n`, 'ascii'),
  });
  const lines = result.stdout.toString('ascii').trimEnd().split('\n');
  if (lines.length !== unique.length) {
    throw new GitInspectionError('invalid-cat-file-metadata');
  }
  const metadata = new Map<string, GitObjectMetadata>();
  for (let index = 0; index < unique.length; index += 1) {
    const objectId = unique[index];
    const line = lines[index];
    if (objectId === undefined || line === undefined) {
      throw new GitInspectionError('invalid-cat-file-metadata');
    }
    if (line === `${objectId} missing`) {
      metadata.set(objectId, {
        objectType: null,
        byteLength: null,
        missing: true,
      });
      continue;
    }
    const match = line.match(/^([0-9a-f]{40,64}) ([a-z]+) ([0-9]+)$/u);
    if (match === null || match[1] !== objectId) {
      throw new GitInspectionError('invalid-cat-file-metadata');
    }
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new GitInspectionError('invalid-cat-file-size');
    }
    metadata.set(objectId, {
      objectType: match[2] ?? null,
      byteLength: size,
      missing: false,
    });
  }
  return metadata;
}

export async function readGitObjects(
  context: GitInspectionContext,
  objectIds: readonly string[],
  maximumBytes: number,
): Promise<ReadonlyMap<string, Buffer>> {
  const unique = [...new Set(objectIds)];
  if (unique.length === 0) return new Map();
  const result = await runGit(context, ['cat-file', '--batch'], {
    maxStdoutBytes: maximumBytes + unique.length * 256,
    stdin: Buffer.from(`${unique.join('\n')}\n`, 'ascii'),
  });
  const contents = new Map<string, Buffer>();
  let offset = 0;
  for (const requested of unique) {
    const newline = result.stdout.indexOf(0x0a, offset);
    if (newline < 0) throw new GitInspectionError('invalid-cat-file-content');
    const header = result.stdout.subarray(offset, newline).toString('ascii');
    const match = header.match(/^([0-9a-f]{40,64}) ([a-z]+) ([0-9]+)$/u);
    if (match === null || match[1] !== requested) {
      throw new GitInspectionError('invalid-cat-file-content');
    }
    const size = Number(match[3]);
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new GitInspectionError('invalid-cat-file-content');
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= result.stdout.byteLength || result.stdout[end] !== 0x0a) {
      throw new GitInspectionError('invalid-cat-file-content');
    }
    contents.set(requested, Buffer.from(result.stdout.subarray(start, end)));
    offset = end + 1;
  }
  if (offset !== result.stdout.byteLength) {
    throw new GitInspectionError('invalid-cat-file-content');
  }
  return contents;
}
