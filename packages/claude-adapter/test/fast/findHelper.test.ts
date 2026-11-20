import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type FindInstalledHelper = (searchPath?: string, platform?: NodeJS.Platform) => Promise<string | undefined>;
const { findInstalledHelper } = (await import(new URL('../../plugin/helper/findHelper.js', import.meta.url).href)) as {
  readonly findInstalledHelper: FindInstalledHelper;
};

// The shims as npm (cmd-shim) and pnpm (@zkochan/cmd-shim) write them.
const NPM_CMD = [
  '@ECHO off',
  'GOTO start',
  ':find_dp0',
  'SET dp0=%~dp0',
  'EXIT /b',
  ':start',
  'SETLOCAL',
  'CALL :find_dp0',
  'IF EXIST "%dp0%\\node.exe" (',
  '  SET "_prog=%dp0%\\node.exe"',
  ') ELSE (',
  '  SET "_prog=node"',
  '  SET PATHEXT=%PATHEXT:;.JS;=;%',
  ')',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@buildframe\\cli\\dist\\buildframe-claude-helper.js" %*',
].join('\r\n');
const NPM_SH = [
  '#!/bin/sh',
  'basedir=$(dirname "$(echo "$0" | sed -e \'s,\\\\,/,g\')")',
  'if [ -x "$basedir/node" ]; then',
  '  exec "$basedir/node"  "$basedir/node_modules/@buildframe/cli/dist/buildframe-claude-helper.js" "$@"',
  'else',
  '  exec node  "$basedir/node_modules/@buildframe/cli/dist/buildframe-claude-helper.js" "$@"',
  'fi',
].join('\n');
const PNPM_CMD = [
  '@SETLOCAL',
  '@IF NOT DEFINED NODE_PATH (',
  '  @SET "NODE_PATH=%~dp0\\..\\global\\5\\node_modules"',
  ')',
  '@IF EXIST "%~dp0\\node.exe" (',
  '  "%~dp0\\node.exe"  "%~dp0\\..\\global\\5\\node_modules\\@buildframe\\cli\\dist\\buildframe-claude-helper.js" %*',
  ') ELSE (',
  '  node  "%~dp0\\..\\global\\5\\node_modules\\@buildframe\\cli\\dist\\buildframe-claude-helper.js" %*',
  ')',
].join('\r\n');

let scratch: string;

beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), 'buildframe-find-helper-'));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

async function installed(...parts: string[]): Promise<string> {
  const entry = path.join(scratch, ...parts, '@buildframe', 'cli', 'dist', 'buildframe-claude-helper.js');
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, '#!/usr/bin/env node\n');
  return entry;
}

const searchPath = (...directories: string[]): string => directories.join(path.delimiter);
const platform = process.platform === 'win32' ? 'win32' : 'linux';

describe('the installed Claude helper', () => {
  it.runIf(process.platform === 'win32')('is found behind npm’s Windows command shim', async () => {
    const entry = await installed('npm', 'node_modules');
    await writeFile(path.join(scratch, 'npm', 'buildframe-claude-helper.cmd'), NPM_CMD);

    await expect(findInstalledHelper(searchPath(path.join(scratch, 'npm')), 'win32')).resolves.toBe(entry);
  });

  it.runIf(process.platform === 'win32')('is found behind pnpm’s Windows command shim', async () => {
    const entry = await installed('pnpm', 'global', '5', 'node_modules');
    await mkdir(path.join(scratch, 'pnpm', 'bin'), { recursive: true });
    await writeFile(path.join(scratch, 'pnpm', 'bin', 'buildframe-claude-helper.cmd'), PNPM_CMD);

    await expect(findInstalledHelper(searchPath(path.join(scratch, 'pnpm', 'bin')), 'win32')).resolves.toBe(entry);
  });

  it('is found behind npm’s sh shim, which Git Bash and pnpm on macOS and Linux use', async () => {
    const entry = await installed('npm', 'node_modules');
    await writeFile(path.join(scratch, 'npm', 'buildframe-claude-helper'), NPM_SH);

    await expect(findInstalledHelper(searchPath(path.join(scratch, 'npm')), platform)).resolves.toBe(entry);
  });

  it.skipIf(process.platform === 'win32')('is found through npm’s symlink on macOS and Linux', async () => {
    const entry = await installed('prefix', 'lib', 'node_modules');
    await mkdir(path.join(scratch, 'prefix', 'bin'));
    await symlink(entry, path.join(scratch, 'prefix', 'bin', 'buildframe-claude-helper'));

    await expect(findInstalledHelper(searchPath(path.join(scratch, 'prefix', 'bin')), 'linux')).resolves.toBe(entry);
  });

  it('comes from the first directory on PATH that has it, skipping relative and empty entries', async () => {
    const first = await installed('first', 'node_modules');
    await installed('second', 'node_modules');
    await writeFile(path.join(scratch, 'first', 'buildframe-claude-helper'), NPM_SH);
    await writeFile(path.join(scratch, 'second', 'buildframe-claude-helper'), NPM_SH);

    await expect(
      findInstalledHelper(
        searchPath('', 'relative', path.join(scratch, 'first'), path.join(scratch, 'second')),
        platform,
      ),
    ).resolves.toBe(first);
  });

  it('is not found when the shim names a missing entry, another program, or nothing is installed', async () => {
    await mkdir(path.join(scratch, 'npm'));
    await writeFile(path.join(scratch, 'npm', 'buildframe-claude-helper'), NPM_SH);
    await mkdir(path.join(scratch, 'other'));
    await writeFile(path.join(scratch, 'other', 'buildframe-claude-helper'), 'exec node "$basedir/evil.js"');

    await expect(
      findInstalledHelper(searchPath(path.join(scratch, 'npm'), path.join(scratch, 'other'), scratch), platform),
    ).resolves.toBeUndefined();
  });
});
