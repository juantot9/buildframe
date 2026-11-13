import { WORKSPACE_INTERFACE_VERSION } from '@buildframe/workspace';
import { describe, expect, it } from 'vitest';

import { LOCAL_RUNTIME_PROTOCOL_VERSION } from '../../src/contracts.js';
import {
  parseBootstrapAcceptedFrame,
  parseBootstrapFrame,
  parseBootstrapRejectedFrame,
  type BootstrapRejectedFrame,
} from '../../src/protocol.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000041';
const RUNTIME_GENERATION = 'rtg_00000000-0000-4000-8000-000000000042';
const RUNTIME_CODE_IDENTITY = `rtc_${'4'.repeat(64)}`;

function acceptedFrame(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    type: 'bootstrap.accepted',
    protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
    workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
    workspaceIdentity: WORKSPACE_IDENTITY,
    role: 'tui',
    runtimeGeneration: RUNTIME_GENERATION,
    ...overrides,
  };
}

describe('Local Runtime bootstrap protocol', () => {
  it('accepts code identity only as one exact retire-on-mismatch discovery pair', () => {
    const ordinary = {
      type: 'bootstrap',
      protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
    };
    const discovery = {
      ...ordinary,
      runtimeCodeIdentity: RUNTIME_CODE_IDENTITY,
      runtimeCodeMismatch: 'retire',
    };

    expect(parseBootstrapFrame(ordinary)).toEqual(ordinary);
    expect(parseBootstrapFrame(discovery)).toEqual(discovery);
    expect(parseBootstrapFrame({ ...ordinary, runtimeCodeIdentity: RUNTIME_CODE_IDENTITY })).toBeUndefined();
    expect(parseBootstrapFrame({ ...ordinary, runtimeCodeMismatch: 'retire' })).toBeUndefined();
    expect(parseBootstrapFrame({ ...discovery, runtimeCodeIdentity: 'rtc_not-a-digest' })).toBeUndefined();
    expect(parseBootstrapFrame({ ...discovery, runtimeCodeMismatch: 'ignore' })).toBeUndefined();
  });

  it('proves both literal versions before accepting a bootstrap frame', () => {
    const accepted = acceptedFrame();
    expect(parseBootstrapAcceptedFrame(accepted)).toEqual(accepted);
    expect(
      parseBootstrapAcceptedFrame(
        acceptedFrame({
          protocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION + 1,
        }),
      ),
    ).toBeUndefined();
    expect(
      parseBootstrapAcceptedFrame(
        acceptedFrame({
          workspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION + 1,
        }),
      ),
    ).toBeUndefined();
  });

  it('keeps peer-supported rejection versions numeric on the read side', () => {
    const peerProtocolVersion: number = LOCAL_RUNTIME_PROTOCOL_VERSION + 1;
    const peerWorkspaceInterfaceVersion: number = WORKSPACE_INTERFACE_VERSION + 1;
    const rejected: readonly BootstrapRejectedFrame[] = [
      {
        type: 'bootstrap.rejected',
        code: 'protocol-incompatible',
        supportedProtocolVersion: peerProtocolVersion,
        receivedProtocolVersion: LOCAL_RUNTIME_PROTOCOL_VERSION,
      },
      {
        type: 'bootstrap.rejected',
        code: 'workspace-interface-incompatible',
        supportedWorkspaceInterfaceVersion: peerWorkspaceInterfaceVersion,
        receivedWorkspaceInterfaceVersion: WORKSPACE_INTERFACE_VERSION,
      },
    ];

    for (const frame of rejected) {
      expect(parseBootstrapRejectedFrame(frame)).toEqual(frame);
    }
  });
});
