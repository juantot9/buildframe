import { createHash } from 'node:crypto';

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Hash each UTF-8 part followed by one NUL byte, including the final part. */
export function sha256Parts(parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) hash.update(part).update('\0');
  return hash.digest('hex');
}
