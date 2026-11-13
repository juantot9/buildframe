import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect } from 'vitest';
import { openAuthoritativeState } from '../../src/authoritativeState.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import { bootstrapWorkspace, type Workspace } from '../../src/index.js';
import type { ReviewManifestAvailableView } from '@buildframe/workspace/projection';
import type { CurrentChangesReviewStarted } from '@buildframe/workspace/reviewing';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

export const execFileAsync = promisify(execFile);

export interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

export async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

export async function createFixture(fileCount = 1, longFirstLine = false): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-projection-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  for (let index = 0; index < fileCount; index += 1) {
    const name = `review-${String(index).padStart(3, '0')}.txt`;
    const first = index === 0 && longFirstLine ? 'a'.repeat(12 * 1024) : `before-${index}`;
    await writeFile(path.join(checkout, name), `${first}\nshared\n`);
  }
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'basis');
  for (let index = 0; index < fileCount; index += 1) {
    const name = `review-${String(index).padStart(3, '0')}.txt`;
    const first = index === 0 && longFirstLine ? 'b'.repeat(12 * 1024) : `after-${index}`;
    await writeFile(path.join(checkout, name), `${first}\nshared\n`);
  }
  return { root, checkout, state };
}

export function started(result: Awaited<ReturnType<Workspace['execute']>>): CurrentChangesReviewStarted {
  expect(result.kind).toBe('review.current-changes.started');
  if (result.kind !== 'review.current-changes.started') {
    throw new Error('Review did not start');
  }
  return result;
}

export function manifest(view: Awaited<ReturnType<Workspace['read']>>): ReviewManifestAvailableView {
  expect(view.kind).toBe('review.manifest');
  if (view.kind !== 'review.manifest' || view.status !== 'available') {
    throw new Error('Review manifest was not available');
  }
  return view;
}

export function containsPrivateMechanic(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateMechanic);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) =>
      /sqlite|database|transaction|repository|socket|frame|endpoint|ipc|native|harness|gitmode|objectidentity|evidencesource|canonicalcheckout/iu.test(
        key,
      ) || containsPrivateMechanic(nested),
  );
}

export async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

export const owners = new Set<WorkspaceRuntimeOwner>();

export const roots = new Set<string>();

export const originalStateHome = process.env.XDG_STATE_HOME;

export async function fixture(fileCount = 1, longFirstLine = false): Promise<Fixture> {
  const created = await createFixture(fileCount, longFirstLine);
  roots.add(created.root);
  process.env.XDG_STATE_HOME = created.state;
  return created;
}

export async function open(checkout: string): Promise<WorkspaceRuntimeOwner> {
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  expect(opened.status).toBe('ready');
  if (opened.status !== 'ready') throw new Error('Workspace runtime was rejected');
  owners.add(opened.owner);
  return opened.owner;
}

export async function openInternal(
  checkout: string,
  internal: Parameters<typeof openRuntimeWorkspace>[3],
): Promise<WorkspaceRuntimeOwner> {
  const bootstrapped = await bootstrapWorkspace({ startPath: checkout });
  expect(bootstrapped.status).toBe('ready');
  if (bootstrapped.status !== 'ready') {
    throw new Error('Workspace bootstrap was rejected');
  }
  const identity = await bootstrapped.workspace.read({
    kind: 'workspace.identity',
  });
  const state = await openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(checkout),
  });
  const assembly = openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, state, internal);
  const owner: WorkspaceRuntimeOwner = {
    workspaceIdentity: identity.workspaceIdentity,
    workspace: assembly.workspace,
    harnessAdapters: assembly.harnessAdapters,
    dispose: async () => await state.close(),
  };
  owners.add(owner);
  return owner;
}

export async function openObserved(
  checkout: string,
  onSnapshotEvidenceIdentityCacheSize: (size: number) => void,
): Promise<WorkspaceRuntimeOwner> {
  return await openInternal(checkout, {
    onSnapshotEvidenceIdentityCacheSize,
  });
}

export function installWorkspaceProjectionHygiene(): void {
  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });
}
