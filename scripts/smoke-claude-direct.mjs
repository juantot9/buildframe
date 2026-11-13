import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

/**
 * Process-level check of the built Claude Direct helper: the exact launcher the
 * Mod runs, its detached daemon, and the loopback channel, against a real
 * runtime socket and Workspace. This script plays the Mod; no Claude runs.
 */
const execFileAsync = promisify(execFile);
const root = process.cwd();
const load = async file => await import(pathToFileURL(path.join(root, file)).href);
const { openWorkspaceRuntimeOwner } = await load('packages/workspace/dist/runtime.js');
const { startLocalRuntimeServer } = await load('packages/local-runtime/dist/launcher.js');
const launchEntry = path.join(root, 'packages/claude-adapter/plugin/helper/launch.js');

const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'buildframe-claude-direct-smoke-')));
const checkout = path.join(scratch, 'checkout');
await mkdir(checkout);
await mkdir(path.join(scratch, 'state'));
process.env.XDG_STATE_HOME = path.join(scratch, 'state');
const git = async (...arguments_) => await execFileAsync('git', ['-C', checkout, ...arguments_]);
await git('init', '-q');
await git('config', 'user.name', 'BuildFrame Smoke');
await git('config', 'user.email', 'neoflow@example.invalid');
await writeFile(path.join(checkout, 'review.txt'), 'before\n');
await git('add', 'review.txt');
await git('commit', '-qm', 'basis');
await writeFile(path.join(checkout, 'review.txt'), 'after\n');

function launch(hostVersion) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launchEntry], { stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.on('error', reject);
    child.on('close', () => resolve(JSON.parse(stdout.trim())));
    child.stdin.end(JSON.stringify({ protocolVersion: 1, sessionId: 'smoke-session', cwd: checkout, hostVersion }));
  });
}

const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
assert.equal(opened.status, 'ready', 'smoke checkout must open');
const owner = opened.owner;
const server = await startLocalRuntimeServer({
  workspace: owner.workspace,
  harnessAdapters: owner.harnessAdapters,
  runtimeGeneration: `rtg_${randomUUID()}`,
  runtimeCodeIdentity: `rtc_${'1'.repeat(64)}`,
});

try {
  for (const version of ['2.1.309', '3.0.0']) {
    const unsupported = await launch(version);
    assert.equal(
      unsupported.status,
      'refused',
      `Claude ${version} is outside the supported range and must refuse attachment`,
    );
  }

  const attached = await launch('2.1.319');
  assert.equal(attached.status, 'connected', attached.label);
  assert.match(attached.token, /^[0-9a-f]{64}$/);
  const post = async (route, body = {}, token = attached.token) =>
    await fetch(`http://127.0.0.1:${attached.port}${route}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await post('/next', {}, '0'.repeat(64))).status, 404, 'a wrong token must be refused');

  const home = await owner.workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  const started = await owner.workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: 'claude-direct-smoke-start',
    expectedStateVersion: home.stateVersion,
  });
  const bases = await owner.workspace.read({
    kind: 'review.bases',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 8,
  });
  const live = bases.bases.items.find(item => item.kind === 'live');
  const location = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 };
  const body = 'Smoke: why did this change?';
  const inspection = await owner.workspace.read({
    kind: 'harness.review-message.inspect-default',
    reviewIdentity: started.reviewIdentity,
    originReviewBasisIdentity: live.reviewBasisIdentity,
    location,
    body,
  });
  assert.equal(inspection.status, 'available', inspection.reason);
  assert.equal(inspection.destination.harnessLabel, 'Claude Code');

  // The commit waits for the Mod to confirm its submit, so play the Mod concurrently.
  const committed = owner.workspace.execute({
    kind: 'review.message.commit',
    commandIdentity: 'claude-direct-smoke-commit',
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
  let submit;
  for (let attempt = 0; attempt < 5 && submit === undefined; attempt += 1) {
    const { commands } = await (await post('/next')).json();
    submit = commands.find(command => command.type === 'submit');
  }
  assert.ok(submit, 'the committed Message must reach the Mod');
  assert.equal(Buffer.from(submit.text, 'utf8').toString('base64'), inspection.outgoingMaterial.bytesBase64);
  assert.equal(
    (await post('/facts', { facts: [{ type: 'submit-called', dispatchId: submit.dispatchId }] })).status,
    200,
  );
  assert.equal((await committed).status, 'accepted');
  await post('/facts', {
    facts: [
      { type: 'turn-start', turnId: 'smoke-turn', matchesPending: true },
      { type: 'submit-resolved', dispatchId: submit.dispatchId, entered: true },
      { type: 'turn-complete', turnId: 'smoke-turn', reason: 'answer', answer: 'Smoke answer.' },
    ],
  });

  const interaction = await owner.workspace.read({
    kind: 'harness.review-interaction',
    reviewIdentity: started.reviewIdentity,
    offset: 0,
    limit: 8,
  });
  assert.deepEqual(
    interaction.invocations.map(invocation => invocation.status),
    ['ended-normally'],
  );

  assert.equal((await post('/detach')).status, 200);
  await new Promise(resolve => setTimeout(resolve, 300));
  await assert.rejects(post('/next'), 'the helper must exit after detach');
  console.log('Claude Direct smoke: attach, exact delivery, correlated end, and detach passed');
} finally {
  await server.dispose();
  await owner.dispose();
  await rm(scratch, { recursive: true, force: true });
}
