import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, rm } from 'node:fs/promises';
import { createConnection, type Server } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { isMainThread } from 'node:worker_threads';

import type { WorkspaceIdentity } from '@buildframe/workspace';

import { RuntimeLocationProblem, type OwnedEndpoint, type RuntimeLocation } from './runtimeLocationProblem.js';
import {
  listenWindowsEndpoint,
  prepareWindowsRuntimeDirectory,
  secureWindowsEndpoint,
  validateWindowsRuntimeEndpoint,
  windowsRuntimeLocation,
} from './windowsRuntimeEndpoint.js';

export {
  RuntimeLocationProblem,
  type RuntimeLocation,
  type RuntimeLocationProblemCode,
} from './runtimeLocationProblem.js';

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_SOCKET_MODE = 0o600;
const MAX_UNIX_ENDPOINT_BYTES = 100;

/** macOS and Linux; Windows has no user id and proves the endpoint by handshake instead. */
function currentUserId(): number {
  if ((process.platform !== 'darwin' && process.platform !== 'linux') || process.getuid === undefined) {
    throw new RuntimeLocationProblem('unsupported-platform');
  }
  return process.getuid();
}

function workspaceDigest(workspaceIdentity: WorkspaceIdentity): string {
  return createHash('sha256').update(workspaceIdentity, 'utf8').digest('hex').slice(0, 32);
}

function locationUnder(base: string, workspaceIdentity: WorkspaceIdentity, ownedBase: boolean): RuntimeLocation {
  const directory = path.join(base, 'buildframe');
  return {
    directory,
    endpoint: path.join(directory, `w-${workspaceDigest(workspaceIdentity)}.sock`),
    ...(ownedBase ? { ownedBase: base } : {}),
  };
}

/** Private endpoint discovery. No caller receives this locator. */
export function runtimeLocationForWorkspace(workspaceIdentity: WorkspaceIdentity): RuntimeLocation {
  if (process.platform === 'win32') return windowsRuntimeLocation(workspaceDigest(workspaceIdentity));
  const userId = currentUserId();
  const configuredBase = process.env.XDG_RUNTIME_DIR;
  if (configuredBase !== undefined && path.isAbsolute(configuredBase)) {
    const configured = locationUnder(configuredBase, workspaceIdentity, false);
    if (Buffer.byteLength(configured.endpoint, 'utf8') <= MAX_UNIX_ENDPOINT_BYTES) {
      return configured;
    }
  }

  const fallback = locationUnder(`/tmp/buildframe-${userId}`, workspaceIdentity, true);
  if (Buffer.byteLength(fallback.endpoint, 'utf8') > MAX_UNIX_ENDPOINT_BYTES) {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
  return fallback;
}

function assertOwner(userId: number, ownerId: number): void {
  if (ownerId !== userId) {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
}

function isPrivateDirectory(
  stats: { isDirectory(): boolean; isSymbolicLink(): boolean; uid: bigint; mode: bigint },
  userId: number,
): boolean {
  return (
    stats.isDirectory() &&
    !stats.isSymbolicLink() &&
    Number(stats.uid) === userId &&
    (Number(stats.mode) & 0o777) === PRIVATE_DIRECTORY_MODE
  );
}

/** Creates `directory` if needed, then makes sure it is ours and owner-private. */
async function preparePrivateDirectory(directory: string, userId: number): Promise<void> {
  try {
    await mkdir(directory, { mode: PRIVATE_DIRECTORY_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new RuntimeLocationProblem('runtime-directory-insecure');
    }
  }

  const before = await lstat(directory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
  assertOwner(userId, Number(before.uid));

  await chmod(directory, PRIVATE_DIRECTORY_MODE);
  if (!isPrivateDirectory(await lstat(directory, { bigint: true }), userId)) {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
}

export async function preparePrivateRuntimeDirectory(location: RuntimeLocation): Promise<void> {
  if (process.platform === 'win32') {
    await prepareWindowsRuntimeDirectory(location.directory);
    return;
  }
  const userId = currentUserId();
  if (location.ownedBase !== undefined) {
    await preparePrivateDirectory(location.ownedBase, userId);
  } else {
    await mkdir(path.dirname(location.directory), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  }
  await preparePrivateDirectory(location.directory, userId);
}

export async function validatePrivateRuntimeEndpoint(location: RuntimeLocation): Promise<void> {
  if (process.platform === 'win32') {
    await validateWindowsRuntimeEndpoint(location);
    return;
  }
  const userId = currentUserId();
  const privateDirectories =
    location.ownedBase === undefined ? [location.directory] : [location.ownedBase, location.directory];
  for (const privateDirectory of privateDirectories) {
    let directory;
    try {
      directory = await lstat(privateDirectory, { bigint: true });
    } catch {
      throw new RuntimeLocationProblem('runtime-endpoint-missing');
    }
    if (!isPrivateDirectory(directory, userId)) {
      throw new RuntimeLocationProblem('runtime-directory-insecure');
    }
  }

  let endpoint;
  try {
    endpoint = await lstat(location.endpoint, { bigint: true });
  } catch {
    throw new RuntimeLocationProblem('runtime-endpoint-missing');
  }

  if (
    !endpoint.isSocket() ||
    endpoint.isSymbolicLink() ||
    Number(endpoint.uid) !== userId ||
    (Number(endpoint.mode) & 0o777) !== PRIVATE_SOCKET_MODE
  ) {
    throw new RuntimeLocationProblem('runtime-endpoint-insecure');
  }
}

const STALE_ENDPOINT_PROBE_TIMEOUT_MS = 250;

function endpointProbe(location: RuntimeLocation): Promise<'active' | 'stale' | 'missing'> {
  return new Promise(resolve => {
    const socket = createConnection(location.endpoint);
    let settled = false;
    const finish = (result: 'active' | 'stale' | 'missing'): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => finish('active'), STALE_ENDPOINT_PROBE_TIMEOUT_MS);
    timer.unref();
    socket.once('connect', () => finish('active'));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED') finish('stale');
      else if (error.code === 'ENOENT') finish('missing');
      else finish('active');
    });
  });
}

/**
 * Removes only an owner-private socket proven stale while the caller holds the
 * independent Workspace writer lease. A reachable or uncertain endpoint is
 * never replaced.
 */
export async function removeStaleRuntimeEndpoint(location: RuntimeLocation): Promise<'missing' | 'removed'> {
  // A pipe disappears with its process, and a left-over secret is replaced
  // when the next runtime publishes its own; a live runtime keeps the pipe
  // name, so the next one fails to bind (`runtime-already-active`).
  if (process.platform === 'win32') return 'missing';
  try {
    await validatePrivateRuntimeEndpoint(location);
  } catch (error) {
    if (error instanceof RuntimeLocationProblem && error.code === 'runtime-endpoint-missing') {
      return 'missing';
    }
    throw error;
  }

  const endpoint = await lstat(location.endpoint, { bigint: true });
  const owned: OwnedEndpoint = { device: endpoint.dev, inode: endpoint.ino };
  const probe = await endpointProbe(location);
  if (probe === 'active') {
    throw new RuntimeLocationProblem('runtime-endpoint-active');
  }
  if (probe === 'missing') return 'missing';

  await removeOwnedEndpoint(location, owned);
  return 'removed';
}

/**
 * Binds the endpoint already owner-private. Without this the socket exists
 * with the default umask until `secureBoundEndpoint` tightens it, and a
 * connector checking in that gap sees an insecure runtime and stops retrying.
 * A Unix socket binds synchronously inside `listen()`, so the narrowed process
 * umask is restored before any other file is created.
 *
 * Windows has no socket mode: the pipe's connections pass the handshake
 * first (`windowsRuntimeEndpoint.ts`).
 */
export async function listenPrivateEndpoint(server: Server, location: RuntimeLocation): Promise<void> {
  if (process.platform === 'win32') {
    await listenWindowsEndpoint(server, location);
    return;
  }
  const endpoint = location.endpoint;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    // Worker threads cannot change the umask; there the bind keeps the
    // default mode and secureBoundEndpoint tightens it, as before.
    if (!isMainThread) {
      server.listen(endpoint);
      return;
    }
    const previous = process.umask(0o777 & ~PRIVATE_SOCKET_MODE);
    try {
      server.listen(endpoint);
    } finally {
      process.umask(previous);
    }
  });
}

export async function secureBoundEndpoint(location: RuntimeLocation): Promise<OwnedEndpoint> {
  if (process.platform === 'win32') return await secureWindowsEndpoint(location);
  const userId = currentUserId();
  await chmod(location.endpoint, PRIVATE_SOCKET_MODE);
  const endpoint = await lstat(location.endpoint, { bigint: true });
  if (
    !endpoint.isSocket() ||
    endpoint.isSymbolicLink() ||
    Number(endpoint.uid) !== userId ||
    (Number(endpoint.mode) & 0o777) !== PRIVATE_SOCKET_MODE
  ) {
    throw new RuntimeLocationProblem('runtime-endpoint-insecure');
  }

  return { device: endpoint.dev, inode: endpoint.ino };
}

/** Removes the socket (on Windows, the secret) only while it is still the one this runtime published. */
export async function removeOwnedEndpoint(location: RuntimeLocation, owned: OwnedEndpoint): Promise<void> {
  const published = location.secret ?? location.endpoint;
  try {
    const endpoint = await lstat(published, { bigint: true });
    if (endpoint.dev === owned.device && endpoint.ino === owned.inode) {
      await rm(published, { force: true });
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
