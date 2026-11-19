import { constants } from 'node:fs';
import { copyFile, link, readdir, rm, symlink, unlink } from 'node:fs/promises';
import path from 'node:path';

export interface OverlayLinkOptions {
  readonly platform?: NodeJS.Platform;
  /** The hard-link step; tests replace it to reach the copy fallback. */
  readonly hardLink?: (target: string, destination: string) => Promise<void>;
}

/**
 * Makes `destination` in the inspection overlay show `target`.
 *
 * macOS and Linux: a symlink. Windows: a symlink needs Developer Mode or
 * administrator rights, so a directory becomes a junction and a file a hard
 * link, or a copy when a hard link is impossible (the checkout on another
 * volume than the temporary directory, or a file system without hard links).
 * A copy is a snapshot taken at inspection time, which is what inspection
 * reads anyway.
 */
export async function linkOverlayEntry(
  target: string,
  destination: string,
  kind: 'file' | 'dir',
  options: OverlayLinkOptions = {},
): Promise<void> {
  if ((options.platform ?? process.platform) !== 'win32') {
    await symlink(target, destination, kind);
    return;
  }
  if (kind === 'dir') {
    await symlink(target, destination, 'junction');
    return;
  }
  try {
    await (options.hardLink ?? link)(target, destination);
  } catch {
    await copyFile(target, destination, constants.COPYFILE_EXCL);
  }
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}

async function unlinkLinks(directory: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    // A junction reads as a symbolic link, so it is unlinked, never entered.
    if (entry.isSymbolicLink()) await unlink(entryPath);
    else if (entry.isDirectory()) await unlinkLinks(entryPath);
  }
}

/**
 * Removes an inspection overlay without following a link into the
 * repository. Every link is unlinked first, so the recursive removal only
 * meets the overlay's own files and directories; if any unlink fails, nothing
 * else is removed. Node's recursive removal does not follow links today, but
 * the repository's safety does not rest on that.
 */
export async function removeInspectionOverlay(root: string): Promise<void> {
  await unlinkLinks(root);
  await rm(root, { recursive: true, force: true });
}
