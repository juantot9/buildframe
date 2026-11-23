import type { CliRenderer } from '@opentui/core';

import {
  openDeveloperWorkspaceRuntime,
  type OpenDeveloperReviewingRequest,
  type OpenDeveloperReviewingResult,
} from './launcher.js';
import { createReviewingApplicationForTest } from './reviewingScreen.js';
import { createFileUserConfiguration } from './userConfiguration.js';

/** @internal Built fault-probe path; deliberately absent from package exports. */
export async function openDeveloperReviewingForTest(
  request: OpenDeveloperReviewingRequest & {
    readonly renderer: CliRenderer;
    readonly createHighlightClient?: Parameters<typeof createReviewingApplicationForTest>[0]['createHighlightClient'];
  },
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

  const application = createReviewingApplicationForTest({
    workspace: connected.workspace,
    renderer: request.renderer,
    ...(request.createHighlightClient === undefined ? {} : { createHighlightClient: request.createHighlightClient }),
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
