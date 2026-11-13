import { randomUUID } from 'node:crypto';

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { bootstrapWorkspace } from '@buildframe/workspace';
import {
  connectHarnessAdapterRuntime,
  type HarnessAdapterRuntimeConnected,
  type HarnessAdapterRuntimeDiagnostic,
} from '@buildframe/local-runtime/harness-adapter';

import { CORRELATION_ENTRY_TYPE, PiReviewedAdapter, type PiNativeHost } from './piAdapter.js';
import type { PiDirectReviewAuthority } from './capability.js';
import { guardPiEvents } from './piEvents.js';
import { assessPiHostVersion, discoverPiHostVersion, piHostCompatibilityLabel } from './piHostCompatibility.js';
import { bindPiReviewedAdapterEvents } from './piNativeEvents.js';

const RECONNECT_MINIMUM_MS = 250;
const RECONNECT_MAXIMUM_MS = 5_000;

interface ActiveSessionAttachment {
  readonly controller: AbortController;
  readonly adapter: PiReviewedAdapter;
  readonly authority: PiDirectReviewAuthority;
  connection?: HarnessAdapterRuntimeConnected;
  loop?: Promise<void>;
}

type AttachOutcome =
  | { readonly status: 'connected' }
  | { readonly status: 'replaced' }
  | { readonly status: 'retrying'; readonly diagnostic: HarnessAdapterRuntimeDiagnostic }
  | { readonly status: 'refused'; readonly diagnostic: HarnessAdapterRuntimeDiagnostic }
  | { readonly status: 'cancelled' };

function wait(delayMilliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(finish, delayMilliseconds);
    timer.unref();
    const onAbort = (): void => finish();
    function finish(): void {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function retryable(diagnostic: HarnessAdapterRuntimeDiagnostic): boolean {
  return (
    diagnostic.code === 'runtime-unavailable' &&
    (diagnostic.reason === 'not-running' ||
      diagnostic.reason === 'connection-failed' ||
      diagnostic.reason === 'timeout')
  );
}

function hasRequiredNativeContract(pi: ExtensionAPI, ctx: ExtensionContext): boolean {
  const api = pi as unknown as Record<string, unknown>;
  const context = ctx as unknown as Record<string, unknown>;
  const sessionManager = context.sessionManager as Record<string, unknown> | undefined;
  const ui = context.ui as Record<string, unknown> | undefined;
  return (
    ['on', 'getActiveTools', 'getAllTools', 'setActiveTools', 'sendUserMessage', 'appendEntry'].every(
      method => typeof api[method] === 'function',
    ) &&
    ['isIdle', 'abort'].every(method => typeof context[method] === 'function') &&
    sessionManager !== undefined &&
    ['getSessionId', 'getBranch'].every(method => typeof sessionManager[method] === 'function') &&
    ui !== undefined &&
    ['setStatus', 'notify'].every(method => typeof ui[method] === 'function')
  );
}

function nativeHost(pi: ExtensionAPI, ctx: ExtensionContext): PiNativeHost {
  return {
    isIdle: () => ctx.isIdle(),
    getActiveTools: () => pi.getActiveTools(),
    getAllTools: () =>
      pi.getAllTools().map(tool => ({
        name: tool.name,
        source: tool.sourceInfo.source,
      })),
    setActiveTools: toolNames => pi.setActiveTools([...toolNames]),
    sendUserMessage: message => pi.sendUserMessage(message),
    appendCorrelationMarker: data => pi.appendEntry(CORRELATION_ENTRY_TYPE, data),
    abort: () => ctx.abort(),
  };
}

function diagnosticLabel(diagnostic: HarnessAdapterRuntimeDiagnostic): string {
  if (diagnostic.code === 'runtime-unavailable') return 'runtime unavailable';
  if (diagnostic.code === 'harness-adapter-establishment-refused') {
    return `attachment refused: ${diagnostic.reason}`;
  }
  if (diagnostic.code === 'runtime-protocol-incompatible') {
    return 'runtime protocol incompatible';
  }
  if (diagnostic.code === 'workspace-interface-incompatible') {
    return 'Workspace Interface incompatible';
  }
  if (diagnostic.code === 'runtime-workspace-mismatch') {
    return 'workspace mismatch';
  }
  if (diagnostic.code === 'runtime-role-rejected') return 'Adapter role rejected';
  return 'attachment invalid';
}

/**
 * Keeps one commanded session attached, retrying while the BuildFrame runtime is
 * unavailable. The first attempt resolves the command's outcome; later
 * attempts only update the footer status.
 */
async function attachLoop(
  ctx: ExtensionContext,
  active: ActiveSessionAttachment,
  onFirstOutcome: (outcome: AttachOutcome) => void,
): Promise<void> {
  let delayMilliseconds = RECONNECT_MINIMUM_MS;
  let reported = false;
  const report = (outcome: AttachOutcome): void => {
    if (reported) return;
    reported = true;
    onFirstOutcome(outcome);
  };
  while (!active.controller.signal.aborted) {
    const connected = await connectHarnessAdapterRuntime({
      workspaceIdentity: active.adapter.attachment.workspaceIdentity,
      adapter: active.adapter,
      signal: active.controller.signal,
    });
    if (active.controller.signal.aborted) {
      // A connection that lands after cancellation must never stay live.
      if (connected.status === 'connected') await connected.dispose();
      report({ status: 'cancelled' });
      return;
    }
    if (connected.status === 'rejected') {
      ctx.ui.setStatus('buildframe', `BuildFrame: ${diagnosticLabel(connected.diagnostic)}`);
      if (!retryable(connected.diagnostic)) {
        report({ status: 'refused', diagnostic: connected.diagnostic });
        return;
      }
      report({ status: 'retrying', diagnostic: connected.diagnostic });
      await wait(delayMilliseconds, active.controller.signal);
      delayMilliseconds = Math.min(RECONNECT_MAXIMUM_MS, delayMilliseconds * 2);
      continue;
    }

    active.connection = connected;
    delayMilliseconds = RECONNECT_MINIMUM_MS;
    ctx.ui.setStatus('buildframe', 'BuildFrame Review attached');
    report({ status: 'connected' });
    await active.adapter.runtimeConnected(connected.runtimeGeneration);
    const reason = await connected.closed;
    if (active.connection === connected) delete active.connection;
    if (active.controller.signal.aborted || reason === 'disposed') return;
    if (reason === 'replaced') {
      // Another session took the connection; reconnecting would take it back.
      await active.adapter.runtimeDisconnected(connected.runtimeGeneration);
      ctx.ui.setStatus('buildframe', 'BuildFrame: disconnected (another session connected)');
      ctx.ui.notify(
        'BuildFrame: another session connected to this repository, so this one was disconnected. Run /buildframe here to take it back.',
        'warning',
      );
      report({ status: 'replaced' });
      active.controller.abort();
      return;
    }
    ctx.ui.setStatus('buildframe', 'BuildFrame: runtime disconnected; retrying');
    await active.adapter.runtimeDisconnected(connected.runtimeGeneration);
    await wait(delayMilliseconds, active.controller.signal);
  }
  report({ status: 'cancelled' });
}

const BUILDFRAME_USAGE =
  'Usage: /buildframe (workspace write), /buildframe readonly, /buildframe write, /buildframe status, or /buildframe disconnect';

function authorityLabel(authority: PiDirectReviewAuthority): string {
  return authority === 'workspace-write' ? 'workspace write' : 'read-only';
}

/** Host-loaded Pi extension factory for the reviewed P14 Adapter. */
export function createPiAdapterExtension(pi: ExtensionAPI, hostEntrypoint: string | undefined = process.argv[1]): void {
  let active: ActiveSessionAttachment | undefined;
  const events = guardPiEvents(pi);
  const compatibility = assessPiHostVersion(discoverPiHostVersion(hostEntrypoint));

  const closeActive = async (): Promise<void> => {
    const closing = active;
    active = undefined;
    if (closing === undefined) return;
    closing.controller.abort();
    await closing.connection?.dispose();
    await closing.loop;
  };

  if (compatibility.status === 'unsupported') {
    pi.registerCommand('buildframe', {
      description: 'Attach this Pi session to the BuildFrame Reviewing application',
      handler: async (_args, ctx) => {
        ctx.ui.notify(`BuildFrame: ${piHostCompatibilityLabel(compatibility)}`, 'error');
      },
    });
    return;
  }

  bindPiReviewedAdapterEvents(pi, () => active?.adapter);

  // Attachment is explicit: an unattached session must never become a
  // default-route candidate just because the extension happens to be loaded.
  events.on('session_start', async (_event, ctx) => {
    await closeActive();
    ctx.ui.setStatus('buildframe', 'BuildFrame: /buildframe to attach this session');
  });

  events.on('session_shutdown', async (_event, ctx) => {
    await closeActive();
    ctx.ui.setStatus('buildframe', undefined);
  });

  const attach = async (ctx: ExtensionCommandContext, authority: PiDirectReviewAuthority): Promise<void> => {
    if (!hasRequiredNativeContract(pi, ctx)) {
      ctx.ui.notify('BuildFrame: Pi native contract unavailable', 'error');
      return;
    }
    const bootstrapped = await bootstrapWorkspace({ startPath: ctx.cwd });
    if (bootstrapped.status === 'rejected') {
      ctx.ui.notify('BuildFrame: this folder isn’t inside a git repository BuildFrame can review.', 'error');
      return;
    }
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    let adapter: PiReviewedAdapter;
    try {
      adapter = new PiReviewedAdapter({
        workspaceIdentity: identity.workspaceIdentity,
        canonicalCheckout: identity.canonicalCheckout,
        hostVersion: compatibility.version,
        sessionIdentity: ctx.sessionManager.getSessionId(),
        sessionEpoch: randomUUID(),
        native: nativeHost(pi, ctx),
        authority,
      });
    } catch {
      ctx.ui.notify('BuildFrame: Pi native contract unavailable', 'error');
      return;
    }
    const next: ActiveSessionAttachment = { controller: new AbortController(), adapter, authority };
    active = next;
    const outcome = await new Promise<AttachOutcome>(resolve => {
      next.loop = attachLoop(ctx, next, resolve)
        .catch(() => undefined)
        .finally(() => {
          if (active === next) active = undefined;
        });
    });
    if (outcome.status === 'connected') {
      ctx.ui.notify(`BuildFrame Review attached (${authorityLabel(authority)}).`, 'info');
      return;
    }
    if (outcome.status === 'retrying') {
      ctx.ui.notify(
        `BuildFrame isn’t open for ${identity.canonicalCheckout} yet. This session connects as soon as it opens.`,
        'warning',
      );
      return;
    }
    if (outcome.status === 'refused') {
      ctx.ui.notify(`BuildFrame: ${diagnosticLabel(outcome.diagnostic)}`, 'error');
    }
  };

  pi.registerCommand('buildframe', {
    description: 'Attach this Pi session to the BuildFrame Reviewing application',
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const action = args.trim().toLowerCase();
      if (action === 'status') {
        ctx.ui.notify(
          active === undefined
            ? 'BuildFrame is not attached to this session.'
            : `BuildFrame is attached as ${active.adapter.attachment.destination.sessionLabel} (${authorityLabel(active.authority)}).`,
          'info',
        );
        return;
      }
      if (action === 'disconnect' || action === 'detach') {
        if (active === undefined) {
          ctx.ui.notify('BuildFrame is not attached to this session.', 'info');
          return;
        }
        await closeActive();
        ctx.ui.notify('BuildFrame detached from this session.', 'info');
        return;
      }
      if (action === 'readonly' || action === 'read-only') {
        if (active?.authority === 'discussion-only') {
          ctx.ui.notify('BuildFrame is attached read-only already.', 'info');
          return;
        }
        await closeActive();
        await attach(ctx, 'discussion-only');
        return;
      }
      if (action === 'write') {
        if (active?.authority === 'workspace-write') {
          ctx.ui.notify('BuildFrame is attached with workspace write already.', 'info');
          return;
        }
        await closeActive();
        await attach(ctx, 'workspace-write');
        return;
      }
      if (action !== '') {
        ctx.ui.notify(BUILDFRAME_USAGE, 'warning');
        return;
      }
      if (active !== undefined) {
        ctx.ui.notify(
          `BuildFrame is attached to this session already (${authorityLabel(active.authority)}). Use /buildframe disconnect first.`,
          'info',
        );
        return;
      }
      await attach(ctx, 'workspace-write');
    },
  });
}
