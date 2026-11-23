import { describe, expect, it } from 'vitest';

import { GenerationCache } from '../../src/projection/generationCache.js';

describe('one shared check per live generation', () => {
  it('shares a running check, reuses a finished one only while watching, and never reuses a failure', async () => {
    const cache = new GenerationCache<string, number>();
    let runs = 0;
    const check = async (): Promise<number> => ++runs;

    // Two reads at the same time share one check.
    await Promise.all([cache.read('a', 1, false, check), cache.read('a', 1, false, check)]);
    expect(runs).toBe(1);
    // Finished and not watching: the tree may have changed unnoticed, so check again.
    await cache.read('a', 1, false, check);
    expect(runs).toBe(2);
    // Finished while watching: reused until the generation moves on.
    expect(await cache.read('a', 1, true, check)).toBe(2);
    expect(await cache.read('a', 2, true, check)).toBe(3);
    // Another key is its own check; clearing forgets everything.
    expect(await cache.read('b', 2, true, check)).toBe(4);
    cache.clear();
    expect(await cache.read('a', 2, true, check)).toBe(5);

    const failing = new GenerationCache<string, number>();
    await expect(failing.read('a', 1, true, async () => Promise.reject(new Error('git failed')))).rejects.toThrow();
    expect(await failing.read('a', 1, true, check)).toBe(6);
  });
});
