import { readFile, writeFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import type { ReviewingApplicationState } from '../../src/reviewingModel.js';
import { reviewingFooterSentence, reviewingKeyList, reviewingKeysRow } from '../../src/reviewingView.js';
import { REVIEWING_ACTED_KEYS } from '../../src/reviewingActions.js';
import { REVIEWING_KEYS } from '../../src/reviewingKeys.js';
import { defineKeyTable } from '../../src/shellKeys.js';

/**
 * Pins the footer's keys row (at three widths), its idle sentence and the `?`
 * list for every mode, so the key table reproduces today's words exactly.
 * The golden was recorded from the code before the key table (WF-297 step 2).
 */
const GOLDEN = new URL('../fixtures/reviewing-keys.json', import.meta.url);
const WIDTHS = [120, 60, 30] as const;

const file = { fileIdentity: 'f1', displayPath: 'a.ts', status: 'modified', newSide: { pathBytesBase64: 'YS50cw==' } };
const review = (overrides: Record<string, unknown> = {}) => ({
  source: { kind: 'live' },
  manifest: { manifest: { files: [file] } },
  history: { steps: [] },
  ...overrides,
});
const connected = { harnesses: [{ connected: true }] };
const commit = (parents: number) => ({
  status: 'available',
  rows: [
    { kind: 'commit', objectIdentity: 'c1', parentIdentities: Array.from({ length: parents }, (_, i) => `p${i}`) },
  ],
});

const BASE = {
  screen: 'review',
  homeMode: 'launcher',
  focus: 'diff',
  codeOnly: false,
  fileScope: 'changed',
  wrapDiffLines: true,
  comparisonMode: 'commit',
  review: review(),
};

const CASES: Record<string, Record<string, unknown>> = {
  locked: { pending: { phase: 'result-unavailable' } },
  'saving submit': { editor: { body: 'x', inspectionRequest: { purpose: 'submit' } } },
  'saving pending': { pending: { phase: 'committing' }, editor: { body: 'x' } },
  'gate with preview': { messageCommitGate: {}, messagePreview: {} },
  gate: { messageCommitGate: {} },
  preview: { messagePreview: {} },
  'preview preparing': { editor: { body: '', inspectionRequest: { purpose: 'preview' } } },
  'composer reselect': { editor: { body: 'x', reselectionRequired: true }, harnessConnection: connected },
  'composer discard armed': { editor: { body: 'x', discardArmed: true }, harnessConnection: connected },
  'composer discard armed, no agent': { editor: { body: 'x', discardArmed: true } },
  'composer empty': { editor: { body: '' }, harnessConnection: connected },
  'composer empty, no agent': { editor: { body: '' } },
  'composer typed': { editor: { body: 'x' }, harnessConnection: connected },
  'key list': { actionLookupOpen: true },
  'jump files': { jumpList: { kind: 'files', filtering: false } },
  'jump messages': { jumpList: { kind: 'messages', filtering: false } },
  'jump filtering': { jumpList: { kind: 'files', filtering: true } },
  'basis picker': { basisPicker: {} },
  configuration: { configurationWindow: {} },
  search: { search: {} },
  'continuation choice': { continuationChoice: {} },
  'comparison search input': { screen: 'home', homeMode: 'comparison', comparisonInput: { kind: 'message-search' } },
  'comparison count input': { screen: 'home', homeMode: 'comparison', comparisonInput: { kind: 'count' } },
  'comparison ref input, commit': { screen: 'home', homeMode: 'comparison', comparisonInput: { kind: 'reference' } },
  'comparison ref input, range': {
    screen: 'home',
    homeMode: 'comparison',
    comparisonMode: 'range',
    comparisonInput: { kind: 'reference' },
  },
  'historical dialog': { historicalDialog: {} },
  'home launcher': { screen: 'home', homeMode: 'launcher' },
  'comparison, no preview': { screen: 'home', homeMode: 'comparison' },
  'comparison, preview': { screen: 'home', homeMode: 'comparison', comparisonPreview: { status: 'available' } },
  'comparison, merge selected': {
    screen: 'home',
    homeMode: 'comparison',
    commitGraph: commit(2),
    selectedCommitIdentity: 'c1',
    comparisonPreview: { status: 'available' },
  },
  'comparison, merge in range mode': {
    screen: 'home',
    homeMode: 'comparison',
    comparisonMode: 'range',
    commitGraph: commit(2),
    selectedCommitIdentity: 'c1',
  },
  'previous reviews': { screen: 'home', homeMode: 'history' },
  loading: { screen: 'loading' },
  failed: { screen: 'failed' },
  'past step, diff': { shownStep: {} },
  'past step, questions, code only': { shownStep: {}, focus: 'questions', codeOnly: true },
  'past step, files': { shownStep: {}, focus: 'files' },
  'review, diff': {},
  'review, diff clipped': { wrapDiffLines: false },
  'review, files': { focus: 'files' },
  'review, questions': { focus: 'questions' },
  'review, code only': { codeOnly: true },
  'review, nothing listed': { review: review({ manifest: { manifest: { files: [] } } }) },
  'review, nothing listed, all files': { fileScope: 'all', review: review({ manifest: { manifest: { files: [] } } }) },
  'comparison review, versions': { review: review({ source: { kind: 'snapshot' }, history: undefined }) },
  'review, continuation available': { review: review({ continuation: { status: 'available' } }) },
};

function render(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, overrides] of Object.entries(CASES)) {
    const state = { ...BASE, ...overrides } as unknown as ReviewingApplicationState;
    out[name] = {
      keysRow: Object.fromEntries(WIDTHS.map(width => [width, reviewingKeysRow(state, width)])),
      sentence: reviewingFooterSentence(state) ?? null,
      keyList: reviewingKeyList(state).map(item => `${item.group} ${item.key} · ${item.label}`),
    };
  }
  return out;
}

describe('the Reviewing key table', () => {
  it('draws every mode’s keys row, sentence and `?` list exactly as recorded', async () => {
    const actual = render();
    if (process.env.RECORD_REVIEWING_KEYS === '1') {
      await writeFile(GOLDEN, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(actual).toEqual(JSON.parse(await readFile(GOLDEN, 'utf8')));
  });

  it('refuses a footer key its `?` list does not explain, and a footer of more than four keys', () => {
    const bindings = { a: { show: 'a' }, b: { show: 'b' }, c: { show: 'c' }, d: { show: 'd' }, e: { show: 'e' } };
    const key = (id: keyof typeof bindings) => ({ id, label: id });
    expect(() =>
      defineKeyTable({
        bindings,
        footer: { main: { typing: false, keys: [key('a'), key('b')] } },
        help: { main: { keys: [{ ...key('a'), group: 'OPEN' as const }] } },
        helpFor: { main: 'main' },
      }),
    ).toThrow('Footer mode main shows b, which its key list does not explain');
    expect(() =>
      defineKeyTable({
        bindings,
        footer: { main: { typing: true, keys: [key('a'), key('b'), key('c'), key('d'), key('e')] } },
        help: {},
        helpFor: {},
      }),
    ).toThrow('Footer mode main shows more than 4 keys');
  });

  it('shows only keys that act: every key in a footer or `?` list has an action', () => {
    const shown = [
      ...Object.values(REVIEWING_KEYS.footer)
        .filter(mode => !mode.typing)
        .flatMap(mode => mode.keys.map(placement => placement.id)),
      ...Object.values(REVIEWING_KEYS.help).flatMap(mode =>
        mode.keys.flatMap(placement => [placement.id, ...(placement.alsoCovers ?? [])]),
      ),
    ];
    // Esc belongs to the shell: it closes what is open, then the screen's own Esc runs.
    const silent = [...new Set(shown)].filter(id => id !== 'esc' && !REVIEWING_ACTED_KEYS.has(id));
    expect(silent).toEqual([]);
  });
});
