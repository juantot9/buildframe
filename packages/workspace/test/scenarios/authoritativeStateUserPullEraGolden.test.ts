import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, expect, it } from 'vitest';

import { openAuthoritativeState, type AuthoritativeState } from '../../src/authoritativeState.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import type { Workspace, WorkspaceIdentity } from '../../src/index.js';
import type { ReviewIdentity } from '@buildframe/workspace/reviewing';

/**
 * State written while Claude still used User Pull, frozen before WF-290
 * removed its write paths: one User Pull Invocation that ended normally, one
 * claimed and never started, and a recorded context budget. Only pre-0.1.0
 * stores hold such records; they must keep opening, and no read may write.
 */
const GOLDEN_USER_PULL_ERA = path.resolve('packages/workspace/test/fixtures/authoritative-state/user-pull-era');

interface GoldenManifest {
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly currentGeneration: string;
  readonly generationSha256: string;
  readonly stateVersion: number;
  readonly reviewIdentity: ReviewIdentity;
  readonly attachmentIdentity: string;
  readonly invocations: {
    readonly settled: { readonly invocationIdentity: string; readonly status: string };
    readonly inFlight: { readonly invocationIdentity: string; readonly status: string };
  };
}

const RETIRED_COMMAND_KINDS = [
  'harness.user-pull.attach',
  'harness.user-pull.prepare',
  'harness.user-pull.arm',
  'harness.user-pull.claim',
  'harness.user-pull.withdraw',
  'harness.user-pull.observe',
  'harness.user-pull.observability.record',
] as const;

const RETIRED_VIEW_KINDS = ['harness.user-pull.review-handoff.inspect', 'harness.user-pull.preparation'] as const;

const execFileAsync = promisify(execFile);
let root: string | undefined;
let state: AuthoritativeState | undefined;

afterEach(async () => {
  await state?.close();
  state = undefined;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

async function interaction(workspace: Workspace, reviewIdentity: ReviewIdentity) {
  return await workspace.read({ kind: 'harness.review-interaction', reviewIdentity, offset: 0, limit: 64 });
}

it('opens User Pull era State read-only for User Pull and resolves its stranded turn at start', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(GOLDEN_USER_PULL_ERA, 'manifest.json'), 'utf8'),
  ) as GoldenManifest;
  const frozen = path.join(GOLDEN_USER_PULL_ERA, manifest.currentGeneration);
  const digest = async (): Promise<string> =>
    createHash('sha256')
      .update(await readFile(frozen))
      .digest('hex');
  expect(await digest()).toBe(manifest.generationSha256);

  root = await mkdtemp(path.join(tmpdir(), 'buildframe-state-user-pull-era-'));
  const privateStateDirectory = path.join(root, 'state');
  const stateRoot = path.join(privateStateDirectory, 'workspaces', manifest.workspaceIdentity, 'authoritative-state');
  await mkdir(stateRoot, { recursive: true, mode: 0o700 });
  await copyFile(path.join(GOLDEN_USER_PULL_ERA, 'CURRENT'), path.join(stateRoot, 'CURRENT'));
  await copyFile(frozen, path.join(stateRoot, manifest.currentGeneration));
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  await execFileAsync('git', ['-C', checkout, 'init', '-q']);

  state = await openAuthoritativeState({ privateStateDirectory, workspaceIdentity: manifest.workspaceIdentity });
  const assembly = openRuntimeWorkspace(manifest.workspaceIdentity, checkout, state);
  const { workspace } = assembly;

  const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  expect(home.stateVersion).toBe(manifest.stateVersion);
  expect(JSON.stringify(home)).toContain(manifest.reviewIdentity);

  // Reads never write, even with a User Pull start deadline long past.
  const before = await interaction(workspace, manifest.reviewIdentity);
  const again = await interaction(workspace, manifest.reviewIdentity);
  expect(before.stateVersion).toBe(manifest.stateVersion);
  expect(again.stateVersion).toBe(manifest.stateVersion);
  expect(before).not.toHaveProperty('userPull');
  const statusOf = (view: typeof before, invocationIdentity: string): string | undefined =>
    view.invocations.find(item => item.invocationIdentity === invocationIdentity)?.status;
  expect(statusOf(before, manifest.invocations.settled.invocationIdentity)).toBe('ended-normally');
  expect(statusOf(before, manifest.invocations.inFlight.invocationIdentity)).toBe('awaiting-start');

  // The retired route accepts no writes and serves no views.
  for (const kind of RETIRED_COMMAND_KINDS) {
    await expect(
      workspace.execute({
        kind,
        commandIdentity: `retired-${kind}`,
        expectedStateVersion: manifest.stateVersion,
      } as never),
    ).rejects.toThrow(TypeError);
  }
  for (const kind of RETIRED_VIEW_KINDS) {
    await expect(
      workspace.read({
        kind,
        reviewIdentity: manifest.reviewIdentity,
        attachmentIdentity: manifest.attachmentIdentity,
      } as never),
    ).rejects.toThrow(TypeError);
  }
  expect((await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion).toBe(
    manifest.stateVersion,
  );

  // A recorded User Pull command result stays readable.
  const recorded = await workspace.read({ kind: 'harness.command-result', commandIdentity: 'era-prepare-2' });
  expect(recorded).toMatchObject({ status: 'available', result: { kind: 'harness.user-pull.prepared' } });

  // Starting a runtime resolves the claimed turn nothing can settle any more.
  await assembly.recoverLostInvocations();
  const recovered = await interaction(workspace, manifest.reviewIdentity);
  expect(recovered.stateVersion).toBe(manifest.stateVersion + 1);
  expect(statusOf(recovered, manifest.invocations.settled.invocationIdentity)).toBe('ended-normally');
  expect(statusOf(recovered, manifest.invocations.inFlight.invocationIdentity)).toBe('unresolved');

  await assembly.recoverLostInvocations();
  expect((await interaction(workspace, manifest.reviewIdentity)).stateVersion).toBe(manifest.stateVersion + 1);

  // Opening reads the copy; the checked-in bytes never change.
  expect(await digest()).toBe(manifest.generationSha256);
});
