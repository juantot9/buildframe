import { readlink } from 'node:fs/promises';

const BACKSLASH = 0x5c;
const SLASH = 0x2f;

/**
 * A symlink's target as Git records it, or `undefined` when it cannot be read.
 * macOS and Linux keep the raw bytes. Windows stores a target with `\`
 * separators (Node writes `../x` as `..\x`); Git for Windows reads them back
 * as `/`, so BuildFrame does too, and a checkout's link matches its blob.
 */
export async function readLinkTarget(
  linkPath: string | Buffer,
  platform: NodeJS.Platform = process.platform,
): Promise<Buffer | undefined> {
  const target = await readlink(linkPath, { encoding: 'buffer' }).catch(() => undefined);
  if (target === undefined) return undefined;
  return gitLinkTarget(Buffer.from(target), platform);
}

/** `target` with Windows separators spelled as Git spells them. */
export function gitLinkTarget(target: Buffer, platform: NodeJS.Platform = process.platform): Buffer {
  if (platform !== 'win32') return target;
  return Buffer.from(target.map(byte => (byte === BACKSLASH ? SLASH : byte)));
}
