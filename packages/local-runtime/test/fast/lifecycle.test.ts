import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

import type { Workspace, WorkspaceIdentity } from '@buildframe/workspace';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeGeneration } from '../../src/contracts.js';

const mocks = vi.hoisted(() => ({
  bootstrapWorkspace: vi.fn(),
  discoverWorkspaceRuntime: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('@buildframe/workspace', async importOriginal => ({
  ...(await importOriginal<typeof import('@buildframe/workspace')>()),
  bootstrapWorkspace: mocks.bootstrapWorkspace,
}));

vi.mock('../../src/client.js', () => ({
  discoverWorkspaceRuntime: mocks.discoverWorkspaceRuntime,
}));

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: mocks.spawn,
}));

const { ensureWorkspaceRuntime } = await import('../../src/lifecycle.js');

const WORKSPACE_IDENTITY = 'wsp_00000000-0000-4000-8000-000000000071' as WorkspaceIdentity;
const RUNTIME_GENERATION = 'rtg_00000000-0000-4000-8000-000000000072' as RuntimeGeneration;
const RUNTIME_ENTRYPOINT = new URL('../../src/lifecycle.ts', import.meta.url);

class SpawnedRuntimeProcess extends EventEmitter {
  connected = true;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  send(_message: unknown, callback?: (error: Error | null) => void): boolean {
    callback?.(null);
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  unref(): void {}
}

function unavailable(reason: 'not-running' | 'insecure-runtime'): Readonly<Record<string, unknown>> {
  return {
    status: 'rejected',
    diagnostic: { code: 'runtime-unavailable', reason },
  };
}

const connected = {
  status: 'connected' as const,
  workspaceIdentity: WORKSPACE_IDENTITY,
  role: 'tui' as const,
  runtimeGeneration: RUNTIME_GENERATION,
  compatibility: {
    protocolVersion: 1 as const,
    workspaceInterfaceVersion: 1 as const,
  },
  workspace: {} as Workspace,
};

describe('Local Runtime process convergence', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.bootstrapWorkspace.mockResolvedValue({
      status: 'ready',
      workspace: {
        read: vi.fn().mockResolvedValue({
          kind: 'workspace.identity',
          workspaceIdentity: WORKSPACE_IDENTITY,
          canonicalCheckout: '/private/checkout',
        }),
      },
    });
    mocks.spawn.mockImplementation(() => {
      const child = new SpawnedRuntimeProcess();
      queueMicrotask(() => child.emit('spawn'));
      return child as unknown as ChildProcess;
    });
  });

  it('continues through endpoint hardening after launching', async () => {
    mocks.discoverWorkspaceRuntime
      .mockResolvedValueOnce(unavailable('not-running'))
      .mockResolvedValueOnce(unavailable('insecure-runtime'))
      .mockResolvedValueOnce(connected);

    await expect(
      ensureWorkspaceRuntime({
        startPath: '/private/checkout',
        role: 'tui',
        runtimeEntrypoint: RUNTIME_ENTRYPOINT,
      }),
    ).resolves.toBe(connected);

    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.discoverWorkspaceRuntime).toHaveBeenCalledTimes(3);
    expect(mocks.discoverWorkspaceRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeCodeIdentity: expect.stringMatching(/^rtc_[0-9a-f]{64}$/u),
      }),
    );
  });

  it('does not launch for an endpoint that is initially insecure', async () => {
    const rejected = unavailable('insecure-runtime');
    mocks.discoverWorkspaceRuntime.mockResolvedValueOnce(rejected);

    await expect(
      ensureWorkspaceRuntime({
        startPath: '/private/checkout',
        role: 'tui',
        runtimeEntrypoint: RUNTIME_ENTRYPOINT,
      }),
    ).resolves.toBe(rejected);

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.discoverWorkspaceRuntime).toHaveBeenCalledOnce();
  });

  it('waits for a mismatched build to retire, then starts one replacement', async () => {
    const mismatch = {
      status: 'rejected' as const,
      diagnostic: { code: 'runtime-code-mismatch' as const },
    };
    mocks.discoverWorkspaceRuntime
      .mockResolvedValueOnce(mismatch)
      .mockResolvedValueOnce(mismatch)
      .mockResolvedValueOnce(unavailable('not-running'))
      .mockResolvedValueOnce(connected);

    await expect(
      ensureWorkspaceRuntime({
        startPath: '/private/checkout',
        role: 'tui',
        runtimeEntrypoint: RUNTIME_ENTRYPOINT,
      }),
    ).resolves.toBe(connected);

    expect(mocks.spawn).toHaveBeenCalledOnce();
    expect(mocks.discoverWorkspaceRuntime).toHaveBeenCalledTimes(4);
    const identities = mocks.discoverWorkspaceRuntime.mock.calls.map(
      ([request]) => (request as { runtimeCodeIdentity: string }).runtimeCodeIdentity,
    );
    expect(new Set(identities).size).toBe(1);
  });
});
