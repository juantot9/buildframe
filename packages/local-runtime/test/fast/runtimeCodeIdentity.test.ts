import { rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { runtimeCodeIdentityForEntrypoint } from '../../src/runtimeCodeIdentity.js';
import { shortScratchRoot } from '../shortScratchRoot.js';

const scratchDirectories = new Set<string>();

afterEach(async () => {
  await Promise.all([...scratchDirectories].map(async directory => rm(directory, { recursive: true, force: true })));
  scratchDirectories.clear();
});

describe('Local Runtime code identity', () => {
  it('is stable for one entrypoint incarnation and changes across a byte-identical rebuild', async () => {
    const directory = await shortScratchRoot('buildframe-runtime-code-');
    scratchDirectories.add(directory);
    const entrypoint = `${directory}/runtime.js`;
    const replacement = `${directory}/replacement.js`;
    await writeFile(entrypoint, 'export {};\n');

    const first = await runtimeCodeIdentityForEntrypoint(pathToFileURL(entrypoint));
    await expect(runtimeCodeIdentityForEntrypoint(pathToFileURL(entrypoint))).resolves.toBe(first);

    await writeFile(replacement, 'export {};\n');
    await rename(replacement, entrypoint);
    const rebuilt = await runtimeCodeIdentityForEntrypoint(pathToFileURL(entrypoint));

    expect(first).toMatch(/^rtc_[0-9a-f]{64}$/u);
    expect(rebuilt).toMatch(/^rtc_[0-9a-f]{64}$/u);
    expect(rebuilt).not.toBe(first);
  });
});
