import { afterEach, describe, expect, it, vi } from 'vitest';

import { runCodexCommand } from '../../src/helper.js';

describe('!buildframe in Codex', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  async function run(argv: readonly string[]): Promise<string> {
    const written: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
      written.push(String(chunk));
      return true;
    });
    await runCodexCommand(argv, { CODEX_THREAD_ID: `thread-${process.pid}-unconnected` }, '/no/helper/here.js');
    return written.join('');
  }

  it('answers status and disconnect in one line when nothing is connected', async () => {
    expect(await run(['status'])).toBe('BuildFrame is not connected to this session.\n');
    expect(await run(['disconnect'])).toBe('BuildFrame is not connected to this session.\n');
  });

  it('prints usage for anything else, in one line', async () => {
    expect(await run(['sideways'])).toBe('Usage: !buildframe, !buildframe status, or !buildframe disconnect\n');
    expect(process.exitCode).toBe(2);
  });
});
