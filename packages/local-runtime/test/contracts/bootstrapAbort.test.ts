import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import process from 'node:process';

import type { WorkspaceIdentity } from '@buildframe/workspace';
import type { ReviewedHarnessAdapter } from '@buildframe/workspace/harness-interaction';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { connectWorkspaceRuntime } from '../../src/client.js';
import { connectHarnessAdapterRuntime } from '../../src/harnessAdapter.js';
import {
  listenPrivateEndpoint,
  preparePrivateRuntimeDirectory,
  runtimeLocationForWorkspace,
  secureBoundEndpoint,
} from '../../src/runtimeLocation.js';

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000081' as WorkspaceIdentity;
const RUNTIME_GENERATION = 'rtg_00000000-0000-4000-8000-000000000082';

interface DelayedBootstrapPeer {
  readonly bootstrapReceived: Promise<void>;
  send(...frames: readonly object[]): void;
  closed(): Promise<void>;
  dispose(): Promise<void>;
}

async function startDelayedBootstrapPeer(): Promise<DelayedBootstrapPeer> {
  const location = runtimeLocationForWorkspace(WORKSPACE_IDENTITY);
  await preparePrivateRuntimeDirectory(location);

  let peer: Socket | undefined;
  let resolveBootstrap!: () => void;
  let resolveClosed!: () => void;
  const bootstrapReceived = new Promise<void>(resolve => {
    resolveBootstrap = resolve;
  });
  const peerClosed = new Promise<void>(resolve => {
    resolveClosed = resolve;
  });
  const server: Server = createServer(socket => {
    peer = socket;
    socket.on('error', () => undefined);
    let bytes = '';
    socket.on('data', (chunk: Buffer) => {
      bytes += chunk.toString('utf8');
      if (bytes.includes('\n')) resolveBootstrap();
    });
    socket.once('close', resolveClosed);
    // On Windows the socket arrives paused after the endpoint handshake.
    socket.resume();
  });
  await listenPrivateEndpoint(server, location);
  await secureBoundEndpoint(location);

  return {
    bootstrapReceived,
    send: (...frames) => {
      peer?.write(frames.map(frame => `${JSON.stringify(frame)}\n`).join(''));
    },
    closed: async () => {
      await peerClosed;
    },
    dispose: async () => {
      peer?.destroy();
      if (server.listening) {
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    },
  };
}

function acceptedBootstrap(role: 'tui' | 'harness-adapter'): object {
  return {
    type: 'bootstrap.accepted',
    protocolVersion: 1,
    workspaceInterfaceVersion: 1,
    workspaceIdentity: WORKSPACE_IDENTITY,
    role,
    runtimeGeneration: RUNTIME_GENERATION,
  };
}

function scriptedAdapter(): ReviewedHarnessAdapter {
  return {
    manifest: {
      schema: 'neoflow.harness-capabilities/1',
      adapterImplementationIdentity: 'abort-contract',
      adapterDisplayName: 'Abort contract',
      reviewedHostVersions: ['0.80.6'],
      capabilities: [],
    },
    attachment: {
      evidenceIdentity: 'abort-contract-attachment',
      attachmentIdentity: `att_${'8'.repeat(64)}`,
      workspaceIdentity: WORKSPACE_IDENTITY,
      hostVersion: '0.80.6',
      destination: {
        harnessLabel: 'Abort contract',
        sessionLabel: 'session',
        repositoryLabel: 'repository',
        canonicalCheckout: '/contract/repository',
      },
      availability: { status: 'available' },
    },
    connect: () => ({
      perform: async () => ({ status: 'accepted-for-observation' }),
    }),
  } as unknown as ReviewedHarnessAdapter;
}

describe('Local Runtime bootstrap abort ownership', () => {
  let scratch: string;
  let originalRuntimeDirectory: string | undefined;
  const peers = new Set<DelayedBootstrapPeer>();

  beforeEach(async () => {
    originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
    scratch = await mkdtemp('/tmp/buildframe-runtime-abort-');
    process.env.XDG_RUNTIME_DIR = scratch;
  });

  afterEach(async () => {
    await Promise.all([...peers].map(async peer => peer.dispose()));
    peers.clear();
    if (originalRuntimeDirectory === undefined) {
      delete process.env.XDG_RUNTIME_DIR;
    } else {
      process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    }
    await rm(scratch, { recursive: true, force: true });
  });

  it('rejects and closes when the Workspace client aborts after connect', async () => {
    const peer = await startDelayedBootstrapPeer();
    peers.add(peer);
    const controller = new AbortController();
    const pending = connectWorkspaceRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      role: 'tui',
      signal: controller.signal,
    });
    await peer.bootstrapReceived;

    controller.abort();
    peer.send(acceptedBootstrap('tui'));

    await expect(pending).resolves.toEqual({
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    });
    await peer.closed();
  });

  it('rejects and closes when the Harness Adapter aborts after connect', async () => {
    const peer = await startDelayedBootstrapPeer();
    peers.add(peer);
    const controller = new AbortController();
    const pending = connectHarnessAdapterRuntime({
      workspaceIdentity: WORKSPACE_IDENTITY,
      adapter: scriptedAdapter(),
      signal: controller.signal,
    });
    await peer.bootstrapReceived;

    controller.abort();
    peer.send(acceptedBootstrap('harness-adapter'), {
      type: 'harness.adapter.established',
      adapterProtocolVersion: 1,
      requestId: 'has_1',
      result: {
        status: 'established',
        attachmentIdentity: `att_${'8'.repeat(64)}`,
        compatibilityIdentity: `hcp_${'9'.repeat(64)}`,
        stateVersion: 1,
      },
    });

    const result = await pending;
    if (result.status === 'connected') await result.dispose();
    expect(result).toEqual({
      status: 'rejected',
      diagnostic: { code: 'runtime-unavailable', reason: 'cancelled' },
    });
    await peer.closed();
  });
});
