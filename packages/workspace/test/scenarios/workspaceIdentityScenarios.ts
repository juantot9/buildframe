import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { expect, vi } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { bootstrapWorkspace, type Workspace, type WorkspaceIdentityView } from '../../src/index.js';

export const execFileAsync = promisify(execFile);
const fixtures: string[] = [];
const originalXdgStateHome = process.env.XDG_STATE_HOME;
const originalHome = process.env.HOME;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

export async function runGit(cwd: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync(await resolveGitExecutable(), ['-C', cwd, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
  });
  return result.stdout.trimEnd();
}

export async function createFixture(): Promise<{
  readonly root: string;
  readonly stateHome: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-workspace-p04-'));
  fixtures.push(root);
  const stateHome = path.join(root, 'user-state');
  process.env.XDG_STATE_HOME = stateHome;
  return { root, stateHome };
}

export async function createRepository(repository: string): Promise<void> {
  await mkdir(repository, { recursive: true });
  await runGit(repository, 'init', '--initial-branch=main');
  await runGit(repository, 'config', 'user.name', 'BuildFrame Test');
  await runGit(repository, 'config', 'user.email', 'neoflow@example.invalid');
  await writeFile(path.join(repository, 'README.md'), 'workspace identity\n');
  await runGit(repository, 'add', 'README.md');
  await runGit(repository, 'commit', '-m', 'initial');
}

export async function readyWorkspace(startPath: string): Promise<{
  readonly workspace: Workspace;
  readonly view: WorkspaceIdentityView;
}> {
  const result = await bootstrapWorkspace({ startPath });
  if (result.status !== 'ready') {
    throw new Error(`Workspace rejected: ${JSON.stringify(result.diagnostic)}`);
  }
  expect(result.status).toBe('ready');

  const view = await result.workspace.read({ kind: 'workspace.identity' });
  return { workspace: result.workspace, view };
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function commandMarker(
  root: string,
  name: string,
): Promise<{ readonly command: string; readonly marker: string }> {
  const marker = path.join(root, `${name}.marker`);
  const command = path.join(root, `${name}.sh`);
  await writeFile(command, `#!/bin/sh\nprintf executed >> ${JSON.stringify(marker)}\nexit 0\n`, { mode: 0o700 });
  return { command, marker };
}

export function permissions(mode: number): number {
  return mode & 0o777;
}

/** Restores the environment and removes every fixture; each identity test file runs it after each test. */
export async function restoreIdentityFixtures(): Promise<void> {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (originalXdgStateHome === undefined) {
    delete process.env.XDG_STATE_HOME;
  } else {
    process.env.XDG_STATE_HOME = originalXdgStateHome;
  }
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  await Promise.all(fixtures.splice(0).map(fixture => rm(fixture, { recursive: true, force: true })));
}
