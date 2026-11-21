import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * A new temporary directory with a short path, for fixtures that keep the
 * runtime's endpoint inside it. On macOS `os.tmpdir()` can push the Unix
 * socket past its 100-byte bound, and the runtime would then pick its shared
 * fallback outside the fixture; `/tmp` keeps it inside. Windows has no `/tmp`
 * and its runtime listens on a named pipe, so it uses `os.tmpdir()`.
 */
export async function shortScratchRoot(prefix: string): Promise<string> {
  return await mkdtemp(path.join(process.platform === 'win32' ? tmpdir() : '/tmp', prefix));
}
