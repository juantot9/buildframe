/**
 * The closed Adapter-private protocol between the BuildFrame Claude Mod and its
 * Node helper. Commands flow helper → Mod; facts flow Mod → helper. Facts carry
 * identities, booleans and native reason words. The one exception is the
 * final answer of the turn the Mod's own submission started, the Review
 * Response; no prompt text, user turn, transcript, or credential crosses.
 */
export const CLAUDE_MOD_PROTOCOL_VERSION: 1 = 1;

/** Native `turn.complete` reasons, exactly as the reviewed Mod types spell them. */
export type ClaudeTurnCompleteReason = 'answer' | 'aborted' | 'refusal' | 'error';

export type ClaudeModCommand =
  | { readonly type: 'submit'; readonly dispatchId: string; readonly text: string }
  | { readonly type: 'abort'; readonly dispatchId: string; readonly turnId: string }
  | { readonly type: 'status'; readonly label: string }
  | { readonly type: 'detach'; readonly label: string };

export type ClaudeModFact =
  /** The Mod found Claude busy and did not call submit. */
  | { readonly type: 'submit-refused'; readonly dispatchId: string }
  /** The Mod called `$.prompt.submit` for this dispatch. */
  | { readonly type: 'submit-called'; readonly dispatchId: string }
  /** `$.prompt.submit` resolved: entered (turn started) or dropped before entering. */
  | { readonly type: 'submit-resolved'; readonly dispatchId: string; readonly entered: boolean }
  | { readonly type: 'submit-threw'; readonly dispatchId: string }
  /** Any prompt the Mod did not submit itself: the user's, a peer's, another Mod's. */
  | { readonly type: 'foreign-prompt' }
  /** A main-loop turn began; `matchesPending` compares it with the Mod's own unsettled submission. */
  | { readonly type: 'turn-start'; readonly turnId: string; readonly matchesPending: boolean }
  | {
      readonly type: 'turn-complete';
      readonly turnId: string;
      readonly reason: ClaudeTurnCompleteReason;
      /** Claude's final visible text, present only when the Mod's own submission started this turn. */
      readonly answer?: string;
    }
  | { readonly type: 'abort-failed'; readonly dispatchId: string }
  | { readonly type: 'session-ending' };

export interface ClaudeModAttachRequest {
  readonly protocolVersion: typeof CLAUDE_MOD_PROTOCOL_VERSION;
  readonly sessionId: string;
  readonly cwd: string;
  readonly hostVersion: string;
}

export type ClaudeModAttachOutcome =
  | { readonly status: 'connected' | 'retrying'; readonly port: number; readonly token: string; readonly label: string }
  | { readonly status: 'refused'; readonly label: string };

const MAX_IDENTITY_LENGTH = 256;
/** The Mod never sends a longer answer: it could not fit the 16 KiB Response bound. */
const MAX_ANSWER_LENGTH = 16 * 1024;
const TURN_REASONS: readonly ClaudeTurnCompleteReason[] = ['answer', 'aborted', 'refusal', 'error'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every(key => keys.includes(key)) && keys.every(key => key in value);
}

function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTITY_LENGTH;
}

export function parseClaudeModFact(value: unknown): ClaudeModFact | undefined {
  if (!isRecord(value)) return undefined;
  switch (value.type) {
    case 'submit-refused':
    case 'submit-called':
    case 'submit-threw':
    case 'abort-failed':
      return hasOnlyKeys(value, ['type', 'dispatchId']) && identity(value.dispatchId)
        ? { type: value.type, dispatchId: value.dispatchId }
        : undefined;
    case 'submit-resolved':
      return hasOnlyKeys(value, ['type', 'dispatchId', 'entered']) &&
        identity(value.dispatchId) &&
        typeof value.entered === 'boolean'
        ? { type: 'submit-resolved', dispatchId: value.dispatchId, entered: value.entered }
        : undefined;
    case 'foreign-prompt':
    case 'session-ending':
      return hasOnlyKeys(value, ['type']) ? { type: value.type } : undefined;
    case 'turn-start':
      return hasOnlyKeys(value, ['type', 'turnId', 'matchesPending']) &&
        identity(value.turnId) &&
        typeof value.matchesPending === 'boolean'
        ? { type: 'turn-start', turnId: value.turnId, matchesPending: value.matchesPending }
        : undefined;
    case 'turn-complete': {
      const withAnswer = 'answer' in value;
      if (
        !hasOnlyKeys(value, withAnswer ? ['type', 'turnId', 'reason', 'answer'] : ['type', 'turnId', 'reason']) ||
        !identity(value.turnId) ||
        !TURN_REASONS.includes(value.reason as ClaudeTurnCompleteReason) ||
        (withAnswer && (typeof value.answer !== 'string' || value.answer.length > MAX_ANSWER_LENGTH))
      ) {
        return undefined;
      }
      const reason = value.reason as ClaudeTurnCompleteReason;
      return withAnswer
        ? { type: 'turn-complete', turnId: value.turnId, reason, answer: value.answer as string }
        : { type: 'turn-complete', turnId: value.turnId, reason };
    }
    default:
      return undefined;
  }
}

export function parseClaudeModAttachRequest(value: unknown): ClaudeModAttachRequest | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['protocolVersion', 'sessionId', 'cwd', 'hostVersion']) ||
    value.protocolVersion !== CLAUDE_MOD_PROTOCOL_VERSION ||
    !identity(value.sessionId) ||
    typeof value.cwd !== 'string' ||
    !value.cwd.startsWith('/') ||
    value.cwd.length > 4096 ||
    !identity(value.hostVersion)
  ) {
    return undefined;
  }
  return {
    protocolVersion: CLAUDE_MOD_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    cwd: value.cwd,
    hostVersion: value.hostVersion,
  };
}
