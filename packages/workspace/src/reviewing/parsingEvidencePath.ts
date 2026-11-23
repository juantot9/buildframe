import { hasOnlyKeys, isRecord } from '../recordCodec.js';
import type { EvidencePath } from '../workspaceEvidence/index.js';
import { ReviewingStateProblem } from './internalTypes.js';
import { decodeReviewingBytesBase64 } from './utils.js';

export function parseEvidencePath(value: unknown): EvidencePath {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['bytesBase64', 'display']) ||
    typeof value.bytesBase64 !== 'string' ||
    typeof value.display !== 'string'
  ) {
    throw new ReviewingStateProblem();
  }
  if (decodeReviewingBytesBase64(value.bytesBase64).byteLength === 0) {
    throw new ReviewingStateProblem();
  }
  return { bytesBase64: value.bytesBase64, display: value.display };
}
