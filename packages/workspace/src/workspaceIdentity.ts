import { randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  rmdir,
  stat,
  unlink,
} from 'node:fs/promises';
import { release, uptime } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  GitExecutableResolutionError,
  prepareGitInspectionContext,
  runGitProcess,
  type GitInspectionContext,
} from './gitProcess.js';
import { renameFile, syncDirectory } from './durableFiles.js';
import { tightenWindowsDirectory, userStateDirectoryFor } from './privateDirectories.js';
import { holderIsGone, inspectProcess } from './processIdentity.js';
import type {
  WorkspaceAuthorityUnavailableDiagnostic,
  WorkspaceBootstrapDiagnostic,
  WorkspaceIdentity,
} from './workspace.js';

const MARKER_FILE_NAME = 'neoflow-workspace-identity.json';
const MARKER_FORMAT_VERSION = 1;
const REGISTRY_FILE_NAME = 'workspace-registry.json';
const REGISTRY_FORMAT_VERSION = 1;
const REGISTRY_LOCK_FILE_NAME = 'workspace-registry.lock';
const REGISTRY_LOCK_ATTEMPTS = 100;
const REGISTRY_LOCK_DELAY_MS = 20;
const EMPTY_REGISTRY_LOCK_STALE_MS = 60_000;
const LOCK_OWNER_FORMAT_VERSION = 1;
const LOCK_OWNER_FILE_PATTERN = /^owner-([0-9a-f-]{36})\.json$/u;
const GIT_DIRECTORY_IDENTITY_PATTERN = /^fs:[0-9]+:[0-9]+:[0-9]+$/u;
const WORKSPACE_ID_PATTERN = /^wsp_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface GitWorktree {
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
  readonly gitDirectoryIdentity: string;
}

interface Marker {
  readonly workspaceIdentity: WorkspaceIdentity;
}

interface RegistryRegistration {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
  /** Optional only while reading a registry written by the pre-review P04 build. */
  readonly gitDirectoryIdentity: string | undefined;
}

interface Registry {
  readonly registrations: readonly RegistryRegistration[];
}

interface LockOwner {
  readonly pid: number;
  readonly nonce: string;
  readonly processIdentity: string | undefined;
}

interface ResolvedWorkspaceIdentity {
  readonly status: 'ready';
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
  readonly gitDirectory: string;
}

interface RejectedWorkspaceIdentity {
  readonly status: 'rejected';
  readonly diagnostic: WorkspaceBootstrapDiagnostic;
}

export type WorkspaceIdentityResolution = ResolvedWorkspaceIdentity | RejectedWorkspaceIdentity;

class BootstrapProblem extends Error {
  readonly diagnostic: WorkspaceBootstrapDiagnostic;

  constructor(diagnostic: WorkspaceBootstrapDiagnostic) {
    super(diagnostic.code);
    this.diagnostic = diagnostic;
  }
}

function authorityUnavailable(
  requestedPath: string,
  operation: WorkspaceAuthorityUnavailableDiagnostic['operation'],
): BootstrapProblem {
  return new BootstrapProblem({
    code: 'workspace-authority-unavailable',
    requestedPath,
    operation,
  });
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

function makeWorkspaceIdentity(value: string): WorkspaceIdentity {
  return value as WorkspaceIdentity;
}

function newWorkspaceIdentity(): WorkspaceIdentity {
  return makeWorkspaceIdentity(`wsp_${randomUUID()}`);
}

function platformDiagnostic(): WorkspaceBootstrapDiagnostic | undefined {
  if (process.platform === 'darwin' || process.platform === 'win32') return undefined;

  if (process.platform === 'linux') {
    const kernelRelease = release().toLowerCase();
    if (
      kernelRelease.includes('microsoft') &&
      !kernelRelease.includes('wsl2') &&
      !kernelRelease.includes('microsoft-standard')
    ) {
      return {
        code: 'unsupported-platform',
        platform: process.platform,
        reason: 'wsl1',
      };
    }
    return undefined;
  }

  return {
    code: 'unsupported-platform',
    platform: process.platform,
    reason: 'unsupported-operating-system',
  };
}

async function inspectStartDirectory(requestedPath: string): Promise<string> {
  let canonicalStart: string;
  try {
    canonicalStart = await realpath(requestedPath);
  } catch (error) {
    throw new BootstrapProblem({
      code: 'path-unavailable',
      requestedPath,
      reason: isErrno(error, 'ENOENT') ? 'missing' : 'unreadable',
    });
  }

  try {
    if (!(await stat(canonicalStart)).isDirectory()) {
      throw new BootstrapProblem({
        code: 'path-unavailable',
        requestedPath,
        reason: 'not-directory',
      });
    }
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw new BootstrapProblem({
      code: 'path-unavailable',
      requestedPath,
      reason: isErrno(error, 'ENOENT') ? 'missing' : 'unreadable',
    });
  }

  return canonicalStart;
}

function stripFinalLineEnding(value: string): string {
  if (value.endsWith('\r\n')) return value.slice(0, -2);
  if (value.endsWith('\n')) return value.slice(0, -1);
  return value;
}

// `--show-toplevel` and `--absolute-git-dir` are already absolute, and both
// results are canonicalized below, so no `--path-format` option is needed. That
// keeps the supported Git floor low instead of silently misreporting every
// repository as unmanaged on a Git that predates the option.
async function runGit(context: GitInspectionContext, argument: string): Promise<string> {
  const result = await runGitProcess({
    executable: context.executable,
    checkout: context.checkout,
    arguments: ['-C', context.checkout, 'rev-parse', argument],
    environment: context.environment,
    maxStdoutBytes: 64 * 1024,
    timeoutMilliseconds: DEFAULT_GIT_PROCESS_TIMEOUT_MILLISECONDS,
  });
  return stripFinalLineEnding(result.stdout.toString('utf8'));
}

type GitBoundaryEvidence = 'absent' | 'present' | 'inaccessible';

/**
 * Git's "not a git repository" text is ambiguous: it is also emitted for an
 * unreadable `.git` directory and a broken gitfile. Filesystem evidence keeps
 * those damaged repositories from being mistaken for unmanaged directories.
 */
async function inspectGitBoundary(canonicalStart: string): Promise<GitBoundaryEvidence> {
  let current = canonicalStart;
  while (true) {
    const candidate = path.join(current, '.git');
    try {
      const entry = await lstat(candidate);
      try {
        await access(candidate, fsConstants.R_OK | (entry.isDirectory() ? fsConstants.X_OK : 0));
      } catch (error) {
        if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) {
          return 'inaccessible';
        }
      }
      return 'present';
    } catch (error) {
      if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) {
        return 'inaccessible';
      }
      if (!isErrno(error, 'ENOENT') && !isErrno(error, 'ENOTDIR')) {
        return 'present';
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return 'absent';
    current = parent;
  }
}

function gitFailure(requestedPath: string, error: unknown, boundaryEvidence: GitBoundaryEvidence): BootstrapProblem {
  // Resolution failures and spawn ENOENT both mean the process cannot use the
  // selected executable; neither describes a checkout path disappearing.
  if (error instanceof GitExecutableResolutionError || isErrno(error, 'ENOENT')) {
    return new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'git-unavailable',
    });
  }

  const details = error as { readonly stderr?: unknown };
  const stderr =
    typeof details?.stderr === 'string'
      ? details.stderr.toLowerCase()
      : Buffer.isBuffer(details?.stderr)
        ? details.stderr.toString('utf8').toLowerCase()
        : '';

  if (
    boundaryEvidence === 'inaccessible' ||
    stderr.includes('dubious ownership') ||
    stderr.includes('permission denied')
  ) {
    return new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'repository-inaccessible',
    });
  }

  if (boundaryEvidence === 'absent' && stderr.includes('not a git repository')) {
    return new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
  }

  return new BootstrapProblem({
    code: 'git-inspection-failed',
    requestedPath,
    reason: 'inspection-failed',
  });
}

function filesystemIdentity(status: {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly birthtimeNs: bigint;
}): string {
  return `fs:${status.dev}:${status.ino}:${status.birthtimeNs}`;
}

interface DiscoveredGitDirectory {
  readonly checkout: string;
  readonly gitDirectory: string;
}

// Discovery is filesystem-only so no repository-aware Git command can run
// before the controlled inspection context exists.
async function discoverGitDirectory(canonicalStart: string): Promise<DiscoveredGitDirectory | undefined> {
  let current = canonicalStart;
  while (true) {
    const candidate = path.join(current, '.git');
    try {
      const entry = await lstat(candidate);
      if (entry.isDirectory()) {
        return {
          checkout: current,
          gitDirectory: await realpath(candidate),
        };
      }
      if (entry.isFile()) {
        const contents = await readFile(candidate, 'utf8');
        const match = /^gitdir: (.+)$/mu.exec(contents.trimEnd());
        if (match?.[1] === undefined) return undefined;
        return {
          checkout: current,
          gitDirectory: await realpath(path.resolve(current, match[1])),
        };
      }
    } catch (error) {
      if (
        !isErrno(error, 'ENOENT') &&
        !isErrno(error, 'ENOTDIR') &&
        !isErrno(error, 'EACCES') &&
        !isErrno(error, 'EPERM')
      ) {
        return undefined;
      }
      if (isErrno(error, 'EACCES') || isErrno(error, 'EPERM')) return undefined;
    }

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function looksLikeBareGitDirectory(directory: string): Promise<boolean> {
  try {
    const [head, objects, refs] = await Promise.all([
      stat(path.join(directory, 'HEAD')),
      stat(path.join(directory, 'objects')),
      stat(path.join(directory, 'refs')),
    ]);
    return head.isFile() && objects.isDirectory() && refs.isDirectory();
  } catch {
    return false;
  }
}

async function inspectGitWorktree(requestedPath: string): Promise<GitWorktree> {
  const canonicalStart = await inspectStartDirectory(requestedPath);
  const boundaryEvidence = await inspectGitBoundary(canonicalStart);
  const discovered = await discoverGitDirectory(canonicalStart);
  if (discovered === undefined) {
    if (boundaryEvidence === 'absent') {
      let current = canonicalStart;
      while (true) {
        if (await looksLikeBareGitDirectory(current)) {
          throw new BootstrapProblem({
            code: 'bare-git-repository',
            requestedPath,
          });
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
      }
      throw new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
    }
    throw new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: boundaryEvidence === 'inaccessible' ? 'repository-inaccessible' : 'inspection-failed',
    });
  }

  const canonicalCheckout = await realpath(discovered.checkout).catch((error: unknown) => {
    throw gitFailure(requestedPath, error, boundaryEvidence);
  });
  const candidateGitDirectory = discovered.gitDirectory;
  const candidateStatus = await stat(candidateGitDirectory, { bigint: true }).catch((error: unknown) => {
    throw gitFailure(requestedPath, error, boundaryEvidence);
  });
  if (!candidateStatus.isDirectory()) {
    throw new BootstrapProblem({
      code: 'git-inspection-failed',
      requestedPath,
      reason: 'inspection-failed',
    });
  }

  // A directory containing HEAD, objects, and refs but no enclosing `.git`
  // boundary is a bare repository. Reject it before forcing a work tree into
  // the controlled inspection environment.
  if (boundaryEvidence === 'absent') {
    throw new BootstrapProblem({
      code: 'bare-git-repository',
      requestedPath,
    });
  }

  let context: GitInspectionContext | undefined;
  try {
    context = await prepareGitInspectionContext(canonicalCheckout, candidateGitDirectory);
    const [isBare, isInsideWorktree, checkout] = await Promise.all([
      runGit(context, '--is-bare-repository'),
      runGit(context, '--is-inside-work-tree'),
      runGit(context, '--show-toplevel'),
    ]);

    if (isBare === 'true') {
      throw new BootstrapProblem({
        code: 'bare-git-repository',
        requestedPath,
      });
    }
    if (isBare !== 'false') {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inspection-failed',
      });
    }
    if (isInsideWorktree !== 'true') {
      throw new BootstrapProblem({ code: 'not-git-worktree', requestedPath });
    }
    if (checkout.length === 0) {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inconsistent-worktree',
      });
    }

    const inspectedCheckout = await realpath(path.resolve(canonicalCheckout, checkout)).catch(() => undefined);
    if (inspectedCheckout !== canonicalCheckout) {
      throw new BootstrapProblem({
        code: 'git-inspection-failed',
        requestedPath,
        reason: 'inconsistent-worktree',
      });
    }
    return {
      canonicalCheckout,
      gitDirectory: candidateGitDirectory,
      gitDirectoryIdentity: filesystemIdentity(candidateStatus),
    };
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw gitFailure(requestedPath, error, boundaryEvidence);
  } finally {
    await context?.dispose().catch(() => undefined);
  }
}

/** Shared only inside the Workspace owner; callers never receive this path. */
export function userStateDirectory(requestedPath: string): string {
  const directory = userStateDirectoryFor();
  if (directory === undefined) throw authorityUnavailable(requestedPath, 'resolve-user-state');
  return directory;
}

async function wait(delayMilliseconds: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, delayMilliseconds);
  });
}

function parseLockOwner(content: string, expectedNonce: string): LockOwner | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const record = objectRecord(parsed);
  if (
    !record ||
    record.formatVersion !== LOCK_OWNER_FORMAT_VERSION ||
    typeof record.pid !== 'number' ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    record.nonce !== expectedNonce ||
    (record.processIdentity !== undefined &&
      (typeof record.processIdentity !== 'string' || record.processIdentity.length === 0))
  ) {
    return undefined;
  }

  return {
    pid: record.pid,
    nonce: expectedNonce,
    processIdentity: typeof record.processIdentity === 'string' ? record.processIdentity : undefined,
  };
}

async function removeOwnerAndLockDirectory(
  lockDirectory: string,
  ownerFile: string,
  requestedPath: string,
): Promise<boolean> {
  try {
    await unlink(path.join(lockDirectory, ownerFile));
  } catch (error) {
    // Another contender may already have removed the old directory. The unique
    // owner filename prevents this attempt from touching a replacement lock.
    if (isErrno(error, 'ENOENT')) return true;
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }

  try {
    await rmdir(lockDirectory);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return true;
    // A replacement lock is non-empty, so rmdir cannot remove it. This is the
    // ownership check that a single stale lock file could not provide.
    if (isErrno(error, 'ENOTEMPTY') || isErrno(error, 'EEXIST')) return false;
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }
}

/** Removes only an empty setup abandoned before an owner record was installed. */
async function removeEmptyLockDirectory(
  lockDirectory: string,
  lockAgeMilliseconds: number,
  requestedPath: string,
): Promise<boolean> {
  if (lockAgeMilliseconds <= EMPTY_REGISTRY_LOCK_STALE_MS) return false;
  try {
    await rmdir(lockDirectory);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return true;
    if (isErrno(error, 'ENOTEMPTY') || isErrno(error, 'EEXIST')) return false;
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }
}

async function removeAbandonedLegacyLock(
  lockFile: string,
  lockStatus: Awaited<ReturnType<typeof lstat>>,
  requestedPath: string,
): Promise<boolean> {
  let holder: number | undefined;
  try {
    const record = objectRecord(JSON.parse(await readFile(lockFile, 'utf8')));
    if (typeof record?.pid === 'number' && Number.isSafeInteger(record.pid) && record.pid > 0) {
      holder = record.pid;
    }
  } catch {
    // A pre-review starter could crash while writing its single lock file.
  }

  const predatesCurrentBoot = lockStatus.mtimeMs < Date.now() - uptime() * 1000 - 60_000;
  const abandoned = holder === undefined ? predatesCurrentBoot : holderIsGone(holder) || predatesCurrentBoot;
  if (!abandoned) return false;

  try {
    await unlink(lockFile);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return true;
    // unlink cannot remove the replacement directory installed by this build.
    try {
      if ((await lstat(lockFile)).isDirectory()) return false;
    } catch (inspectionError) {
      if (isErrno(inspectionError, 'ENOENT')) return true;
    }
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }
}

/**
 * Clears a lock only when its exact process instance is gone. The owner lives
 * in a uniquely named file inside a lock directory: removing that file and then
 * using non-recursive rmdir cannot delete a replacement owner's non-empty lock,
 * closing both stale-takeover and normal-release ABA races.
 */
async function removeAbandonedRegistryLock(lockDirectory: string, requestedPath: string): Promise<boolean> {
  let lockStatus: Awaited<ReturnType<typeof lstat>>;
  let entries: string[];
  try {
    lockStatus = await lstat(lockDirectory);
    if (!lockStatus.isDirectory()) {
      return lockStatus.isFile() ? removeAbandonedLegacyLock(lockDirectory, lockStatus, requestedPath) : false;
    }
    entries = await readdir(lockDirectory);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return true;
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }

  const lockAgeMilliseconds = Date.now() - lockStatus.mtimeMs;
  if (entries.length === 0) {
    return removeEmptyLockDirectory(lockDirectory, lockAgeMilliseconds, requestedPath);
  }
  if (entries.length !== 1) return false;

  const ownerFile = entries[0];
  if (!ownerFile) return false;
  const ownerMatch = LOCK_OWNER_FILE_PATTERN.exec(ownerFile);
  const ownerNonce = ownerMatch?.[1];
  if (!ownerNonce) return false;

  let owner: LockOwner | undefined;
  try {
    owner = parseLockOwner(await readFile(path.join(lockDirectory, ownerFile), 'utf8'), ownerNonce);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return true;
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }

  if (!owner) {
    // A crash can leave a partial owner record. Its creator verifies the record
    // before entering, so an old malformed record is safe to remove by name.
    return lockAgeMilliseconds > EMPTY_REGISTRY_LOCK_STALE_MS
      ? removeOwnerAndLockDirectory(lockDirectory, ownerFile, requestedPath)
      : false;
  }

  const holder = owner.processIdentity === undefined ? undefined : await inspectProcess(owner.pid);
  const abandoned =
    holder === undefined
      ? holderIsGone(owner.pid)
      : holder.status === 'gone' || (holder.identity !== undefined && owner.processIdentity !== holder.identity);
  return abandoned ? removeOwnerAndLockDirectory(lockDirectory, ownerFile, requestedPath) : false;
}

async function acquireRegistryLock(lockDirectory: string, requestedPath: string): Promise<string | undefined> {
  const nonce = randomUUID();
  const ownerFile = `owner-${nonce}.json`;
  const currentProcess = await inspectProcess(process.pid);
  const processIdentity = currentProcess.status === 'running' ? currentProcess.identity : undefined;

  for (let attempt = 0; attempt < REGISTRY_LOCK_ATTEMPTS; attempt += 1) {
    try {
      await mkdir(lockDirectory, { mode: 0o700 });
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) {
        throw authorityUnavailable(requestedPath, 'lock-registry');
      }
      if (await removeAbandonedRegistryLock(lockDirectory, requestedPath)) {
        continue;
      }
      await wait(REGISTRY_LOCK_DELAY_MS);
      continue;
    }

    const ownerPath = path.join(lockDirectory, ownerFile);
    let ownerHandle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      ownerHandle = await open(ownerPath, 'wx', 0o600);
      const serializedOwner = `${JSON.stringify({
        formatVersion: LOCK_OWNER_FORMAT_VERSION,
        pid: process.pid,
        nonce,
        processIdentity,
      })}\n`;
      await ownerHandle.writeFile(serializedOwner, 'utf8');
      await ownerHandle.sync();
      await ownerHandle.close();
      ownerHandle = undefined;

      const installedOwner = parseLockOwner(await readFile(ownerPath, 'utf8'), nonce);
      if (!installedOwner || installedOwner.pid !== process.pid || installedOwner.processIdentity !== processIdentity) {
        throw new Error('Registry lock owner verification failed');
      }
      return ownerFile;
    } catch {
      await ownerHandle?.close().catch(() => undefined);
      await unlink(ownerPath).catch(() => undefined);
      await rmdir(lockDirectory).catch(() => undefined);
      throw authorityUnavailable(requestedPath, 'lock-registry');
    }
  }

  return undefined;
}

async function releaseRegistryLock(lockDirectory: string, ownerFile: string): Promise<void> {
  let removedOwnRecord = false;
  try {
    await unlink(path.join(lockDirectory, ownerFile));
    removedOwnRecord = true;
  } catch {
    // Never remove the directory if this process no longer owns its unique
    // record; it may already belong to a replacement starter.
  }
  if (removedOwnRecord) {
    await rmdir(lockDirectory).catch(() => undefined);
  }
}

async function withRegistryLock<T>(stateDirectory: string, requestedPath: string, work: () => Promise<T>): Promise<T> {
  try {
    await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
    await chmod(stateDirectory, 0o700);
    tightenWindowsDirectory(stateDirectory);
  } catch {
    throw authorityUnavailable(requestedPath, 'lock-registry');
  }

  const lockDirectory = path.join(stateDirectory, REGISTRY_LOCK_FILE_NAME);
  const ownerFile = await acquireRegistryLock(lockDirectory, requestedPath);
  if (!ownerFile) {
    throw new BootstrapProblem({ code: 'workspace-registry-busy' });
  }

  try {
    return await work();
  } finally {
    await releaseRegistryLock(lockDirectory, ownerFile);
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseMarker(content: string): Marker | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const record = objectRecord(parsed);
  if (
    !record ||
    record.formatVersion !== MARKER_FORMAT_VERSION ||
    typeof record.workspaceIdentity !== 'string' ||
    !WORKSPACE_ID_PATTERN.test(record.workspaceIdentity)
  ) {
    return undefined;
  }

  return {
    workspaceIdentity: makeWorkspaceIdentity(record.workspaceIdentity),
  };
}

async function readMarker(markerFile: string, requestedPath: string): Promise<Marker | 'missing' | 'invalid'> {
  try {
    const marker = parseMarker(await readFile(markerFile, 'utf8'));
    return marker ?? 'invalid';
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return 'missing';
    throw authorityUnavailable(requestedPath, 'read-marker');
  }
}

async function installMarker(
  markerFile: string,
  proposedIdentity: WorkspaceIdentity,
  canonicalCheckout: string,
  requestedPath: string,
): Promise<WorkspaceIdentity> {
  const temporaryFile = path.join(path.dirname(markerFile), `.${MARKER_FILE_NAME}.${randomUUID()}.tmp`);
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryHandle = await open(temporaryFile, 'wx', 0o600);
    await temporaryHandle.writeFile(
      `${JSON.stringify({
        formatVersion: MARKER_FORMAT_VERSION,
        workspaceIdentity: proposedIdentity,
      })}\n`,
      'utf8',
    );
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    try {
      await link(temporaryFile, markerFile);
      return proposedIdentity;
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error;
      const existing = await readMarker(markerFile, requestedPath);
      if (existing === 'missing' || existing === 'invalid') {
        throw new BootstrapProblem({
          code: 'workspace-marker-invalid',
          canonicalCheckout,
        });
      }
      return existing.workspaceIdentity;
    }
  } catch (error) {
    if (error instanceof BootstrapProblem) throw error;
    throw authorityUnavailable(requestedPath, 'write-marker');
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

function parseRegistry(content: string): Registry {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }

  const record = objectRecord(parsed);
  if (!record || typeof record.formatVersion !== 'number') {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }
  if (record.formatVersion !== REGISTRY_FORMAT_VERSION) {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'unsupported-version',
    });
  }
  if (!Array.isArray(record.registrations)) {
    throw new BootstrapProblem({
      code: 'workspace-registry-invalid',
      reason: 'malformed',
    });
  }

  const registrations: RegistryRegistration[] = [];
  const identities = new Set<string>();
  const gitDirectories = new Set<string>();
  for (const value of record.registrations) {
    const registration = objectRecord(value);
    if (
      !registration ||
      typeof registration.workspaceIdentity !== 'string' ||
      !WORKSPACE_ID_PATTERN.test(registration.workspaceIdentity) ||
      typeof registration.canonicalCheckout !== 'string' ||
      !path.isAbsolute(registration.canonicalCheckout) ||
      typeof registration.gitDirectory !== 'string' ||
      !path.isAbsolute(registration.gitDirectory) ||
      (registration.gitDirectoryIdentity !== undefined &&
        (typeof registration.gitDirectoryIdentity !== 'string' ||
          !GIT_DIRECTORY_IDENTITY_PATTERN.test(registration.gitDirectoryIdentity))) ||
      identities.has(registration.workspaceIdentity) ||
      gitDirectories.has(registration.gitDirectory)
    ) {
      throw new BootstrapProblem({
        code: 'workspace-registry-invalid',
        reason: 'invalid-registration',
      });
    }

    identities.add(registration.workspaceIdentity);
    gitDirectories.add(registration.gitDirectory);
    registrations.push({
      workspaceIdentity: makeWorkspaceIdentity(registration.workspaceIdentity),
      canonicalCheckout: registration.canonicalCheckout,
      gitDirectory: registration.gitDirectory,
      gitDirectoryIdentity:
        typeof registration.gitDirectoryIdentity === 'string' ? registration.gitDirectoryIdentity : undefined,
    });
  }

  return { registrations };
}

async function readRegistry(registryFile: string, requestedPath: string): Promise<Registry> {
  try {
    return parseRegistry(await readFile(registryFile, 'utf8'));
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return { registrations: [] };
    if (error instanceof BootstrapProblem) throw error;
    throw authorityUnavailable(requestedPath, 'read-registry');
  }
}

async function writeRegistry(registryFile: string, registry: Registry, requestedPath: string): Promise<void> {
  const registryDirectory = path.dirname(registryFile);
  const temporaryFile = path.join(registryDirectory, `.${REGISTRY_FILE_NAME}.${randomUUID()}.tmp`);
  let temporaryHandle: Awaited<ReturnType<typeof open>> | undefined;

  try {
    temporaryHandle = await open(temporaryFile, 'wx', 0o600);
    await temporaryHandle.writeFile(
      `${JSON.stringify(
        {
          formatVersion: REGISTRY_FORMAT_VERSION,
          registrations: registry.registrations,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;
    await renameFile(temporaryFile, registryFile);
    await chmod(registryFile, 0o600);
    // The registry names Workspace identity authority. Do not report readiness
    // until the directory entry replacing it is durable as well as its bytes.
    await syncDirectory(registryDirectory);
  } catch {
    throw authorityUnavailable(requestedPath, 'write-registry');
  } finally {
    await temporaryHandle?.close().catch(() => undefined);
    await rm(temporaryFile, { force: true }).catch(() => undefined);
  }
}

async function exists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return false;
    throw error;
  }
}

function markerFileFor(gitDirectory: string): string {
  return path.join(gitDirectory, MARKER_FILE_NAME);
}

async function pathStillExists(target: string, requestedPath: string): Promise<boolean> {
  try {
    return await exists(target);
  } catch {
    throw authorityUnavailable(requestedPath, 'read-marker');
  }
}

function registrationMatchesAdministration(registration: RegistryRegistration, worktree: GitWorktree): boolean {
  return registration.gitDirectoryIdentity === undefined
    ? registration.gitDirectory === worktree.gitDirectory
    : registration.gitDirectoryIdentity === worktree.gitDirectoryIdentity;
}

async function oldRegistrationStillExists(registration: RegistryRegistration, requestedPath: string): Promise<boolean> {
  if (registration.gitDirectoryIdentity !== undefined) {
    let oldDirectoryStatus: Awaited<ReturnType<typeof stat>>;
    try {
      oldDirectoryStatus = await stat(registration.gitDirectory, {
        bigint: true,
      });
    } catch (error) {
      if (isErrno(error, 'ENOENT')) return false;
      throw authorityUnavailable(requestedPath, 'read-marker');
    }
    if (
      !oldDirectoryStatus.isDirectory() ||
      filesystemIdentity(oldDirectoryStatus) !== registration.gitDirectoryIdentity
    ) {
      return false;
    }

    const oldMarker = await readMarker(markerFileFor(registration.gitDirectory), requestedPath);
    return (
      oldMarker !== 'missing' &&
      oldMarker !== 'invalid' &&
      oldMarker.workspaceIdentity === registration.workspaceIdentity
    );
  }

  // Pre-review registries did not record administration generations. Preserve
  // their conservative collision behavior until a successful start enriches
  // the registration.
  const oldMarker = await readMarker(markerFileFor(registration.gitDirectory), requestedPath);
  if (
    oldMarker !== 'missing' &&
    oldMarker !== 'invalid' &&
    oldMarker.workspaceIdentity === registration.workspaceIdentity
  ) {
    return true;
  }
  return (
    (await pathStillExists(registration.canonicalCheckout, requestedPath)) ||
    (await pathStillExists(registration.gitDirectory, requestedPath))
  );
}

/**
 * Reconciles the registry with the marker that has already been read. The
 * marker is the identity authority, while the recorded administration
 * generation distinguishes a moved worktree from a recycled path. The registry
 * refuses both an identity live under another generation and one generation
 * claimed by two surviving checkouts.
 */
async function registerIdentity(
  registry: Registry,
  identity: WorkspaceIdentity,
  worktree: GitWorktree,
  requestedPath: string,
): Promise<Registry> {
  const registrationForAdministration = registry.registrations.find(registration =>
    registrationMatchesAdministration(registration, worktree),
  );
  if (
    registrationForAdministration &&
    registrationForAdministration.workspaceIdentity !== identity &&
    registrationForAdministration.canonicalCheckout !== worktree.canonicalCheckout &&
    (await pathStillExists(registrationForAdministration.canonicalCheckout, requestedPath))
  ) {
    throw new BootstrapProblem({
      code: 'workspace-identity-collision',
      reason: 'registered-worktree-mismatch',
      workspaceIdentity: identity,
      registeredCheckout: registrationForAdministration.canonicalCheckout,
      attemptedCheckout: worktree.canonicalCheckout,
    });
  }

  const existing = registry.registrations.find(registration => registration.workspaceIdentity === identity);
  if (existing) {
    if (registrationMatchesAdministration(existing, worktree)) {
      if (
        existing.canonicalCheckout === worktree.canonicalCheckout &&
        existing.gitDirectory === worktree.gitDirectory &&
        existing.gitDirectoryIdentity === worktree.gitDirectoryIdentity
      ) {
        return registry;
      }

      // A moved worktree leaves nothing behind; a copied checkout whose `.git`
      // file still points at this administration generation does.
      if (
        existing.canonicalCheckout !== worktree.canonicalCheckout &&
        (await pathStillExists(existing.canonicalCheckout, requestedPath))
      ) {
        throw new BootstrapProblem({
          code: 'workspace-identity-collision',
          reason: 'registered-worktree-mismatch',
          workspaceIdentity: identity,
          registeredCheckout: existing.canonicalCheckout,
          attemptedCheckout: worktree.canonicalCheckout,
        });
      }
    } else if (await oldRegistrationStillExists(existing, requestedPath)) {
      throw new BootstrapProblem({
        code: 'workspace-identity-collision',
        reason: 'duplicate-marker',
        workspaceIdentity: identity,
        registeredCheckout: existing.canonicalCheckout,
        attemptedCheckout: worktree.canonicalCheckout,
      });
    }
  }

  const retained = registry.registrations.filter(
    registration =>
      registration.workspaceIdentity !== identity &&
      registration.gitDirectory !== worktree.gitDirectory &&
      !registrationMatchesAdministration(registration, worktree),
  );
  return {
    registrations: [
      ...retained,
      {
        workspaceIdentity: identity,
        canonicalCheckout: worktree.canonicalCheckout,
        gitDirectory: worktree.gitDirectory,
        gitDirectoryIdentity: worktree.gitDirectoryIdentity,
      },
    ],
  };
}

async function resolveUnderLock(
  worktree: GitWorktree,
  stateDirectory: string,
  requestedPath: string,
): Promise<WorkspaceIdentity> {
  const registryFile = path.join(stateDirectory, REGISTRY_FILE_NAME);
  const registry = await readRegistry(registryFile, requestedPath);
  const markerFile = markerFileFor(worktree.gitDirectory);
  const marker = await readMarker(markerFile, requestedPath);

  if (marker === 'invalid') {
    throw new BootstrapProblem({
      code: 'workspace-marker-invalid',
      canonicalCheckout: worktree.canonicalCheckout,
    });
  }

  let identity: WorkspaceIdentity;
  if (marker === 'missing') {
    const registrationForAdministration = registry.registrations.find(registration =>
      registrationMatchesAdministration(registration, worktree),
    );
    if (registrationForAdministration) {
      // Missing authority for a known administration generation is ambiguous:
      // silently minting would make its existing state look like an empty
      // Workspace. Recycled paths have a different generation and remain new.
      throw new BootstrapProblem({
        code: 'workspace-marker-missing',
        canonicalCheckout: worktree.canonicalCheckout,
      });
    }
    identity = await installMarker(markerFile, newWorkspaceIdentity(), worktree.canonicalCheckout, requestedPath);
  } else {
    identity = marker.workspaceIdentity;
  }

  try {
    // The marker is Workspace identity authority. Its same-directory hard-link
    // publication is atomic, but authority cannot return until that directory
    // entry is durable too. Reconfirm existing markers so pre-barrier installs
    // and recovery after a failed sync cross the same boundary.
    await syncDirectory(path.dirname(markerFile));
  } catch {
    throw authorityUnavailable(requestedPath, 'write-marker');
  }

  const updatedRegistry = await registerIdentity(registry, identity, worktree, requestedPath);
  if (updatedRegistry !== registry) {
    await writeRegistry(registryFile, updatedRegistry, requestedPath);
  }

  return identity;
}

export async function resolveWorkspaceIdentity(requestedPath: string): Promise<WorkspaceIdentityResolution> {
  const unsupportedPlatform = platformDiagnostic();
  if (unsupportedPlatform) {
    return { status: 'rejected', diagnostic: unsupportedPlatform };
  }

  try {
    const worktree = await inspectGitWorktree(requestedPath);
    const stateDirectory = userStateDirectory(requestedPath);
    const workspaceIdentity = await withRegistryLock(stateDirectory, requestedPath, () =>
      resolveUnderLock(worktree, stateDirectory, requestedPath),
    );

    return {
      status: 'ready',
      workspaceIdentity,
      canonicalCheckout: worktree.canonicalCheckout,
      gitDirectory: worktree.gitDirectory,
    };
  } catch (error) {
    if (error instanceof BootstrapProblem) {
      return { status: 'rejected', diagnostic: error.diagnostic };
    }
    return {
      status: 'rejected',
      diagnostic: {
        code: 'workspace-authority-unavailable',
        requestedPath,
        operation: 'read-marker',
      },
    };
  }
}
