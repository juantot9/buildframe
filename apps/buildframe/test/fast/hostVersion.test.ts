import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { windowsHostVersionInvocation } from '../../src/hostVersion.js';

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'buildframe-host-version-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe.runIf(process.platform === 'win32')('asking a Windows host for its version', () => {
  const shell = process.env.ComSpec ?? 'cmd.exe';

  it('runs a .cmd shim, as npm, pnpm and Pi install hosts, through cmd.exe', async () => {
    // A directory name with a space, like `C:\Program Files`.
    const bin = path.join(scratch, 'npm prefix');
    await mkdir(bin);
    await writeFile(path.join(bin, 'pi.cmd'), '@ECHO off\r\necho 1.5.0\r\n');

    const invocation = await windowsHostVersionInvocation('pi', bin, shell);
    expect(invocation).toMatchObject({ file: shell, verbatim: true });
    const { stdout } = await promisify(execFile)(invocation!.file, [...invocation!.args], {
      windowsVerbatimArguments: true,
    });
    expect(stdout.trim()).toBe('1.5.0');
  });

  it('prefers a real executable, and takes the first directory on PATH that has one', async () => {
    const first = path.join(scratch, 'first');
    const second = path.join(scratch, 'second');
    await mkdir(first);
    await mkdir(second);
    await writeFile(path.join(first, 'claude.cmd'), '@echo shim\r\n');
    await writeFile(path.join(first, 'claude.exe'), '');
    await writeFile(path.join(second, 'claude.exe'), '');

    await expect(
      windowsHostVersionInvocation('claude', ['', 'relative', first, second].join(';'), shell),
    ).resolves.toEqual({ file: path.join(first, 'claude.exe'), args: ['--version'], verbatim: false });
  });

  it('finds nothing when the host is not on PATH', async () => {
    await expect(windowsHostVersionInvocation('opencode', scratch, shell)).resolves.toBeUndefined();
  });
});
