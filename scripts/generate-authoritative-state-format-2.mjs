import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

// Explicit reviewed fixture generator for the State format 0.1.0 ships. Run it
// after `pnpm build`. Tests consume the checked-in bytes and never invoke it,
// so the frozen store stays exactly what this release wrote.
//
// It drives the real runtime Workspace with the real Pi and Claude Code
// Manifests: one Review, three Messages (answered and forked by a later change,
// unknown after a lost connection, answered by a newer session), and an
// earlier session retired into Review history.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'packages/workspace/test/fixtures/authoritative-state/format-2');
const load = async file => await import(pathToFileURL(path.join(repoRoot, file)).href);
const { openWorkspaceRuntimeOwner } = await load('packages/workspace/dist/runtime.js');
const { createPiReviewedCapabilityManifest, PI_REVIEWED_CAPABILITY_MANIFEST } = await load(
  'packages/pi-adapter/dist/capability.js',
);
const { createClaudeDirectCapabilityManifest } = await load('packages/claude-adapter/dist/direct/capability.js');

const execFileAsync = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const attachmentIdentity = seed => `att_${sha256(seed)}`;

const scratch = await realpath(await mkdtemp(path.join(tmpdir(), 'buildframe-state-format-2-')));
const checkout = path.join(scratch, 'checkout');
mkdirSync(checkout);
process.env.XDG_STATE_HOME = path.join(scratch, 'state');
mkdirSync(process.env.XDG_STATE_HOME);
const gitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'BuildFrame Fixture',
  GIT_AUTHOR_EMAIL: 'fixture@buildframe.invalid',
  GIT_AUTHOR_DATE: '2026-11-16T12:00:00Z',
  GIT_COMMITTER_NAME: 'BuildFrame Fixture',
  GIT_COMMITTER_EMAIL: 'fixture@buildframe.invalid',
  GIT_COMMITTER_DATE: '2026-11-16T12:00:00Z',
};
const git = async (...arguments_) =>
  await execFileAsync('git', ['-C', checkout, ...arguments_], { env: gitEnvironment });
await git('init', '-q', '-b', 'main');
await writeFile(path.join(checkout, 'review.txt'), 'before\nsame\n');
await writeFile(path.join(checkout, 'notes.md'), '# Notes\n\nUnchanged context.\n');
await git('add', '.');
await git('commit', '-qm', 'basis');
await writeFile(path.join(checkout, 'review.txt'), 'after\nsame\n');

/** Plays a connected session: records directives and emits the evidence it is told to. */
function session(identity, manifest, seed) {
  const attachment = {
    evidenceIdentity: `${seed}-establishment`,
    attachmentIdentity: attachmentIdentity(seed),
    workspaceIdentity: identity.workspaceIdentity,
    hostVersion: manifest.reviewedHostVersions[0],
    destination: {
      harnessLabel: manifest.adapterDisplayName,
      sessionLabel: `${seed} session`,
      repositoryLabel: 'fixture repository',
      canonicalCheckout: identity.canonicalCheckout,
    },
    availability: { status: 'available' },
  };
  const adapter = {
    manifest,
    attachment,
    directives: [],
    sink: undefined,
    connect(sink) {
      adapter.sink = sink;
      return {
        perform: async directive => {
          adapter.directives.push(directive);
          return { status: 'accepted-for-observation' };
        },
        release: () => {},
      };
    },
    async emit(evidence) {
      const acknowledgement = await adapter.sink.accept({
        attachmentIdentity: attachment.attachmentIdentity,
        ...evidence,
      });
      if (acknowledgement.status !== 'applied') throw new Error(JSON.stringify(acknowledgement));
    },
  };
  return adapter;
}

async function establish(owner, adapter) {
  const established = await owner.harnessAdapters.establish(adapter);
  if (established.status !== 'established') throw new Error(`Session refused: ${established.reason}`);
}

const MESSAGE_LOCATION = { pathBytesBase64: Buffer.from('review.txt').toString('base64'), line: 1 };

async function sendMessage(workspace, review, commandIdentity, body) {
  const inspection = await workspace.read({
    kind: 'harness.review-message.inspect-default',
    reviewIdentity: review.reviewIdentity,
    originReviewBasisIdentity: review.liveBasisIdentity,
    location: MESSAGE_LOCATION,
    body,
  });
  if (inspection.status !== 'available') throw new Error(`Message unavailable: ${inspection.reason}`);
  const committed = await workspace.execute({
    kind: 'review.message.commit',
    commandIdentity,
    expectedStateVersion: inspection.stateVersion,
    reviewIdentity: review.reviewIdentity,
    originReviewBasisIdentity: review.liveBasisIdentity,
    location: MESSAGE_LOCATION,
    body,
    attachmentIdentity: inspection.destination.attachmentIdentity,
    inspectionIdentity: inspection.inspectionIdentity,
    acceptedAcknowledgementRequirementIdentities: inspection.commitment.requirements.map(
      requirement => requirement.requirementIdentity,
    ),
  });
  if (committed.kind !== 'review.message.committed') throw new Error(`Message refused: ${JSON.stringify(committed)}`);
  return committed;
}

async function answer(adapter, committed, seed, contractIdentity, body) {
  await adapter.emit({
    kind: 'harness.invocation.start-observed',
    evidenceIdentity: `${seed}-start`,
    invocationIdentity: committed.invocationIdentity,
  });
  await adapter.emit({
    kind: 'harness.invocation.terminal-observed',
    evidenceIdentity: `${seed}-terminal`,
    invocationIdentity: committed.invocationIdentity,
    outcome: 'ended-normally',
    result: {
      contractVersion: 1,
      contractIdentity,
      source: 'settled-final-assistant-text',
      body,
      byteLength: Buffer.byteLength(body),
      sha256: sha256(body),
    },
  });
}

const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
if (opened.status !== 'ready') throw new Error(`Runtime refused: ${opened.diagnostic.code}`);
const owner = opened.owner;
const { workspace } = owner;
const identity = await workspace.read({ kind: 'workspace.identity' });

const piVersion = PI_REVIEWED_CAPABILITY_MANIFEST.reviewedHostVersions[0];
const pi = session(identity, createPiReviewedCapabilityManifest(piVersion), 'fixture-pi');
await establish(owner, pi);

const home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
const started = await workspace.execute({
  kind: 'review.current-changes.start',
  commandIdentity: 'fixture-review-start',
  expectedStateVersion: home.stateVersion,
});
if (started.kind !== 'review.current-changes.started') throw new Error('Review did not start');
const bases = await workspace.read({
  kind: 'review.bases',
  reviewIdentity: started.reviewIdentity,
  offset: 0,
  limit: 64,
});
const live = bases.status === 'available' ? bases.bases.items.find(item => item.kind === 'live') : undefined;
if (live === undefined) throw new Error('Live Basis unavailable');
const review = { reviewIdentity: started.reviewIdentity, liveBasisIdentity: live.reviewBasisIdentity };

// 1. Answered by Pi after the repository changed: the Response forks a Basis.
const answered = await sendMessage(workspace, review, 'fixture-message-answered', 'Why did the first line change?');
await writeFile(path.join(checkout, 'review.txt'), 'after, revised\nsame\n');
const answeredResponse = 'It now says "after"; the revision keeps the second line unchanged.';
await answer(
  pi,
  answered,
  'fixture-message-answered',
  'pi-settled-final-assistant-review-response-v1',
  answeredResponse,
);

// 2. Pi loses the connection mid-turn: the outcome is unknown.
const unknown = await sendMessage(workspace, review, 'fixture-message-unknown', 'Is the second line still needed?');
await pi.emit({
  kind: 'harness.invocation.start-observed',
  evidenceIdentity: 'fixture-message-unknown-start',
  invocationIdentity: unknown.invocationIdentity,
});
await pi.emit({
  kind: 'harness.invocation.correlation-lost',
  evidenceIdentity: 'fixture-message-unknown-lost',
  invocationIdentity: unknown.invocationIdentity,
  reason: 'attachment-lost',
});

// 3. A newer Claude Code session connects, retiring the idle Pi session into
// Review history, and answers after the unknown-turn gate.
const claude = session(identity, createClaudeDirectCapabilityManifest('2.1.310'), 'fixture-claude');
await establish(owner, claude);
const claudeMessage = await sendMessage(workspace, review, 'fixture-message-claude', 'Summarize this Review.');
const claudeResponse = 'One line changed twice; nothing else in the Review changed.';
await answer(claude, claudeMessage, 'fixture-message-claude', 'claude-code-direct-final-answer-v1', claudeResponse);

const finalHome = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
await owner.dispose();

const stateRoot = path.join(
  process.env.XDG_STATE_HOME,
  'buildframe',
  'workspaces',
  identity.workspaceIdentity,
  'authoritative-state',
);
const currentGeneration = readFileSync(path.join(stateRoot, 'CURRENT'), 'utf8').trim();
const leftovers = readdirSync(stateRoot).filter(entry => entry.startsWith(`${currentGeneration}-`));
if (leftovers.length > 0) throw new Error(`Generation was not checkpointed: ${leftovers.join(', ')}`);

rmSync(fixtureRoot, { recursive: true, force: true });
mkdirSync(fixtureRoot, { recursive: true, mode: 0o700 });
copyFileSync(path.join(stateRoot, 'CURRENT'), path.join(fixtureRoot, 'CURRENT'));
copyFileSync(path.join(stateRoot, currentGeneration), path.join(fixtureRoot, currentGeneration));
writeFileSync(
  path.join(fixtureRoot, 'manifest.json'),
  `${JSON.stringify(
    {
      fixtureFormat: 2,
      storeFormatVersion: 2,
      producedBy: 'BuildFrame 0.1.0',
      workspaceIdentity: identity.workspaceIdentity,
      currentGeneration,
      generationSha256: sha256(readFileSync(path.join(fixtureRoot, currentGeneration))),
      stateVersion: finalHome.stateVersion,
      reviewIdentity: review.reviewIdentity,
      sessions: {
        pi: { attachmentIdentity: pi.attachment.attachmentIdentity, hostVersion: piVersion },
        claude: { attachmentIdentity: claude.attachment.attachmentIdentity, hostVersion: '2.1.310' },
      },
      messages: [
        {
          reviewMessageIdentity: answered.reviewMessageIdentity,
          invocationIdentity: answered.invocationIdentity,
          attachmentIdentity: pi.attachment.attachmentIdentity,
          status: 'ended-normally',
          response: answeredResponse,
          changeObservation: 'forked',
        },
        {
          reviewMessageIdentity: unknown.reviewMessageIdentity,
          invocationIdentity: unknown.invocationIdentity,
          attachmentIdentity: pi.attachment.attachmentIdentity,
          status: 'unresolved',
        },
        {
          reviewMessageIdentity: claudeMessage.reviewMessageIdentity,
          invocationIdentity: claudeMessage.invocationIdentity,
          attachmentIdentity: claude.attachment.attachmentIdentity,
          status: 'ended-normally',
          response: claudeResponse,
        },
      ],
    },
    null,
    2,
  )}\n`,
);
rmSync(scratch, { recursive: true, force: true });
console.log(`Wrote ${path.relative(repoRoot, fixtureRoot)} at State version ${finalHome.stateVersion}`);
