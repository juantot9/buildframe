import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createTestRenderer } from '@opentui/core/testing';
import { RGBA, TreeSitterClient } from '@opentui/core';
import { QUIET_GRAPHITE } from '../apps/buildframe/dist/reviewingView.js';

import { resolveGitExecutable } from '../packages/workspace/dist/gitProcess.js';

const execFileAsync = promisify(execFile);
const gitExecutable = await resolveGitExecutable();
const root = await mkdtemp(path.join(tmpdir(), 'buildframe-dogfood-p15-'));
const checkout = path.join(root, 'checkout');
const state = path.join(root, 'state');
const runtime = path.join(root, 'runtime');
const configuration = path.join(root, 'configuration');
const originalStateHome = process.env.XDG_STATE_HOME;
const originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
const originalConfigurationHome = process.env.XDG_CONFIG_HOME;

class ScriptedTerminal {
  writes = [];

  constructor(setup) {
    this.setup = setup;
    this.renderer = setup.renderer;
    this.renderer.on('frame', () => {
      this.writes.push(this.setup.captureCharFrame());
    });
  }

  static async create() {
    return new ScriptedTerminal(
      await createTestRenderer({
        width: 180,
        height: 34,
        kittyKeyboard: true,
        gatherStats: true,
      }),
    );
  }

  send(data) {
    assert.equal(this.renderer.isDestroyed, false, 'Terminal must be running');
    if (data === '\r' || data === '\n') this.setup.mockInput.pressEnter();
    else if (data === '\u001b') this.setup.mockInput.pressEscape();
    else if (data === '\t') this.setup.mockInput.pressTab();
    else for (const character of data) this.setup.mockInput.pressKey(character);
    void this.flush();
  }
  pressKey(key) {
    this.setup.mockInput.pressKey(key);
    void this.flush();
  }
  async flush() {
    await this.setup.flush();
  }
  checkpoint() {
    return this.writes.length;
  }
  plainSince(checkpoint = 0) {
    return this.writes.slice(checkpoint).join('\n');
  }
}

class ScriptedPiHost {
  idle = true;
  activeTools = ['read', 'bash', 'edit', 'write'];
  allTools = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(name => ({ name, source: 'builtin' }));
  sent = [];
  markers = [];
  aborts = 0;

  isIdle() {
    return this.idle;
  }
  getActiveTools() {
    return this.activeTools;
  }
  getAllTools() {
    return this.allTools;
  }
  setActiveTools(names) {
    this.activeTools = [...names];
  }
  sendUserMessage(message) {
    this.sent.push(message);
  }
  appendCorrelationMarker(marker) {
    this.markers.push(marker);
  }
  abort() {
    this.aborts += 1;
  }
}

async function git(...arguments_) {
  await execFileAsync(gitExecutable, ['-C', checkout, ...arguments_]);
}

async function waitFor(predicate, label, attempts = 800) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function waitForOutput(terminal, text, checkpoint = 0) {
  try {
    await waitFor(
      async () => {
        await terminal.flush();
        return terminal.plainSince(checkpoint).includes(text);
      },
      `terminal output ${JSON.stringify(text)}`,
    );
  } catch (error) {
    // The screen as it stands says more than the whole output since the checkpoint.
    throw new Error(
      `${error instanceof Error ? error.message : 'Terminal wait failed'}\n${terminal.setup.captureCharFrame()}`,
    );
  }
}

async function selectFirstCurrentDiffLine(terminal) {
  terminal.send('g');
  await terminal.flush();
  terminal.send('j');
  await waitFor(async () => {
    await terminal.flush();
    return (
      terminal.setup
        .captureCharFrame()
        .split('\n')
        .find(line => line.includes('+ const answer'))
        ?.includes('▌') ?? false
    );
  }, 'first current-side Diff line selection');
}

function settledEntries(host, prompt, stopReason) {
  const marker = host.markers.at(-1);
  assert.ok(marker, 'Pi correlation marker must exist before settlement');
  return [
    {
      type: 'custom',
      customType: 'neoflow.pi-direct-invocation/1',
      data: marker,
    },
    { type: 'message', message: { role: 'user', content: prompt } },
    {
      type: 'message',
      message: {
        role: 'assistant',
        content: stopReason === 'stop' ? [{ type: 'text', text: 'Complete scripted Pi Response.' }] : [],
        stopReason,
      },
    },
  ];
}

async function drivePiOutcome(adapter, host, stopReason) {
  const prompt = host.sent.at(-1);
  assert.ok(prompt, 'Pi prompt must be dispatched after Durable Commit');
  assert.deepEqual(host.activeTools, ['read', 'grep', 'find', 'ls']);
  assert.deepEqual(adapter.onInput({ text: prompt, source: 'extension', hasImages: false }), { action: 'continue' });
  await adapter.beforeAgentStart(prompt, false);
  host.idle = false;
  await adapter.agentStarted();
  await adapter.agentStarted();
  host.idle = true;
  await adapter.agentSettled(settledEntries(host, prompt, stopReason));
  assert.deepEqual(host.activeTools, ['read', 'bash', 'edit', 'write']);
}

async function waitForInvocation(workspace, reviewIdentity, status) {
  let found;
  await waitFor(async () => {
    const view = await workspace.read({
      kind: 'harness.review-interaction',
      reviewIdentity,
      offset: 0,
      limit: 64,
    });
    found = view.invocations.find(invocation => invocation.status === status);
    return found !== undefined;
  }, `Invocation status ${status}`);
  return found;
}

async function currentReview(workspace) {
  const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  assert.ok(home.header.currentReviewIdentity, 'A Current Review must exist');
  return home.header.currentReviewIdentity;
}

async function runBuiltCommitFaultMatrix(options) {
  const faultCheckout = path.join(root, 'fault-checkout');
  await mkdir(faultCheckout, { recursive: true });
  await execFileAsync(gitExecutable, ['-C', faultCheckout, 'init', '-q']);
  await execFileAsync(gitExecutable, ['-C', faultCheckout, 'config', 'user.name', 'BuildFrame Fault Probe']);
  await execFileAsync(gitExecutable, ['-C', faultCheckout, 'config', 'user.email', 'neoflow@example.invalid']);
  await writeFile(path.join(faultCheckout, 'fault.txt'), 'before\n');
  await execFileAsync(gitExecutable, ['-C', faultCheckout, 'add', 'fault.txt']);
  await execFileAsync(gitExecutable, ['-C', faultCheckout, 'commit', '-qm', 'basis']);
  await writeFile(path.join(faultCheckout, 'fault.txt'), 'after\n');

  const bootstrapped = await options.bootstrapWorkspace({
    startPath: faultCheckout,
  });
  assert.equal(bootstrapped.status, 'ready');
  const identity = await bootstrapped.workspace.read({ kind: 'workspace.identity' });
  let authoritativeState = await options.openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: state,
  });
  let failNextCommit = false;
  const faultingState = {
    commit: async request => {
      if (failNextCommit && request.result.kind === 'harness.command-result') {
        failNextCommit = false;
        throw new Error('built failed commit');
      }
      return await authoritativeState.commit(request);
    },
    read: async request => await authoritativeState.read(request),
    readContent: async request => await authoritativeState.readContent(request),
    status: async () => await authoritativeState.status(),
    close: async () => await authoritativeState.close(),
  };
  let failAfterCommit = false;
  let directives = 0;
  const reviewedAttachment = {
    evidenceIdentity: 'p15-built-fault-attachment',
    attachmentIdentity: `att_${'8'.repeat(64)}`,
    workspaceIdentity: identity.workspaceIdentity,
    hostVersion: '0.80.6',
    destination: {
      harnessLabel: options.manifest.adapterDisplayName,
      sessionLabel: 'built fault session',
      repositoryLabel: 'fault-checkout',
      canonicalCheckout: identity.canonicalCheckout,
    },
    availability: { status: 'available' },
  };
  const reviewedAdapter = {
    manifest: options.manifest,
    attachment: reviewedAttachment,
    connect() {
      return {
        perform: async () => {
          directives += 1;
          return { status: 'accepted-for-observation' };
        },
      };
    },
  };
  const assembly = options.openRuntimeWorkspace(identity.workspaceIdentity, identity.canonicalCheckout, faultingState, {
    afterHarnessCommitBeforeDirective: () => {
      if (!failAfterCommit) return;
      failAfterCommit = false;
      throw new Error('built death after commit before directive');
    },
  });
  assert.equal((await assembly.harnessAdapters.establish(reviewedAdapter)).status, 'established');
  const capture = await assembly.workspace.read({
    kind: 'workspace.current-changes.capture',
  });
  assert.equal(capture.status, 'captured');
  const manifest = await assembly.workspace.read({
    kind: 'workspace.current-changes.manifest',
    evidenceIdentity: capture.evidenceIdentity,
    offset: 0,
    limit: 1,
  });
  assert.equal(manifest.status, 'available');
  const fileIdentity = manifest.files[0]?.fileIdentity;
  assert.ok(fileIdentity);
  let home = await assembly.workspace.read({
    kind: 'workspace.home',
    offset: 0,
    limit: 64,
  });
  const started = await assembly.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'p15-built-fault-start',
    expectedStateVersion: home.stateVersion,
  });
  assert.equal(started.kind, 'review.current-changes.started');
  const inspection = await assembly.workspace.read({
    kind: 'harness.review-question.inspect-default',
    reviewIdentity: started.reviewIdentity,
  });
  assert.equal(inspection.status, 'available');
  const command = {
    kind: 'review.question.ask',
    commandIdentity: 'p15-built-fault-ask',
    expectedStateVersion: inspection.stateVersion,
    reviewIdentity: started.reviewIdentity,
    anchor: {
      kind: 'review.diff-line',
      fileIdentity,
      side: 'new',
      line: 1,
    },
    body: 'Why?',
    attachmentIdentity: inspection.destination.attachmentIdentity,
    inspectionIdentity: inspection.inspectionIdentity,
  };

  failNextCommit = true;
  await assert.rejects(assembly.workspace.execute(command), /built failed commit/u);
  assert.equal(directives, 0);
  assert.equal(
    (
      await assembly.workspace.read({
        kind: 'harness.command-result',
        commandIdentity: command.commandIdentity,
      })
    ).status,
    'not-found',
  );

  failAfterCommit = true;
  await assert.rejects(assembly.workspace.execute(command), /built death after commit before directive/u);
  assert.equal(directives, 0);
  const recovered = await assembly.workspace.read({
    kind: 'harness.command-result',
    commandIdentity: command.commandIdentity,
  });
  assert.equal(recovered.status, 'available');
  assert.deepEqual(await assembly.workspace.execute(command), recovered.result);
  assert.equal(directives, 0, 'Duplicate command must not replay a directive');

  await faultingState.close();
  authoritativeState = await options.openAuthoritativeState({
    workspaceIdentity: identity.workspaceIdentity,
    privateStateDirectory: state,
  });
  const restarted = options.openRuntimeWorkspace(
    identity.workspaceIdentity,
    identity.canonicalCheckout,
    authoritativeState,
  );
  let replayedAfterRestart = 0;
  const reattached = {
    ...reviewedAdapter,
    connect() {
      return {
        perform: async () => {
          replayedAfterRestart += 1;
          return { status: 'accepted-for-observation' };
        },
      };
    },
  };
  assert.equal((await restarted.harnessAdapters.establish(reattached)).status, 'established');
  const durable = await restarted.workspace.read({
    kind: 'harness.review-interaction',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 64,
  });
  assert.equal(durable.invocations[0]?.status, 'awaiting-start');
  assert.equal(replayedAfterRestart, 0);
  await authoritativeState.close();
}

let openedApplication;
let adapterTransport;
let cliController;
try {
  process.env.XDG_STATE_HOME = state;
  process.env.XDG_RUNTIME_DIR = runtime;
  process.env.XDG_CONFIG_HOME = configuration;
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true, mode: 0o700 });
  await mkdir(runtime, { recursive: true, mode: 0o700 });
  await mkdir(configuration, { recursive: true, mode: 0o700 });
  await git('init', '-q');
  await git('config', 'user.name', 'BuildFrame Dogfood Probe');
  await git('config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(checkout, 'review.ts'), 'old one\nshared\nold three\n');
  await git('add', 'review.ts');
  await git('commit', '-qm', 'basis');
  const capturedWorkingBytes = 'const answer = "new one";\nshared\nnew three\n';
  await writeFile(path.join(checkout, 'review.ts'), capturedWorkingBytes);

  const { openDeveloperReviewingForTest } = await import('../apps/buildframe/dist/launcherTestHarness.js');
  const { bootstrapWorkspace } = await import('../packages/workspace/dist/index.js');
  const { openAuthoritativeState } = await import('../packages/workspace/dist/authoritativeState.js');
  const { openRuntimeWorkspace } = await import('../packages/workspace/dist/workspace.js');
  const { connectWorkspaceRuntime } = await import('../packages/local-runtime/dist/index.js');
  const { connectHarnessAdapterRuntime } = await import('../packages/local-runtime/dist/harnessAdapter.js');
  const { PiReviewedAdapter } = await import('../packages/pi-adapter/dist/piAdapter.js');

  const identityBootstrap = await bootstrapWorkspace({ startPath: checkout });
  assert.equal(identityBootstrap.status, 'ready');
  const identity = await identityBootstrap.workspace.read({ kind: 'workspace.identity' });
  const host = new ScriptedPiHost();
  const adapter = new PiReviewedAdapter({
    workspaceIdentity: identity.workspaceIdentity,
    canonicalCheckout: identity.canonicalCheckout,
    hostVersion: '0.80.6',
    sessionIdentity: 'p15-dogfood-session',
    sessionEpoch: 'p15-dogfood-epoch',
    native: host,
    // This probe pins the enforced read-only gate; write mode is covered by
    // the Adapter contract tests and the application disclosure scenario.
    authority: 'discussion-only',
  });

  const firstTerminal = await ScriptedTerminal.create();
  let highlightClient;
  let highlightDirectory;
  openedApplication = await openDeveloperReviewingForTest({
    startPath: checkout,
    renderer: firstTerminal.renderer,
    createHighlightClient: dataPath => {
      assert.equal(highlightClient, undefined, 'One client per application');
      highlightDirectory = dataPath;
      highlightClient = new TreeSitterClient({ dataPath });
      return highlightClient;
    },
    idleGraceMilliseconds: 200,
    startupTimeoutMilliseconds: 8_000,
  });
  assert.equal(
    openedApplication.status,
    'opened',
    openedApplication.status === 'rejected' ? JSON.stringify(openedApplication.diagnostic) : undefined,
  );
  if (openedApplication.status !== 'opened') throw new Error('Dogfood application rejected');

  cliController = new AbortController();
  const cli = await connectWorkspaceRuntime({
    workspaceIdentity: identity.workspaceIdentity,
    role: 'cli',
    signal: cliController.signal,
  });
  assert.equal(cli.status, 'connected');
  if (cli.status !== 'connected') throw new Error('Dogfood CLI session rejected');
  const firstRuntimeGeneration = cli.runtimeGeneration;
  adapterTransport = await connectHarnessAdapterRuntime({
    workspaceIdentity: identity.workspaceIdentity,
    adapter,
  });
  assert.equal(adapterTransport.status, 'connected');
  if (adapterTransport.status !== 'connected') throw new Error('Pi Adapter rejected');
  await adapter.runtimeConnected(adapterTransport.runtimeGeneration);
  const firstReadyHome = await cli.workspace.read({
    kind: 'workspace.home',
    offset: 0,
    limit: 64,
  });
  assert.equal(firstReadyHome.header.currentReviewIdentity, undefined);
  await waitForOutput(firstTerminal, 'Review current changes');

  assert.equal(highlightClient, undefined, 'Home must not start the parser worker');
  firstTerminal.send('\r');
  await waitForOutput(firstTerminal, 'Current Review · ');
  await waitFor(async () => {
    await firstTerminal.flush();
    return firstTerminal.setup
      .captureSpans()
      .lines.some(line =>
        line.spans.some(
          span => span.text.includes('const') && span.fg.equals(RGBA.fromHex(QUIET_GRAPHITE.tokens.keyword)),
        ),
      );
  }, 'compiled rich Diff');
  assert.equal(highlightClient.isInitialized(), true);
  assert.deepEqual(highlightClient.getAllBuffers(), []);
  // Same closed Workspace, exact same visible content, with color explicitly off.
  const { createReviewingApplicationForTest } = await import('../apps/buildframe/dist/reviewingScreen.js');
  const plainTerminal = await ScriptedTerminal.create();
  const plainApplication = createReviewingApplicationForTest({
    workspace: cli.workspace,
    renderer: plainTerminal.renderer,
    presentation: { noColor: true, ascii: false },
    createHighlightClient: () => {
      throw new Error('no-color must not start a worker');
    },
  });
  try {
    await plainApplication.start();
    await waitForOutput(plainTerminal, 'Current Review · ');
    assert.equal(plainTerminal.setup.captureCharFrame(), firstTerminal.setup.captureCharFrame());
  } finally {
    await plainApplication.stop();
  }
  await selectFirstCurrentDiffLine(firstTerminal);
  const firstComposerCheckpoint = firstTerminal.checkpoint();
  firstTerminal.send('a');
  await waitForOutput(firstTerminal, 'New Message · ', firstComposerCheckpoint);
  firstTerminal.send('Why did the first line change?');
  const firstAsk = firstTerminal.checkpoint();
  firstTerminal.send('\r');
  await waitFor(() => host.sent.length === 1, 'first atomic Pi Ask');
  const firstReviewIdentity = await currentReview(cli.workspace);
  await drivePiOutcome(adapter, host, 'stop');
  await waitForInvocation(cli.workspace, firstReviewIdentity, 'ended-normally');
  // The expanded Message row wraps its bounded preview at the pane width, so
  // the terminal shows its first row while the durable projection below keeps
  // the complete accepted Response body.
  await waitForOutput(firstTerminal, '✓ answered', firstAsk);
  await waitForOutput(firstTerminal, 'Complete scripted Pi', firstAsk);
  const firstMessages = await cli.workspace.read({
    kind: 'review.messages',
    reviewIdentity: firstReviewIdentity,
    offset: 0,
    limit: 8,
  });
  assert.equal(firstMessages.status, 'available');
  const firstResponse = firstMessages.messages.items[0]?.response;
  assert.ok(firstResponse, 'Normal settlement must materialize one Response');
  assert.equal(
    Buffer.from(firstResponse.body.bytesBase64, 'base64').toString('utf8'),
    'Complete scripted Pi Response.',
  );

  await openedApplication.session.stop();
  assert.equal(highlightClient.isInitialized(), false, 'Application stop awaits parser destruction');
  await assert.rejects(access(highlightDirectory), 'Application stop removes its temporary cache');
  openedApplication = undefined;
  const secondTerminal = await ScriptedTerminal.create();
  openedApplication = await openDeveloperReviewingForTest({
    startPath: checkout,
    renderer: secondTerminal.renderer,
    idleGraceMilliseconds: 200,
    startupTimeoutMilliseconds: 8_000,
  });
  assert.equal(openedApplication.status, 'opened');
  if (openedApplication.status !== 'opened') throw new Error('TUI restart rejected');
  assert.equal(host.sent.length, 1, 'TUI restart must not replay the Pi Ask');
  await waitForOutput(secondTerminal, 'Current Review · ');

  secondTerminal.send('\u001b');
  await waitForOutput(secondTerminal, 'Continue Current Review');
  const beforeSecond = await cli.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  const secondReview = await cli.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'dogfood-second-current-review',
    expectedStateVersion: beforeSecond.stateVersion,
  });
  assert.equal(secondReview.kind, 'review.current-changes.started');
  const retained = await cli.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  assert.equal(retained.header.currentReviewIdentity, secondReview.reviewIdentity);
  assert.equal(retained.reviews.items[0]?.reviewIdentity, firstReviewIdentity);
  assert.equal(retained.reviews.items[0]?.retention, 'previous');
  await waitForOutput(secondTerminal, 'Previous Reviews');

  await openedApplication.session.stop();
  openedApplication = undefined;
  await adapterTransport.dispose();
  adapterTransport = undefined;
  await adapter.runtimeDisconnected(firstRuntimeGeneration);
  cliController.abort();
  cliController = undefined;
  await new Promise(resolve => setTimeout(resolve, 2_000));
  const stoppedCheck = new AbortController();
  const stoppedRuntime = await connectWorkspaceRuntime({
    workspaceIdentity: identity.workspaceIdentity,
    role: 'cli',
    signal: stoppedCheck.signal,
  });
  stoppedCheck.abort();
  assert.equal(stoppedRuntime.status, 'rejected', 'All detached clients must release the runtime');

  let thirdTerminal = await ScriptedTerminal.create();
  openedApplication = await openDeveloperReviewingForTest({
    startPath: checkout,
    renderer: thirdTerminal.renderer,
    idleGraceMilliseconds: 200,
    startupTimeoutMilliseconds: 8_000,
  });
  assert.equal(openedApplication.status, 'opened');
  if (openedApplication.status !== 'opened') throw new Error('Runtime restart rejected');
  cliController = new AbortController();
  const replacementCli = await connectWorkspaceRuntime({
    workspaceIdentity: identity.workspaceIdentity,
    role: 'cli',
    signal: cliController.signal,
  });
  assert.equal(replacementCli.status, 'connected');
  if (replacementCli.status !== 'connected') throw new Error('Replacement CLI rejected');
  assert.notEqual(replacementCli.runtimeGeneration, firstRuntimeGeneration);
  adapterTransport = await connectHarnessAdapterRuntime({
    workspaceIdentity: identity.workspaceIdentity,
    adapter,
  });
  assert.equal(adapterTransport.status, 'connected');
  if (adapterTransport.status !== 'connected') throw new Error('Replacement Pi Adapter rejected');
  await adapter.runtimeConnected(adapterTransport.runtimeGeneration);
  assert.equal(host.sent.length, 1, 'Runtime restart must not replay the Pi Ask');
  await waitForOutput(thirdTerminal, 'Current Review · ');

  await writeFile(path.join(checkout, 'review.ts'), `${capturedWorkingBytes}moved\n`);
  await waitForOutput(thirdTerminal, 'moved');
  await selectFirstCurrentDiffLine(thirdTerminal);
  const staleComposerCheckpoint = thirdTerminal.checkpoint();
  thirdTerminal.send('a');
  await waitForOutput(thirdTerminal, 'New Message · ', staleComposerCheckpoint);
  thirdTerminal.send('What happens if this Live target moves?');
  await thirdTerminal.flush();
  const previewCheckpoint = thirdTerminal.checkpoint();
  thirdTerminal.pressKey('F3');
  await waitForOutput(thirdTerminal, 'Preview · exactly what will be sent', previewCheckpoint);
  assert.equal(host.sent.length, 1, 'Preview must produce no Pi effect');
  thirdTerminal.send('\u001b');
  await waitForOutput(thirdTerminal, '[Enter] send  [F3] preview', previewCheckpoint);
  // A draft with text needs a second Esc to throw away.
  thirdTerminal.send('\u001b');
  await waitForOutput(thirdTerminal, 'Press Esc again to discard this draft.', previewCheckpoint);
  thirdTerminal.send('\u001b');
  await waitForOutput(thirdTerminal, 'Message discarded; nothing was sent.', previewCheckpoint);
  await writeFile(
    path.join(checkout, 'review.ts'),
    'const answer = "moved after cancellation";\nshared\nnew three\nmoved\n',
  );
  assert.equal(host.sent.length, 1, 'Cancellation and later source movement must produce no Pi effect');

  await writeFile(path.join(checkout, 'review.ts'), capturedWorkingBytes);
  await openedApplication.session.stop();
  openedApplication = undefined;
  thirdTerminal = await ScriptedTerminal.create();
  openedApplication = await openDeveloperReviewingForTest({
    startPath: checkout,
    renderer: thirdTerminal.renderer,
    idleGraceMilliseconds: 200,
    startupTimeoutMilliseconds: 8_000,
  });
  assert.equal(openedApplication.status, 'opened');
  if (openedApplication.status !== 'opened') throw new Error('Fresh verification TUI rejected');
  await waitForOutput(thirdTerminal, 'Current Review · ');
  await selectFirstCurrentDiffLine(thirdTerminal);
  const failedComposerCheckpoint = thirdTerminal.checkpoint();
  thirdTerminal.send('a');
  await waitForOutput(thirdTerminal, 'New Message · ', failedComposerCheckpoint);
  thirdTerminal.send('Show the non-normal outcome.');
  thirdTerminal.send('\r');
  await waitFor(() => host.sent.length === 2, 'second explicit Pi Ask');
  const failedReviewIdentity = await currentReview(replacementCli.workspace);
  await drivePiOutcome(adapter, host, 'error');
  await waitForInvocation(replacementCli.workspace, failedReviewIdentity, 'failed');
  // A failed invocation leaves the Message with no fabricated Response; its
  // row says it failed.
  await waitForOutput(thirdTerminal, 'failed', failedComposerCheckpoint);
  const failedMessages = await replacementCli.workspace.read({
    kind: 'review.messages',
    reviewIdentity: failedReviewIdentity,
    offset: 0,
    limit: 8,
  });
  assert.equal(failedMessages.status, 'available');
  assert.equal(failedMessages.messages.items.at(-1)?.response, undefined);
  assert.equal(host.sent.length, 2, 'Only two explicit Ask actions may dispatch');
  await runBuiltCommitFaultMatrix({
    bootstrapWorkspace,
    openAuthoritativeState,
    openRuntimeWorkspace,
    manifest: adapter.manifest,
  });
  console.log('first dogfood executable built end-to-end and fault probe passed');
} finally {
  if (openedApplication?.status === 'opened') {
    await openedApplication.session.stop().catch(() => undefined);
  }
  if (adapterTransport?.status === 'connected') {
    await adapterTransport.dispose().catch(() => undefined);
  }
  cliController?.abort();
  if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
  else process.env.XDG_STATE_HOME = originalStateHome;
  if (originalRuntimeDirectory === undefined) delete process.env.XDG_RUNTIME_DIR;
  else process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
  if (originalConfigurationHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalConfigurationHome;
  await rm(root, { recursive: true, force: true });
}
