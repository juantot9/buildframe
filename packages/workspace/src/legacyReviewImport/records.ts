import type { StateRecordWrite } from '../authoritativeState.js';
import { sha256 } from '../sha256.js';
import type { LegacyReviewImportIndexPayload } from './internalTypes.js';
import { encode } from './utils.js';

export function importRecordIdentity(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}_${sha256(`neoflow-legacy-review-import-v1\0${parts.join('\0')}`)}`;
}

export function immutableRecord(
  recordIdentity: string,
  workflowIdentity: string,
  kind: string,
  payload: unknown,
  content: readonly { readonly role: string; readonly bytes: Uint8Array }[] = [],
): StateRecordWrite {
  return {
    recordClass: 'immutable',
    recordIdentity,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    payload: encode(payload),
    content,
  };
}

export function revisionedRecord(
  recordIdentity: string,
  expectedRevision: number,
  payload: LegacyReviewImportIndexPayload,
): StateRecordWrite {
  return {
    recordClass: 'revisioned',
    recordIdentity,
    workflowIdentity: recordIdentity,
    kind: 'legacy-review.import-index',
    schemaVersion: 1,
    expectedRevision,
    payload: encode({
      formatVersion: payload.formatVersion,
      occurrences: payload.occurrences,
      ...(payload.decisions.length === 0 ? {} : { decisions: payload.decisions }),
      ...(payload.candidateDecisions === undefined ? {} : { candidateDecisions: payload.candidateDecisions }),
      ...(payload.movedSourceAssociations === undefined
        ? {}
        : { movedSourceAssociations: payload.movedSourceAssociations }),
      ...(payload.candidatePromotions === undefined ? {} : { candidatePromotions: payload.candidatePromotions }),
    }),
    content: [],
  };
}
