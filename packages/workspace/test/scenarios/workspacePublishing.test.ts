import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, expect, it } from 'vitest';

import type {
  HarnessAttachmentIdentity,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
} from '../../src/harness-interaction/index.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';

const execFileAsync = promisify(execFile);
const originalStateHome = process.env.XDG_STATE_HOME;
let root: string | undefined;
let owner: WorkspaceRuntimeOwner | undefined;

afterEach(async () => {
  await owner?.dispose();
  owner = undefined;
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  if (root !== undefined) await rm(root, { recursive: true, force: true });
  root = undefined;
});

const MANIFEST: ReviewedCapabilityManifest = {
  schema: 'neoflow.harness-capabilities/1',
  adapterImplementationIdentity: 'publishing-scripted-adapter',
  adapterDisplayName: 'Publishing Harness',
  reviewedHostVersions: ['1.0.0'],
  capabilities: [
    {
      contractVersion: 1,
      capabilityIdentity: 'publishing-direct-review-v1',
      handoffKind: 'submit-review-batch',
      route: 'direct',
      authority: 'discussion-only',
      effectConstraint: { strength: 'enforced', scope: 'workspace-read-only', limitation: 'Scripted test adapter.' },
      evidenceProfile: {
        dispatchRejection: 'correlated',
        start: 'correlated',
        normalEnd: 'correlated',
        failure: 'correlated',
        interruption: 'correlated',
        replay: 'unavailable',
      },
      interruption: { route: 'direct-request' },
      artifactResultContract: {
        contractVersion: 1,
        contractIdentity: 'publishing-final-answer-v1',
        artifactKind: 'review-response',
        source: 'settled-final-assistant-text',
        completeness: 'all-final-text-blocks-after-correlated-user-message',
        maximumBytes: 16 * 1024,
      },
      noStartTimeoutMs: 30_000,
      knownLimitations: ['Scripted test adapter.'],
    },
  ],
};

function adapter(workspaceIdentity: never, canonicalCheckout: string): ReviewedHarnessAdapter {
  return {
    manifest: MANIFEST,
    attachment: {
      evidenceIdentity: 'publishing-attachment-evidence',
      attachmentIdentity: `att_${'a'.repeat(64)}` as HarnessAttachmentIdentity,
      workspaceIdentity,
      hostVersion: '1.0.0',
      destination: {
        harnessLabel: MANIFEST.adapterDisplayName,
        sessionLabel: 'publishing session',
        repositoryLabel: 'publishing fixture',
        canonicalCheckout,
      },
      availability: { status: 'available' },
    },
    connect: () => ({ perform: async () => ({ status: 'accepted-for-observation' }) }),
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await new Promise(resolve => setTimeout(resolve, 5));
}

it('announces every committed State version to projection and harness subscribers exactly once', async () => {
  root = await mkdtemp(path.join(tmpdir(), 'buildframe-publishing-'));
  const checkout = path.join(root, 'checkout');
  await mkdir(checkout);
  process.env.XDG_STATE_HOME = path.join(root, 'state');
  const git = async (...arguments_: string[]) => await execFileAsync('git', ['-C', checkout, ...arguments_]);
  await git('init', '-q');
  await writeFile(path.join(checkout, 'file.txt'), 'before\n');
  await git('add', '.');
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'basis');
  await writeFile(path.join(checkout, 'file.txt'), 'after\n');
  const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
  if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
  owner = opened.owner;
  const { workspace } = owner;

  const started = await workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'publishing-start',
    expectedStateVersion: (await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion,
  });
  if (started.kind !== 'review.current-changes.started') throw new Error(started.kind);

  // One projection subscriber and one Harness Interaction subscriber.
  const home: number[] = [];
  const interaction: number[] = [];
  workspace.subscribe({ kind: 'workspace.home', offset: 0, limit: 64 }, update => home.push(update.stateVersion));
  workspace.subscribe(
    { kind: 'harness.review-interaction', reviewIdentity: started.reviewIdentity, offset: 0, limit: 64 },
    update => interaction.push(update.stateVersion),
  );
  await settle();
  expect(home).toEqual([started.stateVersion]);
  expect(interaction).toEqual([started.stateVersion]);

  // A Harness Interaction commit outside any command announces itself.
  const identity = await workspace.read({ kind: 'workspace.identity' });
  const established = await owner.harnessAdapters.establish(
    adapter(identity.workspaceIdentity as never, identity.canonicalCheckout),
  );
  expect(established.status).toBe('established');
  await settle();
  const attached = (await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion;
  expect(attached).toBeGreaterThan(started.stateVersion);
  expect(home).toEqual([started.stateVersion, attached]);
  expect(interaction).toEqual([started.stateVersion, attached]);

  // A Reviewing command is announced by the Workspace.
  const restarted = await workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'publishing-restart',
    expectedStateVersion: attached,
  });
  expect(restarted).toMatchObject({ status: 'accepted' });
  await settle();
  expect(home).toEqual([started.stateVersion, attached, restarted.stateVersion]);
  expect(interaction).toEqual([started.stateVersion, attached, restarted.stateVersion]);

  await expect(
    (workspace.execute as (command: unknown) => Promise<unknown>)({ kind: 'review.unknown' }),
  ).rejects.toThrow('Unknown Workspace command kind');
});
