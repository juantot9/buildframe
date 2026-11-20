import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, expect, it } from 'vitest';

import { connectWorkspaceRuntime, type RuntimeCodeIdentity, type RuntimeGeneration } from '../../src/index.js';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/launcher.js';
import { MAX_FRAME_BYTES } from '../../src/protocol.js';

const execFileAsync = promisify(execFile);
let root: string | undefined;
let owner: WorkspaceRuntimeOwner | undefined;
let server: LocalRuntimeServer | undefined;
let connection: AbortController | undefined;
const originalState = process.env.XDG_STATE_HOME;
const originalRuntime = process.env.XDG_RUNTIME_DIR;

afterEach(async () => {
  connection?.abort();
  await server?.dispose();
  await owner?.dispose();
  if (originalState === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalState;
  if (originalRuntime === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = originalRuntime;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

it('pages a large unchanged file through real IPC and leaves the same client usable', async () => {
  // A short root keeps the owner-private Unix socket inside the disposable
  // fixture. Windows has no /tmp and uses a named pipe, not a socket path.
  const windows = process.platform === 'win32';
  root = await mkdtemp(path.join(windows ? os.tmpdir() : '/tmp', 'buildframe-content-runtime-'));
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  process.env.XDG_RUNTIME_DIR = path.join(root, 'runtime');
  await mkdir(process.env.XDG_RUNTIME_DIR, { mode: 0o700 });
  const git = async (...args: string[]) =>
    await execFileAsync(windows ? 'git' : '/usr/bin/git', ['-C', checkout, ...args]);
  await git('init', '-q');
  await git('config', 'user.name', 'BuildFrame Test');
  await git('config', 'user.email', 'buildframe@example.invalid');
  const lineCount = 24_000;
  const line = (number: number): string => `line ${number}: ${'🙂'.repeat(16)}\n`;
  await writeFile(
    path.join(checkout, 'large.txt'),
    Array.from({ length: lineCount }, (_, index) => line(index + 1)).join(''),
  );
  await git('add', '.');
  await git('commit', '-qm', 'large unchanged fixture');
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  if (opened.status !== 'ready') throw new Error('Fixture runtime did not open');
  owner = opened.owner;
  server = await startLocalRuntimeServer({
    workspace: owner.workspace,
    runtimeGeneration: 'rtg_00000000-0000-4000-8000-000000000001' as RuntimeGeneration,
    runtimeCodeIdentity: `rtc_${'1'.repeat(64)}` as RuntimeCodeIdentity,
  });
  connection = new AbortController();
  const connected = await connectWorkspaceRuntime({
    workspaceIdentity: owner.workspaceIdentity,
    role: 'tui',
    signal: connection.signal,
  });
  if (connected.status !== 'connected') throw new Error('Fixture client did not connect');
  const review = await connected.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'large-content-review',
    expectedStateVersion: 0,
  });
  if (review.kind !== 'review.current-changes.started') throw new Error('Fixture Review did not start');
  const manifest = await connected.workspace.read({
    kind: 'review.live-manifest',
    reviewIdentity: review.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  if (manifest.status !== 'available') throw new Error('Fixture Live Changes unavailable');
  for (const anchorLine of [1, 12_345, lineCount, lineCount + 100]) {
    const view = await connected.workspace.read({
      kind: 'review.live-file-content',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: manifest.liveChangesIdentity,
      pathBytesBase64: Buffer.from('large.txt').toString('base64'),
      anchorLine,
    });
    expect(view).toMatchObject({ status: 'available', content: { totalLines: lineCount, truncated: true } });
    expect(
      Buffer.byteLength(JSON.stringify({ type: 'workspace.view', requestId: 'content', result: view })),
    ).toBeLessThan(MAX_FRAME_BYTES);
    if (view.status !== 'available') throw new Error('Content window unavailable');
    expect(view.content.byteLength).toBeLessThanOrEqual(256 * 1024);
    const text = Buffer.from(view.content.bytesBase64, 'base64').toString('utf8');
    expect(text).toContain(line(Math.min(anchorLine, lineCount)));
    expect(text).not.toContain('\uFFFD');
    await expect(connected.workspace.read({ kind: 'workspace.identity' })).resolves.toMatchObject({
      workspaceIdentity: owner.workspaceIdentity,
    });
  }
}, 30_000);
