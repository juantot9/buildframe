import type { AuthoritativeState, StateRecordWrite } from '../authoritativeState.js';
import { hasOnlyKeys, isRecord } from '../recordCodec.js';
import type { CurrentChangedFile } from '../workspaceEvidence/index.js';
import { reviewingRecordIdentity, type ReviewIdentity, type ReviewMessageIdentity } from './identities.js';
import { ReviewingStateProblem, type CapturedSnapshotFile } from './internalTypes.js';
import { parseCurrentChangedFile } from './parsingEvidence.js';
import { immutableRecord } from './parsingReview.js';
import { decodeReviewingPayload, recordIdentity } from './utils.js';

/**
 * The changed files as they stood when a Message was sent. A later Response's
 * edits are shown against this, so they are not mixed with earlier changes.
 * It is not a Snapshot: it never becomes a Version or a review point.
 */
export interface ReviewMessageCodeStatePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly fileIdentities: readonly string[];
}

/** One changed file at send time; its old and new contents ride as record content. */
export interface ReviewMessageCodeFilePayload {
  readonly formatVersion: 1;
  readonly reviewIdentity: ReviewIdentity;
  readonly reviewMessageIdentity: ReviewMessageIdentity;
  readonly file: CurrentChangedFile;
}

const FILE_IDENTITY_PATTERN = /^fil_[0-9a-f]{64}$/u;

export function messageCodeStateIdentity(reviewMessageIdentity: ReviewMessageIdentity): string {
  return reviewingRecordIdentity('rmc', reviewMessageIdentity, 'message-code-state');
}

function messageCodeFileIdentity(reviewMessageIdentity: ReviewMessageIdentity, fileIdentity: string): string {
  return reviewingRecordIdentity('rmf', reviewMessageIdentity, fileIdentity);
}

/** Records for the code at send time; identical contents are stored once by the State store. */
export function messageCodeStateRecords(
  reviewIdentity: ReviewIdentity,
  reviewMessageIdentity: ReviewMessageIdentity,
  files: readonly CapturedSnapshotFile[],
): readonly StateRecordWrite[] {
  return [
    immutableRecord(messageCodeStateIdentity(reviewMessageIdentity), reviewIdentity, 'review.message-code-state', {
      formatVersion: 1,
      reviewIdentity,
      reviewMessageIdentity,
      fileIdentities: files.map(item => item.file.fileIdentity),
    } satisfies ReviewMessageCodeStatePayload),
    ...files.map(item =>
      immutableRecord(
        messageCodeFileIdentity(reviewMessageIdentity, item.file.fileIdentity),
        reviewIdentity,
        'review.message-code-file',
        {
          formatVersion: 1,
          reviewIdentity,
          reviewMessageIdentity,
          file: item.file,
        } satisfies ReviewMessageCodeFilePayload,
        [
          ...(item.oldContent === undefined ? [] : [{ role: 'old', bytes: item.oldContent }]),
          ...(item.newContent === undefined ? [] : [{ role: 'new', bytes: item.newContent }]),
        ],
      ),
    ),
  ];
}

export function parseReviewMessageCodeState(value: unknown): ReviewMessageCodeStatePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'reviewMessageIdentity', 'fileIdentities']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg') ||
    !Array.isArray(value.fileIdentities) ||
    !value.fileIdentities.every(item => typeof item === 'string' && FILE_IDENTITY_PATTERN.test(item)) ||
    new Set(value.fileIdentities).size !== value.fileIdentities.length
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    fileIdentities: value.fileIdentities as readonly string[],
  };
}

export function parseReviewMessageCodeFile(value: unknown): ReviewMessageCodeFilePayload {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['formatVersion', 'reviewIdentity', 'reviewMessageIdentity', 'file']) ||
    value.formatVersion !== 1 ||
    !recordIdentity(value.reviewIdentity, 'rev') ||
    !recordIdentity(value.reviewMessageIdentity, 'rmg')
  ) {
    throw new ReviewingStateProblem();
  }
  return {
    formatVersion: 1,
    reviewIdentity: value.reviewIdentity as ReviewIdentity,
    reviewMessageIdentity: value.reviewMessageIdentity as ReviewMessageIdentity,
    file: parseCurrentChangedFile(value.file),
  };
}

/** The code at send time, or undefined for a Message sent before this was recorded. */
export async function readMessageCodeState(
  state: AuthoritativeState,
  reviewIdentity: ReviewIdentity,
  reviewMessageIdentity: ReviewMessageIdentity,
  /** False reads only which files changed and their fingerprints, not their bytes. */
  includeContent = true,
): Promise<readonly CapturedSnapshotFile[] | undefined> {
  const indexRead = await state.read({
    recordIdentities: [messageCodeStateIdentity(reviewMessageIdentity)],
    includeContent: false,
  });
  if (indexRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
  const indexRecord = indexRead.records[0];
  if (indexRecord === undefined) return undefined;
  if (indexRecord.kind !== 'review.message-code-state' || indexRecord.recordClass !== 'immutable') {
    throw new ReviewingStateProblem();
  }
  const index = parseReviewMessageCodeState(decodeReviewingPayload(indexRecord.payload));
  if (index.reviewIdentity !== reviewIdentity || index.reviewMessageIdentity !== reviewMessageIdentity) {
    throw new ReviewingStateProblem();
  }
  if (index.fileIdentities.length === 0) return [];
  const fileRead = await state.read({
    recordIdentities: index.fileIdentities.map(fileIdentity =>
      messageCodeFileIdentity(reviewMessageIdentity, fileIdentity),
    ),
    includeContent,
  });
  if (fileRead.quarantineReports.length > 0) throw new ReviewingStateProblem();
  return index.fileIdentities.map((fileIdentity, position) => {
    const record = fileRead.records[position];
    if (record === undefined || record.kind !== 'review.message-code-file' || record.recordClass !== 'immutable') {
      throw new ReviewingStateProblem();
    }
    const payload = parseReviewMessageCodeFile(decodeReviewingPayload(record.payload));
    if (
      payload.reviewIdentity !== reviewIdentity ||
      payload.reviewMessageIdentity !== reviewMessageIdentity ||
      payload.file.fileIdentity !== fileIdentity
    ) {
      throw new ReviewingStateProblem();
    }
    if (!includeContent) return { file: payload.file };
    const contentFor = (role: 'old' | 'new'): Uint8Array | undefined => {
      const side = role === 'old' ? payload.file.oldSide : payload.file.newSide;
      if (side?.contentAvailability !== 'captured' || side.contentIdentity === undefined) return undefined;
      const content = record.content.find(candidate => candidate.role === role);
      if (content?.bytes === undefined || content.digest !== side.contentIdentity.value) {
        throw new ReviewingStateProblem();
      }
      return content.bytes;
    };
    const oldContent = contentFor('old');
    const newContent = contentFor('new');
    return {
      file: payload.file,
      ...(oldContent === undefined ? {} : { oldContent }),
      ...(newContent === undefined ? {} : { newContent }),
    };
  });
}
