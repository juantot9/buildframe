import type { IndexEnumeration, IndexRecord, UntrackedEnumeration } from './workspaceEvidence/index.js';

/** Which tracked and ignored paths fall under a Context selection's folders. */

const SLASH = Buffer.from([0x2f]);

export function pathUnderPrefix(relative: Buffer, prefix: Buffer): boolean {
  if (prefix.byteLength === 0) return relative.byteLength > 0;
  return (
    relative.byteLength > prefix.byteLength + 1 &&
    relative.subarray(0, prefix.byteLength + 1).equals(Buffer.concat([prefix, SLASH]))
  );
}

export function filterTrackedByPrefix(
  trackedByPath: ReadonlyMap<string, IndexRecord>,
  prefix: Buffer,
): Map<string, IndexRecord> {
  if (prefix.byteLength === 0) return new Map(trackedByPath);
  const filtered = new Map<string, IndexRecord>();
  for (const [pathHex, record] of trackedByPath) {
    if (pathUnderPrefix(Buffer.from(pathHex, 'hex'), prefix)) filtered.set(pathHex, record);
  }
  return filtered;
}

export function scopedTrackedRecords(
  enumeration: IndexEnumeration,
  prefixes: readonly Buffer[],
): Map<string, IndexRecord> {
  const tracked = new Map<string, IndexRecord>();
  for (const record of enumeration.records) {
    for (const prefix of prefixes) {
      if (record.path.equals(prefix) || prefix.byteLength === 0 || pathUnderPrefix(record.path, prefix)) {
        const existing = tracked.get(record.path.toString('hex'));
        // Prefer the stage-0 record; unmerged paths keep their first stage record.
        if (existing === undefined || (existing.stage !== 0 && record.stage === 0)) {
          tracked.set(record.path.toString('hex'), record);
        }
        break;
      }
    }
  }
  return tracked;
}

/** Ignored untracked paths, plus everything beneath an ignored nested repository. */
export type IgnoredUntracked = Pick<ReadonlySet<string>, 'has'>;

export function scopedIgnoredUntracked(
  enumeration: UntrackedEnumeration,
  prefixes: readonly Buffer[],
): IgnoredUntracked {
  const ignored = new Set<string>();
  for (const ignoredPath of enumeration.paths) {
    for (const prefix of prefixes) {
      if (ignoredPath.equals(prefix) || prefix.byteLength === 0 || pathUnderPrefix(ignoredPath, prefix)) {
        ignored.add(ignoredPath.toString('hex'));
        break;
      }
    }
  }
  const nestedRepositories = enumeration.nestedRepositories;
  if (nestedRepositories.length === 0) return ignored;
  // Git never lists a nested repository's files, so its ignored status covers them all.
  return {
    has: pathHex =>
      ignored.has(pathHex) ||
      nestedRepositories.some(repository => pathUnderPrefix(Buffer.from(pathHex, 'hex'), repository)),
  };
}
