// Points BuildFrame state, runtime and configuration at disposable dirs under PERF_ROOT.
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';

const root = process.env.PERF_ROOT;
if (!root) throw new Error('PERF_ROOT required');
for (const [name, dir] of [
  ['XDG_STATE_HOME', 'state'],
  ['XDG_RUNTIME_DIR', 'run'],
  ['XDG_CONFIG_HOME', 'config'],
]) {
  const full = path.join(root, 'xdg', dir);
  mkdirSync(full, { recursive: true });
  chmodSync(full, 0o700);
  process.env[name] = full;
}

// Count child processes the process spawns, with their wall time.
import { createRequire, syncBuiltinESMExports } from 'node:module';
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const originalSpawn = childProcess.spawn;
globalThis.__perfSpawns = { count: 0, wallMs: 0, byCommand: new Map() };
childProcess.spawn = function patchedSpawn(command, args, ...rest) {
  const child = originalSpawn.call(this, command, args, ...rest);
  const started = performance.now();
  const stats = globalThis.__perfSpawns;
  stats.count += 1;
  const verb = Array.isArray(args)
    ? args
        .filter(a => !a.startsWith('-') && !a.includes('=') && !a.includes('/'))
        .slice(0, 1)
        .join(' ')
    : '';
  child.once('exit', () => {
    const ms = performance.now() - started;
    stats.wallMs += ms;
    const entry = stats.byCommand.get(verb) ?? { count: 0, ms: 0 };
    entry.count += 1;
    entry.ms += ms;
    stats.byCommand.set(verb, entry);
  });
  return child;
};
syncBuiltinESMExports();
