// Creates many Message drafts on a fresh Review, timing each command, plus messages reads.
// usage: PERF_ROOT=... node messages.mjs <repo> [count=200]
import './env.mjs';

const [repo, countArg = '200'] = process.argv.slice(2);
const count = Number(countArg);
const t = () => performance.now();
const { openWorkspaceRuntimeOwner } = await import('../../packages/workspace/dist/runtime.js');
const opened = await openWorkspaceRuntimeOwner({ startPath: repo });
if (opened.status !== 'ready') throw new Error(JSON.stringify(opened));
const workspace = opened.owner.workspace;
let home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
let reviewIdentity = home.header.currentReviewIdentity;
if (reviewIdentity === undefined) {
  const started = await workspace.execute({
    kind: 'review.current-changes.start',
    commandIdentity: `perf-start-${Date.now()}`,
    expectedStateVersion: home.stateVersion,
  });
  reviewIdentity = started.reviewIdentity;
}
const manifest = await workspace.read({ kind: 'review.manifest', reviewIdentity, offset: 0, limit: 64 });
const files = manifest.manifest.files.filter(f => f.newSide !== undefined);
const times = [];
for (let i = 0; i < count; i += 1) {
  const file = files[i % files.length];
  home = await workspace.read({ kind: 'workspace.home', offset: 0, limit: 64 });
  const s = t();
  const result = await workspace.execute({
    kind: 'review.question-draft.create',
    commandIdentity: `perf-draft-${i}-${Date.now()}`,
    expectedStateVersion: home.stateVersion,
    reviewIdentity,
    anchor: { kind: 'review.diff-line', fileIdentity: file.fileIdentity, side: 'new', line: 1 + (i % 50) },
    body: `Perf probe Message ${i}: why does this line change? `.repeat(3),
  });
  times.push(t() - s);
  if (!String(result.kind).endsWith('created')) throw new Error(JSON.stringify(result).slice(0, 300));
}
const q = p => [...times].sort((a, b) => a - b)[Math.floor(times.length * p)];
console.log(
  `draft create: first ${times[0].toFixed(0)} ms, median ${q(0.5).toFixed(0)} ms, p90 ${q(0.9).toFixed(0)} ms, last ${times.at(-1).toFixed(0)} ms (n=${count})`,
);
for (const kind of ['review.messages', 'review.questions']) {
  const values = [];
  for (let i = 0; i < 5; i += 1) {
    const s = t();
    await workspace.read({ kind, reviewIdentity, offset: 0, limit: kind === 'review.messages' ? 64 : 8 });
    values.push(t() - s);
  }
  values.sort((a, b) => a - b);
  console.log(
    `${kind} read with ${count} drafts: median ${values[2].toFixed(0)} ms min ${values[0].toFixed(0)} max ${values[4].toFixed(0)}`,
  );
}
await opened.owner.dispose();
process.exit(0);
