import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import type { AttachUserPullCommand, ReviewedCapabilityManifest } from '../../src/harness-interaction/index.js';
import { decode } from '../../src/harness-interaction/utils.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import { openAuthoritativeState, type AuthoritativeState } from '../../src/authoritativeState.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-user-pull-attach-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await execFileAsync(await resolveGitExecutable(), ['-C', checkout, 'init', '-q']);
  return { root, checkout, state };
}

function userPullManifest(overrides: Partial<ReviewedCapabilityManifest> = {}): ReviewedCapabilityManifest {
  return {
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: 'neoflow.test-user-pull-adapter/1',
    adapterDisplayName: 'Claude Code',
    reviewedHostVersions: ['2.1.209'],
    capabilities: [
      {
        contractVersion: 1,
        capabilityIdentity: 'test-user-pull-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'user-pull',
        authority: 'workspace-write',
        effectConstraint: {
          strength: 'communicated',
          scope: 'harness-tools',
          limitation: 'The Harness may modify the workspace with the tools available in this session.',
        },
        evidenceProfile: {
          submission: 'correlated',
          normalEnd: 'correlated',
          failure: 'correlated',
          interruption: 'unavailable',
          replay: 'unavailable',
        },
        artifactResultContract: {
          contractVersion: 1,
          contractIdentity: 'test-settled-final-assistant-review-response-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: 16 * 1024,
        },
        knownLimitations: ['No interruption channel exists.'],
      },
    ],
    ...overrides,
  };
}

function directOnlyManifest(): ReviewedCapabilityManifest {
  const manifest = userPullManifest();
  return {
    ...manifest,
    capabilities: [
      {
        contractVersion: 1,
        capabilityIdentity: 'test-direct-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority: 'workspace-write',
        effectConstraint: {
          strength: 'communicated',
          scope: 'harness-tools',
          limitation: 'The Harness may modify the workspace with the tools available in this session.',
        },
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
          contractIdentity: 'test-settled-final-assistant-review-response-v1',
          artifactKind: 'review-response',
          source: 'settled-final-assistant-text',
          completeness: 'all-final-text-blocks-after-correlated-user-message',
          maximumBytes: 16 * 1024,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: ['Direct dispatch is correlated.'],
      },
    ],
  };
}

describe('Claude User Pull attachment', () => {
  const owners = new Set<WorkspaceRuntimeOwner>();
  const states = new Set<AuthoritativeState>();
  const roots = new Set<string>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function fixture(): Promise<Fixture> {
    const created = await createFixture();
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    return created;
  }

  async function open(checkout: string): Promise<WorkspaceRuntimeOwner> {
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(`Workspace runtime was rejected: ${opened.diagnostic.code}`);
    owners.add(opened.owner);
    return opened.owner;
  }

  async function stateVersion(owner: WorkspaceRuntimeOwner): Promise<number> {
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    return home.stateVersion;
  }

  function attachCommand(
    expectedStateVersion: number,
    overrides: Partial<Omit<AttachUserPullCommand, 'kind'>> = {},
  ): AttachUserPullCommand {
    return {
      kind: 'harness.user-pull.attach',
      commandIdentity: 'attach-command-1',
      expectedStateVersion,
      sessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      canonicalGitRoot: '/unused',
      canonicalGitDir: '/unused/.git',
      hostVersion: '2.1.209',
      manifest: userPullManifest(),
      ...overrides,
    };
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    await Promise.all([...states].map(async state => state.close().catch(() => undefined)));
    states.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('establishes one attachment from exact native facts and freezes its manifest', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);

    const result = await owner.workspace.execute(
      attachCommand(version, {
        canonicalGitRoot: created.checkout,
        canonicalGitDir: path.join(created.checkout, '.git'),
      }),
    );
    expect(result.kind).toBe('harness.user-pull.attached');
    if (result.kind !== 'harness.user-pull.attached') throw new Error('attachment was not established');
    expect(result.status).toBe('accepted');
    expect(result.stateVersion).toBe(version + 1);
    expect(result.attachmentIdentity).toMatch(/^att_[0-9a-f]{64}$/u);
    expect(result.compatibilityIdentity).toMatch(/^hcp_[0-9a-f]{64}$/u);
    expect(result.destination).toEqual({
      harnessLabel: 'Claude Code',
      sessionLabel: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      repositoryLabel: 'checkout',
      canonicalCheckout: created.checkout,
    });

    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    // The runtime owner holds the writer lease; release it before opening the
    // State directly to inspect the durable record.
    await owner.dispose();
    owners.delete(owner);
    const state = await openAuthoritativeState({
      workspaceIdentity: identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(created.checkout),
    });
    states.add(state);
    const read = await state.read({ recordIdentities: [result.compatibilityIdentity], includeContent: true });
    const record = read.records[0];
    expect(record?.kind).toBe('harness.user-pull-attachment');
    expect(record?.recordClass).toBe('immutable');
    if (record === undefined) throw new Error('attachment record missing');
    const payload = decode(record.payload) as Record<string, unknown>;
    expect(payload['sessionId']).toBe('f47ac10b-58cc-4372-a567-0e02b2c3d479');
    expect(payload['canonicalGitRoot']).toBe(created.checkout);
    expect(payload['hostVersion']).toBe('2.1.209');
    expect(payload['manifestSha256']).toMatch(/^[0-9a-f]{64}$/u);
    expect(payload['manifest']).toEqual(userPullManifest());
  });

  it('replays the same command identity without moving State', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);
    const command = attachCommand(version, {
      canonicalGitRoot: created.checkout,
      canonicalGitDir: path.join(created.checkout, '.git'),
    });

    const first = await owner.workspace.execute(command);
    const replayed = await owner.workspace.execute(command);
    expect(replayed).toEqual(first);
    expect(await stateVersion(owner)).toBe(first.stateVersion);
  });

  it('returns the prior establishment for identical facts under a new command identity', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);
    const base = {
      canonicalGitRoot: created.checkout,
      canonicalGitDir: path.join(created.checkout, '.git'),
    };

    const first = await owner.workspace.execute(attachCommand(version, base));
    if (first.kind !== 'harness.user-pull.attached') throw new Error('attachment was not established');
    const again = await owner.workspace.execute(
      attachCommand(first.stateVersion, { ...base, commandIdentity: 'attach-command-2' }),
    );
    if (again.kind !== 'harness.user-pull.attached') throw new Error('attachment was not re-established');
    expect(again.attachmentIdentity).toBe(first.attachmentIdentity);
    expect(again.compatibilityIdentity).toBe(first.compatibilityIdentity);
    expect(again.stateVersion).toBe(first.stateVersion);
    expect(await stateVersion(owner)).toBe(first.stateVersion);
  });

  it('can restore a prior reviewed compatibility after a different manifest became current', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);
    const base = {
      canonicalGitRoot: created.checkout,
      canonicalGitDir: path.join(created.checkout, '.git'),
    };
    const original = userPullManifest();
    const originalCapability = original.capabilities[0];
    if (originalCapability === undefined || originalCapability.route !== 'user-pull') {
      throw new Error('User Pull capability fixture missing');
    }
    const changed: ReviewedCapabilityManifest = {
      ...original,
      capabilities: [{ ...originalCapability, knownLimitations: ['Changed reviewed limitation.'] }],
    };

    const first = await owner.workspace.execute(attachCommand(version, { ...base, manifest: original }));
    if (first.kind !== 'harness.user-pull.attached') throw new Error('original attachment failed');
    const second = await owner.workspace.execute(
      attachCommand(first.stateVersion, {
        ...base,
        commandIdentity: 'attach-command-changed',
        manifest: changed,
      }),
    );
    if (second.kind !== 'harness.user-pull.attached') throw new Error('changed attachment failed');
    const restored = await owner.workspace.execute(
      attachCommand(second.stateVersion, {
        ...base,
        commandIdentity: 'attach-command-restored',
        manifest: original,
      }),
    );
    expect(restored).toMatchObject({
      kind: 'harness.user-pull.attached',
      attachmentIdentity: first.attachmentIdentity,
      compatibilityIdentity: first.compatibilityIdentity,
      stateVersion: second.stateVersion + 1,
    });
    expect(await stateVersion(owner)).toBe(second.stateVersion + 1);
  });

  it('refuses an unreviewed host version and a manifest without the User Pull capability', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);
    const base = {
      canonicalGitRoot: created.checkout,
      canonicalGitDir: path.join(created.checkout, '.git'),
    };

    expect(await owner.workspace.execute(attachCommand(version, { ...base, hostVersion: '2.1.208' }))).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'unsupported-host-version',
      stateVersion: version,
    });
    expect(
      await owner.workspace.execute(
        attachCommand(version, { ...base, commandIdentity: 'attach-command-direct', manifest: directOnlyManifest() }),
      ),
    ).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'capability-unsupported',
      stateVersion: version,
    });
  });

  it('refuses a conflicting destination for the same attachment identity', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);
    const base = {
      canonicalGitRoot: created.checkout,
      canonicalGitDir: path.join(created.checkout, '.git'),
    };

    const first = await owner.workspace.execute(attachCommand(version, base));
    if (first.kind !== 'harness.user-pull.attached') throw new Error('attachment was not established');
    const conflicting = await owner.workspace.execute(
      attachCommand(first.stateVersion, {
        ...base,
        commandIdentity: 'attach-command-3',
        manifest: userPullManifest({ adapterDisplayName: 'Another Harness' }),
      }),
    );
    expect(conflicting).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'attachment-identity-conflict',
      stateVersion: first.stateVersion,
    });
  });

  it('rejects a malformed attach command before any State movement', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const version = await stateVersion(owner);

    await expect(owner.workspace.execute(attachCommand(version, { sessionId: '' }))).rejects.toThrow(TypeError);
    expect(await stateVersion(owner)).toBe(version);
  });
});
