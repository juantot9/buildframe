import { randomUUID } from 'node:crypto';

import { bootstrapWorkspace } from '@buildframe/workspace';
import {
  connectorIndicator,
  connectorIndicatorText,
  type ConnectorStatus,
} from '@buildframe/local-runtime/harness-adapter';

import { isReviewedOpenCodeHostVersion, OPENCODE_HOST_COMPATIBILITY_RANGE } from './capability.js';
import { OpenCodeReviewedAdapter } from './openCodeAdapter.js';
import {
  BUILDFRAME_RPC,
  type BuildFrameLightEvent,
  type BuildFrameStatusEvent,
  type OpenCodeCommandInvocation,
  type OpenCodeServerContext,
} from './openCodeHost.js';

/** The events the adapter reads; everything else stays unsubscribed. */
const SESSION_EVENTS = [
  'session.inbox.enqueued',
  'session.inbox.delivered',
  'session.inbox.cancelled',
  'session.execution.started',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
  'session.step.ended',
  'session.step.failed',
  'session.text.ended',
] as const;

const USAGE = 'Usage: /buildframe, /buildframe status, or /buildframe disconnect';

interface Active {
  readonly sessionID: string;
  readonly adapter: OpenCodeReviewedAdapter;
}

export interface BuildFrameServerDependencies {
  readonly bootstrap?: typeof bootstrapWorkspace;
}

function sessionOf(data: unknown): string | undefined {
  const value = typeof data === 'object' && data !== null ? (data as { sessionID?: unknown }).sessionID : undefined;
  return typeof value === 'string' ? value : undefined;
}

/** A failed `/buildframe`: OpenCode shows the message as "Failed to run command". */
class BuildFrameCommandError extends Error {}

/**
 * The server part: `/buildframe` connects the session it runs in, OpenCode's
 * events feed the adapter, prompts typed during BuildFrame's turn are held
 * until it ends, and what happens is told to the TUI part to show.
 */
export async function setUpBuildFrame(
  ctx: OpenCodeServerContext,
  dependencies: BuildFrameServerDependencies = {},
): Promise<() => Promise<void>> {
  const bootstrap = dependencies.bootstrap ?? bootstrapWorkspace;
  const version = ctx.app.version;
  const supported = isReviewedOpenCodeHostVersion(version);
  let active: Active | undefined;
  const rpc = await ctx.rpc.register(BUILDFRAME_RPC, {});
  const tell = (status: BuildFrameStatusEvent): void => {
    try {
      void Promise.resolve(rpc.events.emit('status', status)).catch(() => undefined);
    } catch {
      // A TUI that isn't listening misses the toast; nothing else depends on it.
    }
  };
  const show = (light: BuildFrameLightEvent): void => {
    try {
      void Promise.resolve(rpc.events.emit('light', light)).catch(() => undefined);
    } catch {
      // A TUI that isn't listening shows no light; the toasts still say what happened.
    }
  };

  const closeActive = async (): Promise<void> => {
    const closing = active;
    active = undefined;
    await closing?.adapter.session.close();
  };

  const controller = new AbortController();
  if (supported) {
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ types: SESSION_EVENTS, signal: controller.signal })) {
          const current = active;
          if (current !== undefined && sessionOf(event.data) === current.sessionID)
            await current.adapter.observe(event);
        }
      } catch {
        // The stream ends on unload; a stream that breaks mid-turn loses that turn's end, which the kit reports.
      }
    })();
    await ctx.session.hook('prompt', event => {
      const current = active;
      if (current === undefined || event.sessionID !== current.sessionID || !current.adapter.holdsPrompts) return;
      // BuildFrame's own prompt is queued already; anything else waits for BuildFrame's turn to end.
      event.delivery = 'queue';
    });
  }

  const attach = async (sessionID: string): Promise<void> => {
    const session = await ctx.session.get({ sessionID });
    const bootstrapped = await bootstrap({ startPath: session.location.directory });
    if (bootstrapped.status === 'rejected') {
      throw new BuildFrameCommandError('BuildFrame: this folder isn’t inside a git repository BuildFrame can review.');
    }
    const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
    const adapter = new OpenCodeReviewedAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      hostVersion: version,
      sessionIdentity: sessionID,
      sessionEpoch: randomUUID(),
      native: {
        prompt: async input => ({
          text: (await ctx.session.prompt({ sessionID, id: input.id, text: input.text, delivery: 'queue' })).payload
            .text,
        }),
        interrupt: async () => (await ctx.session.interrupt({ sessionID, resume: false })).interrupted,
      },
    });
    const next: Active = { sessionID, adapter };
    active = next;
    const outcome = await adapter.session.attach(status => {
      if ((status.kind === 'refused' || status.kind === 'replaced') && active === next) active = undefined;
      show(lightOf(sessionID, status));
      // The first status answers the command below; later the light says the
      // rest, and only losing the session to another one is also news.
      if (!status.first && status.kind === 'replaced') {
        tell({
          sessionID,
          message:
            'BuildFrame: another session connected to this repository, so this one was disconnected. Run /buildframe here to take it back.',
          variant: 'warning',
        });
      }
    });
    if (outcome.kind === 'connected') {
      tell({ sessionID, message: 'BuildFrame connected to this session.', variant: 'success' });
    } else if (outcome.kind === 'retrying') {
      tell({
        sessionID,
        message: `BuildFrame isn’t open for ${identity.canonicalCheckout} yet. This session connects as soon as it opens.`,
        variant: 'warning',
      });
    } else if (outcome.kind === 'refused') {
      throw new BuildFrameCommandError(outcome.text);
    }
  };

  await ctx.command.transform(editor =>
    editor.add({
      name: 'buildframe',
      description: 'Connect this session to BuildFrame',
      execute: async ({ sessionID, prompt }: OpenCodeCommandInvocation) => {
        if (!supported) {
          throw new BuildFrameCommandError(
            `BuildFrame supports OpenCode ${OPENCODE_HOST_COMPATIBILITY_RANGE}; this is OpenCode ${version}.`,
          );
        }
        const action = prompt.text.trim().toLowerCase();
        const here = active?.sessionID === sessionID;
        if (action === 'status') {
          tell({
            sessionID,
            message: here ? 'BuildFrame is connected to this session.' : 'BuildFrame is not connected to this session.',
            variant: 'info',
          });
          return;
        }
        if (action === 'disconnect' || action === 'detach') {
          if (!here) throw new BuildFrameCommandError('BuildFrame is not connected to this session.');
          await closeActive();
          tell({ sessionID, message: 'BuildFrame disconnected from this session.', variant: 'info' });
          return;
        }
        if (action !== '') throw new BuildFrameCommandError(USAGE);
        if (here) {
          tell({ sessionID, message: 'BuildFrame is connected to this session already.', variant: 'info' });
          return;
        }
        // One session per plugin location: connecting another one here replaces the last.
        await closeActive();
        await attach(sessionID);
      },
    }),
  );

  return async () => {
    controller.abort();
    await closeActive();
  };
}

/** The light for one status; an empty text once the session disconnected on purpose. */
function lightOf(sessionID: string, status: ConnectorStatus): BuildFrameLightEvent {
  const indicator = connectorIndicator(status, { readOnly: false, command: '/buildframe' });
  return indicator === undefined
    ? { sessionID, text: '', tone: 'success' }
    : { sessionID, text: connectorIndicatorText(indicator), tone: indicator.tone };
}
