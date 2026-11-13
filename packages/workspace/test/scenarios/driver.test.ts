import { describe, expect, it } from 'vitest';

import { runWorkspaceScenario, type WorkspaceScenario, type WorkspaceScenarioSession } from './driver.js';

type Command = { readonly kind: 'probe' };
type CommandResult = { readonly stateVersion: number };
type ViewRequest = { readonly kind: 'home' };
type View = { readonly stateVersion: number };
type ViewScope = { readonly kind: 'home' };
type ViewUpdate = { readonly stateVersion: number };

describe('Workspace scenario driver shell', () => {
  it('drives only execute, read, and subscribe', async () => {
    const calls: string[] = [];
    const workspace: WorkspaceScenarioSession<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate> = {
      async execute() {
        calls.push('execute');
        return { stateVersion: 1 };
      },
      async read() {
        calls.push('read');
        return { stateVersion: 1 };
      },
      subscribe(_scope, onUpdate) {
        calls.push('subscribe');
        onUpdate({ stateVersion: 1 });
        return () => calls.push('unsubscribe');
      },
    };
    const scenario: WorkspaceScenario<Command, CommandResult, ViewRequest, View, ViewScope, ViewUpdate> = {
      name: 'source island accepts a semantic session',
      async run(session) {
        await session.execute({ kind: 'probe' });
        await session.read({ kind: 'home' });
        const unsubscribe = session.subscribe({ kind: 'home' }, () => {
          calls.push('update');
        });
        unsubscribe();
      },
    };

    await runWorkspaceScenario(workspace, scenario);

    expect(calls).toEqual(['execute', 'read', 'subscribe', 'update', 'unsubscribe']);
  });
});
