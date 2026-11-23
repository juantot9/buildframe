// Clones the synthetic repos into <dest>/repos (APFS clone) and drops BuildFrame's identity marker.
// usage: node fresh.mjs <srcReposDir> <dest> [names...]
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const [src, dest, ...names] = process.argv.slice(2);
mkdirSync(path.join(dest, 'repos'), { recursive: true });
for (const name of names.length ? names : ['small', 'large', 'hugefile']) {
  const to = path.join(dest, 'repos', name);
  rmSync(to, { recursive: true, force: true });
  execFileSync('cp', ['-cR', path.join(src, name), to]);
  rmSync(path.join(to, '.git', 'neoflow-workspace-identity.json'), { force: true });
  // A clone gets new inodes/ctimes, so the index looks stale. Refresh it the way a
  // developer's own status would, unless PERF_STALE_INDEX=1 asks for the stale case.
  if (process.env.PERF_STALE_INDEX !== '1') {
    execFileSync('git', ['-C', to, 'update-index', '-q', '--refresh'], {
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    });
  }
}
console.log('fresh', dest);
