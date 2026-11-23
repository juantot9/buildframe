// Temporary perf probe: Workspace read latencies on a synthetic repository.
// usage: node reads.mjs <repo> <inproc|ipc> <reps>
// Needs XDG_STATE_HOME / XDG_RUNTIME_DIR pointing at disposable dirs.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import './env.mjs';

const [repo, mode = 'inproc', repsArg = '7'] = process.argv.slice(2);
const reps = Number(repsArg);
const t = () => performance.now();
const median = a => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const fmt = a =>
  `median ${median(a).toFixed(1)} ms  min ${Math.min(...a).toFixed(1)}  max ${Math.max(...a).toFixed(1)}  (n=${a.length})`;
const results = {};
const record = (name, ms) => (results[name] ??= []).push(ms);

let workspace;
let close;
const openStart = t();
if (mode === 'inproc') {
  const { openWorkspaceRuntimeOwner } = await import('../../packages/workspace/dist/runtime.js');
  const opened = await openWorkspaceRuntimeOwner({ startPath: repo });
  if (opened.status !== 'ready') throw new Error(JSON.stringify(opened));
  workspace = opened.owner.workspace;
  close = () => opened.owner.dispose();
} else {
  const { openDeveloperWorkspaceRuntime } = await import('../../apps/buildframe/dist/launcher.js');
  const lifetime = new AbortController();
  const connected = await openDeveloperWorkspaceRuntime({
    startPath: repo,
    role: 'cli',
    signal: lifetime.signal,
    idleGraceMilliseconds: 300,
    startupTimeoutMilliseconds: 30_000,
  });
  if (connected.status !== 'connected') throw new Error(JSON.stringify(connected));
  workspace = connected.workspace;
  close = async () => lifetime.abort();
}
record('open workspace (owner or runtime spawn+connect)', t() - openStart);

const timed = async (name, fn) => {
  const s = t();
  const g = globalThis.__perfSpawns.count;
  const r = await fn();
  record(name, t() - s);
  record(`${name} [git spawns]`, globalThis.__perfSpawns.count - g);
  return r;
};

let home = await timed('workspace.home', () => workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 }));
let reviewIdentity = home.header.currentReviewIdentity;
if (reviewIdentity === undefined) {
  const started = await timed('execute review.current-changes.start', () =>
    workspace.execute({
      kind: 'review.current-changes.start',
      commandIdentity: `perf-${Date.now()}`,
      expectedStateVersion: home.stateVersion,
    }),
  );
  if (started.kind !== 'review.current-changes.started') throw new Error(JSON.stringify(started).slice(0, 400));
  reviewIdentity = started.reviewIdentity;
}

const subscribe = process.env.PERF_SUBSCRIBE === '1';
if (subscribe) {
  workspace.subscribe({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 }, () => {});
  workspace.subscribe({ kind: 'review.manifest', reviewIdentity, offset: 0, limit: 64 }, () => {});
  await new Promise(r => setTimeout(r, 1500));
}
const manifest = await workspace.read({ kind: 'review.manifest', reviewIdentity, offset: 0, limit: 64 });
const live0 = await workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 });
const biggest = [...manifest.manifest.files].sort(
  (a, b) => (b.newSide?.byteLength ?? 0) - (a.newSide?.byteLength ?? 0),
)[0];
const fileIdentity = manifest.manifest.files[0].fileIdentity;
const bigIdentity = biggest.fileIdentity;
console.error('files', manifest.manifest.totalFiles, 'live', live0.status);

for (let i = 0; i < reps; i += 1) {
  await timed('workspace.home', () => workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 }));
  await timed('review.manifest (64)', () =>
    workspace.read({ kind: 'review.manifest', reviewIdentity, offset: 0, limit: 64 }),
  );
  const live = await timed('review.live-manifest (64)', () =>
    workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 }),
  );
  const lci = live.liveChangesIdentity;
  await timed('review.diff first file (64 rows)', () =>
    workspace.read({ kind: 'review.diff', reviewIdentity, fileIdentity, offset: 0, limit: 64 }),
  );
  const d = await timed('review.diff largest file (64 rows)', () =>
    workspace.read({ kind: 'review.diff', reviewIdentity, fileIdentity: bigIdentity, offset: 0, limit: 64 }),
  );
  if (i === 0) console.error('largest file rows', d.window?.totalRows, d.status);
  if (d.window?.totalRows > 1000) {
    await timed('review.diff largest file, middle window', () =>
      workspace.read({
        kind: 'review.diff',
        reviewIdentity,
        fileIdentity: bigIdentity,
        offset: Math.floor(d.window.totalRows / 2),
        limit: 64,
      }),
    );
  }
  await timed('review.live-diff largest file (64 rows)', () =>
    workspace.read({
      kind: 'review.live-diff',
      reviewIdentity,
      liveChangesIdentity: lci,
      fileIdentity: bigIdentity,
      offset: 0,
      limit: 64,
    }),
  );
  await timed('review.live-files (64)', () =>
    workspace.read({ kind: 'review.live-files', reviewIdentity, liveChangesIdentity: lci, offset: 0, limit: 64 }),
  );
  const lf = await workspace.read({
    kind: 'review.live-files',
    reviewIdentity,
    liveChangesIdentity: lci,
    offset: 0,
    limit: 1,
  });
  if (lf.files.total > 128) {
    await timed('review.live-files (64, last window)', () =>
      workspace.read({
        kind: 'review.live-files',
        reviewIdentity,
        liveChangesIdentity: lci,
        offset: lf.files.total - 64,
        limit: 64,
      }),
    );
  }
  // Different query each time, so the 4-entry search cache can't answer.
  const q = ['edited', 'file1', 'value', 'state'][i % 4] + (i >= 4 ? String(i) : '');
  await timed('review.search (no live id)', () =>
    workspace.read({ kind: 'review.search', reviewIdentity, query: q, offset: 0, limit: 64 }),
  );
  await timed('review.search (no live id) same query', () =>
    workspace.read({ kind: 'review.search', reviewIdentity, query: q, offset: 0, limit: 64 }),
  );
  await timed('review.search (with live id)', () =>
    workspace.read({
      kind: 'review.search',
      reviewIdentity,
      query: `${q}x`,
      liveChangesIdentity: lci,
      offset: 0,
      limit: 64,
    }),
  );
  await timed('review.search (with live id) path query', () =>
    workspace.read({
      kind: 'review.search',
      reviewIdentity,
      query: `file${4000 + i}`,
      liveChangesIdentity: lci,
      offset: 0,
      limit: 64,
    }),
  );
}

// Live-changes recapture after an edit: edit one changed file, then read live-manifest until the identity moves.
const target = path.join(
  repo,
  Buffer.from(
    manifest.manifest.files.find(f => f.status === 'modified')?.newSide?.pathBytesBase64 ??
      biggest.newSide.pathBytesBase64,
    'base64',
  ).toString(),
);
const original = readFileSync(target);
let before = (await workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 }))
  .liveChangesIdentity;
for (let i = 0; i < reps; i += 1) {
  appendFileSync(target, `// perf edit ${i}\n`);
  const s = t();
  let reads = 0;
  for (;;) {
    reads += 1;
    const v = await workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 });
    if (v.status === 'available' && v.liveChangesIdentity !== before) {
      before = v.liveChangesIdentity;
      break;
    }
    if (t() - s > 30_000) throw new Error('recapture never observed');
    await new Promise(r => setTimeout(r, 5));
  }
  record('edit -> new live-manifest identity', t() - s);
  record('  reads until new identity', reads);
  // steady read with nothing changed (verification only)
  await new Promise(r => setTimeout(r, 100));
  await timed('review.live-manifest after settle (verify only)', () =>
    workspace.read({ kind: 'review.live-manifest', reviewIdentity, offset: 0, limit: 64 }),
  );
}
writeFileSync(target, original);

if (subscribe && mode === 'inproc') {
  await new Promise(r => setTimeout(r, 3000));
  const c0 = process.cpuUsage();
  const s0 = globalThis.__perfSpawns.count;
  const sw0 = globalThis.__perfSpawns.wallMs;
  const w0 = t();
  await new Promise(r => setTimeout(r, 20_000));
  const c = process.cpuUsage(c0);
  record('idle 20 s with live subscription: CPU ms (user+sys, this process)', (c.user + c.system) / 1000);
  record('idle wall ms', t() - w0);
  record('idle 20 s: git processes spawned', globalThis.__perfSpawns.count - s0);
  record('idle 20 s: git process wall ms (sum)', globalThis.__perfSpawns.wallMs - sw0);
}

console.log(`# reads ${path.basename(repo)} mode=${mode} reps=${reps} subscribe=${subscribe}`);
for (const [name, values] of Object.entries(results)) console.log(`${name.padEnd(48)} ${fmt(values)}`);
globalThis.gc?.();
await new Promise(r => setTimeout(r, 200));
globalThis.gc?.();
const m2 = process.memoryUsage();
console.log(
  `after gc: rss ${(m2.rss / 1048576).toFixed(0)} MB heapUsed ${(m2.heapUsed / 1048576).toFixed(0)} MB external ${(m2.external / 1048576).toFixed(0)} MB arrayBuffers ${(m2.arrayBuffers / 1048576).toFixed(0)} MB`,
);
await close();
console.log('JSON', JSON.stringify(results));
process.exit(0);
