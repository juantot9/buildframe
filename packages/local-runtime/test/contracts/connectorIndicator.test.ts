import { describe, expect, it } from 'vitest';

import type { ConnectorStatus } from '../../src/connector/contracts.js';
import { connectorIndicator, connectorIndicatorText } from '../../src/connector/indicator.js';

const DIAGNOSTIC = { code: 'runtime-role-rejected' } as never;
const WRITE = { readOnly: false, command: '/buildframe' };

function text(status: ConnectorStatus, options = WRITE, problem = true): string | undefined {
  const indicator = connectorIndicator(status, options);
  return indicator === undefined ? undefined : connectorIndicatorText(indicator, { problem });
}

describe('connector indicator', () => {
  it('is a quiet light while connected, naming only read-only access', () => {
    const connected: ConnectorStatus = { kind: 'connected', first: true, text: '' };
    expect(connectorIndicator(connected, WRITE)).toEqual({
      connected: true,
      glyph: '●',
      tone: 'success',
      access: undefined,
      problem: undefined,
    });
    expect(text(connected)).toBe('● BuildFrame');
    expect(text(connected, { readOnly: true, command: '/buildframe' })).toBe('● BuildFrame read-only');
  });

  it('never shows a session that is waiting or reconnecting as connected', () => {
    const waiting: ConnectorStatus = {
      kind: 'retrying',
      first: true,
      text: '',
      cause: 'runtime-unavailable',
      label: 'runtime unavailable',
    };
    const reconnecting: ConnectorStatus = { kind: 'retrying', first: false, text: '', cause: 'runtime-disconnected' };
    expect(connectorIndicator(waiting, WRITE)).toMatchObject({ connected: false, glyph: '○', tone: 'warning' });
    expect(text(waiting)).toBe('○ BuildFrame not open yet · connects when it opens');
    expect(text(reconnecting)).toBe('○ BuildFrame reconnecting…');
    expect(text(reconnecting, { readOnly: true, command: '/buildframe' })).toBe('○ BuildFrame reconnecting…');
  });

  it('says why it was refused, and how to take back a session another one replaced', () => {
    const refused: ConnectorStatus = {
      kind: 'refused',
      first: false,
      text: '',
      label: 'workspace mismatch',
      diagnostic: DIAGNOSTIC,
    };
    const replaced: ConnectorStatus = { kind: 'replaced', first: false, text: '' };
    expect(connectorIndicator(refused, WRITE)).toMatchObject({ tone: 'error' });
    expect(text(refused)).toBe('○ BuildFrame couldn’t connect: workspace mismatch');
    expect(text(replaced)).toBe('○ BuildFrame moved to another session · /buildframe to take it back');
    expect(connectorIndicator(replaced, { readOnly: false, command: '!buildframe' })?.problem).toBe(
      'moved to another session · !buildframe to take it back',
    );
  });

  it('leaves the problem to a separate line when the host has one', () => {
    const replaced: ConnectorStatus = { kind: 'replaced', first: false, text: '' };
    expect(text(replaced, WRITE, false)).toBe('○ BuildFrame');
  });

  it('shows nothing once the session disconnected on purpose', () => {
    expect(connectorIndicator({ kind: 'cancelled', first: false, text: '' }, WRITE)).toBeUndefined();
  });
});
