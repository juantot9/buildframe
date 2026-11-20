import type { CurrentChangeSide } from '../workspaceEvidence/index.js';

/**
 * Whether Git would take these bytes for binary and leave their line endings
 * alone (`gather_stats` and `convert_is_binary` in Git's convert.c): a lone CR,
 * a NUL, or more than one control character per 128 printable ones.
 */
export function gitSeesBinary(bytes: Uint8Array): boolean {
  let printable = 0;
  let nonPrintable = 0;
  for (let index = 0; index < bytes.byteLength; index += 1) {
    const byte = bytes[index]!;
    if (byte === 0x0d) {
      if (bytes[index + 1] !== 0x0a) return true;
      index += 1;
    } else if (byte === 0x00) {
      return true;
    } else if (byte === 0x7f) {
      nonPrintable += 1;
    } else if (byte < 0x20) {
      // Backspace, tab, escape and form feed count as printable.
      if (byte === 0x08 || byte === 0x09 || byte === 0x1b || byte === 0x0c) printable += 1;
      else if (byte !== 0x0a) nonPrintable += 1;
    } else {
      printable += 1;
    }
  }
  // A trailing DOS end-of-file character is not counted.
  if (bytes.at(-1) === 0x1a) nonPrintable -= 1;
  return printable >> 7 < nonPrintable;
}

/**
 * Whether Git, reading this side, turns each CRLF into LF before it compares,
 * so a line differing only by that CR is unchanged. `auto` leaves binary
 * content alone, and leaves the CRs alone when the version compared against
 * already has one (Git checks the index; the other side stands in for it).
 */
export function gitIgnoresCrBeforeLf(
  side: CurrentChangeSide | undefined,
  bytes: Uint8Array | undefined,
  otherBytes: Uint8Array | undefined,
): boolean {
  const rule = side?.lineEndingConversion;
  if (rule === undefined || bytes === undefined) return false;
  if (rule === 'text') return true;
  return !gitSeesBinary(bytes) && !(otherBytes?.includes(0x0d) ?? false);
}
