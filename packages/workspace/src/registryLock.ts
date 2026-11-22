import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { uptime } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { BootstrapProblem, authorityUnavailable } from './bootstrapProblem.js';
import { tightenWindowsDirectory } from './privateDirectories.js';
import { holderIsGone, inspectProcess } from './processIdentity.js';
import { isRecord } from './recordCodec.js';
import { LOCK_OWNER_FORMAT_VERSION, parseLockOwner, type LockOwner } from './workspaceLockOwner.js';

/**
 * The Workspace registry lock: one starter at a time reads and writes the
 * registry in the user's State directory.
 */

const REGISTRY_LOCK_FILE_NAME = 'workspace-registry.lock';
const REGISTRY_LOCK_ATTEMPTS = 100;
const REGISTRY_LOCK_DELAY_MS = 20;
const EMPTY_REGISTRY_LOCK_STALE_MS = 60_000;
const LOCK_OWNER_FILE_PATTERN = /^owner-([0-9a-f-]{36})\.json$/u;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

/**
 * Windows keeps a removed file or directory until the last handle to it
 * closes, and meanwhile refuses to create, open or list it with `EPERM`;
 * POSIX removes the name at once. Under contention that is another starter
 * mid-removal, so the lock waits and retries instead of refusing.
 */
function deletePending(error: unknown): boolean {
  return process.platform === 'win32' && isErrno(error, 'EPERM');
}

async function wait(delayMilliseconds: number): Promise<void> {
  await new Promise<void>(resolve => {
    setTimeout(resolve, delayMilliseconds);
  });
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
    if (deletePending(error)) return false;
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
    const record: unknown = JSON.parse(await readFile(lockFile, 'utf8'));
    if (isRecord(record) && typeof record.pid === 'number' && Number.isSafeInteger(record.pid) && record.pid > 0) {
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
    if (deletePending(error)) return false;
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
    if (deletePending(error)) return false;
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
      if (deletePending(error)) {
        await wait(REGISTRY_LOCK_DELAY_MS);
        continue;
      }
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

/** Runs `work` holding the registry lock in `stateDirectory`, which it creates private. */
export async function withRegistryLock<T>(
  stateDirectory: string,
  requestedPath: string,
  work: () => Promise<T>,
): Promise<T> {
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
