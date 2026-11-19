import { createConnection, type Socket } from 'node:net';

import { BOOTSTRAP_TIMEOUT_MS } from './protocol.js';
import { openRuntimeHandshake } from './runtimeHandshake.js';
import type { RuntimeLocation } from './runtimeLocationProblem.js';
import { readWindowsRuntimeSecret } from './windowsRuntimeEndpoint.js';

export type EndpointConnectionFailure = 'timeout' | 'cancelled' | 'connection-failed' | 'insecure-runtime';

class EndpointConnectionFailed extends Error {
  readonly reason: EndpointConnectionFailure;

  constructor(reason: EndpointConnectionFailure) {
    super(reason);
    this.reason = reason;
  }
}

/** Why `connectRuntimeEndpoint` failed, as a `runtime-unavailable` reason. */
export function endpointConnectionFailure(error: unknown): EndpointConnectionFailure {
  return error instanceof EndpointConnectionFailed ? error.reason : 'connection-failed';
}

async function connectSocket(endpoint: string, signal: AbortSignal | undefined): Promise<Socket> {
  return await new Promise<Socket>((resolve, reject) => {
    const socket = createConnection(endpoint);
    const timer = setTimeout(() => finish(new EndpointConnectionFailed('timeout')), BOOTSTRAP_TIMEOUT_MS);
    timer.unref();
    const onConnect = (): void => finish(undefined, socket);
    const onError = (): void => finish(new EndpointConnectionFailed('connection-failed'));
    const onAbort = (): void => finish(new EndpointConnectionFailed('cancelled'));
    const finish = (error: Error | undefined, connected?: Socket): void => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
      if (error !== undefined || connected === undefined) {
        socket.destroy();
        reject(error ?? new EndpointConnectionFailed('connection-failed'));
      } else {
        resolve(connected);
      }
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
  });
}

/**
 * Connects to a runtime's endpoint, ready for the caller's first frame. On
 * Windows the runtime and this client first prove its secret to each other
 * (`runtimeHandshake.ts`); a runtime that cannot is `insecure-runtime`.
 */
export async function connectRuntimeEndpoint(
  location: RuntimeLocation,
  signal: AbortSignal | undefined,
): Promise<Socket> {
  const socket = await connectSocket(location.endpoint, signal);
  if (location.secret === undefined) return socket;

  const onAbort = (): void => {
    socket.destroy();
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const outcome = await openRuntimeHandshake(socket, async () => await readWindowsRuntimeSecret(location));
  signal?.removeEventListener('abort', onAbort);
  if (signal?.aborted === true) {
    socket.destroy();
    throw new EndpointConnectionFailed('cancelled');
  }
  if (outcome !== 'authenticated') throw new EndpointConnectionFailed(outcome);
  return socket;
}
