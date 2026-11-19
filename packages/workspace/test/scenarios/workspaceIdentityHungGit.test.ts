import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveGitExecutable } from '../../src/gitProcess.js';
import { bootstrapWorkspace } from '../../src/index.js';
import {
  createFixture,
  createRepository,
  execFileAsync,
  restoreIdentityFixtures,
} from './workspaceIdentityScenarios.js';

afterEach(restoreIdentityFixtures);

// The stand-in Git is a shell script and the test pauses with `/bin/sleep`;
// neither exists on Windows, where a failed pause would also skip the PATH
// restore and break every later test in the run.
describe.skipIf(process.platform === 'win32')('Workspace Identity hung Git inspection', () => {
  it('retires hung identity Git inspection at the package-owned deadline', async () => {
    const { root } = await createFixture();
    const repository = path.join(root, 'repository');
    await createRepository(repository);
    const realGit = await resolveGitExecutable();
    const executableDirectory = path.join(root, 'hung-git');
    const executable = path.join(executableDirectory, 'git');
    const pidFile = path.join(root, 'hung-git-pids');
    await mkdir(executableDirectory);
    await writeFile(
      executable,
      [
        '#!/bin/sh',
        'for argument in "$@"; do',
        '  if [ "$argument" = "rev-parse" ]; then',
        `    printf '%s\\n' "$$" >> ${JSON.stringify(pidFile)}`,
        '    exec /bin/sleep 60',
        '  fi',
        'done',
        `exec ${JSON.stringify(realGit)} "$@"`,
        '',
      ].join('\n'),
      { mode: 0o700 },
    );

    const previousPath = process.env.PATH;
    process.env.PATH = executableDirectory;
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let pending: Promise<Awaited<ReturnType<typeof bootstrapWorkspace>>> | undefined;
    let outcome: Awaited<ReturnType<typeof bootstrapWorkspace>> | undefined;
    let rejected: unknown;
    let pids: number[] = [];
    const pauseForProcesses = async (): Promise<void> => {
      await execFileAsync('/bin/sleep', ['0.05']);
    };
    const processIsRunning = (pid: number): boolean => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return (error as NodeJS.ErrnoException).code !== 'ESRCH';
      }
    };
    const killHungProcesses = (): void => {
      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // A process that already exited needs no test cleanup.
        }
      }
    };

    try {
      const isolated = await import('../../src/index.js');
      pending = isolated.bootstrapWorkspace({ startPath: repository });
      void pending.then(
        result => {
          outcome = result;
        },
        (error: unknown) => {
          rejected = error;
        },
      );
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await pauseForProcesses();
        try {
          pids = (await readFile(pidFile, 'utf8'))
            .trim()
            .split('\n')
            .filter(value => value.length > 0)
            .map(Number);
        } catch {
          // The wrapper has not reached repository-aware inspection yet.
        }
        if (pids.length === 3) break;
      }
      const allInspectionChildrenStarted = pids.length === 3;

      await vi.advanceTimersByTimeAsync(30_001);
      for (let attempt = 0; attempt < 20 && outcome === undefined; attempt += 1) {
        await pauseForProcesses();
      }
      const settledByOwner = outcome !== undefined;
      if (!settledByOwner) {
        killHungProcesses();
        for (let attempt = 0; attempt < 20 && outcome === undefined; attempt += 1) {
          await pauseForProcesses();
        }
      }

      expect(allInspectionChildrenStarted).toBe(true);
      expect(rejected).toBeUndefined();
      expect(settledByOwner).toBe(true);
      expect(outcome).toEqual({
        status: 'rejected',
        diagnostic: {
          code: 'git-inspection-failed',
          requestedPath: repository,
          reason: 'inspection-failed',
        },
      });
      expect(pids.every(pid => !processIsRunning(pid))).toBe(true);
    } finally {
      killHungProcesses();
      if (pending !== undefined && outcome === undefined) {
        for (let attempt = 0; attempt < 20 && outcome === undefined; attempt += 1) {
          await pauseForProcesses();
        }
      }
      vi.useRealTimers();
      vi.resetModules();
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
    }

    await expect(bootstrapWorkspace({ startPath: repository })).resolves.toMatchObject({
      status: 'ready',
    });
  });
});
