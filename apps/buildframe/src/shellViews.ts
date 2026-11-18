import type { Workspace, WorkspaceView, WorkspaceViewScope } from '@buildframe/workspace';

const MAX_ATTEMPTS = 5;

export type ReadTogether =
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
export async function readTogether(
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
