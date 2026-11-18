import { randomUUID } from 'node:crypto';

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { bootstrapWorkspace } from '@buildframe/workspace';
import type { ConnectorStatus } from '@buildframe/local-runtime/harness-adapter';

import { CORRELATION_ENTRY_TYPE, PiReviewedAdapter, type PiNativeHost } from './piAdapter.js';
import type { PiDirectReviewAuthority } from './capability.js';
import { guardPiEvents } from './piEvents.js';
import { assessPiHostVersion, discoverPiHostVersion, piHostCompatibilityLabel } from './piHostCompatibility.js';
import { bindPiReviewedAdapterEvents } from './piNativeEvents.js';

interface ActiveSessionAttachment {
  readonly adapter: PiReviewedAdapter;
  readonly authority: PiDirectReviewAuthority;
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

/** Later statuses only update the footer; the first one answers the command. */
function showStatus(ctx: ExtensionContext, status: ConnectorStatus): void {
  switch (status.kind) {
    case 'connected':
      ctx.ui.setStatus('buildframe', status.text);
      return;
    case 'retrying':
      ctx.ui.setStatus('buildframe', status.label === undefined ? status.text : `BuildFrame: ${status.label}`);
      return;
    case 'refused':
      ctx.ui.setStatus('buildframe', status.text);
      return;
    case 'replaced':
      ctx.ui.setStatus('buildframe', status.text);
      ctx.ui.notify(
        'BuildFrame: another session connected to this repository, so this one was disconnected. Run /buildframe here to take it back.',
        'warning',
      );
      return;
    case 'cancelled':
      return;
  }
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
    await closing?.adapter.session.close();
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
    const next: ActiveSessionAttachment = { adapter, authority };
    active = next;
    const outcome = await adapter.session.attach(status => {
      showStatus(ctx, status);
      // A refused or replaced session stops for good; a new /buildframe starts over.
      if ((status.kind === 'refused' || status.kind === 'replaced') && active === next) active = undefined;
    });
    if (outcome.kind === 'connected') {
      ctx.ui.notify(`BuildFrame Review attached (${authorityLabel(authority)}).`, 'info');
      return;
    }
    if (outcome.kind === 'retrying') {
      ctx.ui.notify(
        `BuildFrame isn’t open for ${identity.canonicalCheckout} yet. This session connects as soon as it opens.`,
        'warning',
      );
      return;
    }
    if (outcome.kind === 'refused') {
      ctx.ui.notify(outcome.text, 'error');
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
