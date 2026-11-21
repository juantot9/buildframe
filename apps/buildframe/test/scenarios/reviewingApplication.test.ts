import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs, { mkdir, mkdtemp, readFile as fsReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { connectWorkspaceRuntime, type RuntimeCodeIdentity, type RuntimeGeneration } from '@buildframe/local-runtime';
import { startLocalRuntimeServer } from '@buildframe/local-runtime/launcher';
import {
  RGBA,
  MouseButton,
  MouseEvent as OpenTUIMouseEvent,
  type BoxRenderable,
  type Renderable,
  type TextRenderable,
} from '@opentui/core';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import type {
  Workspace,
  WorkspaceAttention,
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceView,
  WorkspaceViewFor,
  WorkspaceViewRequest,
  WorkspaceViewScope,
  WorkspaceViewUpdateFor,
  WorkspaceIdentity,
} from '@buildframe/workspace';
import type {
  CommittedHarnessDirective,
  HarnessConnectionEntry,
  HarnessEvidenceSink,
  NormalizedHarnessEvidence,
  ReviewedCapabilityManifest,
  ReviewedHarnessAdapter,
  ReviewedHarnessAttachment,
  ReviewedHarnessConnection,
} from '@buildframe/workspace/harness-interaction';
import type { WorkspaceHomeView } from '@buildframe/workspace/projection';
import type {
  ReviewBasisIdentity,
  ReviewBatchIdentity,
  ReviewIdentity,
  ReviewQuestionIdentity,
  ReviewSnapshotIdentity,
} from '@buildframe/workspace/reviewing';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import type { ReviewingApplication } from '../../src/index.js';
import { INDIGO_NIGHT, QUIET_GRAPHITE, QUIET_PAPER, WARM_CARBON } from '../../src/reviewingView.js';
import { displayCells, wrappedDisplayRows } from '../../src/displayCells.js';
import { createReviewingApplicationForTest } from '../../src/reviewingScreen.js';
import {
  createFileUserConfiguration,
  messageTemplatePath,
  type UserConfiguration,
  type UserConfigurationSaveResult,
} from '../../src/userConfiguration.js';
import { resolveGitExecutable } from '../../../../packages/workspace/src/gitProcess.js';
import { descendantsWithIdPrefix, renderableTreeText } from './renderableTree.js';

const execFileAsync = promisify(execFile);

interface Fixture {
  readonly root: string;
  readonly checkout: string;
  readonly state: string;
}

interface TerminalWrite {
  readonly at: number;
  readonly data: string;
}

class ScriptedTerminal {
  readonly writes: TerminalWrite[] = [];

  private constructor(readonly setup: TestRendererSetup) {
    // OpenTUI 0.8 writes frames natively; reading the buffer while a frame is
    // still being written fails with OutputBusy. Polls then see the last
    // completed frame, which is what a terminal shows at that moment.
    const capture = setup.captureCharFrame.bind(setup);
    let lastFrame = '';
    setup.captureCharFrame = () => {
      try {
        lastFrame = capture();
      } catch (error) {
        if (!String(error).includes('OutputBusy')) throw error;
      }
      return lastFrame;
    };
    this.renderer.on('frame', () => {
      this.writes.push({
        at: performance.now(),
        data: this.setup.captureCharFrame(),
      });
    });
  }

  static async create(columns: number, rows: number): Promise<ScriptedTerminal> {
    return new ScriptedTerminal(
      await createTestRenderer({
        width: columns,
        height: rows,
        exitOnCtrlC: false,
        kittyKeyboard: true,
        gatherStats: true,
        useMouse: true,
        enableMouseMovement: true,
      }),
    );
  }

  get renderer(): TestRendererSetup['renderer'] {
    return this.setup.renderer;
  }

  send(data: string): number {
    if (this.renderer.isDestroyed) throw new Error('Scripted Terminal is not running');
    const at = performance.now();
    if (data === '\r' || data === '\n') this.setup.mockInput.pressEnter();
    else if (data === '\u001b') this.setup.mockInput.pressEscape();
    else if (data === '\t') this.setup.mockInput.pressTab();
    else {
      for (const character of data) this.setup.mockInput.pressKey(character);
    }
    void this.flush();
    return at;
  }

  pressKey(key: string, modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean } = {}): void {
    this.setup.mockInput.pressKey(key, modifiers);
    void this.flush();
  }

  pressArrow(
    direction: 'up' | 'down' | 'left' | 'right',
    modifiers: { shift?: boolean; ctrl?: boolean; meta?: boolean; super?: boolean } = {},
  ): void {
    this.setup.mockInput.pressArrow(direction, modifiers);
    void this.flush();
  }

  pressPage(direction: 'up' | 'down'): void {
    this.renderer.stdin.emit('data', Buffer.from(direction === 'up' ? '\u001b[5~' : '\u001b[6~'));
    void this.flush();
  }

  pressCtrlC(): void {
    this.setup.mockInput.pressCtrlC();
    void this.flush();
  }

  async paste(text: string): Promise<void> {
    await this.setup.mockInput.pasteBracketedText(text);
    await this.flush();
  }

  async clickRenderable(id: string): Promise<void> {
    const renderable = this.renderer.root.findDescendantById(id);
    if (renderable === undefined) throw new Error(`Renderable ${id} is unavailable`);
    await this.setup.mockMouse.click(
      renderable.screenX + Math.max(0, Math.min(1, renderable.width - 1)),
      renderable.screenY,
    );
    await this.flush();
  }

  async moveToRenderable(id: string): Promise<void> {
    if (this.renderer.root.findDescendantById(id) === undefined) {
      throw new Error(`Renderable ${id} is unavailable`);
    }
    // A freshly replaced tree reports zero geometry until OpenTUI lays it out;
    // dispatching the pointer before then would target the terminal origin.
    await waitFor(async () => {
      await this.flush();
      const candidate = this.renderer.root.findDescendantById(id);
      return candidate !== undefined && candidate.width > 0 && candidate.height > 0;
    }, `layout of ${id}`);
    const renderable = this.renderer.root.findDescendantById(id);
    if (renderable === undefined) throw new Error(`Renderable ${id} is unavailable`);
    await this.setup.mockMouse.moveTo(
      renderable.screenX + Math.max(0, Math.min(1, renderable.width - 1)),
      renderable.screenY,
    );
    await this.flush();
  }

  async scrollRenderable(id: string, direction: 'up' | 'down'): Promise<void> {
    const renderable = this.renderer.root.findDescendantById(id);
    if (renderable === undefined) throw new Error(`Renderable ${id} is unavailable`);
    await this.setup.mockMouse.scroll(
      renderable.screenX + Math.max(0, Math.floor(renderable.width / 2)),
      renderable.screenY + Math.max(0, Math.floor(renderable.height / 2)),
      direction,
    );
    // Reviewing coalesces raw wheel input in Node's immediate phase and, when
    // one frame is already pending, drains the latest state after that frame.
    for (let turn = 0; turn < 2; turn += 1) {
      await new Promise<void>(resolve => setImmediate(resolve));
      await this.flush();
    }
  }

  /** Emits one raw terminal-input burst and reports replacement-root churn during it. */
  async burstScrollRenderable(id: string, direction: 'up' | 'down', count: number): Promise<number> {
    const renderable = this.renderer.root.findDescendantById(id);
    if (renderable === undefined) throw new Error(`Renderable ${id} is unavailable`);
    const x = renderable.screenX + Math.max(0, Math.floor(renderable.width / 2));
    const y = renderable.screenY + Math.max(0, Math.floor(renderable.height / 2));
    const roots = new Set<Renderable>();
    const events: Promise<void>[] = [];
    for (let index = 0; index < count; index += 1) {
      events.push(this.setup.mockMouse.scroll(x, y, direction));
      const root = this.renderer.root.findDescendantById('reviewing-screen');
      if (root !== undefined) roots.add(root);
    }
    await Promise.all(events);
    return roots.size;
  }

  resize(columns: number, rows: number): void {
    this.setup.resize(columns, rows);
  }

  async flush(): Promise<void> {
    await this.setup.flush();
  }

  checkpoint(): number {
    return this.writes.length;
  }

  outputSince(checkpoint = 0): string {
    return this.writes
      .slice(checkpoint)
      .map(write => write.data)
      .join('\n');
  }

  plainOutputSince(checkpoint = 0): string {
    return this.outputSince(checkpoint);
  }
}

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function gitOutput(directory: string, ...arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_], {
    encoding: 'utf8',
  });
  return stdout;
}

async function createFixture(fileName = 'review.txt'): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'neoflow-tui-v1-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, fileName), 'old one\nshared\nold three\n');
  await git(checkout, 'add', '.');
  await git(checkout, 'commit', '-qm', 'basis');
  await writeFile(path.join(checkout, fileName), 'new one\nshared\nnew three\n');
  return { root, checkout, state };
}

async function createEmptyFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'neoflow-tui-empty-v1-'));
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Test');
  await git(checkout, 'config', 'user.email', 'neoflow@example.invalid');
  await git(checkout, 'commit', '--allow-empty', '-qm', 'empty basis');
  return { root, checkout, state };
}

// 60s of polling: CI's 2-core runner is measurably slower than a workstation at
// the cross-process directive round trips, and a genuine hang still fails.
/** Tabs until `pane` reports focus, wherever focus started. */
async function focusPane(terminal: ScriptedTerminal, pane: 'Files' | 'Diff' | 'Messages' | 'History'): Promise<void> {
  for (let tab = 0; tab < 4 && !terminal.setup.captureCharFrame().includes(`${pane} FOCUSED`); tab += 1) {
    terminal.send('\t');
    await terminal.flush();
  }
  await waitFor(() => terminal.setup.captureCharFrame().includes(`${pane} FOCUSED`), `${pane} focused`);
}

async function waitFor(predicate: () => boolean | Promise<boolean>, label: string, attempts = 12_000): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

/**
 * The commit picker's preview is ready: it names its endpoints rather than
 * saying it is still reading them. The footer's keys stay put while it loads,
 * so the preview is the signal.
 */
async function waitForComparisonReady(terminal: ScriptedTerminal): Promise<void> {
  await terminal.flush();
  await waitFor(() => {
    const preview = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'));
    return !preview.includes('Inspecting') && !preview.includes('Loading') && /Commit {2}|Head {2}/u.test(preview);
  }, 'comparison preview ready');
}

async function waitForOutput(terminal: ScriptedTerminal, text: string, checkpoint = 0): Promise<void> {
  await waitFor(
    async () => {
      await terminal.flush();
      return terminal.plainOutputSince(checkpoint).includes(text);
    },
    `terminal output ${JSON.stringify(text)}`,
  );
}

/** BuildFrame loses track of a sent Message's turn: it started, and its end was never observed. */
async function loseTurn(adapter: ScriptedDogfoodAdapter, index: number): Promise<void> {
  const directive = adapter.directives[index];
  if (directive === undefined) throw new Error(`Directive ${index} missing`);
  await adapter.emit({
    kind: 'harness.invocation.start-observed',
    evidenceIdentity: `lose-start-${index}`,
    attachmentIdentity: directive.attachmentIdentity,
    invocationIdentity: directive.invocationIdentity,
  });
  await adapter.emit({
    kind: 'harness.invocation.correlation-lost',
    evidenceIdentity: `lose-lost-${index}`,
    attachmentIdentity: directive.attachmentIdentity,
    invocationIdentity: directive.invocationIdentity,
    reason: 'terminal-evidence-lost',
  } as never);
}

async function waitForLayout(terminal: ScriptedTerminal, layout: 'wide' | 'balanced' | 'linear'): Promise<void> {
  await waitFor(async () => {
    await terminal.flush();
    return terminal.renderer.root.findDescendantById(`reviewing-layout-${layout}`) !== undefined;
  }, `${layout} layout`);
}

class ScriptedDogfoodAdapter implements ReviewedHarnessAdapter {
  readonly manifest: ReviewedCapabilityManifest;
  readonly attachment: ReviewedHarnessAttachment;
  readonly directives: CommittedHarnessDirective[] = [];
  sink?: HarnessEvidenceSink;

  constructor(
    workspaceIdentity: WorkspaceIdentity,
    canonicalCheckout: string,
    readonly authority: 'discussion-only' | 'workspace-write' = 'discussion-only',
  ) {
    this.manifest = {
      schema: 'neoflow.harness-capabilities/1',
      adapterImplementationIdentity: 'scripted-dogfood-pi',
      adapterDisplayName: 'Pi fixture',
      reviewedHostVersions: ['0.80.6'],
      capabilities: [
        {
          contractVersion: 1,
          capabilityIdentity:
            authority === 'workspace-write' ? 'direct-workspace-write-review-v1' : 'direct-question-review-v1',
          handoffKind: 'submit-review-batch',
          route: 'direct',
          authority,
          effectConstraint:
            authority === 'workspace-write'
              ? {
                  strength: 'communicated',
                  scope: 'harness-tools',
                  limitation: 'Scripted session tools may modify the workspace.',
                }
              : {
                  strength: 'enforced',
                  scope: 'workspace-read-only',
                  limitation: 'Scripted registered-tool constraint.',
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
          knownLimitations: ['Scripted registered-tool constraint.'],
        },
      ],
    };
    this.attachment = {
      evidenceIdentity: 'dogfood-attachment-establishment-1',
      attachmentIdentity: `att_${'7'.repeat(64)}` as never,
      workspaceIdentity,
      hostVersion: '0.80.6',
      destination: {
        harnessLabel: 'Pi fixture',
        sessionLabel: 'dogfood session',
        repositoryLabel: 'fixture',
        canonicalCheckout,
      },
      availability: { status: 'available' },
    };
  }

  connect(sink: HarnessEvidenceSink): ReviewedHarnessConnection {
    this.sink = sink;
    return {
      perform: async directive => {
        this.directives.push(directive);
        return { status: 'accepted-for-observation' };
      },
    };
  }

  async emit(evidence: NormalizedHarnessEvidence): Promise<void> {
    if (this.sink === undefined) throw new Error('Adapter is not connected');
    const acknowledgement = await this.sink.accept(evidence);
    if (acknowledgement.status !== 'applied') {
      throw new Error(`Evidence was refused: ${acknowledgement.reason}`);
    }
  }
}

interface TimedWorkspaceRead {
  readonly request: WorkspaceViewRequest;
  readonly startedAt: number;
  completedAt?: number;
}

class TimedWorkspace implements Workspace {
  executeStartedAt?: number;
  readonly commands: WorkspaceCommand[] = [];
  readonly reads: WorkspaceViewRequest[] = [];
  readonly readTimings: TimedWorkspaceRead[] = [];
  inFlightReads = 0;
  /** While set, Diff reads wait for it, so a test can type during a load. */
  holdDiffReads: Promise<void> | undefined;
  /** While set, the pre-send check waits for it, so a test can see the check phase. */
  holdInspection: Promise<void> | undefined;

  constructor(private readonly delegate: Workspace) {}

  setAttention(attention: WorkspaceAttention): void {
    this.delegate.setAttention(attention);
  }

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    this.executeStartedAt = performance.now();
    this.commands.push(command);
    return await this.delegate.execute(command);
  }

  async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
    this.reads.push(request);
    const timing: TimedWorkspaceRead = { request, startedAt: performance.now() };
    this.readTimings.push(timing);
    this.inFlightReads += 1;
    try {
      if ((request.kind === 'review.diff' || request.kind === 'review.live-diff') && this.holdDiffReads !== undefined) {
        await this.holdDiffReads;
      }
      if (request.kind === 'harness.review-message.inspect-default' && this.holdInspection !== undefined) {
        await this.holdInspection;
      }
      return await this.delegate.read(request);
    } finally {
      timing.completedAt = performance.now();
      this.inFlightReads -= 1;
    }
  }

  subscribe<Scope extends WorkspaceViewScope>(
    scope: Scope,
    onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): () => void {
    return this.delegate.subscribe(scope, onUpdate);
  }
}

async function waitForInitialReviewReconciliation(workspace: TimedWorkspace): Promise<void> {
  let previousReadCount = -1;
  let stableChecks = 0;
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    const harnessReads = workspace.reads.filter(request => request.kind === 'harness.review-interaction').length;
    // One Review load, then quiet: subscriptions start at the shown version and do not re-read.
    if (workspace.inFlightReads === 0 && harnessReads >= 1 && workspace.reads.length === previousReadCount) {
      stableChecks += 1;
      if (stableChecks >= 10) return;
    } else {
      stableChecks = 0;
    }
    previousReadCount = workspace.reads.length;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for initial Review reconciliation');
}

function reviewIdentity(): ReviewIdentity {
  return `rev_${'1'.repeat(64)}` as ReviewIdentity;
}

function snapshotIdentity(): ReviewSnapshotIdentity {
  return `rvs_${'2'.repeat(64)}` as ReviewSnapshotIdentity;
}

function retainedHistoryHome(offset: number): WorkspaceHomeView {
  const items = Array.from({ length: 65 }, (_, index) => ({
    reviewIdentity: `rev_${index.toString(16).padStart(64, '0')}` as ReviewIdentity,
    reviewSnapshotIdentity: `rvs_${index.toString(16).padStart(64, '0')}` as ReviewSnapshotIdentity,
    retention: 'previous' as const,
    recordedAt: '2026-09-01T00:00:00.000Z',
    totalFiles: index + 1,
    messages: 0,
    openDrafts: 0,
    questions: 0,
    questionsNeedingJudgment: 0,
    openQuestions: 0,
  })).slice(offset, offset + 64);
  return {
    kind: 'workspace.home',
    projectionVersion: 1,
    stateVersion: 7,
    header: {
      title: 'Home',
      totalReviews: 65,
      totalPastReviews: 65,
    },
    reviews: {
      offset,
      items,
      nextOffset: offset + items.length < 65 ? offset + items.length : null,
    },
    actions: [],
  };
}

class FailingHomeWorkspace implements Workspace {
  setAttention(): void {}

  readonly firstPagedReadStarted: Promise<void>;
  #resolveFirstPagedReadStarted!: () => void;
  #rejectFirstPagedRead!: (error: Error) => void;
  #pagedReads = 0;

  constructor(private readonly failure: 'immediate' | 'held') {
    this.firstPagedReadStarted = new Promise(resolve => {
      this.#resolveFirstPagedReadStarted = resolve;
    });
  }

  failHeldRead(): void {
    this.#rejectFirstPagedRead?.(new Error('injected Home read failure'));
  }

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    return {
      kind: 'review.command.rejected',
      status: 'rejected',
      commandIdentity: command.commandIdentity,
      stateVersion: 7,
      reason: 'review-not-active',
    };
  }

  async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
    if (request.kind !== 'workspace.home') {
      throw new Error(`Unexpected Home failure read ${request.kind}`);
    }
    if (request.offset === 0) {
      return retainedHistoryHome(0) as WorkspaceViewFor<Request>;
    }
    if (request.offset !== 64) {
      throw new Error(`Unexpected Home offset ${request.offset}`);
    }
    this.#pagedReads += 1;
    if (this.#pagedReads > 1) {
      return retainedHistoryHome(64) as WorkspaceViewFor<Request>;
    }
    this.#resolveFirstPagedReadStarted();
    if (this.failure === 'immediate') {
      throw new Error('injected Home read failure');
    }
    return await new Promise<WorkspaceViewFor<Request>>((_resolve, reject) => {
      this.#rejectFirstPagedRead = reject;
    });
  }

  subscribe<Scope extends WorkspaceViewScope>(
    _scope: Scope,
    _onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): () => void {
    return () => {};
  }
}

class StressWorkspace implements Workspace {
  readonly requests: WorkspaceViewRequest[] = [];
  readonly attention: WorkspaceAttention[] = [];
  readonly subscriptions: WorkspaceViewScope[] = [];
  readonly review = reviewIdentity();
  readonly snapshot = snapshotIdentity();

  constructor(
    readonly diffTotal = 620_000,
    readonly diffRowLength = 500,
    readonly messageTotal = 0,
    readonly messageBodyRepeats = 80,
    readonly messageProjectionCharacters: number | undefined = undefined,
    readonly messageResponseProjectionCharacters: number | undefined = undefined,
    readonly messageResponseRepeats = 60,
  ) {}

  async execute(command: WorkspaceCommand): Promise<WorkspaceCommandResult> {
    return {
      kind: 'review.command.rejected',
      status: 'rejected',
      commandIdentity: command.commandIdentity,
      stateVersion: 7,
      reason: 'review-not-active',
    };
  }

  async read<Request extends WorkspaceViewRequest>(request: Request): Promise<WorkspaceViewFor<Request>> {
    this.requests.push(request);
    return this.view(request) as WorkspaceViewFor<Request>;
  }

  setAttention(attention: WorkspaceAttention): void {
    this.attention.push(attention);
  }

  harnesses: readonly HarnessConnectionEntry[] = [];
  readonly #connectionListeners = new Set<() => void>();

  /** An agent connects, leaves or changes availability. */
  setHarnesses(harnesses: readonly HarnessConnectionEntry[]): void {
    this.harnesses = harnesses;
    for (const listener of this.#connectionListeners) listener();
  }

  subscribe<Scope extends WorkspaceViewScope>(
    scope: Scope,
    onUpdate: (update: WorkspaceViewUpdateFor<Scope>) => void,
  ): () => void {
    if (scope.kind === 'harness.connection') {
      const listener = (): void => onUpdate(this.view(scope) as WorkspaceViewUpdateFor<Scope>);
      this.#connectionListeners.add(listener);
      queueMicrotask(listener);
      return () => {
        this.#connectionListeners.delete(listener);
      };
    }
    this.subscriptions.push(scope);
    let active = true;
    queueMicrotask(() => {
      if (active) onUpdate(this.view(scope) as WorkspaceViewUpdateFor<Scope>);
    });
    return () => {
      active = false;
    };
  }

  private view(request: WorkspaceViewRequest | WorkspaceViewScope): WorkspaceView {
    if (request.kind === 'workspace.home') {
      return {
        kind: 'workspace.home',
        projectionVersion: 1,
        stateVersion: 7,
        header: {
          title: 'Home',
          totalReviews: 1,
          totalPastReviews: 0,
          currentReviewIdentity: this.review,
        },
        currentReview: {
          reviewIdentity: this.review,
          reviewSnapshotIdentity: this.snapshot,
          retention: 'current',
          recordedAt: '2026-07-30T09:00:00.000Z',
          totalFiles: 1_000,
          messages: 2,
          openDrafts: 0,
          questions: 137,
          questionsNeedingJudgment: 137,
          openQuestions: 0,
        },
        reviews: {
          offset: request.offset,
          items: [],
          nextOffset: null,
        },
        actions: [],
      } satisfies WorkspaceHomeView;
    }
    const header = {
      title: 'Review current changes',
      reviewIdentity: this.review,
      reviewSnapshotIdentity: this.snapshot,
      latestReviewSnapshotIdentity: this.snapshot,
      version: { ordinal: 1, total: 1, isLatest: true },
      retention: 'current',
      snapshotStatus: 'current',
      contextStatus: 'current',
    } as const;
    if (request.kind === 'review.live-manifest') {
      const projected = this.view({
        kind: 'review.manifest',
        reviewIdentity: request.reviewIdentity,
        offset: request.offset,
        limit: request.limit,
      });
      if (projected.kind !== 'review.manifest' || projected.status !== 'available') {
        throw new Error('Stress manifest unavailable');
      }
      return {
        kind: 'review.live-manifest',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        latestReviewSnapshotIdentity: this.snapshot,
        liveChangesIdentity: `lch_${'4'.repeat(64)}`,
        matchesLatestSnapshot: true,
        manifest: {
          totalFiles: projected.manifest.totalFiles,
          offset: projected.manifest.offset,
          files: projected.manifest.files,
          nextOffset: projected.manifest.nextOffset,
        },
      };
    }
    if (request.kind === 'review.continuation') {
      return {
        kind: 'review.continuation',
        status: 'unavailable',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        sourceReviewSnapshotIdentity: this.snapshot,
        reason: 'review-not-fixed',
      };
    }
    if (request.kind === 'review.versions') {
      return {
        kind: 'review.versions',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        latestReviewSnapshotIdentity: this.snapshot,
        versions: {
          total: 1,
          offset: request.offset,
          items: [
            {
              reviewSnapshotIdentity: this.snapshot,
              ordinal: 1,
              isLatest: true,
              totalFiles: 1_000,
              verificationAtCapture: 'current',
            },
          ],
          nextOffset: null,
        },
      };
    }
    if (request.kind === 'review.manifest') {
      return {
        kind: 'review.manifest',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        header,
        manifest: {
          totalFiles: 1_000,
          identity: '4'.repeat(64),
          offset: request.offset,
          files: Array.from({ length: Math.min(request.limit, 64, 1_000 - request.offset) }, (_, index) => {
            const absolute = request.offset + index;
            return {
              fileIdentity: `fil_${String(absolute).padStart(64, '0')}`,
              status: 'modified' as const,
              displayPath: `packages/stress/file-${absolute}.ts`,
              oldSide: {
                path: `packages/stress/file-${absolute}.ts`,
                pathBytesBase64: Buffer.from(`packages/stress/file-${absolute}.ts`).toString('base64'),
                kind: 'regular' as const,
                byteLength: 25 * 1024,
                content: 'available' as const,
              },
              newSide: {
                path: `packages/stress/file-${absolute}.ts`,
                pathBytesBase64: Buffer.from(`packages/stress/file-${absolute}.ts`).toString('base64'),
                kind: 'regular' as const,
                byteLength: 25 * 1024,
                content: 'available' as const,
              },
            };
          }),
          nextOffset: request.offset + 64 < 1_000 ? request.offset + 64 : null,
        },
        questions: {
          openDrafts: 0,
          total: 137,
          needingJudgment: 137,
          open: 0,
        },
        actions: [],
      };
    }
    if (request.kind === 'review.diff') {
      return {
        kind: 'review.diff',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        header,
        file: {
          fileIdentity: request.fileIdentity,
          status: 'modified',
          displayPath: 'packages/stress/file-0.ts',
          oldSide: {
            path: 'packages/stress/file-0.ts',
            pathBytesBase64: Buffer.from('packages/stress/file-0.ts').toString('base64'),
            kind: 'regular',
            byteLength: 25 * 1024,
            content: 'available',
          },
          newSide: {
            path: 'packages/stress/file-0.ts',
            pathBytesBase64: Buffer.from('packages/stress/file-0.ts').toString('base64'),
            kind: 'regular',
            byteLength: 25 * 1024,
            content: 'available',
          },
        },
        window: {
          totalRows: this.diffTotal,
          offset: request.offset,
          rows: Array.from({ length: Math.min(request.limit, 64, this.diffTotal - request.offset) }, (_, index) => {
            const absolute = request.offset + index;
            const text =
              absolute < 12
                ? `const boundedRow${absolute} = "${'x'.repeat(this.diffRowLength)}visibleTail${absolute}";`
                : `const boundedRow${absolute} = true;`;
            return {
              rowIdentity: `row-${absolute}`,
              kind: 'context' as const,
              oldLine: request.offset + index + 1,
              newLine: request.offset + index + 1,
              text: {
                encoding: 'utf8' as const,
                bytesBase64: Buffer.from(text).toString('base64'),
                byteLength: Buffer.byteLength(text),
                totalByteLength: Buffer.byteLength(text),
                truncated: false,
              },
            };
          }),
          nextOffset: request.offset + 64 < this.diffTotal ? request.offset + 64 : null,
        },
        actions: [],
      };
    }
    if (request.kind === 'review.live-diff') {
      const projected = this.view({
        kind: 'review.diff',
        reviewIdentity: request.reviewIdentity,
        fileIdentity: request.fileIdentity,
        offset: request.offset,
        limit: request.limit,
      });
      if (projected.kind !== 'review.diff' || projected.status !== 'available') {
        throw new Error('Stress Diff unavailable');
      }
      return {
        ...projected,
        kind: 'review.live-diff',
        reviewIdentity: this.review,
        latestReviewSnapshotIdentity: this.snapshot,
        liveChangesIdentity: request.liveChangesIdentity,
        matchesLatestSnapshot: true,
      };
    }
    if (request.kind === 'review.bases') {
      const liveReviewBasisIdentity = `rbs_${'1'.repeat(64)}` as ReviewBasisIdentity;
      return {
        kind: 'review.bases',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        liveReviewBasisIdentity,
        gitDiscovery: { status: 'available', truncated: false },
        bases: {
          total: 1,
          offset: request.offset,
          items:
            request.offset === 0
              ? [
                  {
                    reviewBasisIdentity: liveReviewBasisIdentity,
                    depth: 0,
                    kind: 'live',
                    source: { kind: 'live-working-diff' },
                    capture: { status: 'live' },
                  },
                ]
              : [],
          nextOffset: null,
        },
      };
    }
    if (request.kind === 'review.history') {
      // The stress Review has no recorded history, as for a fixed comparison.
      return {
        kind: 'review.history',
        status: 'unavailable',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        reason: 'fixed-comparison',
      };
    }
    if (request.kind === 'review.messages') {
      const liveReviewBasisIdentity = `rbs_${'1'.repeat(64)}` as ReviewBasisIdentity;
      const items = Array.from(
        { length: Math.min(request.limit, 32, Math.max(0, this.messageTotal - request.offset)) },
        (_, index) => {
          const absolute = request.offset + index;
          const completeBody = this.messageBody(absolute);
          const body =
            this.messageProjectionCharacters === undefined
              ? completeBody
              : [...completeBody].slice(0, this.messageProjectionCharacters).join('');
          const completeResponse = this.messageResponse(absolute);
          const response =
            this.messageResponseProjectionCharacters === undefined
              ? completeResponse
              : [...completeResponse].slice(0, this.messageResponseProjectionCharacters).join('');
          return {
            reviewMessageIdentity: `rmg_${String(absolute).padStart(64, '2')}` as never,
            originReviewBasisIdentity: liveReviewBasisIdentity,
            location: {
              file: {
                encoding: 'git-path-bytes' as const,
                bytesBase64: Buffer.from('packages/stress/file-0.ts').toString('base64'),
                display: 'packages/stress/file-0.ts',
              },
              line: absolute + 1,
            },
            body: {
              encoding: 'utf8' as const,
              bytesBase64: Buffer.from(body).toString('base64'),
              byteLength: Buffer.byteLength(body),
              totalByteLength: Buffer.byteLength(completeBody),
              truncated: body !== completeBody,
            },
            outgoingMaterialIdentity: `rmm_${String(absolute).padStart(64, '3')}` as never,
            response: {
              responseIdentity: `response-${String(absolute).padStart(64, '4')}` as never,
              body: {
                encoding: 'utf8' as const,
                bytesBase64: Buffer.from(response).toString('base64'),
                byteLength: Buffer.byteLength(response),
                totalByteLength: Buffer.byteLength(completeResponse),
                truncated: response !== completeResponse,
              },
            },
          };
        },
      );
      return {
        kind: 'review.messages',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        reviewBasisIdentity: liveReviewBasisIdentity,
        messages: {
          total: this.messageTotal,
          offset: request.offset,
          items,
          nextOffset: request.offset + items.length < this.messageTotal ? request.offset + items.length : null,
        },
      };
    }
    if (request.kind === 'review.message-body') {
      const absolute = Array.from({ length: this.messageTotal }, (_, index) => index).find(
        index => `rmg_${String(index).padStart(64, '2')}` === request.reviewMessageIdentity,
      );
      if (absolute === undefined) {
        return {
          kind: 'review.message-body',
          status: 'not-found',
          projectionVersion: 1,
          stateVersion: 7,
          reviewIdentity: this.review,
          reviewMessageIdentity: request.reviewMessageIdentity,
        };
      }
      const body = request.part === 'response' ? this.messageResponse(absolute) : this.messageBody(absolute);
      return {
        kind: 'review.message-body',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        reviewMessageIdentity: request.reviewMessageIdentity,
        body: {
          encoding: 'utf8',
          bytesBase64: Buffer.from(body).toString('base64'),
          byteLength: Buffer.byteLength(body),
          totalByteLength: Buffer.byteLength(body),
          truncated: false,
        },
      };
    }
    if (request.kind === 'review.live-files') {
      const manifest = this.view({
        kind: 'review.manifest',
        reviewIdentity: request.reviewIdentity,
        offset: request.offset,
        limit: request.limit,
      });
      if (manifest.kind !== 'review.manifest' || manifest.status !== 'available') {
        throw new Error('Stress live files unavailable');
      }
      return {
        kind: 'review.live-files',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: this.review,
        liveChangesIdentity: request.liveChangesIdentity,
        files: {
          total: manifest.manifest.totalFiles,
          offset: manifest.manifest.offset,
          items: manifest.manifest.files.map(file => ({
            fileIdentity: file.fileIdentity,
            path: {
              encoding: 'git-path-bytes',
              bytesBase64: file.newSide!.pathBytesBase64,
              display: file.displayPath,
            },
            status: file.status,
            changedFile: file,
          })),
          nextOffset: manifest.manifest.nextOffset,
        },
      };
    }
    if (request.kind === 'review.questions') {
      return {
        kind: 'review.questions',
        status: 'available',
        projectionVersion: 1,
        stateVersion: 7,
        header,
        list: {
          totalItems: 137,
          offset: request.offset,
          items: Array.from({ length: Math.min(request.limit, 8, 137 - request.offset) }, (_, index) => {
            const absolute = request.offset + index;
            const body = `Bounded Question ${absolute} ${'detail '.repeat(20)}`;
            return {
              kind: 'question' as const,
              itemIdentity: `qst_${String(absolute).padStart(64, '5')}` as ReviewQuestionIdentity,
              reviewBatchIdentity: `rbt_${String(absolute).padStart(64, '6')}` as ReviewBatchIdentity,
              body: {
                encoding: 'utf8' as const,
                bytesBase64: Buffer.from(body).toString('base64'),
                byteLength: Buffer.byteLength(body),
                totalByteLength: Buffer.byteLength(body),
                truncated: false,
              },
              target: {
                kind: 'review.diff-line' as const,
                reviewSnapshotIdentity: this.snapshot,
                fileIdentity: `fil_${'0'.repeat(64)}`,
                side: 'new' as const,
                line: absolute + 1,
              },
              actions: [],
            };
          }),
          nextOffset: request.offset + 8 < 137 ? request.offset + 8 : null,
        },
        actions: [],
      };
    }
    if (request.kind === 'review.question-location') {
      return {
        kind: 'review.question-location',
        status: 'unavailable',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: request.reviewIdentity,
        itemIdentity: request.itemIdentity,
        reason: 'diff-unavailable',
      };
    }
    if (request.kind === 'review.question-body') {
      return {
        kind: 'review.question-body',
        status: 'not-found',
        projectionVersion: 1,
        stateVersion: 7,
        reviewIdentity: request.reviewIdentity,
        itemIdentity: request.itemIdentity,
      };
    }
    if (request.kind === 'review.command-result') {
      return {
        kind: 'review.command-result',
        status: 'not-found',
        projectionVersion: 1,
        stateVersion: 7,
        commandIdentity: request.commandIdentity,
      };
    }
    if (request.kind === 'harness.review-interaction') {
      return {
        kind: 'harness.review-interaction',
        stateVersion: 7,
        reviewIdentity: request.reviewIdentity,
        totalInteractions: 0,
        offset: request.offset,
        nextOffset: null,
        handoffs: [],
        invocations: [],
      };
    }
    if (request.kind === 'harness.review-question.inspect-default') {
      return {
        kind: 'harness.review-question.default-inspection',
        status: 'unavailable',
        stateVersion: 7,
        reviewIdentity: request.reviewIdentity,
        reason: 'attachment-not-found',
      };
    }
    if (request.kind === 'harness.review-handoff.inspect-default') {
      return {
        kind: 'harness.review-handoff.default-inspection',
        status: 'unavailable',
        stateVersion: 7,
        reviewIdentity: request.reviewIdentity,
        reviewBatchIdentity: request.reviewBatchIdentity,
        reason: 'attachment-not-found',
      };
    }
    if (request.kind === 'harness.command-result') {
      return {
        kind: 'harness.command-result',
        status: 'not-found',
        stateVersion: 7,
        commandIdentity: request.commandIdentity,
      };
    }
    if (request.kind === 'harness.connection') {
      return { kind: 'harness.connection', stateVersion: 7, harnesses: this.harnesses };
    }
    throw new Error(`Unsupported Stress Workspace request ${request.kind}`);
  }

  private messageBody(absolute: number): string {
    return `Message ${absolute} ${'detail '.repeat(this.messageBodyRepeats)}\n\nUnicode continuity 🙂 café complete MessageTail${absolute}`;
  }

  private messageResponse(absolute: number): string {
    return `Response ${absolute} ${'settled '.repeat(this.messageResponseRepeats)}complete ResponseTail${absolute}`;
  }
}

describe('OpenTUI Reviewing surface over the real Application model', () => {
  const owners = new Set<WorkspaceRuntimeOwner>();
  const applications = new Set<ReviewingApplication>();
  const roots = new Set<string>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  async function fixture(fileName = 'review.txt'): Promise<Fixture> {
    const created = await createFixture(fileName);
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    return created;
  }

  async function emptyFixture(): Promise<Fixture> {
    const created = await createEmptyFixture();
    roots.add(created.root);
    process.env.XDG_STATE_HOME = created.state;
    return created;
  }

  async function open(checkout: string): Promise<WorkspaceRuntimeOwner> {
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error(`Owner rejected: ${JSON.stringify(opened.diagnostic)}`);
    owners.add(opened.owner);
    return opened.owner;
  }

  afterEach(async () => {
    await Promise.all([...applications].map(application => application.stop()));
    applications.clear();
    await Promise.all([...owners].map(owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    // Windows keeps a directory busy for a moment after the processes in it exit.
    await Promise.all([...roots].map(root => rm(root, { recursive: true, force: true, maxRetries: 10 })));
    roots.clear();
  });

  it('adds token colors without changing Diff frames, wide-cell geometry, focus, or fallback behavior', async () => {
    const created = await fixture('sample.ts');
    const source = `const answer = "${'界🙂'.repeat(12)}";`;
    await writeFile(path.join(created.checkout, 'sample.ts'), `${source}\nconst second = "yes";\n`);
    const owner = await open(created.checkout);
    const started = await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'rich-content-review',
      expectedStateVersion: 0,
    });
    expect(started.kind).toBe('review.current-changes.started');
    const configurationPath = path.join(created.root, 'tokens.json');
    const tokens = { keyword: '#f1a2c3' };
    await writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        reviewing: {
          theme: { inherits: 'quiet-graphite', tokens },
        },
      }),
    );
    const frames: string[][] = [];
    for (const lane of ['no-color', 'rich', 'failed-worker'] as const) {
      let creations = 0;
      const terminal = await ScriptedTerminal.create(180, 38);
      const application = createReviewingApplicationForTest({
        workspace: owner.workspace,
        renderer: terminal.renderer,
        presentation: { noColor: lane === 'no-color', ascii: false },
        userConfiguration: createFileUserConfiguration(configurationPath),
        ...(lane === 'failed-worker'
          ? {
              createHighlightClient: () => {
                creations += 1;
                throw new Error('scripted unavailable worker');
              },
            }
          : {}),
      });
      applications.add(application);
      await application.start();
      await waitForOutput(terminal, 'Current Review');
      if (lane === 'rich') {
        await waitFor(async () => {
          await terminal.flush();
          return terminal.setup
            .captureSpans()
            .lines.some(line =>
              line.spans.some(span => span.text.includes('const') && span.fg.equals(RGBA.fromHex(tokens.keyword))),
            );
        }, 'default rich Diff using custom keyword palette');
        const spans = terminal.setup.captureSpans().lines.flatMap(line => line.spans);
        expect(
          spans.some(span => span.text.includes('yes') && span.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.tokens.string!))),
        ).toBe(true);
        expect(
          spans.some(span => span.text.includes('=') && span.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.success))),
        ).toBe(true);
      }
      const captured: string[] = [];
      // A presented frame can lag the model under load; a capture is only
      // settled once two consecutive presented frames are identical.
      const captureSettled = async (): Promise<string> => {
        let previous = '';
        for (let attempt = 0; attempt < 400; attempt += 1) {
          await terminal.flush();
          const current = terminal.setup.captureCharFrame();
          if (current === previous) return current;
          previous = current;
        }
        return previous;
      };
      for (const [width, height] of [
        [180, 38],
        [100, 28],
        [80, 24],
      ] as const) {
        terminal.resize(width, height);
        captured.push(await captureSettled());
        const rows = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-');
        const diffPane = terminal.renderer.root.findDescendantById('reviewing-diff-pane');
        if (diffPane === undefined) throw new Error('Diff pane missing');
        const availableRowHeight = Math.max(1, diffPane.height - 3);
        for (const row of rows) {
          const code = row.getChildren()[1] as TextRenderable;
          const text = code.content.chunks.map(chunk => chunk.text).join('');
          expect(code.screenX - row.screenX).toBe(14);
          expect(row.height, JSON.stringify({ lane, width, rowWidth: row.width, codeWidth: code.width, text })).toBe(
            Math.min(availableRowHeight, wrappedDisplayRows(text, code.width)),
          );
        }
      }
      terminal.send('w');
      await waitForOutput(terminal, 'wrapping disabled');
      captured.push(await captureSettled());
      terminal.send('v');
      await waitForOutput(terminal, 'Side-by-side');
      captured.push(await captureSettled());
      await new Promise<void>(resolve => setImmediate(resolve));
      await terminal.flush();
      // Resizing and asynchronous token delivery must not decide the keyboard
      // precondition. Establish the first semantic Diff row, then move once.
      terminal.send('g');
      try {
        await waitFor(async () => {
          await terminal.flush();
          return (
            terminal.setup
              .captureCharFrame()
              .split('\n')
              .find(line => line.includes('1 -old one'))
              ?.includes('▌') ?? false
          );
        }, `selection moved to the first Diff row in ${lane}`);
      } catch (error) {
        const currentRows = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').map(row => ({
          id: row.id,
          text: renderableTreeText(row),
        }));
        throw new Error(
          `${error instanceof Error ? error.message : 'Diff edge selection failed'}\n${JSON.stringify(currentRows)}\n${terminal.setup.captureCharFrame()}`,
        );
      }
      terminal.send('j');
      try {
        await waitFor(
          async () => {
            await terminal.flush();
            return (
              terminal.setup
                .captureCharFrame()
                .split('\n')
                .find(line => line.includes('2 -shared'))
                ?.includes('▌') ?? false
            );
          },
          `selection moved to the second Side-by-side pair in ${lane}`,
          3_200,
        );
      } catch (error) {
        const currentRows = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').map(row => ({
          id: row.id,
          text: renderableTreeText(row),
        }));
        throw new Error(
          `${error instanceof Error ? error.message : 'Diff selection failed'}\n${JSON.stringify(currentRows)}\n${terminal.setup.captureCharFrame()}`,
        );
      }
      captured.push(terminal.setup.captureCharFrame());
      frames.push(captured);
      if (lane === 'failed-worker') expect(creations).toBe(1);
      await application.stop();
      applications.delete(application);
    }
    expect(frames[1]).toEqual(frames[0]);
    expect(frames[2]).toEqual(frames[0]);
  }, 60_000);

  it('syntax-highlights unchanged file content while retaining its selectable gutter', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'stable.ts'), 'const stable = "kept";\n');
    await git(created.checkout, 'add', 'stable.ts');
    await git(created.checkout, 'commit', '-qm', 'add unchanged TypeScript source', '--', 'stable.ts');
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    terminal.send('f');
    await waitForOutput(terminal, 'Files FOCUSED  All');
    const fileRow = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-file-row-').find(row =>
      renderableTreeText(row).includes('stable.ts'),
    );
    if (fileRow === undefined) throw new Error('Unchanged TypeScript file row missing');
    await waitFor(async () => {
      await terminal.flush();
      return (terminal.renderer.root.findDescendantById(fileRow.id)?.screenY ?? 0) > 0;
    }, 'unchanged TypeScript file geometry');
    await terminal.clickRenderable(fileRow.id);
    await waitForOutput(terminal, 'const stable = "kept";');

    await waitFor(async () => {
      await terminal.flush();
      const row = terminal.renderer.root.findDescendantById('reviewing-content-line-1');
      const code = row?.getChildren()[1] as TextRenderable | undefined;
      return (
        code?.content.chunks.some(
          chunk => chunk.text.includes('const') && chunk.fg?.equals(RGBA.fromHex(QUIET_GRAPHITE.tokens.keyword!)),
        ) ?? false
      );
    }, 'syntax-highlighted unchanged TypeScript content');
    const contentRow = terminal.renderer.root.findDescendantById('reviewing-content-line-1');
    expect(renderableTreeText(contentRow)).toContain('▌   1');
    expect(renderableTreeText(contentRow)).toContain('const stable = "kept";');
  });

  it('owns a failed post-start Home read and renders its truthful failure', async () => {
    await emptyFixture();
    const workspace = new FailingHomeWorkspace('immediate');
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('k');
    terminal.send('\r');
    await waitForOutput(terminal, 'Previous Reviews FOCUSED');

    const failure = 'Couldn’t load Home.';
    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      terminal.send('G');
      await workspace.firstPagedReadStarted;
      await waitFor(async () => {
        await terminal.flush();
        return unhandled.length > 0 || renderableTreeText(terminal.renderer.root).includes(failure);
      }, 'owned Home read failure or leaked rejection');
      await new Promise(resolve => setTimeout(resolve, 0));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
    expect(renderableTreeText(terminal.renderer.root)).toContain(failure);
    expect(terminal.writes.at(-1)?.data ?? '').toContain(failure);
  });

  it('wraps an error onto a second status row instead of cutting it short', async () => {
    await emptyFixture();
    const workspace = new FailingHomeWorkspace('immediate');
    const terminal = await ScriptedTerminal.create(60, 24);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('k');
    terminal.send('\r');
    await waitForOutput(terminal, 'Previous Reviews FOCUSED');
    terminal.send('G');
    await workspace.firstPagedReadStarted;
    const statusText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-status-line')).replace(/\s+/gu, ' ');
    await waitFor(() => statusText().includes('Couldn’t load Home.'), 'Home failure in the status line');
    // The reason ends the sentence, whole, on the second row.
    expect(statusText()).toContain('injected Home read failure');
    expect(terminal.renderer.root.findDescendantById('reviewing-status-line')?.height).toBe(2);
  });

  it('never runs typed-ahead letters as commands while a Diff loads, and q waits too', async () => {
    const created = await fixture();
    // A second changed file, so moving to it loads a Diff.
    await writeFile(path.join(created.checkout, 'second.txt'), 'second file\n');
    await git(created.checkout, 'add', 'second.txt');
    await git(created.checkout, 'commit', '-qm', 'second', '--', 'second.txt');
    await writeFile(path.join(created.checkout, 'second.txt'), 'second file, edited\n');
    const owner = await open(created.checkout);
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: timed, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'Diff FOCUSED');
    const statusLine = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-status-line'));
    const filesTitle = (): string => terminal.setup.captureCharFrame();
    expect(filesTitle()).toContain('Files  Changed');

    // Hold the next Diff read, then open another file so a load is in flight.
    let release!: () => void;
    timed.holdDiffReads = new Promise(resolve => {
      release = resolve;
    });
    await focusPane(terminal, 'Files');
    terminal.send('j');
    terminal.send('\r');
    await waitFor(() => statusLine().includes('Loading'), 'a Diff load in flight');

    // A sentence typed ahead: y would copy, f switch Files, q quit.
    let closed = false;
    void application.closed.then(() => {
      closed = true;
    });
    terminal.send('a');
    terminal.send('Why not a queue?');
    await terminal.flush();
    await waitFor(() => statusLine().includes('Still loading'), 'still-loading notice');
    expect(statusLine()).not.toContain('Couldn’t copy');
    expect(filesTitle()).toContain('Files  Changed');
    expect(terminal.renderer.root.findDescendantById('reviewing-question-textarea')).toBeUndefined();
    expect(closed).toBe(false);

    release();
    timed.holdDiffReads = undefined;
    await waitFor(() => !statusLine().includes('Loading'), 'load finished');
    // Once nothing is in flight, q quits as before.
    terminal.send('q');
    await application.closed;
    expect(closed).toBe(true);
  });

  it('tells one story while a Message is checked before saving', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: timed, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Check me');
    await waitForOutput(terminal, 'Check me');
    let release!: () => void;
    timed.holdInspection = new Promise(resolve => {
      release = resolve;
    });
    terminal.send('\r');
    await waitForOutput(terminal, 'Checking · review.txt:1');
    const frame = terminal.setup.captureCharFrame();
    // The card alone names the phase; nothing else repeats it or offers editing keys.
    expect(frame).toContain('Nothing is saved yet.');
    expect(frame.match(/[Cc]hecking/gu)?.length).toBe(2);
    expect(frame).toContain('Keys you press now wait until it’s saved.');
    expect(frame).not.toContain('[Enter] send  [F3] preview  [Esc] discard');
    expect(frame).not.toContain('Checking exact target');
    release();
    timed.holdInspection = undefined;
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
  });

  it('never cuts a file name in a History row; it falls back to the line', async () => {
    const created = await fixture();
    await mkdir(path.join(created.checkout, 'src'), { recursive: true });
    const name = 'reviewQueuePriorityOrdering.ts';
    await writeFile(path.join(created.checkout, 'src', name), 'export const one = 1;\n');
    await git(created.checkout, 'add', `src/${name}`);
    await git(created.checkout, 'commit', '-qm', 'queue', '--', `src/${name}`);
    await writeFile(path.join(created.checkout, 'src', name), 'export const one = 2;\n');
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await focusPane(terminal, 'Files');
    // review.txt, then src/, then the long-named file.
    for (let step = 0; step < 2; step += 1) terminal.send('j');
    terminal.send('\r');
    await waitForOutput(terminal, 'export const one = 2;');
    terminal.send('j');
    terminal.send('a');
    await waitForOutput(terminal, `New Message · src/${name}:1`);
    terminal.send('Why two?');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'directive');
    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'cut-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    await waitForOutput(terminal, 'started #1');
    const history = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-messages-viewport'));
    const messageRow = (): string | undefined =>
      history()
        .split('\n')
        .find(line => /[›>] #1 /u.test(line));
    await waitFor(() => messageRow() !== undefined, 'History row');
    const row = messageRow()!;
    // Either the whole name or just the line; never "…Ordering.ts:1".
    expect(row.trimEnd()).toMatch(new RegExp(`#1 (${name.replace('.', '\\.')}:1|line 1)$`, 'u'));
    expect(row).not.toContain('…');
  });

  it('keeps each state word whole in a stack of Messages on one line', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    for (const [index, text] of ['First 🙂 '.repeat(14) + 'end', 'Second 🙂 also wide'].entries()) {
      terminal.send('a');
      await waitForOutput(terminal, 'New Message · review.txt:1');
      terminal.send(text);
      await waitForOutput(terminal, text.slice(-12));
      terminal.send('\r');
      await waitFor(() => adapter.directives.length === index + 1, `directive ${index + 1}`);
      const directive = adapter.directives[index]!;
      await adapter.emit({
        kind: 'harness.invocation.start-observed',
        evidenceIdentity: `stack-start-${index}`,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
      });
      await adapter.emit({
        kind: 'harness.invocation.terminal-observed',
        evidenceIdentity: `stack-end-${index}`,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
        outcome: 'failed',
        reason: 'harness-failed',
      } as never);
      await waitForOutput(terminal, `#${index + 1} failed`);
    }
    const card = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-expanded-message-card'));
    await waitFor(() => /#2 · /u.test(card()), 'stacked card');
    // Each stack row ends with its whole state word, never "faile".
    const rows = card()
      .split('\n')
      .filter(line => /#[12] · /u.test(line));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.trimEnd()).toMatch(/✗ failed$/u);
    // And every row fits the card's real inner width (border and padding taken off), counted in cells.
    const cardWidth = terminal.renderer.root.findDescendantById('reviewing-expanded-message-card')?.width ?? 0;
    for (const row of rows) {
      expect(wrappedDisplayRows(row.trimEnd(), Math.max(1, cardWidth - 4))).toBe(1);
    }
    // The selected #2 fits its index row whole, so its body isn't printed again.
    expect(card().match(/Second 🙂 also wide/gu)).toHaveLength(1);
  });

  it('says plainly when nothing has changed, and how to go on', async () => {
    const created = await emptyFixture();
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'No changes since your last commit. [f] shows all files.');
    expect(terminal.setup.captureCharFrame()).not.toContain('No changed file selected');
    // The keys row offers the way on, and nothing that needs a file or a line.
    const keys = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-strip'));
    expect(keys).toContain('[f] all files');
    expect(keys).not.toContain('[a] new Message');
    expect(keys).not.toContain('[v] side-by-side');
    terminal.send('a');
    await waitFor(
      () =>
        renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-status-line')).includes(
          'Nothing has changed yet. Press f to show all files',
        ),
      'a explains the empty Review',
    );
  });

  it('does not let a superseded Home read failure overwrite its newer route', async () => {
    await emptyFixture();
    const workspace = new FailingHomeWorkspace('held');
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('k');
    terminal.send('\r');
    await waitForOutput(terminal, 'Previous Reviews FOCUSED');

    const unhandled: unknown[] = [];
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      terminal.send('G');
      await workspace.firstPagedReadStarted;
      terminal.send('G');
      await waitFor(async () => {
        await terminal.flush();
        return renderableTreeText(terminal.renderer.root).includes('65 files');
      }, 'successor Home route');
      workspace.failHeldRead();
      await new Promise(resolve => setTimeout(resolve, 20));
      await terminal.flush();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    const rendered = renderableTreeText(terminal.renderer.root);
    expect(unhandled).toEqual([]);
    expect(rendered).toContain('65 files');
    expect(rendered).not.toContain('Home unavailable');
  });

  it('treats same-directory Configuration rename as the save commit point', async () => {
    const created = await emptyFixture();
    const configurationPath = path.join(created.root, 'config', 'config.json');
    const fileConfiguration = createFileUserConfiguration(configurationPath);
    const saveResults: UserConfigurationSaveResult[] = [];
    const userConfiguration: UserConfiguration = {
      load: async () => await fileConfiguration.load(),
      saveReviewingPreferences: async preferences => {
        const result = await fileConfiguration.saveReviewingPreferences(preferences);
        saveResults.push(result);
        return result;
      },
      readMessageTemplate: async () => await fileConfiguration.readMessageTemplate(),
    };
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({
      workspace: new FailingHomeWorkspace('immediate'),
      renderer: terminal.renderer,
      userConfiguration,
    });
    applications.add(application);

    const accessDescriptor = Object.getOwnPropertyDescriptor(fs, 'access');
    if (accessDescriptor === undefined) throw new Error('fs.access descriptor missing');
    let accessAttempts = 0;
    Object.defineProperty(fs, 'access', {
      ...accessDescriptor,
      value: async (): Promise<void> => {
        accessAttempts += 1;
        throw new Error('injected post-rename access failure');
      },
    });
    const checkpoint = terminal.checkpoint();
    try {
      await application.start();
      terminal.send('c');
      await waitForOutput(terminal, 'Configuration');
      terminal.send('l');
      terminal.send('\r');
      await waitForOutput(terminal, 'Settings saved.');
      await waitFor(() => saveResults.length > 0, 'Configuration save settlement');
      await new Promise(resolve => setTimeout(resolve, 0));
      await terminal.flush();
    } finally {
      Object.defineProperty(fs, 'access', accessDescriptor);
    }

    expect(saveResults).toEqual([{ status: 'saved' }]);
    expect(accessAttempts).toBe(0);
    const saved = JSON.parse(await fsReadFile(configurationPath, 'utf8')) as {
      reviewing: { theme: { inherits?: string } };
    };
    expect(saved.reviewing.theme.inherits).toBe('quiet-graphite');
    // POSIX mode; Windows keeps Configuration private by access list.
    if (process.platform !== 'win32') expect((await fs.stat(configurationPath)).mode & 0o777).toBe(0o600);
    expect(renderableTreeText(terminal.renderer.root)).not.toContain('Layout was not saved');
    expect(terminal.outputSince(checkpoint)).not.toContain('Layout was not saved');
  });

  it('follows a light or dark terminal under the default Match terminal theme', async () => {
    const created = await emptyFixture();
    const userConfiguration = createFileUserConfiguration(path.join(created.root, 'config', 'config.json'));
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({
      workspace: new FailingHomeWorkspace('immediate'),
      renderer: terminal.renderer,
      userConfiguration,
    });
    applications.add(application);
    const reportBackground = (rgb: string): void => {
      terminal.renderer.stdin.emit('data', Buffer.from(`\u001b]11;rgb:${rgb}\u0007`));
    };
    const overlayBackground = (): RGBA | undefined =>
      (terminal.renderer.root.findDescendantById('reviewing-configuration-overlay') as BoxRenderable | undefined)
        ?.backgroundColor;

    await application.start();
    terminal.send('c');
    await waitForOutput(terminal, 'Match terminal');
    expect(overlayBackground()?.equals(RGBA.fromHex(QUIET_GRAPHITE.raised))).toBe(true);

    reportBackground('f5f5/f7f7/f9f9');
    await waitFor(() => overlayBackground()?.equals(RGBA.fromHex(QUIET_PAPER.raised)) === true, 'light terminal');
    const description = terminal.renderer.root.findDescendantById('reviewing-configuration-description');
    expect(description === undefined ? '' : renderableTreeText(description)).toContain('Now: Quiet Paper.');

    reportBackground('0d0d/1010/1414');
    await waitFor(() => overlayBackground()?.equals(RGBA.fromHex(QUIET_GRAPHITE.raised)) === true, 'dark terminal');
  });

  it('keeps Configuration one size and in one place while settings move and change', async () => {
    const created = await emptyFixture();
    const userConfiguration = createFileUserConfiguration(path.join(created.root, 'config', 'config.json'));
    // Narrow enough that some descriptions wrap to two rows and others fit on one.
    const terminal = await ScriptedTerminal.create(60, 30);
    const application = createReviewingApplicationForTest({
      workspace: new FailingHomeWorkspace('immediate'),
      renderer: terminal.renderer,
      userConfiguration,
    });
    applications.add(application);
    const geometry = (): string => {
      const overlay = terminal.renderer.root.findDescendantById('reviewing-configuration-overlay') as
        | BoxRenderable
        | undefined;
      return overlay === undefined ? 'closed' : `${overlay.screenY}:${overlay.height}`;
    };

    await application.start();
    terminal.send('c');
    await waitForOutput(terminal, 'Match terminal');
    await terminal.flush();
    const opened = geometry();
    expect(opened).not.toBe('closed');
    const seen = new Set<string>([opened]);
    // Every setting, then every value of the two-way settings and back.
    for (const keys of ['j', 'l', 'l', 'j', 'l', 'l', 'l', 'j', 'l', 'l', 'j', 'l', 'l', 'j', 'l', 'l', 'j']) {
      terminal.send(keys);
      await terminal.flush();
      seen.add(geometry());
    }
    expect([...seen]).toEqual([opened]);
  });

  it('keeps the added and removed row tint on the terminal background', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const configurationPath = path.join(created.root, 'terminal-background-config.json');
    await writeFile(configurationPath, JSON.stringify({ version: 1, reviewing: { background: 'terminal' } }));
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: terminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'new three');
    const rowBackground = (needle: string): RGBA | undefined =>
      (
        descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').find(row =>
          renderableTreeText(row).includes(needle),
        ) as BoxRenderable | undefined
      )?.backgroundColor;

    // The surfaces give way to the terminal; the state washes don't.
    expect(rowBackground('new three')?.equals(RGBA.fromHex(QUIET_GRAPHITE.successSoft))).toBe(true);
    expect(rowBackground('old three')?.equals(RGBA.fromHex(QUIET_GRAPHITE.dangerSoft))).toBe(true);
    expect(rowBackground('shared')?.a).toBe(0);
  });

  it('shows pending before Workspace I/O and leaves a retained Review without Finish ceremony', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'second.txt'), 'captured second\n');
    await Promise.all(
      Array.from({ length: 24 }, (_, index) =>
        writeFile(
          path.join(created.checkout, `generated-${String(index).padStart(2, '0')}.ts`),
          `export const generated${index} = ${index};\n`,
        ),
      ),
    );
    const owner = await open(created.checkout);
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace: timed, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, '[?] keys');
    const homeFrame = terminal.writes.at(-1)?.data ?? '';
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'))).toContain(
      'BuildFrame / Home',
    );
    expect(terminal.renderer.useMouse).toBe(true);
    expect(homeFrame.match(/\[\?\] keys/gu)).toHaveLength(1);
    expect(homeFrame).not.toContain('KEYBOARD CONTROLS');
    expect(homeFrame).not.toContain('[s] start new Review');
    terminal.send('!');
    await waitForOutput(terminal, 'Action checks from state');
    terminal.send('!');
    await terminal.flush();
    terminal.send(' ');
    await waitForOutput(terminal, ' KEYS ');
    expect(terminal.setup.captureCharFrame()).not.toContain('Action checks from state');
    const homeActions = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-lookup'));
    expect(homeActions).toContain('[j/k] Move');
    expect(homeActions).toContain('[Enter] Open');
    terminal.send('\r');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(0);
    const checkpoint = terminal.checkpoint();
    const sentAt = terminal.send('\r');
    await waitForOutput(terminal, 'Saving a snapshot of the code…', checkpoint);
    const pendingWrite = terminal.writes
      .slice(checkpoint)
      .find(write => write.data.includes('Saving a snapshot of the code…'));
    expect(pendingWrite?.at).toBeGreaterThanOrEqual(sentAt);
    expect(pendingWrite?.at).toBeLessThan(timed.executeStartedAt ?? Number.POSITIVE_INFINITY);
    expect(pendingWrite?.data).toContain('Opening the Current Review');
    expect(pendingWrite?.data).not.toContain('Current Review · ');
    await waitForOutput(terminal, 'Current Review · ', checkpoint);
    const frame = terminal.writes.at(-1)?.data ?? '';
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'))).toContain('LIVE CHANGES');
    expect(frame).toContain('Current Review · ');
    expect(frame).toContain('[a] new Message');
    expect(frame).not.toContain('finish review');
    expect(frame).not.toContain('answered');
    terminal.send(' ');
    await waitForOutput(terminal, ' KEYS ');
    const reviewActions = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-lookup'));
    expect(reviewActions).toContain('[a] New Message on the selected line');
    expect(reviewActions).toContain('[ and ] Step through history');
    expect(reviewActions).not.toContain('[C] Continue this comparison');
    terminal.send('\u001b');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    terminal.resize(100, 50);
    await terminal.flush();
    terminal.send('/');
    await waitForOutput(terminal, 'Search this Review');
    await waitFor(async () => {
      await terminal.flush();
      return (terminal.renderer.root.findDescendantById('reviewing-search')?.screenY ?? 0) > 0;
    }, 'positioned search dialog');
    const searchGeometry = (): { x: number; y: number; width: number; height: number } => {
      const dialog = terminal.renderer.root.findDescendantById('reviewing-search');
      if (dialog === undefined) throw new Error('Review search dialog missing');
      return { x: dialog.screenX, y: dialog.screenY, width: dialog.width, height: dialog.height };
    };
    const emptySearchGeometry = searchGeometry();
    terminal.send('one');
    await waitForOutput(terminal, '2 matches');
    await waitFor(async () => {
      await terminal.flush();
      return renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-search')).includes('old one');
    }, 'first search preview');
    expect(searchGeometry()).toEqual(emptySearchGeometry);
    terminal.pressArrow('down');
    await terminal.flush();
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-search'))).not.toContain('Loading');
    expect(searchGeometry()).toEqual(emptySearchGeometry);

    // A tall terminal must not let result count exceed the dialog's fixed
    // inner height: the selected final result remains inside the border.
    terminal.pressKey('u', { ctrl: true });
    terminal.send('.ts');
    await waitForOutput(terminal, '24 matches');
    await waitFor(async () => {
      await terminal.flush();
      return renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-search')).includes(
        'export const generated0',
      );
    }, 'initial TypeScript search preview');
    terminal.pressArrow('down');
    await terminal.flush();
    const changingPreview = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-search'));
    expect(changingPreview).not.toContain('Loading');
    expect(changingPreview).toContain('export const generated0');
    await waitFor(async () => {
      await terminal.flush();
      return renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-search')).includes(
        'export const generated1',
      );
    }, 'replacement TypeScript search preview');
    for (let index = 2; index < 24; index += 1) {
      terminal.pressArrow('down');
      await terminal.flush();
    }
    const bottomResultLine = terminal.setup
      .captureCharFrame()
      .split('\n')
      .find(line => line.includes('generated-23.ts'));
    expect(bottomResultLine).toContain('›');
    expect(searchGeometry()).toEqual(emptySearchGeometry);

    // Enter opens the file from the exact saved source searched, even when the
    // corresponding working-tree file has drifted to a different identity.
    terminal.pressKey('u', { ctrl: true });
    terminal.send('second.txt');
    await waitForOutput(terminal, '1 match');
    await writeFile(path.join(created.checkout, 'second.txt'), 'drifted second\n');
    const openSearchCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Search result opened.', openSearchCheckpoint);
    expect(terminal.renderer.root.findDescendantById('reviewing-search')).toBeUndefined();
    const selectedFileLine = terminal.setup
      .captureCharFrame()
      .split('\n')
      .find(line => line.includes('›') && line.includes('second.txt'));
    expect(selectedFileLine).toBeDefined();
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'))).toContain('SNAPSHOT');

    const homeCheckpoint = terminal.checkpoint();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Continue Current Review', homeCheckpoint);
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(home.header.currentReviewIdentity).toBeDefined();
  });

  it('continues a frozen range only after an explicit moved-HEAD choice', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'range endpoint');
    const savedEndpoint = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim();
    const rangeBasis = (await gitOutput(created.checkout, 'rev-parse', 'HEAD^')).trim();
    const owner = await open(created.checkout);
    const range = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'application-fixed-range',
      expectedStateVersion: 0,
      selection: { kind: 'commit-to-head', revision: rangeBasis },
      expectedBasisObjectIdentity: rangeBasis,
      expectedComparedObjectIdentity: savedEndpoint,
    });
    if (range.kind !== 'review.comparison.started') {
      throw new Error('Application fixed range failed');
    }

    await writeFile(path.join(created.checkout, 'review.txt'), 'current head\n');
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'head moved before continuation');
    const currentHead = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim();
    await writeFile(path.join(created.checkout, 'review.txt'), 'effective working state\n');

    const timed = new TimedWorkspace(owner.workspace);
    const configurationPath = path.join(created.root, 'continuation-dialog-config.json');
    await writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        reviewing: { background: 'terminal' },
      }),
    );
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({
      workspace: timed,
      renderer: terminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, '[C] Choose where to continue.');
    expect(terminal.writes.at(-1)?.data).not.toContain('HEAD MOVED');

    const beforeChoice = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    terminal.send('C');
    await waitForOutput(terminal, 'CONTINUE REVIEW - SAVED RANGE / CURRENT HEAD');
    let continuationDialog = terminal.renderer.root.findDescendantById('reviewing-continuation-dialog') as unknown as {
      readonly backgroundColor: { readonly a: number };
      readonly width: number;
      readonly height: number;
    };
    expect(continuationDialog.backgroundColor.a).toBe(1);
    expect(continuationDialog.height).toBe(11);
    let continuationFrame = terminal.setup.captureCharFrame();
    expect(continuationFrame).toContain(rangeBasis.slice(0, 12));
    expect(continuationFrame).toContain(savedEndpoint.slice(0, 12));
    expect(continuationFrame).toContain(currentHead.slice(0, 12));
    expect(continuationFrame).toContain('› Stay with saved Review');
    expect(continuationFrame).toContain('No new Review; keep this range.');
    expect(continuationFrame).toContain('One new Review; keep saved Review.');
    expect(continuationFrame).toContain('[Tab/h/l] move focus');
    expect(continuationFrame).not.toContain('composite intent');
    expect(continuationFrame).not.toContain('effective-working-state');
    terminal.send(' ');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-continuation-dialog')).toBeDefined();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();

    const savedChoiceCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Stayed with the saved Review; no new Review was started.', savedChoiceCheckpoint);
    const afterSavedChoice = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(afterSavedChoice.stateVersion).toBe(beforeChoice.stateVersion);
    expect(afterSavedChoice.header.currentReviewIdentity).toBe(range.reviewIdentity);
    expect(timed.commands).toHaveLength(0);

    const cancelCheckpoint = terminal.checkpoint();
    terminal.send('C');
    await waitForOutput(terminal, 'CONTINUE REVIEW - SAVED RANGE / CURRENT HEAD', cancelCheckpoint);
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Cancelled; the saved Review is unchanged.', cancelCheckpoint);
    expect(timed.commands).toHaveLength(0);

    const currentChoiceCheckpoint = terminal.checkpoint();
    terminal.send('C');
    await waitForOutput(terminal, 'CONTINUE REVIEW - SAVED RANGE / CURRENT HEAD', currentChoiceCheckpoint);
    // A replaced tree destroys its old nodes, so read the dialog that is on screen now.
    continuationDialog = terminal.renderer.root.findDescendantById(
      'reviewing-continuation-dialog',
    ) as unknown as typeof continuationDialog;
    const wideDialogWidth = continuationDialog.width;
    const wideDialogHeight = continuationDialog.height;
    terminal.send('l');
    await terminal.flush();
    continuationFrame = terminal.setup.captureCharFrame();
    expect(continuationFrame).toContain('› Continue from current HEAD');
    continuationDialog = terminal.renderer.root.findDescendantById(
      'reviewing-continuation-dialog',
    ) as unknown as typeof continuationDialog;
    expect(continuationDialog.width).toBe(wideDialogWidth);
    expect(continuationDialog.height).toBe(wideDialogHeight);
    terminal.send('h');
    terminal.send('\t');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).toContain('› Continue from current HEAD');

    terminal.resize(80, 24);
    await terminal.flush();
    continuationDialog = terminal.renderer.root.findDescendantById(
      'reviewing-continuation-dialog',
    ) as unknown as typeof continuationDialog;
    expect(continuationDialog.width).toBeLessThanOrEqual(78);
    expect(continuationDialog.height).toBe(15);
    continuationFrame = terminal.setup.captureCharFrame();
    expect(continuationFrame).toContain(rangeBasis.slice(0, 12));
    expect(continuationFrame).toContain(savedEndpoint.slice(0, 12));
    expect(continuationFrame).toContain(currentHead.slice(0, 12));
    expect(continuationFrame).toContain('› Continue from current HEAD');
    expect(continuationFrame).toContain('[Tab/j/k] move focus');
    const narrowDialogWidth = continuationDialog.width;
    const narrowDialogHeight = continuationDialog.height;
    terminal.send('k');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).toContain('› Stay with saved Review');
    terminal.send('j');
    terminal.send('\t');
    terminal.send('\t');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).toContain('› Continue from current HEAD');
    continuationDialog = terminal.renderer.root.findDescendantById(
      'reviewing-continuation-dialog',
    ) as unknown as typeof continuationDialog;
    expect(continuationDialog.width).toBe(narrowDialogWidth);
    expect(continuationDialog.height).toBe(narrowDialogHeight);

    const continuationReadCheckpoint = timed.reads.length;
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ◆', currentChoiceCheckpoint);
    const continuationOutput = terminal.plainOutputSince(currentChoiceCheckpoint);
    expect(continuationOutput).not.toContain('Review and record the current workspace changes.');
    expect(continuationOutput).not.toContain('Continue Current Review');
    const continuationReads = timed.reads.slice(continuationReadCheckpoint);
    expect(timed.executeStartedAt).toBeDefined();
    expect(timed.commands).toHaveLength(1);
    expect(timed.commands[0]).toMatchObject({
      kind: 'review.comparison.continue-live',
      expectedStateVersion: beforeChoice.stateVersion,
      reviewIdentity: range.reviewIdentity,
      expectedReviewSnapshotIdentity: range.reviewSnapshotIdentity,
      expectedSavedEndpointObjectIdentity: savedEndpoint,
      expectedCurrentHeadObjectIdentity: currentHead,
    });
    expect(continuationReads.some(request => request.kind === 'workspace.home')).toBe(false);
    expect(continuationReads.some(request => request.kind === 'review.manifest')).toBe(true);

    const continuedHome = await owner.workspace.read({
      kind: 'workspace.home',
      offset: 0,
      limit: 64,
    });
    expect(continuedHome.currentReview).toMatchObject({
      continuedFromReviewIdentity: range.reviewIdentity,
      questions: 0,
    });
    expect(continuedHome.reviews.items[0]).toMatchObject({
      reviewIdentity: range.reviewIdentity,
      retention: 'previous',
    });
    expect((await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim()).toBe(currentHead);
    expect(await gitOutput(created.checkout, 'status', '--porcelain')).toContain('review.txt');
  });

  it('refreshes moved-HEAD continuation through the live Application', async () => {
    const created = await fixture();
    await git(created.checkout, 'add', 'review.txt');
    await git(created.checkout, 'commit', '-qm', 'range endpoint');
    const savedEndpoint = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim();
    const rangeBasis = (await gitOutput(created.checkout, 'rev-parse', 'HEAD^')).trim();

    const owner = await open(created.checkout);
    const range = await owner.workspace.execute({
      kind: 'review.comparison.start',
      commandIdentity: 'application-live-runtime-fixed-range',
      expectedStateVersion: 0,
      selection: { kind: 'commit-to-head', revision: rangeBasis },
      expectedBasisObjectIdentity: rangeBasis,
      expectedComparedObjectIdentity: savedEndpoint,
    });
    if (range.kind !== 'review.comparison.started') {
      throw new Error('Application fixed range failed');
    }
    await writeFile(path.join(created.checkout, 'review.txt'), 'working state before range\n');
    const originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
    const runtimeDirectory = path.join(created.root, 'runtime');
    await mkdir(runtimeDirectory, { recursive: true, mode: 0o700 });
    process.env.XDG_RUNTIME_DIR = runtimeDirectory;
    const runtime = await startLocalRuntimeServer({
      workspace: owner.workspace,
      runtimeGeneration: `rtg_${randomUUID()}` as RuntimeGeneration,
      runtimeCodeIdentity: `rtc_${'1'.repeat(64)}` as RuntimeCodeIdentity,
      allowedRoles: ['tui'],
    });
    const connectionLifetime = new AbortController();
    const connected = await connectWorkspaceRuntime({
      workspaceIdentity: owner.workspaceIdentity,
      role: 'tui',
      signal: connectionLifetime.signal,
    });
    expect(connected.status).toBe('connected');
    if (connected.status !== 'connected') throw new Error('Runtime client was rejected');

    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({
      workspace: connected.workspace,
      renderer: terminal.renderer,
    });
    applications.add(application);
    try {
      await application.start();
      await waitForOutput(terminal, '[C] Continue from HEAD');

      await writeFile(path.join(created.checkout, 'review.txt'), 'current head\n');
      await git(created.checkout, 'add', 'review.txt');
      await git(created.checkout, 'commit', '-qm', 'head moved while range is open');
      await writeFile(path.join(created.checkout, 'review.txt'), 'effective working state\n');

      const movedCheckpoint = terminal.checkpoint();
      await waitForOutput(terminal, '[C] Choose where to continue.', movedCheckpoint);
      expect(terminal.writes.at(-1)?.data).not.toContain('HEAD MOVED');
      terminal.send('C');
      await waitForOutput(terminal, 'CONTINUE REVIEW - SAVED RANGE / CURRENT HEAD', movedCheckpoint);
      expect(terminal.renderer.root.findDescendantById('reviewing-continuation-dialog')).toBeDefined();
    } finally {
      await application.stop();
      applications.delete(application);
      connectionLifetime.abort();
      await runtime.dispose();
      if (originalRuntimeDirectory === undefined) delete process.env.XDG_RUNTIME_DIR;
      else process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    }
  });

  it('selects clicked Files and Diff rows through the bounded Review projection', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'zeta.txt'), 'old zeta\n');
    await git(created.checkout, 'add', 'zeta.txt');
    await git(created.checkout, 'commit', '-qm', 'second tracked basis', '--', 'zeta.txt');
    await writeFile(path.join(created.checkout, 'zeta.txt'), 'new zeta\n');

    const owner = await open(created.checkout);
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({
      workspace: timed,
      renderer: terminal.renderer,
    });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForInitialReviewReconciliation(timed);

    const readCheckpoint = timed.reads.length;
    const clickStartedAt = performance.now();
    await terminal.clickRenderable('reviewing-file-row-2');
    let clickObservedAt = Number.POSITIVE_INFINITY;
    await waitFor(() => {
      const frame = terminal.setup.captureCharFrame();
      const visible =
        timed.reads.slice(readCheckpoint).some(request => request.kind === 'review.live-diff') &&
        descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').length >= 2 &&
        frame.includes('Diff FOCUSED') &&
        frame.split('\n').some(line => line.includes('› M') && line.includes('zeta.txt'));
      if (visible) clickObservedAt = performance.now();
      return visible;
    }, 'clicked file to become the visible Diff');
    const clickReads = timed.reads.slice(readCheckpoint).map(request => request.kind);
    // The idle neighbor warm-up may append prefetch reads; the click itself is
    // exactly one bounded Diff read and nothing else loads first.
    expect(clickReads[0]).toBe('review.live-diff');
    expect(clickReads.every(kind => kind === 'review.live-diff')).toBe(true);
    const clickedDiffRead = timed.readTimings
      .slice(readCheckpoint)
      .find(timing => timing.request.kind === 'review.live-diff');
    expect(clickedDiffRead?.completedAt).toBeDefined();
    if (clickedDiffRead?.completedAt === undefined) throw new Error('Clicked Diff read did not settle');
    // Bound Application scheduling and presentation independently of the real
    // Workspace/Git read, whose wall time is controlled by shared host load.
    const applicationElapsed =
      clickedDiffRead.startedAt - clickStartedAt + (clickObservedAt - clickedDiffRead.completedAt);
    expect(applicationElapsed).toBeLessThan(500);
    let frame = terminal.writes.at(-1)?.data ?? '';
    expect(frame.split('\n').find(line => line.includes('M  zeta.txt'))).toContain('›');

    // A projection refresh can land after the frame above and replace the
    // presented tree; the replacement is laid out on its own frame. Read the
    // row coordinates only from a laid-out tree, or the click below degrades
    // to a region click (WF-247).
    await waitFor(() => {
      const rows = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-');
      return rows.length >= 2 && rows[0]!.screenY > 0 && rows[1]!.screenY > 0;
    }, 'clicked Diff rows to be laid out');

    const diffRows = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-');
    expect(diffRows.length).toBeGreaterThanOrEqual(2);
    const alternatingIds = [diffRows[0]!.id, diffRows[1]!.id];
    const exactDiffRow = terminal.renderer.root.findDescendantById(alternatingIds[1]!);
    const diffPane = terminal.renderer.root.findDescendantById('reviewing-diff-pane');
    if (exactDiffRow === undefined || diffPane === undefined) {
      throw new Error('Diff pane and target row must be rendered');
    }
    for (const type of ['down', 'up'] as const) {
      diffPane.processMouseEvent(
        new OpenTUIMouseEvent(diffPane, {
          type,
          button: MouseButton.LEFT,
          x: exactDiffRow.screenX + 1,
          y: exactDiffRow.screenY,
          modifiers: { shift: false, alt: false, ctrl: false },
        }),
      );
    }
    const synchronouslySelected = terminal.renderer.root.findDescendantById(alternatingIds[1]!);
    const synchronousGutter = synchronouslySelected?.getChildren()[0] as TextRenderable | undefined;
    expect(synchronousGutter?.content.chunks.map(chunk => chunk.text).join('')).toContain('▌');
    await terminal.flush();
    frame = terminal.setup.captureCharFrame();
    expect(frame).toContain('Diff FOCUSED');
    expect(frame.split('\n').find(line => line.includes('new zeta'))).toContain('▌');

    const autonomousFrameCheckpoint = terminal.checkpoint();
    const otherRow = terminal.renderer.root.findDescendantById(alternatingIds[0]!);
    if (otherRow === undefined) throw new Error('Other Diff row must be rendered');
    await terminal.setup.mockMouse.click(otherRow.screenX + 1, otherRow.screenY);
    await waitFor(
      () =>
        terminal.writes
          .slice(autonomousFrameCheckpoint)
          .some(write => write.data.split('\n').some(line => line.includes('old zeta') && line.includes('▌'))),
      'one exact Diff click to commit its own frame',
    );

    for (let click = 0; click < 10; click += 1) {
      const id = alternatingIds[click % alternatingIds.length]!;
      const row = terminal.renderer.root.findDescendantById(id);
      if (row === undefined) throw new Error(`Diff row ${id} disappeared`);
      await terminal.setup.mockMouse.drag(row.screenX + 1, row.screenY, row.screenX + 2, row.screenY);
      await terminal.flush();
    }
    await waitForOutput(terminal, 'Diff FOCUSED');
    frame = terminal.writes.at(-1)?.data ?? '';
    expect(frame.split('\n').find(line => line.includes('new zeta'))).toContain('▌');

    const burstPositions = alternatingIds.map(id => {
      const row = terminal.renderer.root.findDescendantById(id);
      if (row === undefined) throw new Error(`Diff row ${id} is unavailable`);
      return { x: row.screenX + 1, y: row.screenY };
    });
    terminal.renderer.pause();
    for (let click = 0; click < 10; click += 1) {
      const position = burstPositions[click % burstPositions.length]!;
      await terminal.setup.mockMouse.click(position.x, position.y);
    }
    terminal.renderer.auto();
    await terminal.flush();
    frame = terminal.setup.captureCharFrame();
    expect(frame.split('\n').find(line => line.includes('new zeta'))).toContain('▌');
  });

  it('starts an empty-diff review on a clean checkout and keeps it after restart', async () => {
    const created = await emptyFixture();
    let owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(80, 24);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(home.stateVersion).toBe(1);
    const current = home.header.currentReviewIdentity;
    expect(current).toBeDefined();
    await application.stop();
    applications.delete(application);
    await owner.dispose();
    owners.delete(owner);
    owner = await open(created.checkout);
    const restarted = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(restarted.header.currentReviewIdentity).toBe(current);
  });

  it('reviews Changed and All files, previews exact Message bytes, sends once, and opens review points', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'unchanged.txt'), 'unchanged\n');
    await mkdir(path.join(created.checkout, 'notes'), { recursive: true });
    await writeFile(path.join(created.checkout, 'notes', 'deep.txt'), 'deep contents\nsecond line\nthird\n');
    await git(created.checkout, 'add', 'unchanged.txt', 'notes/deep.txt');
    await git(created.checkout, 'commit', '-qm', 'add unchanged files', '--', 'unchanged.txt', 'notes/deep.txt');
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: timed, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    expect(terminal.setup.captureCharFrame()).toContain('Files  Changed');
    expect(terminal.setup.captureCharFrame()).toContain('Diff FOCUSED');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    const body =
      'Why did this exact line change? 🙂 Please keep enough ordinary words here to exercise wrapping without losing the complete visible Message tail.';
    terminal.send(body);
    await terminal.flush();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    const exactOutgoing = `${body}\n\nreview.txt:1`;
    expect(terminal.setup.captureCharFrame()).toContain(`${Buffer.byteLength(exactOutgoing)} bytes`);
    expect(terminal.setup.captureCharFrame()).toContain(`${[...exactOutgoing].length} characters`);
    expect(terminal.setup.captureCharFrame()).toContain('Sends right away');
    expect(adapter.directives).toEqual([]);
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview');
    expect(terminal.setup.captureCharFrame()).not.toContain('Send to Pi');
    const sendCheckpoint = terminal.checkpoint();
    const inspectionCheckpoint = timed.readTimings.length;
    const sendStartedAt = terminal.send('\r');
    await waitForOutput(terminal, 'Checking', sendCheckpoint);
    const provisionalWrite = terminal.writes
      .slice(sendCheckpoint)
      .find(write => write.data.includes('local') && write.data.includes('Checking'));
    expect(provisionalWrite?.at).toBeGreaterThanOrEqual(sendStartedAt);
    expect((provisionalWrite?.at ?? Number.POSITIVE_INFINITY) - sendStartedAt).toBeLessThan(50);
    expect(provisionalWrite?.data).toContain('complete visible Message tail.');
    expect(adapter.directives).toEqual([]);
    await waitFor(
      () =>
        timed.readTimings
          .slice(inspectionCheckpoint)
          .some(timing => timing.request.kind === 'harness.review-message.inspect-default'),
      'one Message inspection read',
    );
    await waitFor(() => adapter.directives.length === 1, 'one exact Message directive');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Exact Message directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      exactOutgoing,
    );
    await waitForOutput(terminal, '#1 review.txt:1');
    const durableMessage = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1'));
    expect(durableMessage).toContain('Why did this exact line');
    // The Diff card beside History shows the whole Message, so History keeps a preview.
    const diffCard = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-expanded-message-card')).replace(
        /\s+/gu,
        ' ',
      );
    await waitFor(() => diffCard().includes('Message tail.'), 'whole Message in the Diff card');
    expect(durableMessage).not.toContain('Message tail.');
    // The outcome sentence shows once: whole in the Diff card, a one-line preview in History.
    await waitFor(() => diffCard().includes('Waiting for Pi fixture to start.'), 'outcome in the Diff card');
    expect(durableMessage).toContain('○ waiting');

    // A turn that ends without a Response shows how it ended, not "awaiting".
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'durable-message-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    // x asks the Harness to stop the selected Message's running turn.
    await waitFor(
      () => renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1')).length > 0,
      'running Message card',
    );
    // x interrupts only from the Messages pane.
    for (let tab = 0; tab < 3 && !/(Messages|History) FOCUSED/u.test(terminal.setup.captureCharFrame()); tab += 1) {
      terminal.send('\t');
      await terminal.flush();
    }
    terminal.send('x');
    await waitFor(
      () => adapter.directives.some(item => item.kind === 'harness.direct-invocation.interrupt'),
      'interrupt directive',
    );
    await waitFor(
      () =>
        renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1')).includes('stopping'),
      'stopping on the card',
    );
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'durable-message-terminal',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'interrupted',
      reason: 'interruption-observed',
    });
    await waitFor(
      () =>
        renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1')).includes(
          'Interrupted',
        ),
      'interrupted Message outcome',
    );

    terminal.send('f');
    await waitForOutput(terminal, 'Files FOCUSED  All');
    expect(terminal.setup.captureCharFrame()).toContain('unchanged.txt');
    expect(terminal.setup.captureCharFrame()).toContain('notes/');
    // j/k moves over folder nodes too, neo-tree style; h/l collapse in place.
    terminal.send('j');
    // A folder selection keeps the last file's Diff on screen.
    await waitForOutput(terminal, '› ▾ notes/');
    expect(terminal.setup.captureCharFrame()).toContain('old one');
    const deepFileRow = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-file-row-').find(row =>
      renderableTreeText(row).includes('deep.txt'),
    );
    if (deepFileRow === undefined) throw new Error('Nested unchanged file row missing');
    // A subscription refresh can install the next render tree during a frame;
    // click only once that current tree has acquired its presented geometry.
    await waitFor(async () => {
      await terminal.flush();
      const current = terminal.renderer.root.findDescendantById(deepFileRow.id);
      return current !== undefined && current.screenY > 0;
    }, 'nested unchanged file geometry');
    // Clicking a file while its folder owns the tree cursor must move that
    // cursor onto the file and load unchanged bytes into the Diff pane.
    await terminal.clickRenderable(deepFileRow.id);
    await waitForOutput(terminal, '1  deep contents');
    const selectedDeepFileRow = terminal.renderer.root.findDescendantById(deepFileRow.id);
    expect(renderableTreeText(selectedDeepFileRow).trimStart().startsWith('›')).toBe(true);
    // The content view has its own selected line (Diff focus); a composes there.
    terminal.send('j');
    await waitForOutput(terminal, '▌   2  second line');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · notes/deep.txt:2');
    terminal.send('\u001b');
    terminal.send('\t');
    terminal.send('\t');
    terminal.send('j');
    await waitForOutput(terminal, '1  unchanged');
    expect(terminal.setup.captureCharFrame()).toContain('j/k selects');
    // Hovering a changed file loads its Diff without an explicit Enter.
    terminal.send('k');
    terminal.send('k');
    terminal.send('k');
    await waitForOutput(terminal, 'new one');

    // Folders collapse in place and re-expand.
    terminal.send('j');
    const collapseCheckpoint = terminal.checkpoint();
    terminal.send('h');
    await waitForOutput(terminal, '▸ notes/', collapseCheckpoint);
    expect(terminal.setup.captureCharFrame()).not.toContain('deep.txt');
    terminal.send('l');
    await waitForOutput(terminal, '▾ notes/', collapseCheckpoint);
    expect(terminal.setup.captureCharFrame()).toContain('deep.txt');

    // H/L operate on every folder; L must not be captured by Return to Live Changes.
    terminal.send('H');
    await waitForOutput(terminal, 'All folders collapsed.');
    expect(terminal.setup.captureCharFrame()).not.toContain('deep.txt');
    terminal.send('L');
    await waitForOutput(terminal, 'All folders expanded.');
    expect(terminal.setup.captureCharFrame()).toContain('deep.txt');

    // Nerd Font icons are an explicit opt-in in Configuration.
    terminal.send('c');
    await waitForOutput(terminal, 'Icons');
    // Theme, Background, Arrangement, Panes, then Icons.
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('l');
    await waitForOutput(terminal, 'Nerd Font');
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Settings saved.');
    expect(terminal.setup.captureCharFrame()).toContain('\uf07c');

    terminal.send('t');
    await waitForOutput(terminal, 'Review points');
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    if (home.header.currentReviewIdentity === undefined) throw new Error('Current Review missing');
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: home.header.currentReviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review points unavailable');
    const candidate = bases.bases.items.find(
      item => item.kind === 'git-commit' && item.capture.status === 'capture-on-open',
    );
    if (candidate?.kind !== 'git-commit' || candidate.capture.status !== 'capture-on-open') {
      throw new Error('Uncaptured Git review point missing');
    }
    await terminal.clickRenderable(`reviewing-basis-${candidate.reviewBasisIdentity}`);
    await waitForOutput(terminal, `Review point ${candidate.source.commit.abbreviatedObjectIdentity}`);
    const versions = await owner.workspace.read({
      kind: 'review.versions',
      reviewIdentity: home.header.currentReviewIdentity,
      offset: 0,
      limit: 64,
    });
    expect(versions).toMatchObject({ status: 'available', versions: { total: 1 } });

    terminal.send('t');
    await waitForOutput(terminal, 'Review points');
    await terminal.clickRenderable(`reviewing-basis-${bases.liveReviewBasisIdentity}`);
    await waitFor(() => terminal.setup.captureCharFrame().includes('◆ ━━━━'), 'live history rail');
    expect(await gitOutput(created.checkout, 'status', '--porcelain')).toContain('review.txt');
  }, 30_000);

  it('keeps your place in the Diff while a Message saves and applies the moves typed meanwhile', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'Diff FOCUSED');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Keep my place');
    await waitForOutput(terminal, 'Keep my place');
    terminal.send('\r');
    await waitForOutput(terminal, 'Keys you press now wait until');
    terminal.send('j');
    terminal.send('j');
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') throw new Error('Message directive missing');
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toContain(
      'Keep my place',
    );
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).not.toContain(
      'Keep my placej',
    );
    // Focus never left the Diff, and the two moves landed after the save.
    await waitFor(() => /▌\s+3\s+- old three/u.test(terminal.setup.captureCharFrame()), 'moves applied after the save');
    expect(terminal.setup.captureCharFrame()).toContain('Diff FOCUSED');
  });

  it('drops moves typed during the check when sending stops for a confirmation', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'Diff FOCUSED');

    // A first Message whose turn BuildFrame loses track of makes the next one ask first.
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('First');
    await waitForOutput(terminal, 'First');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'first Message directive');
    await loseTurn(adapter, 0);
    await waitForOutput(terminal, 'BuildFrame never heard back about this Message');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Second');
    await waitForOutput(terminal, 'Second');
    terminal.send('\r');
    terminal.send('j');
    terminal.send('j');
    await waitForOutput(terminal, '[Enter] send it');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 2, 'confirmed Message directive');
    await waitForOutput(terminal, '#2 review.txt:1');
    await terminal.flush();
    // The confirmation needed attention, so the earlier moves were not applied.
    expect(terminal.setup.captureCharFrame()).toMatch(/▌\s+1 (?:●\d )?\+ new one/u);
    expect(terminal.setup.captureCharFrame()).toContain('Diff FOCUSED');
  });

  it('anchors a new Message to the selected Diff line even when another pane has focus', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    // The Review opens with the Diff focused; select review.txt:3.
    await waitForOutput(terminal, 'Diff FOCUSED');
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    // Leave the Diff: the highlighted line stays the anchor, not line 1.
    terminal.send('\t');
    await waitFor(() => !terminal.setup.captureCharFrame().includes('Diff FOCUSED'), 'focus left the Diff');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:3');
    // The composer opens beneath its line, not above it.
    const frame = terminal.setup.captureCharFrame();
    expect(frame.indexOf('new three')).toBeLessThan(frame.indexOf('New Message · review.txt:3'));
  });

  it('shows each selected Message inline in the Diff and follows Messages-pane navigation', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    const inlineCardText = (): string | undefined => {
      const card = terminal.renderer.root.findDescendantById('reviewing-expanded-message-card');
      return card === undefined ? undefined : renderableTreeText(card);
    };
    const selectedDiffRow = (needle: string): boolean =>
      descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').some(row => {
        if (!renderableTreeText(row).includes(needle)) return false;
        const background = (row as BoxRenderable).backgroundColor;
        // The accent wash while the Diff has focus; a neutral fill keeps the selection visible otherwise.
        return (
          background !== undefined &&
          (background.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft)) ||
            background.equals(RGBA.fromHex(QUIET_GRAPHITE.raised)))
        );
      });

    // First Message at review.txt:1 shows inline as soon as it is committed.
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('First inline anchor');
    await waitForOutput(terminal, 'First inline anchor');
    await terminal.flush();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'first Message directive');
    await waitForOutput(terminal, '#1 review.txt:1');
    await waitFor(() => (inlineCardText() ?? '').includes('First inline anchor'), 'first inline Message card');
    await waitFor(() => selectedDiffRow('new one'), 'first Message Diff row selection');

    // Settle the first Invocation so the second Message is committable.
    const firstDirective = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'inline-anchor-start-1',
      attachmentIdentity: firstDirective.attachmentIdentity,
      invocationIdentity: firstDirective.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'inline-anchor-terminal-1',
      attachmentIdentity: firstDirective.attachmentIdentity,
      invocationIdentity: firstDirective.invocationIdentity,
      outcome: 'ended-normally',
    });

    // Second Message at review.txt:3 renders at its own row.
    await focusPane(terminal, 'Diff');
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:3');
    terminal.send('Second inline anchor');
    await waitForOutput(terminal, 'Second inline anchor');
    await terminal.flush();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 2, 'second Message directive');
    await waitForOutput(terminal, '#2 review.txt:3');
    await waitFor(() => (inlineCardText() ?? '').includes('Second inline anchor'), 'second inline Message card');
    await waitFor(() => selectedDiffRow('new three'), 'second Message Diff row selection');

    // Messages-pane navigation follows the anchor into the Diff.
    // Sending keeps focus where you were; move to the Messages pane first.
    await focusPane(terminal, 'History');
    terminal.send('k');
    await waitFor(() => (inlineCardText() ?? '').includes('First inline anchor'), 'back to first inline card');
    await waitFor(() => selectedDiffRow('new one'), 'back to first Message Diff row');
    // With History focused, the Diff keeps its selection on a neutral fill; only the focused pane wears the accent.
    const firstRow = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').find(row =>
      renderableTreeText(row).includes('new one'),
    ) as BoxRenderable | undefined;
    expect(firstRow?.backgroundColor.equals(RGBA.fromHex(QUIET_GRAPHITE.raised))).toBe(true);
    terminal.send('j');
    await waitFor(() => (inlineCardText() ?? '').includes('Second inline anchor'), 'forward to second inline card');
    await waitFor(() => selectedDiffRow('new three'), 'forward to second Message Diff row');
  }, 300_000);

  it('opens a Review on the first listed file, not on a deleted one', async () => {
    const created = await fixture();
    // A committed file deleted in the working tree has no new side.
    await writeFile(path.join(created.checkout, 'zz-gone.txt'), 'remove me\n');
    await git(created.checkout, 'add', 'zz-gone.txt');
    await git(created.checkout, 'commit', '-qm', 'add a file to delete');
    await rm(path.join(created.checkout, 'zz-gone.txt'));
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitFor(() => terminal.setup.captureCharFrame().includes('› M  review.txt'), 'first listed file selected');
    expect(terminal.setup.captureCharFrame()).toContain('since last commit · review.txt');
    // A deleted file has no new side, so a Message names why instead of blaming a line.
    await focusPane(terminal, 'Files');
    terminal.send('j');
    await waitFor(() => terminal.setup.captureCharFrame().includes('› D  zz-gone.txt'), 'deleted file selected');
    await waitFor(() => terminal.setup.captureCharFrame().includes('- remove me'), 'deleted file Diff shown');
    terminal.send('a');
    await waitFor(
      () => terminal.setup.captureCharFrame().includes('This file was deleted, so it has no line to ask about.'),
      'deleted-file notice',
    );
    expect(terminal.setup.captureCharFrame()).not.toContain('New Message');
  });

  it('keeps routine edits Pewter and gives "here" no selection colours', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Why?');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'directive');
    await waitForOutput(terminal, 'edits before #1');
    await terminal.flush();
    const spans = terminal.setup.captureSpans().lines.flatMap(line => line.spans);
    const colorOf = (text: string): { fg: RGBA; bg: RGBA } | undefined => {
      const span = spans.find(candidate => candidate.text.includes(text));
      return span === undefined ? undefined : { fg: span.fg, bg: span.bg };
    };
    // Your own edits between answers are routine: Pewter, never the caution brass.
    expect(colorOf('edits before #1')?.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.muted))).toBe(true);
    // "now ◀ here" says what the Diff shows; the cursor's accent stays with the cursor.
    const here = colorOf('◀ here');
    expect(here?.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.accent))).toBe(false);
    expect(here?.bg.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft))).toBe(false);
  });

  it('keeps the opened file selected after j wraps around the Files list', async () => {
    const created = await fixture();
    await mkdir(path.join(created.checkout, 'src'), { recursive: true });
    await writeFile(
      path.join(created.checkout, 'src', 'queue.ts'),
      'export const first = 1;\nexport const second = 2;\n',
    );
    await git(created.checkout, 'add', 'src/queue.ts');
    await git(created.checkout, 'commit', '-qm', 'queue', '--', 'src/queue.ts');
    await writeFile(
      path.join(created.checkout, 'src', 'queue.ts'),
      'export const first = 1;\nexport const second = 3;\n',
    );
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    await owner.harnessAdapters.establish(
      new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout),
    );
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await focusPane(terminal, 'Files');
    // Past the last file, j wraps to the top; then on to src/queue.ts.
    for (let step = 0; step < 5; step += 1) terminal.send('j');
    terminal.send('\r');
    await waitForOutput(terminal, 'export const second = 3;');
    // Nothing that lands later (the wrap, the agent attaching) may move the
    // reader back to the first file.
    for (let tick = 0; tick < 40; tick += 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await terminal.flush();
      const frame = terminal.setup.captureCharFrame();
      expect(frame).toContain('since last commit · src/queue.ts');
      expect(frame).not.toContain('› M  review.txt');
    }
  });

  it('asks for a second Esc before discarding a draft with text', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const composerOpen = (): boolean =>
      terminal.renderer.root.findDescendantById('reviewing-question-composer') !== undefined;

    // An empty draft still closes on one Esc.
    terminal.send('a');
    await waitFor(composerOpen, 'composer open');
    terminal.send('\u001b');
    await waitFor(() => !composerOpen(), 'empty draft closed');

    terminal.send('a');
    await waitFor(composerOpen, 'composer reopened');
    terminal.send('Worth keeping');
    await waitForOutput(terminal, 'Worth keeping');
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Press Esc again to discard this draft.');
    expect(composerOpen()).toBe(true);
    // Typing again keeps the draft and disarms the discard.
    terminal.send('!');
    await waitForOutput(terminal, 'Worth keeping!');
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Press Esc again to discard this draft.');
    expect(composerOpen()).toBe(true);
    terminal.send('\u001b');
    await waitFor(() => !composerOpen(), 'draft discarded on the second Esc');
    await waitForOutput(terminal, 'Message discarded; nothing was sent.');
  });

  it('says a Message is saved, not sent, and replaces that with its outcome', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const statusLine = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-status-line'));

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Will this fail?');
    await waitForOutput(terminal, 'Will this fail?');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
    await waitFor(() => statusLine().includes('Saved. Waiting for Pi fixture to start.'), 'saved notice');
    expect(statusLine()).not.toContain('Sent');

    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'outcome-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    // Once the agent starts, the status line stops saying it is waiting.
    await waitFor(() => statusLine().includes('Pi fixture started #1.'), 'started notice');
    expect(statusLine()).not.toContain('Waiting');
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'outcome-terminal',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'failed',
      reason: 'harness-failed',
    } as never);
    await waitFor(() => statusLine().includes('#1 failed: Pi fixture reported an error.'), 'failure notice');
    expect(statusLine()).not.toContain('Saved');

    // A failed Message goes again from History with r: same line, same text,
    // nothing sent until Enter, and saved as a new Message.
    const actionStrip = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-strip'));
    for (let tab = 0; tab < 4 && !terminal.setup.captureCharFrame().includes('FOCUSED  1 Message'); tab += 1) {
      terminal.send('\t');
      await terminal.flush();
    }
    // The failed card names r where you're looking; the footer keeps its few keys.
    expect(actionStrip()).not.toContain('[r] send again');
    terminal.send('r');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    await waitFor(
      () => terminal.renderer.root.findDescendantById('reviewing-question-composer') !== undefined,
      'composer reopened',
    );
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-question-composer'))).toContain(
      'Will this fail?',
    );
    expect(statusLine()).toContain('Sending #1 again');
    expect(adapter.directives).toHaveLength(1);
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 2, 'second Message directive');
    await waitForOutput(terminal, '#2 review.txt:1');
  });

  it('shows how the newest Message stands when a Review holds more than 64 of them', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const started = await owner.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'many-messages-review',
      expectedStateVersion: home.stateVersion,
    });
    if (started.kind !== 'review.current-changes.started') throw new Error('Review did not start');
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
    // Saved through the Workspace directly: the same commit the composer makes, only faster.
    for (let index = 0; index < 66; index += 1) {
      const body = `Message ${index + 1} of many`;
      const inspection = await owner.workspace.read({
        kind: 'harness.review-message.inspect-default',
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: live.reviewBasisIdentity,
        location,
        body,
        // The commit itself still makes the full commitment-time check.
        purpose: 'preview',
      });
      if (inspection.status !== 'available') throw new Error(`Message ${index + 1} unavailable: ${inspection.reason}`);
      const committed = await owner.workspace.execute({
        kind: 'review.message.commit',
        commandIdentity: `many-messages-${index}`,
        expectedStateVersion: inspection.stateVersion,
        reviewIdentity: started.reviewIdentity,
        originReviewBasisIdentity: live.reviewBasisIdentity,
        location,
        body,
        attachmentIdentity: inspection.destination.attachmentIdentity,
        inspectionIdentity: inspection.inspectionIdentity,
        acceptedAcknowledgementRequirementIdentities: [],
      });
      if (committed.kind !== 'review.message.committed') throw new Error(`Message ${index + 1} was not saved`);
      await adapter.emit(
        index < 65
          ? {
              kind: 'harness.invocation.rejected',
              evidenceIdentity: `many-messages-refused-${index}`,
              attachmentIdentity: adapter.attachment.attachmentIdentity,
              invocationIdentity: committed.invocationIdentity,
              reason: 'harness-rejected',
            }
          : {
              kind: 'harness.invocation.start-observed',
              evidenceIdentity: `many-messages-start-${index}`,
              attachmentIdentity: adapter.attachment.attachmentIdentity,
              invocationIdentity: committed.invocationIdentity,
            },
      );
    }

    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const card = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-expanded-message-card'));
    const row = (ordinal: number): string =>
      card()
        .split('\n')
        .find(line => line.includes(`#${ordinal} · Message ${ordinal} of many`))
        ?.trimEnd() ?? '';
    await waitFor(() => row(1) !== '', 'first Message card');
    expect(row(1)).toMatch(/✗ not sent$/u);
    // Up from the first Message wraps to the newest, #66: both it and #65 lie past the first 64 Handoffs.
    await focusPane(terminal, 'History');
    terminal.send('k');
    await waitFor(() => row(66) !== '', 'newest Message card');
    expect(row(66)).toMatch(/ working$/u);
    expect(row(65)).toMatch(/✗ not sent$/u);
    expect(card()).not.toContain('waiting');
  }, 300_000);

  it('opens and resends a Message on the last file of a long Files list', async () => {
    // More files than the old 64-file windows; the Message's file sorts last.
    const created = await fixture('zz-last.txt');
    await Promise.all(
      Array.from({ length: 70 }, (_, index) =>
        writeFile(path.join(created.checkout, `a${String(index).padStart(3, '0')}.txt`), `file ${index}\n`),
      ),
    );
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const frame = (): string => terminal.setup.captureCharFrame();
    const statusLine = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-status-line'));
    const focus = async (pane: RegExp): Promise<void> => {
      for (let tab = 0; tab < 4 && !pane.test(frame()); tab += 1) {
        terminal.send('\t');
        await terminal.flush();
      }
      await waitFor(() => pane.test(frame()), `${pane.source} focus`);
    };

    // Write a Message on the last file, past the first window of the list.
    await focus(/Files FOCUSED/u);
    terminal.send('G');
    await waitFor(() => frame().includes('Diff  since last commit · zz-last.txt'), 'last file shown');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · zz-last.txt:1');
    terminal.send('Why this line?');
    await waitForOutput(terminal, 'Why this line?');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
    await waitForOutput(terminal, '#1 zz-last.txt:1');

    // Back to the top of the list.
    await focus(/Files FOCUSED/u);
    terminal.send('g');
    await waitFor(() => frame().includes('Diff  since last commit · a000.txt'), 'first file shown');

    // The whole list is loaded, so selecting it in History shows its file at once.
    await focus(/(History|Messages) FOCUSED/u);
    terminal.send('k');
    await waitFor(() => frame().includes('Diff  since last commit · zz-last.txt'), 'Message file');
    terminal.send('\r');
    await waitFor(() => frame().includes('Diff FOCUSED  since last commit · zz-last.txt'), 'Diff on the Message file');
    await waitFor(() => statusLine().includes('#1 · zz-last.txt:1'), 'landing notice');
    expect(statusLine()).not.toContain('outside the loaded');

    // The agent's turn fails, so #1 can be sent again.
    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'outside-window-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'outside-window-terminal',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'failed',
      reason: 'harness-failed',
    } as never);
    await waitFor(() => statusLine().includes('#1 failed'), 'failure notice');

    // The failed card says "Press r", and r works from Files too; w says where it works.
    await focus(/Files FOCUSED/u);
    terminal.send('w');
    await waitFor(() => statusLine().includes('Press Tab to reach the Diff, then press w'), 'w hint');

    // With the file unloaded again, r from Files loads it and reopens the draft there.
    terminal.send('g');
    await waitFor(() => frame().includes('Diff  since last commit · a000.txt'), 'first file shown again');
    terminal.send('r');
    await waitFor(() => statusLine().includes('Sending #1 again'), 'send-again draft');
    expect(frame()).toContain('zz-last.txt');
    expect(statusLine()).not.toContain('isn’t in this Review');
    expect(statusLine()).not.toContain('has no changes now');
  });

  it('keeps the selected Diff line when an answer lands and the file changes', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'Diff FOCUSED');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Rename the first line');
    await waitForOutput(terminal, 'Rename the first line');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
    await waitForOutput(terminal, '#1 review.txt:1');

    // Read further down while the agent works.
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    const onLineThree = (): boolean => /▌\s+3\s+\+ new three/u.test(terminal.setup.captureCharFrame());
    await waitFor(onLineThree, 'cursor on line 3');

    // The agent edits the file and answers: the Review refreshes underneath.
    await writeFile(path.join(created.checkout, 'review.txt'), 'renamed by the agent\nshared\nnew three\n');
    await waitForOutput(terminal, 'renamed by the agent');
    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'keep-place-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'keep-place-terminal',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body: 'Renamed it.',
        byteLength: Buffer.byteLength('Renamed it.'),
        sha256: createHash('sha256').update('Renamed it.').digest('hex'),
      },
    });
    await waitForOutput(terminal, 'Renamed it.');
    await terminal.flush();
    expect(onLineThree()).toBe(true);
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:3');
  });

  it('names a commit made while answering and still shows what changed', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'since last commit · review.txt');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:');
    terminal.send('Tidy this and commit it');
    await waitForOutput(terminal, 'Tidy this and commit it');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'directive');

    // While answering, the agent edits the file and commits everything.
    await writeFile(path.join(created.checkout, 'review.txt'), 'tidied one\nshared\nnew three\n');
    const previous = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim().slice(0, 7);
    await git(created.checkout, 'add', '.');
    await git(created.checkout, 'commit', '-qm', 'Tidy review');
    const short = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim().slice(0, 7);
    const directive = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'commit-while-answering-start',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
    });
    const body = 'Tidied and committed.';
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'commit-while-answering-terminal',
      attachmentIdentity: directive.attachmentIdentity,
      invocationIdentity: directive.invocationIdentity,
      outcome: 'ended-normally',
      result: {
        contractVersion: 1,
        contractIdentity: 'pi-settled-final-assistant-review-response-v1',
        source: 'settled-final-assistant-text',
        body,
        byteLength: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
      },
    });

    // The moment is said once on the status line, after the answer.
    await waitForOutput(terminal, `answered #1. “Tidy review” (${short}) was committed during #1.`);
    // Live changes are empty now; the Diff names the commit that took them and the way on.
    await waitForOutput(terminal, `No changes since “Tidy review” (${short})`);
    await waitForOutput(terminal, '[ and ] history shows what changed');
    await waitForOutput(terminal, `since ${short} · no changes`);
    // History's Message says code changed and names the commit, in its own short form.
    const historyText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-messages-viewport'))
        .replace(/[│┃]/gu, ' ')
        .replace(/\s+/gu, ' ');
    await waitFor(
      () => historyText().includes(`Code changed while answering · committed ${short}`),
      'changed-code note names the commit',
    );
    // Once HEAD moved, start names its own commit rather than a second "last commit".
    await waitForOutput(terminal, `start · ${previous}`);
    const railText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-history-rail')).replace(/\s+/gu, ' ');
    await waitFor(() => railText().includes('#1◆'), 'rail marks the commit on #1');

    // [ shows everything that changed while #1 was answered, committed or not; the commit leads.
    const checkpoint = terminal.checkpoint();
    terminal.send('[');
    await waitForOutput(terminal, 'during #1 · review.txt', checkpoint);
    await waitForOutput(terminal, 'tidied one', checkpoint);
    await waitForOutput(terminal, `“Tidy review” (${short}) was committed during #1. Everything`, checkpoint);
  });

  it('says whether the agent changed code while answering and shows what it changed', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    // The Diff says what it compares in plain words.
    await waitForOutput(terminal, 'since last commit · review.txt');

    const answer = async (index: number, body: string): Promise<void> => {
      const directive = adapter.directives[index]!;
      await adapter.emit({
        kind: 'harness.invocation.start-observed',
        evidenceIdentity: `code-change-start-${index}`,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
      });
      await adapter.emit({
        kind: 'harness.invocation.terminal-observed',
        evidenceIdentity: `code-change-terminal-${index}`,
        attachmentIdentity: directive.attachmentIdentity,
        invocationIdentity: directive.invocationIdentity,
        outcome: 'ended-normally',
        result: {
          contractVersion: 1,
          contractIdentity: 'pi-settled-final-assistant-review-response-v1',
          source: 'settled-final-assistant-text',
          body,
          byteLength: Buffer.byteLength(body),
          sha256: createHash('sha256').update(body).digest('hex'),
        },
      });
    };
    const send = async (text: string, count: number): Promise<void> => {
      terminal.send('a');
      await waitForOutput(terminal, 'New Message · review.txt:');
      terminal.send(text);
      await waitForOutput(terminal, text);
      terminal.send('\r');
      await waitFor(() => adapter.directives.length === count, `directive ${count}`);
    };
    const cardText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-expanded-message-card'));
    const selectedDiffRow = (needle: string): boolean =>
      descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').some(row => {
        if (!renderableTreeText(row).includes(needle)) return false;
        const background = (row as BoxRenderable).backgroundColor;
        // The accent wash while the Diff has focus; a neutral fill keeps the selection visible otherwise.
        return (
          background !== undefined &&
          (background.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft)) ||
            background.equals(RGBA.fromHex(QUIET_GRAPHITE.raised)))
        );
      });

    // The agent edits a file while answering the first Message.
    await send('Please rename this', 1);
    await writeFile(path.join(created.checkout, 'review.txt'), 'renamed by the agent\nshared\nnew three\n');
    await answer(0, 'Renamed it.');
    await waitFor(() => cardText().includes('Code changed while answering'), 'changed-code note');
    // The Files pane marks the file as changed while #1 was answered.
    await waitForOutput(terminal, 'review.txt  ●1  ✎#1');
    expect(cardText()).toContain('Renamed it.');

    // A second answer that leaves the code alone says so.
    await focusPane(terminal, 'Diff');
    await send('Why this name?', 2);
    await answer(1, 'Because it is clearer.');
    await waitFor(() => cardText().includes('No code changes'), 'no-code-change note');

    // Someone edits the file again after both answers.
    await writeFile(path.join(created.checkout, 'review.txt'), 'renamed by hand\nshared\nnew three\n');
    await waitForOutput(terminal, 'renamed by hand');

    // At now, the header rail is thick from start to now.
    const railText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-history-rail')).replace(/\s+/gu, ' ');
    await waitFor(() => railText().includes('◆ ━━━━ ○ ━━━━ #1 ━━━━ #2 ━━━━ ○ ━━━━ now'), 'rail at now');
    // Lines with Messages carry a mark in the code: both Messages sit on line 1.
    const lineMarks = (): string[] =>
      descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-line-messages-').map(mark =>
        renderableTreeText(mark).trim(),
      );
    await waitFor(() => lineMarks().includes('●2'), 'two Messages marked on their line');

    // Clicking a marker on the rail shows that step; clicking now comes back.
    // Markers count from start (0): ○ 1, #1 2, #2 3, ○ 4, now 5.
    let checkpoint = terminal.checkpoint();
    await terminal.clickRenderable('reviewing-history-rail-2');
    await waitForOutput(terminal, 'during #1 · review.txt', checkpoint);
    // #2 changed nothing, so its marker is not a target.
    expect(terminal.renderer.root.findDescendantById('reviewing-history-rail-3')).toBeFalsy();
    checkpoint = terminal.checkpoint();
    await terminal.clickRenderable('reviewing-history-rail-5');
    await waitForOutput(terminal, 'since last commit · review.txt', checkpoint);

    // [ steps back from now: first the edit outside answers, after #2.
    checkpoint = terminal.checkpoint();
    terminal.send('[');
    await waitForOutput(terminal, 'PAST · after #2 · review.txt', checkpoint);
    await waitFor(() => railText().includes('#2 ━━━━ ○ ──── now step 3 of 3'), 'rail on the last step');
    // The header never says live while a past step is shown.
    const headerText = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'));
    expect(headerText).toContain('PAST STEP');
    expect(headerText).not.toContain('LIVE');
    await waitForOutput(terminal, 'Changed outside any answer, most likely by you.', checkpoint);
    // The History pane gives way to the Diff at this width: the step keeps its
    // name and the here marker, and the file name is fitted between them.
    await waitFor(
      () => /edits after #2 · \S+ ◀ here/u.test(terminal.setup.captureCharFrame()),
      'shown step marked here',
    );
    expect(terminal.plainOutputSince(checkpoint)).toContain('[Esc] back to now');

    // Then #1's answer; #2 changed nothing, so [ skips it.
    checkpoint = terminal.checkpoint();
    terminal.send('[');
    await waitForOutput(terminal, 'during #1 · review.txt', checkpoint);
    await waitForOutput(terminal, 'Files  during #1', checkpoint);
    await waitForOutput(
      terminal,
      'Everything that changed while #1 was answered, by the agent or anyone else.',
      checkpoint,
    );
    // #1's own card opens beneath the line it was sent about, so the question
    // sits beside what changed because of it.
    await waitFor(() => cardText().includes('Please rename this'), "#1's card on its line");
    expect(cardText()).toContain('Renamed it.');
    // The first change is selected, and j/k move through the before → after rows.
    await waitFor(() => selectedDiffRow('new one'), 'first change selected');
    terminal.send('j');
    await waitFor(() => selectedDiffRow('renamed by the agent'), 'next change selected');

    // In the History pane, j and k walk the same steps.
    checkpoint = terminal.checkpoint();
    terminal.send('\t');
    await waitForOutput(terminal, 'History FOCUSED', checkpoint);
    terminal.send('j');
    await waitForOutput(terminal, 'after #2 · review.txt', checkpoint);

    // Writing a Message waits until you are back at now.
    checkpoint = terminal.checkpoint();
    terminal.send('a');
    await waitForOutput(terminal, 'Press Esc to come back to now first.', checkpoint);

    // ] past the newest step is now.
    checkpoint = terminal.checkpoint();
    terminal.send(']');
    await waitForOutput(terminal, 'Back to now: everything since the last commit.', checkpoint);
    await waitForOutput(terminal, 'since last commit · review.txt', checkpoint);

    // Esc from any step also returns to now.
    terminal.send('[');
    await waitForOutput(terminal, 'after #2 · review.txt', checkpoint);
    checkpoint = terminal.checkpoint();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'since last commit · review.txt', checkpoint);

    // With history, t only compares with a commit; answers are reached by stepping.
    const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    if (home.header.currentReviewIdentity === undefined) throw new Error('Current Review missing');
    const bases = await owner.workspace.read({
      kind: 'review.bases',
      reviewIdentity: home.header.currentReviewIdentity,
      offset: 0,
      limit: 64,
    });
    if (bases.status !== 'available') throw new Error('Review points unavailable');
    const answerPoint = bases.bases.items.find(item => item.kind === 'change-event');
    if (answerPoint === undefined) throw new Error('Answer review point missing');
    checkpoint = terminal.checkpoint();
    terminal.send('t');
    await waitForOutput(terminal, 'Review points', checkpoint);
    expect(terminal.renderer.root.findDescendantById(`reviewing-basis-${bases.liveReviewBasisIdentity}`)).toBeTruthy();
    expect(terminal.renderer.root.findDescendantById(`reviewing-basis-${answerPoint.reviewBasisIdentity}`)).toBeFalsy();
    terminal.send('\u001b');

    // On a narrow terminal the rail folds the middle into a count, keeping start and now.
    terminal.resize(72, 30);
    await waitFor(() => /◆ .*┄ \d+ ┄.* now/u.test(railText()), 'folded rail');
  }, 300_000);

  it('renders a Message anchored in an unchanged file at its content line', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'stable.txt'), 'alpha\nsecond stable line\nthird stable line\n');
    await git(created.checkout, 'add', 'stable.txt');
    await git(created.checkout, 'commit', '-qm', 'stable anchor source', '--', 'stable.txt');
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    const inlineCardText = (): string | undefined => {
      const card = terminal.renderer.root.findDescendantById('reviewing-expanded-message-card');
      return card === undefined ? undefined : renderableTreeText(card);
    };

    // Select the unchanged file in All scope and compose at its second line.
    terminal.send('f');
    await waitForOutput(terminal, 'Files FOCUSED  All');
    const stableRow = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-file-row-').find(row =>
      renderableTreeText(row).includes('stable.txt'),
    );
    if (stableRow === undefined) throw new Error('Unchanged file row missing');
    await waitFor(async () => {
      await terminal.flush();
      const current = terminal.renderer.root.findDescendantById(stableRow.id);
      return current !== undefined && current.screenY > 0;
    }, 'unchanged file geometry');
    await terminal.clickRenderable(stableRow.id);
    await waitForOutput(terminal, '1  alpha');
    terminal.send('j');
    await waitFor(
      () => /▌   2  (?:●\d |   )?second stable line/u.test(terminal.setup.captureCharFrame()),
      'line 2 selected',
    );
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · stable.txt:2');
    terminal.send('Anchor on unchanged line two');
    await waitForOutput(terminal, 'Anchor on unchanged line two');
    await terminal.flush();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'unchanged anchor directive');
    await waitForOutput(terminal, '#1 stable.txt:2');
    await waitFor(() => (inlineCardText() ?? '').includes('Anchor on unchanged line two'), 'unchanged anchor card');
    await waitFor(
      () => /▌   2  (?:●\d |   )?second stable line/u.test(terminal.setup.captureCharFrame()),
      'line 2 selected',
    );

    // Settle the first Invocation so the second Message is committable.
    const firstDirective = adapter.directives[0]!;
    await adapter.emit({
      kind: 'harness.invocation.start-observed',
      evidenceIdentity: 'unchanged-anchor-start-1',
      attachmentIdentity: firstDirective.attachmentIdentity,
      invocationIdentity: firstDirective.invocationIdentity,
    });
    await adapter.emit({
      kind: 'harness.invocation.terminal-observed',
      evidenceIdentity: 'unchanged-anchor-terminal-1',
      attachmentIdentity: firstDirective.attachmentIdentity,
      invocationIdentity: firstDirective.invocationIdentity,
      outcome: 'ended-normally',
    });

    // Second Message at the third line renders at its own content line.
    await focusPane(terminal, 'Diff');
    terminal.send('j');
    await waitFor(
      () => /▌   3  (?:●\d |   )?third stable line/u.test(terminal.setup.captureCharFrame()),
      'line 3 selected',
    );
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · stable.txt:3');
    terminal.send('Second unchanged anchor');
    await waitForOutput(terminal, 'Second unchanged anchor');
    await terminal.flush();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 2, 'second unchanged anchor directive');
    await waitForOutput(terminal, '#2 stable.txt:3');
    await waitFor(() => (inlineCardText() ?? '').includes('Second unchanged anchor'), 'second unchanged anchor card');
    await waitFor(
      () => /▌   3  (?:●\d |   )?third stable line/u.test(terminal.setup.captureCharFrame()),
      'line 3 selected',
    );

    // Messages-pane navigation follows each unchanged anchor.
    // Sending keeps focus where you were; move to the Messages pane first.
    await focusPane(terminal, 'History');
    terminal.send('k');
    await waitFor(() => (inlineCardText() ?? '').includes('Anchor on unchanged line two'), 'back to line-two card');
    await waitFor(
      () => /▌   2  (?:●\d |   )?second stable line/u.test(terminal.setup.captureCharFrame()),
      'line 2 selected',
    );
    terminal.send('j');
    await waitFor(() => (inlineCardText() ?? '').includes('Second unchanged anchor'), 'forward to line-three card');
    await waitFor(
      () => /▌   3  (?:●\d |   )?third stable line/u.test(terminal.setup.captureCharFrame()),
      'line 3 selected',
    );
  }, 300_000);

  it('keeps one Files row per folder when All mixes changed and unchanged files', async () => {
    const created = await fixture();
    await mkdir(path.join(created.checkout, 'src'), { recursive: true });
    await mkdir(path.join(created.checkout, 'docs'), { recursive: true });
    await writeFile(path.join(created.checkout, 'src', 'one.txt'), 'one\n');
    await writeFile(path.join(created.checkout, 'src', 'two.txt'), 'two before\n');
    await writeFile(path.join(created.checkout, 'docs', 'readme.md'), 'docs\n');
    await git(created.checkout, 'add', 'src/one.txt', 'src/two.txt', 'docs/readme.md');
    await git(created.checkout, 'commit', '-qm', 'nested files');
    await writeFile(path.join(created.checkout, 'src', 'two.txt'), 'two after\n');

    const owner = await open(created.checkout);
    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({ workspace: timed, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('f');
    await waitForOutput(terminal, 'Files FOCUSED  All');

    const selectedFilesRow = (): { readonly id: string; readonly text: string } | undefined => {
      const rows = [
        ...descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-directory-row-'),
        ...descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-file-row-'),
      ];
      const selected = rows.find(row => /^\s*[›>]/u.test(renderableTreeText(row)));
      return selected === undefined ? undefined : { id: selected.id, text: renderableTreeText(selected) };
    };
    // A debounced preview for a previous row must not race the walk, so each
    // step first reaches its row and then lets that row's reads settle.
    const settleSelection = async (needle: string): Promise<{ readonly id: string; readonly text: string }> => {
      await waitFor(() => (selectedFilesRow()?.text ?? '').includes(needle), `Files selection ${needle}`);
      await new Promise(resolve => setTimeout(resolve, 40));
      await waitFor(() => timed.inFlightReads === 0, `preview reads for ${needle} to settle`);
      await terminal.flush();
      const selected = selectedFilesRow();
      if (selected === undefined || !selected.text.includes(needle)) {
        throw new Error(`Files selection left ${needle}`);
      }
      return selected;
    };

    expect(
      descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-directory-row-').filter(row =>
        renderableTreeText(row).includes('src/'),
      ),
    ).toHaveLength(1);

    terminal.send('j');
    const walk = [await settleSelection('src/')];
    for (const needle of ['two.txt', 'one.txt', 'docs/', 'readme.md']) {
      terminal.send('j');
      walk.push(await settleSelection(needle));
    }
    expect(walk.filter(row => row.id.includes('directory-row-') && row.text.includes('src/'))).toHaveLength(1);
  }, 30_000);

  it('opens the preview immediately and cancels a pending inspection cleanly', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Frozen body.');
    await terminal.flush();

    terminal.pressKey('F3');
    await terminal.flush();
    // The overlay is up before the workspace inspection can answer.
    expect(terminal.setup.captureCharFrame()).toContain('Preview · preparing');
    expect(terminal.setup.captureCharFrame()).not.toContain('Preview · exactly what will be sent');

    // Cancelling a pending inspection must never reopen the dialog later.
    terminal.send('\u001b');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).not.toContain('Preview · preparing');
    await new Promise(resolve => setTimeout(resolve, 500));
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).not.toContain('Preview · ');

    const resolvedCheckpoint = terminal.checkpoint();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent', resolvedCheckpoint);
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'one exact directive after the pending cancel');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Pending-cancel directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      'Frozen body.\n\nreview.txt:1',
    );
  }, 60_000);

  it('offers the preview only once an agent is connected', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Hello there.');
    const frameShows = (text: string) => async (): Promise<boolean> => {
      await terminal.flush();
      return terminal.setup.captureCharFrame().includes(text);
    };
    await waitFor(frameShows('[Enter] send  [Esc] discard'), 'no preview key without an agent');
    expect(terminal.setup.captureCharFrame()).not.toContain('[F3]');

    // F3 explains instead of flashing a preview that closes on the refusal.
    terminal.pressKey('F3');
    await waitFor(frameShows('No coding agent has connected to this repository yet.'), 'F3 explains');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).not.toContain('Preview · ');
    expect(terminal.setup.captureCharFrame()).toContain('Hello there.');

    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    await waitFor(frameShows('[Enter] send  [F3] preview  [Esc] discard'), 'preview key once connected');
    const previewCheckpoint = terminal.checkpoint();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent', previewCheckpoint);
  }, 60_000);

  it('keeps the composer frozen while the exact preview is open', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('First line.');
    await terminal.flush();
    const previewCheckpoint = terminal.checkpoint();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent', previewCheckpoint);
    terminal.send('XYZ');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).toContain('Preview · exactly what will be sent');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'one frozen-preview directive');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Frozen preview directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      'First line.\n\nreview.txt:1',
    );
  }, 180_000);

  it('formats the outgoing Message with the user template file', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const configurationPath = path.join(created.root, 'config.json');
    await writeFile(
      messageTemplatePath(configurationPath),
      '## Review request\n\n{{message}}\n\nContext: \`{{location}}\`\n',
    );
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: terminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Please adjust this line.');
    await terminal.flush();
    const previewCheckpoint = terminal.checkpoint();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent', previewCheckpoint);
    const previewFrame = terminal.setup.captureCharFrame();
    expect(previewFrame).toContain('## Review request');
    expect(previewFrame).toContain('Context: \`review.txt:1\`');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview', previewCheckpoint);
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'one templated directive');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') {
      throw new Error('Templated directive missing');
    }
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      '## Review request\n\nPlease adjust this line.\n\nContext: \`review.txt:1\`\n',
    );
  }, 60_000);

  it('discloses workspace write before and after dispatching a Message', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(
      identity.workspaceIdentity,
      identity.canonicalCheckout,
      'workspace-write',
    );
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('Please adjust this line.');
    await terminal.flush();
    const previewCheckpoint = terminal.checkpoint();
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent', previewCheckpoint);
    expect(terminal.setup.captureCharFrame()).toContain('may edit your files');
    terminal.send('\u001b');
    await waitForOutput(terminal, '[Enter] send  [F3] preview', previewCheckpoint);
    const sendCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Pi fixture may edit your files.', sendCheckpoint);
    await waitFor(() => adapter.directives.length === 1, 'one workspace-write directive');
  }, 60_000);

  it('sends secret-looking text exactly as written, with no confirmation', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    const body = 'Is api_key = "abcdefghijklmnop" still valid? password = hunter2hunter2hunter2';
    terminal.send(body);
    await terminal.flush();
    const sendCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    // BuildFrame never scans what you wrote: it goes straight to the agent.
    await waitFor(() => adapter.directives.length === 1, 'Message directive');
    expect(terminal.plainOutputSince(sendCheckpoint)).not.toContain('Confirm before sending');
    const directive = adapter.directives[0];
    if (directive?.kind !== 'harness.direct-review-message.dispatch') throw new Error('Message directive missing');
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      `${body}\n\nreview.txt:1`,
    );
  }, 30_000);

  it('asks first only when an earlier turn never reported back, and previews exact bytes', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const identity = await owner.workspace.read({ kind: 'workspace.identity' });
    const adapter = new ScriptedDogfoodAdapter(identity.workspaceIdentity, identity.canonicalCheckout);
    await expect(owner.harnessAdapters.establish(adapter)).resolves.toMatchObject({ status: 'established' });
    const terminal = await ScriptedTerminal.create(132, 34);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    terminal.send('First');
    await waitForOutput(terminal, 'First');
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 1, 'first Message directive');
    await loseTurn(adapter, 0);
    await waitForOutput(terminal, 'BuildFrame never heard back about this Message');

    terminal.send('a');
    await waitForOutput(terminal, 'New Message · review.txt:1');
    const body = 'Did the first one land?';
    terminal.send(body);
    await terminal.flush();
    const gateCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Confirm before sending', gateCheckpoint);
    const gatedFrame = terminal.setup.captureCharFrame();
    expect(gatedFrame).toContain('! An earlier Message here never reported back.');
    expect(gatedFrame).toContain('Sending now may make Pi fixture do the same work twice.');
    expect(gatedFrame).toContain('It goes to Pi fixture · dogfood session.');
    expect(gatedFrame).toContain('[Enter] send it');
    expect(gatedFrame).not.toContain('Files  ');
    expect(adapter.directives).toHaveLength(1);

    // Going back returns to the unchanged draft without sending anything.
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Back to your draft; nothing was sent.');
    expect(terminal.setup.captureCharFrame()).toContain(body);
    expect(adapter.directives).toHaveLength(1);

    // F3 shows the exact outgoing bytes from inside the reopened gate without accepting anything.
    const reopenCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Confirm before sending', reopenCheckpoint);
    terminal.pressKey('F3');
    await waitForOutput(terminal, 'Preview · exactly what will be sent');
    const exactOutgoing = `${body}\n\nreview.txt:1`;
    expect(terminal.setup.captureCharFrame()).toContain(`${Buffer.byteLength(exactOutgoing)} bytes`);
    expect(terminal.setup.captureCharFrame()).toContain('Asks first: an earlier Message here never reported back.');
    expect(adapter.directives).toHaveLength(1);
    const gateReturnCheckpoint = terminal.checkpoint();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Confirm before sending', gateReturnCheckpoint);

    // Enter in the gate sends the exact bytes.
    terminal.send('\r');
    await waitFor(() => adapter.directives.length === 2, 'confirmed Message directive');
    await waitForOutput(terminal, '#2 review.txt:1');
    const directive = adapter.directives[1];
    if (directive?.kind !== 'harness.direct-review-message.dispatch')
      throw new Error('Gated Message directive missing');
    expect(Buffer.from(directive.disclosure.outgoingMaterial.bytesBase64, 'base64').toString('utf8')).toBe(
      exactOutgoing,
    );
  }, 30_000);

  it('frames Home like a Review: one pane under a context row, rows washed whole, words said once', async () => {
    const created = await fixture();
    await git(created.checkout, 'commit', '--allow-empty', '-qm', 'an empty commit');
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(70, 24);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'Home FOCUSED');
    let frame = terminal.setup.captureCharFrame();
    const rows = frame.split('\n');
    // Header, then the context row; the card sits centred in the body below, with the Review's frame.
    expect(rows[1]?.trim()).toBe('No Review open');
    const top = rows.findIndex(row => row.trimStart().startsWith('╭'));
    const bottom = rows.findIndex(row => row.trimStart().startsWith('╰'));
    expect(rows[top + 1]).toContain('▌ Home FOCUSED  2 choices');
    // Body rows run from under the context row to above the two-row footer.
    const above = top - 2;
    const below = 24 - 2 - (bottom + 1);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    expect(frame).not.toContain('BUILDFRAME');
    // The description wraps on whole words with its indent kept.
    expect(frame).toMatch(/│ {2}Everything since your last commit, including uncommitted +│\n│ {2}changes\. +│/u);

    // The selected row is washed across the pane and its text is Frost Text; only the cursor marks it.
    const choice = terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable;
    const washed = terminal.setup
      .captureSpans()
      .lines[choice.screenY]?.spans.filter(candidate => candidate.bg.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft)));
    // Inside the border and its one-cell padding, the wash fills every cell.
    expect(washed?.reduce((cells, candidate) => cells + displayCells(candidate.text), 0)).toBe(70 - 4);
    expect(washed?.every(candidate => candidate.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.text)))).toBe(true);

    // The commit picker uses the same pane, and an empty commit is said once, in grey, with its way on.
    terminal.send('j');
    terminal.send('\r');
    await waitForOutput(terminal, 'Commits FOCUSED');
    await waitForOutput(terminal, 'No changed files');
    frame = terminal.setup.captureCharFrame();
    expect(frame.split('\n')[1]?.trim()).toBe('No Review open');
    // The picker shares the launcher's column; at 70 columns that is the full width.
    expect(
      frame
        .split('\n')
        .find(row => row.includes('╭'))
        ?.indexOf('╭'),
    ).toBe(0);
    expect(frame).toContain('● One commit');
    expect(frame).toContain('○ Range up to HEAD');
    expect(frame).toContain('No changed files · [Tab] compares a range instead');
    expect(frame).not.toContain('That comparison contains no changed files.');
    expect(frame).not.toContain('Enter starts this Review');
  }, 60_000);

  it('centres Home as a card that keeps its column between views and while searching', async () => {
    const created = await fixture();
    for (const subject of ['first', 'second', 'third'])
      await git(created.checkout, 'commit', '--allow-empty', '-qm', subject);
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'Home FOCUSED');
    const card = (): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => {
      const pane =
        terminal.renderer.root.findDescendantById('reviewing-home-pane') ??
        terminal.renderer.root.findDescendantById('reviewing-comparison-pane') ??
        terminal.renderer.root.findDescendantById('reviewing-history-pane');
      return { x: pane?.screenX ?? -1, y: pane?.screenY ?? -1, width: pane?.width ?? -1, height: pane?.height ?? -1 };
    };
    const launcher = card();
    // A reading column, centred across the terminal.
    expect(launcher.width).toBe(76);
    expect(launcher.x).toBe((132 - 76) / 2);
    // Centred down the body: two rows above (header, context) and two below (keys).
    const above = launcher.y - 2;
    const below = 40 - 2 - (launcher.y + launcher.height);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);

    terminal.send('j');
    terminal.send('\r');
    await waitForOutput(terminal, 'Commits FOCUSED');
    await waitForComparisonReady(terminal);
    const picker = card();
    expect(picker.x).toBe(launcher.x);
    expect(picker.width).toBe(launcher.width);
    terminal.send('/');
    await waitForOutput(terminal, 'Search commit messages');
    terminal.send('third');
    await waitForOutput(terminal, '1/');
    // The search's taller footer never moves or resizes the card.
    expect(card()).toEqual(picker);
  }, 60_000);

  it('explains the commit picker where you look: a double-click opens it, a merge asks for a parent, errors stay in the card', async () => {
    const created = await fixture();
    const c = created.checkout;
    await git(c, 'add', '.');
    await git(c, 'commit', '-qm', 'Change review');
    await git(c, 'checkout', '-qb', 'side');
    await writeFile(path.join(c, 'side.txt'), 'side\n');
    await git(c, 'add', '.');
    await git(c, 'commit', '-qm', 'Side work');
    await git(c, 'checkout', '-q', '-');
    await writeFile(path.join(c, 'main.txt'), 'main\n');
    await git(c, 'add', '.');
    await git(c, 'commit', '-qm', 'Main work');
    await git(c, 'merge', '-q', '--no-ff', '-m', 'Merge side', 'side');
    const owner = await open(c);
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'Home FOCUSED');
    const status = (): string =>
      (
        terminal.renderer.root.findDescendantById('reviewing-status-line') as TextRenderable | undefined
      )?.plainText.trim() ?? '';
    const preview = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'));

    // One click selects; a second on the same choice opens it.
    await terminal.clickRenderable('reviewing-home-choice-comparison');
    expect(terminal.setup.captureCharFrame()).toContain('Home FOCUSED');
    await terminal.clickRenderable('reviewing-home-choice-comparison');
    await waitForOutput(terminal, 'Commits FOCUSED');

    // HEAD is a merge: the card says what to do, the keys row offers it, the status line stays quiet.
    await waitFor(async () => {
      await terminal.flush();
      return preview().includes('A merge has two parents. [h/l] picks which one to compare against.');
    }, 'merge explained in the card');
    expect(terminal.setup.captureCharFrame()).toContain('[h/l] parent');
    expect(status()).toBe('');
    terminal.send('l');
    await waitFor(async () => {
      await terminal.flush();
      return preview().includes('Commit  ') && preview().includes('Merge side');
    }, 'merge parent chosen');
    // Labels line up and the parent is named by its subject.
    expect(preview()).toMatch(/Parent {2}[0-9a-f]{12} (Main work|Side work)/u);

    // HEAD~N: the suggested 2 is replaced by what you type.
    terminal.send('n');
    await waitForOutput(terminal, 'Commits back from HEAD (HEAD~N)');
    expect(terminal.setup.captureCharFrame()).toContain('Type how many commits back from HEAD, from 1 to 500.');
    terminal.send('9');
    await terminal.flush();
    expect(terminal.setup.captureCharFrame()).toContain('> 9');
    terminal.send('\r');
    // Too far back: said in the card, not flashed in the status line.
    await waitFor(async () => {
      await terminal.flush();
      return preview().includes('This repository doesn’t have that many commits before HEAD.');
    }, 'ancestry error in the card');
    expect(status()).toBe('');
  }, 60_000);

  it('compares exactly what git compares: commit, range, merge parent and HEAD~N', async () => {
    const created = await fixture();
    const c = created.checkout;
    const commit = async (subject: string, files: Record<string, string>): Promise<void> => {
      for (const [name, body] of Object.entries(files)) await writeFile(path.join(c, name), body);
      await git(c, 'add', '.');
      await git(c, 'commit', '-qm', subject);
    };
    await commit('Add notes', { 'notes.md': 'first\n' });
    await commit('Expand notes', { 'notes.md': 'second\n', 'extra.txt': 'extra\n' });
    await git(c, 'checkout', '-qb', 'side');
    await commit('Side work', { 'side.txt': 'side\n' });
    await git(c, 'checkout', '-q', '-');
    await commit('Main work', { 'main.txt': 'main\n' });
    await git(c, 'merge', '-q', '--no-ff', '-m', 'Merge side', 'side');
    const changed = async (from: string, to: string): Promise<number> =>
      (await gitOutput(c, 'diff', '--name-only', from, to)).split('\n').filter(line => line.length > 0).length;
    const owner = await open(c);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'Home FOCUSED');
    terminal.send('j');
    terminal.send('\r');
    await waitForOutput(terminal, 'Commits FOCUSED');
    const preview = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'));
    const settle = async (expected: RegExp, label: string): Promise<string> => {
      await waitFor(async () => {
        await terminal.flush();
        return expected.test(preview());
      }, label);
      return preview();
    };
    const files = (text: string): number => Number(/(\d+) changed files?/u.exec(text)?.[1] ?? Number.NaN);
    const subjectOf = async (revision: string): Promise<string> =>
      (await gitOutput(c, 'log', '-1', '--format=%s', revision)).trim();

    // A merge against the parent l picks: git's HEAD^1.
    await settle(/A merge has two parents/u, 'merge awaits a parent');
    terminal.send('l');
    let shown = await settle(/Merge side[\s\S]*changed file/u, 'merge preview');
    const parent = /Parent {2}[0-9a-f]{12} (.+)/u.exec(shown)?.[1]?.trim();
    const parentRevision = parent === (await subjectOf('HEAD^1')) ? 'HEAD^1' : 'HEAD^2';
    expect(files(shown)).toBe(await changed(parentRevision, 'HEAD'));

    // One commit against its parent.
    const expand = (await gitOutput(c, 'rev-parse', 'HEAD~2')).trim();
    await terminal.clickRenderable(`reviewing-comparison-commit-${expand}`);
    shown = await settle(/Commit .*Expand notes[\s\S]*changed file/u, 'single commit');
    expect(files(shown)).toBe(await changed('HEAD~3', 'HEAD~2'));

    // Range from that commit up to HEAD.
    terminal.send('\t');
    shown = await settle(/Start .*Expand notes[\s\S]*changed file/u, 'range');
    expect(files(shown)).toBe(await changed('HEAD~2', 'HEAD'));

    // HEAD~N follows first parents, like git.
    for (const count of [2, 3]) {
      terminal.send('n');
      await waitForOutput(terminal, 'Commits back from HEAD (HEAD~N)');
      terminal.send(String(count));
      await terminal.flush();
      // While typing, the card says what Enter will do, never an older answer.
      expect(preview()).toContain('Enter compares HEAD~N up to HEAD.');
      expect(preview()).not.toContain('changed file');
      terminal.send('\r');
      const subject = await subjectOf(`HEAD~${count}`);
      shown = await settle(new RegExp(`Start .*${subject}[\\s\\S]*changed file`, 'u'), `HEAD~${count}`);
      expect(files(shown)).toBe(await changed(`HEAD~${count}`, 'HEAD'));
    }
  }, 90_000);

  it('click-selects stable Home choices, retains Previous, and reconstructs after restart', async () => {
    const created = await fixture();
    await git(created.checkout, 'commit', '--allow-empty', '-qm', 'comparison pointer choice');
    const comparisonHead = (await gitOutput(created.checkout, 'rev-parse', 'HEAD')).trim();
    const comparisonCommit = (await gitOutput(created.checkout, 'rev-parse', 'HEAD^')).trim();
    let owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const firstHome = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const first = firstHome.header.currentReviewIdentity;
    expect(first).toBeDefined();
    if (first === undefined) throw new Error('First Current Review missing');
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Continue Current Review');
    const launcherFrame = terminal.writes.at(-1)?.data ?? '';
    expect(launcherFrame).toContain('Start new Review');
    expect(launcherFrame).toContain('Previous Reviews (none yet)');
    expect(launcherFrame.match(/\[\?\] keys/gu)).toHaveLength(1);
    expect(launcherFrame).not.toContain('KEYBOARD CONTROLS');
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('k');
    await terminal.flush();
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-comparison') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('j');
    await terminal.flush();
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(firstHome.stateVersion);

    terminal.send('G');
    terminal.send('\r');
    await waitForComparisonReady(terminal);
    const comparisonActionStripRow = (): number =>
      terminal.renderer.root.findDescendantById('reviewing-action-strip')?.screenY ?? -1;
    const actionStripRow = comparisonActionStripRow();
    expect(actionStripRow).toBeGreaterThan(0);
    expect(
      (
        terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${comparisonHead}`) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('k');
    await waitForComparisonReady(terminal);
    expect(
      (
        terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${comparisonCommit}`) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'))).toContain(
      comparisonCommit.slice(0, 7),
    );
    expect(comparisonActionStripRow()).toBe(actionStripRow);
    terminal.send('j');
    await waitForComparisonReady(terminal);
    expect(
      (
        terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${comparisonHead}`) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'))).toContain(
      comparisonHead.slice(0, 7),
    );
    expect(comparisonActionStripRow()).toBe(actionStripRow);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(firstHome.stateVersion);
    terminal.send('j');
    await terminal.flush();
    expect(comparisonActionStripRow()).toBe(actionStripRow);
    await waitForComparisonReady(terminal);
    expect(comparisonActionStripRow()).toBe(actionStripRow);
    const keyboardReturnCheckpoint = terminal.checkpoint();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Continue Current Review', keyboardReturnCheckpoint);
    terminal.send('g');
    await terminal.flush();

    await terminal.clickRenderable('reviewing-home-choice-history');
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);

    await terminal.clickRenderable('reviewing-home-choice-comparison');
    const comparisonChoice = terminal.renderer.root.findDescendantById(
      'reviewing-home-choice-comparison',
    ) as TextRenderable;
    expect(comparisonChoice.plainText.trimStart().startsWith('›')).toBe(true);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(firstHome.stateVersion);
    const comparisonCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Commits FOCUSED', comparisonCheckpoint);
    await waitForComparisonReady(terminal);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'))).toContain('COMPARE');
    await terminal.flush();
    const comparisonActionStripY = terminal.renderer.root.findDescendantById('reviewing-action-strip')?.screenY;
    expect(comparisonActionStripY).toBeGreaterThan(0);
    expect(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')?.height).toBe(3);
    await terminal.clickRenderable(`reviewing-comparison-commit-${comparisonCommit}`);
    const selectedCommit = terminal.renderer.root.findDescendantById(
      `reviewing-comparison-commit-${comparisonCommit}`,
    ) as TextRenderable;
    expect(selectedCommit.plainText.trimStart().startsWith('›')).toBe(true);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'))).toContain(
      'Inspecting local commit comparison',
    );
    expect(terminal.renderer.root.findDescendantById('reviewing-action-strip')?.screenY).toBe(comparisonActionStripY);
    await waitForComparisonReady(terminal);
    expect(terminal.renderer.root.findDescendantById('reviewing-action-strip')?.screenY).toBe(comparisonActionStripY);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(firstHome.stateVersion);
    const launcherReturnCheckpoint = terminal.checkpoint();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Continue Current Review', launcherReturnCheckpoint);

    await terminal.clickRenderable('reviewing-home-choice-new-current');
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-new-current') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(firstHome.stateVersion);
    const replacementCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, '1 previous Review', replacementCheckpoint);
    const secondHome = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(secondHome.header.currentReviewIdentity).not.toBe(first);
    expect(secondHome.reviews.items[0]).toMatchObject({
      reviewIdentity: first,
      retention: 'previous',
      messages: 0,
    });

    terminal.send('\u001b');
    await waitForOutput(terminal, 'Previous Reviews (1)', replacementCheckpoint);
    terminal.send('g');
    await terminal.flush();
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('k');
    await terminal.flush();
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-history') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('j');
    await terminal.flush();
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-primary') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(secondHome.stateVersion);
    await terminal.clickRenderable('reviewing-home-choice-history');
    expect(
      (terminal.renderer.root.findDescendantById('reviewing-home-choice-history') as TextRenderable).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    const historyCheckpoint = terminal.checkpoint();
    terminal.send('\r');
    await waitForOutput(terminal, 'Previous Reviews FOCUSED  1', historyCheckpoint);
    const historyFrame = terminal.writes.at(-1)?.data ?? '';
    // Home is the Review's frame: one pane, its title carries the count, no splash wordmark.
    expect(historyFrame).not.toContain('BUILDFRAME');
    expect(historyFrame).toContain('newest first');
    expect(historyFrame.match(/\[\?\] keys/gu)).toHaveLength(1);
    expect(historyFrame).not.toContain('KEYBOARD CONTROLS');
    // Counts name Messages; Questions appear only for Reviews made before Messages.
    const historyDetail = (
      terminal.renderer.root.findDescendantById(`reviewing-history-choice-${first}`) as TextRenderable
    ).plainText.trim();
    expect(historyDetail).toMatch(/^› \d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}\d+ files? · 0 Messages$/u);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(secondHome.stateVersion);
    // A click on the selected Review opens it, as Enter would.
    await terminal.clickRenderable(`reviewing-history-choice-${first}`);
    await waitForOutput(terminal, 'Previous Review · read only', historyCheckpoint);
    expect(terminal.writes.at(-1)?.data).toContain('1 previous Review');
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header'))).toContain('SAVED');

    await application.stop();
    applications.delete(application);
    await owner.dispose();
    owners.delete(owner);
    owner = await open(created.checkout);
    const reopenedTerminal = await ScriptedTerminal.create(100, 30);
    const reopened = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: reopenedTerminal.renderer,
    });
    applications.add(reopened);
    await reopened.start();
    await waitForOutput(reopenedTerminal, 'Current Review · ');
    const reopenedFrame = reopenedTerminal.writes.at(-1)?.data ?? '';
    expect(reopenedFrame).toContain('Current Review · ');
    expect(reopenedFrame).toContain('1 previous Review');
    const reconstructed = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    expect(reconstructed.header.currentReviewIdentity).toBe(secondHome.header.currentReviewIdentity);
    expect(reconstructed.reviews.items[0]?.reviewIdentity).toBe(first);
  }, 30_000);

  it('keeps a truncated 500-commit comparison preview and action strip inside the terminal', async () => {
    const created = await fixture();
    await git(created.checkout, 'config', 'gc.auto', '0');
    for (let index = 1; index < 510; index += 1) {
      await git(
        created.checkout,
        'commit',
        '--allow-empty',
        '-qm',
        `bounded comparison commit ${String(index).padStart(3, '0')}`,
      );
    }
    const owner = await open(created.checkout);
    const graph = await owner.workspace.read({ kind: 'review.commit-graph' });
    expect(graph.status).toBe('available');
    if (graph.status !== 'available') throw new Error('Commit graph unavailable');
    const commits = graph.rows.filter(row => row.kind === 'commit');
    expect(commits).toHaveLength(500);
    expect(graph.truncated).toBe(true);
    const first = commits[0];
    const last = commits.at(-1);
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) throw new Error('Commit bounds missing');
    const commit250 = commits.find(commit => commit.subject === 'bounded comparison commit 250');
    const commit255 = commits.find(commit => commit.subject === 'bounded comparison commit 255');
    const commit259 = commits.find(commit => commit.subject === 'bounded comparison commit 259');
    const omittedCommit = (await gitOutput(created.checkout, 'rev-parse', 'HEAD~509')).trim();
    expect(commit250).toBeDefined();
    expect(commit255).toBeDefined();
    expect(commits.some(commit => commit.objectIdentity === omittedCommit)).toBe(false);
    if (commit250 === undefined || commit255 === undefined || commit259 === undefined) {
      throw new Error('Search control commits missing');
    }

    const timed = new TimedWorkspace(owner.workspace);
    const terminal = await ScriptedTerminal.create(132, 50);
    const application = createReviewingApplicationForTest({
      workspace: timed,
      renderer: terminal.renderer,
    });
    applications.add(application);
    await application.start();
    terminal.send('j');
    terminal.send('\r');
    await waitForComparisonReady(terminal);

    const decisionGeometry = (): {
      readonly viewportHeight: number;
      readonly previewY: number;
      readonly actionStripY: number;
    } => {
      const viewport = terminal.renderer.root.findDescendantById('reviewing-comparison-commits');
      const preview = terminal.renderer.root.findDescendantById('reviewing-comparison-preview');
      const actionStripRenderable = terminal.renderer.root.findDescendantById('reviewing-action-strip');
      expect(viewport).toBeDefined();
      expect(preview).toBeDefined();
      expect(actionStripRenderable).toBeDefined();
      return {
        viewportHeight: viewport?.height ?? -1,
        previewY: preview?.screenY ?? -1,
        actionStripY: actionStripRenderable?.screenY ?? -1,
      };
    };
    const wideGeometry = decisionGeometry();
    // Single-spaced rows: header, context row, pane chrome, preview and keys take 13 of 50.
    expect(wideGeometry.viewportHeight).toBeLessThanOrEqual(37);
    expect(wideGeometry.previewY).toBeGreaterThan(0);
    expect(wideGeometry.actionStripY).toBe(terminal.renderer.height - 1);
    let frame = terminal.setup.captureCharFrame();
    expect(frame).toContain('[Enter] start Review');
    expect(frame).toContain('newest 500 from HEAD');
    expect(frame).toContain('[/] search');
    expect(frame).toContain('[?] keys');
    expect(frame).not.toContain('KEYBOARD CONTROLS');
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${first.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);

    const second = commits[1];
    expect(second).toBeDefined();
    if (second === undefined) throw new Error('Second bounded commit missing');
    terminal.send(' ');
    await waitForOutput(terminal, ' KEYS ');
    let lookup = terminal.renderer.root.findDescendantById('reviewing-action-lookup');
    expect(lookup).toBeDefined();
    expect((lookup?.screenY ?? -1) + (lookup?.height ?? -1)).toBeLessThanOrEqual(wideGeometry.previewY);
    let lookupText = renderableTreeText(lookup);
    expect(lookupText).toContain('[Enter] Start a Review of it');
    expect(lookupText).toContain('[/] Search shown messages');
    expect(lookupText).toContain('[r] Exact hash / branch / tag');
    expect(lookupText).not.toContain('Choose merge parent');
    expect(decisionGeometry()).toEqual(wideGeometry);
    terminal.send('k');
    await terminal.flush();
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${first.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    await terminal.clickRenderable(`reviewing-comparison-commit-${second.objectIdentity}`);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${first.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.send('!');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeDefined();
    expect(terminal.setup.captureCharFrame()).not.toContain('Action checks from state');
    terminal.send('\r');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(0);

    const searchReadCount = timed.reads.length;
    terminal.send('/');
    await waitForOutput(terminal, 'Search commit messages');
    terminal.send('bounded comparison commit 25');
    await waitForOutput(terminal, '10/500 match');
    expect(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')?.screenY).toBe(
      wideGeometry.previewY,
    );
    // The keys row stays where it was; searching swaps in the search's own keys.
    expect(
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-strip')).startsWith(
        '[Enter] choose  [Esc] cancel',
      ),
    ).toBe(true);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit259.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.pressArrow('up');
    await terminal.flush();
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit250.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.pressPage('up');
    await terminal.flush();
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit259.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    terminal.pressPage('down');
    await terminal.flush();
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit250.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit255.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(false);
    await terminal.clickRenderable(`reviewing-comparison-commit-${commit255.objectIdentity}`);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit255.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(timed.reads).toHaveLength(searchReadCount);
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Commit-message search cancelled.');
    expect(decisionGeometry()).toEqual(wideGeometry);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${first.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(timed.reads).toHaveLength(searchReadCount);

    terminal.send('k');
    await terminal.flush();
    expect(decisionGeometry()).toEqual(wideGeometry);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'))).toContain(
      'Inspecting local commit comparison',
    );
    await waitForComparisonReady(terminal);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${last.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);
    expect(decisionGeometry()).toEqual(wideGeometry);

    terminal.resize(80, 24);
    await terminal.flush();
    const linearGeometry = decisionGeometry();
    expect(linearGeometry.viewportHeight).toBeLessThanOrEqual(11);
    expect(linearGeometry.previewY).toBeGreaterThan(0);
    expect(linearGeometry.actionStripY).toBe(terminal.renderer.height - 1);
    frame = terminal.setup.captureCharFrame();
    expect(frame).toContain('[Enter] start Review');
    expect(frame).toContain('newest 500 from HEAD');
    expect(frame).toContain('[/] search');
    expect(frame).toContain('[?] keys');
    expect(frame).not.toContain('KEYBOARD CONTROLS');
    expect(
      terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${last.objectIdentity}`),
    ).toBeDefined();
    terminal.send(' ');
    await waitForOutput(terminal, ' KEYS ');
    lookup = terminal.renderer.root.findDescendantById('reviewing-action-lookup');
    expect(lookup).toBeDefined();
    expect((lookup?.screenY ?? -1) + (lookup?.height ?? -1)).toBeLessThanOrEqual(linearGeometry.previewY);
    lookupText = renderableTreeText(lookup);
    expect(lookupText).toContain('[j/k] Select commit');
    expect(lookupText).toContain('[Esc] Back to Home');
    expect(decisionGeometry()).toEqual(linearGeometry);
    terminal.send(' ');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    terminal.send('n');
    await waitForOutput(terminal, 'Commits back from HEAD (HEAD~N)');
    terminal.send(' ');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    terminal.send('\u001b');
    await waitForOutput(terminal, 'Comparison input cancelled.');
    const commitModeCheckpoint = terminal.checkpoint();
    terminal.send('\t');
    await waitForOutput(terminal, '● One commit', commitModeCheckpoint);
    await waitFor(async () => {
      await terminal.flush();
      return renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')).includes(
        'Commit  ',
      );
    }, 'commit comparison mode restored');

    terminal.send('j');
    await terminal.flush();
    expect(decisionGeometry()).toEqual(linearGeometry);
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview'))).toContain(
      'Inspecting local commit comparison',
    );
    await waitForComparisonReady(terminal);
    expect(decisionGeometry()).toEqual(linearGeometry);
    expect(
      terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${first.objectIdentity}`),
    ).toBeDefined();

    const previewReadCount = (): number =>
      timed.reads.filter(request => request.kind === 'review.comparison-preview').length;
    const readsBeforeAcceptedSearch = timed.reads.length;
    const previewsBeforeAcceptedSearch = previewReadCount();
    terminal.send('/');
    await waitForOutput(terminal, 'Search commit messages');
    terminal.send('bounded comparison commit 509');
    await waitForOutput(terminal, '1/500 match');
    expect(
      terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${first.objectIdentity}`),
    ).toBeDefined();
    terminal.pressKey('u', { ctrl: true });
    await waitForOutput(terminal, '500/500 match');
    const lastSubjectCheckpoint = terminal.checkpoint();
    terminal.send('bounded comparison commit 010');
    await waitForOutput(terminal, '1/500 match', lastSubjectCheckpoint);
    expect(
      terminal.renderer.root.findDescendantById(`reviewing-comparison-commit-${last.objectIdentity}`),
    ).toBeDefined();
    const clearLastCheckpoint = terminal.checkpoint();
    terminal.pressKey('u', { ctrl: true });
    await waitForOutput(terminal, '500/500 match', clearLastCheckpoint);
    terminal.send('basis');
    await waitForOutput(terminal, '0/500 match', clearLastCheckpoint);
    expect(terminal.setup.captureCharFrame()).toContain('No shown commit messages match this search.');
    expect(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')?.screenY).toBe(
      linearGeometry.previewY,
    );
    terminal.send('\r');
    await waitForOutput(terminal, 'No commit message matches that search.');
    expect(terminal.renderer.root.findDescendantById('reviewing-comparison-search-query')).toBeDefined();
    const acceptedQueryCheckpoint = terminal.checkpoint();
    terminal.pressKey('u', { ctrl: true });
    await waitForOutput(terminal, '500/500 match', acceptedQueryCheckpoint);
    await terminal.paste('BOUNDED COMPARISON COMMIT 250');
    await waitForOutput(terminal, '1/500 match', acceptedQueryCheckpoint);
    expect(timed.reads).toHaveLength(readsBeforeAcceptedSearch);
    expect(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')?.screenY).toBe(
      linearGeometry.previewY,
    );
    terminal.send('\r');
    await waitFor(async () => {
      await terminal.flush();
      return (
        previewReadCount() === previewsBeforeAcceptedSearch + 1 &&
        renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')).includes(
          'bounded comparison commit 250',
        )
      );
    }, 'one accepted commit-message search preview');
    expect(previewReadCount()).toBe(previewsBeforeAcceptedSearch + 1);
    expect(timed.commands).toHaveLength(0);
    expect(decisionGeometry().previewY).toBe(linearGeometry.previewY);
    expect(decisionGeometry().actionStripY).toBe(linearGeometry.actionStripY);
    expect(
      (
        terminal.renderer.root.findDescendantById(
          `reviewing-comparison-commit-${commit250.objectIdentity}`,
        ) as TextRenderable
      ).plainText
        .trimStart()
        .startsWith('›'),
    ).toBe(true);

    const exactPreviewReads = previewReadCount();
    terminal.send('r');
    await waitForOutput(terminal, 'Commit hash, branch or tag');
    terminal.send(omittedCommit);
    terminal.send('\r');
    await waitFor(async () => {
      await terminal.flush();
      return (
        previewReadCount() === exactPreviewReads + 1 &&
        renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-comparison-preview')).includes('basis')
      );
    }, 'one exact omitted-revision preview');
    expect(previewReadCount()).toBe(exactPreviewReads + 1);
    expect(timed.commands).toHaveLength(0);
    expect(decisionGeometry().previewY).toBe(linearGeometry.previewY);
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(0);

    await application.stop();
    applications.delete(application);
    const asciiTerminal = await ScriptedTerminal.create(80, 24);
    const asciiApplication = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: asciiTerminal.renderer,
      presentation: { noColor: true, ascii: true },
    });
    applications.add(asciiApplication);
    await asciiApplication.start();
    asciiTerminal.send('j');
    asciiTerminal.send('\r');
    await waitForComparisonReady(asciiTerminal);
    asciiTerminal.send('/');
    await waitForOutput(asciiTerminal, 'Search commit messages');
    asciiTerminal.send('BOUNDED COMPARISON COMMIT 010');
    await waitForOutput(asciiTerminal, '1/500 match');
    const asciiSearchFrame = asciiTerminal.setup.captureCharFrame();
    expect(asciiSearchFrame).toContain('newest 500 from HEAD');
    expect(asciiSearchFrame).toContain('bounded comparison commit 010');
    expect([...new Set([...asciiSearchFrame].filter(character => character.codePointAt(0)! > 127))]).toEqual([]);
    expect(asciiTerminal.renderer.root.findDescendantById('reviewing-comparison-preview')?.screenY).toBeGreaterThan(0);
    asciiTerminal.send('\u001b');
    await waitForOutput(asciiTerminal, 'Commit-message search cancelled.');
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(0);
  }, 120_000);

  it('keeps user-owned pane geometry stable while focus changes emphasis', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(132, 32);
    const application = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: terminal.renderer,
    });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await terminal.flush();
    // Whole hints drop by rank as the terminal narrows; none is ever cut mid-word,
    // and help and pane switching are the last to go.
    // The mode's few keys on the left, the anchor on the right; a narrow row
    // shortens labels to their keys rather than losing a key.
    const expectFittedStrip = (strip: string | undefined, width: number): void => {
      expect(strip).toBeDefined();
      expect(strip!.length).toBeLessThanOrEqual(width - 2);
      expect(strip!.trimEnd().endsWith('[?] keys  [q] quit')).toBe(true);
      expect(strip).toMatch(/^\[a\]( new Message)? {2}\[ and \]( history)? {2}\[z\]( code only)? /u);
    };
    const commandChrome = (): string | undefined =>
      (terminal.renderer.root.findDescendantById('reviewing-action-strip') as TextRenderable | undefined)?.plainText;
    const wideActionStrip = commandChrome();
    expect(wideActionStrip?.startsWith('[a] new Message  [ and ] history  [z] code only ')).toBe(true);
    expectFittedStrip(wideActionStrip, terminal.renderer.width);
    const wideDiffWidth = terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.width;
    expect(wideDiffWidth).toBeGreaterThan(0);

    const questionsCheckpoint = terminal.checkpoint();
    terminal.send('\t');
    await waitForOutput(terminal, 'History FOCUSED', questionsCheckpoint);
    expect(terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.width).toBe(wideDiffWidth);
    // Moving focus leaves the keys row exactly as it was.
    expect(commandChrome()).toBe(wideActionStrip);

    terminal.resize(100, 28);
    await waitForLayout(terminal, 'balanced');
    await terminal.flush();
    const balancedDiffWidth = terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.width;
    const filesCheckpoint = terminal.checkpoint();
    terminal.send('\t');
    await waitForOutput(terminal, 'Files FOCUSED', filesCheckpoint);
    expect(terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.width).toBe(balancedDiffWidth);
    // History shares the side pane, so the Files title names it.
    expect(terminal.setup.captureCharFrame()).toMatch(/Files FOCUSED {2}\S+ {2}· History \d+ │/u);
    expectFittedStrip(commandChrome(), 100);
    terminal.resize(80, 24);
    await waitForLayout(terminal, 'linear');
    expectFittedStrip(commandChrome(), 80);
    expect(terminal.renderer.useMouse).toBe(true);
  });

  it('opens the key list with ?, says x needs a selected Message, and quits with q', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const terminal = await ScriptedTerminal.create(100, 30);
    const application = createReviewingApplicationForTest({ workspace: owner.workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, '[?] keys');
    terminal.send('?');
    await waitForOutput(terminal, ' KEYS ');
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-action-lookup'))).toContain(
      '[q] Quit BuildFrame',
    );
    terminal.send('?');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();

    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    const hintCheckpoint = terminal.checkpoint();
    terminal.send('x');
    await waitForOutput(terminal, 'No Message is selected. Select one in History, then press x.', hintCheckpoint);
    expect(terminal.renderer.root.findDescendantById('reviewing-question-textarea')).toBeUndefined();

    let closed = false;
    void application.closed.then(() => {
      closed = true;
    });
    terminal.send('q');
    await application.closed;
    expect(closed).toBe(true);
  });

  it('shows only the code at any width with z, moves between files and Messages without the panes, and remembers it', async () => {
    const created = await fixture();
    await writeFile(path.join(created.checkout, 'alpha.txt'), 'alpha\n');
    await writeFile(path.join(created.checkout, 'beta.txt'), 'beta\n');
    const owner = await open(created.checkout);
    const configurationPath = path.join(created.root, 'config', 'config.json');
    const terminal = await ScriptedTerminal.create(120, 30);
    const application = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: terminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(application);
    await application.start();
    terminal.send('\r');
    await waitForOutput(terminal, 'Current Review · ');
    await waitForOutput(terminal, 'Files  Changed');
    const diffWidth = (): number => terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.width ?? 0;
    const before = diffWidth();
    // At 120 columns every pane shows; z offers the code alone.
    await waitForOutput(terminal, '[z] code only');

    let checkpoint = terminal.checkpoint();
    terminal.send('z');
    await waitForOutput(terminal, 'Code only. e lists files', checkpoint);
    await waitFor(() => diffWidth() > before + 40, 'Diff takes the width');
    await waitForOutput(terminal, '[z] all panes', checkpoint);
    // With Files off screen, the Diff title says where you are among the files.
    await waitForOutput(terminal, 'file 1 of 3', checkpoint);

    // J and K move between files from the code; the panes stay hidden.
    const onScreen = (text: string): Promise<void> =>
      waitFor(() => terminal.setup.captureCharFrame().includes(text), text);
    terminal.send('J');
    await onScreen('file 2 of 3');
    terminal.send('K');
    await onScreen('file 1 of 3');
    // At the first file K stays put rather than wrapping to the last.
    terminal.send('K');
    await new Promise(resolve => setTimeout(resolve, 300));
    await onScreen('file 1 of 3');

    // e lists the files over the code; Enter opens one and the Diff keeps its width.
    checkpoint = terminal.checkpoint();
    terminal.send('e');
    await waitFor(
      () => terminal.renderer.root.findDescendantById('reviewing-jump-list') !== undefined,
      'files list open',
    );
    await waitForOutput(terminal, 'Files · 3 files', checkpoint);
    await waitForOutput(terminal, '[/] filter', checkpoint);
    terminal.send('/');
    terminal.send('beta');
    await waitForOutput(terminal, '1 of 3 files', checkpoint);
    terminal.send('\r');
    await waitFor(
      () => terminal.renderer.root.findDescendantById('reviewing-jump-list') === undefined,
      'files list closed',
    );
    await waitForOutput(terminal, 'beta.txt · file', checkpoint);
    expect(diffWidth()).toBeGreaterThan(before + 40);
    expect(terminal.setup.captureCharFrame()).not.toContain('Files  Changed');

    // m with no Messages says so instead of opening an empty list.
    checkpoint = terminal.checkpoint();
    terminal.send('m');
    await waitForOutput(terminal, 'No Messages yet.', checkpoint);

    // The choice is saved and comes back on the next start.
    await waitFor(async () => {
      try {
        const saved = JSON.parse(await fsReadFile(configurationPath, 'utf8')) as {
          reviewing?: { layout?: { codeOnly?: boolean } };
        };
        return saved.reviewing?.layout?.codeOnly === true;
      } catch {
        return false;
      }
    }, 'code only saved');
    await application.stop();
    applications.delete(application);
    const secondTerminal = await ScriptedTerminal.create(120, 30);
    const second = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: secondTerminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(second);
    await second.start();
    await waitForOutput(secondTerminal, 'Current Review · ');
    await waitForOutput(secondTerminal, '[z] all panes');
    checkpoint = secondTerminal.checkpoint();
    secondTerminal.send('z');
    await waitForOutput(secondTerminal, 'Every pane is back.', checkpoint);
    await waitForOutput(secondTerminal, 'Files  Changed', checkpoint);
  });

  it('restores Files visibility and preferred pane widths after a TUI restart', async () => {
    const created = await fixture();
    const owner = await open(created.checkout);
    const configurationPath = path.join(created.root, 'config', 'config.json');
    await mkdir(path.dirname(configurationPath), { recursive: true });
    await writeFile(
      configurationPath,
      JSON.stringify({
        version: 1,
        reviewing: {
          themes: [
            {
              name: 'Ocean Glass',
              inherits: 'quiet-graphite',
              colors: { border: '#78a9c4', accent: '#70c0df' },
            },
          ],
          background: 'terminal',
        },
      }),
    );
    const timed = new TimedWorkspace(owner.workspace);
    const firstTerminal = await ScriptedTerminal.create(132, 50);
    const first = createReviewingApplicationForTest({
      workspace: timed,
      renderer: firstTerminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(first);
    await first.start();
    firstTerminal.send('\r');
    await waitForOutput(firstTerminal, 'Current Review · ');
    // One header row at every size.
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-header')?.height).toBe(1);
    const headerDiffRow = firstTerminal.renderer.root.findDescendantById('reviewing-diff-pane')?.screenY;
    expect(headerDiffRow).toBeGreaterThan(0);
    const configurationStateVersion = (
      await owner.workspace.read({
        kind: 'workspace.home',
        offset: 0,
        limit: 64,
      })
    ).stateVersion;
    firstTerminal.send('s');
    await waitForOutput(firstTerminal, 'Files pane hidden.');
    await waitForInitialReviewReconciliation(timed);
    const configurationReadCheckpoint = timed.reads.length;
    const configurationCommandCheckpoint = timed.commands.length;
    firstTerminal.send('c');
    await waitForOutput(firstTerminal, 'Configuration');
    await firstTerminal.flush();
    const configurationOverlay = firstTerminal.renderer.root.findDescendantById(
      'reviewing-configuration-overlay',
    ) as unknown as { readonly backgroundColor: { readonly a: number } };
    expect(configurationOverlay.backgroundColor.a).toBe(1);
    // The keys are said once, in the footer, not again inside the box.
    const configurationFrame = firstTerminal.setup.captureCharFrame();
    expect(configurationFrame).toContain('[←/→] change  [Enter/Esc] close');
    expect(configurationFrame).toContain('Changes show and save right away.');
    expect(configurationFrame).not.toContain('Enter or Esc closes');
    firstTerminal.send(' ');
    await firstTerminal.flush();
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-configuration-overlay')).toBeDefined();
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    firstTerminal.send('h');
    await waitForOutput(firstTerminal, 'Ocean Glass');
    firstTerminal.send('j');
    await waitForOutput(firstTerminal, 'Terminal');
    firstTerminal.send('j');
    firstTerminal.send('l');
    await waitForOutput(firstTerminal, 'Code Spotlight');
    firstTerminal.send('l');
    await waitForOutput(firstTerminal, 'Review Notebook');
    firstTerminal.send('j');
    await waitForOutput(firstTerminal, 'All panes');
    firstTerminal.send('j');
    await waitForOutput(firstTerminal, 'Icons');
    firstTerminal.send('j');
    await waitForOutput(firstTerminal, 'Header');
    firstTerminal.send('l');
    await waitForOutput(firstTerminal, 'Hidden');
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-header')).toBeUndefined();
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-diff-pane')?.screenY).toBe(headerDiffRow! - 1);
    // The agent's status stays on screen, at the end of the history row.
    expect(firstTerminal.renderer.root.findDescendantById('reviewing-header-agent')).toBeDefined();
    firstTerminal.send('\r');
    await waitForOutput(firstTerminal, 'Settings saved.');
    expect(timed.reads.slice(configurationReadCheckpoint)).toEqual([]);
    expect(timed.commands.slice(configurationCommandCheckpoint)).toEqual([]);
    await first.stop();
    applications.delete(first);
    const saved = JSON.parse(await fsReadFile(configurationPath, 'utf8')) as any;
    expect(saved.reviewing.layout.filesVisible).toBe(false);
    expect(saved.reviewing.arrangement).toBe('review-notebook');
    expect(saved.reviewing.theme).toMatchObject({
      name: 'Ocean Glass',
      inherits: 'quiet-graphite',
      colors: { border: '#78a9c4', accent: '#70c0df' },
    });
    expect(saved.reviewing.background).toBe('terminal');
    expect(saved.reviewing.header).toEqual({
      visible: false,
    });
    expect(saved.reviewing.themes).toHaveLength(1);
    const secondTerminal = await ScriptedTerminal.create(132, 50);
    const second = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: secondTerminal.renderer,
      userConfiguration: createFileUserConfiguration(configurationPath),
    });
    applications.add(second);
    await second.start();
    await waitForOutput(secondTerminal, 'Current Review · ');
    expect(secondTerminal.renderer.root.findDescendantById('reviewing-header')).toBeUndefined();
    secondTerminal.send('c');
    await waitForOutput(secondTerminal, 'Review Notebook');
    await waitForOutput(secondTerminal, 'Ocean Glass');
    // Theme, Background, Arrangement, Panes, Icons, then Header.
    secondTerminal.send('j');
    secondTerminal.send('j');
    secondTerminal.send('j');
    secondTerminal.send('j');
    secondTerminal.send('j');
    await waitForOutput(secondTerminal, 'Hidden');
    secondTerminal.send('l');
    await waitForOutput(secondTerminal, 'Shown');
    expect(secondTerminal.renderer.root.findDescendantById('reviewing-header-row')).toBeDefined();
    expect(secondTerminal.renderer.root.findDescendantById('reviewing-header')?.height).toBe(1);
    expect(secondTerminal.writes.at(-1)?.data).not.toContain('Files FOCUSED');
    expect(
      (
        await owner.workspace.read({
          kind: 'workspace.home',
          offset: 0,
          limit: 64,
        })
      ).stateVersion,
    ).toBe(configurationStateVersion);
  });

  it('glides the Diff under the wheel, keeps the selection, and glides back on the next key', async () => {
    const workspace = new StressWorkspace(200, 0);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({
      workspace,
      renderer: terminal.renderer,
      presentation: { reducedMotion: false },
    });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'Diff FOCUSED');
    await waitForOutput(terminal, 'boundedRow0');
    const contentTop = (): number | undefined =>
      terminal.renderer.root.findDescendantById('reviewing-diff-content')?.screenY;
    const selectedLine = (): string | undefined =>
      terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes('▌') && line.includes('boundedRow'));
    expect(selectedLine()).toContain('boundedRow0 ');
    const startTop = contentTop()!;

    // Several notches in a row: the content passes through in-between rows.
    const positions = new Set<number>();
    const record = (): void => {
      const top = contentTop();
      if (top !== undefined) positions.add(top);
    };
    terminal.renderer.on('frame', record);
    // Each notch moves at least three rows; a loaded machine may need more of them.
    let notches = 0;
    while (notches < 12 && (contentTop() ?? startTop) > startTop - 12) {
      await terminal.scrollRenderable('reviewing-diff-viewport', 'down');
      notches += 1;
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    await waitFor(async () => {
      await terminal.flush();
      return (contentTop() ?? startTop) <= startTop - 12;
    }, 'Diff glided down');
    await new Promise(resolve => setTimeout(resolve, 200));
    await terminal.flush();
    terminal.renderer.off('frame', record);
    const settledTop = contentTop()!;
    expect(settledTop).toBeLessThanOrEqual(startTop - 12);
    // Jumping a notch at a time leaves at most one in-between position fewer
    // than the notches sent; reaching the notch count means it moved row by row.
    expect([...positions].filter(top => top < startTop && top > settledTop).length).toBeGreaterThanOrEqual(notches);
    // The selection stayed on its row, now above the view.
    expect(terminal.setup.captureCharFrame()).not.toContain('boundedRow0 ');

    // The next key hands the view back to the selection.
    terminal.send('j');
    await waitFor(async () => {
      await terminal.flush();
      return (selectedLine() ?? '').includes('boundedRow1 ');
    }, 'view back on the selection');
  });

  it('scrolls a long Diff as one document, reading the next rows before the view reaches them', async () => {
    const workspace = new StressWorkspace(400, 0);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'boundedRow0');
    const diffReads = (): readonly number[] =>
      [...workspace.requests, ...workspace.subscriptions]
        .filter(request => request.kind === 'review.diff' || request.kind === 'review.live-diff')
        .map(request => (request as { readonly offset: number }).offset);
    const selectedLine = (): string | undefined =>
      terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes('▌') && line.includes('boundedRow'));
    // Only the wheel: rows past several 64-row windows come into view.
    for (let notch = 0; notch < 120 && !terminal.setup.captureCharFrame().includes('boundedRow300 '); notch += 1) {
      await terminal.scrollRenderable('reviewing-diff-viewport', 'down');
    }
    expect(terminal.setup.captureCharFrame()).toContain('boundedRow300 ');
    expect(diffReads()).toEqual(expect.arrayContaining([64, 128, 192, 256]));
    // The selection never moved; it stayed on the first row, far above.
    expect(selectedLine()).toBeUndefined();
    // Scrolling back up shows the same rows again without a jump.
    for (let notch = 0; notch < 120 && !terminal.setup.captureCharFrame().includes('boundedRow0 '); notch += 1) {
      await terminal.scrollRenderable('reviewing-diff-viewport', 'up');
    }
    expect(selectedLine()).toContain('boundedRow0 ');
  });

  it('shows in the header whether Claude Code is connected', async () => {
    const workspace = new StressWorkspace(64, 0);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'boundedRow0');
    const headerText = (): string =>
      terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes('BuildFrame')) ?? '';
    await waitFor(async () => {
      await terminal.flush();
      return headerText().includes('○ No agent');
    }, 'no agent yet');

    const claude: HarnessConnectionEntry = {
      attachmentIdentity: `att_${'8'.repeat(64)}` as never,
      harnessLabel: 'Claude Code',
      sessionLabel: 'session-1',
      connected: true,
      availability: { status: 'available' },
    };
    workspace.setHarnesses([claude]);
    await waitFor(async () => {
      await terminal.flush();
      return headerText().includes('● Claude Code');
    }, 'Claude Code connected');
    expect(headerText()).not.toContain('No agent');

    workspace.setHarnesses([
      { ...claude, connected: false, availability: { status: 'blocked', reason: 'disconnected' } },
    ]);
    await waitFor(async () => {
      await terminal.flush();
      return headerText().includes('○ Claude Code');
    }, 'Claude Code gone');
  });

  it('tells the Workspace when the terminal loses and regains focus', async () => {
    const workspace = new StressWorkspace(64, 0);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'boundedRow0');
    expect(workspace.attention).toEqual([]);
    terminal.renderer.emit('blur');
    terminal.renderer.emit('focus');
    expect(workspace.attention).toEqual(['background', 'foreground']);
  });

  it('keeps the view in place when wheel scrolling drops the selected row past the kept rows', async () => {
    const workspace = new StressWorkspace(1_400, 0);
    const terminal = await ScriptedTerminal.create(132, 40);
    const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });
    applications.add(application);
    await application.start();
    await waitForOutput(terminal, 'boundedRow0');
    const topRow = (): number => {
      const rows = [...terminal.setup.captureCharFrame().matchAll(/boundedRow(\d+) /g)].map(match => Number(match[1]));
      return rows.length === 0 ? -1 : Math.min(...rows);
    };
    // Past 1,024 loaded rows the first rows fall away, the selected first row with them.
    let previousTop = topRow();
    for (let notch = 0; notch < 600 && !terminal.setup.captureCharFrame().includes('boundedRow1200 '); notch += 1) {
      await terminal.scrollRenderable('reviewing-diff-viewport', 'down');
      await terminal.flush();
      const top = topRow();
      expect(top).toBeGreaterThanOrEqual(previousTop);
      previousTop = top;
    }
    expect(terminal.setup.captureCharFrame()).toContain('boundedRow1200 ');
    // The selection moved to a row that was in view when the first rows fell
    // away, so the next key brings the view back near there, not to the start.
    terminal.send('j');
    let selected = -1;
    await waitFor(async () => {
      await terminal.flush();
      const line = terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(candidate => candidate.includes('▌') && candidate.includes('boundedRow'));
      selected = Number(/boundedRow(\d+) /.exec(line ?? '')?.[1] ?? -1);
      return selected >= 0;
    }, 'view back on the selection');
    expect(selected).toBeGreaterThan(900);
  });

  it('keeps wheel scrolling pane-local across bounded projections and long wrapped rows', async () => {
    const workspace = new StressWorkspace(130, 500, 48, 6, undefined, undefined, 30);
    const terminal = await ScriptedTerminal.create(224, 48);
    const application = createReviewingApplicationForTest({
      workspace,
      renderer: terminal.renderer,
      presentation: { ascii: true },
    });
    applications.add(application);
    await application.start();
    await waitForLayout(terminal, 'wide');
    await waitFor(async () => {
      await terminal.flush();
      return ['reviewing-files-pane', 'reviewing-diff-pane', 'reviewing-questions-pane'].every(id => {
        const pane = terminal.renderer.root.findDescendantById(id);
        return pane !== undefined && pane.screenY > 0;
      });
    }, 'current Reviewing pane geometry');

    const filesPane = terminal.renderer.root.findDescendantById('reviewing-files-pane')!;
    const diffPane = terminal.renderer.root.findDescendantById('reviewing-diff-pane')!;
    const messagesPane = terminal.renderer.root.findDescendantById('reviewing-questions-pane')!;
    const paneTops = [filesPane.screenY, diffPane.screenY, messagesPane.screenY];
    for (const [pane, scrollbarId] of [
      [filesPane, 'reviewing-files-scrollbar'],
      [diffPane, 'reviewing-diff-scrollbar'],
      [messagesPane, 'reviewing-messages-scrollbar'],
    ] as const) {
      const scrollbar = terminal.renderer.root.findDescendantById(scrollbarId);
      expect(scrollbar).toBeDefined();
      expect(scrollbar?.screenX).toBe(pane.screenX + pane.width - 1);
    }

    const frameLineWith = (needle: string): string | undefined =>
      terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes(needle));
    // The wheel moves the view; the next 64-row window is read before the view
    // reaches the loaded end.
    const diffWindowRequested = (): boolean =>
      [...workspace.requests, ...workspace.subscriptions].some(
        request => (request.kind === 'review.diff' || request.kind === 'review.live-diff') && request.offset === 64,
      );
    const burstRootCount = await terminal.burstScrollRenderable('reviewing-diff-viewport', 'down', 96);
    // Every wheel event reaches the model, but the expensive replacement tree
    // remains singular until OpenTUI can present the burst's latest state.
    expect(burstRootCount).toBe(1);
    await waitFor(diffWindowRequested, 'next bounded Diff window');
    // The next windows were read ahead and joined on, so the burst may run past
    // row 64; the rows above and below are one continuous scroll away.
    const shownRows = (): readonly number[] =>
      [...terminal.setup.captureCharFrame().matchAll(/boundedRow(\d+)/gu)].map(match => Number(match[1]));
    for (let notch = 0; notch < 60 && !shownRows().includes(64); notch += 1) {
      await terminal.scrollRenderable('reviewing-diff-viewport', Math.min(...shownRows()) > 64 ? 'up' : 'down');
    }
    await waitForOutput(terminal, 'boundedRow64');
    expect(
      workspace.requests.filter(request => request.kind === 'review.live-diff' && request.offset === 64),
    ).toHaveLength(1);

    // In Files the wheel scrolls the list and leaves the selected file alone.
    await terminal.scrollRenderable('reviewing-files-viewport', 'down');
    // Read the Files pane only: History may name the same file (now by its basename).
    const filesPaneText = (): string =>
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-files-viewport'));
    await waitFor(() => !filesPaneText().includes(' file-0.ts'), 'Files list scrolled');
    expect(frameLineWith(' file-3.ts')?.includes('>')).toBe(false);

    const secondMessageSelected = (): boolean => {
      const secondMessage = terminal.renderer.root.findDescendantById('reviewing-message-card-2') as
        | BoxRenderable
        | undefined;
      return secondMessage?.backgroundColor.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft)) ?? false;
    };
    // The wheel only moves the Messages view; the keyboard picks the second Message.
    await terminal.scrollRenderable('reviewing-messages-viewport', 'down');
    expect(secondMessageSelected()).toBe(false);
    await terminal.scrollRenderable('reviewing-messages-viewport', 'up');
    terminal.send('j');
    await waitFor(secondMessageSelected, 'selected second Message styling');
    // Collapsed entries are dense previews. The keyboard-selected Message
    // keeps its complete body and complete Response.
    const collapsedHeight = terminal.renderer.root.findDescendantById('reviewing-message-card-1')?.height ?? 0;
    const keyboardHeight = terminal.renderer.root.findDescendantById('reviewing-message-card-2')?.height ?? 0;
    expect(keyboardHeight).toBeGreaterThan(collapsedHeight);
    expect(collapsedHeight).toBe(3);
    const collapsedText = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1'));
    expect(collapsedText).not.toContain('MessageTail0');
    expect(collapsedText).not.toContain('ResponseTail0');
    // A dim divider row separates adjacent entries; the first entry has none.
    expect(collapsedText).not.toContain('----');
    const selectedText = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-2'));
    // The complete body and Response show once: in History, or in the Diff card when it fits there unpaged.
    const wholeSelected = `${selectedText} ${renderableTreeText(
      terminal.renderer.root.findDescendantById('reviewing-expanded-message-card'),
    )}`;
    expect(wholeSelected).toContain('MessageTail1');
    expect(wholeSelected).toContain('ResponseTail1');
    expect(selectedText).toContain('----');
    expect(terminal.renderer.root.findDescendantById('reviewing-message-detail-card')).toBeUndefined();

    await terminal.moveToRenderable('reviewing-message-card-1');
    await waitFor(
      () =>
        (terminal.renderer.root.findDescendantById('reviewing-message-card-1')?.height ?? 0) > collapsedHeight &&
        (terminal.renderer.root.findDescendantById('reviewing-message-card-1')?.height ?? Number.POSITIVE_INFINITY) <
          keyboardHeight &&
        terminal.renderer.root.findDescendantById('reviewing-message-card-2')?.height === keyboardHeight,
      'hovered Message to expand within bounds without replacing the selected Message',
    );
    const hoveredText = renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-message-card-1'));
    expect(hoveredText).toContain('-> Response 0');
    expect(hoveredText).not.toContain('MessageTail0');
    expect(hoveredText).not.toContain('ResponseTail0');
    // Hover never replaces the selected Message's whole text (here in the Diff card, which fits it unpaged).
    expect(
      renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-expanded-message-card')).replace(
        /\s+/gu,
        ' ',
      ),
    ).toContain('ResponseTail1');
    await terminal.moveToRenderable('reviewing-diff-pane');
    await waitFor(
      () =>
        terminal.renderer.root.findDescendantById('reviewing-message-card-1')?.height === collapsedHeight &&
        terminal.renderer.root.findDescendantById('reviewing-message-card-2')?.height === keyboardHeight,
      'keyboard-selected Message to keep its complete pair after hover ends',
    );

    for (let index = 1; index < 40 && !terminal.setup.captureCharFrame().includes('#9'); index += 1) {
      await terminal.scrollRenderable('reviewing-messages-viewport', 'down');
    }
    await waitForOutput(terminal, '#9');

    expect(terminal.renderer.root.findDescendantById('reviewing-files-pane')?.screenY).toBe(paneTops[0]);
    expect(terminal.renderer.root.findDescendantById('reviewing-diff-pane')?.screenY).toBe(paneTops[1]);
    expect(terminal.renderer.root.findDescendantById('reviewing-questions-pane')?.screenY).toBe(paneTops[2]);

    const oversizedMessageWorkspace = new StressWorkspace(2, 80, 2, 400, 32, 32);
    const oversizedMessageTerminal = await ScriptedTerminal.create(100, 28);
    const oversizedMessageApplication = createReviewingApplicationForTest({
      workspace: oversizedMessageWorkspace,
      renderer: oversizedMessageTerminal.renderer,
    });
    applications.add(oversizedMessageApplication);
    await oversizedMessageApplication.start();
    await waitForLayout(oversizedMessageTerminal, 'balanced');
    oversizedMessageTerminal.send('\t');
    await waitForOutput(oversizedMessageTerminal, 'Messages FOCUSED');
    await waitFor(
      () =>
        oversizedMessageWorkspace.requests.some(
          request => request.kind === 'review.message-body' && request.part === 'message',
        ),
      'complete selected Message body',
    );
    await waitFor(
      () =>
        oversizedMessageWorkspace.requests.some(
          request => request.kind === 'review.message-body' && request.part === 'response',
        ),
      'complete selected Response body',
    );
    const oversizedFrame = (): string => oversizedMessageTerminal.setup.captureCharFrame();
    expect(oversizedFrame()).not.toContain('MessageTail0');
    expect(oversizedFrame()).not.toContain('ResponseTail0');
    for (let index = 0; index < 120 && !oversizedFrame().includes('MessageTail0'); index += 1) {
      await oversizedMessageTerminal.scrollRenderable('reviewing-messages-viewport', 'down');
    }
    expect(oversizedFrame()).toContain('MessageTail0');
    expect(oversizedFrame()).toContain('🙂');
    for (let index = 0; index < 60 && !oversizedFrame().includes('ResponseTail0'); index += 1) {
      await oversizedMessageTerminal.scrollRenderable('reviewing-messages-viewport', 'down');
    }
    expect(oversizedFrame()).toContain('ResponseTail0');
    const selectedOversizedMessage = oversizedMessageTerminal.renderer.root.findDescendantById(
      'reviewing-message-card-1',
    ) as BoxRenderable | undefined;
    expect(selectedOversizedMessage?.backgroundColor.equals(RGBA.fromHex(QUIET_GRAPHITE.accentSoft))).toBe(true);
    oversizedMessageTerminal.resize(80, 24);
    await waitForLayout(oversizedMessageTerminal, 'linear');
    expect(
      oversizedMessageTerminal.renderer.root.findDescendantById('reviewing-questions-pane')?.height,
    ).toBeGreaterThan(6);
    expect(oversizedMessageTerminal.renderer.root.findDescendantById('reviewing-diff-pane')).toBeUndefined();

    const longWorkspace = new StressWorkspace(2, 5_000);
    const longTerminal = await ScriptedTerminal.create(80, 24);
    const longApplication = createReviewingApplicationForTest({
      workspace: longWorkspace,
      renderer: longTerminal.renderer,
      presentation: { noColor: true, ascii: true },
    });
    applications.add(longApplication);
    await longApplication.start();
    await waitForLayout(longTerminal, 'linear');
    // Wheel up until row 0 owns the selection and its top is revealed; an
    // oversized selected row first scrolls in place before moving selection.
    const boundedRow0Line = (): string | undefined =>
      longTerminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes('boundedRow0'));
    for (let index = 0; index < 48 && !(boundedRow0Line()?.includes('>') ?? false); index += 1) {
      await longTerminal.scrollRenderable('reviewing-diff-viewport', 'up');
    }
    expect(boundedRow0Line()).toContain('>');
    const longViewport = longTerminal.renderer.root.findDescendantById('reviewing-diff-viewport');
    const longRow = longTerminal.renderer.root.findDescendantById('reviewing-diff-row-row-0');
    expect(longRow?.height).toBeGreaterThan(longViewport?.height ?? Number.POSITIVE_INFINITY);
    const longContentY = longTerminal.renderer.root.findDescendantById('reviewing-diff-content')?.screenY;
    for (let index = 0; index < 4; index += 1) {
      await longTerminal.scrollRenderable('reviewing-diff-viewport', 'down');
      if (
        (longTerminal.renderer.root.findDescendantById('reviewing-diff-content')?.screenY ?? Number.POSITIVE_INFINITY) <
        (longContentY ?? Number.POSITIVE_INFINITY)
      ) {
        break;
      }
    }
    expect(longTerminal.renderer.root.findDescendantById('reviewing-diff-content')?.screenY).toBeLessThan(
      longContentY ?? Number.POSITIVE_INFINITY,
    );
    for (let index = 0; index < 40 && !longTerminal.setup.captureCharFrame().includes('Tail0'); index += 1) {
      await longTerminal.scrollRenderable('reviewing-diff-viewport', 'down');
    }
    expect(longTerminal.setup.captureCharFrame()).toContain('Tail0');
    // The wheel scrolls on through the second oversized row to the end of the
    // loaded rows; the pane then shows the last row's tail.
    for (let index = 0; index < 40 && !longTerminal.setup.captureCharFrame().includes('visibleTail1'); index += 1) {
      await longTerminal.scrollRenderable('reviewing-diff-viewport', 'down');
    }
    expect(longTerminal.setup.captureCharFrame()).toContain('visibleTail1');
    expect(longTerminal.setup.captureCharFrame()).toContain('2-2/2');
  });

  it('keeps bounded Wide/Balanced/Linear rendering, wrapping, no-color, and ASCII safety', async () => {
    const workspace = new StressWorkspace();
    const terminal = await ScriptedTerminal.create(224, 68);
    const application = createReviewingApplicationForTest({
      workspace,
      renderer: terminal.renderer,
      presentation: { noColor: true, ascii: true },
    });
    applications.add(application);
    await application.start();
    await waitForLayout(terminal, 'wide');
    expect(terminal.plainOutputSince()).toContain('visible');

    const expectRowsInsidePane = (paneId: string, rowPrefix: string): void => {
      const pane = terminal.renderer.root.findDescendantById(paneId);
      if (pane === undefined) throw new Error(`${paneId} missing`);
      const rows = descendantsWithIdPrefix(pane, rowPrefix);
      expect(rows.length).toBeGreaterThan(0);
      const contentBottom = pane.screenY + pane.height - 1;
      for (const row of rows) expect(row.screenY + row.height).toBeLessThanOrEqual(contentBottom);
    };
    expectRowsInsidePane('reviewing-files-pane', 'reviewing-file-row-');
    expectRowsInsidePane('reviewing-diff-pane', 'reviewing-diff-row-');
    expectRowsInsidePane('reviewing-questions-pane', 'reviewing-question-card-');

    const clippedCodeCheckpoint = terminal.checkpoint();
    terminal.send('w');
    await waitForOutput(terminal, 'wrapping disabled', clippedCodeCheckpoint);
    const clippedCodeLine = (terminal.writes.at(-1)?.data ?? '').split('\n').find(line => line.includes('boundedRow0'));
    expect(clippedCodeLine).toContain('>');
    terminal.send('w');
    await waitForOutput(terminal, 'wrapping enabled', clippedCodeCheckpoint);
    const sideBySideCheckpoint = terminal.checkpoint();
    terminal.send('v');
    await waitForOutput(terminal, 'Side-by-side', sideBySideCheckpoint);
    expect(terminal.writes.at(-1)?.data).toContain('Tail');
    terminal.send('v');
    await waitForOutput(terminal, 'Diff FOCUSED', sideBySideCheckpoint);
    for (let index = 1; index <= 4; index += 1) {
      const navigationCheckpoint = terminal.checkpoint();
      terminal.send('j');
      await waitForOutput(terminal, `boundedRow${index}`, navigationCheckpoint);
      expect(terminal.plainOutputSince(navigationCheckpoint)).toContain(`Tail${index}`);
    }

    terminal.resize(132, 50);
    await waitForLayout(terminal, 'wide');
    terminal.resize(100, 28);
    await waitForLayout(terminal, 'balanced');
    terminal.resize(80, 24);
    await waitForLayout(terminal, 'linear');
    const linearFrame = terminal.writes.at(-1)?.data ?? '';
    // Rows wrap across the available pane body (the tail may split across a
    // wrap boundary) rather than being replaced by an ellipsis.
    const linearLines = linearFrame.split('\n');
    const row4Index = linearLines.findIndex(line => line.includes('boundedRow4'));
    expect(row4Index).toBeGreaterThanOrEqual(0);
    const row4 = descendantsWithIdPrefix(terminal.renderer.root, 'reviewing-diff-row-').find(row =>
      row.id.endsWith('row-4'),
    );
    expect(row4?.height).toBeGreaterThan(6);
    expect(linearLines.slice(row4Index, row4Index + (row4?.height ?? 0)).some(line => line.includes('Tail4'))).toBe(
      true,
    );
    expect(linearFrame.split('\n').find(line => line.includes('boundedRow4'))).not.toContain('...');
    terminal.send(' ');
    await waitFor(async () => {
      await terminal.flush();
      return terminal.renderer.root.findDescendantById('reviewing-action-lookup') !== undefined;
    }, 'ASCII action lookup');
    const asciiLookup = terminal.renderer.root.findDescendantById('reviewing-action-lookup');
    expect(asciiLookup).toBeDefined();
    expect((asciiLookup?.screenY ?? -1) + (asciiLookup?.height ?? -1)).toBeLessThan(terminal.renderer.height - 1);
    const asciiLookupFrame = terminal.setup.captureCharFrame();
    expect(asciiLookupFrame).toContain('[?/Esc] close');
    expect([...new Set([...asciiLookupFrame].filter(character => character.codePointAt(0)! > 127))]).toEqual([]);
    terminal.send('\u001b');
    await terminal.flush();
    expect(terminal.renderer.root.findDescendantById('reviewing-action-lookup')).toBeUndefined();
    terminal.send('c');
    await waitForOutput(terminal, 'Configuration');
    // Theme, Background, Arrangement, Panes, Icons, then Header.
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('j');
    terminal.send('l');
    await waitForOutput(terminal, 'Hidden');
    expect(terminal.renderer.root.findDescendantById('reviewing-header')).toBeUndefined();
    terminal.send('l');
    await waitForOutput(terminal, 'Shown');
    expect(terminal.renderer.root.findDescendantById('reviewing-header-row')).toBeDefined();
    const asciiHeaderFrame = terminal.setup.captureCharFrame();
    // The row below names the Review, so the header says just BuildFrame.
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-header-row'))).toContain(
      'BuildFrame',
    );
    expect(asciiHeaderFrame).not.toContain('BuildFrame / Current Review');
    expect([...new Set([...asciiHeaderFrame].filter(character => character.codePointAt(0)! > 127))]).toEqual([]);
    terminal.send('l');
    await waitForOutput(terminal, 'Hidden');
    terminal.send('\r');
    await waitForOutput(terminal, 'Settings saved.');
    expect(terminal.renderer.root.findDescendantById('reviewing-header')).toBeUndefined();
    expect(terminal.renderer.root.findDescendantById('reviewing-header-row')).toBeUndefined();
    terminal.send('[');
    await waitFor(async () => {
      await terminal.flush();
      const dialog = terminal.renderer.root.findDescendantById('reviewing-historical-dialog') as
        | BoxRenderable
        | undefined;
      return dialog?.title?.includes('Historical Version 1/1') ?? false;
    }, 'ASCII historical dialog');
    let focusedHistoricalQuestions = false;
    for (let step = 0; step < 3 && !focusedHistoricalQuestions; step += 1) {
      terminal.send('\t');
      await terminal.flush();
      focusedHistoricalQuestions = renderableTreeText(
        terminal.renderer.root.findDescendantById('historical-reviewing-questions-pane'),
      ).includes('Messages FOCUSED');
    }
    expect(focusedHistoricalQuestions).toBe(true);
    expect(
      renderableTreeText(terminal.renderer.root.findDescendantById('historical-reviewing-questions-pane')),
    ).toContain('Historical Questions');
    const asciiDialog = terminal.renderer.root.findDescendantById('reviewing-historical-dialog') as
      | BoxRenderable
      | undefined;
    expect(asciiDialog).toBeDefined();
    expect(asciiDialog?.width).toBeLessThanOrEqual(76);
    expect(asciiDialog?.height).toBeLessThanOrEqual(20);
    expect(asciiDialog?.backgroundColor.a).toBe(1);
    expect(asciiDialog?.title).toContain('HISTORY - Historical Version 1/1 - SAVED - READ ONLY');
    expect(renderableTreeText(terminal.renderer.root.findDescendantById('reviewing-historical-context'))).toContain(
      'SAVED SNAPSHOT  |  VERSION 1 OF 1  |  NOT LIVE CHANGES',
    );
    const settledAsciiFrame = terminal.setup.captureCharFrame();
    expect(settledAsciiFrame).toContain('HISTORY - Historical Version 1/1 - SAVED - READ ONLY');
    expect(settledAsciiFrame).toContain('SAVED SNAPSHOT  |  VERSION 1 OF 1  |  NOT LIVE CHANGES');
    expect(settledAsciiFrame).not.toContain('Opening saved Snapshot');
    const output = terminal.outputSince();
    const plain = terminal.plainOutputSince();
    expect(output).not.toContain('\u001b[38;');
    expect([...new Set([...plain].filter(character => character.codePointAt(0)! > 127))]).toEqual([]);
    const manifestRequests = workspace.requests.filter(request => request.kind === 'review.manifest');
    const diffRequests = workspace.requests.filter(request => request.kind === 'review.diff');
    const questionRequests = workspace.requests.filter(request => request.kind === 'review.questions');
    expect(manifestRequests.every(request => request.kind !== 'review.manifest' || request.limit <= 1e4)).toBe(true);
    expect(diffRequests.every(request => request.kind !== 'review.diff' || request.limit <= 64)).toBe(true);
    expect(questionRequests.every(request => request.kind !== 'review.questions' || request.limit <= 8)).toBe(true);
  }, 60_000);
});

describe('theme presets', () => {
  it('never paint code in the accent, which means focus, or the caution colour', () => {
    for (const preset of [QUIET_GRAPHITE, QUIET_PAPER, WARM_CARBON, INDIGO_NIGHT]) {
      expect(Object.values(preset.tokens)).not.toContain(preset.accent);
      expect(Object.values(preset.tokens)).not.toContain(preset.warning);
    }
  });
});
