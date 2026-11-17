import { encodeBytesBase64 } from '../bytesBase64.js';
import { buildReviewDiff, type CapturedSnapshotFile } from '../reviewing/index.js';
import type { CurrentChangeSide, EvidencePath } from '../workspaceEvidence/index.js';
import type {
  ReviewHistoryHeadMove,
  ReviewHistoryPoint,
  ReviewHistoryStep,
  ReviewProjectedDiffRow,
  ReviewStepChangedFile,
} from './contracts.js';
import { MAX_DIFF_ROW_BYTES } from './limits.js';

/** Paths listed per step; the total still counts every file. */
export const MAX_STEP_CHANGED_PATHS = 32;

/**
 * The code at one point of a Review's history: its changed files against a
 * commit, as fingerprints and, when read for rows, with their contents.
 */
export interface HistoryPointState {
  readonly point: ReviewHistoryPoint;
  /** The commit the files compare against; undefined at start, which has no files. */
  readonly basisKey: string | undefined;
  /** That commit's object identity; null when HEAD was unborn, undefined at start. */
  readonly basisObjectIdentity?: string | null | undefined;
  readonly files: readonly CapturedSnapshotFile[];
}

/**
 * What moving HEAD between two points changed: the files that differ between
 * the earlier point's commit and the later one's, and how HEAD moved.
 */
export interface CommitCrossing {
  readonly headMove: ReviewHistoryHeadMove;
  readonly files: readonly CapturedSnapshotFile[];
}

/** One file that differs between two points, with its before → after rows. */
export interface StepChangedFile {
  readonly file: ReviewStepChangedFile;
  /** Old side = the earlier point, new side = the later one. */
  readonly captured: CapturedSnapshotFile;
  readonly diff: ReturnType<typeof buildReviewDiff>;
}

export function historyPointKey(point: ReviewHistoryPoint): string {
  return point.kind === 'sent' || point.kind === 'answered'
    ? `${point.kind}:${point.reviewMessageIdentity}`
    : point.kind;
}

/**
 * Where a point falls among every moment of a Review with `messageCount`
 * Messages: start, then each Message's send and answer, then now.
 */
export function historyPosition(
  point: ReviewHistoryPoint,
  ordinalOf: (point: Extract<ReviewHistoryPoint, { readonly reviewMessageIdentity: unknown }>) => number,
  messageCount: number,
): number {
  if (point.kind === 'start') return 0;
  if (point.kind === 'now') return 2 * messageCount + 1;
  const ordinal = ordinalOf(point);
  return point.kind === 'sent' ? 2 * ordinal - 1 : 2 * ordinal;
}

/** Whether two points compare against different commits. */
export function commitMovedBetween(earlier: HistoryPointState, later: HistoryPointState): boolean {
  return earlier.basisKey !== undefined && later.basisKey !== undefined && earlier.basisKey !== later.basisKey;
}

/**
 * The steps between neighbouring known points, oldest first. A step is an
 * answer when it runs from a Message's send to its answer, outside answers
 * when no Message was sent in it, and mixed otherwise. A step across a commit
 * compares its two ends through what that commit changed; `crossingOf` gives
 * it, or undefined when BuildFrame can't read it.
 */
export function historySteps(
  points: readonly HistoryPointState[],
  positionOf: (point: ReviewHistoryPoint) => number,
  crossingOf: (earlier: HistoryPointState, later: HistoryPointState) => CommitCrossing | undefined = () => undefined,
): readonly ReviewHistoryStep[] {
  const steps: ReviewHistoryStep[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const start = positionOf(from.point);
    const end = positionOf(to.point);
    // Message n is sent at position 2n - 1; list those sent in [from, to).
    const messageOrdinals: number[] = [];
    for (let ordinal = Math.ceil((start + 1) / 2); 2 * ordinal - 1 < end; ordinal += 1) {
      messageOrdinals.push(ordinal);
    }
    const kind =
      from.point.kind === 'sent' &&
      to.point.kind === 'answered' &&
      from.point.reviewMessageIdentity === to.point.reviewMessageIdentity
        ? 'answer'
        : messageOrdinals.length === 0
          ? 'outside'
          : 'mixed';
    const crossing = commitMovedBetween(from, to) ? crossingOf(from, to) : undefined;
    const changes = ((): ReviewHistoryStep['changes'] => {
      if (commitMovedBetween(from, to) && crossing === undefined) {
        return { status: 'unavailable', reason: 'commit-moved' };
      }
      const paths = stepChangedPaths(from.files, to.files, crossing?.files);
      return paths.length === 0
        ? { status: 'unchanged' }
        : { status: 'changed', paths: paths.slice(0, MAX_STEP_CHANGED_PATHS), total: paths.length };
    })();
    steps.push({
      from: from.point,
      to: to.point,
      kind,
      messageOrdinals,
      changes,
      ...(crossing === undefined ? {} : { headMove: crossing.headMove }),
    });
  }
  return steps;
}

function pathKey(path: EvidencePath): string {
  return path.bytesBase64;
}

function sideKey(side: CurrentChangeSide | undefined): string {
  if (side === undefined) return 'absent';
  return JSON.stringify([
    side.kind,
    side.gitMode,
    side.contentIdentity?.value ?? null,
    side.contentIdentity === undefined ? (side.objectIdentity?.value ?? null) : null,
    side.byteLength,
    side.symlinkTarget ?? null,
  ]);
}

/** One path whose side differs between two points. */
interface PairedFile {
  readonly base: CapturedSnapshotFile['file'];
  readonly oldSide: CurrentChangeSide | undefined;
  readonly newSide: CurrentChangeSide | undefined;
  readonly oldContent: Uint8Array | undefined;
  readonly newContent: Uint8Array | undefined;
}

/**
 * Pairs the changed files at two points. Each point lists its files against
 * its own commit; a path missing from a point's list is that commit's own
 * version there. When a commit was made in between, `committed` lists what
 * differs between the two commits (old side = the earlier point's commit, new
 * side = the later one's); a path in none of the lists is the same in both
 * commits. Works on fingerprints alone; contents ride along when present.
 */
function pairChangedFiles(
  earlier: readonly CapturedSnapshotFile[],
  later: readonly CapturedSnapshotFile[],
  committed: readonly CapturedSnapshotFile[] = [],
): readonly PairedFile[] {
  const pathOf = (item: CapturedSnapshotFile): EvidencePath => (item.file.newSide ?? item.file.oldSide)!.path;
  const byPath = (items: readonly CapturedSnapshotFile[]): Map<string, CapturedSnapshotFile> =>
    new Map(items.map(item => [pathKey(pathOf(item)), item] as const));
  const before = byPath(earlier);
  const after = byPath(later);
  const between = byPath(committed);
  const keys = [...new Set([...before.keys(), ...after.keys(), ...between.keys()])].sort();
  const paired: PairedFile[] = [];
  for (const key of keys) {
    const earlierItem = before.get(key);
    const laterItem = after.get(key);
    const commitItem = between.get(key);
    // The earlier point's version: its own change, else its commit's version.
    const oldSide =
      earlierItem !== undefined
        ? earlierItem.file.newSide
        : commitItem !== undefined
          ? commitItem.file.oldSide
          : laterItem?.file.oldSide;
    const oldContent =
      earlierItem !== undefined
        ? earlierItem.newContent
        : commitItem !== undefined
          ? commitItem.oldContent
          : laterItem?.oldContent;
    // The later point's version: its own change, else its commit's version.
    const newSide =
      laterItem !== undefined
        ? laterItem.file.newSide
        : commitItem !== undefined
          ? commitItem.file.newSide
          : earlierItem?.file.oldSide;
    const newContent =
      laterItem !== undefined
        ? laterItem.newContent
        : commitItem !== undefined
          ? commitItem.newContent
          : earlierItem?.oldContent;
    if (sideKey(oldSide) === sideKey(newSide)) continue;
    paired.push({
      base: (laterItem ?? commitItem ?? earlierItem)!.file,
      oldSide,
      newSide,
      oldContent,
      newContent,
    });
  }
  return paired;
}

/** The paths that differ between two points, from fingerprints alone. */
export function stepChangedPaths(
  earlier: readonly CapturedSnapshotFile[],
  later: readonly CapturedSnapshotFile[],
  committed?: readonly CapturedSnapshotFile[],
): readonly EvidencePath[] {
  return pairChangedFiles(earlier, later, committed).map(pair => (pair.newSide ?? pair.oldSide)!.path);
}

/** The files that differ between two points, with their before → after rows. */
export function stepChangedFiles(
  comparisonIdentity: string,
  earlier: readonly CapturedSnapshotFile[],
  later: readonly CapturedSnapshotFile[],
  committed?: readonly CapturedSnapshotFile[],
): readonly StepChangedFile[] {
  return pairChangedFiles(earlier, later, committed).map(({ base, oldSide, newSide, oldContent, newContent }) => {
    const captured: CapturedSnapshotFile = {
      file: {
        fileIdentity: base.fileIdentity,
        status: base.status,
        staging: base.staging,
        ...(oldSide === undefined ? {} : { oldSide }),
        ...(newSide === undefined ? {} : { newSide }),
      },
      ...(oldContent === undefined ? {} : { oldContent }),
      ...(newContent === undefined ? {} : { newContent }),
    };
    const diff = buildReviewDiff(comparisonIdentity, captured);
    const lines =
      diff.index.status === 'available'
        ? {
            added: diff.rows.filter(row => row.kind === 'addition').length,
            removed: diff.rows.filter(row => row.kind === 'deletion').length,
          }
        : undefined;
    return {
      file: {
        fileIdentity: base.fileIdentity,
        path: (newSide ?? oldSide)!.path,
        change: oldSide === undefined ? 'added' : newSide === undefined ? 'deleted' : 'modified',
        ...(lines === undefined ? {} : { lines }),
      },
      captured,
      diff,
    };
  });
}

/** The rows' text, read from the side each row belongs to. */
export function projectedStepChangeRows(
  changed: StepChangedFile,
  offset: number,
  limit: number,
): readonly ReviewProjectedDiffRow[] {
  return changed.diff.rows.slice(offset, offset + limit).map(row => {
    const content = row.content.side === 'old' ? changed.captured.oldContent : changed.captured.newContent;
    const bytes = (content ?? new Uint8Array()).subarray(
      row.content.byteOffset,
      row.content.byteOffset + Math.min(row.content.byteLength, MAX_DIFF_ROW_BYTES),
    );
    return {
      rowIdentity: row.rowIdentity,
      kind: row.kind,
      ...(row.oldLine === undefined ? {} : { oldLine: row.oldLine }),
      ...(row.newLine === undefined ? {} : { newLine: row.newLine }),
      text: {
        encoding: 'utf8',
        bytesBase64: encodeBytesBase64(bytes),
        byteLength: bytes.byteLength,
        totalByteLength: row.content.byteLength,
        truncated: bytes.byteLength < row.content.byteLength,
      },
    };
  });
}
