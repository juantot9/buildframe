import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { it } from 'vitest';

/**
 * Whether this process may create a symlink. Windows allows it only with
 * Developer Mode or an elevated token; directory links there can be a
 * junction, which needs neither.
 */
export const symlinksAvailable: boolean = await (async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'buildframe-symlink-probe-'));
  try {
    await writeFile(path.join(scratch, 'target'), '');
    await symlink(path.join(scratch, 'target'), path.join(scratch, 'link'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
})();

/** A case that needs symlinks: skipped where they are unavailable (Windows without Developer Mode). */
export const itWithSymlinks = it.skipIf(!symlinksAvailable);

/** A case that needs POSIX files (modes, FIFOs, Unix sockets, `"` in names): skipped on Windows. */
export const itOnPosix = it.skipIf(process.platform === 'win32');
