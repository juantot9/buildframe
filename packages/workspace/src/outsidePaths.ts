import path from 'node:path';

/**
 * How outside-checkout Context paths are spelled. Inside the checkout
 * BuildFrame keeps Git's `/`-separated relative paths; outside it, the host's
 * absolute paths. macOS and Linux keep a selection's exact bytes and join
 * with `/`. Windows normalizes the selection once (`/` to `\`, repeated
 * separators) and joins and contains with `\`. Names are compared byte for
 * byte on every platform: `C:\X` and `c:\x` stay two selections.
 */

const SLASH = Buffer.from('/');
const BACKSLASH = Buffer.from('\\');

/** The selection's absolute path as Context stores it. */
export function outsideSelection(absolutePath: string, platform: NodeJS.Platform = process.platform): Buffer {
  return Buffer.from(platform === 'win32' ? path.win32.normalize(absolutePath) : absolutePath, 'utf8');
}

function separatorFor(platform: NodeJS.Platform): Buffer {
  return platform === 'win32' ? BACKSLASH : SLASH;
}

/** `name` inside the outside directory `parent`. */
export function outsideChild(parent: Buffer, name: Buffer, platform: NodeJS.Platform = process.platform): Buffer {
  const separator = separatorFor(platform);
  // A Windows root such as `C:\` already ends with its separator.
  if (platform === 'win32' && parent.subarray(-1).equals(separator)) return Buffer.concat([parent, name]);
  return Buffer.concat([parent, separator, name]);
}

/** Whether `candidate` lies strictly inside the outside directory `selected`. */
export function outsideUnder(
  candidate: Buffer,
  selected: Buffer,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const separator = separatorFor(platform);
  const prefix =
    platform === 'win32' && selected.subarray(-1).equals(separator) ? selected : Buffer.concat([selected, separator]);
  return candidate.byteLength > prefix.byteLength && candidate.subarray(0, prefix.byteLength).equals(prefix);
}
