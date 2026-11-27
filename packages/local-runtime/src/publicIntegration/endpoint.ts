import type { WorkspaceIdentity } from '@buildframe/workspace';

import { runtimeLocationForWorkspace } from '../runtimeLocation.js';
import { PUBLIC_INTEGRATION_PROTOCOL_VERSION } from './wire.js';

/** What `bframe endpoint --json` prints: where an integration connects, and what it says it connects to. */
export interface PublicIntegrationEndpoint {
  readonly protocolVersions: readonly number[];
  readonly socket: string;
  readonly workspace: string;
}

/**
 * The public endpoint of one checkout. The socket exists only while BuildFrame
 * is open there; any process running as this user may connect, which is v1's
 * whole trust model, so none of this is secret.
 */
export function publicIntegrationEndpoint(workspaceIdentity: WorkspaceIdentity): PublicIntegrationEndpoint {
  return {
    protocolVersions: [PUBLIC_INTEGRATION_PROTOCOL_VERSION],
    socket: runtimeLocationForWorkspace(workspaceIdentity).endpoint,
    workspace: workspaceIdentity,
  };
}
