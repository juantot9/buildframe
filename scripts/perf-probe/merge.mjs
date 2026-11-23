// Merges the JSON result lines of several probe logs and prints median, p90, min, max.
// usage: node merge.mjs <log...>
import { readFileSync } from 'node:fs';

const merged = {};
for (const file of process.argv.slice(2)) {
  const line = readFileSync(file, 'utf8')
    .split('\n')
    .find(l => l.startsWith('JSON '));
  if (!line) continue;
  for (const [k, v] of Object.entries(JSON.parse(line.slice(5)))) (merged[k] ??= []).push(...v.filter(x => x !== null));
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
for (const [k, a] of Object.entries(merged)) {
  if (a.length === 0 || k.includes('[git spawns]')) continue;
  console.log(
    `${k.padEnd(60)} median ${q(a, 0.5).toFixed(1).padStart(7)}  p90 ${q(a, 0.9).toFixed(1).padStart(7)}  min ${Math.min(
      ...a,
    )
      .toFixed(1)
      .padStart(7)}  max ${Math.max(...a)
      .toFixed(1)
      .padStart(7)}  n=${a.length}`,
  );
}
