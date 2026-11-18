import { describe, expect, it } from 'vitest';

import type { Workspace, WorkspaceViewScope } from '@buildframe/workspace';

import { ShellWatch } from '../../src/shellWatch.js';

type Listener = (update: object) => void;

/** A Workspace that only subscribes; the test pushes updates by scope kind. */
function fakeWorkspace() {
  const listeners = new Map<string, Listener>();
  const unsubscribed: string[] = [];
  const workspace = {
    subscribe: (scope: WorkspaceViewScope, listener: Listener) => {
      listeners.set(scope.kind, listener);
      return () => unsubscribed.push(scope.kind);
    },
  } as unknown as Workspace;
  return { workspace, push: (kind: string, update: object) => listeners.get(kind)?.(update), unsubscribed };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

function watcher() {
  const fake = fakeWorkspace();
  let refreshes = 0;
  const failures: string[] = [];
  const watch = new ShellWatch({
    workspace: fake.workspace,
    current: generation => generation === 1,
    stopped: () => false,
    isLive: scope => scope.kind === 'review.live-files',
    failed: () => failures.push('failed'),
    refresh: async () => {
      refreshes += 1;
    },
  });
  return { watch, fake, failures, refreshes: () => refreshes };
}

const scope = (kind: string) => ({ kind }) as unknown as WorkspaceViewScope;

describe('keeping views current', () => {
  it('refreshes once for a burst of news and ignores versions already shown', async () => {
    const { watch, fake, refreshes } = watcher();
    watch.watch(scope('workspace.home'), 1, 4);
    fake.push('workspace.home', { stateVersion: 4 });
    await settle();
    expect(refreshes()).toBe(0);
    fake.push('workspace.home', { stateVersion: 5 });
    fake.push('workspace.home', { stateVersion: 6 });
    await settle();
    expect(refreshes()).toBe(1);
  });

  it('treats a live view as news only when its live identity changes', async () => {
    const { watch, fake, refreshes } = watcher();
    watch.watch(scope('review.live-files'), 1, 4, 'live-a');
    fake.push('review.live-files', { stateVersion: 4, status: 'available', liveChangesIdentity: 'live-a' });
    await settle();
    expect(refreshes()).toBe(0);
    fake.push('review.live-files', { stateVersion: 4, status: 'available', liveChangesIdentity: 'live-b' });
    await settle();
    expect(refreshes()).toBe(1);
  });

  it('drops updates from an older route and reports invalid projections', async () => {
    const { watch, fake, failures, refreshes } = watcher();
    watch.watch(scope('workspace.home'), 0);
    fake.push('workspace.home', { stateVersion: 9 });
    watch.watch(scope('review.manifest'), 1);
    fake.push('review.manifest', { kind: 'workspace.projection-failed', stateVersion: 9 });
    await settle();
    expect(refreshes()).toBe(0);
    expect(failures).toEqual(['failed']);
  });

  it('replaces the subscription in a slot as a whole', () => {
    const { watch, fake } = watcher();
    watch.watch(scope('review.diff'), 1, -1, undefined, 'diff');
    watch.release('diff');
    watch.release('diff');
    expect(fake.unsubscribed).toEqual(['review.diff']);
  });
});
