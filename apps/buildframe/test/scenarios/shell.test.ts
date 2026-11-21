import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import type { ClipboardService } from '@opentui/core';
import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import type { WorkspaceHomeView } from '@buildframe/workspace/projection';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../../../packages/workspace/src/gitProcess.js';
import { Key } from '../../src/reviewingInput.js';
import { label } from '../../src/shellLook.js';
import { createShell, type Shell } from '../../src/shell.js';
import { defineScreen } from '../../src/shellScreen.js';
import {
  createEphemeralUserConfiguration,
  type ReviewingPreferences,
  type UserConfiguration,
} from '../../src/userConfiguration.js';

/**
 * The shell end to end on a real Workspace: a small two-screen app reads
 * Home, starts a Review with a command, sees Home change without asking,
 * copies, opens a second screen and comes back, shows `?`, and quits.
 */

const execFileAsync = promisify(execFile);

interface SummaryState {
  home: WorkspaceHomeView | undefined;
  starting: boolean;
  offset: number;
}

const summary = defineScreen<SummaryState, 'idle' | 'reviewing'>({
  name: 'summary',
  open: () => ({ home: undefined, starting: false, offset: 0 }),
  title: () => 'Summary',
  mode: state => (state.home?.currentReview === undefined ? 'idle' : 'reviewing'),
  modes: { idle: { sentence: 'No Review yet.' }, reviewing: { sentence: 'A Review is open.' } },
  keys: [
    {
      id: 'start',
      keys: ['s'],
      show: 's',
      label: 'start',
      help: { group: 'OPEN', text: 'Start a Review of current changes' },
      modes: ['idle'],
      waits: state => state.home === undefined,
      blocked: state => (state.starting ? 'Already starting.' : undefined),
      run: state => {
        state.starting = true;
        return [
          {
            type: 'execute',
            command: {
              kind: 'review.current-changes.start',
              commandIdentity: 'shell-test-start',
              expectedStateVersion: state.home!.stateVersion,
            },
          },
        ];
      },
    },
    {
      id: 'copy',
      keys: ['y'],
      show: 'y',
      label: 'copy',
      help: { group: 'WORKSPACE', text: 'Copy the count' },
      run: state => [{ type: 'copy', text: String(state.home?.header.totalReviews ?? 0), what: 'the count' }],
    },
    {
      id: 'next',
      keys: ['n'],
      show: 'n',
      help: { group: 'MOVE', text: 'Next page' },
      run: state => {
        state.offset += 1;
      },
    },
    {
      id: 'details',
      keys: [Key.enter],
      show: 'Enter',
      label: 'details',
      help: { group: 'OPEN', text: 'Open the details' },
      run: () => [{ type: 'open', screen: 'details', args: 'from summary' }],
    },
  ],
  body: (state, look) => [
    label(
      look,
      state.home === undefined
        ? 'Reading…'
        : `Reviews: ${state.home.header.totalReviews} · page ${state.home.reviews.offset + 1}`,
    ),
  ],
  views: state => ({ home: { kind: 'workspace.home', offset: state.offset, limit: 1 } }),
  receive: (state, views) => {
    state.home = views.home as WorkspaceHomeView;
  },
  checks: () => ['Start a Review: ready'],
  settled: (state, _command, outcome) => {
    state.starting = false;
    if (outcome.status !== 'answered') return [];
    state.offset = 1;
    return [{ type: 'say', text: 'Started.', tone: 'success' }];
  },
});

const details = defineScreen<{ readonly from: string }, 'main'>({
  name: 'details',
  open: args => ({ from: String(args) }),
  title: () => 'Details',
  mode: () => 'main',
  modes: { main: { escape: 'Back to the summary' } },
  keys: [],
  body: (state, look) => [label(look, `Opened ${state.from}`)],
});

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

/** A clipboard that records what was copied and reports it written. */
const copied: string[] = [];
const recordingClipboard = (): ClipboardService =>
  ({
    writeText: async (text: string) => {
      copied.push(text);
      return { host: { status: 'written' }, terminal: { status: 'skipped' } };
    },
    dispose: async () => undefined,
  }) as unknown as ClipboardService;

describe('the shell', () => {
  const cleanups: (() => Promise<void>)[] = [];
  const originalStateHome = process.env.XDG_STATE_HOME;

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
  });

  async function openWorkspace(): Promise<WorkspaceRuntimeOwner> {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-shell-'));
    cleanups.push(async () => await rm(root, { recursive: true, force: true }));
    const checkout = path.join(root, 'checkout');
    await mkdir(checkout, { recursive: true });
    await mkdir(path.join(root, 'state'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'test@buildframe.invalid');
    await writeFile(path.join(checkout, 'a.txt'), 'old\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'basis');
    await writeFile(path.join(checkout, 'a.txt'), 'new\n');
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error('Workspace owner was rejected');
    cleanups.push(async () => await opened.owner.dispose());
    return opened.owner;
  }

  async function startShell(
    owner: WorkspaceRuntimeOwner,
    userConfiguration: UserConfiguration,
  ): Promise<{ shell: Shell; terminal: TestRendererSetup }> {
    const terminal = await createTestRenderer({ width: 80, height: 12, exitOnCtrlC: false, kittyKeyboard: true });
    const shell = createShell({
      workspace: owner.workspace,
      screens: [summary, details],
      first: { screen: 'summary' },
      renderer: terminal.renderer,
      createClipboard: recordingClipboard,
      userConfiguration,
    });
    cleanups.push(async () => await shell.stop());
    await shell.start();
    return { shell, terminal };
  }

  const frame = (terminal: TestRendererSetup): string => {
    try {
      return terminal.captureCharFrame();
    } catch {
      return '';
    }
  };
  const shows = async (terminal: TestRendererSetup, text: string): Promise<void> =>
    await waitFor(() => frame(terminal).includes(text), `"${text}" on screen`);

  it('runs a screen: reads its views, runs its commands, follows the Workspace, and quits', async () => {
    const owner = await openWorkspace();
    const saved: ReviewingPreferences[] = [];
    const ephemeral = createEphemeralUserConfiguration();
    const configuration: UserConfiguration = {
      load: async () => await ephemeral.load(),
      saveReviewingPreferences: async preferences => {
        saved.push(preferences);
        return { status: 'saved' };
      },
      readMessageTemplate: async () => await ephemeral.readMessageTemplate(),
    };
    const { shell, terminal } = await startShell(owner, configuration);

    await shows(terminal, 'Reviews: 0');
    expect(frame(terminal)).toContain('BuildFrame / Summary');
    await shows(terminal, 'No Review yet.');
    expect(frame(terminal)).toContain('[s] start  [y] copy  [Enter] details');

    // The command runs, and Home changes on its own: the shell re-reads it.
    terminal.mockInput.pressKey('s');
    await shows(terminal, 'Started.');
    await shows(terminal, 'Reviews: 1 · page 2');
    expect(frame(terminal)).not.toContain('[s] start');

    // Changing the requested page doesn't change Workspace State, but still reads the new scope.
    terminal.mockInput.pressKey('n');
    await shows(terminal, 'Reviews: 1 · page 3');

    terminal.mockInput.pressKey('y');
    await shows(terminal, '✓ Copied the count.');
    expect(copied).toEqual(['1']);

    terminal.mockInput.pressKey('?');
    await shows(terminal, 'KEYS');
    expect(frame(terminal)).toContain('[Enter] Open the details');
    terminal.mockInput.pressEscape();
    await waitFor(() => !frame(terminal).includes('KEYS'), 'the key list to close');

    // Configuration is the shell's: the theme and background, saved as they change.
    terminal.mockInput.pressKey('c');
    await shows(terminal, 'Configuration');
    expect(frame(terminal)).toContain('Background     <  Theme  >');
    terminal.mockInput.pressKey('j');
    terminal.mockInput.pressKey('l');
    await shows(terminal, 'Background     <  Terminal  >');
    terminal.mockInput.pressEscape();
    await shows(terminal, 'Settings saved.');

    // `!` shows the screen's action checks; `!` again closes them.
    terminal.mockInput.pressKey('!');
    await shows(terminal, 'Start a Review: ready');
    terminal.mockInput.pressKey('!');
    await waitFor(() => !frame(terminal).includes('Start a Review: ready'), 'the checks to close');

    terminal.mockInput.pressEnter();
    await shows(terminal, 'Opened from summary');
    expect(frame(terminal)).toContain('BuildFrame / Details');
    terminal.mockInput.pressEscape();
    await shows(terminal, 'BuildFrame / Summary');
    await shows(terminal, 'Reviews: 1');

    terminal.mockInput.pressKey('q');
    await shell.closed;
    expect(saved.at(-1)?.background).toBe('terminal');
  });
});
