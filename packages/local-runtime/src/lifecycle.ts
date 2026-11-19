import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  bootstrapWorkspace,
  type Workspace,
  type WorkspaceBootstrapDiagnostic,
  type WorkspaceIdentity,
} from '@buildframe/workspace';
import {
  openWorkspaceRuntimeOwner,
  type WorkspaceRuntimeOwner,
  type WorkspaceRuntimeOwnerDiagnostic,
} from '@buildframe/workspace/runtime';

import { discoverWorkspaceRuntime } from './client.js';
import {
  type LocalRuntimeClientRole,
  type RuntimeCodeIdentity,
  type RuntimeGeneration,
  type WorkspaceRuntimeBootstrapDiagnostic,
  type WorkspaceRuntimeConnected,
} from './contracts.js';
import {
  disposeLocalRuntimeServerAfterDrain,
  LocalRuntimeServerError,
  startLocalRuntimeServer,
  waitForLocalRuntimeServerIdle,
  type LocalRuntimeServer,
} from './server.js';
import {
  RuntimeLocationProblem,
  preparePrivateRuntimeDirectory,
  removeStaleRuntimeEndpoint,
  runtimeLocationForWorkspace,
} from './runtimeLocation.js';
import { runtimeCodeIdentityForEntrypoint } from './runtimeCodeIdentity.js';
import {
  MAX_CONFIGURED_TIMEOUT_MS,
  parseStartMessage,
  parseStatusMessage,
  RUNTIME_PROCESS_MESSAGE_VERSION,
  type RuntimeProcessFailureReason,
  type RuntimeProcessStartMessage,
  type RuntimeProcessStatusMessage,
  type RuntimeStartRejectedDiagnostic,
} from './runtimeProcessMessages.js';

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_IDLE_GRACE_MS = 30_000;
const START_MESSAGE_TIMEOUT_MS = 5_000;
const START_POLL_MS = 20;

export interface EnsureWorkspaceRuntimeRequest {
  /** A directory at or below the Git working-tree root. */
  readonly startPath: string;
  readonly role: LocalRuntimeClientRole;
  /** Internal writer-process entrypoint owned by the application assembly. */
  readonly runtimeEntrypoint: URL;
  readonly signal?: AbortSignal;
  /** Launcher policy; omitted uses the conservative production default. */
  readonly idleGraceMilliseconds?: number;
  /** Bounded startup wait, including launch-storm convergence. */
  readonly startupTimeoutMilliseconds?: number;
}

export type EnsureWorkspaceRuntimeDiagnostic =
  | WorkspaceBootstrapDiagnostic
  | WorkspaceRuntimeBootstrapDiagnostic
  | RuntimeStartRejectedDiagnostic;

export interface EnsureWorkspaceRuntimeRejected {
  readonly status: 'rejected';
  readonly diagnostic: EnsureWorkspaceRuntimeDiagnostic;
}

export type EnsureWorkspaceRuntimeResult = WorkspaceRuntimeConnected | EnsureWorkspaceRuntimeRejected;

interface SpawnedRuntime {
  readonly child: ChildProcess;
  status: RuntimeProcessStatusMessage | undefined;
  exited: boolean;
  spawnFailed: boolean;
}

function configuredMilliseconds(value: number | undefined, fallback: number, allowZero: boolean): number {
  const configured = value ?? fallback;
  if (!Number.isSafeInteger(configured) || configured < (allowZero ? 0 : 1) || configured > MAX_CONFIGURED_TIMEOUT_MS) {
    throw new TypeError('Runtime lifecycle timeout is outside its bound');
  }
  return configured;
}

function detachChild(child: ChildProcess): void {
  child.removeAllListeners();
  if (child.connected) {
    try {
      child.disconnect();
    } catch {
      // The independently retained runtime already closed its startup channel.
    }
  }
  child.unref();
}

function spawnRuntime(runtimeEntrypoint: URL, startPath: string, idleGraceMilliseconds: number): SpawnedRuntime {
  if (runtimeEntrypoint.protocol !== 'file:') {
    throw new TypeError('Runtime entrypoint must be a local file URL');
  }

  // On Windows the runtime keeps its files private through node:ffi, which Node
  // loads only with this flag (privateDirectories.ts in the workspace package).
  const ffi = process.platform === 'win32' ? ['--experimental-ffi'] : [];
  const child = spawn(process.execPath, [...ffi, fileURLToPath(runtimeEntrypoint)], {
    detached: true,
    env: process.env,
    serialization: 'json',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  const spawned: SpawnedRuntime = {
    child,
    status: undefined,
    exited: false,
    spawnFailed: false,
  };
  child.on('message', (message: unknown) => {
    const parsed = parseStatusMessage(message);
    if (parsed !== undefined) spawned.status = parsed;
  });
  child.once('error', () => {
    spawned.spawnFailed = true;
  });
  child.once('exit', () => {
    spawned.exited = true;
  });
  child.once('spawn', () => {
    const start: RuntimeProcessStartMessage = {
      type: 'runtime.start',
      version: RUNTIME_PROCESS_MESSAGE_VERSION,
      startPath,
      idleGraceMilliseconds,
    };
    try {
      child.send(start, error => {
        if (error !== null) spawned.spawnFailed = true;
      });
    } catch {
      spawned.spawnFailed = true;
    }
  });
  return spawned;
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function waitForPoll(signal: AbortSignal | undefined): Promise<void> {
  if (isAborted(signal)) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, START_POLL_MS);
    const onAbort = (): void => finish();
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function shouldStartRuntime(diagnostic: WorkspaceRuntimeBootstrapDiagnostic): boolean {
  return (
    diagnostic.code === 'runtime-unavailable' &&
    (diagnostic.reason === 'not-running' || diagnostic.reason === 'connection-failed')
  );
}

function shouldRetryRuntimeStartup(diagnostic: WorkspaceRuntimeBootstrapDiagnostic): boolean {
  return (
    diagnostic.code === 'runtime-code-mismatch' ||
    shouldStartRuntime(diagnostic) ||
    (diagnostic.code === 'runtime-unavailable' && diagnostic.reason === 'insecure-runtime')
  );
}

/**
 * Resolves one Workspace, converges with parallel starters, and returns one
 * generation-scoped semantic session. Calling it again after disconnect starts
 * or joins a replacement; no Workspace call is retained or replayed.
 */
export async function ensureWorkspaceRuntime(
  request: EnsureWorkspaceRuntimeRequest,
): Promise<EnsureWorkspaceRuntimeResult> {
  const idleGraceMilliseconds = configuredMilliseconds(request.idleGraceMilliseconds, DEFAULT_IDLE_GRACE_MS, true);
  const startupTimeoutMilliseconds = configuredMilliseconds(
    request.startupTimeoutMilliseconds,
    DEFAULT_STARTUP_TIMEOUT_MS,
    false,
  );
  const deadline = Date.now() + startupTimeoutMilliseconds;

  if (isAborted(request.signal)) {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }

  let runtimeCodeIdentity: RuntimeCodeIdentity;
  try {
    runtimeCodeIdentity = await runtimeCodeIdentityForEntrypoint(request.runtimeEntrypoint);
  } catch {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-start-rejected', reason: 'code-identity-unavailable' },
    };
  }

  const workspaceResult = await bootstrapWorkspace({
    startPath: request.startPath,
  });
  if (workspaceResult.status === 'rejected') return workspaceResult;
  const identity = await workspaceResult.workspace.read({
    kind: 'workspace.identity',
  });

  const connect = async () =>
    discoverWorkspaceRuntime({
      workspaceIdentity: identity.workspaceIdentity,
      role: request.role,
      runtimeCodeIdentity,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });

  let existing = await connect();
  if (existing.status === 'connected') return existing;

  if (existing.diagnostic.code === 'runtime-code-mismatch') {
    while (Date.now() < deadline) {
      if (isAborted(request.signal)) {
        return {
          status: 'rejected',
          diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
        };
      }
      await waitForPoll(request.signal);
      existing = await connect();
      if (existing.status === 'connected') return existing;
      if (existing.diagnostic.code === 'runtime-unavailable' && existing.diagnostic.reason === 'not-running') {
        break;
      }
      if (existing.diagnostic.code !== 'runtime-code-mismatch' && existing.diagnostic.code !== 'runtime-unavailable') {
        return existing;
      }
      if (existing.diagnostic.code === 'runtime-unavailable' && existing.diagnostic.reason === 'cancelled') {
        return existing;
      }
    }
    if (Date.now() >= deadline) {
      return {
        status: 'rejected',
        diagnostic: { code: 'runtime-start-rejected', reason: 'startup-timeout' },
      };
    }
  } else if (!shouldStartRuntime(existing.diagnostic)) {
    return existing;
  }

  let spawned: SpawnedRuntime;
  try {
    spawned = spawnRuntime(request.runtimeEntrypoint, identity.canonicalCheckout, idleGraceMilliseconds);
  } catch {
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-start-rejected', reason: 'spawn-failed' },
    };
  }

  let lastFailure: RuntimeProcessFailureReason | undefined;
  while (Date.now() < deadline) {
    if (isAborted(request.signal)) {
      detachChild(spawned.child);
      return {
        status: 'rejected',
        diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
      };
    }

    if (spawned.spawnFailed) {
      detachChild(spawned.child);
      return {
        status: 'rejected',
        diagnostic: { code: 'runtime-start-rejected', reason: 'spawn-failed' },
      };
    }
    if (spawned.status?.type === 'runtime.failed') {
      lastFailure = spawned.status.reason;
    }

    const connected = await connect();
    if (connected.status === 'connected') {
      detachChild(spawned.child);
      return connected;
    }
    if (!shouldRetryRuntimeStartup(connected.diagnostic)) {
      detachChild(spawned.child);
      return connected;
    }

    if (lastFailure !== undefined && lastFailure !== 'writer-unavailable') {
      detachChild(spawned.child);
      return {
        status: 'rejected',
        diagnostic: { code: 'runtime-start-rejected', reason: lastFailure },
      };
    }
    if (spawned.exited && lastFailure === undefined) {
      detachChild(spawned.child);
      return {
        status: 'rejected',
        diagnostic: { code: 'runtime-start-rejected', reason: 'runtime-exited' },
      };
    }

    await waitForPoll(request.signal);
  }

  detachChild(spawned.child);
  return {
    status: 'rejected',
    diagnostic: {
      code: 'runtime-start-rejected',
      reason: lastFailure ?? 'startup-timeout',
    },
  };
}

function ownerFailureReason(diagnostic: WorkspaceRuntimeOwnerDiagnostic): RuntimeProcessFailureReason {
  if (diagnostic.code === 'runtime-writer-unavailable') {
    return 'writer-unavailable';
  }
  if (diagnostic.code === 'runtime-state-unavailable') {
    return diagnostic.reason === 'read-only-newer' ? 'state-read-only-newer' : 'workspace-unavailable';
  }
  return 'workspace-unavailable';
}

function serverFailureReason(error: unknown): RuntimeProcessFailureReason {
  if (error instanceof RuntimeLocationProblem) {
    return error.code === 'runtime-endpoint-active' ? 'endpoint-active' : 'endpoint-insecure';
  }
  if (error instanceof LocalRuntimeServerError) {
    if (error.code === 'runtime-already-active') return 'endpoint-active';
    if (error.code === 'invalid-runtime-code-identity') return 'code-identity-unavailable';
    if (error.code === 'runtime-directory-insecure' || error.code === 'unsupported-platform') {
      return 'endpoint-insecure';
    }
  }
  return 'listen-failed';
}

function sendStatus(message: RuntimeProcessStatusMessage): Promise<void> {
  return new Promise(resolve => {
    if (process.send === undefined || !process.connected) {
      resolve();
      return;
    }
    process.send(message, () => resolve());
  });
}

function disconnectProcessChannel(): void {
  if (process.connected) process.disconnect?.();
}

function receiveStartMessage(signal: AbortSignal): Promise<RuntimeProcessStartMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('start-timeout')), START_MESSAGE_TIMEOUT_MS);
    const onMessage = (message: unknown): void => {
      const parsed = parseStartMessage(message);
      if (parsed === undefined) finish(new Error('invalid-start'));
      else finish(undefined, parsed);
    };
    const onAbort = (): void => finish(new Error('cancelled'));
    const finish = (error: Error | undefined, message?: RuntimeProcessStartMessage): void => {
      clearTimeout(timer);
      process.off('message', onMessage);
      signal.removeEventListener('abort', onAbort);
      if (error !== undefined || message === undefined) {
        reject(error ?? new Error('invalid-start'));
      } else {
        resolve(message);
      }
    };

    process.once('message', onMessage);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

export interface RunWorkspaceRuntimeProcessRequest {
  /** The exact file Node launched for this independently retained process. */
  readonly runtimeEntrypoint: URL;
}

/** Runs the application-owned writer-process entrypoint. */
export async function runWorkspaceRuntimeProcess(request: RunWorkspaceRuntimeProcessRequest): Promise<void> {
  const shutdown = new AbortController();
  const requestShutdown = (): void => shutdown.abort();
  process.once('SIGTERM', requestShutdown);
  process.once('SIGINT', requestShutdown);

  let owner: WorkspaceRuntimeOwner | undefined;
  let server: LocalRuntimeServer | undefined;
  try {
    let start: RuntimeProcessStartMessage;
    try {
      start = await receiveStartMessage(shutdown.signal);
    } catch {
      return;
    }

    let runtimeCodeIdentity: RuntimeCodeIdentity;
    try {
      runtimeCodeIdentity = await runtimeCodeIdentityForEntrypoint(request.runtimeEntrypoint);
    } catch {
      await sendStatus({
        type: 'runtime.failed',
        version: RUNTIME_PROCESS_MESSAGE_VERSION,
        reason: 'code-identity-unavailable',
      });
      return;
    }

    const opened = await openWorkspaceRuntimeOwner({
      startPath: start.startPath,
    });
    if (opened.status === 'rejected') {
      await sendStatus({
        type: 'runtime.failed',
        version: RUNTIME_PROCESS_MESSAGE_VERSION,
        reason: ownerFailureReason(opened.diagnostic),
      });
      return;
    }
    owner = opened.owner;
    if (shutdown.signal.aborted) return;

    try {
      const location = runtimeLocationForWorkspace(owner.workspaceIdentity);
      await preparePrivateRuntimeDirectory(location);
      await removeStaleRuntimeEndpoint(location);
      const runtimeGeneration = `rtg_${randomUUID()}` as RuntimeGeneration;
      server = await startLocalRuntimeServer({
        workspace: owner.workspace,
        runtimeGeneration,
        runtimeCodeIdentity,
        harnessAdapters: owner.harnessAdapters,
      });
    } catch (error) {
      await sendStatus({
        type: 'runtime.failed',
        version: RUNTIME_PROCESS_MESSAGE_VERSION,
        reason: serverFailureReason(error),
      });
      return;
    }

    await sendStatus({
      type: 'runtime.ready',
      version: RUNTIME_PROCESS_MESSAGE_VERSION,
    });
    disconnectProcessChannel();

    await waitForLocalRuntimeServerIdle(server, start.idleGraceMilliseconds, shutdown.signal);
  } finally {
    if (server !== undefined) {
      await disposeLocalRuntimeServerAfterDrain(server, async () => {
        if (owner === undefined) return;
        await owner.dispose().catch(() => undefined);
        owner = undefined;
      }).catch(() => undefined);
    }
    if (owner !== undefined) await owner.dispose().catch(() => undefined);
    process.off('SIGTERM', requestShutdown);
    process.off('SIGINT', requestShutdown);
    disconnectProcessChannel();
  }
}

export type InspectWorkspaceRuntimeResult =
  | { readonly status: 'running'; readonly workspace: Workspace; readonly close: () => void }
  | { readonly status: 'not-running' }
  /** A runtime from another BuildFrame build holds this checkout; this build will wait for it to exit. */
  | { readonly status: 'other-build' }
  | { readonly status: 'unavailable'; readonly diagnostic: WorkspaceRuntimeBootstrapDiagnostic };

/**
 * Read-only: finds the checkout's running runtime without starting one, and
 * says when it comes from another build. Diagnostics use it; it never stops,
 * replaces, or starts a process.
 */
export async function inspectWorkspaceRuntime(request: {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly runtimeEntrypoint: URL;
}): Promise<InspectWorkspaceRuntimeResult> {
  const runtimeCodeIdentity = await runtimeCodeIdentityForEntrypoint(request.runtimeEntrypoint);
  const connection = new AbortController();
  const found = await discoverWorkspaceRuntime({
    workspaceIdentity: request.workspaceIdentity,
    role: 'cli',
    runtimeCodeIdentity,
    runtimeCodeMismatch: 'report',
    signal: connection.signal,
  });
  if (found.status === 'connected') {
    return { status: 'running', workspace: found.workspace, close: () => connection.abort() };
  }
  connection.abort();
  if (found.diagnostic.code === 'runtime-code-mismatch') return { status: 'other-build' };
  if (found.diagnostic.code === 'runtime-unavailable' && found.diagnostic.reason === 'not-running') {
    return { status: 'not-running' };
  }
  return { status: 'unavailable', diagnostic: found.diagnostic };
}
