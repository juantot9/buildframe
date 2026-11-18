import type { Workspace, WorkspaceView, WorkspaceViewScope } from '@buildframe/workspace';

import type { NoticeTone } from './reviewingStatus.js';
import { semanticError } from './shellCommands.js';
import { isLiveScope, liveViewIdentity, ShellWatch } from './shellWatch.js';

const MAX_ATTEMPTS = 5;

type ReadTogether =
  | { readonly status: 'settled'; readonly views: Readonly<Record<string, WorkspaceView>> }
  /** The State kept moving between reads: no set of views agreed on one version. */
  | { readonly status: 'unsettled' };

function stateVersionOf(view: WorkspaceView): number | undefined {
  const version = (view as { readonly stateVersion?: unknown }).stateVersion;
  return typeof version === 'number' ? version : undefined;
}

/**
 * Reads a screen's views so they describe one moment: every view that carries
 * a State version must carry the same one, or the set is read again. A screen
 * never shows a manifest from one version beside a list from another.
 */
async function readTogether(
  workspace: Workspace,
  scopes: Readonly<Record<string, WorkspaceViewScope>>,
): Promise<ReadTogether> {
  const entries = Object.entries(scopes);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const views = await Promise.all(entries.map(async ([, scope]) => (await workspace.read(scope)) as WorkspaceView));
    const versions = new Set(views.map(stateVersionOf).filter(version => version !== undefined));
    if (versions.size <= 1) {
      return { status: 'settled', views: Object.fromEntries(entries.map(([name], index) => [name, views[index]!])) };
    }
  }
  return { status: 'unsettled' };
}

type Scopes = Readonly<Record<string, WorkspaceViewScope>>;
type Views = Readonly<Record<string, WorkspaceView>>;

interface ViewSource {
  scopes(): Scopes;
  receive(views: Views): void;
}

interface ViewRequest {
  readonly scopes: Scopes;
  readonly identities: ReadonlyMap<string, string>;
  reading: boolean;
  refreshRequested: boolean;
}

interface ViewHost {
  changed(): void;
  say(sentence: string, tone: NoticeTone): void;
}

/** Reads and watches the active screen's views, including scopes changed by local screen actions. */
export class ShellViews {
  readonly #workspace: Workspace;
  readonly #host: ViewHost;
  readonly #watch: ShellWatch;
  readonly #watched = new Map<string, string>();
  #source: ViewSource | undefined;
  #request: ViewRequest | undefined;
  #generation = 0;
  #loading = false;
  #stopped = false;

  constructor(workspace: Workspace, host: ViewHost) {
    this.#workspace = workspace;
    this.#host = host;
    this.#watch = new ShellWatch({
      workspace,
      current: generation => !this.#stopped && generation === this.#generation,
      stopped: () => this.#stopped,
      isLive: isLiveScope,
      failed: () => this.#host.say('Workspace projection records are invalid.', 'error'),
      refresh: async () => {
        const request = this.#request;
        if (request === undefined) return;
        // Coalesce updates for this request without blocking notifications for a newer one.
        if (request.reading) request.refreshRequested = true;
        else void this.#startRead(request);
      },
    });
  }

  get loading(): boolean {
    return this.#loading;
  }

  /** Switches sources and waits for the new screen's first read attempt, if any. */
  async show(source: ViewSource | undefined): Promise<void> {
    if (this.#stopped) return;
    this.#clear();
    this.#source = source;
    const reading = this.#reconcile();
    this.#host.changed();
    await reading;
  }

  /** A screen action may change the scopes without changing Workspace State. */
  reconcile(): void {
    void this.#reconcile();
  }

  stop(): void {
    this.#stopped = true;
    this.#clear();
  }

  #clear(): void {
    this.#generation += 1;
    this.#source = undefined;
    this.#request = undefined;
    this.#loading = false;
    this.#watch.clear();
    this.#watched.clear();
  }

  #reconcile(): Promise<void> | undefined {
    const scopes = this.#source?.scopes();
    if (scopes === undefined) return;
    const identities = new Map(Object.entries(scopes).map(([slot, scope]) => [slot, JSON.stringify(scope)]));
    const previous = this.#request?.identities;
    if (previous?.size === identities.size && [...identities].every(([slot, id]) => previous.get(slot) === id)) {
      return;
    }
    for (const [slot, id] of this.#watched) {
      if (identities.get(slot) !== id) {
        this.#watch.release(slot);
        this.#watched.delete(slot);
      }
    }
    const request = { scopes, identities, reading: false, refreshRequested: false };
    this.#request = request;
    this.#loading = identities.size > 0;
    return this.#startRead(request);
  }

  async #startRead(request: ViewRequest): Promise<void> {
    request.reading = true;
    try {
      await this.#read(request);
    } finally {
      request.reading = false;
      if (this.#request === request && request.refreshRequested) {
        request.refreshRequested = false;
        void this.#startRead(request);
      }
    }
  }

  async #read(request: ViewRequest): Promise<void> {
    let read: ReadTogether | { readonly status: 'failed'; readonly error: unknown };
    try {
      read = await readTogether(this.#workspace, request.scopes);
    } catch (error) {
      read = { status: 'failed', error };
    }
    if (this.#request !== request) return;
    this.#loading = false;
    const watchWarning = this.#watchViews(request, read.status === 'settled' ? read.views : undefined);
    switch (read.status) {
      case 'failed':
        this.#host.say(`Couldn’t read this screen. ${semanticError(read.error)}`, 'error');
        break;
      case 'unsettled':
        this.#host.say(
          watchWarning ??
            'The Workspace kept changing while this screen read it; it will try again on the next change.',
          'warning',
        );
        break;
      case 'settled':
        this.#source?.receive(read.views);
        this.reconcile();
        if (watchWarning !== undefined) this.#host.say(watchWarning, 'warning');
        else this.#host.changed();
        break;
    }
  }

  #watchViews(request: ViewRequest, views: Views | undefined): string | undefined {
    let warning: string | undefined;
    for (const [slot, id] of request.identities) {
      if (this.#watched.has(slot)) continue;
      const scope = request.scopes[slot]!;
      const view = views?.[slot];
      try {
        // Even when the read failed, the subscription can tell us when to retry.
        this.#watch.watch(
          scope,
          this.#generation,
          view === undefined ? undefined : stateVersionOf(view),
          view !== undefined && isLiveScope(scope) ? liveViewIdentity(view) : undefined,
          slot,
        );
        this.#watched.set(slot, id);
      } catch (error) {
        warning ??= `Couldn’t keep this screen up to date. ${semanticError(error)}`;
      }
    }
    return warning;
  }
}
