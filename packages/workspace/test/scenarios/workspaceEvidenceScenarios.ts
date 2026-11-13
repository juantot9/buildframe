import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, expect } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { bootstrapWorkspace, type Workspace, type WorkspaceIdentity } from '../../src/index.js';
import type { CurrentChangedFile, CurrentChangesCaptureView } from '@buildframe/workspace/workspace-evidence';

export const execFileAsync = promisify(execFile);
const roots = new Set<string>();
const originalStateHome = process.env.XDG_STATE_HOME;
const originalHome = process.env.HOME;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

export async function git(checkout: string, ...arguments_: string[]): Promise<string> {
  const { stdout } = await execFileAsync(await resolveGitExecutable(), arguments_, {
    cwd: checkout,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      LANG: 'C',
      LC_ALL: 'C',
    },
  });
  return stdout;
}

export async function gitWithInput(checkout: string, arguments_: readonly string[], input: Buffer): Promise<Buffer> {
  return await new Promise<Buffer>(async (resolve, reject) => {
    const child = spawn(await resolveGitExecutable(), [...arguments_], {
      cwd: checkout,
      env: {
        ...process.env,
        GIT_PAGER: 'cat',
        GIT_TERMINAL_PROMPT: '0',
        LANG: 'C',
        LC_ALL: 'C',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(Buffer.concat(stderr).toString('utf8')));
    });
    child.stdin.end(input);
  });
}

export async function createCheckout(options: { readonly commit?: boolean } = {}): Promise<{
  readonly root: string;
  readonly checkout: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'buildframe-evidence-'));
  roots.add(root);
  const checkout = path.join(root, 'checkout');
  const state = path.join(root, 'state');
  await mkdir(checkout, { recursive: true });
  await mkdir(state, { recursive: true });
  process.env.XDG_STATE_HOME = state;
  await git(checkout, 'init', '-q');
  await git(checkout, 'config', 'user.name', 'BuildFrame Evidence Test');
  await git(checkout, 'config', 'user.email', 'evidence@example.invalid');
  if (options.commit === true) {
    await writeFile(path.join(checkout, '.gitignore'), 'ignored.txt\n');
    await git(checkout, 'add', '.gitignore');
    await git(checkout, 'commit', '-qm', 'initial');
  }
  return { root, checkout };
}

export async function openWorkspace(checkout: string): Promise<{
  readonly workspace: Workspace;
  readonly workspaceIdentity: WorkspaceIdentity;
  readonly canonicalCheckout: string;
}> {
  const opened = await bootstrapWorkspace({ startPath: checkout });
  if (opened.status !== 'ready') {
    throw new Error(`Workspace rejected: ${JSON.stringify(opened.diagnostic)}`);
  }
  const identity = await opened.workspace.read({ kind: 'workspace.identity' });
  return {
    workspace: opened.workspace,
    workspaceIdentity: identity.workspaceIdentity,
    canonicalCheckout: identity.canonicalCheckout,
  };
}

export async function capture(workspace: Workspace): Promise<CurrentChangesCaptureView> {
  return await workspace.read({ kind: 'workspace.current-changes.capture' });
}

/**
 * Git processes started before the directory was hidden can recreate files
 * under the original path; clear anything there before restoring the hidden
 * directory, or the rename fails with ENOTEMPTY under CI load.
 */
export async function restoreGitDirectory(hiddenGitDirectory: string, gitDirectory: string): Promise<void> {
  await rm(gitDirectory, { recursive: true, force: true });
  await rename(hiddenGitDirectory, gitDirectory);
}

export async function completeManifest(
  workspace: Workspace,
  evidenceIdentity: string,
  window = 64,
): Promise<readonly CurrentChangedFile[]> {
  const files: CurrentChangedFile[] = [];
  let offset = 0;
  while (true) {
    const view = await workspace.read({
      kind: 'workspace.current-changes.manifest',
      evidenceIdentity,
      offset,
      limit: window,
    });
    expect(view.status).toBe('available');
    if (view.status !== 'available') return files;
    files.push(...view.files);
    if (view.nextOffset === null) return files;
    offset = view.nextOffset;
  }
}

export function fileAt(files: readonly CurrentChangedFile[], displayPath: string): CurrentChangedFile {
  const found = files.find(
    file => file.newSide?.path.display === displayPath || file.oldSide?.path.display === displayPath,
  );
  if (found === undefined) throw new Error(`Missing manifest file: ${displayPath}`);
  return found;
}

export async function capturedText(
  workspace: Workspace,
  evidenceIdentity: string,
  file: CurrentChangedFile,
  side: 'old' | 'new',
): Promise<string> {
  const view = await workspace.read({
    kind: 'workspace.current-changes.content',
    evidenceIdentity,
    fileIdentity: file.fileIdentity,
    side,
    offset: 0,
    length: 256 * 1024,
  });
  expect(view.status).toBe('available');
  if (view.status !== 'available') return '';
  return Buffer.from(view.bytesBase64, 'base64').toString('utf8');
}

export function installWorkspaceEvidenceHygiene(): void {
  afterEach(async () => {
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });
}
