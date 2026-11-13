import { decodeBytesBase64 } from '../bytesBase64.js';
import { safeVersion } from '../recordCodec.js';
import type { ReviewQuestionPayload, ReviewSnapshotPayload } from '../reviewing/index.js';
import { sha256 } from '../sha256.js';
import type { CurrentChangedFile } from '../workspaceEvidence/index.js';
import { SHA256_PATTERN } from './limits.js';

export function exactQuestionAnchorIsValid(
  question: ReviewQuestionPayload,
  snapshot: ReviewSnapshotPayload,
  files: readonly CurrentChangedFile[],
): boolean {
  const anchor = question.anchor;
  const file = files.find(item => item.fileIdentity === anchor.fileIdentity);
  const side = anchor.side === 'old' ? file?.oldSide : file?.newSide;

  // Reject anchors that cannot be resolved against this review snapshot.
  if (
    anchor.reviewSnapshotIdentity !== snapshot.reviewSnapshotIdentity ||
    file === undefined ||
    side === undefined ||
    (anchor.fileAbsolute !== undefined && files[anchor.fileAbsolute]?.fileIdentity !== anchor.fileIdentity)
  ) {
    return false;
  }
  if (anchor.kind === 'review.whole-file') {
    if (anchor.content.classification !== side.classification) return false;
    if (anchor.content.status === 'available') {
      return (
        side.contentAvailability === 'captured' &&
        side.byteLength === anchor.content.byteLength &&
        side.contentIdentity?.value === anchor.content.contentIdentity.value
      );
    }
    return (
      side.contentAvailability === anchor.content.availability &&
      side.byteLength === anchor.content.byteLength &&
      side.contentIdentity?.value === anchor.content.contentIdentity?.value &&
      side.contentLimitation === anchor.content.limitation
    );
  }
  if (
    side.contentAvailability !== 'captured' ||
    side.byteLength === null ||
    !safeVersion(anchor.line, false) ||
    !safeVersion(anchor.byteOffset) ||
    !safeVersion(anchor.byteLength) ||
    anchor.byteOffset + anchor.byteLength > side.byteLength ||
    anchor.lineContent.algorithm !== 'sha256' ||
    !SHA256_PATTERN.test(anchor.lineContent.value)
  ) {
    return false;
  }
  let bytes: Buffer;
  try {
    bytes = decodeBytesBase64(anchor.lineContent.bytesBase64);
  } catch {
    return false;
  }
  return bytes.byteLength === anchor.byteLength && sha256(bytes) === anchor.lineContent.value;
}
