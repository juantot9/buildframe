import { describe, expect, it } from 'vitest';

import type { HarnessConnectionView } from '@buildframe/workspace/harness-interaction';

import { connectionNotices } from '../../src/reviewingAgent.js';

function view(...harnesses: [attachment: string, harness: string, session: string, connected: boolean][]) {
  return {
    harnesses: harnesses.map(([attachmentIdentity, harnessLabel, sessionLabel, connected]) => ({
      attachmentIdentity,
      harnessLabel,
      sessionLabel,
      connected,
      availability: { status: 'available' },
    })),
  } as unknown as HarnessConnectionView;
}

describe('connection notices', () => {
  it('names a session once when a different one connects, never for the first view or a reconnect', () => {
    const notice = connectionNotices();
    // Already connected when BuildFrame opened: the header says so.
    expect(notice(view(['att_a', 'Pi', 'Fix login', true]))).toBeUndefined();
    // The same session drops and comes back.
    expect(notice(view(['att_a', 'Pi', 'Fix login', false]))).toBeUndefined();
    expect(notice(view(['att_a', 'Pi', 'Fix login', true]))).toBeUndefined();
    // Another session takes the repository.
    expect(notice(view(['att_b', 'Codex', 'session 9f8e7d6c', true], ['att_a', 'Pi', 'Fix login', false]))).toBe(
      'Connected to Codex · session 9f8e7d6c',
    );
    expect(notice(view(['att_b', 'Codex', 'session 9f8e7d6c', true]))).toBeUndefined();
  });

  it('names the first session that connects after BuildFrame opened', () => {
    const notice = connectionNotices();
    expect(notice(view())).toBeUndefined();
    expect(notice(view(['att_a', 'OpenCode', 'Review the parser', true]))).toBe(
      'Connected to OpenCode · Review the parser',
    );
  });
});
