import type { WorkspaceIdentity } from '@buildframe/workspace';
import type { ReviewedHarnessAdapter } from '@buildframe/workspace/harness-interaction';

import type {
  ConnectHarnessAdapterRuntimeRequest,
  ConnectHarnessAdapterRuntimeResult,
  HarnessAdapterRuntimeConnected,
  HarnessAdapterRuntimeDiagnostic,
} from '../harnessAdapter.js';
import type { ConnectorScheduler, ConnectorStatus } from './contracts.js';

const RECONNECT_MINIMUM_MS = 250;
const RECONNECT_MAXIMUM_MS = 5_000;

export type ConnectRuntime = (
  request: ConnectHarnessAdapterRuntimeRequest,
) => Promise<ConnectHarnessAdapterRuntimeResult>;

export interface AttachLoopTarget {
  readonly adapter: ReviewedHarnessAdapter;
  readonly workspaceIdentity: WorkspaceIdentity;
  runtimeConnected(runtimeGeneration: string): Promise<void>;
  runtimeDisconnected(runtimeGeneration: string): Promise<void>;
}

/** Only a runtime that is not there yet is worth waiting for; every other refusal is final. */
export function retryable(diagnostic: HarnessAdapterRuntimeDiagnostic): boolean {
  return (
    diagnostic.code === 'runtime-unavailable' &&
    (diagnostic.reason === 'not-running' ||
      diagnostic.reason === 'connection-failed' ||
      diagnostic.reason === 'timeout')
  );
}

export function diagnosticLabel(diagnostic: HarnessAdapterRuntimeDiagnostic): string {
  switch (diagnostic.code) {
    case 'runtime-unavailable':
      return 'runtime unavailable';
    case 'harness-adapter-establishment-refused':
      return `attachment refused: ${diagnostic.reason}`;
    case 'runtime-protocol-incompatible':
      return 'runtime protocol incompatible';
    case 'workspace-interface-incompatible':
      return 'Workspace Interface incompatible';
    case 'runtime-workspace-mismatch':
      return 'workspace mismatch';
    case 'runtime-role-rejected':
      return 'Adapter role rejected';
    default:
      return 'attachment invalid';
  }
}

function wait(scheduler: ConnectorScheduler, delayMilliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const finish = (): void => {
      scheduler.clear(handle);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const handle = scheduler.set(delayMilliseconds, finish);
    signal.addEventListener('abort', finish, { once: true });
  });
}

export interface AttachLoop {
  readonly first: Promise<ConnectorStatus>;
  readonly done: Promise<void>;
  /** The live connection, if any, so closing can dispose it at once. */
  readonly connection: () => HarnessAdapterRuntimeConnected | undefined;
}

/**
 * Keeps one session connected: waits for a runtime that is not there yet,
 * reconnects after a plain disconnect, and stops for good when refused, when
 * another session replaces this one, or when `signal` aborts.
 */
export function runAttachLoop(options: {
  readonly connect: ConnectRuntime;
  readonly target: AttachLoopTarget;
  readonly signal: AbortSignal;
  readonly scheduler: ConnectorScheduler;
  readonly onStatus: ((status: ConnectorStatus) => void) | undefined;
}): AttachLoop {
  const { connect, target, signal, scheduler } = options;
  let resolveFirst!: (status: ConnectorStatus) => void;
  const first = new Promise<ConnectorStatus>(resolve => (resolveFirst = resolve));
  let reported = false;
  let live: HarnessAdapterRuntimeConnected | undefined;
  const status = (make: (first: boolean) => ConnectorStatus): void => {
    const value = make(!reported);
    if (!reported) {
      reported = true;
      resolveFirst(value);
    }
    try {
      options.onStatus?.(value);
    } catch {
      // A failing status display never stops the connection.
    }
  };
  const cancelled = (): void => status(isFirst => ({ kind: 'cancelled', first: isFirst, text: 'BuildFrame detached' }));

  const run = async (): Promise<void> => {
    let delayMilliseconds = RECONNECT_MINIMUM_MS;
    while (!signal.aborted) {
      const connected = await connect({
        workspaceIdentity: target.workspaceIdentity,
        adapter: target.adapter,
        signal,
      });
      if (signal.aborted) {
        // A connection that lands after cancellation must never stay live.
        if (connected.status === 'connected') await connected.dispose();
        break;
      }
      if (connected.status === 'rejected') {
        const label = diagnosticLabel(connected.diagnostic);
        if (!retryable(connected.diagnostic)) {
          status(isFirst => ({
            kind: 'refused',
            first: isFirst,
            text: `BuildFrame: ${label}`,
            label,
            diagnostic: connected.diagnostic,
          }));
          return;
        }
        status(isFirst => ({
          kind: 'retrying',
          first: isFirst,
          text: `BuildFrame: ${label}; retrying`,
          cause: 'runtime-unavailable',
          label,
          diagnostic: connected.diagnostic,
        }));
        await wait(scheduler, delayMilliseconds, signal);
        delayMilliseconds = Math.min(RECONNECT_MAXIMUM_MS, delayMilliseconds * 2);
        continue;
      }

      live = connected;
      delayMilliseconds = RECONNECT_MINIMUM_MS;
      status(isFirst => ({ kind: 'connected', first: isFirst, text: 'BuildFrame Review attached' }));
      await target.runtimeConnected(connected.runtimeGeneration);
      const reason = await connected.closed;
      if (live === connected) live = undefined;
      if (signal.aborted || reason === 'disposed') break;
      if (reason === 'replaced') {
        // Another session took the connection; reconnecting would take it back.
        await target.runtimeDisconnected(connected.runtimeGeneration);
        status(isFirst => ({
          kind: 'replaced',
          first: isFirst,
          text: 'BuildFrame: disconnected (another session connected)',
        }));
        return;
      }
      status(isFirst => ({
        kind: 'retrying',
        first: isFirst,
        text: 'BuildFrame: runtime disconnected; retrying',
        cause: 'runtime-disconnected',
      }));
      await target.runtimeDisconnected(connected.runtimeGeneration);
      await wait(scheduler, delayMilliseconds, signal);
    }
    cancelled();
  };

  const done = run().catch(() => {
    cancelled();
  });
  return { first, done, connection: () => live };
}
