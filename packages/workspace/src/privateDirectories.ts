import { homedir } from 'node:os';
import path from 'node:path';

import {
  currentUserSid,
  readOwnerAndAccess,
  windowsSecurityAvailable,
  writeProtectedAccess,
} from './windowsSecurity.js';

export { WindowsSecurityFailure, WindowsSecurityUnavailable } from './windowsSecurity.js';

/**
 * Where BuildFrame keeps its files for this user, and, on Windows, keeping
 * those directories private to the user.
 *
 * On Windows the directories sit under the user's profile (`%LOCALAPPDATA%`,
 * `%APPDATA%`), which by default only the user, SYSTEM and Administrators can
 * open; new directories inherit that. A process with `node:ffi` also replaces
 * the inherited list with that exact protected list and checks it, the way
 * macOS and Linux `chmod` to 0700 each time. An explicit `XDG_*` location wins
 * on every platform.
 */

const TRUSTED_ACCOUNTS = new Set(['SY', 'BA', 'S-1-5-18', 'S-1-5-32-544']);
const TRUSTED_OWNERS = new Set(['BA', 'S-1-5-32-544']);

/** Full control for this user, SYSTEM and Administrators, inherited by everything inside. */
function privateAccess(userSid: string): string {
  return `D:P(A;OICI;FA;;;${userSid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)`;
}

/**
 * Whether an owner-and-access SDDL (`O:…D:…`) keeps a directory private: owned
 * by the user (or Administrators), not inheriting its parent's list, and
 * allowing no account but the user, SYSTEM and Administrators. Deny entries
 * only take access away, so they are allowed.
 */
export function accessIsPrivate(ownerAndAccess: string, userSid: string): boolean {
  const parsed = /^O:(.+?)D:([A-Z]*)((?:\([^()]*\))*)$/u.exec(ownerAndAccess);
  if (parsed === null) return false;
  const [, owner, flags, entries] = parsed as unknown as [string, string, string, string];
  if (owner !== userSid && !TRUSTED_OWNERS.has(owner)) return false;
  if (!flags.includes('P')) return false;
  for (const entry of entries
    .slice(1, -1)
    .split(')(')
    .filter(text => text.length > 0)) {
    const fields = entry.split(';');
    const [type, account] = [fields[0], fields[5]];
    if (type === 'D') continue;
    if (account === undefined || (account !== userSid && !TRUSTED_ACCOUNTS.has(account))) return false;
  }
  return true;
}

export type WindowsDirectoryPrivacy = 'private' | 'not-private' | 'unverifiable';

/** Reads whether `directory` is private; `unverifiable` without `node:ffi`. */
export function windowsDirectoryPrivacy(directory: string): WindowsDirectoryPrivacy {
  if (!windowsSecurityAvailable()) return 'unverifiable';
  return accessIsPrivate(readOwnerAndAccess(directory), currentUserSid()) ? 'private' : 'not-private';
}

export class DirectoryNotPrivate extends Error {
  constructor(directory: string) {
    super(`Directory is not private to this user: ${directory}`);
    this.name = 'DirectoryNotPrivate';
  }
}

/**
 * Gives `directory` this user's private access list, then checks it. Throws
 * `WindowsSecurityUnavailable` without `node:ffi`, so a caller that must not
 * proceed unprotected fails closed.
 */
export function protectWindowsDirectory(directory: string): void {
  const userSid = currentUserSid();
  writeProtectedAccess(directory, privateAccess(userSid));
  if (!accessIsPrivate(readOwnerAndAccess(directory), userSid)) throw new DirectoryNotPrivate(directory);
}

/**
 * Windows: protects `directory` when this process has `node:ffi`, and
 * otherwise keeps the privacy it inherits from the user's profile (agent hosts
 * that load a connector). Elsewhere: nothing, callers keep their `chmod`.
 */
export function tightenWindowsDirectory(
  directory: string,
  platform: NodeJS.Platform = process.platform,
): 'protected' | 'inherited' | 'not-windows' {
  if (platform !== 'win32') return 'not-windows';
  if (!windowsSecurityAvailable()) return 'inherited';
  protectWindowsDirectory(directory);
  return 'protected';
}

function absoluteSetting(environment: NodeJS.ProcessEnv, name: string, paths: typeof path.posix): string | undefined {
  const value = environment[name];
  return value !== undefined && value.length > 0 && paths.isAbsolute(value) ? value : undefined;
}

function pathsFor(platform: NodeJS.Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

/**
 * Where State and the Workspace registry live: `$XDG_STATE_HOME/buildframe`,
 * else `%LOCALAPPDATA%\BuildFrame` on Windows, `~/Library/Application
 * Support/BuildFrame` on macOS and `~/.local/state/buildframe` elsewhere.
 * `undefined` when no usable location exists.
 */
export function userStateDirectoryFor(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const paths = pathsFor(platform);
  const xdgStateHome = absoluteSetting(environment, 'XDG_STATE_HOME', paths);
  if (xdgStateHome !== undefined) return paths.join(xdgStateHome, 'buildframe');
  if (platform === 'win32') {
    const localAppData = absoluteSetting(environment, 'LOCALAPPDATA', paths);
    return localAppData === undefined ? undefined : paths.join(localAppData, 'BuildFrame');
  }
  if (!home || !paths.isAbsolute(home)) return undefined;
  if (platform === 'darwin') return paths.join(home, 'Library', 'Application Support', 'BuildFrame');
  return paths.join(home, '.local', 'state', 'buildframe');
}

/**
 * Where user configuration lives: `$XDG_CONFIG_HOME/buildframe`, else
 * `%APPDATA%\BuildFrame` on Windows, else `~/.config/buildframe`.
 */
export function userConfigurationDirectoryFor(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  const paths = pathsFor(platform);
  const xdgConfigHome = absoluteSetting(environment, 'XDG_CONFIG_HOME', paths);
  if (xdgConfigHome !== undefined) return paths.join(xdgConfigHome, 'buildframe');
  const appData = platform === 'win32' ? absoluteSetting(environment, 'APPDATA', paths) : undefined;
  if (appData !== undefined) return paths.join(appData, 'BuildFrame');
  return paths.join(home, '.config', 'buildframe');
}

/** Where the runtime keeps its private files on Windows: `%LOCALAPPDATA%\BuildFrame\runtime`. */
export function windowsRuntimeDirectoryFor(environment: NodeJS.ProcessEnv = process.env): string | undefined {
  const localAppData = absoluteSetting(environment, 'LOCALAPPDATA', path.win32);
  return localAppData === undefined ? undefined : path.win32.join(localAppData, 'BuildFrame', 'runtime');
}
