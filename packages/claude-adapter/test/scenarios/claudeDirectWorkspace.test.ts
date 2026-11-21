import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { ClaudeDirectAdapter, type ClaudeModChannel } from '../../src/direct/claudeDirectAdapter.js';
import type { ClaudeModCommand } from '../../src/direct/modProtocol.js';

const execFileAsync = promisify(execFile);

class ScriptedChannel implements ClaudeModChannel {
  readonly delivered: ClaudeModCommand[] = [];
  onSubmit: ((command: Extract<ClaudeModCommand, { type: 'submit' }>) => void) | undefined;

  deliver(command: ClaudeModCommand): boolean {
    this.delivered.push(command);
    if (command.type === 'submit') queueMicrotask(() => this.onSubmit?.(command));
    return true;
  }

  withdraw(): boolean {
    return false;
  }
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync('git', ['-C', directory, ...arguments_]);
}

describe('Claude Direct delivery through the Workspace', () => {
  const owners = new Set<WorkspaceRuntimeOwner>();
  const roots = new Set<string>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  afterEach(async () => {
    for (const owner of owners) await owner.dispose();
    owners.clear();
    for (const root of roots) await rm(root, { recursive: true, force: true });
    roots.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
  });

  it('routes a committed Review Message to the attached Claude session and settles its turn', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-claude-direct-'));
    roots.add(root);
    const checkout = path.join(root, 'checkout');
    await mkdir(checkout, { recursive: true });
    await mkdir(path.join(root, 'state'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
    await writeFile(path.join(checkout, 'review.txt'), 'before\nsame\n');
    await git(checkout, 'add', 'review.txt');
    await git(checkout, 'commit', '-qm', 'basis');
    await writeFile(path.join(checkout, 'review.txt'), 'after\nsame\n');

    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready')
      throw new Error(`Workspace runtime was rejected: ${JSON.stringify(opened.diagnostic)}`);
    const owner = opened.owner;
    owners.add(owner);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });

    const channel = new ScriptedChannel();
    const adapter = new ClaudeDirectAdapter({
      workspaceIdentity: identity.workspaceIdentity,
      canonicalCheckout: identity.canonicalCheckout,
      hostVersion: '2.1.310',
      sessionIdentity: '3f2a9c1e-5b7d-4e8a-9c21-6d0f4b8a7e13',
      sessionEpoch: 'epoch-one',
      channel,
    });
    const established = await owner.harnessAdapters.establish(adapter);
    expect(established.status).toBe('established');

    // The scripted Mod confirms each submit as the real Mod does: before any turn fact.
    channel.onSubmit = command => {
      void adapter.observe({ type: 'submit-called', dispatchId: command.dispatchId });
    };

    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'claude-direct-review-start',
      expectedStateVersion: home.stateVersion,
    });
    if (started.kind !== 'review.current-changes.started' || started.status !== 'accepted') {
      throw new Error('Review did not start');
    }
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Live Basis unavailable');

    const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 } as const;
    const body = 'Why did this line change?\n\n  Keep my spacing, café.';
    const inspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
    });
    if (inspection.status !== 'available') throw new Error(`Message unavailable: ${inspection.reason}`);
    expect(inspection.destination).toMatchObject({
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      harnessLabel: 'Claude Code',
    });

    const committed = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'claude-direct-message-commit',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body,
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(committed).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });

    const submit = channel.delivered.find(command => command.type === 'submit');
    if (submit?.type !== 'submit') throw new Error('No submit reached the Mod');
    expect(Buffer.from(submit.text, 'utf8').toString('base64')).toBe(inspection.outgoingMaterial.bytesBase64);

    await adapter.observe({ type: 'turn-start', turnId: 'turn-1', matchesPending: true });
    await adapter.observe({ type: 'submit-resolved', dispatchId: submit.dispatchId, entered: true });
    await adapter.observe({ type: 'turn-complete', turnId: 'turn-1', reason: 'answer', answer: 'Renamed it.' });

    const interaction = await owner.workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 16,
    });
    expect(interaction.handoffs).toEqual([
      expect.objectContaining({
        reviewMessageIdentity: committed.kind === 'review.message.committed' ? committed.reviewMessageIdentity : '',
      }),
    ]);
    expect(interaction.invocations).toHaveLength(1);
    expect(interaction.invocations[0]).toMatchObject({
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      status: 'ended-normally',
      missingStartEvidence: false,
      missingTerminalEvidence: false,
    });
    expect(interaction.invocations[0]?.responseIdentity).toEqual(expect.any(String));
  });
});
