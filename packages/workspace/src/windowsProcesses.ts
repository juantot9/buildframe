/**
 * When a Windows process started, through `node:ffi` (kernel32), so a lock
 * holder is told apart from a later process that reuses its id. Windows reuses
 * process ids quickly.
 *
 * Like `windowsSecurity.ts`, it needs Windows and `--experimental-ffi` (the
 * terminal app and the runtime). In an agent host it answers `unknown`, and
 * callers then treat the process as possibly the holder, never as gone.
 */

type Ffi = typeof import('node:ffi');

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const STILL_ACTIVE = 259;
const ERROR_INVALID_PARAMETER = 87;

function bind(ffi: Ffi) {
  return ffi.dlopen('kernel32.dll', {
    OpenProcess: { arguments: ['u32', 'i32', 'u32'], return: 'pointer' },
    GetProcessTimes: { arguments: ['pointer', 'pointer', 'pointer', 'pointer', 'pointer'], return: 'i32' },
    GetExitCodeProcess: { arguments: ['pointer', 'pointer'], return: 'i32' },
    CloseHandle: { arguments: ['pointer'], return: 'i32' },
    GetLastError: { arguments: [], return: 'u32' },
  }).functions;
}

let kernel32: ReturnType<typeof bind> | null | undefined;

function loaded(): ReturnType<typeof bind> | undefined {
  if (kernel32 === undefined) {
    const ffi = process.platform === 'win32' ? process.getBuiltinModule('node:ffi') : undefined;
    kernel32 = ffi === undefined ? null : bind(ffi);
  }
  return kernel32 ?? undefined;
}

export type WindowsProcessStart =
  | { readonly status: 'running'; readonly createdAt: bigint }
  | { readonly status: 'gone' }
  | { readonly status: 'unknown' };

/**
 * The process's creation time (100 ns intervals since 1601, as Windows keeps
 * it), `gone` when no such process is running, or `unknown` without
 * `node:ffi` or when Windows will not say (another user's process).
 */
export function windowsProcessStart(pid: number): WindowsProcessStart {
  const native = loaded();
  if (native === undefined) return { status: 'unknown' };
  const handle = native.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid >>> 0);
  if (handle === 0n || handle === null) {
    return native.GetLastError() === ERROR_INVALID_PARAMETER ? { status: 'gone' } : { status: 'unknown' };
  }
  try {
    // A process that has exited stays openable while anyone holds a handle.
    const exitCode = new Uint32Array(1);
    if (native.GetExitCodeProcess(handle, exitCode) === 0) return { status: 'unknown' };
    if (exitCode[0] !== STILL_ACTIVE) return { status: 'gone' };
    const created = new BigUint64Array(1);
    const ignored = new BigUint64Array(3);
    if (
      native.GetProcessTimes(handle, created, ignored.subarray(0, 1), ignored.subarray(1, 2), ignored.subarray(2)) === 0
    ) {
      return { status: 'unknown' };
    }
    return { status: 'running', createdAt: created[0] as bigint };
  } finally {
    native.CloseHandle(handle);
  }
}
