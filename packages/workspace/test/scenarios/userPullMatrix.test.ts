import { afterEach, describe, expect, it } from 'vitest';

import { openAuthoritativeState, type AuthoritativeState } from '../../src/authoritativeState.js';
import { stableIdentity } from '../../src/harness-interaction/utils.js';
import type { HarnessCommandRejectionReason, UserPullObservation } from '../../src/harness-interaction/index.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import {
  MissingRecordState,
  UserPullScenarioHarness,
  userPullManifest,
  type PreparedFixture,
} from './userPullScenarioSupport.js';

/**
 * Every User Pull refusal the reviewed command surface can produce with bounded
 * fixtures. Guards marked structurally defensive are unreachable through the
 * reviewed commands; the projection layer covers their user-visible effect and
 * the limitations matrix records them explicitly.
 */
const REACHABLE_GUARDS: readonly HarnessCommandRejectionReason[] = Object.freeze([
  'attachment-not-found',
  'attachment-not-live',
  'attachment-identity-conflict',
  'unsupported-host-version',
  'capability-unsupported',
  'capability-incompatible',
  'preparation-not-found',
  'preparation-not-open',
  'identity-lost',
  'route-deadline-passed',
  'preparation-already-open',
  'batch-already-handed-off',
  'batch-not-found',
  'inspection-changed',
  'no-armed-occurrence',
  'ambiguous-armed-occurrence',
  'armed-occurrence-limit-reached',
  'bridge-protocol-mismatch',
  'checkout-mismatch',
  'state-version-mismatch',
  'command-identity-conflict',
  'availability-unknown',
]);

/** Enforced in code as defense-in-depth; unreachable through reviewed commands. */
const STRUCTURALLY_DEFENSIVE_GUARDS: readonly HarnessCommandRejectionReason[] = Object.freeze([
  'availability-blocked',
  'active-invocation-exists',
  'state-conflict',
  'occurrence-identity-conflict',
  'user-pull-payload-too-large',
  'snapshot-stale',
  'snapshot-unverified',
  'review-not-found',
  'review-not-active',
]);

let sequence = 0;
function commandIdentity(prefix: string): string {
  sequence += 1;
  return `matrix-${prefix}-${sequence}`;
}

async function currentVersion(prepared: PreparedFixture): Promise<number> {
  const home = await prepared.owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 1 });
  return home.stateVersion;
}

async function arm(
  prepared: PreparedFixture,
  promptId: string,
  overrides: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.arm',
    commandIdentity: commandIdentity('arm'),
    expectedStateVersion: await currentVersion(prepared),
    bridgeProtocolVersion: 1,
    sessionId: prepared.sessionId,
    promptId,
    canonicalGitRoot: prepared.identity.canonicalCheckout,
    canonicalGitDir: prepared.canonicalGitDir,
    ...overrides,
  });
}

async function claim(
  prepared: PreparedFixture,
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.claim',
    commandIdentity: commandIdentity('claim'),
    expectedStateVersion: await currentVersion(prepared),
    bridgeProtocolVersion: 1,
    canonicalGitRoot: prepared.identity.canonicalCheckout,
    canonicalGitDir: prepared.canonicalGitDir,
  });
}

type ObservationInput =
  | { readonly kind: 'prompt-submitted' }
  | {
      readonly kind: 'normal-stop';
      readonly stopHookActive: boolean;
      readonly backgroundTaskCount?: number;
      readonly sessionCronCount?: number;
    }
  | { readonly kind: 'stop-failure'; readonly errorType?: string; readonly failureType?: string };

async function observe(
  prepared: PreparedFixture,
  promptId: string,
  observation: ObservationInput,
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.observe',
    commandIdentity: commandIdentity('observe'),
    expectedStateVersion: await currentVersion(prepared),
    bridgeProtocolVersion: 1,
    observation: {
      sessionId: prepared.sessionId,
      promptId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      ...observation,
    } as UserPullObservation,
  });
}

async function prepareAgain(
  prepared: PreparedFixture,
  overrides: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  const inspection = await prepared.owner.workspace.read({
    kind: 'harness.user-pull.review-handoff.inspect',
    reviewIdentity: prepared.started.reviewIdentity,
    reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
    attachmentIdentity: prepared.attachmentIdentity,
  });
  if (inspection.status !== 'available') {
    return await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.prepare',
      commandIdentity: commandIdentity('prepare'),
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: prepared.started.reviewIdentity,
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      attachmentIdentity: prepared.attachmentIdentity,
      inspectionIdentity: 'f'.repeat(64),
      ...overrides,
    });
  }
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.prepare',
    commandIdentity: commandIdentity('prepare'),
    expectedStateVersion: inspection.stateVersion,
    reviewIdentity: prepared.started.reviewIdentity,
    reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
    attachmentIdentity: prepared.attachmentIdentity,
    inspectionIdentity: inspection.inspectionIdentity,
    ...overrides,
  });
}

async function withdraw(
  prepared: PreparedFixture,
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.withdraw',
    commandIdentity: commandIdentity('withdraw'),
    expectedStateVersion: await currentVersion(prepared),
    preparationIdentity: prepared.preparationIdentity,
    reason: 'explicit-withdrawal',
  });
}

async function settle(prepared: PreparedFixture, promptId: string): Promise<void> {
  await expectArmed(await arm(prepared, promptId));
  await expectClaimed(await claim(prepared));
  await observe(prepared, promptId, { kind: 'prompt-submitted' });
  const stopped = await observe(prepared, promptId, {
    kind: 'normal-stop',
    stopHookActive: false,
    backgroundTaskCount: 0,
    sessionCronCount: 0,
  });
  expect(stopped).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'ended-normally' });
}

function directManifest() {
  const manifest = userPullManifest();
  const capability = manifest.capabilities[0];
  if (capability === undefined) throw new Error('Capability fixture missing');
  return {
    ...manifest,
    adapterImplementationIdentity: 'neoflow.test-direct-adapter/1',
    capabilities: [
      {
        ...capability,
        capabilityIdentity: 'test-direct-review-v1',
        route: 'direct' as const,
        authority: 'discussion-only' as const,
        effectConstraint: {
          strength: 'enforced' as const,
          scope: 'workspace-read-only' as const,
          limitation: 'Reviewed direct constraint.',
        },
        evidenceProfile: {
          dispatchRejection: 'correlated' as const,
          start: 'correlated' as const,
          normalEnd: 'correlated' as const,
          failure: 'correlated' as const,
          interruption: 'correlated' as const,
          replay: 'unavailable' as const,
        },
        interruption: { route: 'direct-request' as const },
        artifactResultContract: {
          contractVersion: 1 as const,
          contractIdentity: 'test-direct-review-response-v1',
          artifactKind: 'review-response' as const,
          source: 'settled-final-assistant-text' as const,
          completeness: 'all-final-text-blocks-after-correlated-user-message' as const,
          maximumBytes: 16 * 1024,
        },
        noStartTimeoutMs: 30_000,
        knownLimitations: ['Reviewed direct limitation.'],
      },
    ],
  };
}

async function attach(
  prepared: PreparedFixture,
  overrides: Record<string, unknown> = {},
): Promise<Awaited<ReturnType<PreparedFixture['owner']['workspace']['execute']>>> {
  return await prepared.owner.workspace.execute({
    kind: 'harness.user-pull.attach',
    commandIdentity: commandIdentity('attach'),
    expectedStateVersion: await currentVersion(prepared),
    sessionId: prepared.sessionId,
    canonicalGitRoot: prepared.identity.canonicalCheckout,
    canonicalGitDir: prepared.canonicalGitDir,
    hostVersion: '2.1.209',
    manifest: userPullManifest(),
    ...overrides,
  });
}

async function observeContextBudget(
  workspace: PreparedFixture['owner']['workspace'],
  prepared: PreparedFixture,
): Promise<unknown> {
  const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 1 });
  return await workspace.execute({
    kind: 'harness.user-pull.observability.record',
    commandIdentity: commandIdentity('observability'),
    expectedStateVersion: home.stateVersion,
    bridgeProtocolVersion: 1,
    sessionId: prepared.sessionId,
    canonicalGitRoot: prepared.identity.canonicalCheckout,
    canonicalGitDir: prepared.canonicalGitDir,
    observation: {
      kind: 'context-budget',
      evidenceIdentity: `matrix-evidence-${sequence}`,
      compatibilityIdentity: prepared.compatibilityIdentity as never,
      source: 'claude-status-line',
      modelId: 'claude-opus-4-1',
      modelDisplayName: 'Opus 4.1',
      contextWindowSize: 200_000,
      totalInputTokens: 150,
      totalOutputTokens: 10,
      currentUsage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheCreationInputTokens: 20,
        cacheReadInputTokens: 30,
      },
    },
  });
}

async function reopenWithMissingRecord(
  harness: UserPullScenarioHarness,
  prepared: PreparedFixture,
  missingRecordIdentity: string,
): Promise<PreparedFixture['owner']['workspace']> {
  await prepared.owner.dispose();
  harness.owners.delete(prepared.owner);
  const durable = await openAuthoritativeState({
    workspaceIdentity: prepared.identity.workspaceIdentity,
    privateStateDirectory: userStateDirectory(prepared.created.checkout),
  });
  const state: AuthoritativeState = new MissingRecordState(durable, missingRecordIdentity);
  harness.states.add(state);
  const assembly = openRuntimeWorkspace(
    prepared.identity.workspaceIdentity,
    prepared.identity.canonicalCheckout,
    state,
    {},
    prepared.canonicalGitDir,
  );
  return assembly.workspace;
}

interface GuardRow {
  readonly mutation: string;
  readonly guard: HarnessCommandRejectionReason;
  readonly freshRecovery: boolean;
  readonly run: (harness: UserPullScenarioHarness, prepared: PreparedFixture) => Promise<void>;
  readonly recover: (harness: UserPullScenarioHarness, prepared: PreparedFixture) => Promise<void>;
}

async function expectRejected(result: unknown, reason: HarnessCommandRejectionReason): Promise<void> {
  expect(result).toMatchObject({ kind: 'harness.command.rejected', reason });
}

async function expectArmed(result: unknown): Promise<void> {
  expect(result).toMatchObject({ kind: 'harness.user-pull.armed', status: 'accepted' });
}

async function expectClaimed(result: unknown): Promise<void> {
  expect(result).toMatchObject({ kind: 'harness.user-pull.claimed', status: 'accepted' });
}

const GUARD_ROWS: readonly GuardRow[] = Object.freeze([
  {
    mutation: 'bridge-protocol-mismatch',
    guard: 'bridge-protocol-mismatch',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await arm(prepared, 'protocol-prompt', { bridgeProtocolVersion: 2 }),
        'bridge-protocol-mismatch',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'protocol-prompt'));
    },
  },
  {
    mutation: 'checkout-moved',
    guard: 'checkout-mismatch',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await arm(prepared, 'checkout-prompt', { canonicalGitRoot: '/elsewhere' }),
        'checkout-mismatch',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'checkout-prompt'));
    },
  },
  {
    mutation: 'attachment-record-missing',
    guard: 'attachment-not-found',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await arm(prepared, 'unknown-prompt', { sessionId: 'unknown-session' }),
        'attachment-not-found',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'unknown-prompt'));
    },
  },
  {
    mutation: 'state-version-stale',
    guard: 'state-version-mismatch',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await arm(prepared, 'stale-prompt', { expectedStateVersion: prepared.preparedStateVersion - 1 }),
        'state-version-mismatch',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'stale-prompt'));
    },
  },
  {
    mutation: 'command-identity-reused',
    guard: 'command-identity-conflict',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await arm(prepared, 'reused-prompt', { commandIdentity: 'user-pull-prepare' }),
        'command-identity-conflict',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'reused-prompt'));
    },
  },
  {
    mutation: 'occurrence-missing',
    guard: 'no-armed-occurrence',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(await claim(prepared), 'no-armed-occurrence');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'unarmed-prompt'));
      await expectClaimed(await claim(prepared));
    },
  },
  {
    mutation: 'occurrence-ambiguous',
    guard: 'ambiguous-armed-occurrence',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'ambiguous-prompt-a'));
      await expectArmed(await arm(prepared, 'ambiguous-prompt-b'));
      await expectRejected(await claim(prepared), 'ambiguous-armed-occurrence');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'ambiguous-recovery'));
      await expectClaimed(await claim(prepared));
    },
  },
  {
    mutation: 'armed-occurrence-limit-reached',
    guard: 'armed-occurrence-limit-reached',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      for (let index = 0; index < 16; index += 1) {
        await expectArmed(await arm(prepared, `limit-prompt-${index}`));
      }
      await expectRejected(await arm(prepared, 'limit-prompt-16'), 'armed-occurrence-limit-reached');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'limit-recovery'));
      await expectClaimed(await claim(prepared));
    },
  },
  {
    mutation: 'preparation-already-open',
    guard: 'preparation-already-open',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(await prepareAgain(prepared), 'preparation-already-open');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'open-recovery'));
      await expectClaimed(await claim(prepared));
    },
  },
  {
    mutation: 'batch-already-handed-off',
    guard: 'batch-already-handed-off',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      const promptId = 'handed-off-prompt';
      await expectArmed(await arm(prepared, promptId));
      await expectClaimed(await claim(prepared));
      await observe(prepared, promptId, { kind: 'prompt-submitted' });
      await observe(prepared, promptId, { kind: 'normal-stop', stopHookActive: false });
      await expectRejected(await prepareAgain(prepared), 'batch-already-handed-off');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'handed-off-recovery'));
      await expectClaimed(await claim(prepared));
    },
  },
  {
    mutation: 'batch-unknown',
    guard: 'batch-not-found',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      await settle(prepared, 'batch-unknown-prompt');
      await expectRejected(
        await prepareAgain(prepared, { reviewBatchIdentity: `rbt_${'f'.repeat(64)}` }),
        'batch-not-found',
      );
    },
    recover: async (_harness, prepared) => {
      await withdraw(prepared);
      await expect(await prepareAgain(prepared)).toMatchObject({
        kind: 'harness.user-pull.prepared',
        status: 'accepted',
      });
    },
  },
  {
    mutation: 'inspection-changed',
    guard: 'inspection-changed',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      await withdraw(prepared);
      await expectRejected(await prepareAgain(prepared, { inspectionIdentity: 'f'.repeat(64) }), 'inspection-changed');
    },
    recover: async (_harness, prepared) => {
      await withdraw(prepared);
      await expect(await prepareAgain(prepared)).toMatchObject({
        kind: 'harness.user-pull.prepared',
        status: 'accepted',
      });
    },
  },
  {
    mutation: 'route-deadline-passed',
    guard: 'route-deadline-passed',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      await withdraw(prepared);
      await expectRejected(
        await prepareAgain(prepared, { disclosedDeadline: new Date(0).toISOString() }),
        'route-deadline-passed',
      );
    },
    recover: async (_harness, prepared) => {
      await withdraw(prepared);
      await expect(await prepareAgain(prepared)).toMatchObject({
        kind: 'harness.user-pull.prepared',
        status: 'accepted',
      });
    },
  },
  {
    mutation: 'host-version-unsupported',
    guard: 'unsupported-host-version',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(await attach(prepared, { hostVersion: '2.1.999' }), 'unsupported-host-version');
    },
    recover: async (_harness, prepared) => {
      await expect(await attach(prepared)).toMatchObject({ kind: 'harness.user-pull.attached', status: 'accepted' });
    },
  },
  {
    mutation: 'capability-revised-to-direct',
    guard: 'capability-unsupported',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(await attach(prepared, { manifest: directManifest() }), 'capability-unsupported');
    },
    recover: async (_harness, prepared) => {
      await expect(await attach(prepared)).toMatchObject({ kind: 'harness.user-pull.attached', status: 'accepted' });
    },
  },
  {
    mutation: 'attachment-destination-changed',
    guard: 'attachment-identity-conflict',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await attach(prepared, { manifest: { ...userPullManifest(), adapterDisplayName: 'Other Claude' } }),
        'attachment-identity-conflict',
      );
    },
    recover: async (_harness, prepared) => {
      await expect(await attach(prepared)).toMatchObject({ kind: 'harness.user-pull.attached', status: 'accepted' });
    },
  },
  {
    mutation: 'attachment-record-missing',
    guard: 'identity-lost',
    freshRecovery: true,
    run: async (harness, prepared) => {
      const workspace = await reopenWithMissingRecord(harness, prepared, prepared.compatibilityIdentity);
      const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 1 });
      await expectRejected(
        await workspace.execute({
          kind: 'harness.user-pull.arm',
          commandIdentity: commandIdentity('identity-lost'),
          expectedStateVersion: home.stateVersion,
          bridgeProtocolVersion: 1,
          sessionId: prepared.sessionId,
          promptId: 'identity-lost-prompt',
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
        }),
        'identity-lost',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'identity-recovery'));
    },
  },
  {
    mutation: 'capability-revised-incompatible',
    guard: 'capability-incompatible',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      const manifest = userPullManifest();
      const capability = manifest.capabilities[0];
      if (capability === undefined) throw new Error('Capability fixture missing');
      const attached = await attach(prepared, {
        manifest: { ...manifest, capabilities: [{ ...capability, knownLimitations: ['Changed limitation.'] }] },
      });
      expect(attached).toMatchObject({ kind: 'harness.user-pull.attached', status: 'accepted' });
      await expectRejected(await arm(prepared, 'incompatible-prompt'), 'capability-incompatible');
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'incompatible-recovery'));
    },
  },
  {
    mutation: 'preparation-unknown',
    guard: 'preparation-not-found',
    freshRecovery: false,
    run: async (_harness, prepared) => {
      await expectRejected(
        await prepared.owner.workspace.execute({
          kind: 'harness.user-pull.withdraw',
          commandIdentity: commandIdentity('withdraw'),
          expectedStateVersion: await currentVersion(prepared),
          preparationIdentity: `hpp_${'f'.repeat(64)}` as never,
          reason: 'explicit-withdrawal',
        }),
        'preparation-not-found',
      );
    },
    recover: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'withdraw-recovery'));
    },
  },
  {
    mutation: 'preparation-claimed',
    guard: 'preparation-not-open',
    freshRecovery: true,
    run: async (_harness, prepared) => {
      await expectArmed(await arm(prepared, 'claimed-withdraw-prompt'));
      await expectClaimed(await claim(prepared));
      await expectRejected(
        await prepared.owner.workspace.execute({
          kind: 'harness.user-pull.withdraw',
          commandIdentity: commandIdentity('withdraw'),
          expectedStateVersion: await currentVersion(prepared),
          preparationIdentity: prepared.preparationIdentity,
          reason: 'explicit-withdrawal',
        }),
        'preparation-not-open',
      );
    },
    recover: async (_harness, prepared) => {
      await expect(
        await prepared.owner.workspace.execute({
          kind: 'harness.user-pull.withdraw',
          commandIdentity: commandIdentity('withdraw'),
          expectedStateVersion: await currentVersion(prepared),
          preparationIdentity: prepared.preparationIdentity,
          reason: 'explicit-withdrawal',
        }),
      ).toMatchObject({ kind: 'harness.user-pull.withdrawn', status: 'accepted' });
    },
  },
  {
    mutation: 'observability-record-missing',
    guard: 'availability-unknown',
    freshRecovery: true,
    run: async (harness, prepared) => {
      const observabilityIdentity = stableIdentity('hob', prepared.attachmentIdentity);
      const workspace = await reopenWithMissingRecord(harness, prepared, observabilityIdentity);
      await expectRejected(await observeContextBudget(workspace, prepared), 'availability-unknown');
    },
    recover: async (_harness, prepared) => {
      await expect(await observeContextBudget(prepared.owner.workspace, prepared)).toMatchObject({
        kind: 'harness.user-pull.observability-recorded',
        status: 'accepted',
      });
    },
  },
  {
    mutation: 'observability-attachment-record-missing',
    guard: 'attachment-not-live',
    freshRecovery: true,
    run: async (harness, prepared) => {
      const workspace = await reopenWithMissingRecord(harness, prepared, prepared.compatibilityIdentity);
      await expectRejected(await observeContextBudget(workspace, prepared), 'attachment-not-live');
    },
    recover: async (_harness, prepared) => {
      await expect(await observeContextBudget(prepared.owner.workspace, prepared)).toMatchObject({
        kind: 'harness.user-pull.observability-recorded',
        status: 'accepted',
      });
    },
  },
]);

describe('Claude User Pull guard matrix', () => {
  const harness = new UserPullScenarioHarness();
  afterEach(async () => {
    await harness.dispose();
  });

  it('covers every reachable guard exactly once and accounts for defensive guards', () => {
    const covered = new Set(GUARD_ROWS.map(row => row.guard));
    expect([...covered].sort()).toEqual([...REACHABLE_GUARDS].sort());
    for (const guard of STRUCTURALLY_DEFENSIVE_GUARDS) {
      expect(covered.has(guard)).toBe(false);
    }
  });

  for (const row of GUARD_ROWS) {
    it(`${row.mutation} trips ${row.guard} and reverts`, async () => {
      const prepared = await harness.prepareReview();
      await row.run(harness, prepared);
      const recovered = row.freshRecovery ? await harness.prepareReview() : prepared;
      await row.recover(harness, recovered);
    });
  }
});

describe('Claude User Pull transition matrix', () => {
  const harness = new UserPullScenarioHarness();
  afterEach(async () => {
    await harness.dispose();
  });

  it('settles a correlated normal Stop as ended-normally', async () => {
    const prepared = await harness.prepareReview();
    const promptId = 'transition-stop';
    await expectArmed(await arm(prepared, promptId));
    await expectClaimed(await claim(prepared));
    await observe(prepared, promptId, { kind: 'prompt-submitted' });
    const stopped = await observe(prepared, promptId, {
      kind: 'normal-stop',
      stopHookActive: false,
      backgroundTaskCount: 0,
      sessionCronCount: 0,
    });
    expect(stopped).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'ended-normally',
    });
    const interaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({ status: 'ended-normally' });
  });

  it('settles a correlated StopFailure as failed', async () => {
    const prepared = await harness.prepareReview();
    const promptId = 'transition-failure';
    await expectArmed(await arm(prepared, promptId));
    await expectClaimed(await claim(prepared));
    await observe(prepared, promptId, { kind: 'prompt-submitted' });
    const failed = await observe(prepared, promptId, { kind: 'stop-failure' });
    expect(failed).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'failed',
    });
  });

  it('keeps terminal-before-start unresolved instead of inventing rejection', async () => {
    const prepared = await harness.prepareReview();
    const promptId = 'transition-early-stop';
    await expectArmed(await arm(prepared, promptId));
    await expectClaimed(await claim(prepared));
    const early = await observe(prepared, promptId, { kind: 'normal-stop', stopHookActive: false });
    expect(early).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'unresolved',
    });
  });

  it('ignores an uncorrelated observation without ending the Preparation', async () => {
    const prepared = await harness.prepareReview();
    const ignored = await observe(prepared, 'unrelated-prompt', { kind: 'normal-stop', stopHookActive: false });
    expect(ignored).toMatchObject({
      kind: 'harness.user-pull.observation-ignored',
      reason: 'no-correlated-invocation',
    });
    const view = await prepared.owner.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({ status: 'prepared' });
  });

  it('withdraws an open Preparation without creating an Invocation', async () => {
    const prepared = await harness.prepareReview();
    const withdrawn = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.withdraw',
      commandIdentity: commandIdentity('withdraw'),
      expectedStateVersion: await currentVersion(prepared),
      preparationIdentity: prepared.preparationIdentity,
      reason: 'explicit-withdrawal',
    });
    expect(withdrawn).toMatchObject({ kind: 'harness.user-pull.withdrawn', status: 'accepted' });
    const view = await prepared.owner.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({ status: 'withdrawn' });
  });
});
