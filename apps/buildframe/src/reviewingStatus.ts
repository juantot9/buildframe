/**
 * One visual language for states: a symbol, a colour tone and a short word.
 * The list, the Message card and the status line all read from here so the
 * same state never looks different in two places.
 */

import { spinnerGlyph, type StatusTone } from './shellStatus.js';

export {
  NOTICE_LIFETIME_MS,
  noticeGlyph,
  noticeStatusTone,
  SPINNER_FRAME_MS,
  spinnerGlyph,
  type NoticeTone,
  type StatusTone,
} from './shellStatus.js';

export interface StatusBadge {
  readonly glyph: string;
  readonly word: string;
  readonly tone: StatusTone;
}

/** How a sent Message stands, from the user's point of view. */
export type MessageState =
  | 'answered'
  | 'working'
  | 'stopping'
  | 'waiting'
  | 'interrupted'
  | 'failed'
  | 'not-sent'
  | 'unknown'
  | 'no-answer'
  /** Its Handoff is not in the loaded interaction window. */
  | 'not-loaded';

interface BadgeLook {
  readonly glyph: string;
  readonly ascii: string;
  readonly word: string;
  readonly tone: StatusTone;
  readonly spins?: true;
}

const MESSAGE_LOOK: Record<MessageState, BadgeLook> = {
  answered: { glyph: '✓', ascii: '+', word: 'answered', tone: 'success' },
  working: { glyph: '', ascii: '', word: 'working', tone: 'accent', spins: true },
  stopping: { glyph: '', ascii: '', word: 'stopping', tone: 'warning', spins: true },
  waiting: { glyph: '○', ascii: 'o', word: 'waiting', tone: 'muted' },
  interrupted: { glyph: '■', ascii: '#', word: 'interrupted', tone: 'warning' },
  failed: { glyph: '✗', ascii: 'x', word: 'failed', tone: 'danger' },
  'not-sent': { glyph: '✗', ascii: 'x', word: 'not sent', tone: 'danger' },
  unknown: { glyph: '?', ascii: '?', word: 'unknown', tone: 'warning' },
  'no-answer': { glyph: '·', ascii: '-', word: 'no answer', tone: 'muted' },
  'not-loaded': { glyph: '?', ascii: '?', word: 'not loaded', tone: 'muted' },
};

/** A Message still on its way out, before the Workspace shows it as saved. */
export type OutgoingState =
  | 'inspecting'
  | 'awaiting-confirmation'
  | 'committing'
  | 'saved-awaiting-projection'
  | 'rejected'
  | 'outcome-unknown';

const OUTGOING_LOOK: Record<OutgoingState, BadgeLook> = {
  inspecting: { glyph: '', ascii: '', word: 'checking', tone: 'accent', spins: true },
  'awaiting-confirmation': { glyph: '!', ascii: '!', word: 'confirm', tone: 'warning' },
  committing: { glyph: '', ascii: '', word: 'saving', tone: 'accent', spins: true },
  // Saved locally is not delivered: only an answer earns the green check.
  'saved-awaiting-projection': { glyph: '○', ascii: 'o', word: 'saved', tone: 'muted' },
  rejected: { glyph: '✗', ascii: 'x', word: 'not sent', tone: 'danger' },
  'outcome-unknown': { glyph: '?', ascii: '?', word: 'unknown', tone: 'warning' },
};

function badge(look: BadgeLook, frame: number, ascii: boolean): StatusBadge {
  const glyph = look.spins === true ? spinnerGlyph(frame, ascii) : ascii ? look.ascii : look.glyph;
  return { glyph, word: look.word, tone: look.tone };
}

export function messageBadge(state: MessageState, frame: number, ascii: boolean): StatusBadge {
  return badge(MESSAGE_LOOK[state], frame, ascii);
}

export function outgoingBadge(state: OutgoingState, frame: number, ascii: boolean): StatusBadge {
  return badge(OUTGOING_LOOK[state], frame, ascii);
}

export function messageStateSpins(state: MessageState): boolean {
  return MESSAGE_LOOK[state].spins === true;
}

export function outgoingStateSpins(state: OutgoingState): boolean {
  return OUTGOING_LOOK[state].spins === true;
}
