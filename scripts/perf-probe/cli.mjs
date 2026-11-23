// Times the built CLI (--version, doctor) with disposable XDG dirs.
// usage: PERF_ROOT=... node cli.mjs <repo> [reps=7]
import './env.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [repo, repsArg = '7'] = process.argv.slice(2);
const reps = Number(repsArg);
const exe = fileURLToPath(new URL('../../apps/buildframe/dist/developerExecutable.js', import.meta.url));
const time = (label, args) => {
  const values = [];
  let out = '';
  for (let i = 0; i < reps; i += 1) {
    const s = performance.now();
    const r = spawnSync(process.execPath, args, { cwd: repo, env: process.env, encoding: 'utf8' });
    values.push(performance.now() - s);
    out = `${r.status} ${(r.stdout + r.stderr).split('\n')[0].slice(0, 80)}`;
  }
  values.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(52)} median ${values[Math.floor(reps / 2)].toFixed(0)} ms  min ${values[0].toFixed(0)}  max ${values.at(-1).toFixed(0)}  [${out}]`,
  );
};
time('node -e 0 (floor)', ['-e', '0']);
time('--version with --experimental-ffi', ['--experimental-ffi', exe, '--version']);
time('--version without flag (re-exec)', [exe, '--version']);
time('doctor with --experimental-ffi', ['--experimental-ffi', exe, 'doctor']);
time('import reviewingView.js only', [
  '--experimental-ffi',
  '-e',
  `await import(${JSON.stringify(new URL('../../apps/buildframe/dist/reviewingView.js', import.meta.url).href)})`,
  '--input-type=module',
]);
time('import @opentui/core only', [
  '--experimental-ffi',
  '--input-type=module',
  '-e',
  `await import(${JSON.stringify(new URL('../../node_modules/@opentui/core/index.node.js', import.meta.url).href)})`,
]);
time('import workspace index only', [
  '--input-type=module',
  '-e',
  `await import(${JSON.stringify(new URL('../../packages/workspace/dist/index.js', import.meta.url).href)})`,
]);
