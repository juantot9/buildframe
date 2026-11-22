import { constants } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';

/**
 * Opens `filename` for reading, refusing a symlink as its last component;
 * `undefined` when it is a link or cannot be opened. `flags` are added to the
 * open (a flag the platform lacks is `undefined` and adds nothing).
 *
 * Where the platform has `O_NOFOLLOW` (macOS, Linux) the open itself refuses
 * a link. Windows has none, yet with Developer Mode or an elevated token a
 * checkout holds real symlinks. There the path must not be a link before the
 * open, and the opened handle must be that same file (`dev` and `ino`), so a
 * link swapped in between is refused too. `noFollow` is the platform's flag;
 * tests pass `undefined` to run the Windows path anywhere.
 */
export async function openUnfollowed(
  filename: Buffer,
  flags = 0,
  noFollow: number | undefined = constants.O_NOFOLLOW,
): Promise<FileHandle | undefined> {
  if (noFollow !== undefined) {
    return await open(filename, constants.O_RDONLY | noFollow | flags).catch(() => undefined);
  }
  const before = await lstat(filename, { bigint: true }).catch(() => undefined);
  if (before === undefined || before.isSymbolicLink()) return undefined;
  const handle = await open(filename, constants.O_RDONLY | flags).catch(() => undefined);
  if (handle === undefined) return undefined;
  const opened = await handle.stat({ bigint: true }).catch(() => undefined);
  if (opened !== undefined && opened.dev === before.dev && opened.ino === before.ino) return handle;
  await handle.close().catch(() => undefined);
  return undefined;
}
