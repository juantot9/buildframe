import { describe, expect, it } from 'vitest';

import { reasonSentence } from '../../src/reviewingReasons.js';
import { connectCommandIn, connectInstruction, supportedHostNames } from '../../src/supportFacts.js';

describe('how the app tells users to connect an agent', () => {
  it('names every supported agent with the command it really runs', () => {
    expect(connectInstruction()).toBe(
      '/buildframe in a Pi, Claude Code or OpenCode session, or !buildframe in a Codex session',
    );
    expect(supportedHostNames()).toBe('Pi, Claude Code, OpenCode and Codex');
    expect(connectCommandIn('Codex')).toBe('!buildframe in Codex');
    expect(connectCommandIn('OpenCode')).toBe('/buildframe in OpenCode');
    expect(connectCommandIn('The agent')).toBe(connectInstruction());
  });

  it('gives Codex users !buildframe when a Send is refused', () => {
    expect(reasonSentence('attachment-not-live', 'Codex')).toBe(
      'Codex isn’t connected right now. Run !buildframe in Codex in this repository, then send again.',
    );
    expect(reasonSentence('harness-index-limit-reached', 'Codex')).toContain('Run !buildframe in Codex again');
    expect(reasonSentence('attachment-not-found')).toContain('!buildframe in a Codex session');
  });
});
