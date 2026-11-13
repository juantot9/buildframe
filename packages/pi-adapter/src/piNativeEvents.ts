import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import type { PiReviewedAdapter, PiStoredEntry } from './piAdapter.js';
import { guardPiEvents } from './piEvents.js';

export type CurrentPiReviewedAdapter = () => PiReviewedAdapter | undefined;

function sessionEntries(ctx: ExtensionContext): readonly PiStoredEntry[] {
  return ctx.sessionManager.getBranch() as readonly PiStoredEntry[];
}

/** Native Pi lifecycle capture shared by production attachment and live probe. */
export function bindPiReviewedAdapterEvents(pi: ExtensionAPI, current: CurrentPiReviewedAdapter): void {
  const events = guardPiEvents(pi);
  events.on('input', event =>
    current()?.onInput({
      text: event.text,
      source: event.source,
      hasImages: (event.images?.length ?? 0) > 0,
    }),
  );

  events.on('before_agent_start', async event => {
    // Pi 1.2 also starts runs from custom messages, which carry no prompt and
    // so can never be the Review Message; 0.x events have no `messageType`.
    if (event.messageType === 'custom') {
      await current()?.beforeAgentStart(undefined, false);
      return;
    }
    await current()?.beforeAgentStart(event.prompt, (event.images?.length ?? 0) > 0);
  });

  events.on('agent_start', async () => {
    await current()?.agentStarted();
  });

  events.on('tool_call', event => current()?.onToolCall(event.toolName));

  events.on('agent_settled', async (_event, ctx) => {
    await current()?.agentSettled(sessionEntries(ctx));
  });

  events.on('session_before_switch', (_event, ctx) => {
    if (current()?.ownsInvocation() !== true) return;
    ctx.ui.notify('Finish or interrupt the BuildFrame Review request before replacing the Pi session.', 'warning');
    return { cancel: true };
  });

  events.on('session_before_fork', (_event, ctx) => {
    if (current()?.ownsInvocation() !== true) return;
    ctx.ui.notify('Finish or interrupt the BuildFrame Review request before replacing the Pi session.', 'warning');
    return { cancel: true };
  });

  events.on('session_before_tree', (_event, ctx) => {
    if (current()?.ownsInvocation() !== true) return;
    ctx.ui.notify('Finish or interrupt the BuildFrame Review request before moving the Pi session leaf.', 'warning');
    return { cancel: true };
  });
}
