import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { encodeBytesBase64 } from '../../src/bytesBase64.js';
import { resolveGitExecutable } from '../../src/gitProcess.js';
import type {
  CommittedHarnessDirective,
  HarnessAttachmentIdentity,
  HarnessDirectiveObservation,
  HarnessEvidenceAcknowledgement,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '../../src/harness-interaction/index.js';
import type { Workspace, WorkspaceIdentity } from '../../src/index.js';
import type {
  ReviewContextContributionAdded,
  ReviewContextSelectionChanged,
  ReviewIdentity,
  ReviewSnapshotContextItem,
  ReviewSnapshotIdentity,
} from '@buildframe/workspace/reviewing';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
  readonly basis: string;
  readonly compared: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
  return result.stdout.trim();
}

function encoded(value: string | Uint8Array): string {
  return encodeBytesBase64(typeof value === 'string' ? Buffer.from(value, 'utf8') : value);
}

function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture(extraContextFiles = 0): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-review-snapshot-context-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(path.join(checkout, 'ctx'), { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, 'review.txt'), 'before\n');
  await writeFile(path.join(checkout, 'ctx', 'direct.txt'), 'abcdefghij\n');
  await writeFile(path.join(checkout, 'ctx', 'excluded.txt'), 'excluded-value\n');
  await writeFile(path.join(checkout, 'ctx', 'other.txt'), '0123456789\n');
  for (let index = 0; index < extraContextFiles; index += 1) {
    await writeFile(path.join(checkout, 'ctx', `scale-${String(index).padStart(3, '0')}.txt`), `value-${index}\n`);
  }
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'basis');
  const basis = await git(checkout, 'rev-parse', 'HEAD');
  await writeFile(path.join(checkout, 'review.txt'), 'after\n');
  await git(checkout, 'commit', '-qam', 'compared');
  const compared = await git(checkout, 'rev-parse', 'HEAD');
  return { root, checkout, state, basis, compared };
}

function requireSelection(result: Awaited<ReturnType<Workspace['execute']>>): ReviewContextSelectionChanged {
  if (result.kind !== 'review.context-selection.changed') {
    throw new Error(`Selection did not change: ${JSON.stringify(result)}`);
  }
  return result;
}

function requireContribution(result: Awaited<ReturnType<Workspace['execute']>>): ReviewContextContributionAdded {
  if (result.kind !== 'review.context-contribution.added') {
    throw new Error(`Contribution was not admitted: ${JSON.stringify(result)}`);
  }
  return result;
}

function capabilityManifest(): ReviewedCapabilityManifest {
  return {
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: 'snapshot-context-scripted-adapter',
    adapterDisplayName: 'Snapshot Context Harness',
    reviewedHostVersions: ['1.0.0'],
    capabilities: [
      {
        contractVersion: 1,
        capabilityIdentity: 'direct-question-review-v1',
        handoffKind: 'submit-review-batch',
        route: 'direct',
        authority: 'discussion-only',
        effectConstraint: {
          strength: 'enforced',
          scope: 'workspace-read-only',
          limitation: 'Scripted test adapter.',
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
          contractIdentity: 'pi-settled-final-assistant-review-response-v1',
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
}

class ScriptedAdapter implements ReviewedHarnessAdapter {
  readonly manifest = capabilityManifest();
  readonly attachment: ReviewedHarnessAttachment;
  readonly directives: CommittedHarnessDirective[] = [];
  sink: HarnessEvidenceSink | undefined;

  constructor(workspaceIdentity: WorkspaceIdentity, canonicalCheckout: string) {
    this.attachment = {
      evidenceIdentity: 'snapshot-context-attachment-evidence',
      attachmentIdentity: `att_${digest('snapshot-context-attachment')}` as HarnessAttachmentIdentity,
      workspaceIdentity,
      hostVersion: '1.0.0',
      destination: {
        harnessLabel: this.manifest.adapterDisplayName,
        sessionLabel: 'scripted snapshot context session',
        repositoryLabel: 'snapshot context fixture',
        canonicalCheckout,
      },
      availability: { status: 'available' },
    };
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.sink = sink;
    return {
      perform: async (directive: CommittedHarnessDirective): Promise<HarnessDirectiveObservation> => {
        this.directives.push(directive);
        return { status: 'accepted-for-observation' };
      },
    };
  }

  async emit(evidence: NormalizedHarnessEvidence): Promise<HarnessEvidenceAcknowledgement> {
    if (this.sink === undefined) throw new Error('Scripted Adapter was not established');
    return await this.sink.accept(evidence);
  }
}

describe('Snapshot-owned Review supporting context', () => {
  const roots = new Set<string>();
  const owners = new Set<WorkspaceRuntimeOwner>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function open(created: Fixture): Promise<WorkspaceRuntimeOwner> {
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    const opened = await openWorkspaceRuntimeOwner({ startPath: created.checkout });
    expect(opened.status).toBe('ready');
    if (opened.status !== 'ready') throw new Error(opened.diagnostic.code);
    owners.add(opened.owner);
    return opened.owner;
  }

  async function start(
    owner: WorkspaceRuntimeOwner,
    created: Fixture,
    commandIdentity: string,
  ): Promise<{
    readonly reviewIdentity: ReviewIdentity;
    readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
    readonly stateVersion: number;
  }> {
    const selection = {
      kind: 'revision-pair',
      basis: { kind: 'object', objectKind: 'commit', objectIdentity: created.basis },
      compared: { kind: 'object', objectKind: 'commit', objectIdentity: created.compared },
    } as const;
    const preview = await owner.workspace.read({ kind: 'review.comparison-preview', selection });
    if (preview.status !== 'available' || preview.comparisonResolutionIdentity === undefined) {
      throw new Error('Exact comparison preview unavailable');
    }
    const started = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity,
      expectedStateVersion: preview.stateVersion,
      selection: preview.selection,
      expectedBasisObjectIdentity: preview.basisEndpointIdentity,
      expectedComparedObjectIdentity: preview.comparedEndpointIdentity,
      expectedComparisonResolutionIdentity: preview.comparisonResolutionIdentity,
    });
    if (started.kind !== 'review.comparison.started') {
      throw new Error(`Review did not start: ${JSON.stringify(started)}`);
    }
    return started;
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('freezes effective locator and immutable contribution occurrences in one exact successor', async () => {
    const created = await fixture();
    let owner = await open(created);
    const started = await start(owner, created, 'snapshot-context-start');

    const historicalEmpty = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(historicalEmpty).toMatchObject({
      status: 'available',
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      basis: { status: 'empty', selectionRevision: 0, rules: [] },
      manifest: { totalItems: 0, identity: null, items: [], nextOffset: null },
    });

    const firstRange = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-range-one',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'directory',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx'),
          },
          scope: { kind: 'bytes', offset: 0, length: 4 },
        },
      }),
    );
    const secondRange = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-range-two',
        expectedStateVersion: firstRange.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: firstRange.selectionRevision,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'directory',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx'),
          },
          scope: { kind: 'bytes', offset: 4, length: 4 },
        },
      }),
    );
    const excluded = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-exclude',
        expectedStateVersion: secondRange.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: secondRange.selectionRevision,
        change: {
          action: 'exclude',
          target: {
            kind: 'workspace',
            form: 'file',
            pathBytesBase64: encoded('ctx/excluded.txt'),
          },
        },
      }),
    );
    const direct = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-direct',
        expectedStateVersion: excluded.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: excluded.selectionRevision,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx/direct.txt'),
          },
          scope: { kind: 'bytes', offset: 8, length: 2 },
        },
      }),
    );
    const editorBytes = Buffer.from('UNSAVED-context');
    const contributed = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'snapshot-context-contribution',
        expectedStateVersion: direct.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: direct.selectionRevision,
        contribution: {
          kind: 'editor',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx/direct.txt'),
          },
          scope: { kind: 'whole' },
          editor: {
            editorInstanceIdentity: 'snapshot-context-editor',
            bufferIdentity: 'snapshot-context-buffer',
            bufferVersion: 9,
            savedState: 'unsaved',
          },
          content: {
            status: 'available',
            bytesBase64: encoded(editorBytes),
            byteLength: editorBytes.byteLength,
            sha256: digest(editorBytes),
          },
        },
      }),
    );

    const refreshed = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'freeze-snapshot-context',
      expectedStateVersion: contributed.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    expect(refreshed).toMatchObject({
      kind: 'review.change-set.refreshed',
      status: 'accepted',
      outcome: 'changed',
      previousReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    if (refreshed.kind !== 'review.change-set.refreshed') throw new Error('Context refresh failed');

    const frozen = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(frozen.status).toBe('available');
    if (frozen.status !== 'available' || frozen.basis.status !== 'frozen') {
      throw new Error('Frozen context unavailable');
    }
    expect(frozen.basis.context).toMatchObject({
      selectionRevision: 5,
      defaultIgnoredUntracked: 'excluded',
      totals: {
        availableItems: 3,
        unavailableItems: 0,
        excludedItems: 1,
        sensitiveItems: 1,
        contentSegments: 3,
        contentBytes: 8 + 10 + editorBytes.byteLength,
      },
    });
    expect(frozen.basis.context.sourceGroups).toEqual([
      expect.objectContaining({ kind: 'locator', order: 0, origin: 0 }),
      expect.objectContaining({ kind: 'locator', order: 1, origin: 1 }),
      expect.objectContaining({ kind: 'locator', order: 3, origin: 2, ruleIdentity: direct.ruleIdentity }),
      expect.objectContaining({
        kind: 'contribution',
        order: 4,
        contributionIdentity: contributed.contributionIdentity,
      }),
    ]);
    expect(frozen.basis.context.conflicts).toHaveLength(1);
    expect(frozen.manifest.items).toHaveLength(4);

    const locator = (path_: string): Extract<ReviewSnapshotContextItem, { readonly kind: 'locator' }> => {
      const item = frozen.manifest.items.find(
        candidate => candidate.kind === 'locator' && candidate.source.pathBytesBase64 === encoded(path_),
      );
      if (item?.kind !== 'locator') throw new Error(`Missing locator ${path_}`);
      return item;
    };
    expect(locator('ctx/excluded.txt')).toMatchObject({
      source: { status: 'excluded', sourceKind: 'regular' },
      decision: { status: 'excluded', decidingRuleIdentity: excluded.ruleIdentity },
      scope: { kind: 'bytes', intervals: [{ kind: 'bytes', offset: 0, length: 8 }] },
      contents: [],
    });
    expect(locator('ctx/direct.txt')).toMatchObject({
      decision: { status: 'included', decidingRuleIdentity: direct.ruleIdentity },
      scope: { kind: 'bytes', intervals: [{ kind: 'bytes', offset: 0, length: 10 }] },
      source: { status: 'captured', byteLength: 10 },
    });

    const availableItems = frozen.manifest.items.filter(item => item.contents.length > 0);
    const exact = new Map<string, string>();
    for (const item of availableItems) {
      const reference = item.contents[0]!;
      const content = await owner.workspace.read({
        kind: 'review.snapshot-context-content',
        reviewIdentity: started.reviewIdentity,
        reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
        contentIdentity: reference.contentIdentity,
        offset: 0,
        length: 256 * 1024,
      });
      if (content.status !== 'available') throw new Error('Frozen bytes unavailable');
      exact.set(
        item.kind === 'locator'
          ? Buffer.from(item.source.pathBytesBase64!, 'base64').toString('utf8')
          : item.contribution.contributionIdentity,
        Buffer.from(content.window.bytesBase64, 'base64').toString('utf8'),
      );
    }
    expect(exact.get('ctx/direct.txt')).toBe('abcdefghij');
    expect(exact.get('ctx/other.txt')).toBe('01234567');
    expect(exact.get(contributed.contributionIdentity)).toBe('UNSAVED-context');

    await writeFile(path.join(created.checkout, 'ctx', 'direct.txt'), 'MUTATED-LIVE-CONTEXT\n');
    const removed = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'remove-snapshot-context-contribution',
        expectedStateVersion: refreshed.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 5,
        change: { action: 'remove', ruleIdentity: contributed.ruleIdentity },
      }),
    );
    expect(removed.selectionRevision).toBe(6);

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const restarted = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(restarted).toEqual({ ...frozen, stateVersion: removed.stateVersion });
    const frozenDirect = locator('ctx/direct.txt').contents[0]!;
    const restartedContent = await owner.workspace.read({
      kind: 'review.snapshot-context-content',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
      contentIdentity: frozenDirect.contentIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(restartedContent).toMatchObject({ status: 'available' });
    if (restartedContent.status === 'available') {
      expect(Buffer.from(restartedContent.window.bytesBase64, 'base64').toString('utf8')).toBe('abcdefghij');
    }
  });

  it('keeps manifest and content reads bounded across multiple windows', async () => {
    const created = await fixture(70);
    const large = Buffer.alloc(600 * 1024, 0x78);
    await writeFile(path.join(created.checkout, 'ctx', 'large.txt'), large);
    const owner = await open(created);
    const started = await start(owner, created, 'snapshot-context-scale-start');
    const selected = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-scale-select',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'directory',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx'),
          },
        },
      }),
    );
    const refreshed = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'snapshot-context-scale-freeze',
      expectedStateVersion: selected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    if (refreshed.kind !== 'review.change-set.refreshed') throw new Error('Scale context refresh failed');

    const first = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    const second = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
      offset: 64,
      limit: 64,
    });
    if (first.status !== 'available' || second.status !== 'available') throw new Error('Scale manifest unavailable');
    expect(first.manifest.items).toHaveLength(64);
    expect(first.manifest.nextOffset).toBe(64);
    expect(second.manifest.items).toHaveLength(10);
    expect(second.manifest.nextOffset).toBeNull();
    const largeItem = [...first.manifest.items, ...second.manifest.items].find(
      item => item.kind === 'locator' && item.source.pathBytesBase64 === encoded('ctx/large.txt'),
    );
    if (largeItem?.kind !== 'locator') throw new Error('Large context occurrence missing');
    expect(largeItem.contents[0]).toMatchObject({ byteLength: large.byteLength, sha256: digest(large) });
    const chunks: Buffer[] = [];
    for (const offset of [0, 256 * 1024, 512 * 1024]) {
      const view = await owner.workspace.read({
        kind: 'review.snapshot-context-content',
        reviewIdentity: started.reviewIdentity,
        reviewSnapshotIdentity: refreshed.reviewSnapshotIdentity,
        contentIdentity: largeItem.contents[0]!.contentIdentity,
        offset,
        length: 256 * 1024,
      });
      if (view.status !== 'available') throw new Error('Large context window unavailable');
      chunks.push(Buffer.from(view.window.bytesBase64, 'base64'));
    }
    expect(Buffer.concat(chunks)).toEqual(large);
  });

  it('reuses the latest Snapshot while both Change Set and context stay exactly unchanged', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = await start(owner, created, 'snapshot-context-reuse-start');
    const selected = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-reuse-select',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx/direct.txt'),
          },
        },
      }),
    );
    const frozen = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'snapshot-context-reuse-freeze',
      expectedStateVersion: selected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    if (frozen.kind !== 'review.change-set.refreshed' || frozen.outcome !== 'changed') {
      throw new Error('Context was not frozen');
    }
    const reuseCommand = {
      kind: 'review.change-set.refresh',
      commandIdentity: 'snapshot-context-reuse-again',
      expectedStateVersion: frozen.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
    } as const;
    const reused = await owner.workspace.execute(reuseCommand);
    expect(reused).toMatchObject({
      kind: 'review.change-set.refreshed',
      outcome: 'unchanged',
      stateVersion: frozen.stateVersion,
      reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
    });
    await expect(owner.workspace.execute(reuseCommand)).resolves.toEqual(reused);
    const context = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: frozen.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(context).toMatchObject({
      status: 'available',
      manifest: { totalItems: 1 },
    });
  });

  it('keeps the atomic Ask open for empty context and fails closed once context is frozen', async () => {
    const created = await fixture();
    const owner = await open(created);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    const established = await owner.harnessAdapters.establish(adapter);
    expect(established.status).toBe('established');
    const started = await start(owner, created, 'snapshot-context-ask-start');
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
      throw new Error('Ask manifest unavailable');
    }
    const fileIdentity = manifest.manifest.files[0].fileIdentity;

    const openInspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    if (openInspection.status !== 'available') throw new Error('Empty-context inspection unavailable');
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'snapshot-context-ask-empty',
      expectedStateVersion: openInspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Empty-context Question.',
      attachmentIdentity: openInspection.destination.attachmentIdentity,
      inspectionIdentity: openInspection.inspectionIdentity,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Empty-context Ask failed');
    expect(adapter.directives).toHaveLength(1);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'snapshot-context-ask-start-evidence',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    const settled = await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'snapshot-context-ask-terminal-evidence',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      outcome: 'ended-normally',
    });
    if (settled.status !== 'applied') throw new Error('Invocation evidence was not settled');

    const selected = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-ask-select',
        expectedStateVersion: settled.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        change: {
          action: 'include',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ordinary',
            pathBytesBase64: encoded('ctx/direct.txt'),
          },
        },
      }),
    );
    const frozen = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'snapshot-context-ask-freeze',
      expectedStateVersion: selected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    if (frozen.kind !== 'review.change-set.refreshed') throw new Error('Context was not frozen');

    const blockedInspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: started.reviewIdentity,
    });
    expect(blockedInspection).toMatchObject({
      status: 'unavailable',
      reason: 'snapshot-context-disclosure-unavailable',
      blockerIdentities: [expect.stringMatching(/^rsc_[0-9a-f]{64}$/u)],
    });
    const blocked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'snapshot-context-ask-blocked',
      expectedStateVersion: frozen.stateVersion,
      reviewIdentity: started.reviewIdentity,
      anchor: { kind: 'review.diff-line', fileIdentity, side: 'new', line: 1 },
      body: 'Blocked Question.',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      inspectionIdentity: 'f'.repeat(64),
    });
    expect(blocked).toMatchObject({
      kind: 'harness.command.rejected',
      reason: 'snapshot-context-disclosure-unavailable',
    });
    expect(adapter.directives).toHaveLength(1);

    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Message Bases unavailable');
    const live = bases.bases.items.find(item => item.kind === 'live');
    if (live === undefined) throw new Error('Message Live Basis unavailable');
    const messageBody = 'Review the current line without disclosing frozen supporting context.';
    const location = { pathBytesBase64: encoded('review.txt'), line: 1 } as const;
    const messageInspection = await owner.workspace.read({
      kind: 'harness.review-message.inspect-default',
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body: messageBody,
    });
    expect(messageInspection).toMatchObject({
      status: 'available',
      outgoingMaterial: { representation: 'live-repository-reference' },
    });
    if (messageInspection.status !== 'available') throw new Error('Review Message unavailable');
    const message = await owner.workspace.execute({
      kind: 'review.message.commit',
      commandIdentity: 'snapshot-context-message-allowed',
      expectedStateVersion: messageInspection.stateVersion,
      reviewIdentity: started.reviewIdentity,
      originReviewBasisIdentity: live.reviewBasisIdentity,
      location,
      body: messageBody,
      attachmentIdentity: messageInspection.destination.attachmentIdentity,
      inspectionIdentity: messageInspection.inspectionIdentity,
      acceptedAcknowledgementRequirementIdentities: messageInspection.commitment.requirements.map(
        requirement => requirement.requirementIdentity,
      ),
    });
    expect(message).toMatchObject({ kind: 'review.message.committed', status: 'accepted' });
    expect(adapter.directives).toHaveLength(2);
    const messageDirective = adapter.directives[1];
    if (messageDirective?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Review Message directive unavailable');
    }
    expect(Buffer.from(messageDirective.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      `${messageBody}\n\nreview.txt:1`,
    );
  });

  it('fails closed with no successor when context expansion is incomplete', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = await start(owner, created, 'snapshot-context-incomplete-start');
    const selected = requireSelection(
      await owner.workspace.execute({
        kind: 'review.context-selection.change',
        commandIdentity: 'snapshot-context-incomplete-select',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        change: {
          action: 'include',
          source: {
            kind: 'outside-checkout',
            form: 'directory',
            absolutePath: path.join(created.root, 'missing-outside-directory'),
          },
        },
      }),
    );
    const rejected = await owner.workspace.execute({
      kind: 'review.change-set.refresh',
      commandIdentity: 'snapshot-context-incomplete-refresh',
      expectedStateVersion: selected.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedReviewSnapshotIdentity: started.reviewSnapshotIdentity,
    });
    expect(rejected).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'snapshot-unverified',
      stateVersion: selected.stateVersion,
    });
    const versions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versions).toMatchObject({
      status: 'available',
      versions: { total: 1, items: [{ reviewSnapshotIdentity: started.reviewSnapshotIdentity }] },
    });
    const historical = await owner.workspace.read({
      kind: 'review.snapshot-context',
      reviewIdentity: started.reviewIdentity,
      reviewSnapshotIdentity: started.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(historical).toMatchObject({
      status: 'available',
      basis: { status: 'empty' },
      manifest: { totalItems: 0 },
    });
  });
});
