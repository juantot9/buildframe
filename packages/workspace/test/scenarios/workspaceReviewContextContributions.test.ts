import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
  openAuthoritativeState,
  type AuthoritativeState,
  type StateCommitRequest,
  type StateCommitResult,
  type StateContentReadRequest,
  type StateContentReadResult,
  type StateReadRequest,
  type StateReadResult,
  type StateStatus,
} from '../../src/authoritativeState.js';
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
  ReviewContextContributionIdentity,
  ReviewIdentity,
  ReviewSnapshotIdentity,
} from '@buildframe/workspace/reviewing';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';
import { openRuntimeWorkspace } from '../../src/workspace.js';

const execFileAsync = promisify(execFile);
const CONTRIBUTION_LIMIT = 512 * 1024;

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

function digest(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function encoded(value: string | Uint8Array): string {
  return encodeBytesBase64(typeof value === 'string' ? Buffer.from(value, 'utf8') : value);
}

async function fixture(after = 'after\n'): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-review-context-contribution-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, '.gitignore'), 'ignored-context.txt\n');
  await writeFile(path.join(checkout, 'review.txt'), 'before\n');
  await writeFile(path.join(checkout, 'context.txt'), 'disk context\n');
  await git(checkout, 'add', '.gitignore', 'review.txt', 'context.txt');
  await git(checkout, 'commit', '-qm', 'basis');
  await writeFile(path.join(checkout, 'review.txt'), after);
  await writeFile(path.join(checkout, 'added.txt'), 'added\n');
  await writeFile(path.join(checkout, 'ignored-context.txt'), 'ignored\n');
  return { root, checkout, state };
}

function requireStarted(result: Awaited<ReturnType<Workspace['execute']>>): {
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly stateVersion: number;
} {
  if (result.kind !== 'review.current-changes.started') {
    throw new Error(`Review did not start: ${JSON.stringify(result)}`);
  }
  expect(result.kind).toBe('review.current-changes.started');
  return result;
}

function requireContribution(result: Awaited<ReturnType<Workspace['execute']>>): ReviewContextContributionAdded {
  expect(result.kind).toBe('review.context-contribution.added');
  if (result.kind !== 'review.context-contribution.added') {
    throw new Error(`Context contribution was not added: ${result.kind}`);
  }
  return result;
}

function capabilityManifest(): ReviewedCapabilityManifest {
  return {
    schema: 'neoflow.harness-capabilities/1',
    adapterImplementationIdentity: 'context-contribution-scripted-adapter',
    adapterDisplayName: 'Context Contribution Harness',
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

class ArtifactReadFaultState implements AuthoritativeState {
  mode: 'none' | 'wrong-owner' | 'wrong-kind' | 'quarantined' = 'none';
  sourceRecordIdentity: string | undefined;
  sourceWorkflowIdentity: string | undefined;

  constructor(readonly delegate: AuthoritativeState) {}

  async commit(request: StateCommitRequest): Promise<StateCommitResult> {
    return await this.delegate.commit(request);
  }

  async read(request: StateReadRequest): Promise<StateReadResult> {
    const result = await this.delegate.read(request);
    if (this.sourceRecordIdentity === undefined || !request.recordIdentities.includes(this.sourceRecordIdentity)) {
      return result;
    }
    if (this.mode === 'wrong-owner' || this.mode === 'wrong-kind') {
      return {
        ...result,
        records: result.records.map(record => {
          if (record === undefined || record.recordIdentity !== this.sourceRecordIdentity) return record;
          return this.mode === 'wrong-owner'
            ? { ...record, workflowIdentity: 'wrong-workflow-owner' }
            : { ...record, kind: 'review.question' };
        }),
      };
    }
    if (this.mode === 'quarantined') {
      return {
        ...result,
        quarantineReports: [
          {
            recordIdentity: this.sourceRecordIdentity,
            workflowIdentity: this.sourceWorkflowIdentity ?? 'unknown-workflow',
            reason: 'record-checksum-mismatch',
            expectedChecksum: '1'.repeat(64),
            observedChecksum: '2'.repeat(64),
          },
        ],
      };
    }
    return result;
  }

  async readContent(request: StateContentReadRequest): Promise<StateContentReadResult> {
    return await this.delegate.readContent(request);
  }

  async status(): Promise<StateStatus> {
    return await this.delegate.status();
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }
}

class ScriptedAdapter implements ReviewedHarnessAdapter {
  readonly manifest = capabilityManifest();
  readonly attachment: ReviewedHarnessAttachment;
  readonly directives: CommittedHarnessDirective[] = [];
  sink: HarnessEvidenceSink | undefined;

  constructor(workspaceIdentity: WorkspaceIdentity, canonicalCheckout: string) {
    this.attachment = {
      evidenceIdentity: 'context-contribution-attachment-evidence',
      attachmentIdentity: `att_${digest('context-contribution-attachment')}` as HarnessAttachmentIdentity,
      workspaceIdentity,
      hostVersion: '1.0.0',
      destination: {
        harnessLabel: this.manifest.adapterDisplayName,
        sessionLabel: 'scripted context session',
        repositoryLabel: 'context contribution fixture',
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

describe('immutable Review context contributions', () => {
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

  async function establish(owner: WorkspaceRuntimeOwner): Promise<ScriptedAdapter> {
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    const result = await owner.harnessAdapters.establish(adapter);
    expect(result.status).toBe('established');
    if (result.status !== 'established') throw new Error(result.reason);
    return adapter;
  }

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('keeps equal saved-disk and unsaved Editor occurrences distinct through removal and restart', async () => {
    const created = await fixture();
    let owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-editor-contribution-review',
        expectedStateVersion: 0,
      }),
    );
    const locator = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'include-context-disk-occurrence',
      expectedStateVersion: started.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedSelectionRevision: 0,
      change: {
        action: 'include',
        source: {
          kind: 'workspace',
          form: 'file',
          inclusion: 'ordinary',
          pathBytesBase64: encoded('context.txt'),
        },
      },
    });
    expect(locator.kind).toBe('review.context-selection.changed');
    if (locator.kind !== 'review.context-selection.changed') throw new Error('Context locator was not included');

    const exactBytes = Buffer.from('disk context\n');
    const editorCommand = {
      kind: 'review.context-contribution.add',
      commandIdentity: 'add-unsaved-equal-editor-occurrence',
      expectedStateVersion: locator.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedSelectionRevision: locator.selectionRevision,
      contribution: {
        kind: 'editor',
        source: {
          kind: 'workspace',
          form: 'file',
          inclusion: 'ordinary',
          pathBytesBase64: encoded('context.txt'),
        },
        scope: { kind: 'whole' },
        editor: {
          editorInstanceIdentity: 'editor-instance-one',
          bufferIdentity: 'buffer-context-txt',
          bufferVersion: 17,
          savedState: 'unsaved',
        },
        content: {
          status: 'available',
          bytesBase64: encoded(exactBytes),
          byteLength: exactBytes.byteLength,
          sha256: digest(exactBytes),
        },
      },
    } as const;
    const contributed = requireContribution(await owner.workspace.execute(editorCommand));
    expect(contributed).toMatchObject({ contributionKind: 'editor', selectionRevision: 2 });
    expect(await owner.workspace.execute(editorCommand)).toEqual(contributed);
    const conflict = await owner.workspace.execute({
      ...editorCommand,
      contribution: { ...editorCommand.contribution, classification: 'generated' },
    });
    expect(conflict).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'command-identity-conflict',
      stateVersion: contributed.stateVersion,
    });

    const selection = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(selection.status).toBe('available');
    if (selection.status !== 'available') throw new Error('Selection unavailable');
    expect(selection.sourceGroups).toEqual([
      expect.objectContaining({ kind: 'locator', order: 0, origin: 0, ruleIdentity: locator.ruleIdentity }),
      {
        kind: 'contribution',
        order: 1,
        ruleIdentity: contributed.ruleIdentity,
        contributionIdentity: contributed.contributionIdentity,
      },
    ]);
    expect(selection.contributions).toEqual([
      expect.objectContaining({
        order: 1,
        ruleIdentity: contributed.ruleIdentity,
        contribution: expect.objectContaining({
          contributionIdentity: contributed.contributionIdentity,
          kind: 'editor',
          editor: expect.objectContaining({
            bufferVersion: 17,
            savedState: 'unsaved',
            attestation: 'unattested-editor-command',
          }),
          content: {
            status: 'available',
            byteLength: exactBytes.byteLength,
            sha256: digest(exactBytes),
          },
          sensitivity: { sensitive: true, reasons: ['unsaved-editor'] },
        }),
      }),
    ]);
    expect(selection.conflicts).toEqual([
      {
        kind: 'saved-versus-unsaved',
        nominalSource: { kind: 'workspace', pathBytesBase64: encoded('context.txt') },
        liveOccurrence: { kind: 'context-locator', origins: [0] },
        immutableOccurrence: {
          kind: 'editor-context-contribution',
          occurrenceIdentity: contributed.contributionIdentity,
          ruleIdentity: contributed.ruleIdentity,
          sourceGroupOrder: 1,
          scope: { kind: 'whole' },
        },
        resolution: 'keep-distinct',
      },
    ]);

    let content = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: contributed.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(content.status).toBe('available');
    if (content.status !== 'available') throw new Error('Contribution content unavailable');
    expect(Buffer.from(content.window.bytesBase64, 'base64')).toEqual(exactBytes);

    await writeFile(path.join(created.checkout, 'context.txt'), 'new disk bytes\n');
    content = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: contributed.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(content.stateVersion).toBe(contributed.stateVersion);
    expect(content.status === 'available' ? Buffer.from(content.window.bytesBase64, 'base64') : undefined).toEqual(
      exactBytes,
    );

    const removed = await owner.workspace.execute({
      kind: 'review.context-selection.change',
      commandIdentity: 'remove-unsaved-editor-occurrence',
      expectedStateVersion: contributed.stateVersion,
      reviewIdentity: started.reviewIdentity,
      expectedSelectionRevision: contributed.selectionRevision,
      change: { action: 'remove', ruleIdentity: contributed.ruleIdentity },
    });
    expect(removed).toMatchObject({ kind: 'review.context-selection.changed', action: 'removed' });
    if (removed.kind !== 'review.context-selection.changed') throw new Error('Contribution rule was not removed');
    const afterRemoval = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(afterRemoval).toMatchObject({ status: 'available', contributions: [], conflicts: [] });
    const retained = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: contributed.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(retained.status === 'available' ? Buffer.from(retained.window.bytesBase64, 'base64') : undefined).toEqual(
      exactBytes,
    );

    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const reconstructed = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: contributed.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(reconstructed).toMatchObject({
      status: 'available',
      stateVersion: removed.stateVersion,
      contribution: { contributionIdentity: contributed.contributionIdentity },
    });
    expect(
      reconstructed.status === 'available' ? Buffer.from(reconstructed.window.bytesBase64, 'base64') : undefined,
    ).toEqual(exactBytes);
  });

  it('validates exact Editor ranges and preserves unavailable, outside, ignored, and untitled provenance', async () => {
    const created = await fixture();
    const owner = await open(created);
    const started = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-editor-source-matrix-review',
        expectedStateVersion: 0,
      }),
    );
    const selectedBytes = Buffer.from([0, 1, 2, 255]);
    await expect(
      owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'reject-editor-digest-mismatch',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'editor',
          source: { kind: 'editor-buffer', sourceIdentity: 'untitled-invalid' },
          scope: { kind: 'bytes', offset: 2, length: selectedBytes.byteLength },
          editor: {
            editorInstanceIdentity: 'editor-two',
            bufferIdentity: 'buffer-invalid',
            bufferVersion: 1,
            savedState: 'saved',
          },
          content: {
            status: 'available',
            bytesBase64: encoded(selectedBytes),
            byteLength: selectedBytes.byteLength,
            sha256: '0'.repeat(64),
          },
        },
      }),
    ).rejects.toThrow('Editor context bytes do not match their declared evidence');

    const outside = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-outside-binary-editor-range',
        expectedStateVersion: started.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'editor',
          source: {
            kind: 'outside-checkout',
            form: 'file',
            absolutePath: path.join(created.root, 'outside.bin'),
          },
          scope: { kind: 'bytes', offset: 9, length: selectedBytes.byteLength },
          editor: {
            editorInstanceIdentity: 'editor-two',
            bufferIdentity: 'outside-buffer',
            bufferVersion: 2,
            savedState: 'saved',
          },
          content: {
            status: 'available',
            bytesBase64: encoded(selectedBytes),
            byteLength: selectedBytes.byteLength,
            sha256: digest(selectedBytes),
          },
          classification: 'binary',
        },
      }),
    );
    const ignoredUnavailable = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-ignored-unavailable-editor',
        expectedStateVersion: outside.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: outside.selectionRevision,
        contribution: {
          kind: 'editor',
          source: {
            kind: 'workspace',
            form: 'file',
            inclusion: 'ignored-explicit',
            pathBytesBase64: encoded('ignored-context.txt'),
          },
          scope: { kind: 'whole' },
          editor: {
            editorInstanceIdentity: 'editor-two',
            bufferIdentity: 'ignored-buffer',
            bufferVersion: 3,
            savedState: 'unsaved',
          },
          content: {
            status: 'unavailable',
            reason: 'native-representation-unavailable',
            observedByteLength: 8,
          },
        },
      }),
    );
    const untitledLimit = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-untitled-over-limit-editor',
        expectedStateVersion: ignoredUnavailable.stateVersion,
        reviewIdentity: started.reviewIdentity,
        expectedSelectionRevision: ignoredUnavailable.selectionRevision,
        contribution: {
          kind: 'editor',
          source: { kind: 'editor-buffer', sourceIdentity: 'untitled://large-draft' },
          scope: { kind: 'whole' },
          editor: {
            editorInstanceIdentity: 'editor-two',
            bufferIdentity: 'untitled-buffer',
            bufferVersion: 4,
            savedState: 'unsaved',
          },
          content: {
            status: 'unavailable',
            reason: 'contribution-limit',
            observedByteLength: CONTRIBUTION_LIMIT + 1,
          },
        },
      }),
    );

    const view = await owner.workspace.read({
      kind: 'review.context-selection',
      reviewIdentity: started.reviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(view.status).toBe('available');
    if (view.status !== 'available') throw new Error('Contribution selection unavailable');
    expect(view.manifest.totalCandidates).toBe(0);
    expect(view.conflicts).toEqual([]);
    expect(view.contributions.map(item => item.contribution.sensitivity)).toEqual([
      { sensitive: true, reasons: ['outside-checkout'] },
      { sensitive: true, reasons: ['unsaved-editor', 'ignored-untracked'] },
      { sensitive: true, reasons: ['unsaved-editor'] },
    ]);
    expect(view.contributions[0]).toMatchObject({
      contribution: {
        contributionIdentity: outside.contributionIdentity,
        scope: { kind: 'bytes', offset: 9, length: 4 },
        classification: 'binary',
      },
    });

    const unavailable = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: ignoredUnavailable.contributionIdentity,
      offset: 0,
      length: 1,
    });
    expect(unavailable).toMatchObject({
      status: 'unavailable',
      reason: 'native-representation-unavailable',
      contribution: {
        content: { status: 'unavailable', observedByteLength: 8 },
      },
    });
    const overLimit = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: started.reviewIdentity,
      contributionIdentity: untitledLimit.contributionIdentity,
      offset: 0,
      length: 1,
    });
    expect(overLimit).toMatchObject({ status: 'unavailable', reason: 'contribution-limit' });
  });

  it('copies exact prior Review Snapshot ranges and rejects missing, cyclic, and invalid scopes', async () => {
    const created = await fixture();
    let owner = await open(created);
    const first = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-artifact-source-review',
        expectedStateVersion: 0,
      }),
    );
    const firstManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: first.reviewIdentity,
      reviewSnapshotIdentity: first.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    expect(firstManifest.status).toBe('available');
    if (firstManifest.status !== 'available') throw new Error('First Snapshot unavailable');
    const reviewFile = firstManifest.manifest.files.find(file => file.newSide?.path === 'review.txt');
    const addedFile = firstManifest.manifest.files.find(file => file.newSide?.path === 'added.txt');
    if (reviewFile === undefined || addedFile === undefined) throw new Error('Artifact fixture files unavailable');

    const second = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-artifact-target-review',
        expectedStateVersion: first.stateVersion,
      }),
    );
    const selected = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-prior-snapshot-range',
        expectedStateVersion: second.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'artifact',
          artifact: {
            kind: 'review-snapshot-file-side',
            reviewSnapshotIdentity: first.reviewSnapshotIdentity,
            fileIdentity: reviewFile.fileIdentity,
            side: 'new',
          },
          scope: { kind: 'bytes', offset: 1, length: 3 },
        },
      }),
    );
    const content = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: selected.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(content.status).toBe('available');
    if (content.status !== 'available') throw new Error('Artifact range unavailable');
    expect(Buffer.from(content.window.bytesBase64, 'base64').toString('utf8')).toBe('fte');
    expect(content.contribution).toMatchObject({
      kind: 'artifact',
      artifact: {
        kind: 'review-snapshot-file-side',
        artifactIdentity: first.reviewSnapshotIdentity,
        sourceReviewIdentity: first.reviewIdentity,
        fileIdentity: reviewFile.fileIdentity,
        side: 'new',
        path: { bytesBase64: encoded('review.txt'), display: 'review.txt' },
        sourceByteLength: Buffer.byteLength('after\n'),
        sourceContentAvailability: 'captured',
      },
      content: { status: 'available', byteLength: 3, sha256: digest('fte') },
      sensitivity: { sensitive: false, reasons: [] },
    });

    const absentSide = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-prior-snapshot-absent-side',
        expectedStateVersion: selected.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: selected.selectionRevision,
        contribution: {
          kind: 'artifact',
          artifact: {
            kind: 'review-snapshot-file-side',
            reviewSnapshotIdentity: first.reviewSnapshotIdentity,
            fileIdentity: addedFile.fileIdentity,
            side: 'old',
          },
          scope: { kind: 'whole' },
        },
      }),
    );
    const absent = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: absentSide.contributionIdentity,
      offset: 0,
      length: 1,
    });
    expect(absent).toMatchObject({ status: 'unavailable', reason: 'artifact-side-absent' });

    const cycle = await owner.workspace.execute({
      kind: 'review.context-contribution.add',
      commandIdentity: 'reject-same-review-artifact-cycle',
      expectedStateVersion: absentSide.stateVersion,
      reviewIdentity: second.reviewIdentity,
      expectedSelectionRevision: absentSide.selectionRevision,
      contribution: {
        kind: 'artifact',
        artifact: {
          kind: 'review-snapshot-file-side',
          reviewSnapshotIdentity: second.reviewSnapshotIdentity,
          fileIdentity: reviewFile.fileIdentity,
          side: 'new',
        },
        scope: { kind: 'whole' },
      },
    });
    expect(cycle).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-artifact-cycle',
      stateVersion: absentSide.stateVersion,
    });
    const missing = await owner.workspace.execute({
      kind: 'review.context-contribution.add',
      commandIdentity: 'reject-missing-artifact',
      expectedStateVersion: absentSide.stateVersion,
      reviewIdentity: second.reviewIdentity,
      expectedSelectionRevision: absentSide.selectionRevision,
      contribution: {
        kind: 'artifact',
        artifact: {
          kind: 'review-snapshot-file-side',
          reviewSnapshotIdentity: `rsn_${'0'.repeat(64)}` as ReviewSnapshotIdentity,
          fileIdentity: reviewFile.fileIdentity,
          side: 'new',
        },
        scope: { kind: 'whole' },
      },
    });
    expect(missing).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-artifact-not-found',
      stateVersion: absentSide.stateVersion,
    });
    const invalidRange = await owner.workspace.execute({
      kind: 'review.context-contribution.add',
      commandIdentity: 'reject-artifact-range-outside-source',
      expectedStateVersion: absentSide.stateVersion,
      reviewIdentity: second.reviewIdentity,
      expectedSelectionRevision: absentSide.selectionRevision,
      contribution: {
        kind: 'artifact',
        artifact: {
          kind: 'review-snapshot-file-side',
          reviewSnapshotIdentity: first.reviewSnapshotIdentity,
          fileIdentity: reviewFile.fileIdentity,
          side: 'new',
        },
        scope: { kind: 'bytes', offset: 99, length: 1 },
      },
    });
    expect(invalidRange).toMatchObject({
      kind: 'review.command.rejected',
      reason: 'context-artifact-range-invalid',
      stateVersion: absentSide.stateVersion,
    });

    await writeFile(path.join(created.checkout, 'review.txt'), 'newer artifact source bytes\n');
    await owner.dispose();
    owners.delete(owner);
    owner = await open(created);
    const reconstructed = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: selected.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(
      reconstructed.status === 'available'
        ? Buffer.from(reconstructed.window.bytesBase64, 'base64').toString('utf8')
        : undefined,
    ).toBe('fte');
  });

  it('preserves over-limit Artifact occurrences as explicit unavailable evidence without truncation', async () => {
    const largeBytes = Buffer.alloc(CONTRIBUTION_LIMIT + 1, 0x61);
    const created = await fixture(largeBytes.toString('utf8'));
    const owner = await open(created);
    const first = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-large-artifact-source-review',
        expectedStateVersion: 0,
      }),
    );
    const firstManifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: first.reviewIdentity,
      reviewSnapshotIdentity: first.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (firstManifest.status !== 'available') throw new Error('Large Snapshot unavailable');
    const file = firstManifest.manifest.files.find(candidate => candidate.newSide?.path === 'review.txt');
    if (file === undefined) throw new Error('Large source file unavailable');
    const second = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-large-artifact-target-review',
        expectedStateVersion: first.stateVersion,
      }),
    );
    const rangeLength = 300 * 1024;
    const ranged = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-multi-window-artifact-range',
        expectedStateVersion: second.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'artifact',
          artifact: {
            kind: 'review-snapshot-file-side',
            reviewSnapshotIdentity: first.reviewSnapshotIdentity,
            fileIdentity: file.fileIdentity,
            side: 'new',
          },
          scope: { kind: 'bytes', offset: 100, length: rangeLength },
        },
      }),
    );
    const rangeTail = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: ranged.contributionIdentity,
      offset: 256 * 1024,
      length: rangeLength - 256 * 1024,
    });
    expect(rangeTail).toMatchObject({
      status: 'available',
      window: {
        offset: 256 * 1024,
        byteLength: rangeLength - 256 * 1024,
        totalByteLength: rangeLength,
        complete: true,
      },
    });
    expect(
      rangeTail.status === 'available'
        ? Buffer.from(rangeTail.window.bytesBase64, 'base64').equals(Buffer.alloc(rangeLength - 256 * 1024, 0x61))
        : false,
    ).toBe(true);

    const added = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-over-limit-artifact-whole',
        expectedStateVersion: ranged.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: ranged.selectionRevision,
        contribution: {
          kind: 'artifact',
          artifact: {
            kind: 'review-snapshot-file-side',
            reviewSnapshotIdentity: first.reviewSnapshotIdentity,
            fileIdentity: file.fileIdentity,
            side: 'new',
          },
          scope: { kind: 'whole' },
        },
      }),
    );
    const view = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: added.contributionIdentity,
      offset: 0,
      length: 1,
    });
    expect(view).toMatchObject({
      status: 'unavailable',
      reason: 'contribution-limit',
      contribution: {
        scope: { kind: 'whole' },
        content: {
          status: 'unavailable',
          reason: 'contribution-limit',
          observedByteLength: CONTRIBUTION_LIMIT + 1,
        },
      },
    });
  });

  it('fails closed for wrong-owner, wrong-kind, quarantined, and unsupported Artifact references', async () => {
    const created = await fixture();
    roots.add(created.root);
    const workspaceIdentity = 'wsp_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as WorkspaceIdentity;
    const delegate = await openAuthoritativeState({
      workspaceIdentity,
      privateStateDirectory: path.join(created.state, 'fault-state'),
    });
    const state = new ArtifactReadFaultState(delegate);
    try {
      const { workspace } = openRuntimeWorkspace(
        workspaceIdentity,
        created.checkout,
        state,
        {},
        path.join(created.checkout, '.git'),
      );
      const first = requireStarted(
        await workspace.execute({
          kind: 'review.current-changes.start',
          commandIdentity: 'start-artifact-fault-source-review',
          expectedStateVersion: 0,
        }),
      );
      const manifest = await workspace.read({
        kind: 'review.manifest',
        reviewIdentity: first.reviewIdentity,
        reviewSnapshotIdentity: first.reviewSnapshotIdentity,
        offset: 0,
        limit: 64,
      });
      if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
        throw new Error('Fault source Snapshot unavailable');
      }
      const second = requireStarted(
        await workspace.execute({
          kind: 'review.current-changes.start',
          commandIdentity: 'start-artifact-fault-target-review',
          expectedStateVersion: first.stateVersion,
        }),
      );
      const command = {
        kind: 'review.context-contribution.add' as const,
        commandIdentity: 'reject-wrong-owner-artifact',
        expectedStateVersion: second.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'artifact' as const,
          artifact: {
            kind: 'review-snapshot-file-side' as const,
            reviewSnapshotIdentity: first.reviewSnapshotIdentity,
            fileIdentity: manifest.manifest.files[0].fileIdentity,
            side: 'new' as const,
          },
          scope: { kind: 'whole' as const },
        },
      };
      state.sourceRecordIdentity = first.reviewSnapshotIdentity;
      state.sourceWorkflowIdentity = first.reviewIdentity;
      state.mode = 'wrong-owner';
      await expect(workspace.execute(command)).rejects.toThrow('reviewing-state-invalid');

      state.mode = 'wrong-kind';
      await expect(workspace.execute({ ...command, commandIdentity: 'reject-wrong-kind-artifact' })).rejects.toThrow(
        'reviewing-state-invalid',
      );

      state.mode = 'quarantined';
      await expect(workspace.execute({ ...command, commandIdentity: 'reject-quarantined-artifact' })).rejects.toThrow(
        'reviewing-state-invalid',
      );

      state.mode = 'none';
      await expect(
        workspace.execute({
          ...command,
          commandIdentity: 'reject-unsupported-artifact-kind',
          contribution: {
            kind: 'artifact',
            artifact: { kind: 'review-question', questionIdentity: `qst_${'0'.repeat(64)}` },
            scope: { kind: 'whole' },
          } as never,
        }),
      ).rejects.toThrow('Unsupported Review Artifact context contribution');
      const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
      expect(home.stateVersion).toBe(second.stateVersion);

      const accepted = requireContribution(
        await workspace.execute({
          ...command,
          commandIdentity: 'accept-artifact-after-faults-clear',
        }),
      );
      expect(accepted.stateVersion).toBe(second.stateVersion + 1);
    } finally {
      await state.close();
    }
  });

  it('resolves and copies one exact prior Review Response without admitting newer or ambient records', async () => {
    const created = await fixture();
    const owner = await open(created);
    const adapter = await establish(owner);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const first = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-response-artifact-source-review',
        expectedStateVersion: home.stateVersion,
      }),
    );
    const manifest = await owner.workspace.read({
      kind: 'review.manifest',
      reviewIdentity: first.reviewIdentity,
      reviewSnapshotIdentity: first.reviewSnapshotIdentity,
      offset: 0,
      limit: 64,
    });
    if (manifest.status !== 'available' || manifest.manifest.files[0] === undefined) {
      throw new Error('Response source Snapshot unavailable');
    }
    const inspection = await owner.workspace.read({
      kind: 'harness.review-question.inspect-default',
      reviewIdentity: first.reviewIdentity,
    });
    if (inspection.status !== 'available') throw new Error('Question inspection unavailable');
    const asked = await owner.workspace.execute({
      kind: 'review.question.ask',
      commandIdentity: 'ask-response-artifact-source-question',
      expectedStateVersion: inspection.stateVersion,
      reviewIdentity: first.reviewIdentity,
      anchor: {
        kind: 'review.diff-line',
        fileIdentity: manifest.manifest.files[0].fileIdentity,
        side: 'new',
        line: 1,
      },
      body: 'Give one exact response Artifact.',
      attachmentIdentity: inspection.destination.attachmentIdentity,
      inspectionIdentity: inspection.inspectionIdentity,
    });
    if (asked.kind !== 'review.question.asked') throw new Error('Question was not asked');
    expect(adapter.directives).toHaveLength(1);
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'response-artifact-start-evidence',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
    });
    const responseBody = 'Exact prior Response bytes.';
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'response-artifact-terminal-evidence',
      attachmentIdentity: adapter.attachment.attachmentIdentity,
      invocationIdentity: asked.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: responseBody,
        byteLength: Buffer.byteLength(responseBody),
        sha256: digest(responseBody),
      },
    });
    const questions = await owner.workspace.read({
      kind: 'review.questions',
      reviewIdentity: first.reviewIdentity,
      offset: 0,
      limit: 8,
    });
    if (questions.status !== 'available') throw new Error('Response unavailable');
    const question = questions.list.items.find(item => item.kind === 'question' && item.response !== undefined);
    if (question?.kind !== 'question' || question.response === undefined) throw new Error('Response Artifact missing');

    const second = requireStarted(
      await owner.workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'start-response-artifact-target-review',
        expectedStateVersion: questions.stateVersion,
      }),
    );
    const selected = requireContribution(
      await owner.workspace.execute({
        kind: 'review.context-contribution.add',
        commandIdentity: 'add-prior-response-range',
        expectedStateVersion: second.stateVersion,
        reviewIdentity: second.reviewIdentity,
        expectedSelectionRevision: 0,
        contribution: {
          kind: 'artifact',
          artifact: {
            kind: 'review-response',
            responseIdentity: question.response.responseIdentity,
          },
          scope: { kind: 'bytes', offset: 6, length: 5 },
        },
      }),
    );
    const content = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: selected.contributionIdentity,
      offset: 0,
      length: 256 * 1024,
    });
    expect(content.status).toBe('available');
    if (content.status !== 'available') throw new Error('Response contribution unavailable');
    expect(Buffer.from(content.window.bytesBase64, 'base64').toString('utf8')).toBe('prior');
    expect(content.contribution).toMatchObject({
      kind: 'artifact',
      artifact: {
        kind: 'review-response',
        artifactIdentity: question.response.responseIdentity,
        sourceReviewIdentity: first.reviewIdentity,
        questionIdentity: asked.questionIdentity,
        sourceByteLength: Buffer.byteLength(responseBody),
        sourceSha256: digest(responseBody),
      },
      scope: { kind: 'bytes', offset: 6, length: 5 },
      content: { status: 'available', byteLength: 5, sha256: digest('prior') },
    });

    const absent = await owner.workspace.read({
      kind: 'review.context-contribution-content',
      reviewIdentity: second.reviewIdentity,
      contributionIdentity: `rcc_${'0'.repeat(64)}` as ReviewContextContributionIdentity,
      offset: 0,
      length: 1,
    });
    expect(absent).toMatchObject({ status: 'not-found', stateVersion: selected.stateVersion });
  });
});
