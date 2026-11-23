import type { LegacyReviewAnnotation, LegacyReviewBatchReceipt } from '../legacyReviewSource.js';
import { deepFreeze, textDecoder } from '../recordCodec.js';
import type { WorkspaceIdentity } from '../baseTypes.js';
import type {
  LegacyReviewQueueCandidateDecision,
  LegacyReviewQueueCandidateDisclosure,
  LegacyReviewQueueCandidatePromotionSummary,
  LegacyReviewQueueCandidateSummary,
  LegacyReviewReceiptAnnotation,
  LegacyReviewReceiptBatchSummary,
  LegacyReviewReceiptHarnessSummary,
  LegacyReviewReceiptHistoryDisclosure,
  LegacyReviewSourceOccurrenceIdentity,
  LegacyReviewTextWindow,
  LegacyReviewUtf8TextPage,
} from './contracts.js';
import { legacyReviewQueueCandidateIdentity } from './identities.js';
import { LegacyReviewImportStateProblem } from './internalTypes.js';
import {
  LEGACY_CANDIDATE_EXCERPT_PREVIEW_BYTES,
  LEGACY_CANDIDATE_TEXT_PREVIEW_BYTES,
  LEGACY_ERROR_WINDOW_BYTES,
  LEGACY_EXCERPT_WINDOW_BYTES,
  LEGACY_ID_WINDOW_BYTES,
  LEGACY_LABEL_WINDOW_BYTES,
  LEGACY_PATH_WINDOW_BYTES,
  LEGACY_TEXT_WINDOW_BYTES,
} from './limits.js';

export const LEGACY_RECEIPT_HISTORY_DISCLOSURE: LegacyReviewReceiptHistoryDisclosure =
  deepFreeze<LegacyReviewReceiptHistoryDisclosure>({
    label: 'LEGACY REVIEW HISTORY',
    provenance: 'imported-legacy-receipt-source',
    recordStatus: 'migration-evidence-not-v1-history',
    sourceMutability: 'legacy-source-was-mutable',
    retention: 'at-most-100-terminal-batches',
    cannotProve: [
      'complete-history',
      'human-consent',
      'delivery',
      'harness-start',
      'terminal-correlation',
      'human-disposition',
      'correctness',
      'v1-workflow-facts',
    ],
  });

export const LEGACY_QUEUE_CANDIDATE_DISCLOSURE: LegacyReviewQueueCandidateDisclosure =
  deepFreeze<LegacyReviewQueueCandidateDisclosure>({
    label: 'LEGACY QUEUE CANDIDATE',
    recordStatus: 'migration-candidate-not-v1-draft',
    authority: 'none',
    legacyValues: 'intent-path-lines-and-excerpt-are-hints-only',
    promotionRequires: 'explicit-intent-and-exact-anchor-on-verified-current-v1-snapshot',
  });

export function textWindow(value: string, maximumBytes: number): LegacyReviewTextWindow {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= maximumBytes) {
    return {
      text: value,
      totalUtf8Bytes: bytes.byteLength,
      shownUtf8Bytes: bytes.byteLength,
      truncated: false,
    };
  }
  let shownBytes = maximumBytes;
  let text: string | undefined;
  while (shownBytes > 0 && text === undefined) {
    try {
      text = textDecoder.decode(bytes.subarray(0, shownBytes));
    } catch {
      shownBytes -= 1;
    }
  }
  return {
    text: text ?? '',
    totalUtf8Bytes: bytes.byteLength,
    shownUtf8Bytes: shownBytes,
    truncated: true,
  };
}

export function receiptHarnessSummary(batch: LegacyReviewBatchReceipt): LegacyReviewReceiptHarnessSummary {
  return {
    legacyHarnessId: textWindow(batch.harness.id, LEGACY_ID_WINDOW_BYTES),
    legacyName: textWindow(batch.harness.name, LEGACY_LABEL_WINDOW_BYTES),
    ...(batch.harness.version === undefined
      ? {}
      : {
          legacyVersion: textWindow(batch.harness.version, LEGACY_LABEL_WINDOW_BYTES),
        }),
    legacySessionId: textWindow(batch.harness.sessionId, LEGACY_ID_WINDOW_BYTES),
    ...(batch.harness.model === undefined
      ? {}
      : {
          legacyModel: textWindow(batch.harness.model, LEGACY_LABEL_WINDOW_BYTES),
        }),
    legacyWorkspacePath: textWindow(batch.harness.workspace, LEGACY_PATH_WINDOW_BYTES),
  };
}

export function receiptBatchSummary(
  batch: LegacyReviewBatchReceipt,
  batchAbsolute: number,
): LegacyReviewReceiptBatchSummary {
  return {
    batchAbsolute,
    legacyBatchId: textWindow(batch.id, LEGACY_ID_WINDOW_BYTES),
    legacyWorkspacePath: textWindow(batch.workspace, LEGACY_PATH_WINDOW_BYTES),
    legacyHarness: receiptHarnessSummary(batch),
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    harnessOutcome: batch.harnessOutcome,
    ...(batch.harnessCompletedAt === undefined ? {} : { harnessCompletedAt: batch.harnessCompletedAt }),
    ...(batch.harnessError === undefined
      ? {}
      : {
          legacyHarnessError: textWindow(batch.harnessError, LEGACY_ERROR_WINDOW_BYTES),
        }),
    queueDisposition: batch.queueDisposition,
    ...(batch.queueUpdatedAt === undefined ? {} : { queueUpdatedAt: batch.queueUpdatedAt }),
    ...(batch.queueReason === undefined ? {} : { queueReason: batch.queueReason }),
    ...(batch.queueError === undefined
      ? {}
      : {
          legacyQueueError: textWindow(batch.queueError, LEGACY_ERROR_WINDOW_BYTES),
        }),
    totalAnnotations: batch.annotations.length,
  };
}

export function receiptAnnotation(
  annotation: LegacyReviewAnnotation,
  annotationAbsolute: number,
): LegacyReviewReceiptAnnotation {
  return {
    annotationAbsolute,
    legacyAnnotationId: textWindow(annotation.id, LEGACY_ID_WINDOW_BYTES),
    legacyKind: annotation.kind,
    ...(annotation.file === undefined
      ? {}
      : {
          legacyFile: textWindow(annotation.file, LEGACY_PATH_WINDOW_BYTES),
        }),
    legacyAnchor: {
      side: annotation.anchor.side,
      ...(annotation.anchor.oldLine === undefined ? {} : { oldLine: annotation.anchor.oldLine }),
      ...(annotation.anchor.newLine === undefined ? {} : { newLine: annotation.anchor.newLine }),
    },
    legacyText: textWindow(annotation.text, LEGACY_TEXT_WINDOW_BYTES),
    ...(annotation.excerpt === undefined
      ? {}
      : {
          legacyExcerpt: textWindow(annotation.excerpt, LEGACY_EXCERPT_WINDOW_BYTES),
        }),
  };
}

export type LegacyTextPageResult =
  | { readonly status: 'available'; readonly page: LegacyReviewUtf8TextPage }
  | {
      readonly status: 'unavailable';
      readonly reason: 'out-of-range' | 'not-scalar-boundary';
    };

export function textPage(value: string, utf8Offset: number, maximumBytes: number): LegacyTextPageResult {
  const bytes = Buffer.from(value, 'utf8');
  if (utf8Offset > bytes.byteLength) {
    return { status: 'unavailable', reason: 'out-of-range' };
  }
  if (utf8Offset < bytes.byteLength && ((bytes[utf8Offset] ?? 0) & 0xc0) === 0x80) {
    return { status: 'unavailable', reason: 'not-scalar-boundary' };
  }
  let end = Math.min(bytes.byteLength, utf8Offset + maximumBytes);
  let text: string | undefined;
  while (end >= utf8Offset && text === undefined) {
    try {
      text = textDecoder.decode(bytes.subarray(utf8Offset, end));
    } catch {
      end -= 1;
    }
  }
  if (text === undefined) {
    throw new LegacyReviewImportStateProblem();
  }
  return {
    status: 'available',
    page: {
      text,
      totalUtf8Bytes: bytes.byteLength,
      utf8Offset,
      shownUtf8Bytes: end - utf8Offset,
      complete: end === bytes.byteLength,
    },
  };
}

export function candidateAnchorHint(
  annotation: LegacyReviewAnnotation,
): LegacyReviewQueueCandidateSummary['legacyAnchorHint'] {
  return {
    side: annotation.anchor.side,
    ...(annotation.anchor.oldLine === undefined ? {} : { oldLine: annotation.anchor.oldLine }),
    ...(annotation.anchor.newLine === undefined ? {} : { newLine: annotation.anchor.newLine }),
  };
}

export function queueCandidateSummary(
  workspaceIdentity: WorkspaceIdentity,
  sourceOccurrenceIdentity: LegacyReviewSourceOccurrenceIdentity,
  annotation: LegacyReviewAnnotation,
  candidateAbsolute: number,
  migrationDecision: 'undecided' | LegacyReviewQueueCandidateDecision | 'promoted',
  promotion?: LegacyReviewQueueCandidatePromotionSummary,
): LegacyReviewQueueCandidateSummary {
  return {
    candidateIdentity: legacyReviewQueueCandidateIdentity(workspaceIdentity, sourceOccurrenceIdentity, annotation.id),
    candidateAbsolute,
    migrationDecision,
    ...(promotion === undefined ? {} : { promotion }),
    legacyAnnotationId: textWindow(annotation.id, LEGACY_ID_WINDOW_BYTES),
    legacyKind: annotation.kind,
    ...(annotation.file === undefined
      ? {}
      : {
          legacyFile: textWindow(annotation.file, LEGACY_PATH_WINDOW_BYTES),
        }),
    legacyAnchorHint: candidateAnchorHint(annotation),
    legacyTextPreview: textWindow(annotation.text, LEGACY_CANDIDATE_TEXT_PREVIEW_BYTES),
    ...(annotation.excerpt === undefined
      ? {}
      : {
          legacyExcerptPreview: textWindow(annotation.excerpt, LEGACY_CANDIDATE_EXCERPT_PREVIEW_BYTES),
        }),
  };
}
