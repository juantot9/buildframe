import { encodeBytesBase64 } from '../bytesBase64.js';
import {
  reviewLiveChangesIdentity,
  reviewingRecordIdentity,
  type CapturedReviewSnapshot,
  type ReviewSnapshotPayload,
} from '../reviewing/index.js';
import type { WorkspaceIdentity } from '../workspace.js';
import type { ReviewSearchSnippet } from './contracts.js';
import { ProjectionRecordsInvalid } from './internalTypes.js';
import { MAX_REVIEW_SEARCH_SNIPPET_BYTES } from './limits.js';

export function permanentProjectionRecordFailure(error: unknown): boolean {
  return (
    error instanceof ProjectionRecordsInvalid ||
    error instanceof SyntaxError ||
    (error instanceof Error && error.message === 'reviewing-state-invalid')
  );
}

export function capturedLiveChangesIdentity(captured: CapturedReviewSnapshot): string {
  return reviewLiveChangesIdentity(captured.capture.basis, captured.capture.comparedState, captured.capture.manifest);
}

export function snapshotLiveChangesIdentity(snapshot: ReviewSnapshotPayload): string {
  return reviewLiveChangesIdentity(snapshot.basis, snapshot.comparedState, snapshot.manifest);
}

export function searchSnippet(text: string, matchAt: number, queryLength: number): ReviewSearchSnippet {
  const matchStart = Math.max(0, Math.min(matchAt, text.length));
  const matchEnd = Math.max(matchStart, Math.min(text.length, matchStart + queryLength));
  let start = Math.max(0, matchStart - 64);
  let end = Math.min(text.length, matchEnd + 128);
  let bytes = Buffer.from(text.slice(start, end), 'utf8');
  while (bytes.byteLength > MAX_REVIEW_SEARCH_SNIPPET_BYTES && end > matchEnd) {
    end -= 1;
    bytes = Buffer.from(text.slice(start, end), 'utf8');
  }
  while (bytes.byteLength > MAX_REVIEW_SEARCH_SNIPPET_BYTES && start < matchStart) {
    start += 1;
    bytes = Buffer.from(text.slice(start, end), 'utf8');
  }
  if (bytes.byteLength > MAX_REVIEW_SEARCH_SNIPPET_BYTES) {
    bytes = bytes.subarray(0, MAX_REVIEW_SEARCH_SNIPPET_BYTES);
  }
  return {
    encoding: 'utf8',
    bytesBase64: encodeBytesBase64(bytes),
    byteLength: bytes.byteLength,
    truncatedBefore: start > 0,
    truncatedAfter: end < text.length,
  };
}

export function safeInteger(value: unknown, allowZero = true): value is number {
  return Number.isSafeInteger(value) && (value as number) >= (allowZero ? 0 : 1);
}

export function boundedIdentity(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value) <= 512 &&
    value.trim() === value &&
    !value.includes('\u0000')
  );
}

export function assertWindow(offset: number, limit: number, maximum: number, label: string): void {
  if (!safeInteger(offset) || !safeInteger(limit, false) || limit > maximum) {
    throw new TypeError(`Invalid bounded ${label} window`);
  }
}

export function indexIdentity(workspaceIdentity: WorkspaceIdentity): string {
  return reviewingRecordIdentity('rvi', workspaceIdentity);
}

export function fileRecordIdentity(snapshotIdentity: string, fileIdentity: string): string {
  return reviewingRecordIdentity('rsf', snapshotIdentity, fileIdentity);
}

export function manifestWindowIdentity(snapshotIdentity: string, window: number): string {
  return reviewingRecordIdentity('rmw', snapshotIdentity, String(window));
}

export function diffWindowIdentity(snapshotIdentity: string, fileIdentity: string, window: number): string {
  return reviewingRecordIdentity('rdw', snapshotIdentity, fileIdentity, String(window));
}

export function commandRecordIdentity(commandIdentity: string): string {
  return reviewingRecordIdentity('rcm', commandIdentity);
}
