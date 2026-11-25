import { describe, expect, it } from 'vitest';

import type { BuildFrameLightEvent, BuildFrameStatusEvent } from '../../src/openCodeHost.js';
import { createBuildFrameTui, type OpenCodeTuiContext, type OpenTuiSolid } from '../../src/tui.js';

interface FakeNode {
  readonly tag: string;
  readonly props: Record<string, unknown>;
  children: () => unknown;
}

/** Just enough of OpenTUI Solid to read what the light would draw: every read recomputes. */
function fakeSolid(): { readonly solid: OpenTuiSolid; readonly effects: (() => void)[] } {
  const effects: (() => void)[] = [];
  const solid: OpenTuiSolid = {
    createSignal: <T>(value: T) => {
      let current = value;
      return [() => current, (next: T) => (current = next)];
    },
    createElement: tag => ({ tag, props: {}, children: () => undefined }) satisfies FakeNode,
    insert: (parent, accessor) => {
      (parent as FakeNode).children = accessor;
    },
    effect: run => {
      effects.push(run);
      run();
    },
    setProp: (node, name, value) => {
      (node as FakeNode).props[name] = value;
    },
  };
  return { solid, effects };
}

/** A TUI context that records toasts and slot claims, and lets the test send RPC events. */
function fakeContext() {
  const listeners = new Map<string, (event: { data: unknown }) => void>();
  const toasts: string[] = [];
  const renders: ((input: { readonly sessionID?: string }) => unknown)[] = [];
  const context = {
    client: {
      rpc: () => ({
        events: {
          on: (name: string, listener: (event: { data: unknown }) => void) => {
            listeners.set(name, listener);
            return () => listeners.delete(name);
          },
        },
      }),
    },
    ui: {
      toast: { show: (toast: { message: string }) => toasts.push(toast.message) },
      slot: (claim: { render: (input: { readonly sessionID?: string }) => unknown }) => {
        renders.push(claim.render);
        return () => renders.splice(renders.indexOf(claim.render), 1);
      },
    },
    theme: {
      text: {
        muted: 'muted',
        feedback: { success: { base: 'green' }, warning: { base: 'amber' }, error: { base: 'red' } },
      },
    },
  } as unknown as OpenCodeTuiContext;
  const send = (name: 'status' | 'light', data: BuildFrameStatusEvent | BuildFrameLightEvent): void =>
    listeners.get(name)?.({ data });
  return { context, toasts, renders, send };
}

/** What one prompt footer shows: each text with its colour. */
function drawn(row: unknown, effects: readonly (() => void)[]): { text: unknown; fg: unknown }[] {
  for (const effect of effects) effect();
  const children = (row as FakeNode).children() as FakeNode[];
  return children.map(child => ({ text: child.children(), fg: child.props.fg }));
}

describe('the OpenCode TUI part', () => {
  it('shows the light in the connected session’s prompt footer only, in the theme’s colours', async () => {
    const { solid, effects } = fakeSolid();
    const { context, renders, send } = fakeContext();
    const dispose = createBuildFrameTui(async () => solid).setup(context);
    // A light that arrives before OpenTUI loads is kept for it.
    send('light', { sessionID: 'ses_one', text: '● BuildFrame', tone: 'success' });
    await Promise.resolve();
    await Promise.resolve();
    expect(renders).toHaveLength(1);

    const here = renders[0]!({ sessionID: 'ses_one' });
    const elsewhere = renders[0]!({ sessionID: 'ses_two' });
    expect(drawn(here, effects)).toEqual([
      { text: '●', fg: 'green' },
      { text: ' BuildFrame', fg: 'muted' },
    ]);
    expect(drawn(elsewhere, effects)).toEqual([]);

    send('light', {
      sessionID: 'ses_one',
      text: '○ BuildFrame moved to another session · /buildframe to take it back',
      tone: 'warning',
    });
    expect(drawn(here, effects)).toEqual([
      { text: '○', fg: 'amber' },
      { text: ' BuildFrame moved to another session · /buildframe to take it back', fg: 'amber' },
    ]);

    send('light', { sessionID: 'ses_one', text: '', tone: 'success' });
    expect(drawn(here, effects)).toEqual([]);
    dispose();
    expect(renders).toHaveLength(0);
  });

  it('keeps the toasts when OpenTUI Solid can’t be loaded', async () => {
    const { context, toasts, renders, send } = fakeContext();
    createBuildFrameTui(async () => {
      throw new Error('not inside OpenCode');
    }).setup(context);
    send('status', { sessionID: 'ses_one', message: 'BuildFrame connected to this session.', variant: 'success' });
    await Promise.resolve();
    expect(toasts).toEqual(['BuildFrame connected to this session.']);
    expect(renders).toHaveLength(0);
  });
});
