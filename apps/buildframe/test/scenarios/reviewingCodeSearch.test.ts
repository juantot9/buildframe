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
 * `/` has four scopes. From the Diff it looks in the open file; Enter selects
 * the match's line, n and N move between matches, and `:` and a number goes
 * to a line. Code finds any text in any file and opens it at its line, in the
 * Diff, even in a folder All files never loaded.
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

describe('searching this file, the changes, files and code', () => {
  const cleanups: (() => Promise<void>)[] = [];
  const stateHome = process.env.XDG_STATE_HOME;
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => undefined);
    if (stateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = stateHome;
  });

  it('finds text in the open file and any file, and moves to its line', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-code-search-'));
    cleanups.push(async () => await rm(root, { recursive: true, force: true }));
    const checkout = path.join(root, 'checkout');
    await mkdir(path.join(checkout, 'lib/deep'), { recursive: true });
    process.env.XDG_STATE_HOME = path.join(root, 'state');
    await git(checkout, 'init', '-q');
    await git(checkout, 'config', 'user.name', 'BuildFrame Test');
    await git(checkout, 'config', 'user.email', 'user-5@masked.invalid');
    const numbered = (word: string) =>
      Array.from({ length: 30 }, (_, index) => `line ${index + 1}${index % 10 === 4 ? ` ${word}` : ''}`).join('\n');
    await writeFile(path.join(checkout, 'main.ts'), `${numbered('alpha')}\n`);
    await writeFile(path.join(checkout, 'lib/deep/far.ts'), `${numbered('rare')}\n`);
    await git(checkout, 'add', '.');
    await git(checkout, 'commit', '-qm', 'basis');
    await writeFile(path.join(checkout, 'main.ts'), `${numbered('alpha')}\nline 31 changed\n`);
    const opened = await openWorkspaceRuntimeOwner({ startPath: checkout });
    if (opened.status !== 'ready') throw new Error('Workspace owner was rejected');
    cleanups.push(async () => await opened.owner.dispose());

    const terminal: TestRendererSetup = await createTestRenderer({ width: 140, height: 34, kittyKeyboard: true });
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
    const shows = async (text: string | RegExp): Promise<void> =>
      await waitFor(() => (typeof text === 'string' ? frame().includes(text) : text.test(frame())), `"${text}"`).catch(
        (error: Error) => {
          throw new Error(`${error.message}\n${frame()}`);
        },
      );
    const type = (text: string): void => {
      for (const character of text) terminal.mockInput.pressKey(character);
    };
    await application.start();
    await shows('Review current changes');
    terminal.mockInput.pressEnter();
    await shows('Diff FOCUSED');

    // From the Diff, / looks in the open file. Unchanged rows show both line numbers.
    type('/');
    await shows('● This file');
    type('alpha');
    await shows('3 matches · code now');
    expect(frame()).toContain('5  line 5 alpha');
    terminal.mockInput.pressEnter();
    await shows(/▌\s+5\s+5\s+line 5 alpha/u);
    // n and N move between the matches without the dialog.
    type('n');
    await shows(/▌\s+15\s+15\s+line 15 alpha/u);
    type('N');
    await shows(/▌\s+5\s+5\s+line 5 alpha/u);
    // : and a number goes to that line.
    type(':');
    await shows('● This file');
    type('22');
    await shows('Enter goes to line 22.');
    terminal.mockInput.pressEnter();
    await shows(/▌\s+22\s+22\s+line 22/u);

    // Code finds text in any file; Enter opens it at its line, in the Diff,
    // loading the folders All files hasn't opened.
    type('/');
    await shows('● This file');
    terminal.mockInput.pressTab();
    terminal.mockInput.pressTab();
    terminal.mockInput.pressTab();
    await shows('● Code');
    type('rare');
    await shows('3 matches · code now');
    expect(frame()).toContain('lib/deep/far.ts:5  line 5 rare');
    terminal.mockInput.pressKey('ARROW_DOWN');
    terminal.mockInput.pressEnter();
    await shows('lib/deep/far.ts is unchanged versus this basis.');
    await shows(/▌\s+15\s+line 15 rare/u);
    expect(frame()).toContain('Diff FOCUSED');

    terminal.mockInput.pressKey('q');
    await application.closed;
  });
});
