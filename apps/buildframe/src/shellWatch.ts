import type { Workspace, WorkspaceViewScope } from '@buildframe/workspace';

export interface ShellWatchHost {
  readonly workspace: Workspace;
  /** Whether updates for a subscription made in this route generation still matter. */
  current(generation: number): boolean;
  stopped(): boolean;
  /** Live views move without a new State version; only a different live identity is news. */
  isLive(scope: WorkspaceViewScope): boolean;
  /** The Workspace reported its projection records invalid. */
  failed(): void;
  /** Re-reads what is on screen; never runs twice at once. */
  refresh(): Promise<void>;
}

/** The Workspace's own rule for "same live view": its Live Changes identity, or status and reason. */
export function liveViewIdentity(view: object): string | undefined {
  const value = view as { readonly status?: string; readonly reason?: string; readonly liveChangesIdentity?: string };
  if (value.status === 'available') return value.liveChangesIdentity;
  return value.status === undefined ? undefined : `${value.status}:${value.reason}`;
}

/**
 * Keeps a screen's views current. Each subscription remembers the State
 * version (and live identity) already shown, so only news triggers work;
 * a burst of updates becomes one refresh, and a refresh asked for while one
 * runs runs once more afterwards. A slot holds one subscription that is
 * replaced as a whole (the Diff of whichever file is shown).
 */
export class ShellWatch {
  readonly #host: ShellWatchHost;
  readonly #unsubscribers = new Map<string, () => void>();
  readonly #announcedVersions = new Map<string, number>();
  readonly #announcedLive = new Map<string, string | undefined>();
  readonly #slots = new Map<string, string>();
  #refreshScheduled = false;
  #refreshInFlight = false;
  #refreshRequested = false;

  constructor(host: ShellWatchHost) {
    this.#host = host;
  }

  watch(
    scope: WorkspaceViewScope,
    generation: number,
    knownStateVersion = -1,
    knownLiveIdentity?: string,
    slot?: string,
  ): void {
    const identity = JSON.stringify(scope);
    this.#unsubscribers.get(identity)?.();
    this.#announcedVersions.set(identity, knownStateVersion);
    this.#announcedLive.set(identity, knownLiveIdentity);
    const live = this.#host.isLive(scope);
    const unsubscribe = this.#host.workspace.subscribe(scope, update => {
      if (!this.#host.current(generation)) return;
      if (update.kind === 'workspace.projection-failed') {
        this.#host.failed();
        return;
      }
      // Every watched view carries the State version it was read at.
      const stateVersion = (update as { readonly stateVersion: number }).stateVersion;
      const previous = this.#announcedVersions.get(identity) ?? -1;
      const liveIdentity = live ? liveViewIdentity(update) : undefined;
      if (stateVersion <= previous) {
        // Live Changes move without a new committed version; only a different identity is news.
        if (!live || liveIdentity === this.#announcedLive.get(identity)) return;
      }
      this.#announcedVersions.set(identity, stateVersion);
      this.#announcedLive.set(identity, liveIdentity);
      this.requestRefresh();
    });
    this.#unsubscribers.set(identity, unsubscribe);
    if (slot !== undefined) this.#slots.set(slot, identity);
  }

  /** Ends the subscription in `slot`, if any. */
  release(slot: string): void {
    const identity = this.#slots.get(slot);
    if (identity === undefined) return;
    this.#unsubscribers.get(identity)?.();
    this.#unsubscribers.delete(identity);
    this.#announcedVersions.delete(identity);
    this.#slots.delete(slot);
  }

  clear(): void {
    for (const unsubscribe of this.#unsubscribers.values()) unsubscribe();
    this.#unsubscribers.clear();
    this.#announcedVersions.clear();
    this.#announcedLive.clear();
    this.#slots.clear();
  }

  requestRefresh(): void {
    if (this.#host.stopped()) return;
    this.#refreshRequested = true;
    if (this.#refreshScheduled || this.#refreshInFlight) return;
    this.#refreshScheduled = true;
    queueMicrotask(() => {
      this.#refreshScheduled = false;
      void this.#drain();
    });
  }

  async #drain(): Promise<void> {
    if (this.#host.stopped() || this.#refreshInFlight) return;
    this.#refreshInFlight = true;
    try {
      while (this.#refreshRequested && !this.#host.stopped()) {
        this.#refreshRequested = false;
        await this.#host.refresh();
      }
    } finally {
      this.#refreshInFlight = false;
      if (this.#refreshRequested && !this.#host.stopped()) this.requestRefresh();
    }
  }
}
