import { describe, expect, it } from 'vitest';

import type { ReviewingInput } from '../../src/reviewingInput.js';
import { configurationKey, type ConfigurationRow } from '../../src/shellConfiguration.js';

const text = (value: string): ReviewingInput => ({ text: value, ctrl: false, alt: false, shift: false, super: false });
const named = (name: string): ReviewingInput => ({ name, ctrl: false, alt: false, shift: false, super: false });

function rows(changes: string[]): ConfigurationRow[] {
  return ['first', 'second', 'third'].map(id => ({
    id,
    name: id,
    value: id,
    description: `${id} described`,
    change: direction => changes.push(`${id} ${direction}`),
  }));
}

describe('Configuration window keys', () => {
  it('moves between rows with ↑/↓ and k/j, wrapping at both ends', () => {
    const window = { selected: 'first' };
    expect(configurationKey(window, named('up'), rows([]))).toBe('moved');
    expect(window.selected).toBe('third');
    expect(configurationKey(window, text('j'), rows([]))).toBe('moved');
    expect(window.selected).toBe('first');
    expect(configurationKey(window, named('down'), rows([]))).toBe('moved');
    expect(window.selected).toBe('second');
  });

  it('changes only the selected row with ←/→ and h/l', () => {
    const changes: string[] = [];
    const window = { selected: 'second' };
    expect(configurationKey(window, named('left'), rows(changes))).toBe('changed');
    expect(configurationKey(window, text('l'), rows(changes))).toBe('changed');
    expect(changes).toEqual(['second -1', 'second 1']);
  });

  it('closes with Esc, Enter or c, and ignores every other key', () => {
    for (const input of [named('escape'), named('enter'), text('c')]) {
      expect(configurationKey({ selected: 'first' }, input, rows([]))).toBe('closed');
    }
    const changes: string[] = [];
    expect(configurationKey({ selected: 'first' }, text('x'), rows(changes))).toBe('ignored');
    expect(changes).toEqual([]);
  });
});
