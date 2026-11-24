import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { createTestRenderer, type TestRendererSetup } from '@opentui/core/testing';
import { openWorkspaceRuntimeOwner } from '@buildframe/workspace/runtime';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../../../packages/workspace/src/gitProcess.js';
import { createReviewingApplicationForTest } from '../../src/reviewingScreen.js';

/**
 * Every file (f) exists only for live changes. There, / also finds files the
 * changes leave unchanged and opens them, drawn with the Diff's wrapping and
 * layout; on a fixed Review, f says why it can't list every file, and the
 * Files pane never claims "All".
 */

const run = promisify(execFile);
const git = async (checkout: string, ...args: string[]): Promise<void> => {
  await run(await resolveGitExecutable(), ['-C', checkout, ...args]);
};

async function waitFor(predicate: () => boolean, what: string): Promise<void> {
  for (let attempt = 0; attempt < 6_000; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

describe('every file, and searching it', () => {
  const cleanups: (() => Promise<void>)[] = [];
  const stateHome = process.env.XDG_STATE_HOME;
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
    if (stateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = stateHome;
  });

  it('finds and opens an unchanged file with /, and explains f on a fixed Review', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-all-files-'));
    cleanups.push(async () => await rm(root, { recursive: true, force: true }));
    const checkout = path.join(root, 'checkout');
    await mkdir(path.join(checkout, 'src'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'user-8@masked.invalid');
    for (const file of ['src/a.ts', 'src/b.ts', 'src/config.ts', 'README.md']) {
      await writeFile(path.join(checkout, file), 'const value = 1;\n');
    }
    await writeFile(path.join(checkout, 'src/config.ts'), `const value = 1;\n// long ${'x '.repeat(120)}\n`);
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'basis');
    await writeFile(path.join(checkout, 'src/a.ts'), 'const value = 2;\n');
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error('Workspace owner was rejected');
    cleanups.push(async () => await opened.owner.dispose());

    const terminal: TestRendererSetup = await createTestRenderer({
      width: 140,
      height: 30,
      exitOnCtrlC: false,
      kittyKeyboard: true,
    });
    const application = createReviewingApplicationForTest({
      workspace: opened.owner.workspace,
      renderer: terminal.renderer,
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
    const type = (text: string): void => {
      for (const character of text) terminal.mockInput.pressKey(character);
    };
    await application.start();

    await shows('Review current changes');
    terminal.mockInput.pressEnter();
    await shows('1 changed files');
    terminal.mockInput.pressKey('f');
    await shows('4 repository files');

    terminal.mockInput.pressKey('/');
    await shows('Search this Review');
    expect(frame()).toContain('Paths of every file, and added or removed text in the saved Snapshot.');
    type('config');
    await shows('src/config.ts  · unchanged');
    expect(frame()).toContain('1 match ');
    expect(frame()).toContain('Unchanged here; Enter opens the file.');
    terminal.mockInput.pressEnter();
    await shows('src/config.ts is unchanged versus this basis.');
    expect(frame()).toMatch(/›\s+·\s+config\.ts/u);

    // An unchanged file follows w and v like a Diff: long lines wrap until w
    // cuts them, and side by side each line reads the same on both sides.
    expect(frame()).not.toMatch(/x›/u);
    terminal.mockInput.pressKey('w');
    await waitFor(() => /x›/u.test(frame()), 'the long line cut at the edge');
    expect(frame()).toContain('unchanged since last commit');
    terminal.mockInput.pressKey('v');
    await waitFor(() => (frame().match(/const value = 1;/gu) ?? []).length === 2, 'the line on both sides');
    expect(frame()).toContain('Side-by-side');
    terminal.mockInput.pressKey('v');
    await waitFor(() => (frame().match(/const value = 1;/gu) ?? []).length === 1, 'one side again');

    // A Review of a commit is fixed: no list of every file, and the pane says so.
    terminal.mockInput.pressEscape();
    await shows('Review a commit or range');
    terminal.mockInput.pressKey('j');
    terminal.mockInput.pressKey('j');
    terminal.mockInput.pressEnter();
    await shows('Parent  none (first commit)');
    terminal.mockInput.pressEnter();
    await shows('Fixed commits: Messages quote them as saved');
    expect(frame()).toContain('4 changed files');
    expect(frame()).not.toContain('repository files');
    terminal.mockInput.pressKey('f');
    await shows('Only changed files here: every file shows on live changes, in the Current Review.');
    expect(frame()).toContain('4 changed files');

    terminal.mockInput.pressKey('q');
    await application.closed;
  });
});
