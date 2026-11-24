import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, expect, it } from 'vitest';

import { connectWorkspaceRuntime, type RuntimeCodeIdentity, type RuntimeGeneration } from '../../src/index.js';
import { startLocalRuntimeServer, type LocalRuntimeServer } from '../../src/launcher.js';

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

it('reads a file list larger than one message over real IPC, piece by piece', async () => {
  // A short root keeps the owner-private Unix socket inside the disposable fixture.
  root = await mkdtemp('/tmp/buildframe-file-list-runtime-');
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  process.env.XDG_RUNTIME_DIR = path.join(root, 'runtime');
  await mkdir(process.env.XDG_RUNTIME_DIR, { mode: 0o700 });
  const git = async (...args: string[]) => await execFileAsync('/usr/bin/git', ['-C', checkout, ...args]);
  await git('init', '-q');
  await git('config', 'user.name', 'BuildFrame Test');
  await git('config', 'user.email', 'buildframe@example.invalid');
  await writeFile(path.join(checkout, 'README.md'), 'basis\n');
  await git('add', '.');
  await git('commit', '-qm', 'basis');
  // 2,500 new files with 200-character paths: their list is about twice one message.
  const newFiles = 2_500;
  const folder = path.join(checkout, `deep-${'x'.repeat(150)}`);
  await mkdir(folder);
  await Promise.all(
    Array.from({ length: newFiles }, (_, index) =>
      writeFile(path.join(folder, `file-${String(index).padStart(5, '0')}-${'y'.repeat(30)}.ts`), `${index}\n`),
    ),
  );
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  if (opened.status !== 'ready') throw new Error('Fixture runtime did not open');
  owner = opened.owner;
  server = await startLocalRuntimeServer({
    workspace: owner.workspace,
    runtimeGeneration: 'rtg_00000000-0000-4000-8000-000000000002' as RuntimeGeneration,
    runtimeCodeIdentity: `rtc_${'2'.repeat(64)}` as RuntimeCodeIdentity,
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
    commandIdentity: 'large-file-list-review',
    expectedStateVersion: 0,
  });
  if (review.kind !== 'review.current-changes.started') throw new Error('Fixture Review did not start');
  const live = await connected.workspace.read({
    kind: 'review.live-manifest',
    reviewIdentity: review.reviewIdentity,
    offset: 0,
    limit: 1,
  });
  if (live.status !== 'available') throw new Error('Fixture Live Changes unavailable');

  // Before the byte budget, the first read of these lists dropped the connection.
  const listed: string[] = [];
  let offset: number | null = 0;
  let pieces = 0;
  while (offset !== null) {
    const files = await connected.workspace.read({
      kind: 'review.live-files',
      reviewIdentity: review.reviewIdentity,
      liveChangesIdentity: live.liveChangesIdentity,
      offset,
      limit: 10_000,
    });
    if (files.status !== 'available') throw new Error('Live files unavailable');
    listed.push(...files.files.items.map(item => item.fileIdentity));
    offset = files.files.nextOffset;
    pieces += 1;
  }
  expect(pieces).toBeGreaterThan(1);
  expect(new Set(listed).size).toBe(newFiles + 1);

  const manifest = await connected.workspace.read({
    kind: 'review.manifest',
    reviewIdentity: review.reviewIdentity,
    offset: 0,
    limit: 10_000,
  });
  if (manifest.status !== 'available') throw new Error('Manifest unavailable');
  expect(manifest.manifest.nextOffset).not.toBeNull();
}, 120_000);
