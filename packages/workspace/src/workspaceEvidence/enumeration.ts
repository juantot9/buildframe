import { GitInspectionError, type GitInspectionContext, type GitProcessResult } from '../gitProcess.js';
import { sha256 } from '../sha256.js';
import { type WorkspaceEvidenceLimits } from './contracts.js';
import { inspectGitObjects, parseStatus, runGit } from './inspection.js';
import type {
  IndexEnumeration,
  IndexRecord,
  Inspection,
  RawCommitDiffEntry,
  TreeEnumeration,
  TreeRecord,
  UnstagedEnumeration,
  UnstagedRecord,
  UntrackedEnumeration,
} from './internalTypes.js';
import { ComparisonResolutionError } from './resolution.js';
import { nullableOid, objectFormat, pathListCanonical, splitBuffer, validateRelativePath } from './utils.js';

export async function inspect(context: GitInspectionContext, limits: WorkspaceEvidenceLimits): Promise<Inspection> {
  const formatResult = await runGit(context, ['rev-parse', '--show-object-format'], {
    maxStdoutBytes: 1024,
  });
  const format = objectFormat(formatResult.stdout.toString('ascii').trim());
  const headResult = await runGit(context, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}'], {
    maxStdoutBytes: 1024,
    allowedExitCodes: [0, 1],
  });
  const head = headResult.exitCode === 0 ? headResult.stdout.toString('ascii').trim() : null;
  if (head !== null && !/^[0-9a-f]{40,64}$/u.test(head)) {
    throw new GitInspectionError('invalid-head-object');
  }

  const statusArguments = (renameArgument: string): readonly string[] => [
    '-c',
    'core.quotePath=false',
    '-c',
    'core.fileMode=true',
    'status',
    '--porcelain=v2',
    '-z',
    '--untracked-files=all',
    renameArgument,
    '--',
  ];
  let statusResult: GitProcessResult;
  try {
    statusResult = await runGit(context, statusArguments('--find-renames=50%'), {
      maxStdoutBytes: limits.maxManifestBytes,
    });
  } catch {
    // Similarity is presentation evidence. Missing content must not erase an
    // otherwise enumerable manifest, so degrade to additions/deletions.
    statusResult = await runGit(context, statusArguments('--no-renames'), {
      maxStdoutBytes: limits.maxManifestBytes,
    });
  }
  const entries = parseStatus(statusResult.stdout, limits.maxManifestFiles);
  const index = await enumerateIndex(context, limits);
  const affectedPaths = new Set(entries.map(entry => entry.path.toString('hex')));
  const sparseCanonical = sparseAbsenceCanonical(index, affectedPaths);
  const fingerprint = sha256(
    Buffer.concat([Buffer.from(`${format}\0${head ?? 'unborn'}\0`, 'ascii'), statusResult.stdout, sparseCanonical]),
  );
  return {
    objectFormat: format,
    headObject: head,
    statusFingerprint: fingerprint,
    entries,
    index,
  };
}

export function parseCommitDiff(output: Buffer, maximumFiles: number): readonly RawCommitDiffEntry[] {
  const records = splitBuffer(output.subarray(0, output.at(-1) === 0 ? output.byteLength - 1 : output.byteLength), 0);
  if (records.length === 1 && records[0]?.byteLength === 0) return [];
  const entries: RawCommitDiffEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const header = records[index];
    if (header === undefined) throw new GitInspectionError('invalid-commit-diff');
    const match = header
      .toString('ascii')
      .match(/^:([0-7]{6}) ([0-7]{6}) ([0-9a-f]{40,64}) ([0-9a-f]{40,64}) ([A-Z])([0-9]*)$/u);
    if (match === null) throw new GitInspectionError('invalid-commit-diff');
    const status = match[5] ?? '';
    if (!['A', 'D', 'M', 'T', 'R', 'C'].includes(status)) {
      throw new GitInspectionError('unsupported-commit-diff');
    }
    const firstPath = records[index + 1];
    if (firstPath === undefined) throw new GitInspectionError('invalid-commit-diff');
    index += 1;
    let oldPath: Buffer | null = null;
    let currentPath = firstPath;
    let renameKind: 'rename' | 'copy' | null = null;
    if (status === 'R' || status === 'C') {
      const secondPath = records[index + 1];
      if (secondPath === undefined) throw new GitInspectionError('invalid-commit-diff');
      index += 1;
      oldPath = Buffer.from(firstPath);
      currentPath = secondPath;
      renameKind = status === 'R' ? 'rename' : 'copy';
    }
    validateRelativePath(currentPath);
    if (oldPath !== null) validateRelativePath(oldPath);
    entries.push({
      oldMode: match[1] ?? '000000',
      newMode: match[2] ?? '000000',
      oldObject: nullableOid(match[3] ?? ''),
      newObject: nullableOid(match[4] ?? ''),
      path: Buffer.from(currentPath),
      oldPath,
      renameKind,
    });
    if (entries.length > maximumFiles) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }
  return entries.sort((left, right) => {
    const byCurrent = Buffer.compare(left.path, right.path);
    if (byCurrent !== 0) return byCurrent;
    return Buffer.compare(left.oldPath ?? left.path, right.oldPath ?? right.path);
  });
}

async function namedObjectsAvailable(
  context: GitInspectionContext,
  candidates: readonly {
    readonly mode: string;
    readonly objectIdentity: string | null;
  }[],
): Promise<boolean> {
  const objectIds = [
    ...new Set(
      candidates.flatMap(candidate =>
        candidate.objectIdentity === null || candidate.mode === '000000' || candidate.mode === '160000'
          ? []
          : [candidate.objectIdentity],
      ),
    ),
  ];
  if (objectIds.length === 0) return true;
  const metadata = await inspectGitObjects(context, objectIds);
  return objectIds.every(objectId => metadata.get(objectId)?.missing === false);
}

export async function currentObjectsAvailable(context: GitInspectionContext, inspection: Inspection): Promise<boolean> {
  return await namedObjectsAvailable(
    context,
    inspection.entries.flatMap(entry => [
      { mode: entry.headMode, objectIdentity: entry.headObject },
      { mode: entry.indexMode, objectIdentity: entry.indexObject },
    ]),
  );
}

export async function commitObjectsAvailable(
  context: GitInspectionContext,
  entries: readonly RawCommitDiffEntry[],
): Promise<boolean> {
  return await namedObjectsAvailable(
    context,
    entries.flatMap(entry => [
      { mode: entry.oldMode, objectIdentity: entry.oldObject },
      { mode: entry.newMode, objectIdentity: entry.newObject },
    ]),
  );
}

export function commitEntriesFingerprint(entries: readonly RawCommitDiffEntry[]): string {
  return sha256(
    JSON.stringify(
      entries.map(entry => ({
        oldMode: entry.oldMode,
        newMode: entry.newMode,
        oldObject: entry.oldObject,
        newObject: entry.newObject,
        path: entry.path.toString('hex'),
        oldPath: entry.oldPath?.toString('hex') ?? null,
        renameKind: entry.renameKind,
      })),
    ),
  );
}

function parseIndexStage(output: Buffer, maximumFiles: number): readonly IndexRecord[] {
  const records = splitBuffer(output.subarray(0, output.at(-1) === 0 ? output.byteLength - 1 : output.byteLength), 0);
  if (records.length === 1 && records[0]?.byteLength === 0) return [];
  const parsed: IndexRecord[] = [];
  for (const record of records) {
    if (record.byteLength < 3 || record[1] !== 0x20 || !/[HSMRCK?]/iu.test(String.fromCharCode(record[0] ?? 0))) {
      throw new GitInspectionError('invalid-index-record');
    }
    const tag = String.fromCharCode(record[0] ?? 0).toUpperCase();
    const taggedRecord = record.subarray(2);
    const tab = taggedRecord.indexOf(0x09);
    if (tab < 0) throw new GitInspectionError('invalid-index-record');
    const header = taggedRecord.subarray(0, tab).toString('ascii');
    const match = header.match(/^([0-7]{6}) ([0-9a-f]{40,64}) ([0-3])$/u);
    if (match === null) throw new GitInspectionError('invalid-index-record');
    const path = Buffer.from(taggedRecord.subarray(tab + 1));
    validateRelativePath(path);
    parsed.push({
      mode: match[1] ?? '000000',
      oid: match[2] ?? '',
      stage: Number(match[3]),
      path,
      skipWorktree: tag === 'S',
    });
    if (parsed.length > maximumFiles * 3 + 8) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }
  return parsed.sort((left, right) => {
    const byPath = Buffer.compare(left.path, right.path);
    return byPath !== 0 ? byPath : left.stage - right.stage;
  });
}

function sparseAbsenceCanonical(index: IndexEnumeration, affectedPaths: ReadonlySet<string>): Buffer {
  const sparsePaths = index.records
    .filter(record => record.skipWorktree && affectedPaths.has(record.path.toString('hex')))
    .map(record => record.path)
    .sort((left, right) => Buffer.compare(left, right));
  if (sparsePaths.length === 0) return Buffer.alloc(0);
  const parts: Buffer[] = [Buffer.from('skip-worktree\0', 'ascii')];
  for (const item of sparsePaths) parts.push(item, Buffer.from([0]));
  return Buffer.concat(parts);
}

export function indexCanonical(records: readonly IndexRecord[]): Buffer {
  const parts: Buffer[] = [];
  for (const record of records) {
    parts.push(Buffer.from(`${record.mode} ${record.oid} ${record.stage}\0`, 'ascii'), record.path, Buffer.from([0]));
  }
  const basic = Buffer.concat(parts);
  const sparsePaths = records.filter(record => record.skipWorktree);
  if (sparsePaths.length === 0) return basic;
  const sparseParts: Buffer[] = [basic, Buffer.from('skip-worktree\0', 'ascii')];
  for (const record of sparsePaths) {
    sparseParts.push(record.path, Buffer.from([0]));
  }
  return Buffer.concat(sparseParts);
}

export async function enumerateIndex(
  context: GitInspectionContext,
  limits: WorkspaceEvidenceLimits,
  maximumFiles: number = limits.maxManifestFiles,
): Promise<IndexEnumeration> {
  const result = await runGit(context, ['ls-files', '--stage', '-v', '-z'], {
    maxStdoutBytes: limits.maxManifestBytes,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) {
    throw new ComparisonResolutionError('index-unavailable');
  }
  const records = parseIndexStage(result.stdout, maximumFiles);
  const paths = new Set(records.map(record => record.path.toString('hex')));
  if (paths.size > maximumFiles) {
    throw new GitInspectionError('manifest-file-limit');
  }
  const unmergedPaths = new Set(
    records.filter(record => record.stage !== 0).map(record => record.path.toString('hex')),
  );
  return {
    records,
    canonical: indexCanonical(records),
    entryCount: paths.size,
    unmergedPaths,
  };
}

function parseTreeListing(output: Buffer, maximumFiles: number): readonly TreeRecord[] {
  const records = splitBuffer(output.subarray(0, output.at(-1) === 0 ? output.byteLength - 1 : output.byteLength), 0);
  if (records.length === 1 && records[0]?.byteLength === 0) return [];
  const parsed: TreeRecord[] = [];
  for (const record of records) {
    const tab = record.indexOf(0x09);
    if (tab < 0) throw new GitInspectionError('invalid-tree-record');
    const header = record.subarray(0, tab).toString('ascii');
    const match = header.match(/^([0-7]{6}) (blob|commit) ([0-9a-f]{40,64})$/u);
    if (match === null) throw new GitInspectionError('invalid-tree-record');
    const path = Buffer.from(record.subarray(tab + 1));
    validateRelativePath(path);
    parsed.push({
      mode: match[1] ?? '000000',
      objectKind: (match[2] ?? 'unknown') as 'blob' | 'commit',
      oid: match[3] ?? '',
      path,
    });
    if (parsed.length > maximumFiles) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }
  return parsed.sort((left, right) => Buffer.compare(left.path, right.path));
}

export async function enumerateTree(
  context: GitInspectionContext,
  treeIdentity: string,
  limits: WorkspaceEvidenceLimits,
  maximumFiles: number = limits.maxManifestFiles,
): Promise<TreeEnumeration> {
  const result = await runGit(context, ['ls-tree', '-r', '-z', '--full-tree', treeIdentity], {
    maxStdoutBytes: limits.maxManifestBytes,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) {
    throw new ComparisonResolutionError('revision-not-found');
  }
  return { records: parseTreeListing(result.stdout, maximumFiles) };
}

export async function enumerateCurrentRepositoryPaths(
  context: GitInspectionContext,
  limits: WorkspaceEvidenceLimits,
): Promise<readonly Buffer[]> {
  const result = await runGit(context, ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    maxStdoutBytes: limits.maxManifestBytes,
    allowedExitCodes: [0, 1, 128],
  });
  if (result.exitCode !== 0) throw new GitInspectionError('working-unavailable');
  const records = splitBuffer(
    result.stdout.subarray(0, result.stdout.at(-1) === 0 ? result.stdout.byteLength - 1 : result.stdout.byteLength),
    0,
  );
  if (records.length === 1 && records[0]?.byteLength === 0) return [];
  const unique = new Map<string, Buffer>();
  for (const record of records) {
    const file = Buffer.from(record);
    // A nested repository Git did not descend into (`dir/`) holds no repository files.
    if (file.byteLength > 1 && file.at(-1) === 0x2f) {
      validateRelativePath(file.subarray(0, -1));
      continue;
    }
    validateRelativePath(file);
    unique.set(file.toString('hex'), file);
    if (unique.size > limits.maxManifestFiles) throw new GitInspectionError('manifest-file-limit');
  }
  return [...unique.values()].sort((left, right) => Buffer.compare(left, right));
}

export async function enumerateUntracked(
  context: GitInspectionContext,
  limits: WorkspaceEvidenceLimits,
  maximumFiles: number = limits.maxManifestFiles,
  ignored: boolean = false,
): Promise<UntrackedEnumeration> {
  const result = await runGit(
    context,
    ['ls-files', '--others', ...(ignored ? ['--ignored'] : []), '--exclude-standard', '-z'],
    { maxStdoutBytes: limits.maxManifestBytes, allowedExitCodes: [0, 1, 128] },
  );
  if (result.exitCode !== 0) {
    throw new ComparisonResolutionError('working-unavailable');
  }
  const records = splitBuffer(
    result.stdout.subarray(0, result.stdout.at(-1) === 0 ? result.stdout.byteLength - 1 : result.stdout.byteLength),
    0,
  );
  if (records.length === 1 && records[0]?.byteLength === 0) {
    return { paths: [], nestedRepositories: [], canonical: Buffer.alloc(0) };
  }
  const paths: Buffer[] = [];
  const nestedRepositories: Buffer[] = [];
  for (const record of records) {
    const path = Buffer.from(record);
    // Git lists a nested repository it does not descend into as one `dir/` entry.
    if (path.byteLength > 1 && path.at(-1) === 0x2f) {
      const directory = path.subarray(0, -1);
      validateRelativePath(directory);
      nestedRepositories.push(directory);
    } else {
      validateRelativePath(path);
      paths.push(path);
    }
    if (paths.length + nestedRepositories.length > maximumFiles) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }
  paths.sort((left, right) => Buffer.compare(left, right));
  nestedRepositories.sort((left, right) => Buffer.compare(left, right));
  // Nested repositories keep their `dir/` spelling in the canonical form, so their
  // appearance is still working-state movement; without one the form is unchanged.
  const canonical = pathListCanonical(
    [...paths, ...nestedRepositories.map(directory => Buffer.concat([directory, Buffer.from('/')]))].sort(
      (left, right) => Buffer.compare(left, right),
    ),
  );
  return { paths, nestedRepositories, canonical };
}

function parseDiffFiles(output: Buffer, maximumFiles: number): readonly UnstagedRecord[] {
  const records = splitBuffer(output.subarray(0, output.at(-1) === 0 ? output.byteLength - 1 : output.byteLength), 0);
  if (records.length === 1 && records[0]?.byteLength === 0) return [];
  if (records.length % 2 !== 0) {
    throw new GitInspectionError('invalid-diff-files-record');
  }
  const parsed: UnstagedRecord[] = [];
  for (let index = 0; index < records.length; index += 2) {
    const header = records[index];
    const path = records[index + 1];
    if (header === undefined || path === undefined) {
      throw new GitInspectionError('invalid-diff-files-record');
    }
    const match = header
      .toString('ascii')
      .match(/^:([0-7]{6}) ([0-7]{6}) (?:[0-9a-f]{40,64}|0{40,64}) (?:[0-9a-f]{40,64}|0{40,64}) ([A-Z])[0-9]*$/u);
    if (match === null) {
      throw new GitInspectionError('invalid-diff-files-record');
    }
    validateRelativePath(Buffer.from(path));
    parsed.push({
      path: Buffer.from(path),
      deleted: (match[2] ?? '').startsWith('0'),
    });
    if (parsed.length > maximumFiles) {
      throw new GitInspectionError('manifest-file-limit');
    }
  }
  return parsed;
}

export async function enumerateUnstaged(
  context: GitInspectionContext,
  limits: WorkspaceEvidenceLimits,
  maximumFiles: number = limits.maxManifestFiles,
): Promise<UnstagedEnumeration> {
  const result = await runGit(
    context,
    ['-c', 'core.quotePath=false', '-c', 'core.fileMode=true', 'diff-files', '--no-renames', '-z'],
    { maxStdoutBytes: limits.maxManifestBytes, allowedExitCodes: [0, 1, 128] },
  );
  if (result.exitCode !== 0) {
    throw new ComparisonResolutionError('working-unavailable');
  }
  const records = parseDiffFiles(result.stdout, maximumFiles);
  const sorted = [...records].sort((left, right) => Buffer.compare(left.path, right.path));
  const paths = new Map<string, UnstagedRecord>();
  const parts: Buffer[] = [];
  for (const record of sorted) {
    const key = record.path.toString('hex');
    if (paths.has(key)) continue;
    paths.set(key, record);
    parts.push(Buffer.from(`${record.deleted ? 'D' : 'M'}\0`, 'ascii'), record.path, Buffer.from([0]));
  }
  return { paths, canonical: Buffer.concat(parts) };
}
