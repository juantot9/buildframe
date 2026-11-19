/** The messages the launcher and the runtime process exchange over the spawn channel, and their parsers. */

export const RUNTIME_PROCESS_MESSAGE_VERSION = 1;
export const MAX_CONFIGURED_TIMEOUT_MS = 3_600_000;

export interface RuntimeStartRejectedDiagnostic {
  readonly code: 'runtime-start-rejected';
  readonly reason:
    | 'spawn-failed'
    | 'code-identity-unavailable'
    | 'startup-timeout'
    | 'runtime-exited'
    | 'writer-unavailable'
    | 'state-read-only-newer'
    | 'workspace-unavailable'
    | 'endpoint-active'
    | 'endpoint-insecure'
    | 'listen-failed';
}

export type RuntimeProcessFailureReason = Exclude<
  RuntimeStartRejectedDiagnostic['reason'],
  'spawn-failed' | 'startup-timeout' | 'runtime-exited'
>;

export interface RuntimeProcessStartMessage {
  readonly type: 'runtime.start';
  readonly version: typeof RUNTIME_PROCESS_MESSAGE_VERSION;
  readonly startPath: string;
  readonly idleGraceMilliseconds: number;
}

export interface RuntimeProcessReadyMessage {
  readonly type: 'runtime.ready';
  readonly version: typeof RUNTIME_PROCESS_MESSAGE_VERSION;
}

export interface RuntimeProcessFailedMessage {
  readonly type: 'runtime.failed';
  readonly version: typeof RUNTIME_PROCESS_MESSAGE_VERSION;
  readonly reason: RuntimeProcessFailureReason;
}

export type RuntimeProcessStatusMessage = RuntimeProcessReadyMessage | RuntimeProcessFailedMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return keys.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => allowed.has(key));
}

function isFailureReason(value: unknown): value is RuntimeProcessFailureReason {
  return (
    typeof value === 'string' &&
    [
      'writer-unavailable',
      'code-identity-unavailable',
      'state-read-only-newer',
      'workspace-unavailable',
      'endpoint-active',
      'endpoint-insecure',
      'listen-failed',
    ].includes(value)
  );
}

export function parseStatusMessage(value: unknown): RuntimeProcessStatusMessage | undefined {
  if (!isRecord(value) || value.version !== RUNTIME_PROCESS_MESSAGE_VERSION) {
    return undefined;
  }
  if (value.type === 'runtime.ready' && hasOnlyKeys(value, ['type', 'version'])) {
    return value as unknown as RuntimeProcessReadyMessage;
  }
  if (
    value.type === 'runtime.failed' &&
    hasOnlyKeys(value, ['type', 'version', 'reason']) &&
    isFailureReason(value.reason)
  ) {
    return value as unknown as RuntimeProcessFailedMessage;
  }
  return undefined;
}

export function parseStartMessage(value: unknown): RuntimeProcessStartMessage | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['type', 'version', 'startPath', 'idleGraceMilliseconds']) ||
    value.type !== 'runtime.start' ||
    value.version !== RUNTIME_PROCESS_MESSAGE_VERSION ||
    typeof value.startPath !== 'string' ||
    value.startPath.length === 0 ||
    value.startPath.length > 16_384 ||
    !Number.isSafeInteger(value.idleGraceMilliseconds) ||
    (value.idleGraceMilliseconds as number) < 0 ||
    (value.idleGraceMilliseconds as number) > MAX_CONFIGURED_TIMEOUT_MS
  ) {
    return undefined;
  }
  return value as unknown as RuntimeProcessStartMessage;
}
