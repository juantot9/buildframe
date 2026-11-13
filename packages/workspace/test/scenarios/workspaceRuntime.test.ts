import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { openWorkspaceRuntimeOwner, type WorkspaceRuntimeOwner } from '../../src/runtime.js';

const execFileAsync = promisify(execFile);

async function git(directory: string, ...arguments_: string[]): Promise<void> {
  await execFileAsync(await resolveGitExecutable(), ['-C', directory, ...arguments_]);
}

describe('runtime-owned Workspace lifetime', () => {
  const owners = new Set<WorkspaceRuntimeOwner>();
  const roots = new Set<string>();
  const originalStateHome = process.env.XDG_STATE_HOME;

  afterEach(async () => {
    await Promise.all([...owners].map(async owner => owner.dispose().catch(() => undefined)));
    owners.clear();
    if (originalStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = originalStateHome;
    await Promise.all([...roots].map(async root => rm(root, { recursive: true, force: true })));
    roots.clear();
  });

  it('reports ready only after one writer lease is held and releases it on disposal', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'buildframe-runtime-owner-'));
    roots.add(root);
    const checkout = path.join(root, 'checkout');
    const state = path.join(root, 'state');
    await mkdir(checkout, { recursive: true });
    await mkdir(state, { recursive: true });
    await git(checkout, 'init', '-q');
    process.env.XDG_STATE_HOME = state;

    const first = await openWorkspaceRuntimeOwner({ startPath: checkout });
    expect(first.status).toBe('ready');
    if (first.status !== 'ready') return;
    owners.add(first.owner);

    const identity = await first.owner.workspace.read({
      kind: 'workspace.identity',
    });
    expect(first.owner.workspaceIdentity).toBe(identity.workspaceIdentity);

    await expect(openWorkspaceRuntimeOwner({ startPath: checkout })).resolves.toEqual({
      status: 'rejected',
      diagnostic: { code: 'runtime-writer-unavailable' },
    });

    await first.owner.dispose();
    owners.delete(first.owner);

    const replacement = await openWorkspaceRuntimeOwner({ startPath: checkout });
    expect(replacement.status).toBe('ready');
    if (replacement.status === 'ready') {
      owners.add(replacement.owner);
      expect(replacement.owner.workspaceIdentity).toBe(identity.workspaceIdentity);
    }
  });
});
