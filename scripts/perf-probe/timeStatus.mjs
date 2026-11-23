// Times the status command BuildFrame runs, with variants, on a disposable repo clone.
// usage: node timeStatus.mjs <repo> [reps=5]
import { execFileSync, spawnSync } from 'node:child_process';

const [repo, repsArg = '5'] = process.argv.slice(2);
const reps = Number(repsArg);
const env = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
};
const base = [
  '-C',
  repo,
  '-c',
  'core.quotePath=false',
  '-c',
  'core.fileMode=true',
  'status',
  '--porcelain=v2',
  '-z',
  '--untracked-files=all',
];
const time = (label, args, extraEnv = {}) => {
  const values = [];
  for (let i = 0; i < reps; i += 1) {
    const s = performance.now();
    const r = spawnSync('git', args, { env: { ...env, ...extraEnv }, maxBuffer: 1 << 28 });
    if (r.status !== 0) throw new Error(r.stderr.toString());
    values.push(performance.now() - s);
  }
  values.sort((a, b) => a - b);
  console.log(
    `${label.padEnd(60)} median ${values[Math.floor(reps / 2)].toFixed(0)} ms  min ${values[0].toFixed(0)}  max ${values.at(-1).toFixed(0)}`,
  );
};
time('rev-parse HEAD (process spawn floor)', ['-C', repo, 'rev-parse', 'HEAD']);
time('status as BuildFrame runs it (--find-renames=50%)', [...base, '--find-renames=50%', '--']);
time('status --no-renames', [...base, '--no-renames', '--']);
time('status --untracked-files=no', [
  '-C',
  repo,
  'status',
  '--porcelain=v2',
  '-z',
  '--untracked-files=no',
  '--no-renames',
  '--',
]);
time('ls-files (whole index)', ['-C', repo, 'ls-files', '-z', '--stage']);
// Refresh the index once (allowed here: disposable clone) and time again.
execFileSync('git', ['-C', repo, 'update-index', '-q', '--refresh'], { env: { ...env, GIT_OPTIONAL_LOCKS: '1' } });
time('status after one index refresh', [...base, '--find-renames=50%', '--']);
