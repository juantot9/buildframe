import { expect, mock, test } from 'claude-code/testing';

const TEXT = 'Please explain this change.\n\n  café 👋\r\nreview.ts:17';

interface Harness {
  readonly launches: { argv: string[]; stdin: string }[];
  readonly facts: Record<string, unknown>[];
  readonly prompts: { text: string; origin: unknown }[];
  readonly commands: unknown[][];
  /** Every line set under the prompt, `undefined` for a cleared one. */
  readonly statuses: (string | undefined)[];
  /** How long the helper takes to answer a `/facts` post. */
  factDelayMs: number;
}

/** Stubs Claude Code's side and a scripted helper that hands out `commands` one poll at a time. */
function stub(on: any, clock: any, commands: unknown[][]): Harness {
  const harness: Harness = { launches: [], facts: [], prompts: [], commands, statuses: [], factDelayMs: 0 };
  on('session.start', () => ({ cwd: '/work/repo' }));
  on('command.register', () => ({ value: undefined }));
  on('ui.toast', () => ({ value: undefined }));
  on('ui.status', ($: any, e: any) => {
    harness.statuses.push(e.text);
    return { value: undefined };
  });
  on('ui.invalidate', () => ({ value: undefined }));
  on('session.id', () => ({ value: 'session-1' }));
  on('session.cwd', () => ({ value: '/work/repo' }));
  on('session.version', () => ({ value: { version: '2.1.310', base: '2.1.310' } }));
  on('process.run', ($: any, e: any) => {
    harness.launches.push({ argv: e.argv, stdin: e.init.stdin });
    const outcome = {
      status: 'connected',
      port: 41234,
      token: 'f'.repeat(64),
      label: 'connected',
      light: '● BuildFrame',
      tone: 'success',
    };
    return { value: { exitCode: 0, stdout: JSON.stringify(outcome) + '\n', stderr: '' } };
  });
  on('http.fetch', async ($: any, e: any) => {
    const body = JSON.parse(e.init.body);
    if (e.url.endsWith('/facts')) {
      if (harness.factDelayMs > 0) await clock.sleep(harness.factDelayMs);
      harness.facts.push(...body.facts);
      return { value: { status: 200, ok: true, headers: {}, text: '{}' } };
    }
    if (e.url.endsWith('/next')) {
      // Hold the poll open, as the helper does, until the test queues commands.
      while (harness.commands.length === 0) await clock.sleep(10);
      const next = harness.commands.shift();
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ commands: next }) } };
    }
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } };
  });
  // Core: record what reaches it and let it enter unchanged. A plugin's
  // submission resolves only once its turn has started, after `turn.start`.
  on('prompt.submit', async ($: any, e: any) => {
    harness.prompts.push({ text: e.text, origin: e.origin });
    if (e.origin?.kind === 'plugin') await clock.sleep(100);
    return { text: e.text };
  });
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }));
  on('turn.complete', () => ({ text: '' }));
  on('session.end', ($: any, e: any) => ({ sessionId: e.sessionId }));
  return harness;
}

async function attach($: any, clock: any): Promise<void> {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' });
  await $.command.run({ command: 'buildframe', args: '' });
  await clock.settle();
}

test('attaches through the helper and submits the exact Message as the user', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, [[{ type: 'submit', dispatchId: 'cdd_1', text: TEXT }]]);
  await attach($, clock);

  expect(harness.launches).toHaveLength(1);
  expect(harness.launches[0]?.argv[0]).toBe('node');
  expect(harness.launches[0]?.argv[1]).toMatch(/\/helper\/launch\.js$/);
  expect(JSON.parse(harness.launches[0]?.stdin ?? '')).toEqual({
    protocolVersion: 1,
    sessionId: 'session-1',
    cwd: '/work/repo',
    hostVersion: '2.1.310',
  });
  expect(harness.prompts.map(prompt => prompt.text)).toEqual([TEXT]);

  await $.turn.start({ text: TEXT, turnId: 'turn-1' });
  await clock.advance(100);
  await $.turn.complete({ turnId: 'turn-1', answer: 'Explained.', durationMs: 5, isAborted: false, reason: 'answer' });
  await $.turn.start({ text: 'my own question', turnId: 'turn-2' });
  await $.turn.complete({ turnId: 'turn-2', answer: 'user turn', durationMs: 5, isAborted: false, reason: 'answer' });
  await clock.settle();
  expect(harness.facts).toEqual([
    { type: 'submit-called', dispatchId: 'cdd_1' },
    { type: 'turn-start', turnId: 'turn-1', matchesPending: true },
    { type: 'submit-resolved', dispatchId: 'cdd_1', entered: true },
    { type: 'turn-complete', turnId: 'turn-1', reason: 'answer', answer: 'Explained.' },
    { type: 'turn-start', turnId: 'turn-2', matchesPending: false },
    { type: 'turn-complete', turnId: 'turn-2', reason: 'answer' },
  ]);
  // Only the answer to the Mod's own Message crosses: never prompt text or a user turn's answer.
  expect(JSON.stringify(harness.facts)).not.toContain('café');
  expect(JSON.stringify(harness.facts)).not.toContain('user turn');
});

test('returns the answer of its own turn when its turn.start is not heard', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, [[{ type: 'submit', dispatchId: 'cdd_3', text: TEXT }]]);
  await attach($, clock);
  await clock.advance(100);
  await clock.settle();
  await $.turn.complete({ turnId: 'turn-7', answer: 'Answered.', durationMs: 5, isAborted: false, reason: 'answer' });
  await clock.settle();
  expect(harness.facts.at(-1)).toEqual({
    type: 'turn-complete',
    turnId: 'turn-7',
    reason: 'answer',
    answer: 'Answered.',
  });
});

test('refuses a Send while a turn is running instead of queuing it', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, []);
  await attach($, clock);
  await $.turn.start({ text: 'the user is working', turnId: 'user-turn' });
  harness.commands.push([{ type: 'submit', dispatchId: 'cdd_2', text: TEXT }]);
  await clock.advance(10);
  await clock.settle();

  // The user's own composer prompt never passed through the Mod in this test.
  expect(harness.prompts).toEqual([]);
  expect(harness.facts).toContainEqual({ type: 'submit-refused', dispatchId: 'cdd_2' });
});

test('reports another prompt without changing or blocking it', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, []);
  await attach($, clock);
  const entered = await $.prompt.submit({ text: 'typed by the user', origin: { kind: 'composer' }, wait: false });
  await clock.settle();

  expect(entered).toEqual({ text: 'typed by the user' });
  expect(harness.facts).toEqual([{ type: 'foreign-prompt' }]);
});

test('reports the session ending even while another fact post is in flight', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, []);
  await attach($, clock);
  harness.factDelayMs = 500;
  await $.prompt.submit({ text: 'typed by the user', origin: { kind: 'composer' }, wait: false });
  const ending = $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } });
  await clock.advance(1000);
  await ending;
  await clock.settle();

  expect(harness.facts).toContainEqual({ type: 'session-ending' });
});

test('refuses a Send handed to a poll that outlived its session', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, []);
  await attach($, clock);
  await $.session.end({ reason: 'clear', sessionId: 'session-1', resume: { id: 'session-1' } });
  harness.commands.push([{ type: 'submit', dispatchId: 'cdd_9', text: TEXT }]);
  await clock.advance(20);
  await clock.settle();

  expect(harness.prompts).toEqual([]);
  expect(harness.facts).toEqual([{ type: 'session-ending' }, { type: 'submit-refused', dispatchId: 'cdd_9' }]);
});

const BESIDE_PROMPT = {
  plugin: 'buildframe',
  component: 'BesidePrompt',
  surface: 'terminal',
  props: { maxColumns: 40, floatRows: 0, floatColumns: 0, isWorking: false, view: {} },
} as const;

test('shows the connection as a light beside the prompt, and only problems under it', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, []);
  await attach($, clock);
  // Until Claude Code draws the cell, the light stands in under the prompt.
  expect(harness.statuses).toEqual(['● BuildFrame']);

  const ui = await $.ui.mount(BESIDE_PROMPT as any);
  expect((await ui.find({ type: 'Text', text: /BuildFrame/ }))?.text).toBe('● BuildFrame');
  await clock.settle();
  expect(harness.statuses).toEqual(['● BuildFrame', undefined]);
  await ui.unmount();

  harness.commands.push([
    {
      type: 'detach',
      label: 'another session connected to this repository',
      light: '○ BuildFrame',
      tone: 'warning',
      problem: 'moved to another session · /buildframe to take it back',
    },
  ]);
  await clock.advance(20);
  await clock.settle();
  expect(harness.statuses.at(-1)).toBe('moved to another session · /buildframe to take it back');
  const after = await $.ui.mount(BESIDE_PROMPT as any);
  expect((await after.find({ type: 'Text', text: /BuildFrame/ }))?.text).toBe('○ BuildFrame');
  await after.unmount();
});

test('shows a helper from before the light as it did', async ($, on) => {
  const clock = mock.clock(on);
  const harness = stub(on, clock, [[{ type: 'status', label: 'runtime disconnected; retrying' }]]);
  await attach($, clock);
  expect(harness.statuses.at(-1)).toBe('BuildFrame: runtime disconnected; retrying');
});
