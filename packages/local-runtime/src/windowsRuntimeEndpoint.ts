import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server, Socket } from 'node:net';
import path from 'node:path';
import process from 'node:process';

import { renameFile } from '@buildframe/workspace/durable-files';
import {
  protectWindowsDirectory,
  windowsDirectoryPrivacy,
  windowsRuntimeDirectoryFor,
} from '@buildframe/workspace/private-directories';

import { RUNTIME_SECRET_BYTES, answerRuntimeHandshake } from './runtimeHandshake.js';
import { RuntimeLocationProblem, type OwnedEndpoint, type RuntimeLocation } from './runtimeLocationProblem.js';

/**
 * The runtime endpoint on Windows: a named pipe, and beside it in the user's
 * private runtime directory a file with the running runtime's secret.
 *
 * Node on Windows listens only on named pipes. A pipe has no owner-private
 * mode (Node's default pipe security lets Everyone read), and its name is
 * machine-global. So privacy comes from the handshake in `runtimeHandshake.ts`:
 * a connection gets no frame until both sides have proven the secret. Only
 * the user (and SYSTEM and Administrators) can read the secret file.
 */

const PIPE_NAMESPACE = '\\\\.\\pipe\\';

/**
 * `XDG_RUNTIME_DIR` wins when it is set to an absolute path, as the `XDG_*`
 * settings do for State and configuration; otherwise
 * `%LOCALAPPDATA%\BuildFrame\runtime`. The pipe name digests the directory as
 * well as the Workspace, so each user (and each test's runtime directory)
 * gets its own pipe.
 */
export function windowsRuntimeLocation(
  workspaceDigest: string,
  environment: NodeJS.ProcessEnv = process.env,
): RuntimeLocation {
  const configured = environment.XDG_RUNTIME_DIR;
  const directory =
    configured !== undefined && path.win32.isAbsolute(configured)
      ? path.win32.join(configured, 'buildframe')
      : windowsRuntimeDirectoryFor(environment);
  if (directory === undefined) throw new RuntimeLocationProblem('runtime-directory-insecure');
  const pipeDigest = createHash('sha256')
    .update(`${path.win32.resolve(directory).toLowerCase()}\n${workspaceDigest}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return {
    directory,
    endpoint: `${PIPE_NAMESPACE}buildframe-${pipeDigest}`,
    secret: path.win32.join(directory, `w-${workspaceDigest}.key`),
  };
}

function secretFileOf(location: RuntimeLocation): string {
  if (location.secret === undefined) throw new RuntimeLocationProblem('runtime-endpoint-insecure');
  return location.secret;
}

/**
 * Creates the runtime directory under the user's profile, refuses a link in
 * its place, and gives it the user's protected access list. Only the runtime
 * prepares it, and the runtime always has `node:ffi`, so this fails closed
 * without it.
 */
export async function prepareWindowsRuntimeDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory, { recursive: true });
    const status = await lstat(directory);
    if (!status.isDirectory() || status.isSymbolicLink()) throw new Error('not a plain directory');
    protectWindowsDirectory(directory);
  } catch {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
}

/**
 * Refuses a missing, linked or no-longer-private runtime directory. An agent
 * host that loads a connector has no `node:ffi` and cannot read the access
 * list; it gets `unverifiable` and relies on the directory sitting in the
 * user's profile and on the handshake.
 */
export async function validateWindowsRuntimeDirectory(directory: string): Promise<'private' | 'unverifiable'> {
  let status;
  try {
    status = await lstat(directory);
  } catch {
    throw new RuntimeLocationProblem('runtime-endpoint-missing');
  }
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
  let privacy;
  try {
    privacy = windowsDirectoryPrivacy(directory);
  } catch {
    throw new RuntimeLocationProblem('runtime-directory-insecure');
  }
  if (privacy === 'not-private') throw new RuntimeLocationProblem('runtime-directory-insecure');
  return privacy;
}

/** The plain secret file, by identity; `runtime-endpoint-missing` when no runtime has published one. */
async function secretFileIdentity(location: RuntimeLocation): Promise<OwnedEndpoint> {
  let status;
  try {
    status = await lstat(secretFileOf(location), { bigint: true });
  } catch (error) {
    if (error instanceof RuntimeLocationProblem) throw error;
    throw new RuntimeLocationProblem('runtime-endpoint-missing');
  }
  if (!status.isFile() || status.isSymbolicLink()) throw new RuntimeLocationProblem('runtime-endpoint-insecure');
  return { device: status.dev, inode: status.ino };
}

/** Client side, before connecting: the directory is private and a runtime has published its secret. */
export async function validateWindowsRuntimeEndpoint(location: RuntimeLocation): Promise<void> {
  await validateWindowsRuntimeDirectory(location.directory);
  await secretFileIdentity(location);
}

/** The runtime's published secret, read after its greeting. */
export async function readWindowsRuntimeSecret(location: RuntimeLocation): Promise<Uint8Array> {
  return await readFile(secretFileOf(location));
}

/**
 * Publishes under a new file identity (write aside, then rename), so a
 * runtime that is shutting down never removes the secret of the one that
 * replaced it (`removeOwnedEndpoint` compares identities).
 */
async function publishSecret(secretFile: string, secret: Uint8Array): Promise<void> {
  const staged = `${secretFile}.${randomUUID()}.tmp`;
  await writeFile(staged, secret, { flag: 'wx' });
  try {
    await renameFile(staged, secretFile);
  } catch (error) {
    await rm(staged, { force: true });
    throw error;
  }
}

function listen(server: Server, endpoint: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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
    server.listen(endpoint);
  });
}

/**
 * Listens on the pipe, then publishes a fresh secret. Publishing only after
 * the listen succeeds means a second runtime for the same Workspace, which
 * fails to bind (Node creates the first pipe instance exclusively), never
 * replaces the running one's secret.
 *
 * The server's own connection handlers are moved behind the handshake: a
 * connection reaches them only after the client has proven the secret, and
 * one that arrives before the secret is published waits for it.
 */
export async function listenWindowsEndpoint(server: Server, location: RuntimeLocation): Promise<void> {
  const secretFile = secretFileOf(location);
  const secret = randomBytes(RUNTIME_SECRET_BYTES);
  let publish!: (secret: Uint8Array | undefined) => void;
  const published = new Promise<Uint8Array | undefined>(resolve => {
    publish = resolve;
  });
  const handlers = server.listeners('connection') as ((socket: Socket) => void)[];
  server.removeAllListeners('connection');
  server.on('connection', (socket: Socket) => {
    void answerRuntimeHandshake(socket, published).then(authenticated => {
      if (!authenticated) return;
      // A server already closing would never drain this connection.
      if (!server.listening) {
        socket.destroy();
        return;
      }
      for (const handler of handlers) handler.call(server, socket);
    });
  });

  try {
    await listen(server, location.endpoint);
  } catch (error) {
    publish(undefined);
    throw error;
  }
  try {
    await publishSecret(secretFile, secret);
  } catch (error) {
    publish(undefined);
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw error;
  }
  publish(secret);
}

/** The published secret file's identity, removed again only if it is still this runtime's. */
export async function secureWindowsEndpoint(location: RuntimeLocation): Promise<OwnedEndpoint> {
  try {
    return await secretFileIdentity(location);
  } catch {
    throw new RuntimeLocationProblem('runtime-endpoint-insecure');
  }
}
