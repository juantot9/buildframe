import {
  ensureWorkspaceRuntime,
  type EnsureWorkspaceRuntimeRejected,
  type EnsureWorkspaceRuntimeRequest,
  type EnsureWorkspaceRuntimeResult,
} from '@buildframe/local-runtime/launcher';

import { createReviewingApplication } from './reviewingScreen.js';
import type { ReviewingPresentation } from './reviewingModel.js';
import { createFileUserConfiguration } from './userConfiguration.js';

export type OpenDeveloperWorkspaceRuntimeRequest = Omit<EnsureWorkspaceRuntimeRequest, 'runtimeEntrypoint'>;

export interface OpenDeveloperReviewingRequest {
  /** A directory at or below the Git working-tree root. */
  readonly startPath: string;
  readonly signal?: AbortSignal;
  readonly presentation?: Partial<ReviewingPresentation>;
  readonly idleGraceMilliseconds?: number;
  readonly startupTimeoutMilliseconds?: number;
}

export interface DeveloperReviewingSession {
  /** Resolves after terminal ownership and the runtime client have ended. */
  readonly closed: Promise<void>;
  stop(): Promise<void>;
}

export interface DeveloperReviewingOpened {
  readonly status: 'opened';
  readonly session: DeveloperReviewingSession;
}

export type OpenDeveloperReviewingResult = DeveloperReviewingOpened | EnsureWorkspaceRuntimeRejected;

function runtimeEntrypoint(): URL {
  return import.meta.url.endsWith('.ts')
    ? new URL('../dist/runtimeProcess.js', import.meta.url)
    : new URL('./runtimeProcess.js', import.meta.url);
}

/** Developer-only lifecycle seam retained for built runtime risk probes. */
export async function openDeveloperWorkspaceRuntime(
  request: OpenDeveloperWorkspaceRuntimeRequest,
): Promise<EnsureWorkspaceRuntimeResult> {
  return ensureWorkspaceRuntime({
    ...request,
    runtimeEntrypoint: runtimeEntrypoint(),
  });
}

/**
 * Opens the first dogfood executable path. Runtime discovery, connection,
 * terminal ownership, and cleanup stay behind this launcher-only Interface.
 */
export async function openDeveloperReviewing(
  request: OpenDeveloperReviewingRequest,
): Promise<OpenDeveloperReviewingResult> {
  const connectionLifetime = new AbortController();
  const abortFromCaller = (): void => connectionLifetime.abort();
  request.signal?.addEventListener('abort', abortFromCaller, { once: true });
  if (request.signal?.aborted === true) connectionLifetime.abort();

  const connected = await openDeveloperWorkspaceRuntime({
    startPath: request.startPath,
    role: 'tui',
    signal: connectionLifetime.signal,
    ...(request.idleGraceMilliseconds === undefined ? {} : { idleGraceMilliseconds: request.idleGraceMilliseconds }),
    ...(request.startupTimeoutMilliseconds === undefined
      ? {}
      : { startupTimeoutMilliseconds: request.startupTimeoutMilliseconds }),
  });
  if (connected.status === 'rejected') {
    request.signal?.removeEventListener('abort', abortFromCaller);
    return connected;
  }
  if (connectionLifetime.signal.aborted) {
    request.signal?.removeEventListener('abort', abortFromCaller);
    return {
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    };
  }

  const application = createReviewingApplication({
    workspace: connected.workspace,
    userConfiguration: createFileUserConfiguration(),
    ...(request.presentation === undefined ? {} : { presentation: request.presentation }),
  });
  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopped ??= application.stop().finally(() => {
      connectionLifetime.abort();
      request.signal?.removeEventListener('abort', abortFromCaller);
    });
    return stopped;
  };
  const stopFromCaller = (): void => {
    void stop();
  };
  connectionLifetime.signal.addEventListener('abort', stopFromCaller, {
    once: true,
  });

  try {
    await application.start();
  } catch (error) {
    await stop();
    throw error;
  }

  const closed = application.closed.finally(async () => {
    connectionLifetime.signal.removeEventListener('abort', stopFromCaller);
    await stop();
  });
  return {
    status: 'opened',
    session: Object.freeze({ closed, stop }),
  };
}
