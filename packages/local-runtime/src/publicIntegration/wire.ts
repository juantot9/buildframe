/**
 * The public integration wire, v1: JSON-RPC 2.0, one message per line, on the
 * same-user socket `bframe endpoint --json` names. Any harness or tool may
 * speak it; BuildFrame treats what it reports as an Unverified Integration's
 * own claim. Only these shapes are public; everything else on the socket is
 * BuildFrame's private seam.
 */

export const PUBLIC_INTEGRATION_PROTOCOL_VERSION = 1;

/** Error codes outside JSON-RPC's reserved range. The connection survives all but `refused`. */
export const PUBLIC_ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  /** BuildFrame refused the connection; it closes after this answer. */
  refused: -32001,
  /** A request that needs `buildframe/initialize` first, or a second initialize. */
  notInitialized: -32002,
  /** The level or protocol version isn't supported yet. */
  unsupported: -32003,
} as const;

export type PublicIntegrationLevel = 'basic' | 'full';

export interface PublicIntegrationManifest {
  readonly name: string;
  readonly version: string;
  readonly level: PublicIntegrationLevel;
  readonly canInterrupt: boolean;
}

export interface PublicInitializeParams {
  readonly protocolVersion: number;
  readonly workspace: string;
  readonly manifest: PublicIntegrationManifest;
  /** The harness session, so two sessions of one harness can be told apart. */
  readonly session?: { readonly id?: string; readonly name?: string };
}

export type PublicStopReason = 'end_turn' | 'cancelled' | 'failed' | 'refusal' | 'max_tokens';

export type PublicIncoming =
  | { readonly kind: 'request'; readonly id: string | number; readonly method: string; readonly params: unknown }
  | { readonly kind: 'notification'; readonly method: string; readonly params: unknown }
  | { readonly kind: 'response'; readonly id: string | number; readonly result?: unknown; readonly error?: unknown }
  | { readonly kind: 'invalid'; readonly id?: string | number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string | number {
  return (typeof value === 'string' && value.length <= 128) || (typeof value === 'number' && Number.isInteger(value));
}

/** A short printable label: no control characters or surrounding spaces, at most `max` characters. */
export function publicLabel(value: unknown, max = 64): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    // The Workspace refuses identities with surrounding spaces.
    value.trim() === value &&
    [...value].length <= max &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

/**
 * Sorts one frame into request, notification or response. `"jsonrpc": "2.0"`
 * may be left out (Codex's app-server does); any other value is invalid.
 * Unknown members are ignored, so later versions can add optional fields.
 */
export function classifyPublicFrame(frame: unknown): PublicIncoming {
  if (!isRecord(frame)) return { kind: 'invalid' };
  const id = isId(frame.id) ? frame.id : undefined;
  if (frame.jsonrpc !== undefined && frame.jsonrpc !== '2.0')
    return id === undefined ? { kind: 'invalid' } : { kind: 'invalid', id };
  if (typeof frame.method === 'string') {
    if (frame.id !== undefined && id === undefined) return { kind: 'invalid' };
    return id === undefined
      ? { kind: 'notification', method: frame.method, params: frame.params }
      : { kind: 'request', id, method: frame.method, params: frame.params };
  }
  if (id !== undefined && ('result' in frame || 'error' in frame)) {
    return { kind: 'response', id, ...('result' in frame ? { result: frame.result } : { error: frame.error }) };
  }
  return id === undefined ? { kind: 'invalid' } : { kind: 'invalid', id };
}

/** Whether the first frame on a connection opens the public wire rather than the private bootstrap. */
export function opensPublicWire(frame: unknown): boolean {
  return isRecord(frame) && (frame.jsonrpc === '2.0' || typeof frame.method === 'string') && frame.type === undefined;
}

export function parseInitializeParams(params: unknown): PublicInitializeParams | undefined {
  if (!isRecord(params) || typeof params.protocolVersion !== 'number' || typeof params.workspace !== 'string') {
    return undefined;
  }
  const manifest = params.manifest;
  if (
    !isRecord(manifest) ||
    !publicLabel(manifest.name) ||
    !publicLabel(manifest.version, 32) ||
    (manifest.level !== 'basic' && manifest.level !== 'full') ||
    typeof manifest.canInterrupt !== 'boolean'
  ) {
    return undefined;
  }
  let session: PublicInitializeParams['session'];
  if (params.session !== undefined) {
    if (!isRecord(params.session)) return undefined;
    const { id, name } = params.session;
    if ((id !== undefined && !publicLabel(id, 128)) || (name !== undefined && typeof name !== 'string'))
      return undefined;
    session = { ...(id === undefined ? {} : { id }), ...(typeof name === 'string' ? { name } : {}) };
  }
  return {
    protocolVersion: params.protocolVersion,
    workspace: params.workspace,
    manifest: {
      name: manifest.name,
      version: manifest.version,
      level: manifest.level,
      canInterrupt: manifest.canInterrupt,
    },
    ...(session === undefined ? {} : { session }),
  };
}

const STOP_REASONS: ReadonlySet<string> = new Set(['end_turn', 'cancelled', 'failed', 'refusal', 'max_tokens']);

export function isStopReason(value: unknown): value is PublicStopReason {
  return typeof value === 'string' && STOP_REASONS.has(value);
}

/** How a public stop reason settles a turn. Refusal and max_tokens still end the turn normally. */
export function outcomeOfStopReason(reason: PublicStopReason): 'ended-normally' | 'failed' | 'interrupted' {
  if (reason === 'cancelled') return 'interrupted';
  if (reason === 'failed') return 'failed';
  return 'ended-normally';
}

export function messageIdOf(params: unknown): string | undefined | false {
  if (!isRecord(params) || params.messageId === undefined) return undefined;
  return typeof params.messageId === 'string' ? params.messageId : false;
}

export function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}
