import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { StringDecoder } from 'node:string_decoder';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const scratch = await mkdtemp('/tmp/buildframe-pi-adapter-live-');
const extensionPath = path.join(scratch, 'live-probe.ts');
const logPath = path.join(scratch, 'events.jsonl');
const piAdapterModule = pathToFileURL(path.join(root, 'packages/pi-adapter/dist/piAdapter.js')).href;
const piEventsModule = pathToFileURL(path.join(root, 'packages/pi-adapter/dist/piNativeEvents.js')).href;
const piHostCompatibilityModule = pathToFileURL(
  path.join(root, 'packages/pi-adapter/dist/piHostCompatibility.js'),
).href;

const extensionSource = `
import { appendFileSync } from 'node:fs';
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import { PiReviewedAdapter, CORRELATION_ENTRY_TYPE } from ${JSON.stringify(piAdapterModule)};
import { bindPiReviewedAdapterEvents } from ${JSON.stringify(piEventsModule)};
import { discoverPiHostVersion } from ${JSON.stringify(piHostCompatibilityModule)};

const logPath = process.env.BUILDFRAME_PI_PROBE_LOG;
function log(event, data = {}) {
  appendFileSync(logPath, JSON.stringify({ event, ...data }) + '\\n');
}

function message(model) {
  return {
    role: 'assistant', content: [], api: model.api, provider: model.provider,
    model: model.id,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop', timestamp: Date.now(),
  };
}

export default function probe(pi) {
  const hostVersion = discoverPiHostVersion(process.argv[1]);
  let adapter;
  let connection;
  let sessionContext;

  pi.registerProvider('buildframe-p14-probe', {
    name: 'BuildFrame P14 deterministic probe',
    baseUrl: 'http://127.0.0.1.invalid', apiKey: 'probe', api: 'buildframe-p14-probe',
    models: [{ id: 'deterministic', name: 'Deterministic', reasoning: false,
      input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 32000, maxTokens: 1024 }],
    streamSimple(model, context) {
      const stream = createAssistantMessageEventStream();
      // Pi 0.x passes tools on the context; Pi 1.x adds and removes them through system messages.
      const offered = new Set((context.tools ?? []).map((tool) => tool.name));
      for (const item of context.messages ?? []) {
        if (item.role !== 'system') continue;
        for (const tool of item.toolsAdded ?? []) offered.add(tool.name);
        for (const tool of item.toolsRemoved ?? []) offered.delete(typeof tool === 'string' ? tool : tool.name);
      }
      const offeredTools = [...offered];
      log('provider_call', { offeredTools });
      queueMicrotask(() => {
        const output = message(model);
        const text = 'P14 deterministic response';
        output.content.push({ type: 'text', text });
        stream.push({ type: 'start', partial: output });
        stream.push({ type: 'text_start', contentIndex: 0, partial: output });
        stream.push({ type: 'text_delta', contentIndex: 0, delta: text, partial: output });
        stream.push({ type: 'text_end', contentIndex: 0, content: text, partial: output });
        stream.push({ type: 'done', reason: 'stop', message: output });
        stream.end();
      });
      return stream;
    },
  });

  bindPiReviewedAdapterEvents(pi, () => adapter);

  pi.on('session_start', async (_event, ctx) => {
    sessionContext = ctx;
    adapter = new PiReviewedAdapter({
      workspaceIdentity: 'wsp_00000000-0000-4000-8000-000000000051',
      canonicalCheckout: ctx.cwd,
      hostVersion,
      sessionIdentity: ctx.sessionManager.getSessionId(),
      sessionEpoch: 'live-probe-epoch',
      // This probe pins the enforced read-only gate; the write default is
      // covered by the Adapter contract tests and the dogfood disclosure.
      authority: 'discussion-only',
      native: {
        isIdle: () => ctx.isIdle(),
        getActiveTools: () => pi.getActiveTools(),
        getAllTools: () => pi.getAllTools().map((tool) => ({ name: tool.name, source: tool.sourceInfo.source })),
        setActiveTools: (names) => pi.setActiveTools([...names]),
        sendUserMessage: (text) => pi.sendUserMessage(text),
        appendCorrelationMarker: (data) => pi.appendEntry(CORRELATION_ENTRY_TYPE, data),
        abort: () => ctx.abort(),
      },
    });
    connection = adapter.connect({
      accept: async (evidence) => {
        log('semantic_evidence', { evidence });
        return { status: 'applied', evidenceIdentity: evidence.evidenceIdentity, stateVersion: 1 };
      },
    });
    log('session_ready', { version: hostVersion, attachmentIdentity: adapter.attachment.attachmentIdentity });
  });

  pi.registerCommand('buildframe-p14-probe', {
    description: 'Run the BuildFrame P14 supported-version live probe',
    handler: async () => {
      const capability = adapter.manifest.capabilities[0];
      const directive = {
        kind: 'harness.direct-review.dispatch', contractVersion: 1,
        attachmentIdentity: adapter.attachment.attachmentIdentity,
        handoffIdentity: 'hho_' + '5'.repeat(64),
        invocationIdentity: 'hin_' + '6'.repeat(64),
        capabilitySnapshot: {
          snapshotIdentity: 'hcs_' + '7'.repeat(64),
          compatibilityIdentity: 'hcp_' + '8'.repeat(64),
          manifestSha256: '9'.repeat(64), capability, availabilityAtCommit: 'available',
        },
        disclosure: {
          contractVersion: 1, handoffKind: 'submit-review-batch', authority: 'discussion-only',
          reviewIdentity: 'rev_' + 'a'.repeat(64), changeSetIdentity: 'live-change-set',
          reviewSnapshotIdentity: 'rsp_' + 'b'.repeat(64), reviewBatchIdentity: 'rbt_' + 'c'.repeat(64),
          manifest: { formatVersion: 1, totalFiles: 0,
            digest: { algorithm: 'sha256', value: 'd'.repeat(64) }, files: [] },
          questions: [], sha256: 'e'.repeat(64), byteLength: 1,
        },
      };
      const observation = await connection.perform(directive);
      log('directive_observation', { observation });
    },
  });

  pi.on('agent_settled', async (_event, ctx) => {
    log('native_settled', { idle: ctx.isIdle(), activeTools: pi.getActiveTools() });
  });

  pi.on('session_shutdown', async () => {
    await adapter?.sessionEnding();
    log('session_shutdown', { activeTools: pi.getActiveTools(), hadContext: sessionContext !== undefined });
  });
}
`;

await writeFile(extensionPath, extensionSource);
await writeFile(logPath, '');

const piBinary = process.env.BUILDFRAME_PI_BINARY ?? path.join(root, 'packages/pi-adapter/node_modules/.bin/pi');
// By default the probe runs the Pi pinned as the Adapter's development host and expects that exact version.
const pinnedPiVersion = JSON.parse(await readFile(path.join(root, 'packages/pi-adapter/package.json'), 'utf8'))
  .devDependencies['@earendil-works/pi-coding-agent'];
const expectedPiVersion = process.env.BUILDFRAME_PI_VERSION ?? pinnedPiVersion;
const child = spawn(
  piBinary,
  [
    '--mode',
    'rpc',
    '--no-session',
    '--no-extensions',
    '--extension',
    extensionPath,
    '--no-skills',
    '--no-context-files',
    '--model',
    'buildframe-p14-probe/deterministic',
    '--tools',
    'read,grep,find,ls,write',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      PI_SKIP_VERSION_CHECK: '1',
      PI_TELEMETRY: '0',
      BUILDFRAME_PI_PROBE_LOG: logPath,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  },
);

const decoder = new StringDecoder('utf8');
let buffer = '';
let stderr = '';
let settled = false;
let stateRequested = false;
const records = [];

function send(record) {
  child.stdin.write(`${JSON.stringify(record)}\n`);
}

function acceptRecord(record) {
  records.push(record);
  if (record.type === 'agent_settled' && !stateRequested) {
    settled = true;
    stateRequested = true;
    send({ id: 'state', type: 'get_state' });
  }
  if (record.type === 'response' && record.id === 'state') {
    child.stdin.end();
  }
}

child.stdout.on('data', chunk => {
  buffer += decoder.write(chunk);
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).replace(/\r$/u, '');
    buffer = buffer.slice(newline + 1);
    if (line.length > 0) acceptRecord(JSON.parse(line));
  }
});
child.stderr.on('data', chunk => {
  stderr += chunk.toString();
});

const kickoff = setTimeout(() => {
  send({ id: 'probe', type: 'prompt', message: '/buildframe-p14-probe' });
}, 250);
const hardTimeout = setTimeout(() => child.kill('SIGTERM'), 15_000);
const exit = await new Promise(resolve => {
  child.once('exit', (code, signal) => resolve({ code, signal }));
});
clearTimeout(kickoff);
clearTimeout(hardTimeout);
buffer += decoder.end();

try {
  assert.equal(exit.code, 0, `Pi live probe exited unsuccessfully: ${stderr}`);
  assert.equal(settled, true, 'Pi live probe did not reach agent_settled');
  const events = (await readFile(logPath, 'utf8'))
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const ready = events.find(event => event.event === 'session_ready');
  assert.equal(ready?.version, expectedPiVersion);
  const observation = events.find(event => event.event === 'directive_observation');
  assert.equal(observation?.observation?.status, 'accepted-for-observation');
  const provider = events.find(event => event.event === 'provider_call');
  assert.deepEqual(provider?.offeredTools, ['read', 'grep', 'find', 'ls']);
  const semantic = events.filter(event => event.event === 'semantic_evidence').map(event => event.evidence);
  assert.ok(semantic.some(event => event.kind === 'harness.invocation.start-observed'));
  assert.ok(
    semantic.some(event => event.kind === 'harness.invocation.terminal-observed' && event.outcome === 'ended-normally'),
  );
  const settledEvent = events.find(event => event.event === 'native_settled');
  assert.deepEqual(settledEvent?.activeTools, ['read', 'grep', 'find', 'ls', 'write']);
  assert.equal(stderr, '');
  console.log(`Pi ${expectedPiVersion} reviewed Adapter live probe passed`);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
