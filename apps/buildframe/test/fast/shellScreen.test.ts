import { describe, expect, it } from 'vitest';

import { Key, type ReviewingInput } from '../../src/reviewingInput.js';
import { keyList, keysRow } from '../../src/shellKeys.js';
import { defineScreen, dispatchScreenKey, type ScreenKey } from '../../src/shellScreen.js';

interface State {
  mode: 'list' | 'detail';
  loading: boolean;
  picked: number;
}

const text = (value: string): ReviewingInput => ({ text: value, ctrl: false, alt: false, shift: false, super: false });
const enter: ReviewingInput = { name: 'enter', ctrl: false, alt: false, shift: false, super: false };

const key = (
  overrides: Partial<ScreenKey<State, State['mode']>> & { id: string },
): ScreenKey<State, State['mode']> => ({
  keys: [overrides.id],
  show: overrides.id,
  help: { group: 'OPEN', text: `${overrides.id} help` },
  run: () => [],
  ...overrides,
});

const definition = (keys: readonly ScreenKey<State, State['mode']>[]) => ({
  name: 'test',
  open: (): State => ({ mode: 'list', loading: false, picked: 0 }),
  title: () => 'Test',
  mode: (state: State) => state.mode,
  modes: { list: { sentence: 'Pick one.' }, detail: { escape: 'Back to the list' } },
  keys,
  body: () => [],
});

describe('defineScreen', () => {
  it('refuses keys the shell owns', () => {
    for (const taken of ['q', '?', 'c', '!', ' ']) {
      expect(() => defineScreen(definition([key({ id: 'x', keys: [taken] })]))).toThrow('which the shell owns');
    }
    expect(() => defineScreen(definition([key({ id: 'x', keys: [Key.ctrl('c')] })]))).toThrow('ctrl+c');
    expect(() => defineScreen(definition([key({ id: 'x', keys: [Key.escape] })]))).toThrow('escape');
  });

  it('refuses one key bound twice in the same mode, but not in different modes', () => {
    expect(() => defineScreen(definition([key({ id: 'a' }), key({ id: 'b', keys: ['a'] })]))).toThrow(
      'Screen test binds a to both a and b in list',
    );
    expect(() =>
      defineScreen(definition([key({ id: 'a', modes: ['list'] }), key({ id: 'b', keys: ['a'], modes: ['detail'] })])),
    ).not.toThrow();
  });

  it('refuses more than four footer keys in a mode', () => {
    const five = ['a', 'b', 'd', 'e', 'f'].map(id => key({ id, label: id }));
    expect(() => defineScreen(definition(five))).toThrow('Footer mode list shows more than 4 keys');
  });

  it('draws the footer and `?` list from the same keys', () => {
    const screen = defineScreen(
      definition([
        key({ id: 'enter', keys: [Key.enter], show: 'Enter', label: 'open', help: { group: 'OPEN', text: 'Open it' } }),
        key({ id: 'j', label: 'next', help: { group: 'MOVE', text: 'Next item' }, modes: ['list'] }),
        key({ id: 'r', help: { group: 'VIEW', text: 'Refresh (listed only)' } }),
      ]),
    );
    const state = screen.open(undefined);
    expect(keysRow(screen.table, 'list', state, 60).trimEnd()).toBe(
      `[Enter] open  [j] next${' '.repeat(20)}[?] keys  [q] quit`,
    );
    expect(keyList(screen.table, 'list', state).map(item => `${item.group} ${item.key} ${item.label}`)).toEqual([
      'OPEN Enter Open it',
      'MOVE j Next item',
      'VIEW r Refresh (listed only)',
      'VIEW c Configuration',
      'VIEW ! Action checks (debug)',
      'WORKSPACE ? Show / hide this key list',
      'WORKSPACE q Quit BuildFrame',
    ]);
    expect(keyList(screen.table, 'detail', state).map(item => item.key)).toEqual([
      'Enter',
      'r',
      'c',
      '!',
      'Esc',
      '?',
      'q',
    ]);
  });
});

describe('dispatchScreenKey', () => {
  const screen = defineScreen(
    definition([
      key({
        id: 'enter',
        keys: [Key.enter],
        show: 'Enter',
        waits: state => state.loading,
        run: state => {
          state.mode = 'detail';
        },
      }),
      key({
        id: 'j',
        modes: ['list'],
        blocked: state => (state.picked >= 2 ? 'There is nothing below.' : undefined),
        run: state => {
          state.picked += 1;
          return [{ type: 'say', text: `Picked ${state.picked}.`, tone: 'info' }];
        },
      }),
    ]),
  );

  it('runs the key bound in the current mode and returns its effects', () => {
    const state = screen.open(undefined);
    expect(dispatchScreenKey(screen, state, text('j'))).toEqual([{ type: 'say', text: 'Picked 1.', tone: 'info' }]);
    expect(dispatchScreenKey(screen, state, text('z'))).toEqual([]);
    expect(dispatchScreenKey(screen, state, enter)).toEqual([]);
    expect(state.mode).toBe('detail');
    // j acts only in the list.
    expect(dispatchScreenKey(screen, state, text('j'))).toEqual([]);
    expect(state.picked).toBe(1);
  });

  it('says why a blocked key cannot act, and that a waiting key is still loading', () => {
    const state = { ...screen.open(undefined), picked: 2, loading: true };
    expect(dispatchScreenKey(screen, state, text('j'))).toEqual([
      { type: 'say', text: 'There is nothing below.', tone: 'info' },
    ]);
    expect(dispatchScreenKey(screen, state, enter)).toEqual([
      { type: 'say', text: 'Still loading; press Enter again in a moment.', tone: 'info' },
    ]);
    expect(state.mode).toBe('list');
  });
});
