import type { Workspace, WorkspaceAttention } from '@buildframe/workspace';

/**
 * One Workspace serves every client, so it stays in the foreground while any
 * client is, or while none has said; only all-background clients slow it.
 */
export class SharedRuntimeAttention {
  readonly #workspace: Workspace;
  readonly #reports = new Map<object, WorkspaceAttention>();
  #current: WorkspaceAttention = 'foreground';

  constructor(workspace: Workspace) {
    this.#workspace = workspace;
  }

  report(client: object, attention: WorkspaceAttention | undefined): void {
    if (attention === undefined) this.#reports.delete(client);
    else this.#reports.set(client, attention);
    const reports = [...this.#reports.values()];
    const next = reports.length > 0 && !reports.includes('foreground') ? 'background' : 'foreground';
    if (next === this.#current) return;
    this.#current = next;
    this.#workspace.setAttention(next);
  }
}
