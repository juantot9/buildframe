import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import path from 'node:path';

export type HostCommand = 'pi' | 'claude' | 'opencode' | 'codex';

const HOST_VERSION_TIMEOUT_MS = 5_000;

export interface HostVersionInvocation {
  readonly file: string;
  readonly args: readonly string[];
  /** cmd.exe parses its own command line; Node must pass it as written. */
  readonly verbatim: boolean;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/**
 * How to ask `command --version` on Windows without a shell of our own choosing.
 * Node starts only `.exe` files by name, but npm, pnpm and Pi's installer put
 * hosts on `PATH` as `.cmd` shims (OpenCode's `.exe` sits behind one too). An
 * `.exe` runs directly; a `.cmd` or `.bat` runs through `cmd.exe` with its path
 * quoted and the one fixed argument, which is how Windows itself runs it.
 */
export async function windowsHostVersionInvocation(
  command: HostCommand,
  searchPath: string,
  commandShell: string,
): Promise<HostVersionInvocation | undefined> {
  for (const directory of searchPath.split(path.win32.delimiter)) {
    if (directory.length === 0 || !path.win32.isAbsolute(directory)) continue;
    for (const extension of ['.exe', '.cmd', '.bat']) {
      const file = path.win32.join(directory, `${command}${extension}`);
      if (!(await isFile(file))) continue;
      return extension === '.exe'
        ? { file, args: ['--version'], verbatim: false }
        : { file: commandShell, args: ['/d', '/s', '/c', `""${file}" --version"`], verbatim: true };
    }
  }
  return undefined;
}

/** Asks an installed host for its version; nothing else is run. */
export async function hostVersionFromPath(command: HostCommand): Promise<string | undefined> {
  const invocation =
    process.platform === 'win32'
      ? await windowsHostVersionInvocation(command, process.env.PATH ?? '', process.env.ComSpec ?? 'cmd.exe')
      : { file: command, args: ['--version'], verbatim: false };
  if (invocation === undefined) return undefined;
  return await new Promise(resolve => {
    execFile(
      invocation.file,
      invocation.args,
      { timeout: HOST_VERSION_TIMEOUT_MS, windowsHide: true, windowsVerbatimArguments: invocation.verbatim },
      (error, stdout) => {
        if (error !== null) {
          resolve(undefined);
          return;
        }
        resolve(stdout.trim().split(/\r?\n/u, 1)[0]);
      },
    );
  });
}
