import { MAX_FILE_LIST_READ_BYTES } from './limits.js';

/**
 * The longest start of `entries` whose encoded size fits one file-list read,
 * so a read never outgrows the runtime's message cap whatever the path
 * lengths. At least one entry is kept, so a client paging on always moves on.
 */
export function withinFileListBudget<Entry>(entries: readonly Entry[]): readonly Entry[] {
  let used = 0;
  for (let index = 0; index < entries.length; index += 1) {
    used += Buffer.byteLength(JSON.stringify(entries[index]), 'utf8') + 1;
    if (used > MAX_FILE_LIST_READ_BYTES && index > 0) return entries.slice(0, index);
  }
  return entries;
}
