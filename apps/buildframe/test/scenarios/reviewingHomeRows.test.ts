import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import type { WorkspaceHomeView } from '@buildframe/workspace/projection';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../../../packages/workspace/src/gitProcess.js';
import { createReviewingApplicationForTest } from '../../src/reviewingScreen.js';
import { label } from '../../src/shellLook.js';
import { defineScreen } from '../../src/shellScreen.js';

/**
 * Reviewing still draws Home (WF-301). A screen that joins it adds its rows
 * there; choosing one opens that screen over Reviewing, and Esc comes back.
 */

const execFileAsync = promisify(execFile);

const notes = defineScreen<undefined, 'main'>({
  name: 'notes',
  open: () => undefined,
  title: () => 'Notes',
  mode: () => 'main',
  modes: { main: { escape: 'Back' } },
  keys: [],
  body: (_state, look) => [label(look, 'The notes screen.')],
  home: {
    views: () => ({ home: { kind: 'workspace.home', offset: 0, limit: 1 } }),
    rows: views => [
      {
        id: 'notes',
        icon: { text: '✎', ascii: '*' },
        label: `Notes (${(views.home as WorkspaceHomeView | undefined)?.header.totalReviews ?? 0} Reviews)`,
        description: 'Notes beside the Review.',
        available: true,
        choose: () => [{ type: 'open', screen: 'notes' }],
      },
    ],
  },
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

describe('Home rows from screens that join Reviewing', () => {
  const cleanups: (() => Promise<void>)[] = [];
  const originalStateHome = process.env.XDG_STATE_HOME;

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
  });

  async function openWorkspace(): Promise<WorkspaceRuntimeOwner> {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-home-rows-'));
    cleanups.push(async () => await rm(root, { recursive: true, force: true }));
    const checkout = path.join(root, 'checkout');
    await mkdir(checkout, { recursive: true });
    await mkdir(path.join(root, 'state'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'test@example.invalid');
    await writeFile(path.join(checkout, 'a.txt'), 'old\n');
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'basis');
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error('Workspace owner was rejected');
    cleanups.push(async () => await opened.owner.dispose());
    return opened.owner;
  }

  it('lists the row after Reviewing’s own choices, opens its screen, and returns on Esc', async () => {
    const owner = await openWorkspace();
    const terminal: TestRendererSetup = await createTestRenderer({
      width: 90,
      height: 24,
      exitOnCtrlC: false,
      kittyKeyboard: true,
    });
    const application = createReviewingApplicationForTest({
      workspace: owner.workspace,
      renderer: terminal.renderer,
      screens: [notes],
    });
    cleanups.push(async () => await application.stop());
    const frame = (): string => {
      try {
        return terminal.captureCharFrame();
      } catch {
        return '';
      }
    };
    const shows = async (text: string): Promise<void> => await waitFor(() => frame().includes(text), `"${text}"`);
    await application.start();

    await shows('Notes (0 Reviews)');
    const rows = frame().split('\n');
    const at = (text: string): number => rows.findIndex(row => row.includes(text));
    expect(at('Review a commit or range')).toBeLessThan(at('Notes (0 Reviews)'));
    expect(frame()).toContain('3 choices');

    // Previous Reviews has none yet, so moving skips it: current changes, commit or range, notes.
    terminal.mockInput.pressKey('j');
    terminal.mockInput.pressKey('j');
    await shows('Notes beside the Review.');
    terminal.mockInput.pressEnter();
    await shows('The notes screen.');
    expect(frame()).toContain('BuildFrame / Notes');

    terminal.mockInput.pressEscape();
    await shows('Notes (0 Reviews)');
    expect(frame()).not.toContain('The notes screen.');

    terminal.mockInput.pressKey('q');
    await application.closed;
  });
});
