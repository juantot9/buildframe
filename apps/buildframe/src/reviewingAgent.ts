import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import type { ReviewingApplicationState } from './reviewingModel.js';

/** The coding agent's name for sentences, e.g. "Claude Code"; generic until one is known. */
export function agentName(state: ReviewingApplicationState): string {
  return state.agentLabel ?? 'The agent';
}

/** Whether a coding agent is live now; previewing needs one to inspect against. */
export function agentConnected(state: ReviewingApplicationState): boolean {
  return state.harnessConnection?.harnesses.some(harness => harness.connected) === true;
}

/**
 * The sentence for each new connection view: which session connected, said
 * once when a different session than the last one connects. Nothing for the
 * first view, which only reports what was connected already, or for the same
 * session coming back. The header names the harness; this names the session,
 * so two sessions of one harness can be told apart.
 */
export function connectionNotices(): (view: HarnessConnectionView) => string | undefined {
  let first = true;
  let last: string | undefined;
  return view => {
    const connected = view.harnesses.find(harness => harness.connected);
    const wasFirst = first;
    first = false;
    if (connected === undefined) return undefined;
    const changed = connected.attachmentIdentity !== last;
    last = connected.attachmentIdentity;
    return wasFirst || !changed ? undefined : `Connected to ${connected.harnessLabel} · ${connected.sessionLabel}`;
  };
}
