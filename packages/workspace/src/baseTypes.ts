/**
 * The Workspace's base types, imported by every owner. This file imports
 * nothing, so an owner never depends on the composition root (workspace.ts).
 */

declare const workspaceIdentityBrand: unique symbol;

/** A stable opaque identity for one canonical Git worktree. */
export type WorkspaceIdentity = string & {
  readonly [workspaceIdentityBrand]: 'WorkspaceIdentity';
};

export const WORKSPACE_INTERFACE_VERSION: 1 = 1;

/**
 * Whether someone is looking at the Workspace's live views. In the
 * background the Workspace checks the working tree less often between
 * file-watcher reports; back in the foreground it checks at once.
 */
export type WorkspaceAttention = 'foreground' | 'background';
