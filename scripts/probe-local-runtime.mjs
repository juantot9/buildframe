import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { resolveGitExecutable } from '../packages/workspace/dist/gitProcess.js';

const self = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(self), '..');
const runtimeEntrypoint = path.join(repoRoot, 'apps/buildframe/dist/runtimeProcess.js');
const localRuntimeLauncher = path.join(repoRoot, 'packages/local-runtime/dist/launcher.js');
const gracefulWorkspaceIdentity = 'wsp_88888888-8888-4888-8888-888888888888';
const gitExecutable = await resolveGitExecutable();

function waitForMessage(child, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const onMessage = message => {
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`Runtime probe child exited before its barrier (${code ?? signal})`));
    };
    const cleanup = () => {
      child.off('message', onMessage);
      child.off('error', onError);
      child.off('exit', onExit);
    };
    child.on('message', onMessage);
    child.on('error', onError);
    child.on('exit', onExit);
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    child.once('exit', () => resolve());
    child.once('error', reject);
  });
}

function startRuntime(checkout, idleGraceMilliseconds, entrypoint = runtimeEntrypoint) {
  const child = spawn(process.execPath, [entrypoint], {
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child.once('spawn', () => {
    child.send({
      type: 'runtime.start',
      version: 1,
      startPath: checkout,
      idleGraceMilliseconds,
    });
  });
  return child;
}

async function makeCheckout(root, name) {
  const checkout = path.join(root, name);
  await mkdir(checkout, { recursive: true });
  await runGit(checkout, 'init', '-q');
  return checkout;
}

async function runGit(checkout, ...arguments_) {
  const child = spawn(gitExecutable, ['-C', checkout, ...arguments_], {
    stdio: 'inherit',
  });
  await waitForExit(child);
  assert.equal(child.exitCode, 0);
}

async function waitUntil(predicate, label, attempts = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function gracefulChildMain() {
  assert.ok(process.send);
  const { openAuthoritativeState } = await import('../packages/workspace/dist/authoritativeState.js');
  const { startLocalRuntimeServer } = await import('../packages/local-runtime/dist/launcher.js');
  const { preparePrivateRuntimeDirectory, removeStaleRuntimeEndpoint, runtimeLocationForWorkspace } =
    await import('../packages/local-runtime/dist/runtimeLocation.js');

  const state = await openAuthoritativeState({
    workspaceIdentity: gracefulWorkspaceIdentity,
    privateStateDirectory: process.env.XDG_STATE_HOME,
  });
  let releaseOperation;
  const operationBarrier = new Promise(resolve => {
    releaseOperation = resolve;
  });
  process.on('message', message => {
    if (message?.type === 'complete-operation') releaseOperation();
  });

  const workspace = {
    async execute() {
      process.send({ type: 'operation-started' });
      await operationBarrier;
      const committed = await state.commit({
        commandIdentity: 'p08-graceful-command',
        expectedStateVersion: 0,
        records: [
          {
            recordClass: 'immutable',
            recordIdentity: 'p08-graceful-record',
            workflowIdentity: 'p08-graceful-workflow',
            kind: 'probe.runtime-shutdown',
            schemaVersion: 1,
            payload: new Uint8Array([0x50, 0x30, 0x38]),
            content: [],
          },
        ],
        result: {
          kind: 'probe.runtime-shutdown-complete',
          schemaVersion: 1,
          payload: new Uint8Array([0x6f, 0x6b]),
        },
      });
      assert.equal(committed.status, 'committed');
      process.send({ type: 'commit-returned' });
      return { kind: 'probe.committed' };
    },
    async read(request) {
      if (request?.kind !== 'workspace.identity') throw new Error('unknown view');
      return {
        kind: 'workspace.identity',
        interfaceVersion: 1,
        workspaceIdentity: gracefulWorkspaceIdentity,
        canonicalCheckout: '/probe/graceful',
      };
    },
    subscribe() {
      return () => {};
    },
  };

  const location = runtimeLocationForWorkspace(gracefulWorkspaceIdentity);
  await preparePrivateRuntimeDirectory(location);
  await removeStaleRuntimeEndpoint(location);
  const server = await startLocalRuntimeServer({
    workspace,
    runtimeGeneration: 'rtg_88888888-8888-4888-8888-888888888888',
    runtimeCodeIdentity: `rtc_${'8'.repeat(64)}`,
  });

  let stopping = false;
  process.on('SIGTERM', () => {
    if (stopping) return;
    stopping = true;
    void (async () => {
      await server.dispose();
      await state.close();
      process.send({ type: 'shutdown-complete' });
      process.disconnect();
    })();
  });
  process.send({ type: 'graceful-ready' });
}

async function parentMain() {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-local-runtime-p08-'));
  const originalStateHome = process.env.XDG_STATE_HOME;
  const originalRuntimeDirectory = process.env.XDG_RUNTIME_DIR;
  let liveChild;
  let stormControllers = [];
  try {
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    process.env.XDG_RUNTIME_DIR = path.join(root, 'runtime');
    await mkdir(process.env.XDG_STATE_HOME, { recursive: true, mode: 0o700 });
    await mkdir(process.env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });

    const { bootstrapWorkspace } = await import('../packages/workspace/dist/index.js');
    const { connectWorkspaceRuntime, LocalRuntimeSessionError } =
      await import('../packages/local-runtime/dist/index.js');
    const { runtimeLocationForWorkspace } = await import('../packages/local-runtime/dist/runtimeLocation.js');
    const { openDeveloperWorkspaceRuntime } = await import('../apps/buildframe/dist/launcher.js');

    const checkout = await makeCheckout(root, 'launch-storm-checkout');
    const bootstrap = await bootstrapWorkspace({ startPath: checkout });
    assert.equal(bootstrap.status, 'ready');
    const identityView = await bootstrap.workspace.read({
      kind: 'workspace.identity',
    });

    stormControllers = Array.from({ length: 8 }, () => new AbortController());
    const storm = await Promise.all(
      stormControllers.map(controller =>
        openDeveloperWorkspaceRuntime({
          startPath: checkout,
          role: 'tui',
          signal: controller.signal,
          idleGraceMilliseconds: 200,
          startupTimeoutMilliseconds: 8_000,
        }),
      ),
    );
    assert.ok(
      storm.every(result => result.status === 'connected'),
      `launch storm rejected: ${JSON.stringify(storm)}`,
    );
    assert.equal(new Set(storm.map(result => result.runtimeGeneration)).size, 1);
    assert.ok(storm.every(result => result.workspaceIdentity === identityView.workspaceIdentity));
    for (const controller of stormControllers) controller.abort();

    const location = runtimeLocationForWorkspace(identityView.workspaceIdentity);
    await waitUntil(async () => {
      try {
        await lstat(location.endpoint);
        return false;
      } catch (error) {
        return error?.code === 'ENOENT';
      }
    }, 'idle runtime shutdown');

    liveChild = startRuntime(checkout, 2_000);
    assert.deepEqual(await waitForMessage(liveChild), {
      type: 'runtime.ready',
      version: 1,
    });
    const firstController = new AbortController();
    const first = await connectWorkspaceRuntime({
      workspaceIdentity: identityView.workspaceIdentity,
      role: 'tui',
      signal: firstController.signal,
    });
    assert.equal(first.status, 'connected');

    const loser = startRuntime(checkout, 2_000);
    assert.deepEqual(await waitForMessage(loser), {
      type: 'runtime.failed',
      version: 1,
      reason: 'writer-unavailable',
    });
    await waitForExit(loser);

    firstController.abort();
    await new Promise(resolve => setTimeout(resolve, 100));
    const retainedController = new AbortController();
    const retained = await connectWorkspaceRuntime({
      workspaceIdentity: identityView.workspaceIdentity,
      role: 'cli',
      signal: retainedController.signal,
    });
    assert.equal(retained.status, 'connected');
    assert.equal(retained.runtimeGeneration, first.runtimeGeneration);

    assert.equal(liveChild.kill('SIGKILL'), true);
    await waitForExit(liveChild);
    assert.equal(liveChild.signalCode, 'SIGKILL');
    liveChild = undefined;
    await assert.rejects(
      retained.workspace.read({ kind: 'workspace.identity' }),
      error => error instanceof LocalRuntimeSessionError && error.code === 'runtime-disconnected',
    );
    retainedController.abort();

    assert.equal((await lstat(location.endpoint)).isSocket(), true);

    liveChild = startRuntime(checkout, 2_000);
    assert.deepEqual(await waitForMessage(liveChild), {
      type: 'runtime.ready',
      version: 1,
    });
    const replacementController = new AbortController();
    const replacement = await connectWorkspaceRuntime({
      workspaceIdentity: identityView.workspaceIdentity,
      role: 'tui',
      signal: replacementController.signal,
    });
    assert.equal(replacement.status, 'connected');
    assert.notEqual(replacement.runtimeGeneration, first.runtimeGeneration);
    assert.equal(
      (await replacement.workspace.read({ kind: 'workspace.identity' })).workspaceIdentity,
      identityView.workspaceIdentity,
    );

    replacementController.abort();
    assert.equal(liveChild.kill('SIGTERM'), true);
    await waitForExit(liveChild);
    assert.equal(liveChild.exitCode, 0);
    liveChild = undefined;
    await assert.rejects(lstat(location.endpoint), { code: 'ENOENT' });

    // A runtime left behind by an earlier build is retired and replaced
    // exactly once, and everything it durably committed survives the change.
    const staleRuntimeEntrypoint = path.join(root, 'stale-runtime-process.js');
    await writeFile(
      staleRuntimeEntrypoint,
      `import { runWorkspaceRuntimeProcess } from ${JSON.stringify(
        pathToFileURL(localRuntimeLauncher).href,
      )};\nawait runWorkspaceRuntimeProcess({ runtimeEntrypoint: new URL(import.meta.url) });\n`,
    );
    await runGit(checkout, 'config', 'user.name', 'BuildFrame Runtime Probe');
    await runGit(checkout, 'config', 'user.email', 'neoflow@example.invalid');
    await writeFile(path.join(checkout, 'replacement.txt'), 'basis\n');
    await runGit(checkout, 'add', 'replacement.txt');
    await runGit(checkout, 'commit', '-qm', 'replacement basis');
    await writeFile(path.join(checkout, 'replacement.txt'), 'changed\n');

    const staleChild = startRuntime(checkout, 5_000, staleRuntimeEntrypoint);
    liveChild = staleChild;
    assert.deepEqual(await waitForMessage(staleChild), {
      type: 'runtime.ready',
      version: 1,
    });
    const staleController = new AbortController();
    const staleClient = await connectWorkspaceRuntime({
      workspaceIdentity: identityView.workspaceIdentity,
      role: 'cli',
      signal: staleController.signal,
    });
    assert.equal(staleClient.status, 'connected');
    const beforeReplacement = await staleClient.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    const durableStart = await staleClient.workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: 'p08-replacement-durable-start',
      expectedStateVersion: beforeReplacement.stateVersion,
    });
    assert.equal(durableStart.kind, 'review.current-changes.started');

    const replacementControllers = Array.from({ length: 4 }, () => new AbortController());
    const replacements = await Promise.all(
      replacementControllers.map(controller =>
        openDeveloperWorkspaceRuntime({
          startPath: checkout,
          role: 'tui',
          signal: controller.signal,
          idleGraceMilliseconds: 200,
          startupTimeoutMilliseconds: 8_000,
        }),
      ),
    );
    assert.ok(
      replacements.every(result => result.status === 'connected'),
      JSON.stringify(replacements),
    );
    assert.equal(new Set(replacements.map(result => result.runtimeGeneration)).size, 1);
    assert.notEqual(replacements[0].runtimeGeneration, staleClient.runtimeGeneration);
    await waitForExit(staleChild);
    assert.equal(staleChild.exitCode, 0, 'The mismatched runtime must retire on its own');
    liveChild = undefined;
    await assert.rejects(
      staleClient.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 }),
      error => error instanceof LocalRuntimeSessionError && error.code === 'runtime-disconnected',
    );
    staleController.abort();

    const afterReplacement = await replacements[0].workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
    assert.equal(afterReplacement.stateVersion, beforeReplacement.stateVersion + 1);
    assert.equal(afterReplacement.header.currentReviewIdentity, durableStart.reviewIdentity);
    assert.deepEqual(
      await replacements[0].workspace.execute({
        kind: 'review.current-changes.start',
        commandIdentity: 'p08-replacement-durable-start',
        expectedStateVersion: beforeReplacement.stateVersion,
      }),
      durableStart,
      'The committed command must be recalled, never replayed',
    );
    assert.equal(
      (await replacements[0].workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 })).stateVersion,
      afterReplacement.stateVersion,
    );

    for (const controller of replacementControllers) controller.abort();
    await waitUntil(async () => {
      try {
        await lstat(location.endpoint);
        return false;
      } catch (error) {
        return error?.code === 'ENOENT';
      }
    }, 'replacement runtime idle shutdown');

    let incompatibleBootstraps = 0;
    const incompatible = createServer(socket => {
      socket.once('data', () => {
        incompatibleBootstraps += 1;
        socket.end(
          `${JSON.stringify({
            type: 'bootstrap.rejected',
            code: 'protocol-incompatible',
            supportedProtocolVersion: 2,
            receivedProtocolVersion: 1,
          })}\n`,
        );
      });
    });
    await new Promise((resolve, reject) => {
      incompatible.once('error', reject);
      incompatible.listen(location.endpoint, resolve);
    });
    await chmod(location.endpoint, 0o600);
    const incompatibleResult = await openDeveloperWorkspaceRuntime({
      startPath: checkout,
      role: 'tui',
      idleGraceMilliseconds: 100,
      startupTimeoutMilliseconds: 1_000,
    });
    assert.deepEqual(incompatibleResult, {
      status: 'rejected',
      diagnostic: {
        code: 'runtime-protocol-incompatible',
        supportedVersion: 1,
        receivedVersion: 2,
      },
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(incompatibleBootstraps, 1);
    await new Promise(resolve => incompatible.close(resolve));

    const gracefulChild = spawn(process.execPath, [self, 'graceful-child'], {
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    });
    liveChild = gracefulChild;
    assert.deepEqual(await waitForMessage(gracefulChild), {
      type: 'graceful-ready',
    });
    const graceful = await connectWorkspaceRuntime({
      workspaceIdentity: gracefulWorkspaceIdentity,
      role: 'cli',
    });
    assert.equal(graceful.status, 'connected');
    const execution = graceful.workspace.execute({
      kind: 'probe.graceful-command',
    });
    assert.deepEqual(await waitForMessage(gracefulChild), {
      type: 'operation-started',
    });
    assert.equal(gracefulChild.kill('SIGTERM'), true);
    const disconnected = assert.rejects(
      execution,
      error => error instanceof LocalRuntimeSessionError && error.code === 'runtime-disconnected',
    );
    const commitBarrier = waitForMessage(gracefulChild, message => message?.type === 'commit-returned');
    const shutdownBarrier = waitForMessage(gracefulChild, message => message?.type === 'shutdown-complete');
    gracefulChild.send({ type: 'complete-operation' });
    await disconnected;
    assert.deepEqual(await commitBarrier, { type: 'commit-returned' });
    assert.deepEqual(await shutdownBarrier, { type: 'shutdown-complete' });
    await waitForExit(gracefulChild);
    assert.equal(gracefulChild.exitCode, 0);
    liveChild = undefined;

    const { openAuthoritativeState } = await import('../packages/workspace/dist/authoritativeState.js');
    const verification = await openAuthoritativeState({
      workspaceIdentity: gracefulWorkspaceIdentity,
      privateStateDirectory: process.env.XDG_STATE_HOME,
    });
    const committed = await verification.read({
      recordIdentities: ['p08-graceful-record'],
      includeContent: false,
    });
    assert.equal(committed.stateVersion, 1);
    assert.deepEqual(committed.records[0]?.payload, new Uint8Array([0x50, 0x30, 0x38]));
    await verification.close();

    console.log('local-runtime lifecycle risk probe passed');
  } finally {
    for (const controller of stormControllers) controller.abort();
    if (liveChild !== undefined) {
      liveChild.kill('SIGKILL');
      await waitForExit(liveChild).catch(() => undefined);
    }
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    if (originalRuntimeDirectory === undefined) delete process.env.XDG_RUNTIME_DIR;
    else process.env.XDG_RUNTIME_DIR = originalRuntimeDirectory;
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    });
  }
}

if (process.argv[2] === 'graceful-child') {
  await gracefulChildMain();
} else {
  await parentMain();
}
