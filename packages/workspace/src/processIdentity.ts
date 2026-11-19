import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { promisify } from 'node:util';

import { windowsProcessStart } from './windowsProcesses.js';

/**
 * Whether a recorded lock holder is still the same running process: its id
 * plus when it started, so a later process that reuses the id is not taken
 * for the holder. Linux reads `/proc`, macOS asks `ps`, Windows asks kernel32
 * through `node:ffi` (`windowsProcesses.ts`). Where none of that is
 * available the identity is `undefined`, and callers then treat a running
 * process with that id as the holder: never as gone.
 */

const execFileAsync = promisify(execFile);
const PROCESS_IDENTITY_TIMEOUT_MS = 30_000;

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

export function holderIsGone(holder: number): boolean {
  try {
    process.kill(holder, 0);
    return false;
  } catch (error) {
    // A holder owned by another user answers `EPERM`, which still proves it is
    // running. Only `ESRCH` proves the recorded process is gone.
    return isErrno(error, 'ESRCH');
  }
}

interface RunningProcess {
  readonly status: 'running';
  readonly identity: string | undefined;
}

interface GoneProcess {
  readonly status: 'gone';
}

type ProcessInspection = RunningProcess | GoneProcess;

/** Identifies a process instance, not merely its reusable process identifier. */
export async function inspectProcess(pid: number): Promise<ProcessInspection> {
  if (holderIsGone(pid)) return { status: 'gone' };

  if (process.platform === 'linux') {
    try {
      const [bootIdentity, processStat] = await Promise.all([
        readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
        readFile(`/proc/${pid}/stat`, 'utf8'),
      ]);
      const commandEnd = processStat.lastIndexOf(')');
      const fields =
        commandEnd >= 0
          ? processStat
              .slice(commandEnd + 1)
              .trim()
              .split(/\s+/u)
          : [];
      // The slice starts at proc(5) field 3; process start time is field 22.
      const startTime = fields[19];
      if (startTime && /^[0-9]+$/u.test(startTime)) {
        return {
          status: 'running',
          identity: `linux:${bootIdentity.trim()}:${startTime}`,
        };
      }
    } catch {
      if (holderIsGone(pid)) return { status: 'gone' };
    }
    return { status: 'running', identity: undefined };
  }

  if (process.platform === 'darwin') {
    try {
      const result = await execFileAsync('/bin/ps', ['-p', String(pid), '-o', 'lstart='], {
        encoding: 'utf8',
        env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
        maxBuffer: 16 * 1024,
        timeout: PROCESS_IDENTITY_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        windowsHide: true,
      });
      const startedAt = result.stdout.trim();
      if (startedAt.length > 0) {
        return {
          status: 'running',
          identity: `darwin:${startedAt}`,
        };
      }
    } catch {
      if (holderIsGone(pid)) return { status: 'gone' };
    }
  }

  if (process.platform === 'win32') {
    const started = windowsProcessStart(pid);
    if (started.status === 'gone') return { status: 'gone' };
    if (started.status === 'running') return { status: 'running', identity: `win32:${started.createdAt}` };
  }

  return { status: 'running', identity: undefined };
}
