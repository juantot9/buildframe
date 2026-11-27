import { bootstrapWorkspace } from '@buildframe/workspace';
import { publicIntegrationEndpoint } from '@buildframe/local-runtime/launcher';

/**
 * `bframe endpoint [--json] [repository]`: where an integration connects for
 * this checkout. Prints JSON for tools, or two plain lines for people. Exit 1
 * outside a repository BuildFrame can review.
 */
export async function runEndpointCommand(startPath: string, json: boolean): Promise<{ output: string; ok: boolean }> {
  const bootstrapped = await bootstrapWorkspace({ startPath });
  if (bootstrapped.status === 'rejected') {
    return { output: 'This folder isn’t inside a git repository BuildFrame can review.\n', ok: false };
  }
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  const endpoint = publicIntegrationEndpoint(identity.workspaceIdentity);
  if (json) return { output: `${JSON.stringify(endpoint)}\n`, ok: true };
  return {
    output: [
      `Socket     ${endpoint.socket}`,
      `Workspace  ${endpoint.workspace}`,
      'The socket exists while BuildFrame is open in this repository. Integrations speak protocol version 1.',
      '',
    ].join('\n'),
    ok: true,
  };
}
