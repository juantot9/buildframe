import { spawn } from 'node:child_process';
import { once } from 'node:events';
import process from 'node:process';

import { describe, expect, it } from 'vitest';

import { holderIsGone, inspectProcess } from '../../src/processIdentity.js';
import { windowsProcessStart } from '../../src/windowsProcesses.js';

/** A short-lived Node child; it exits when asked to. */
function child(): { readonly pid: number; exit(): Promise<void> } {
  const spawned = spawn(process.execPath, ['-e', 'process.stdin.on("data", () => process.exit(0))'], {
    stdio: ['pipe', 'ignore', 'ignore'],
  });
  return {
    pid: spawned.pid as number,
    exit: async () => {
      const exited = once(spawned, 'exit');
      spawned.stdin.write('x');
      await exited;
    },
  };
}

describe('a lock holder', () => {
  it('is the same running process each time it is inspected', async () => {
    const first = await inspectProcess(process.pid);
    const second = await inspectProcess(process.pid);
    expect(first.status).toBe('running');
    expect(second).toEqual(first);
    if (process.platform !== 'darwin' && process.platform !== 'linux' && process.platform !== 'win32') return;
    expect(first.status === 'running' && first.identity).toMatch(/^(linux|darwin|win32):/u);
  });

  it('is told apart from another running process, as a reused id would be', async () => {
    const other = child();
    try {
      const holder = await inspectProcess(process.pid);
      const reuser = await inspectProcess(other.pid);
      expect(reuser.status).toBe('running');
      if (holder.status === 'running' && holder.identity !== undefined) {
        expect(reuser.status === 'running' && reuser.identity).not.toBe(holder.identity);
      }
    } finally {
      await other.exit();
    }
  });

  it('is gone once its process has exited', async () => {
    const other = child();
    await other.exit();

    await expect(inspectProcess(other.pid)).resolves.toEqual({ status: 'gone' });
    expect(holderIsGone(other.pid)).toBe(true);
  });
});

describe.runIf(process.platform === 'win32')('a Windows process start', () => {
  it('is when the process started, and gone for an id nothing runs under', () => {
    const started = windowsProcessStart(process.pid);
    expect(started.status).toBe('running');
    if (started.status !== 'running') return;
    // FILETIME: 100 ns since 1601-01-01.
    const startedAtMs = Number(started.createdAt / 10_000n) - 11_644_473_600_000;
    const expectedMs = Date.now() - process.uptime() * 1000;
    expect(Math.abs(startedAtMs - expectedMs)).toBeLessThan(5_000);

    expect(windowsProcessStart(0x7fff_fff0)).toEqual({ status: 'gone' });
  });
});
