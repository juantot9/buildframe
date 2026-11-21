/**
 * Windows access control through `node:ffi` (advapi32 and kernel32).
 *
 * It is available only on Windows in a process started with
 * `--experimental-ffi` (the terminal app and the runtime it starts). Agent
 * hosts that load a connector are not, and every function here then reports
 * `WindowsSecurityUnavailable`. Security descriptors cross the native boundary
 * as SDDL text, which keeps the native surface to a few calls. Pointers are
 * read as 64-bit: BuildFrame supports x64 and arm64 Windows only.
 */

type Ffi = typeof import('node:ffi');

const OWNER_SECURITY_INFORMATION = 0x1;
const DACL_SECURITY_INFORMATION = 0x4;
const PROTECTED_DACL_SECURITY_INFORMATION = 0x80000000;
const TOKEN_QUERY = 0x8;
const TOKEN_USER_CLASS = 1;
const SDDL_REVISION_1 = 1;

export class WindowsSecurityUnavailable extends Error {
  constructor() {
    super('Windows access control needs node:ffi (--experimental-ffi) on Windows');
    this.name = 'WindowsSecurityUnavailable';
  }
}

export class WindowsSecurityFailure extends Error {
  readonly operation: string;
  readonly win32Error: number;

  constructor(operation: string, win32Error: number) {
    super(`${operation} failed (Windows error ${win32Error})`);
    this.name = 'WindowsSecurityFailure';
    this.operation = operation;
    this.win32Error = win32Error;
  }
}

function bind(ffi: Ffi) {
  const kernel32 = ffi.dlopen('kernel32.dll', {
    GetCurrentProcess: { arguments: [], return: 'pointer' },
    CloseHandle: { arguments: ['pointer'], return: 'i32' },
    LocalFree: { arguments: ['pointer'], return: 'pointer' },
    lstrlenW: { arguments: ['pointer'], return: 'i32' },
    GetLastError: { arguments: [], return: 'u32' },
  }).functions;
  const advapi32 = ffi.dlopen('advapi32.dll', {
    OpenProcessToken: { arguments: ['pointer', 'u32', 'pointer'], return: 'i32' },
    GetTokenInformation: { arguments: ['pointer', 'u32', 'pointer', 'u32', 'pointer'], return: 'i32' },
    ConvertSidToStringSidW: { arguments: ['pointer', 'pointer'], return: 'i32' },
    GetFileSecurityW: { arguments: ['pointer', 'u32', 'pointer', 'u32', 'pointer'], return: 'i32' },
    ConvertSecurityDescriptorToStringSecurityDescriptorW: {
      arguments: ['pointer', 'u32', 'u32', 'pointer', 'pointer'],
      return: 'i32',
    },
    ConvertStringSecurityDescriptorToSecurityDescriptorW: {
      arguments: ['pointer', 'u32', 'pointer', 'pointer'],
      return: 'i32',
    },
    SetFileSecurityW: { arguments: ['pointer', 'u32', 'pointer'], return: 'i32' },
  }).functions;
  return { ffi, kernel32, advapi32 };
}

type Bindings = ReturnType<typeof bind>;

let bindings: Bindings | null | undefined;

function loaded(): Bindings | undefined {
  if (bindings === undefined) {
    const ffi = process.platform === 'win32' ? process.getBuiltinModule('node:ffi') : undefined;
    bindings = ffi === undefined ? null : bind(ffi);
  }
  return bindings ?? undefined;
}

function required(): Bindings {
  const available = loaded();
  if (available === undefined) throw new WindowsSecurityUnavailable();
  return available;
}

export function windowsSecurityAvailable(): boolean {
  return loaded() !== undefined;
}

function wide(text: string): Buffer {
  return Buffer.from(`${text}\0`, 'utf16le');
}

function outPointer(): Buffer {
  return Buffer.alloc(8);
}

function pointerIn(buffer: Buffer): bigint {
  return buffer.readBigUInt64LE(0);
}

function check(native: Bindings, succeeded: number, operation: string): void {
  if (succeeded === 0) throw new WindowsSecurityFailure(operation, native.kernel32.GetLastError());
}

/** Reads a string Windows allocated, then frees it. */
function takeWideString(native: Bindings, pointer: bigint): string {
  try {
    const length = native.kernel32.lstrlenW(pointer);
    return Buffer.from(native.ffi.toArrayBuffer(pointer, length * 2, true)).toString('utf16le');
  } finally {
    native.kernel32.LocalFree(pointer);
  }
}

let userSid: string | undefined;

/** The SID of the user this process runs as, e.g. `S-1-5-21-…-1001`. */
export function currentUserSid(): string {
  if (userSid !== undefined) return userSid;
  const native = required();
  const token = outPointer();
  check(
    native,
    native.advapi32.OpenProcessToken(native.kernel32.GetCurrentProcess(), TOKEN_QUERY, token),
    'OpenProcessToken',
  );
  try {
    const needed = Buffer.alloc(4);
    native.advapi32.GetTokenInformation(pointerIn(token), TOKEN_USER_CLASS, 0n, 0, needed);
    const tokenUser = Buffer.alloc(needed.readUInt32LE(0));
    check(
      native,
      native.advapi32.GetTokenInformation(pointerIn(token), TOKEN_USER_CLASS, tokenUser, tokenUser.length, needed),
      'GetTokenInformation',
    );
    // TOKEN_USER starts with the pointer to the user's SID, inside `tokenUser`.
    const sidText = outPointer();
    check(native, native.advapi32.ConvertSidToStringSidW(pointerIn(tokenUser), sidText), 'ConvertSidToStringSidW');
    userSid = takeWideString(native, pointerIn(sidText));
    return userSid;
  } finally {
    native.kernel32.CloseHandle(pointerIn(token));
  }
}

/**
 * `sid` as SDDL text spells it, which is not always the SID: Windows writes
 * some accounts as an alias, such as the built-in Administrator (`…-500`) as
 * `LA`. Found by turning an owner-only descriptor into text.
 */
export function sidInSddl(sid: string): string {
  const native = required();
  const descriptor = outPointer();
  check(
    native,
    native.advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW(
      wide(`O:${sid}`),
      SDDL_REVISION_1,
      descriptor,
      0n,
    ),
    'ConvertStringSecurityDescriptorToSecurityDescriptorW',
  );
  const text = outPointer();
  try {
    check(
      native,
      native.advapi32.ConvertSecurityDescriptorToStringSecurityDescriptorW(
        pointerIn(descriptor),
        SDDL_REVISION_1,
        OWNER_SECURITY_INFORMATION,
        text,
        0n,
      ),
      'ConvertSecurityDescriptorToStringSecurityDescriptorW',
    );
  } finally {
    native.kernel32.LocalFree(pointerIn(descriptor));
  }
  return takeWideString(native, pointerIn(text)).replace(/^O:/u, '');
}

let userInSddl: string | undefined;

/** This user as SDDL text spells them; compare access lists against this, not the SID. */
export function currentUserInSddl(): string {
  userInSddl ??= sidInSddl(currentUserSid());
  return userInSddl;
}

/** The owner and access list of `target`, as SDDL (`O:…D:…`). */
export function readOwnerAndAccess(target: string): string {
  const native = required();
  const information = OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
  const needed = Buffer.alloc(4);
  native.advapi32.GetFileSecurityW(wide(target), information, 0n, 0, needed);
  const descriptor = Buffer.alloc(needed.readUInt32LE(0));
  check(
    native,
    native.advapi32.GetFileSecurityW(wide(target), information, descriptor, descriptor.length, needed),
    'GetFileSecurityW',
  );
  const text = outPointer();
  check(
    native,
    native.advapi32.ConvertSecurityDescriptorToStringSecurityDescriptorW(
      descriptor,
      SDDL_REVISION_1,
      information,
      text,
      0n,
    ),
    'ConvertSecurityDescriptorToStringSecurityDescriptorW',
  );
  return takeWideString(native, pointerIn(text));
}

/** Replaces the access list of `target` with `daclSddl` (`D:P(…)…`), not inheriting from its parent. */
export function writeProtectedAccess(target: string, daclSddl: string): void {
  const native = required();
  const descriptor = outPointer();
  check(
    native,
    native.advapi32.ConvertStringSecurityDescriptorToSecurityDescriptorW(
      wide(daclSddl),
      SDDL_REVISION_1,
      descriptor,
      0n,
    ),
    'ConvertStringSecurityDescriptorToSecurityDescriptorW',
  );
  try {
    const information = (DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION) >>> 0;
    check(
      native,
      native.advapi32.SetFileSecurityW(wide(target), information, pointerIn(descriptor)),
      'SetFileSecurityW',
    );
  } finally {
    native.kernel32.LocalFree(pointerIn(descriptor));
  }
}
