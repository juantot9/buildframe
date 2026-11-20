import type { StateRecordWrite } from '../authoritativeState.js';
import type {
  ContextSourceByteScope,
  ContextSourceCaptureItem,
  ContextSourceOccurrenceConflict,
} from '../contextEvidence.js';
import { sha256 } from '../sha256.js';
import type { CurrentChangeSide, CurrentChangedFile } from '../workspaceEvidence/index.js';
import type { ReviewContextRule, ReviewQuestionWholeFileAnchor } from './contracts.js';
import type { ReviewContextSelectionIdentity, ReviewIdentity, ReviewSnapshotIdentity } from './identities.js';
import {
  ReviewingStateProblem,
  type CapturedReviewContext,
  type CapturedReviewContextItem,
  type CapturedReviewSnapshot,
  type CapturedSnapshotFile,
  type ReviewDiffRowPayload,
  type ReviewSnapshotContextScope,
  type ReviewSnapshotContextSourceGroup,
  type ReviewSnapshotDiffIndex,
  type ReviewSnapshotPayload,
} from './internalTypes.js';
import { gitIgnoresCrBeforeLf } from './lineEndingComparison.js';
import { MAX_DIFF_ROWS_PER_FILE, MAX_LCS_CELLS, REVIEW_DIFF_WINDOW_ROWS } from './limits.js';

export interface ProjectedReviewCaptureFile {
  readonly captured: CapturedSnapshotFile;
  readonly diff: ReturnType<typeof buildReviewDiff>;
}

export interface ProjectedReviewCapture {
  readonly capture: CapturedReviewSnapshot['capture'];
  readonly files: readonly CurrentChangedFile[];
  readonly projectedFiles: readonly ProjectedReviewCaptureFile[];
}

export interface PreparedReviewSnapshot {
  /** Absent when the successor reuses the prior Snapshot's frozen comparison evidence. */
  readonly capture?: CapturedReviewSnapshot['capture'];
  readonly snapshot: ReviewSnapshotPayload;
  readonly files: readonly CurrentChangedFile[];
  readonly records: readonly StateRecordWrite[];
  readonly preparedFiles: readonly ProjectedReviewCaptureFile[];
}

export interface DiffLineSlice {
  readonly number: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
  readonly side: 'old' | 'new';
  readonly digest: string;
  /** The bytes that take part in comparison: all of them, or all but a CR before LF. */
  readonly comparedLength: number;
}

export interface BuiltReviewDiff {
  readonly index: ReviewSnapshotDiffIndex;
  readonly rows: readonly ReviewDiffRowPayload[];
}

/** Splits bytes into lines; with ignoreCrBeforeLf, a line's CR before its LF is not compared. */
export function diffLines(
  bytes: Uint8Array,
  side: 'old' | 'new',
  digest: string,
  ignoreCrBeforeLf = false,
): readonly DiffLineSlice[] {
  const lines: DiffLineSlice[] = [];
  let start = 0;
  let number = 1;
  for (let offset = 0; offset <= bytes.byteLength; offset += 1) {
    const atEnd = offset === bytes.byteLength;
    const atNewline = !atEnd && bytes[offset] === 0x0a;
    if (!atEnd && !atNewline) continue;
    if (!(atEnd && start === bytes.byteLength)) {
      lines.push({
        number,
        byteOffset: start,
        byteLength: offset - start,
        bytes: bytes.slice(start, offset),
        side,
        digest,
        comparedLength:
          ignoreCrBeforeLf && atNewline && offset > start && bytes[offset - 1] === 0x0d
            ? offset - start - 1
            : offset - start,
      });
    }
    if (atEnd) break;
    start = offset + 1;
    number += 1;
  }
  return lines;
}

export function exactWholeFileAnchorContent(
  side: CurrentChangeSide,
  bytes: Uint8Array | undefined,
): ReviewQuestionWholeFileAnchor['content'] | undefined {
  if (side.contentAvailability === 'captured') {
    if (
      side.contentIdentity === undefined ||
      side.byteLength === null ||
      bytes === undefined ||
      bytes.byteLength !== side.byteLength ||
      sha256(bytes) !== side.contentIdentity.value
    ) {
      return undefined;
    }
    return {
      status: 'available',
      classification: side.classification,
      byteLength: side.byteLength,
      contentIdentity: side.contentIdentity,
    };
  }
  return {
    status: 'unavailable',
    classification: side.classification,
    availability: side.contentAvailability,
    byteLength: side.byteLength,
    ...(side.contentIdentity === undefined ? {} : { contentIdentity: side.contentIdentity }),
    ...(side.contentLimitation === undefined ? {} : { limitation: side.contentLimitation }),
  };
}

export function requiredWholeFileAnchorContent(
  side: CurrentChangeSide,
  bytes: Uint8Array | undefined,
): ReviewQuestionWholeFileAnchor['content'] {
  const content = exactWholeFileAnchorContent(side, bytes);
  if (content === undefined) throw new ReviewingStateProblem();
  return content;
}

export function sameDiffLine(left: DiffLineSlice, right: DiffLineSlice): boolean {
  if (left.comparedLength !== right.comparedLength) return false;
  for (let index = 0; index < left.comparedLength; index += 1) {
    if (left.bytes[index] !== right.bytes[index]) return false;
  }
  return true;
}

export function projectedDiffRow(
  reviewSnapshotIdentity: string,
  fileIdentity: string,
  kind: ReviewDiffRowPayload['kind'],
  line: DiffLineSlice,
  oldLine?: number,
  newLine?: number,
): ReviewDiffRowPayload {
  return {
    rowIdentity: `row_${sha256(
      [
        reviewSnapshotIdentity,
        fileIdentity,
        kind,
        String(oldLine ?? ''),
        String(newLine ?? ''),
        line.side,
        String(line.byteOffset),
        String(line.byteLength),
        line.digest,
      ].join('\0'),
    )}`,
    kind,
    ...(oldLine === undefined ? {} : { oldLine }),
    ...(newLine === undefined ? {} : { newLine }),
    content: {
      side: line.side,
      byteOffset: line.byteOffset,
      byteLength: line.byteLength,
      digest: line.digest,
    },
  };
}

export function appendComparedMiddle(
  rows: ReviewDiffRowPayload[],
  reviewSnapshotIdentity: string,
  fileIdentity: string,
  oldLines: readonly DiffLineSlice[],
  newLines: readonly DiffLineSlice[],
): void {
  if (oldLines.length === 0 || newLines.length === 0 || (oldLines.length + 1) * (newLines.length + 1) > MAX_LCS_CELLS) {
    for (const line of oldLines) {
      rows.push(projectedDiffRow(reviewSnapshotIdentity, fileIdentity, 'deletion', line, line.number));
    }
    for (const line of newLines) {
      rows.push(projectedDiffRow(reviewSnapshotIdentity, fileIdentity, 'addition', line, undefined, line.number));
    }
    return;
  }

  const width = newLines.length + 1;
  const matrix = new Uint32Array((oldLines.length + 1) * width);
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const at = oldIndex * width + newIndex;
      matrix[at] = sameDiffLine(oldLines[oldIndex]!, newLines[newIndex]!)
        ? (matrix[(oldIndex + 1) * width + newIndex + 1] ?? 0) + 1
        : Math.max(matrix[(oldIndex + 1) * width + newIndex] ?? 0, matrix[oldIndex * width + newIndex + 1] ?? 0);
    }
  }

  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    const oldLine = oldLines[oldIndex]!;
    const newLine = newLines[newIndex]!;
    if (sameDiffLine(oldLine, newLine)) {
      rows.push(
        projectedDiffRow(reviewSnapshotIdentity, fileIdentity, 'context', newLine, oldLine.number, newLine.number),
      );
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    const deletionScore = matrix[(oldIndex + 1) * width + newIndex] ?? 0;
    const additionScore = matrix[oldIndex * width + newIndex + 1] ?? 0;
    if (deletionScore >= additionScore) {
      rows.push(projectedDiffRow(reviewSnapshotIdentity, fileIdentity, 'deletion', oldLine, oldLine.number));
      oldIndex += 1;
    } else {
      rows.push(projectedDiffRow(reviewSnapshotIdentity, fileIdentity, 'addition', newLine, undefined, newLine.number));
      newIndex += 1;
    }
  }
  appendComparedMiddle(rows, reviewSnapshotIdentity, fileIdentity, oldLines.slice(oldIndex), newLines.slice(newIndex));
}

export function buildReviewDiff(reviewSnapshotIdentity: string, captured: CapturedSnapshotFile): BuiltReviewDiff {
  const oldSide = captured.file.oldSide;
  const newSide = captured.file.newSide;
  if (
    (oldSide?.contentAvailability === 'captured' && captured.oldContent === undefined) ||
    (newSide?.contentAvailability === 'captured' && captured.newContent === undefined) ||
    (oldSide !== undefined && oldSide.contentAvailability !== 'captured') ||
    (newSide !== undefined && newSide.contentAvailability !== 'captured')
  ) {
    return {
      index: { status: 'unavailable', reason: 'content-unavailable' },
      rows: [],
    };
  }
  if (
    (oldSide !== undefined && oldSide.classification !== 'text') ||
    (newSide !== undefined && newSide.classification !== 'text')
  ) {
    return { index: { status: 'unavailable', reason: 'not-text' }, rows: [] };
  }

  // Lines compare the way Git compares them: a side whose CRLFs Git turns
  // into LF does not differ by those CRs. Rows still carry the exact bytes.
  const oldLines =
    captured.oldContent === undefined || oldSide?.contentIdentity === undefined
      ? []
      : diffLines(
          captured.oldContent,
          'old',
          oldSide.contentIdentity.value,
          gitIgnoresCrBeforeLf(oldSide, captured.oldContent, captured.newContent),
        );
  const newLines =
    captured.newContent === undefined || newSide?.contentIdentity === undefined
      ? []
      : diffLines(
          captured.newContent,
          'new',
          newSide.contentIdentity.value,
          gitIgnoresCrBeforeLf(newSide, captured.newContent, captured.oldContent),
        );
  // Context consumes one line from each side; every other row consumes one.
  // Bound that worst-case row count before constructing and hashing any row.
  if (oldLines.length + newLines.length > MAX_DIFF_ROWS_PER_FILE) {
    return {
      index: { status: 'unavailable', reason: 'comparison-limit' },
      rows: [],
    };
  }
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && sameDiffLine(oldLines[prefix]!, newLines[prefix]!)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    sameDiffLine(oldLines[oldLines.length - suffix - 1]!, newLines[newLines.length - suffix - 1]!)
  ) {
    suffix += 1;
  }

  const rows: ReviewDiffRowPayload[] = [];
  for (let index = 0; index < prefix; index += 1) {
    const oldLine = oldLines[index]!;
    const newLine = newLines[index]!;
    rows.push(
      projectedDiffRow(
        reviewSnapshotIdentity,
        captured.file.fileIdentity,
        'context',
        newLine,
        oldLine.number,
        newLine.number,
      ),
    );
  }
  appendComparedMiddle(
    rows,
    reviewSnapshotIdentity,
    captured.file.fileIdentity,
    oldLines.slice(prefix, oldLines.length - suffix),
    newLines.slice(prefix, newLines.length - suffix),
  );
  for (let index = suffix; index > 0; index -= 1) {
    const oldLine = oldLines[oldLines.length - index]!;
    const newLine = newLines[newLines.length - index]!;
    rows.push(
      projectedDiffRow(
        reviewSnapshotIdentity,
        captured.file.fileIdentity,
        'context',
        newLine,
        oldLine.number,
        newLine.number,
      ),
    );
  }

  return {
    index: {
      status: 'available',
      totalRows: rows.length,
      windowSize: REVIEW_DIFF_WINDOW_ROWS,
    },
    rows,
  };
}

export function mergeReviewContextIntervals(
  intervals: readonly ContextSourceByteScope[],
): readonly ContextSourceByteScope[] {
  const sorted = [...intervals].sort((left, right) => left.offset - right.offset || left.length - right.length);
  const merged: ContextSourceByteScope[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (previous !== undefined && interval.offset <= previous.offset + previous.length) {
      const end = Math.max(previous.offset + previous.length, interval.offset + interval.length);
      merged[merged.length - 1] = { kind: 'bytes', offset: previous.offset, length: end - previous.offset };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

export function capturedContextScope(
  item: ContextSourceCaptureItem,
  includeRules: readonly Extract<ReviewContextRule, { readonly action: 'include' }>[],
): ReviewSnapshotContextScope {
  const scopes = item.origins.map(origin => includeRules[origin]?.scope);
  if (scopes.some(scope => scope === undefined)) return { kind: 'whole' };
  const intervals = mergeReviewContextIntervals(scopes as readonly ContextSourceByteScope[]);
  if (intervals.length === 0) throw new ReviewingStateProblem();
  return { kind: 'bytes', intervals };
}

export function reviewSnapshotContextSourceGroups(
  rules: readonly ReviewContextRule[],
): readonly ReviewSnapshotContextSourceGroup[] {
  const groups: ReviewSnapshotContextSourceGroup[] = [];
  let origin = 0;
  rules.forEach((rule, order) => {
    if (rule.action === 'include') {
      groups.push({ kind: 'locator', order, origin, ruleIdentity: rule.ruleIdentity });
      origin += 1;
    } else if (rule.action === 'pin') {
      groups.push({
        kind: 'pin',
        order,
        ruleIdentity: rule.ruleIdentity,
        reviewSnapshotIdentity: rule.reviewSnapshotIdentity,
        itemIdentity: rule.itemIdentity,
      });
    } else if (rule.action === 'contribute') {
      groups.push({
        kind: 'contribution',
        order,
        ruleIdentity: rule.ruleIdentity,
        contributionIdentity: rule.contributionIdentity,
      });
    }
  });
  return groups;
}

export function capturedReviewContextSemanticDigest(
  selectionIdentity: ReviewContextSelectionIdentity,
  selectionRevision: number,
  rules: readonly ReviewContextRule[],
  sourceGroups: readonly ReviewSnapshotContextSourceGroup[],
  conflicts: readonly ContextSourceOccurrenceConflict[],
  items: readonly CapturedReviewContextItem[],
): string {
  return sha256(
    JSON.stringify({
      formatVersion: 1,
      selectionIdentity,
      selectionRevision,
      rules,
      defaultIgnoredUntracked: 'excluded',
      sourceGroups,
      conflicts,
      items: items.map(item => ({
        ...item,
        contents: item.contents.map(content => ({
          scope: content.scope,
          byteLength: content.bytes.byteLength,
          sha256: sha256(content.bytes),
        })),
      })),
    }),
  );
}

export function reviewSnapshotContextMatches(
  snapshot: ReviewSnapshotPayload,
  captured: CapturedReviewContext,
): boolean {
  return snapshot.context === undefined
    ? captured.selectionRevision === 0 && captured.rules.length === 0 && captured.items.length === 0
    : snapshot.context.semanticDigest.value === captured.semanticDigest;
}

export interface PrepareReviewSnapshotRequest {
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewSnapshotIdentity: ReviewSnapshotIdentity;
  readonly previousReviewSnapshotIdentity?: ReviewSnapshotIdentity;
  readonly changeSetIdentity: string;
  readonly captured: CapturedReviewSnapshot;
  readonly context?: CapturedReviewContext;
}
