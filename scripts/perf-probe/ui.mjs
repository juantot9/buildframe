// Temporary perf probe: drives the real Reviewing app in the OpenTUI test renderer.
// usage: PERF_ROOT=... node --experimental-ffi ui.mjs <repo> <ipc|inproc> [reps=5] [scenario=all]
// Copies nothing; expects a fresh repo (no Current Review yet) for the start timings.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import './env.mjs';

const [repo, mode = 'ipc', repsArg = '5', scenario = 'all'] = process.argv.slice(2);
const reps = Number(repsArg);
const verifyScene = process.env.PERF_VERIFY_SCENE === '1';
const t = () => performance.now();
const results = {};
const record = (name, v) => (results[name] ??= []).push(v);
const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const fmt = a =>
  `median ${median(a).toFixed(1)}  p90 ${pct(a, 0.9).toFixed(1)}  min ${Math.min(...a).toFixed(1)}  max ${Math.max(...a).toFixed(1)}  (n=${a.length})`;

const importStart = t();
const { createTestRenderer } = await import('@opentui/core/testing');
const { createReviewingApplicationForTest } = await import('../../apps/buildframe/dist/reviewingScreen.js');
record('import app + opentui modules (ms)', t() - importStart);
// Time every whole-tree draw (ShellRenderLoop.render is public; same module instance as the app's).
const { ShellRenderLoop } = await import('../../apps/buildframe/dist/shellRenderLoop.js');
let drawPhase = 'other';
const originalRender = ShellRenderLoop.prototype.render;
ShellRenderLoop.prototype.render = function timedRender() {
  const s = t();
  try {
    return originalRender.call(this);
  } finally {
    record(`draw (whole-tree replace) during ${drawPhase} (ms)`, t() - s);
  }
};

const terminal = await createTestRenderer({
  width: 160,
  height: 48,
  exitOnCtrlC: false,
  kittyKeyboard: true,
  gatherStats: true,
  useMouse: true,
  enableMouseMovement: true,
  nativeSceneVerify: verifyScene,
});
const renderer = terminal.renderer;
let lastFrame = '';
const capture = () => {
  try {
    lastFrame = terminal.captureCharFrame();
  } catch {}
  return lastFrame;
};
const frames = [];
const leakMode = process.env.PERF_LEAK_ROUNDS !== undefined;
renderer.on('frame', () => {
  // In leak mode keep no per-frame text, so the probe itself does not grow the heap.
  if (leakMode && frames.length > 50) frames.splice(0, frames.length - 10);
  frames.push({ at: t(), text: capture() });
});

let workspace;
let stopRuntime = async () => {};
const t0 = t();
if (mode === 'inproc') {
  const { openWorkspaceRuntimeOwner } = await import('../../packages/workspace/dist/runtime.js');
  const opened = await openWorkspaceRuntimeOwner({ startPath: repo });
  if (opened.status !== 'ready') throw new Error(JSON.stringify(opened));
  workspace = opened.owner.workspace;
  stopRuntime = () => opened.owner.dispose();
} else {
  const { openDeveloperWorkspaceRuntime } = await import('../../apps/buildframe/dist/launcher.js');
  const lifetime = new AbortController();
  const connected = await openDeveloperWorkspaceRuntime({
    startPath: repo,
    role: 'tui',
    signal: lifetime.signal,
    idleGraceMilliseconds: 300,
    startupTimeoutMilliseconds: 30_000,
  });
  if (connected.status !== 'connected') throw new Error(JSON.stringify(connected));
  workspace = connected.workspace;
  stopRuntime = async () => lifetime.abort();
}
record('connect workspace (runtime spawn or owner open)', t() - t0);
const trace = [];
if (process.env.PERF_TRACE === '1') {
  const inner = workspace;
  const wrap = verb => async request => {
    const s = t();
    try {
      return await inner[verb](request);
    } finally {
      trace.push({ verb, kind: request.kind, start: s, ms: t() - s });
    }
  };
  workspace = { execute: wrap('execute'), read: wrap('read'), subscribe: (...a) => inner.subscribe(...a) };
  for (const k of Object.keys(inner)) if (!(k in workspace)) workspace[k] = inner[k];
}
const application = createReviewingApplicationForTest({ workspace, renderer: terminal.renderer });

const waitFor = async (predicate, what, timeout = 60_000) => {
  const s = t();
  while (!predicate()) {
    if (t() - s > timeout) {
      writeFileSync(path.join(process.env.PERF_ROOT, 'last-frame.txt'), capture());
      // Every distinct frame so far, to see where a run stopped moving.
      const distinct = frames.filter((frame, index) => index === 0 || frame.text !== frames[index - 1].text);
      writeFileSync(
        path.join(process.env.PERF_ROOT, 'frames-before-timeout.txt'),
        distinct.map(frame => `=== +${frame.at.toFixed(0)} ms\n${frame.text}`).join('\n'),
      );
      throw new Error(`timeout: ${what}`);
    }
    await new Promise(r => setTimeout(r, 1));
  }
};
const firstFrameWith = (since, text) => frames.find(f => f.at >= since && f.text.includes(text));
const waitText = async (since, text, timeout) => {
  await waitFor(() => firstFrameWith(since, text) !== undefined || capture().includes(text), text, timeout);
  return (firstFrameWith(since, text)?.at ?? t()) - since;
};
/** Waits until no frame arrives for `quiet` ms; returns the last frame after `since` whose text changed. */
const settle = async (since, quiet = 120, timeout = 30_000) => {
  const s = t();
  for (;;) {
    const last = frames.at(-1);
    if (t() - Math.max(last?.at ?? 0, since) > quiet) break;
    if (t() - s > timeout) break;
    await new Promise(r => setTimeout(r, 2));
  }
  const before = frames.filter(f => f.at < since).at(-1)?.text;
  let lastChange;
  let firstFrame;
  let prev = before;
  let count = 0;
  for (const f of frames) {
    if (f.at < since) continue;
    count += 1;
    firstFrame ??= f.at;
    if (f.text !== prev) lastChange = f.at;
    prev = f.text;
  }
  return {
    first: firstFrame === undefined ? undefined : firstFrame - since,
    lastChange: lastChange === undefined ? undefined : lastChange - since,
    count,
  };
};
const press = async (label, key, opts) => {
  const s = t();
  if (key === 'enter') terminal.mockInput.pressEnter();
  else if (key === 'tab') terminal.mockInput.pressTab();
  else if (key === 'escape') terminal.mockInput.pressEscape();
  else terminal.mockInput.pressKey(key, opts);
  const sync = t() - s;
  const r = await settle(s);
  record(`${label}: sync handler+render (ms)`, sync);
  if (r.first !== undefined) record(`${label}: key -> first frame (ms)`, r.first);
  if (r.lastChange !== undefined) record(`${label}: key -> last changed frame (ms)`, r.lastChange);
  return r;
};
const rss = label => {
  globalThis.gc?.();
  const m = process.memoryUsage();
  record(`${label}: rss MB`, m.rss / 1048576);
  record(`${label}: heapUsed MB`, m.heapUsed / 1048576);
  record(`${label}: renderables`, countRenderables(renderer.root));
};
const countRenderables = node => {
  let n = 1;
  for (const c of node.getChildren?.() ?? []) n += countRenderables(c);
  return n;
};

// 1. Cold start: Home, then the first Review frame.
const startAt = t();
await application.start();
record('application.start() resolved (ms)', t() - startAt);
const homeText = process.env.PERF_HOME_TEXT ?? 'Review current changes';
const homeMs = await waitText(startAt, homeText);
record('start -> first Home frame (ms)', homeMs);
const homeAll = await waitText(t0, homeText);
record('connect+start -> first Home frame (ms)', homeAll);
await settle(t());
rss('home');
const enterAt = t();
terminal.mockInput.pressEnter();
record('Enter on Home: sync (ms)', t() - enterAt);
const reviewMs = await waitText(enterAt, 'changed files', 120_000);
record('Enter -> first Review frame with file list (ms)', reviewMs);
const settled = await settle(enterAt, 400, 120_000);
record('Enter -> Review settled (last change) (ms)', settled.lastChange ?? NaN);
if (process.env.PERF_TRACE === '1') {
  for (const [verb, v] of globalThis.__perfSpawns.byCommand)
    console.log(`spawn ${verb.padEnd(16)} n=${v.count} sum=${v.ms.toFixed(0)} ms`);
}
for (const e of trace.filter(e => e.start >= enterAt)) {
  console.log(
    `trace +${(e.start - enterAt).toFixed(0).padStart(6)} ms  ${e.ms.toFixed(1).padStart(8)} ms  ${e.verb} ${e.kind}`,
  );
}
rss('review open');
writeFileSync(path.join(process.env.PERF_ROOT, `frame-review-${path.basename(repo)}.txt`), capture());

const run = name => scenario === 'all' || scenario.split(',').includes(name);

// Cold search: the first query of the session, timed until the result count shows.
if (run('searchcold')) {
  drawPhase = 'search';
  for (const query of ['edited', 'v1234']) {
    terminal.mockInput.pressKey('/');
    await settle(t());
    for (const ch of query) terminal.mockInput.pressKey(ch);
    const s = t();
    await waitFor(() => /\d+ match/.test(capture()), 'search result count', 120_000);
    record(`search "${query}": last key -> result count shown (ms)`, t() - s);
    writeFileSync(path.join(process.env.PERF_ROOT, `frame-search-${path.basename(repo)}.txt`), capture());
    terminal.mockInput.pressEscape();
    await settle(t());
  }
}
const focus = async pane => {
  for (let i = 0; i < 4 && !capture().includes(`▌ ${pane} FOCUSED`); i += 1) await press('Tab', 'tab');
};
// 2. j/k in Diff (Diff has focus after open).
if (run('diff')) {
  drawPhase = 'Diff keys';
  await focus('Diff');
  for (let i = 0; i < reps * 6; i += 1) await press('Diff j', 'j');
  for (let i = 0; i < reps * 6; i += 1) await press('Diff k', 'k');
  // G jumps to the end of a long Diff (window load), g back.
  for (let i = 0; i < reps; i += 1) {
    await press('Diff G (end)', 'G', { shift: true });
    await press('Diff g (start)', 'g');
  }
}
// 3. j/k in Files, opening a file.
if (run('files')) {
  drawPhase = 'Files keys';
  await focus('Files');
  for (let i = 0; i < reps * 4; i += 1) await press('Files j', 'j');
  for (let i = 0; i < reps * 4; i += 1) await press('Files k', 'k');
  for (let i = 0; i < reps; i += 1) {
    await focus('Files');
    await press('Files j (before open)', 'j');
    await press('open file (Enter in Files)', 'enter');
  }
  writeFileSync(path.join(process.env.PERF_ROOT, `frame-files-${path.basename(repo)}.txt`), capture());
}
// j/k in the History (Messages) pane.
if (run('messages')) {
  drawPhase = 'History keys';
  await focus('History');
  for (let i = 0; i < reps * 6; i += 1) await press('History j', 'j');
  for (let i = 0; i < reps * 6; i += 1) await press('History k', 'k');
  writeFileSync(path.join(process.env.PERF_ROOT, `frame-history-${path.basename(repo)}.txt`), capture());
  await focus('Diff');
  drawPhase = 'Diff keys (with Messages)';
  for (let i = 0; i < reps * 6; i += 1) await press('Diff j (with Messages)', 'j');
}
// Leak check: many j/k presses in the Diff, then compare memory.
if (run('leak')) {
  await focus('Diff');
  rss('leak round 0');
  for (let round = 1; round <= Number(process.env.PERF_LEAK_ROUNDS ?? '1'); round += 1) {
    for (let i = 0; i < 300; i += 1) {
      terminal.mockInput.pressKey('j');
      await new Promise(r => setTimeout(r, 4));
      terminal.mockInput.pressKey('k');
      await new Promise(r => setTimeout(r, 4));
    }
    await settle(t(), 300);
    rss(`leak round ${round} (after ${round * 600} j/k)`);
  }
}
// 4. f toggles every file (live changes).
if (run('f')) {
  for (let i = 0; i < reps; i += 1) await press('f (every file toggle)', 'f');
}
// 5. /-search typing.
if (run('search')) {
  for (let i = 0; i < reps; i += 1) {
    await press('/ open search', '/');
    for (const ch of 'file12') await press('search typing (per char)', ch);
    await press('search Escape', 'escape');
  }
}
rss('after keys');

// 6. Wheel scrolling over the Diff: burst of wheel events, frames and cost.
if (run('wheel')) {
  drawPhase = 'wheel';
  const viewport = () => renderer.root.findDescendantById('reviewing-diff-viewport');
  if (viewport() !== undefined) {
    for (let burst = 0; burst < reps; burst += 1) {
      const v = viewport();
      const x = v.screenX + Math.floor(v.width / 2);
      const y = v.screenY + Math.floor(v.height / 2);
      const s = t();
      const before = frames.length;
      let syncTotal = 0;
      // 40 wheel notches ~ 8 ms apart: a fast trackpad flick.
      for (let i = 0; i < 40; i += 1) {
        const ws = t();
        await terminal.mockMouse.scroll(x, y, 'down');
        syncTotal += t() - ws;
        await new Promise(r => setTimeout(r, 8));
      }
      const r = await settle(s, 200);
      const burstFrames = frames.slice(before);
      const gaps = burstFrames.slice(1).map((f, i) => f.at - burstFrames[i].at);
      record('wheel burst (40 notches): frames presented', burstFrames.length);
      record('wheel burst: wall until last change (ms)', r.lastChange ?? NaN);
      record('wheel burst: mean JS time per notch (ms)', syncTotal / 40);
      if (gaps.length > 0) {
        record('wheel burst: max gap between frames (ms)', Math.max(...gaps));
        record('wheel burst: frames with gap > 33 ms', gaps.filter(g => g > 33).length);
      }
    }
    rss('after wheel');
  } else console.error('no diff viewport');
}

// 7. Wheel through every file in Files: the whole list is one scroll, so the
// flick never waits for a window to load and reaches the last file.
if (run('fileswheel')) {
  drawPhase = 'Files wheel';
  await focus('Files');
  if (!capture().includes('Files FOCUSED  All')) await press('f (every file)', 'f');
  const viewport = () => renderer.root.findDescendantById('reviewing-files-viewport');
  if (viewport() !== undefined) {
    const v = viewport();
    const x = v.screenX + Math.floor(v.width / 2);
    const y = v.screenY + Math.floor(v.height / 2);
    const s = t();
    const before = frames.length;
    let notches = 0;
    let unchanged = 0;
    let previous = capture();
    let syncTotal = 0;
    for (; notches < 4000; notches += 1) {
      const ws = t();
      await terminal.mockMouse.scroll(x, y, 'down');
      syncTotal += t() - ws;
      await new Promise(r => setTimeout(r, 8));
      const current = capture();
      if (current === previous) unchanged += 1;
      else unchanged = 0;
      previous = current;
      if (unchanged >= 25) break;
    }
    const r = await settle(s, 200);
    const burstFrames = frames.slice(before);
    const gaps = burstFrames.slice(1).map((f, i) => f.at - burstFrames[i].at);
    record('Files wheel to the end: notches', notches - unchanged + 1);
    record('Files wheel to the end: wall (ms)', r.lastChange ?? NaN);
    record('Files wheel: mean JS time per notch (ms)', syncTotal / notches);
    record('Files wheel: frames presented', burstFrames.length);
    if (gaps.length > 0) {
      record('Files wheel: max gap between frames (ms)', Math.max(...gaps));
      record('Files wheel: frames with gap > 33 ms', gaps.filter(g => g > 33).length);
    }
    writeFileSync(path.join(process.env.PERF_ROOT, `frame-files-wheel-end-${path.basename(repo)}.txt`), capture());
  } else console.error('no files viewport');
}

// 8. Open closed folders in All files: each l reads just that folder.
if (run('openfolder')) {
  drawPhase = 'open folder';
  await focus('Files');
  if (!capture().includes('Files FOCUSED  All')) await press('f (every file)', 'f');
  for (let opened = 0; opened < reps; opened += 1) {
    // Walk down to the next closed folder row (the selected row starts with ›).
    let steps = 0;
    while (!/›\s*▸ /u.test(capture()) && steps < 400) {
      terminal.mockInput.pressKey('j');
      await settle(t(), 30);
      steps += 1;
    }
    if (steps >= 400) break;
    const before = capture();
    const s = t();
    terminal.mockInput.pressKey('l');
    await waitFor(() => capture() !== before && !/›\s*▸ /u.test(capture()), 'folder opened', 10_000);
    record('open closed folder: key -> contents on screen (ms)', t() - s);
    await settle(t(), 60);
  }
  writeFileSync(path.join(process.env.PERF_ROOT, `frame-open-folder-${path.basename(repo)}.txt`), capture());
}

// Renderer-side frame stats (native render + output).
const stats = renderer.getStats?.();
if (stats) {
  record('renderer averageFrameTime (ms)', stats.averageFrameTime);
  record('renderer maxFrameTime (ms)', stats.maxFrameTime);
}
writeFileSync(path.join(process.env.PERF_ROOT, `frame-end-${path.basename(repo)}.txt`), capture());
if (process.env.PERF_HOLD_MS) {
  console.log('HOLDING', process.pid);
  await new Promise(r => setTimeout(r, Number(process.env.PERF_HOLD_MS)));
}
await application.stop();
await stopRuntime();
console.log(`# ui ${path.basename(repo)} mode=${mode} reps=${reps} verifyScene=${verifyScene}`);
for (const [name, values] of Object.entries(results)) console.log(`${name.padEnd(56)} ${fmt(values)}`);
console.log('JSON', JSON.stringify(results));
process.exit(0);
