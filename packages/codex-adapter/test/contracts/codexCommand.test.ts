import { rmSync, writeFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { registryFile, runCodexCommand } from '../../src/helper.js';

const THREAD = `thread-${process.pid}-unconnected`;

describe('!buildframe in Codex', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    rmSync(registryFile(THREAD), { force: true });
  });

  async function run(argv: readonly string[]): Promise<string> {
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      written.push(String(chunk));
      return true;
    });
    await runCodexCommand(argv, { CODEX_THREAD_ID: THREAD }, '/no/helper/here.js');
    return written.join('');
  }

  it('answers status and disconnect in one line when nothing is connected', async () => {
    expect(await run(['status'])).toBe('BuildFrame: not connected · !buildframe to connect\n');
    expect(await run(['disconnect'])).toBe('BuildFrame is not connected to this session.\n');
  });

  it('leads status with the state the helper last recorded', async () => {
    // A live helper (this process stands in for it) that is connected.
    writeFileSync(
      registryFile(THREAD),
      JSON.stringify({ pid: process.pid, line: 'BuildFrame: connected', final: false }),
    );
    expect(await run(['status'])).toBe('BuildFrame: connected\n');
    // A helper from before the record wrote its pid alone.
    writeFileSync(registryFile(THREAD), String(process.pid));
    expect(await run(['status'])).toBe('BuildFrame: connected\n');
  });

  it('says another session took it after the helper stopped, and nothing for one that just died', async () => {
    const gone = 2 ** 22 + 1;
    const moved = 'BuildFrame: moved to another session · !buildframe to take it back';
    writeFileSync(registryFile(THREAD), JSON.stringify({ pid: gone, line: moved, final: true }));
    expect(await run(['status'])).toBe(`${moved}\n`);
    writeFileSync(registryFile(THREAD), JSON.stringify({ pid: gone, line: 'BuildFrame: connected', final: false }));
    expect(await run(['status'])).toBe('BuildFrame: not connected · !buildframe to connect\n');
  });

  it('prints usage for anything else, in one line', async () => {
    expect(await run(['sideways'])).toBe('Usage: !buildframe, !buildframe status, or !buildframe disconnect\n');
    expect(process.exitCode).toBe(2);
  });
});
