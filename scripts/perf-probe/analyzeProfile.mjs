// Summarizes a .cpuprofile: top self time and top inclusive time by function (file:line).
// usage: node analyzeProfile.mjs <file.cpuprofile> [top=25] [filter-substring]
import { readFileSync } from 'node:fs';

const [file, topArg = '25', filter] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(profile.nodes.map(n => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const selfUs = new Map();
const deltas = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i += 1) {
  const id = profile.samples[i];
  selfUs.set(id, (selfUs.get(id) ?? 0) + (deltas[i] ?? 0));
}
const total = [...selfUs.values()].reduce((a, b) => a + b, 0);
const short = url =>
  url
    .replace(/^file:\/\//, '')
    .replace(/.*\/(node_modules\/\.pnpm\/[^/]+\/node_modules\/)/, '')
    .replace(/.*agent-a1134c05eaa4f2e2e\//, '');
const key = n => {
  const cf = n.callFrame;
  return `${cf.functionName || '(anon)'} ${short(cf.url)}:${cf.lineNumber + 1}`;
};
const self = new Map();
const incl = new Map();
for (const [id, us] of selfUs) {
  const n = nodes.get(id);
  self.set(key(n), (self.get(key(n)) ?? 0) + us);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = key(nodes.get(cur));
    if (seen.has(k)) continue;
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + us);
  }
}
const top = Number(topArg);
const show = (title, map) => {
  console.log(`## ${title} (total sampled ${(total / 1000).toFixed(0)} ms)`);
  [...map]
    .filter(([k]) => !filter || k.includes(filter))
    .filter(([k]) => !/^\((root|program|idle|garbage collector)\)/.test(k) || title.startsWith('self'))
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .forEach(([k, us]) =>
      console.log(`${(us / 1000).toFixed(1).padStart(9)} ms ${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`),
    );
};
show('self', self);
show('inclusive', incl);
