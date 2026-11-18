import { describe, expect, it } from 'vitest';

import { routeShellKey, type ShellKeyHost } from '../../src/shellInput.js';
import type { ReviewingInput } from '../../src/reviewingInput.js';

const key = (text: string, name = text): ReviewingInput =>
  ({ name, text, sequence: text, ctrl: false, alt: false, shift: false, super: false }) as ReviewingInput;
const ESC = { ...key('', 'escape'), text: undefined } as unknown as ReviewingInput;
const CTRL_C = { ...key('c'), ctrl: true } as ReviewingInput;

type Effect = string;

/** A screen with every layer closed; each test opens what it needs and reads the log. */
function host(overrides: Partial<ShellKeyHost<Effect>> = {}): { host: ShellKeyHost<Effect>; log: string[] } {
  const log: string[] = [];
  const base: ShellKeyHost<Effect> = {
    stop: 'stop',
    capture: () => undefined,
    guard: () => undefined,
    guarded: false,
    ready: true,
    loading: false,
    saving: false,
    sayStillLoading: pressed => log.push(`still loading ${pressed}`),
    keyList: { open: false, show: open => log.push(`key list ${open}`) },
    configuration: { open: false, show: () => log.push('configuration'), input: () => ['configuration key'] },
    details: { open: false, show: open => log.push(`details ${open}`) },
    escape: () => ['screen escape'],
    screenKey: input => [`screen ${input.text ?? input.name}`],
  };
  return { host: { ...base, ...overrides }, log };
}

describe('the shell key order', () => {
  it('lets a typing layer take every key first, even q and Ctrl+C', () => {
    const { host: h } = host({ capture: () => ['typed'] });
    expect(routeShellKey(key('q'), h)).toEqual(['typed']);
    expect(routeShellKey(CTRL_C, h)).toEqual(['typed']);
  });

  it('quits on q only when nothing loads or saves, and says so otherwise', () => {
    expect(routeShellKey(key('q'), host().host)).toEqual(['stop']);
    const loading = host({ loading: true });
    expect(routeShellKey(key('q'), loading.host)).toEqual([]);
    expect(loading.log).toEqual(['still loading q']);
    expect(routeShellKey(key('q'), host({ ready: false }).host)).toEqual(['screen q']);
  });

  it('swallows keys while the key list is open and closes it on Space, ?, Enter or Esc', () => {
    const open = host({ keyList: { open: true, show: () => undefined } });
    expect(routeShellKey(key('a'), open.host)).toEqual([]);
    const closing = host();
    closing.host = { ...closing.host, keyList: { open: true, show: shown => closing.log.push(`key list ${shown}`) } };
    routeShellKey(ESC, closing.host);
    expect(closing.log).toEqual(['key list false']);
  });

  it('holds every key but q while a command is saved', () => {
    const saving = host({ saving: true });
    expect(routeShellKey(key('?'), saving.host)).toEqual([]);
    expect(routeShellKey(key('a'), saving.host)).toEqual([]);
    expect(saving.log).toEqual([]);
  });

  it('lets a guard refuse the shell’s own keys, and hides ? while guarded', () => {
    expect(routeShellKey(key('c'), host({ guard: () => ['refused'] }).host)).toEqual(['refused']);
    expect(routeShellKey(key('?'), host({ guarded: true }).host)).toEqual(['screen ?']);
  });

  it('closes debug details on Esc before the screen sees it', () => {
    const shown = host({ details: { open: true, show: open => shown.log.push(`details ${open}`) } });
    expect(routeShellKey(ESC, shown.host)).toEqual([]);
    expect(shown.log).toEqual(['details false']);
    expect(routeShellKey(ESC, host().host)).toEqual(['screen escape']);
  });

  it('opens the key list and Configuration, toggles details, and passes the rest to the screen', () => {
    const opened = host();
    routeShellKey(key('?'), opened.host);
    routeShellKey(key('c'), opened.host);
    routeShellKey(key('!'), opened.host);
    expect(opened.log).toEqual(['key list true', 'details false', 'configuration', 'details true']);
    expect(routeShellKey(key('j'), opened.host)).toEqual(['screen j']);
  });
});
