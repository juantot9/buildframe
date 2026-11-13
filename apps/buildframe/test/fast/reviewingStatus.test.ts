import { describe, expect, it } from 'vitest';
import { reasonSentence, startupFailureSentence } from '../../src/reviewingReasons.js';
import {
  messageBadge,
  noticeGlyph,
  outgoingBadge,
  spinnerGlyph,
  type MessageState,
  type OutgoingState,
} from '../../src/reviewingStatus.js';

const MESSAGE_STATES: readonly MessageState[] = [
  'answered',
  'working',
  'stopping',
  'waiting',
  'interrupted',
  'failed',
  'not-sent',
  'unknown',
  'no-answer',
];
const OUTGOING_STATES: readonly OutgoingState[] = [
  'inspecting',
  'awaiting-confirmation',
  'committing',
  'saved-awaiting-projection',
  'rejected',
  'outcome-unknown',
];

describe('state symbols', () => {
  it('gives every state one symbol and word, ASCII-only in ASCII mode', () => {
    const badges = [
      ...MESSAGE_STATES.map(state => messageBadge(state, 0, true)),
      ...OUTGOING_STATES.map(state => outgoingBadge(state, 0, true)),
    ];
    for (const badge of badges) {
      expect([...badge.glyph]).toHaveLength(1);
      expect(badge.glyph.codePointAt(0)!).toBeLessThan(128);
      expect(badge.word.length).toBeGreaterThan(0);
    }
    expect(['success', 'warning', 'error'].map(tone => noticeGlyph(tone as 'success', true))).toEqual(['+', '!', 'x']);
  });

  it('animates only working states', () => {
    expect(messageBadge('working', 0, false).glyph).not.toBe(messageBadge('working', 1, false).glyph);
    expect(messageBadge('answered', 0, false).glyph).toBe(messageBadge('answered', 1, false).glyph);
    expect(spinnerGlyph(4, true)).toBe(spinnerGlyph(0, true));
  });

  it('keeps the ASCII spinner apart from ASCII borders and separators', () => {
    const frames = [0, 1, 2, 3].map(frame => spinnerGlyph(frame, true));
    expect(new Set(frames).size).toBeGreaterThan(1);
    for (const frame of frames) expect(['|', '/', '-', '\\', '+']).not.toContain(frame);
  });
});

describe('reason sentences', () => {
  it('names the agent and the next step instead of a raw code', () => {
    const sentence = reasonSentence('active-invocation-exists', 'Claude Code');
    expect(sentence).toContain('Claude Code is still working');
    expect(sentence).toContain('press x');
    expect(sentence).not.toContain('active-invocation-exists');
  });

  it('keeps an unknown code visible for bug reports', () => {
    expect(reasonSentence('brand-new-reason')).toContain('(brand-new-reason)');
  });

  it('turns startup refusals into one readable line', () => {
    const line = startupFailureSentence({ code: 'not-git-worktree' });
    expect(line).toContain('isn’t inside a Git repository');
    expect(line).toContain('(not-git-worktree)');
    expect(line).not.toContain('{');
  });

  it('never shows a Message saved locally as delivered or answered', () => {
    const saved = outgoingBadge('saved-awaiting-projection', 0, false);
    const answered = messageBadge('answered', 0, false);
    expect(saved.word).toBe('saved');
    expect(saved.glyph).not.toBe(answered.glyph);
    expect(saved.tone).not.toBe('success');
    expect(outgoingBadge('committing', 0, false).word).toBe('saving');
  });
});
