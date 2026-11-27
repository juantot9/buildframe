import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { connect } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, expect, it } from 'vitest';

import type { RuntimeCodeIdentity, RuntimeGeneration } from '../../src/index.js';
import { publicIntegrationEndpoint, startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/launcher.js';

const execFileAsync = promisify(execFile);
let root: string | undefined;
let owner: WorkspaceRuntimeOwner | undefined;
let server: LocalRuntimeServer | undefined;
const originalState = process.env.XDG_STATE_HOME;
const originalRuntime = process.env.XDG_RUNTIME_DIR;

afterEach(async () => {
  await server?.dispose();
  await owner?.dispose();
  if (originalState === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalState;
  if (originalRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = originalRuntime;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

/** Sends one line and resolves with the first line back. */
async function exchange(socketPath: string, message: object): Promise<Record<string, unknown>> {
  const socket = connect(socketPath);
  try {
    await new Promise<void>((resolve, reject) => socket.once('connect', resolve).once('error', reject));
    socket.write(`${JSON.stringify(message)}\n`);
    let buffer = '';
    return await new Promise((resolve, reject) => {
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        const newline = buffer.indexOf('\n');
        if (newline >= 0) resolve(JSON.parse(buffer.slice(0, newline)) as Record<string, unknown>);
      });
      socket.once('close', () => reject(new Error('closed before an answer')));
    });
  } finally {
    socket.destroy();
  }
}

it('attaches a public integration to a real Workspace, which validates its manifest', async () => {
  // A short root keeps the owner-private Unix socket inside the disposable fixture.
  root = await mkdtemp('/tmp/buildframe-public-workspace-');
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  process.env.XDG_RUNTIME_DIR = path.join(root, 'runtime');
  await mkdir(process.env.XDG_RUNTIME_DIR, { mode: 0o700 });
  await execFileAsync('/usr/bin/git', ['-C', checkout, 'init', '-q']);
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  if (opened.status !== 'ready') throw new Error('Fixture runtime did not open');
  owner = opened.owner;
  server = await startLocalRuntimeServer({
    workspace: owner.workspace,
    runtimeGeneration: 'rtg_00000000-0000-4000-8000-000000000002' as RuntimeGeneration,
    runtimeCodeIdentity: `rtc_${'2'.repeat(64)}` as RuntimeCodeIdentity,
    harnessAdapters: owner.harnessAdapters,
  });
  const endpoint = publicIntegrationEndpoint(owner.workspaceIdentity);
  for (const canInterrupt of [true, false]) {
    const answer = await exchange(endpoint.socket, {
      jsonrpc: '2.0',
      id: 1,
      method: 'buildframe/initialize',
      params: {
        protocolVersion: 1,
        workspace: endpoint.workspace,
        manifest: { name: 'proto-harness', version: '0.0.1', level: 'full', canInterrupt },
      },
    });
    expect(answer).toEqual({ jsonrpc: '2.0', id: 1, result: { protocolVersion: 1, trust: 'unverified' } });
  }
});
