import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import path from 'node:path';
import process from 'node:process';

import type { WorkspaceIdentity } from '@buildframe/workspace';

const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_SOCKET_MODE = 0o600;
const MAX_UNIX_ENDPOINT_BYTES = 100;

export type RuntimeLocationProblemCode =
  | 'unsupported-platform'
  | 'runtime-directory-insecure'
  | 'runtime-endpoint-missing'
  | 'runtime-endpoint-insecure'
  | 'runtime-endpoint-active';

export class RuntimeLocationProblem extends Error {
  readonly code: RuntimeLocationProblemCode;

  constructor(code: RuntimeLocationProblemCode) {
    super(code);
    this.name = 'RuntimeLocationProblem';
    this.code = code;
  }
}

export interface RuntimeLocation {
  readonly directory: string;
  readonly endpoint: string;
  /**
   * A base directory BuildFrame creates itself in a shared location (the `/tmp`
   * fallback). Another local user could create it first, or rename the
   * private directory inside it, so it must be owner-private too.
   */
  readonly ownedBase?: string;
}

interface OwnedEndpoint {
  readonly device: bigint;
  readonly inode: bigint;
}

function currentUserId(): number {
  if ((process.platform !== 'darwin' && process.platform !== 'linux') || process.getuid === undefined) {
    throw new RuntimeLocationProblem('unsupported-platform');
  }
  return process.getuid();
}

function locationUnder(base: string, workspaceIdentity: WorkspaceIdentity, ownedBase: boolean): RuntimeLocation {
  const digest = createHash('sha256').update(workspaceIdentity, 'utf8').digest('hex').slice(0, 32);
  const directory = path.join(base, 'buildframe');
  return {
    directory,
    endpoint: path.join(directory, `w-${digest}.sock`),
    ...(ownedBase ? { ownedBase: base } : {}),
  };
}

/** Private endpoint discovery. No caller receives this locator. */
export function runtimeLocationForWorkspace(workspaceIdentity: WorkspaceIdentity): RuntimeLocation {
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
  const userId = currentUserId();
  if (location.ownedBase !== undefined) {
    await preparePrivateDirectory(location.ownedBase, userId);
  } else {
    await mkdir(path.dirname(location.directory), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  }
  await preparePrivateDirectory(location.directory, userId);
}

export async function validatePrivateRuntimeEndpoint(location: RuntimeLocation): Promise<void> {
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

export async function secureBoundEndpoint(location: RuntimeLocation): Promise<OwnedEndpoint> {
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

export async function removeOwnedEndpoint(location: RuntimeLocation, owned: OwnedEndpoint): Promise<void> {
  try {
    const endpoint = await lstat(location.endpoint, { bigint: true });
    if (endpoint.dev === owned.device && endpoint.ino === owned.inode) {
      await rm(location.endpoint, { force: true });
    }
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
