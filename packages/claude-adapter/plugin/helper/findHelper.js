// Finds the entry point behind the installed `buildframe-claude-helper` command,
// so the plugin runs it with this Node and no shell, on every platform.
//
// npm and pnpm install a package's commands as shims: on macOS and Linux npm
// links the command to the entry file, and pnpm writes a small sh script; on
// Windows both write `.cmd` (and sh and PowerShell) scripts, which Node will not
// start without a shell. Every shim names the entry relative to its own
// directory, so the entry is read out of the shim instead of running it.
import { lstat, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const COMMAND = 'buildframe-claude-helper';
const ENTRY_FILE = `${COMMAND}.js`;
const MAX_SHIM_BYTES = 64 * 1024;
// A quoted path that starts at the shim's own directory and ends at the entry:
// "%dp0%\…", "%~dp0\…" (cmd), "$basedir/…" (sh, PowerShell).
const SHIM_ENTRY = /"(%~dp0|%dp0%|\$basedir)[\\/]?([^"%$]*?buildframe-claude-helper\.js)"/gu;

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function entryBehind(command, paths) {
  let status;
  try {
    status = await lstat(command);
  } catch {
    return undefined;
  }
  if (status.isSymbolicLink()) {
    const target = await realpath(command).catch(() => undefined);
    return target !== undefined && paths.basename(target) === ENTRY_FILE && (await isFile(target)) ? target : undefined;
  }
  if (!status.isFile() || status.size > MAX_SHIM_BYTES) return undefined;
  const shim = await readFile(command, 'utf8').catch(() => undefined);
  if (shim === undefined) return undefined;
  for (const match of shim.matchAll(SHIM_ENTRY)) {
    const entry = paths.resolve(paths.dirname(command), match[2]);
    if (await isFile(entry)) return entry;
  }
  return undefined;
}

/**
 * The absolute path of the installed helper's entry file, from the first
 * directory on `PATH` that has the command, or undefined when none does.
 */
export async function findInstalledHelper(searchPath = process.env.PATH ?? '', platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  const names = platform === 'win32' ? [`${COMMAND}.cmd`, COMMAND] : [COMMAND];
  for (const directory of searchPath.split(paths.delimiter)) {
    if (directory.length === 0 || !paths.isAbsolute(directory)) continue;
    for (const name of names) {
      const entry = await entryBehind(paths.join(directory, name), paths);
      if (entry !== undefined) return entry;
    }
  }
  return undefined;
}
