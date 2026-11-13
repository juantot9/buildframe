import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceIdentity = 'wsp_11111111-1111-4111-8111-111111111111';
const migrationCheckpoints = [
  'candidate-created',
  'candidate-validated',
  'generation-installed',
  'current-prepared',
  'current-switched',
];
const exactPayload = new Uint8Array([0x00, 0xff, 0xc3, 0x28, 0x0a]);
const exactContent = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff, 0x0d, 0x0a, 0x00]);
const self = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(self), '..');
const goldenFormat1 = path.join(repoRoot, 'packages/workspace/test/fixtures/authoritative-state/format-1');

async function runChild(mode, privateStateDirectory, ...args) {
  const child = fork(self, [mode, ...args], {
    env: { ...process.env, BUILDFRAME_STATE_PROBE_DIRECTORY: privateStateDirectory },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  const message = await nextMessage(child);
  await waitForExit(child);
  return message;
}

function startChild(mode, privateStateDirectory, ...args) {
  return fork(self, [mode, ...args], {
    env: { ...process.env, BUILDFRAME_STATE_PROBE_DIRECTORY: privateStateDirectory },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
}

function nextMessage(child) {
  return new Promise((resolve, reject) => {
    const onMessage = message => {
      cleanup();
      resolve(message);
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`State probe child exited before its barrier (${code ?? signal})`));
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

async function killAtBarrier(child) {
  assert.equal(child.kill('SIGKILL'), true);
  await waitForExit(child);
  assert.equal(child.signalCode, 'SIGKILL');
}

function stateRoot(privateStateDirectory) {
  return path.join(privateStateDirectory, 'workspaces', workspaceIdentity, 'authoritative-state');
}

async function installGolden(privateStateDirectory) {
  const root = stateRoot(privateStateDirectory);
  await mkdir(path.dirname(root), { recursive: true, mode: 0o700 });
  await cp(goldenFormat1, root, { recursive: true });
}

async function childMain(mode) {
  const privateStateDirectory = process.env.BUILDFRAME_STATE_PROBE_DIRECTORY;
  assert.ok(privateStateDirectory);
  assert.ok(process.send);
  const { openAuthoritativeState } = await import('../packages/workspace/dist/authoritativeState.js');

  if (mode === 'migrate-pause') {
    const checkpoint = process.argv[3];
    assert.ok(migrationCheckpoints.includes(checkpoint));
    await openAuthoritativeState({
      privateStateDirectory,
      workspaceIdentity,
      testControl: {
        pauseAtMigrationCheckpoint: checkpoint,
        onMigrationCheckpoint(reached) {
          process.send({ kind: 'migration-checkpoint', checkpoint: reached });
        },
      },
    });
    throw new Error('Migration pause unexpectedly returned');
  }

  if (mode === 'attempt') {
    try {
      const state = await openAuthoritativeState({
        privateStateDirectory,
        workspaceIdentity,
      });
      process.send({ kind: 'opened' });
      await state.close();
    } catch (error) {
      process.send({ kind: 'rejected', code: error?.code });
    }
    process.disconnect();
    return;
  }

  const state = await openAuthoritativeState({
    privateStateDirectory,
    workspaceIdentity,
  });
  if (mode === 'hold') {
    process.send({ kind: 'lease-held' });
    return;
  }
  if (mode === 'commit') {
    const committed = await state.commit({
      commandIdentity: 'probe-command-durable-commit',
      expectedStateVersion: 0,
      records: [
        {
          recordClass: 'immutable',
          recordIdentity: 'probe-record-exact-bytes',
          workflowIdentity: 'probe-workflow',
          kind: 'probe.snapshot',
          schemaVersion: 1,
          payload: exactPayload,
          content: [{ role: 'exact-source', bytes: exactContent }],
        },
      ],
      result: {
        kind: 'probe.commit-complete',
        schemaVersion: 1,
        payload: new Uint8Array([0x64, 0x6f, 0x6e, 0x65]),
      },
    });
    assert.equal(committed.status, 'committed');
    // This explicit IPC barrier is emitted only after SQLite COMMIT returned.
    process.send({ kind: 'commit-returned', stateVersion: committed.stateVersion });
    return;
  }
  if (mode === 'verify-migrated') {
    const status = await state.status();
    assert.equal(status.access, 'read-write');
    assert.equal(status.storeFormatVersion, 2);
    assert.equal(status.stateVersion, 2);
    const snapshot = await state.read({
      recordIdentities: ['record-golden-stable'],
      includeContent: true,
    });
    assert.deepEqual(snapshot.records[0]?.payload, new Uint8Array([0x00, 0xff, 0x53, 0x31]));
    assert.deepEqual(snapshot.records[0]?.content[0]?.bytes, new Uint8Array([0x00, 0x0a, 0x80, 0xff, 0x53]));
    process.send({ kind: 'migration-verified' });
    await state.close();
    process.disconnect();
    return;
  }
  if (mode === 'verify') {
    const snapshot = await state.read({
      recordIdentities: ['probe-record-exact-bytes'],
      includeContent: true,
    });
    assert.equal(snapshot.stateVersion, 1);
    assert.deepEqual(snapshot.records[0]?.payload, exactPayload);
    assert.deepEqual(snapshot.records[0]?.content[0]?.bytes, exactContent);
    process.send({ kind: 'durable-bytes-verified' });
    await state.close();
    process.disconnect();
    return;
  }
  throw new Error(`Unknown State probe mode: ${mode}`);
}

async function parentMain() {
  const privateStateDirectory = await mkdtemp(path.join(tmpdir(), 'buildframe-authoritative-state-probe-'));
  let liveChild;
  try {
    liveChild = startChild('hold', privateStateDirectory);
    assert.deepEqual(await nextMessage(liveChild), { kind: 'lease-held' });

    assert.deepEqual(await runChild('attempt', privateStateDirectory), {
      kind: 'rejected',
      code: 'writer-lease-unavailable',
    });
    await killAtBarrier(liveChild);
    liveChild = undefined;

    assert.deepEqual(await runChild('attempt', privateStateDirectory), {
      kind: 'opened',
    });

    liveChild = startChild('commit', privateStateDirectory);
    assert.deepEqual(await nextMessage(liveChild), {
      kind: 'commit-returned',
      stateVersion: 1,
    });
    await killAtBarrier(liveChild);
    liveChild = undefined;

    assert.deepEqual(await runChild('verify', privateStateDirectory), {
      kind: 'durable-bytes-verified',
    });

    for (const checkpoint of migrationCheckpoints) {
      const migrationDirectory = await mkdtemp(path.join(tmpdir(), `buildframe-state-migration-${checkpoint}-`));
      try {
        await installGolden(migrationDirectory);
        const priorBytes = await readFile(path.join(stateRoot(migrationDirectory), 'generation-1.sqlite'));
        liveChild = startChild('migrate-pause', migrationDirectory, checkpoint);
        assert.deepEqual(await nextMessage(liveChild), {
          kind: 'migration-checkpoint',
          checkpoint,
        });
        await killAtBarrier(liveChild);
        liveChild = undefined;

        const current = (await readFile(path.join(stateRoot(migrationDirectory), 'CURRENT'), 'utf8')).trim();
        assert.equal(
          checkpoint === 'current-switched' ? current !== 'generation-1.sqlite' : current === 'generation-1.sqlite',
          true,
        );
        assert.deepEqual(await readFile(path.join(stateRoot(migrationDirectory), 'generation-1.sqlite')), priorBytes);
        assert.deepEqual(await runChild('verify-migrated', migrationDirectory), { kind: 'migration-verified' });
      } finally {
        await rm(migrationDirectory, { recursive: true, force: true });
      }
    }

    console.log(
      'Authoritative State compiled-process probes passed: writer exclusion, crash release, immediate-SIGKILL durability, and every migration switch checkpoint',
    );
  } finally {
    if (liveChild) {
      liveChild.kill('SIGKILL');
      await waitForExit(liveChild).catch(() => undefined);
    }
    await rm(privateStateDirectory, { recursive: true, force: true });
  }
}

const mode = process.argv[2];
if (mode) {
  await childMain(mode);
} else {
  await parentMain();
}
