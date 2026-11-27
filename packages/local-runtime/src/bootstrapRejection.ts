import { WORKSPACE_INTERFACE_VERSION } from '@buildframe/workspace';

import { LOCAL_RUNTIME_PROTOCOL_VERSION } from './contracts.js';
import type { BootstrapRejectedFrame } from './protocol.js';

/** The private bootstrap's refusal, with the versions it supports when versions were the problem. */
export function bootstrapRejection(
  code: BootstrapRejectedFrame['code'],
  receivedProtocolVersion?: number,
  receivedWorkspaceInterfaceVersion?: number,
): BootstrapRejectedFrame {
  const frame: BootstrapRejectedFrame = {
    type: 'bootstrap.rejected',
    code,
  };
  if (receivedProtocolVersion !== undefined) {
    return {
      ...frame,
      supportedProtocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      receivedProtocolVersion,
    };
  }
  if (receivedWorkspaceInterfaceVersion !== undefined) {
    return {
      ...frame,
      supportedWorkspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
      receivedWorkspaceInterfaceVersion,
    };
  }
  return frame;
}
