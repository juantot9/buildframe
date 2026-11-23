/** The owner record inside a Workspace lock directory, and reading it back. */

export const LOCK_OWNER_FORMAT_VERSION = 1;

export interface LockOwner {
  readonly pid: number;
  readonly nonce: string;
  readonly processIdentity: string | undefined;
}

export function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function parseLockOwner(content: string, expectedNonce: string): LockOwner | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }

  const record = objectRecord(parsed);
  if (
    !record ||
    record.formatVersion !== LOCK_OWNER_FORMAT_VERSION ||
    typeof record.pid !== 'number' ||
    !Number.isSafeInteger(record.pid) ||
    record.pid <= 0 ||
    record.nonce !== expectedNonce ||
    (record.processIdentity !== undefined &&
      (typeof record.processIdentity !== 'string' || record.processIdentity.length === 0))
  ) {
    return undefined;
  }

  return {
    pid: record.pid,
    nonce: expectedNonce,
    processIdentity: typeof record.processIdentity === 'string' ? record.processIdentity : undefined,
  };
}
