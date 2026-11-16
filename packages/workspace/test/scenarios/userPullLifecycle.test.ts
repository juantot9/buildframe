import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import type { ReviewedCapabilityManifest } from '../../src/harness-interaction/index.js';
import { openAuthoritativeState, type StateRecord } from '../../src/authoritativeState.js';
import { parseIndex } from '../../src/harness-interaction/parsing.js';
import { decode, stableIdentity } from '../../src/harness-interaction/utils.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';
import { userStateDirectory } from '../../src/workspaceIdentity.js';
import {
  FailingClaimState,
  FailingEvidenceState,
  MissingRecordState,
  UserPullScenarioHarness,
  userPullManifest,
} from './userPullScenarioSupport.js';

const harness = new UserPullScenarioHarness();
const { owners, states } = harness;
const open = harness.open.bind(harness);
const prepareReview = harness.prepareReview.bind(harness);
const claimPrepared = harness.claimPrepared.bind(harness);
const startClaimed = harness.startClaimed.bind(harness);

afterEach(async () => {
  await harness.dispose();
});

describe('Claude User Pull Preparation lifecycle', () => {
  it('upgrades bounded v1, v2 and v3 Harness indexes in memory and writes only v4 thereafter', () => {
    const upgraded = {
      formatVersion: 4,
      attachments: [],
      handoffs: [],
      invocations: [],
      preparations: [],
    };
    expect(parseIndex({ formatVersion: 1, attachments: [], handoffs: [], invocations: [] })).toEqual(upgraded);
    expect(parseIndex({ formatVersion: 2, attachments: [], handoffs: [], invocations: [], preparations: [] })).toEqual(
      upgraded,
    );
    expect(parseIndex({ formatVersion: 3, attachments: [], handoffs: [], invocations: [], preparations: [] })).toEqual(
      upgraded,
    );
  });

  it('atomically freezes the Handoff payload, receipt, capability, and one non-Invocation Preparation', async () => {
    const prepared = await prepareReview();
    const view = await prepared.owner.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({
      kind: 'harness.user-pull.preparation',
      status: 'prepared',
      preparationIdentity: prepared.preparationIdentity,
      liveArmCount: 0,
    });
    expect(view).not.toHaveProperty('claimHandle');
    expect(view).not.toHaveProperty('payload');
    const interaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.handoffs).toHaveLength(1);
    expect(interaction.invocations).toEqual([]);

    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const state = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(state);
    const indexIdentity = stableIdentity('hix', prepared.identity.workspaceIdentity);
    const indexRead = await state.read({ recordIdentities: [indexIdentity], includeContent: false });
    const indexRecord = indexRead.records[0];
    if (indexRecord === undefined) throw new Error('Harness index missing');
    const index = decode(indexRecord.payload) as {
      formatVersion: number;
      handoffs: Array<{ handoffIdentity: string }>;
      preparations: unknown[];
    };
    expect(index.formatVersion).toBe(4);
    expect(index.preparations).toHaveLength(1);
    const handoffIdentity = index.handoffs[0]?.handoffIdentity;
    if (handoffIdentity === undefined) throw new Error('Handoff identity missing');
    const records = await state.read({
      recordIdentities: [handoffIdentity, prepared.preparationIdentity],
      includeContent: true,
    });
    const [handoff, preparation] = records.records as readonly (StateRecord | undefined)[];
    expect(handoff?.kind).toBe('harness.workflow-handoff');
    const payloadContent = handoff?.content.find(item => item.role === 'user-pull-payload');
    expect(payloadContent?.bytes).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(payloadContent?.bytes ?? []).toString('utf8')).toContain('NEOFLOW USER PULL REVIEW');
    expect(preparation?.kind).toBe('harness.user-pull-preparation');
    expect(preparation?.recordClass).toBe('revisioned');
    const preparationPayload = decode(preparation?.payload ?? new Uint8Array()) as Record<string, unknown>;
    expect(preparationPayload['claimHandle']).toMatch(/^[0-9a-f]{64}$/u);
    expect(preparationPayload).not.toHaveProperty('payload');
  });

  it('projects revalidated, blocked, stale, and provenance-bound context evidence without ending the Preparation', async () => {
    const prepared = await prepareReview();
    const initial = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(initial.userPull).toMatchObject({
      action: '/neoflow:review',
      availability: { state: 'revalidated', reason: 'exact-identity-and-contract' },
      attachment: {
        attachmentIdentity: prepared.attachmentIdentity,
        contextBudget: { status: 'unavailable', reason: 'status-line-bridge-not-verified' },
      },
      preparations: [{ status: 'prepared', preparationIdentity: prepared.preparationIdentity }],
    });

    const first = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: 'context-budget-first',
      expectedStateVersion: initial.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      observation: {
        kind: 'context-budget',
        evidenceIdentity: 'claude-status-line:first',
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
        usedPercentage: 0.075,
        remainingPercentage: 99.925,
        promptId: 'context-prompt-1',
      },
    });
    expect(first).toMatchObject({ kind: 'harness.user-pull.observability-recorded' });
    const available = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(available.userPull.attachment?.contextBudget).toEqual({
      status: 'available',
      source: 'claude-status-line',
      evidenceIdentity: 'claude-status-line:first',
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
      usedPercentage: 0.075,
      remainingPercentage: 99.925,
      promptId: 'context-prompt-1',
    });

    const changedModel = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: 'context-budget-model-change',
      expectedStateVersion: first.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      observation: {
        kind: 'context-budget',
        evidenceIdentity: 'claude-status-line:model-change',
        compatibilityIdentity: prepared.compatibilityIdentity as never,
        source: 'claude-status-line',
        modelId: 'claude-sonnet-4-5',
        modelDisplayName: 'Sonnet 4.5',
        contextWindowSize: 200_000,
        totalInputTokens: 180,
        totalOutputTokens: 12,
        currentUsage: {
          inputTokens: 120,
          outputTokens: 12,
          cacheCreationInputTokens: 20,
          cacheReadInputTokens: 40,
        },
        promptId: 'context-prompt-1',
      },
    });
    if (changedModel.kind !== 'harness.user-pull.observability-recorded') {
      throw new Error('Model-change observation failed');
    }
    const invalidated = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(invalidated.userPull.attachment?.contextBudget).toMatchObject({
      status: 'unknown',
      reason: 'model-changed',
      modelId: 'claude-sonnet-4-5',
    });
    expect(invalidated.userPull.attachment?.contextBudget).not.toHaveProperty('totalInputTokens');

    const refreshed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: 'context-budget-model-refresh',
      expectedStateVersion: changedModel.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      observation: {
        kind: 'context-budget',
        evidenceIdentity: 'claude-status-line:model-refresh',
        compatibilityIdentity: prepared.compatibilityIdentity as never,
        source: 'claude-status-line',
        modelId: 'claude-sonnet-4-5',
        modelDisplayName: 'Sonnet 4.5',
        contextWindowSize: 200_000,
        totalInputTokens: 180,
        totalOutputTokens: 12,
        currentUsage: {
          inputTokens: 120,
          outputTokens: 12,
          cacheCreationInputTokens: 20,
          cacheReadInputTokens: 40,
        },
        promptId: 'context-prompt-2',
      },
    });
    if (refreshed.kind !== 'harness.user-pull.observability-recorded') {
      throw new Error('Fresh model observation failed');
    }
    const compacted = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: 'context-budget-compacted',
      expectedStateVersion: refreshed.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      observation: {
        kind: 'compaction',
        evidenceIdentity: 'claude-compaction:completed',
        phase: 'completed',
        trigger: 'manual',
      },
    });
    if (compacted.kind !== 'harness.user-pull.observability-recorded') {
      throw new Error('Compaction observation failed');
    }
    const afterCompaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterCompaction.userPull.attachment).toMatchObject({
      contextBudget: { status: 'unknown', reason: 'compacted' },
      compaction: { phase: 'completed', trigger: 'manual' },
    });

    const blocked = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observability.record',
      commandIdentity: 'context-budget-session-ended',
      expectedStateVersion: compacted.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      observation: {
        kind: 'availability-blocked',
        evidenceIdentity: 'claude-session-end:one',
        reason: 'session-ended',
      },
    });
    if (blocked.kind !== 'harness.user-pull.observability-recorded') {
      throw new Error('Blocked observation failed');
    }
    const afterBlock = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterBlock.userPull).toMatchObject({
      availability: { state: 'blocked-by-runtime', reason: 'session-ended' },
      preparations: [{ status: 'prepared', preparationIdentity: prepared.preparationIdentity }],
    });

    const reattached = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.attach',
      commandIdentity: 'user-pull-reattach-after-session-end',
      expectedStateVersion: blocked.stateVersion,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      hostVersion: '2.1.209',
      manifest: userPullManifest(),
    });
    if (reattached.kind !== 'harness.user-pull.attached') throw new Error('Reattachment failed');
    await expect(
      prepared.owner.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: prepared.started.reviewIdentity,
        offset: 0,
        limit: 64,
      }),
    ).resolves.toMatchObject({
      userPull: {
        availability: { state: 'revalidated' },
        preparations: [{ status: 'prepared', preparationIdentity: prepared.preparationIdentity }],
      },
    });

    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const restarted = await open(prepared.created.checkout);
    const stale = await restarted.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(stale.userPull).toMatchObject({
      availability: { state: 'stale', reason: 'runtime-revalidation-required' },
      attachment: { contextBudget: { status: 'unknown', reason: 'attachment-stale' } },
      preparations: [{ status: 'prepared', preparationIdentity: prepared.preparationIdentity }],
    });
  });

  it('arms one native occurrence and releases the frozen bytes only after an atomic claim', async () => {
    const prepared = await prepareReview();
    const armed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'user-pull-arm-1',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'prompt-1',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    expect(armed).toMatchObject({ kind: 'harness.user-pull.armed', status: 'accepted' });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Arm failed');

    const claimCommand = {
      kind: 'harness.user-pull.claim' as const,
      commandIdentity: 'user-pull-claim-1',
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    };
    const claimed = await prepared.owner.workspace.execute(claimCommand);
    expect(claimed).toMatchObject({
      kind: 'harness.user-pull.claimed',
      status: 'accepted',
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      preparationIdentity: prepared.preparationIdentity,
    });
    if (claimed.kind !== 'harness.user-pull.claimed') throw new Error('Claim failed');
    expect(Buffer.byteLength(claimed.payload, 'utf8')).toBe(claimed.payloadByteLength);
    expect(createHash('sha256').update(claimed.payload).digest('hex')).toBe(claimed.payloadSha256);

    expect(
      await prepared.owner.workspace.execute({
        kind: 'harness.user-pull.withdraw',
        commandIdentity: 'withdraw-after-claim',
        expectedStateVersion: claimed.stateVersion,
        preparationIdentity: prepared.preparationIdentity,
        reason: 'workflow-cancellation',
      }),
    ).toMatchObject({ kind: 'harness.command.rejected', reason: 'preparation-not-open' });

    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const restarted = await open(prepared.created.checkout);
    const replayed = await restarted.workspace.execute(claimCommand);
    expect(replayed).toMatchObject({
      kind: 'harness.user-pull.claim-duplicate',
      invocationIdentity: claimed.invocationIdentity,
    });
    expect(replayed).not.toHaveProperty('payload');
    const freshDuplicate = await restarted.workspace.execute({
      ...claimCommand,
      commandIdentity: 'user-pull-claim-duplicate',
      expectedStateVersion: claimed.stateVersion,
    });
    expect(freshDuplicate).toMatchObject({
      kind: 'harness.user-pull.claim-duplicate',
      invocationIdentity: claimed.invocationIdentity,
    });
    expect(freshDuplicate).not.toHaveProperty('payload');

    const view = await restarted.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({
      status: 'claimed',
      invocationIdentity: claimed.invocationIdentity,
      liveArmCount: 0,
    });
    const interaction = await restarted.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations).toEqual([
      expect.objectContaining({ invocationIdentity: claimed.invocationIdentity, status: 'awaiting-start' }),
    ]);
  });

  it('correlates matching submit and safe Stop evidence exactly once across duplicate callbacks and restart', async () => {
    const prepared = await prepareReview();
    const { claimed } = await claimPrepared(prepared, 'correlated-normal-prompt');
    expect(claimed).toHaveProperty('payload');

    const startObservation = {
      kind: 'prompt-submitted' as const,
      sessionId: prepared.sessionId,
      promptId: 'correlated-normal-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    };
    const started = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-correlated-start',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: startObservation,
    });
    expect(started).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'started',
      invocationIdentity: claimed.invocationIdentity,
    });
    if (started.kind !== 'harness.user-pull.observed') throw new Error('Start observation failed');
    const duplicateStart = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-correlated-start-duplicate',
      expectedStateVersion: started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: startObservation,
    });
    expect(duplicateStart).toMatchObject({
      kind: 'harness.user-pull.observed',
      evidenceIdentity: started.evidenceIdentity,
      stateVersion: started.stateVersion,
    });

    const stopObservation = {
      kind: 'normal-stop' as const,
      sessionId: prepared.sessionId,
      promptId: 'correlated-normal-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      backgroundTaskCount: 0,
      sessionCronCount: 0,
      stopHookActive: false,
    };
    const stopped = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-correlated-stop',
      expectedStateVersion: started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: stopObservation,
    });
    expect(stopped).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'ended-normally',
      invocationIdentity: claimed.invocationIdentity,
    });
    if (stopped.kind !== 'harness.user-pull.observed') throw new Error('Stop observation failed');
    expect(stopped.evidenceIdentity).not.toBe(started.evidenceIdentity);
    const duplicateStartAfterSettlement = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-correlated-start-after-settlement',
      expectedStateVersion: stopped.stateVersion,
      bridgeProtocolVersion: 1,
      observation: startObservation,
    });
    expect(duplicateStartAfterSettlement).toMatchObject({
      kind: 'harness.user-pull.observed',
      evidenceIdentity: started.evidenceIdentity,
      stateVersion: stopped.stateVersion,
    });

    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const restarted = await open(prepared.created.checkout);
    const duplicateStop = await restarted.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-correlated-stop-after-restart',
      expectedStateVersion: stopped.stateVersion,
      bridgeProtocolVersion: 1,
      observation: stopObservation,
    });
    expect(duplicateStop).toMatchObject({
      kind: 'harness.user-pull.observed',
      evidenceIdentity: stopped.evidenceIdentity,
      stateVersion: stopped.stateVersion,
    });
    expect(duplicateStop).not.toHaveProperty('payload');
    const interaction = await restarted.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations).toEqual([
      expect.objectContaining({
        invocationIdentity: claimed.invocationIdentity,
        status: 'ended-normally',
        evidenceIdentities: [started.evidenceIdentity, stopped.evidenceIdentity],
      }),
    ]);
    expect(interaction.invocations[0]).not.toHaveProperty('responseIdentity');

    await restarted.dispose();
    owners.delete(restarted);
    const state = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(state);
    const evidenceRead = await state.read({
      recordIdentities: [
        stableIdentity('hev', started.evidenceIdentity),
        stableIdentity('hev', stopped.evidenceIdentity),
        stableIdentity('hix', prepared.identity.workspaceIdentity),
      ],
      includeContent: false,
    });
    expect(evidenceRead.records.slice(0, 2).map(record => record?.kind)).toEqual([
      'harness.evidence',
      'harness.evidence',
    ]);
    const startRecord = decode(evidenceRead.records[0]?.payload ?? new Uint8Array()) as {
      normalizedEvidence: string;
    };
    const stopRecord = decode(evidenceRead.records[1]?.payload ?? new Uint8Array()) as {
      normalizedEvidence: string;
    };
    expect(JSON.parse(startRecord.normalizedEvidence)).toMatchObject({
      kind: 'harness.user-pull.start-observed',
      invocationIdentity: claimed.invocationIdentity,
      preparationIdentity: prepared.preparationIdentity,
      sessionId: prepared.sessionId,
      promptId: 'correlated-normal-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      bridgeProtocolVersion: 1,
    });
    expect(JSON.parse(stopRecord.normalizedEvidence)).toMatchObject({
      kind: 'harness.user-pull.terminal-observed',
      invocationIdentity: claimed.invocationIdentity,
      terminalEvent: 'normal-stop',
      outcome: 'ended-normally',
      backgroundTaskCount: 0,
      sessionCronCount: 0,
      stopHookActive: false,
    });
    const storedIndex = decode(evidenceRead.records[2]?.payload ?? new Uint8Array()) as {
      readonly attachments: readonly unknown[];
      readonly handoffs: readonly unknown[];
      readonly invocations: readonly (Record<string, unknown> & { readonly startObservationDeadline?: string })[];
      readonly preparations: readonly unknown[];
    };
    const legacyV2 = {
      ...storedIndex,
      formatVersion: 2,
      invocations: storedIndex.invocations.map(({ startObservationDeadline: _deadline, ...invocation }) => invocation),
    };
    const upgradedV2 = parseIndex(legacyV2);
    expect(upgradedV2.formatVersion).toBe(4);
    expect(upgradedV2.invocations[0]).not.toHaveProperty('startObservationDeadline');
  });

  it('settles a matching StopFailure as failed and refuses conflicting later terminal evidence', async () => {
    const prepared = await prepareReview();
    const { claimed } = await claimPrepared(prepared, 'correlated-failure-prompt');
    const started = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-failure-start',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'prompt-submitted',
        sessionId: prepared.sessionId,
        promptId: 'correlated-failure-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      },
    });
    if (started.kind !== 'harness.user-pull.observed') throw new Error('Failure start did not correlate');
    const failed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-stop-failure',
      expectedStateVersion: started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'stop-failure',
        sessionId: prepared.sessionId,
        promptId: 'correlated-failure-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
        errorType: 'api_error',
        failureType: 'model_failure',
      },
    });
    expect(failed).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'failed' });
    if (failed.kind !== 'harness.user-pull.observed') throw new Error('StopFailure did not correlate');
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: 'observe-conflicting-normal-stop',
        expectedStateVersion: failed.stateVersion,
        bridgeProtocolVersion: 1,
        observation: {
          kind: 'normal-stop',
          sessionId: prepared.sessionId,
          promptId: 'correlated-failure-prompt',
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
          backgroundTaskCount: 0,
          sessionCronCount: 0,
          stopHookActive: false,
        },
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'observation-conflict' });
    const interaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({ status: 'failed', terminalReason: 'harness-failed' });
  });

  it('ignores unrelated turns and makes terminal-before-start durably unresolved', async () => {
    const prepared = await prepareReview();
    const { claimed } = await claimPrepared(prepared, 'missing-start-prompt');
    const unrelated = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-unrelated-submit',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'prompt-submitted',
        sessionId: prepared.sessionId,
        promptId: 'ordinary-unrelated-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      },
    });
    expect(unrelated).toMatchObject({
      kind: 'harness.user-pull.observation-ignored',
      reason: 'no-correlated-invocation',
      stateVersion: claimed.stateVersion,
    });
    const wrongSession = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-wrong-session-submit',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'prompt-submitted',
        sessionId: 'another-session',
        promptId: 'missing-start-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      },
    });
    expect(wrongSession).toMatchObject({
      kind: 'harness.user-pull.observation-ignored',
      stateVersion: claimed.stateVersion,
    });
    const unresolved = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-terminal-before-start',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'normal-stop',
        sessionId: prepared.sessionId,
        promptId: 'missing-start-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
        backgroundTaskCount: 0,
        sessionCronCount: 0,
        stopHookActive: false,
      },
    });
    expect(unresolved).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'unresolved' });
    if (unresolved.kind !== 'harness.user-pull.observed') throw new Error('Loss evidence did not commit');
    const duplicateTerminal = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-terminal-before-start-duplicate',
      expectedStateVersion: unresolved.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'normal-stop',
        sessionId: prepared.sessionId,
        promptId: 'missing-start-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
        backgroundTaskCount: 0,
        sessionCronCount: 0,
        stopHookActive: false,
      },
    });
    expect(duplicateTerminal).toMatchObject({
      kind: 'harness.user-pull.observed',
      evidenceIdentity: unresolved.evidenceIdentity,
      stateVersion: unresolved.stateVersion,
    });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: 'observe-late-start',
        expectedStateVersion: unresolved.stateVersion,
        bridgeProtocolVersion: 1,
        observation: {
          kind: 'prompt-submitted',
          sessionId: prepared.sessionId,
          promptId: 'missing-start-prompt',
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
        },
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'observation-conflict' });
    const interaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({ status: 'unresolved', terminalReason: 'start-evidence-lost' });
  });

  it('settles SessionEnd, verified disconnect, and attachment mismatch only as unresolved', async () => {
    const sessionPrepared = await prepareReview();
    const sessionTurn = await startClaimed(sessionPrepared, 'session-boundary-prompt');
    const active = await sessionPrepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: sessionPrepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    // Ctrl+C has no reviewed callback, so absence alone leaves the turn active.
    expect(active.invocations[0]).toMatchObject({ status: 'active' });
    const sessionEnded = await sessionPrepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-session-end',
      expectedStateVersion: sessionTurn.started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'session-ended',
        sessionId: sessionPrepared.sessionId,
        canonicalGitRoot: sessionPrepared.identity.canonicalCheckout,
        canonicalGitDir: sessionPrepared.canonicalGitDir,
        sessionReason: 'user_exit',
      },
    });
    expect(sessionEnded).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'unresolved' });
    const sessionInteraction = await sessionPrepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: sessionPrepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(sessionInteraction.invocations[0]).toMatchObject({
      status: 'unresolved',
      terminalReason: 'session-ended-without-terminal',
    });

    const disconnectPrepared = await prepareReview();
    const disconnectTurn = await startClaimed(disconnectPrepared, 'disconnect-prompt');
    const disconnected = await disconnectPrepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-host-disconnect',
      expectedStateVersion: disconnectTurn.started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'correlation-lost',
        attachmentIdentity: disconnectPrepared.attachmentIdentity,
        invocationIdentity: disconnectTurn.claimed.invocationIdentity,
        reason: 'host-disconnected',
      },
    });
    expect(disconnected).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'unresolved' });
    const disconnectInteraction = await disconnectPrepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: disconnectPrepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(disconnectInteraction.invocations[0]).toMatchObject({
      status: 'unresolved',
      terminalReason: 'host-disconnected',
    });

    const changedPrepared = await prepareReview();
    const changedTurn = await startClaimed(changedPrepared, 'changed-attachment-prompt');
    const changed = await changedPrepared.owner.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'observe-changed-checkout',
      expectedStateVersion: changedTurn.started.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'normal-stop',
        sessionId: changedPrepared.sessionId,
        promptId: 'changed-attachment-prompt',
        canonicalGitRoot: `${changedPrepared.identity.canonicalCheckout}-moved`,
        canonicalGitDir: changedPrepared.canonicalGitDir,
        backgroundTaskCount: 0,
        sessionCronCount: 0,
        stopHookActive: false,
      },
    });
    expect(changed).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'unresolved' });
    const changedInteraction = await changedPrepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: changedPrepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(changedInteraction.invocations[0]).toMatchObject({
      status: 'unresolved',
      terminalReason: 'attachment-identity-changed',
    });
  });

  it('refuses normal completion while background work is present, unverified, or continuing', async () => {
    const cases = [
      {
        promptId: 'background-remains-prompt',
        detail: { backgroundTaskCount: 1, sessionCronCount: 0, stopHookActive: false },
        reason: 'background-activity-remains',
      },
      {
        promptId: 'background-unverified-prompt',
        detail: { stopHookActive: false },
        reason: 'background-activity-unverified',
      },
      {
        promptId: 'stop-continuation-prompt',
        detail: { backgroundTaskCount: 0, sessionCronCount: 0, stopHookActive: true },
        reason: 'stop-continuation-active',
      },
    ] as const;
    for (const scenario of cases) {
      const prepared = await prepareReview();
      const turn = await startClaimed(prepared, scenario.promptId);
      const observed = await prepared.owner.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: `observe-${scenario.promptId}`,
        expectedStateVersion: turn.started.stateVersion,
        bridgeProtocolVersion: 1,
        observation: {
          kind: 'normal-stop',
          sessionId: prepared.sessionId,
          promptId: scenario.promptId,
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
          ...scenario.detail,
        },
      });
      expect(observed).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'unresolved' });
      const interaction = await prepared.owner.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: prepared.started.reviewIdentity,
        offset: 0,
        limit: 64,
      });
      expect(interaction.invocations[0]).toMatchObject({ status: 'unresolved', terminalReason: scenario.reason });
    }
  });

  it('lazily expires the exact 30-second start-observation window without inventing rejection', async () => {
    const prepared = await prepareReview();
    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const durable = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(durable);
    let now = new Date('2030-01-01T00:00:00.000Z');
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      durable,
      { harnessNow: () => now },
      prepared.canonicalGitDir,
    );
    const armed = await assembly.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'window-arm',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'window-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Window arm failed');
    const claimed = await assembly.workspace.execute({
      kind: 'harness.user-pull.claim',
      commandIdentity: 'window-claim',
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (claimed.kind !== 'harness.user-pull.claimed') throw new Error('Window claim failed');
    const before = await assembly.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(before.invocations[0]).toMatchObject({
      status: 'awaiting-start',
      startObservationDeadline: '2030-01-01T00:00:30.000Z',
    });

    now = new Date('2030-01-01T00:00:30.000Z');
    const expired = await assembly.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(expired.stateVersion).toBe(claimed.stateVersion + 1);
    expect(expired.invocations[0]).toMatchObject({
      status: 'unresolved',
      terminalReason: 'start-observation-window-expired',
      startObservationDeadline: '2030-01-01T00:00:30.000Z',
    });
    const expiryEvidenceIdentity = expired.invocations[0]?.evidenceIdentities[0];
    if (expiryEvidenceIdentity === undefined) throw new Error('Expiry evidence was not projected');
    const late = await assembly.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'window-late-start',
      expectedStateVersion: expired.stateVersion,
      bridgeProtocolVersion: 1,
      observation: {
        kind: 'prompt-submitted',
        sessionId: prepared.sessionId,
        promptId: 'window-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      },
    });
    expect(late).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'unresolved',
      evidenceIdentity: expiryEvidenceIdentity,
      stateVersion: expired.stateVersion,
    });
  });

  it('keeps a committed start idempotent after its observation window has elapsed', async () => {
    const prepared = await prepareReview();
    await prepared.owner.dispose();
    owners.delete(prepared.owner);
    const durable = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(durable);
    let now = new Date('2031-01-01T00:00:00.000Z');
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      durable,
      { harnessNow: () => now },
      prepared.canonicalGitDir,
    );
    const armed = await assembly.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'idempotent-window-arm',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'idempotent-window-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Idempotent window arm failed');
    const claimed = await assembly.workspace.execute({
      kind: 'harness.user-pull.claim',
      commandIdentity: 'idempotent-window-claim',
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (claimed.kind !== 'harness.user-pull.claimed') throw new Error('Idempotent window claim failed');
    const observation = {
      kind: 'prompt-submitted' as const,
      sessionId: prepared.sessionId,
      promptId: 'idempotent-window-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    };
    const started = await assembly.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'idempotent-window-start',
      expectedStateVersion: claimed.stateVersion,
      bridgeProtocolVersion: 1,
      observation,
    });
    if (started.kind !== 'harness.user-pull.observed') throw new Error('Idempotent window start failed');

    now = new Date('2031-01-01T00:01:00.000Z');
    const duplicate = await assembly.workspace.execute({
      kind: 'harness.user-pull.observe',
      commandIdentity: 'idempotent-window-start-duplicate',
      expectedStateVersion: started.stateVersion,
      bridgeProtocolVersion: 1,
      observation,
    });
    expect(duplicate).toMatchObject({
      kind: 'harness.user-pull.observed',
      disposition: 'started',
      evidenceIdentity: started.evidenceIdentity,
      stateVersion: started.stateVersion,
    });
    const interaction = await assembly.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations[0]).toMatchObject({ status: 'active', totalEvidence: 1 });
  });

  it('leaves evidence state unchanged on failed commit and recovers an ambiguous committed acknowledgement', async () => {
    for (const mode of ['before', 'after'] as const) {
      const prepared = await prepareReview();
      const { claimed } = await claimPrepared(prepared, `evidence-${mode}-prompt`);
      await prepared.owner.dispose();
      owners.delete(prepared.owner);
      const durable = await openAuthoritativeState({
        workspaceIdentity: prepared.identity.workspaceIdentity,
        privateStateDirectory: userStateDirectory(prepared.created.checkout),
      });
      const state = new FailingEvidenceState(durable, mode);
      states.add(state);
      const assembly = openRuntimeWorkspace(
        prepared.identity.workspaceIdentity,
        prepared.identity.canonicalCheckout,
        state,
        {},
        prepared.canonicalGitDir,
      );
      const observation = {
        kind: 'prompt-submitted' as const,
        sessionId: prepared.sessionId,
        promptId: `evidence-${mode}-prompt`,
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      };
      await expect(
        assembly.workspace.execute({
          kind: 'harness.user-pull.observe',
          commandIdentity: `failing-evidence-${mode}`,
          expectedStateVersion: claimed.stateVersion,
          bridgeProtocolVersion: 1,
          observation,
        }),
      ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'state-conflict' });
      const afterFailure = await assembly.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: prepared.started.reviewIdentity,
        offset: 0,
        limit: 64,
      });
      expect(afterFailure.invocations[0]).toMatchObject({ status: mode === 'before' ? 'awaiting-start' : 'active' });
      expect(afterFailure.invocations[0]?.evidenceIdentities).toHaveLength(mode === 'before' ? 0 : 1);
      const recovered = await assembly.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: `recovered-evidence-${mode}`,
        expectedStateVersion: afterFailure.stateVersion,
        bridgeProtocolVersion: 1,
        observation,
      });
      expect(recovered).toMatchObject({ kind: 'harness.user-pull.observed', disposition: 'started' });
      const afterRecovery = await assembly.workspace.read({
        kind: 'harness.review-interaction',
        reviewIdentity: prepared.started.reviewIdentity,
        offset: 0,
        limit: 64,
      });
      expect(afterRecovery.invocations[0]).toMatchObject({ status: 'active' });
      expect(afterRecovery.invocations[0]?.evidenceIdentities).toHaveLength(1);
    }
  });

  it('keeps the Preparation single-flight and rejects malformed or wrong protocol commands', async () => {
    const prepared = await prepareReview();
    await expect(
      prepared.owner.workspace.read({
        kind: 'harness.user-pull.review-handoff.inspect',
        reviewIdentity: prepared.started.reviewIdentity,
        reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
        attachmentIdentity: prepared.attachmentIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'preparation-already-open',
      blockerIdentities: [prepared.preparationIdentity],
    });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.arm',
        commandIdentity: 'unsupported-arm-protocol',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 2,
        sessionId: prepared.sessionId,
        promptId: 'unsupported-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'bridge-protocol-mismatch' });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.arm',
        commandIdentity: 'mismatched-arm-session',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 1,
        sessionId: 'another-session',
        promptId: 'mismatched-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'attachment-not-found' });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.claim',
        commandIdentity: 'mismatched-claim-checkout',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 1,
        canonicalGitRoot: `${prepared.identity.canonicalCheckout}-other`,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'checkout-mismatch' });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: 'unsupported-observation-protocol',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 2,
        observation: {
          kind: 'session-ended',
          sessionId: prepared.sessionId,
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
        },
      }),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'bridge-protocol-mismatch' });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.observe',
        commandIdentity: 'malformed-normal-stop',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 1,
        observation: {
          kind: 'normal-stop',
          sessionId: prepared.sessionId,
          promptId: 'malformed-stop',
          canonicalGitRoot: prepared.identity.canonicalCheckout,
          canonicalGitDir: prepared.canonicalGitDir,
        },
      } as never),
    ).rejects.toThrow(TypeError);
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.withdraw',
        commandIdentity: 'unknown-preparation-handle',
        expectedStateVersion: prepared.preparedStateVersion,
        preparationIdentity: `hpp_${'0'.repeat(64)}`,
        reason: 'explicit-withdrawal',
      } as never),
    ).resolves.toMatchObject({ kind: 'harness.command.rejected', reason: 'preparation-not-found' });
    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.prepare',
        commandIdentity: 'malformed-deadline',
        expectedStateVersion: prepared.preparedStateVersion,
        reviewIdentity: prepared.started.reviewIdentity,
        reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
        attachmentIdentity: prepared.attachmentIdentity,
        inspectionIdentity: '0'.repeat(64),
        disclosedDeadline: 'tomorrow',
      } as never),
    ).rejects.toThrow(TypeError);
    const home = await prepared.owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 1 });
    expect(home.stateVersion).toBe(prepared.preparedStateVersion);
  });

  it('releases no payload when the claim commit fails and remains claimable', async () => {
    const prepared = await prepareReview();
    const armed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'failed-claim-arm',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'failed-claim-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Failed-claim fixture arm failed');
    await prepared.owner.dispose();
    owners.delete(prepared.owner);

    const durable = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    const state = new FailingClaimState(durable);
    states.add(state);
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      state,
      {},
      prepared.canonicalGitDir,
    );
    const claim = {
      kind: 'harness.user-pull.claim' as const,
      commandIdentity: 'failed-user-pull-claim',
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    };
    await expect(assembly.workspace.execute(claim)).rejects.toThrow('injected claim commit failure');
    await expect(
      assembly.workspace.read({
        kind: 'harness.user-pull.preparation',
        attachmentIdentity: prepared.attachmentIdentity,
      }),
    ).resolves.toMatchObject({ status: 'prepared', liveArmCount: 1 });

    const retried = await assembly.workspace.execute(claim);
    expect(retried).toMatchObject({
      kind: 'harness.user-pull.claimed',
      preparationIdentity: prepared.preparationIdentity,
    });
    expect(retried).toHaveProperty('payload');
  });

  it('recovers a post-commit claim crash as claimed without replaying payload', async () => {
    const prepared = await prepareReview();
    const armed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'crash-user-pull-arm',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'crash-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Crash fixture arm failed');
    await prepared.owner.dispose();
    owners.delete(prepared.owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(state);
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      state,
      {
        afterHarnessCommitBeforeDirective: () => {
          throw new Error('injected post-claim crash');
        },
      },
      prepared.canonicalGitDir,
    );
    const claim = {
      kind: 'harness.user-pull.claim' as const,
      commandIdentity: 'crashing-user-pull-claim',
      expectedStateVersion: armed.stateVersion,
      bridgeProtocolVersion: 1,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    };
    await expect(assembly.workspace.execute(claim)).rejects.toThrow('injected post-claim crash');

    const recovered = await assembly.workspace.execute(claim);
    expect(recovered).toMatchObject({
      kind: 'harness.user-pull.claim-duplicate',
      preparationIdentity: prepared.preparationIdentity,
    });
    expect(recovered).not.toHaveProperty('payload');
    const commandResult = await assembly.workspace.read({
      kind: 'harness.command-result',
      commandIdentity: claim.commandIdentity,
    });
    expect(commandResult).toMatchObject({
      status: 'available',
      result: { kind: 'harness.user-pull.claim-committed' },
    });
    expect(commandResult).not.toHaveProperty('result.payload');
  });

  it('durably expires a disclosed deadline and permits a fresh Preparation with new authority', async () => {
    const prepared = await prepareReview({ disclosedDeadline: '2099-01-01T00:00:00.000Z' });
    const armed = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'deadline-user-pull-arm',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'deadline-prompt',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (armed.kind !== 'harness.user-pull.armed') throw new Error('Deadline fixture arm failed');
    await prepared.owner.dispose();
    owners.delete(prepared.owner);

    const state = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    states.add(state);
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      state,
      { harnessNow: () => new Date('2100-01-01T00:00:00.000Z') },
      prepared.canonicalGitDir,
    );
    await expect(
      assembly.workspace.execute({
        kind: 'harness.user-pull.claim',
        commandIdentity: 'expired-deadline-claim',
        expectedStateVersion: armed.stateVersion,
        bridgeProtocolVersion: 1,
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'route-deadline-passed',
      stateVersion: armed.stateVersion + 1,
    });
    const expired = await assembly.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(expired).toMatchObject({
      status: 'expired',
      preparationIdentity: prepared.preparationIdentity,
      terminalReason: 'route-deadline-passed',
      liveArmCount: 0,
    });

    const inspection = await assembly.workspace.read({
      kind: 'harness.user-pull.review-handoff.inspect',
      reviewIdentity: prepared.started.reviewIdentity,
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      attachmentIdentity: prepared.attachmentIdentity,
    });
    if (inspection.status !== 'available') throw new Error(`Re-preparation unavailable: ${inspection.reason}`);
    const again = await assembly.workspace.execute({
      kind: 'harness.user-pull.prepare',
      commandIdentity: 'user-pull-reprepare-after-expiry',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: prepared.started.reviewIdentity,
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      attachmentIdentity: prepared.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    expect(again).toMatchObject({ kind: 'harness.user-pull.prepared', status: 'accepted' });
    if (again.kind !== 'harness.user-pull.prepared') throw new Error('Re-preparation failed');
    expect(again.preparationIdentity).not.toBe(prepared.preparationIdentity);
    expect(again.commitmentReceiptIdentity).not.toBe(prepared.commitmentReceiptIdentity);

    const records = await state.read({
      recordIdentities: [prepared.preparationIdentity, again.preparationIdentity],
      includeContent: false,
    });
    const handles = records.records.map(record => {
      if (record === undefined) throw new Error('Preparation record missing');
      return (decode(record.payload) as { claimHandle: string }).claimHandle;
    });
    expect(handles[0]).toMatch(/^[0-9a-f]{64}$/u);
    expect(handles[1]).toMatch(/^[0-9a-f]{64}$/u);
    expect(handles[1]).not.toBe(handles[0]);
  });

  it('durably expires when the exact attachment identity record is lost', async () => {
    const prepared = await prepareReview();
    await prepared.owner.dispose();
    owners.delete(prepared.owner);

    const durable = await openAuthoritativeState({
      workspaceIdentity: prepared.identity.workspaceIdentity,
      privateStateDirectory: userStateDirectory(prepared.created.checkout),
    });
    const state = new MissingRecordState(durable, prepared.compatibilityIdentity);
    states.add(state);
    const assembly = openRuntimeWorkspace(
      prepared.identity.workspaceIdentity,
      prepared.identity.canonicalCheckout,
      state,
      {},
      prepared.canonicalGitDir,
    );
    await expect(
      assembly.workspace.execute({
        kind: 'harness.user-pull.arm',
        commandIdentity: 'identity-lost-user-pull-arm',
        expectedStateVersion: prepared.preparedStateVersion,
        bridgeProtocolVersion: 1,
        sessionId: prepared.sessionId,
        promptId: 'identity-lost-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'identity-lost',
      stateVersion: prepared.preparedStateVersion + 1,
    });
    const view = await assembly.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({
      status: 'expired',
      terminalReason: 'identity-lost',
      preparationIdentity: prepared.preparationIdentity,
    });
    expect(view.stateVersion).toBe(prepared.preparedStateVersion + 1);
  });

  it('expires rather than silently downgrading an incompatible current capability', async () => {
    const prepared = await prepareReview();
    const changed = userPullManifest();
    const capability = changed.capabilities[0];
    if (capability === undefined || capability.route !== 'user-pull') throw new Error('Capability fixture missing');
    const incompatible: ReviewedCapabilityManifest = {
      ...changed,
      capabilities: [{ ...capability, knownLimitations: ['A changed reviewed limitation.'] }],
    };
    const attached = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.attach',
      commandIdentity: 'reattach-incompatible-user-pull',
      expectedStateVersion: prepared.preparedStateVersion,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      hostVersion: '2.1.209',
      manifest: incompatible,
    });
    expect(attached).toMatchObject({ kind: 'harness.user-pull.attached', status: 'accepted' });
    if (attached.kind !== 'harness.user-pull.attached') throw new Error('Reattachment failed');

    await expect(
      prepared.owner.workspace.execute({
        kind: 'harness.user-pull.arm',
        commandIdentity: 'incompatible-capability-arm',
        expectedStateVersion: attached.stateVersion,
        bridgeProtocolVersion: 1,
        sessionId: prepared.sessionId,
        promptId: 'incompatible-capability-prompt',
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).resolves.toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'capability-incompatible',
      stateVersion: attached.stateVersion + 1,
    });
    const view = await prepared.owner.workspace.read({
      kind: 'harness.user-pull.preparation',
      attachmentIdentity: prepared.attachmentIdentity,
    });
    expect(view).toMatchObject({
      status: 'expired',
      terminalReason: 'capability-incompatible',
      preparationIdentity: prepared.preparationIdentity,
    });
    expect(view.stateVersion).toBe(attached.stateVersion + 1);

    const restored = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.attach',
      commandIdentity: 'restore-compatible-user-pull',
      expectedStateVersion: view.stateVersion,
      sessionId: prepared.sessionId,
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
      hostVersion: '2.1.209',
      manifest: userPullManifest(),
    });
    if (restored.kind !== 'harness.user-pull.attached') throw new Error('Capability restoration failed');
    await expect(
      prepared.owner.workspace.read({
        kind: 'harness.user-pull.preparation',
        attachmentIdentity: prepared.attachmentIdentity,
      }),
    ).resolves.toMatchObject({
      status: 'expired',
      terminalReason: 'capability-incompatible',
      preparationIdentity: prepared.preparationIdentity,
    });
  });

  it('refuses an ambiguous second arm and permits withdrawal without creating an Invocation', async () => {
    const prepared = await prepareReview();
    const first = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'user-pull-arm-a',
      expectedStateVersion: prepared.preparedStateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'prompt-a',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (first.kind !== 'harness.user-pull.armed') throw new Error('First arm failed');
    const second = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.arm',
      commandIdentity: 'user-pull-arm-b',
      expectedStateVersion: first.stateVersion,
      bridgeProtocolVersion: 1,
      sessionId: prepared.sessionId,
      promptId: 'prompt-b',
      canonicalGitRoot: prepared.identity.canonicalCheckout,
      canonicalGitDir: prepared.canonicalGitDir,
    });
    if (second.kind !== 'harness.user-pull.armed') throw new Error('Second arm failed');
    expect(
      await prepared.owner.workspace.execute({
        kind: 'harness.user-pull.claim',
        commandIdentity: 'ambiguous-user-pull-claim',
        expectedStateVersion: second.stateVersion,
        bridgeProtocolVersion: 1,
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'ambiguous-armed-occurrence',
      stateVersion: second.stateVersion,
    });
    const withdrawn = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.withdraw',
      commandIdentity: 'withdraw-ambiguous-user-pull',
      expectedStateVersion: second.stateVersion,
      preparationIdentity: prepared.preparationIdentity,
      reason: 'workflow-cancellation',
    });
    expect(withdrawn).toMatchObject({ kind: 'harness.user-pull.withdrawn', reason: 'workflow-cancellation' });
    expect(
      await prepared.owner.workspace.execute({
        kind: 'harness.user-pull.claim',
        commandIdentity: 'claim-after-withdrawal',
        expectedStateVersion: withdrawn.stateVersion,
        bridgeProtocolVersion: 1,
        canonicalGitRoot: prepared.identity.canonicalCheckout,
        canonicalGitDir: prepared.canonicalGitDir,
      }),
    ).toMatchObject({ kind: 'harness.command.rejected', reason: 'preparation-not-found' });

    const inspection = await prepared.owner.workspace.read({
      kind: 'harness.user-pull.review-handoff.inspect',
      reviewIdentity: prepared.started.reviewIdentity,
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      attachmentIdentity: prepared.attachmentIdentity,
    });
    if (inspection.status !== 'available') throw new Error(`Re-preparation unavailable: ${inspection.reason}`);
    const again = await prepared.owner.workspace.execute({
      kind: 'harness.user-pull.prepare',
      commandIdentity: 'reprepare-after-workflow-cancellation',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: prepared.started.reviewIdentity,
      reviewBatchIdentity: prepared.batch.reviewBatchIdentity,
      attachmentIdentity: prepared.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    expect(again).toMatchObject({ kind: 'harness.user-pull.prepared', status: 'accepted' });
    if (again.kind !== 'harness.user-pull.prepared') throw new Error('Re-preparation failed');
    expect(again.preparationIdentity).not.toBe(prepared.preparationIdentity);
    expect(again.commitmentReceiptIdentity).not.toBe(prepared.commitmentReceiptIdentity);

    const interaction = await prepared.owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: prepared.started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(interaction.invocations).toEqual([]);
  });
});
