import type { Workspace, WorkspaceViewScope } from '@buildframe/workspace';
import type { WorkspaceHomeView } from '@buildframe/workspace/projection';
import { describe, expect, it, vi } from 'vitest';

import { ShellViews } from '../../src/shellViews.js';

type HomeScope = Extract<WorkspaceViewScope, { readonly kind: 'workspace.home' }>;

function home(offset: number, stateVersion: number): WorkspaceHomeView {
  return {
    kind: 'workspace.home',
    projectionVersion: 1,
    stateVersion,
    header: { title: 'Home', totalReviews: 0, totalPastReviews: 0 },
    reviews: { offset, items: [], nextOffset: null },
    actions: [],
  };
}

function fixture(initialError?: Error) {
  const read = vi.fn(async (scope: HomeScope) => home(scope.offset, 1));
  if (initialError !== undefined) read.mockRejectedValueOnce(initialError);
  const listeners = new Map<number, (view: WorkspaceHomeView) => void>();
  const workspace = {
    read,
    subscribe: (scope: HomeScope, listener: (view: WorkspaceHomeView) => void) => {
      listeners.set(scope.offset, listener);
      return () => listeners.delete(scope.offset);
    },
  } as unknown as Workspace;
  const say = vi.fn();
  const views = new ShellViews(workspace, { changed: () => undefined, say });
  const received: WorkspaceHomeView[] = [];
  let offset = 0;
  const reading = views.show({
    scopes: () => ({ home: { kind: 'workspace.home', offset, limit: 1 } }),
    receive: ({ home }) => received.push(home as WorkspaceHomeView),
  });
  return {
    read,
    reading,
    say,
    received,
    views,
    changeOffset: (next: number) => {
      offset = next;
      views.reconcile();
    },
    update: (value: WorkspaceHomeView) => listeners.get(value.reviews.offset)?.(value),
    subscribed: () => [...listeners.keys()],
  };
}

describe('shell views', () => {
  it('reads a new scope immediately and ignores the old read even if it finishes last', async () => {
    const { read, reading, received, subscribed, views, changeOffset } = fixture();
    await reading;
    let finishStale!: (view: WorkspaceHomeView) => void;
    const stale = new Promise<WorkspaceHomeView>(resolve => (finishStale = resolve));
    read.mockReturnValueOnce(stale);
    changeOffset(1);
    expect(views.loading).toBe(true);
    expect(subscribed()).toEqual([]);
    changeOffset(2);
    await vi.waitFor(() => expect(received.map(view => view.reviews.offset)).toEqual([0, 2]));
    expect(views.loading).toBe(false);
    finishStale(home(1, 1));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(received.map(view => view.reviews.offset)).toEqual([0, 2]);
    expect(subscribed()).toEqual([2]);
    changeOffset(2);
    expect(read).toHaveBeenCalledTimes(3);
    views.stop();
    expect(subscribed()).toEqual([]);
  });

  it('recovers from a failed initial read when a later Workspace update arrives', async () => {
    const { read, reading, say, received, views, subscribed, update } = fixture(new Error('temporarily unavailable'));
    await reading;
    expect(say).toHaveBeenCalledWith(expect.stringContaining('temporarily unavailable'), 'error');
    expect(views.loading).toBe(false);
    expect(subscribed()).toEqual([0]);

    const page = home(0, 2);
    read.mockResolvedValueOnce(page);
    update(page);
    await vi.waitFor(() => expect(received.at(-1)).toEqual(page));
    views.stop();
  });
});
