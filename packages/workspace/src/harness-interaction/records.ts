import type { StateRecordWrite } from '../authoritativeState.js';
import type {
  HarnessAttachmentIndexEntry,
  HarnessIndexPayload,
  HarnessInvocationIndexEntry,
  UserPullPreparationIndexEntry,
} from './internalTypes.js';
import { encode } from './utils.js';

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
  workflowIdentity: string,
  kind: string,
  expectedRevision: number,
  payload: unknown,
): StateRecordWrite {
  return {
    recordClass: 'revisioned',
    recordIdentity,
    workflowIdentity,
    kind,
    schemaVersion: 1,
    expectedRevision,
    payload: encode(payload),
    content: [],
  };
}

export function emptyIndex(): HarnessIndexPayload {
  return { formatVersion: 3, attachments: [], handoffs: [], invocations: [], preparations: [] };
}

export function replaceAttachment(
  index: HarnessIndexPayload,
  attachment: HarnessAttachmentIndexEntry,
): HarnessIndexPayload {
  const exists = index.attachments.some(item => item.attachmentIdentity === attachment.attachmentIdentity);
  return {
    ...index,
    attachments: exists
      ? index.attachments.map(item => (item.attachmentIdentity === attachment.attachmentIdentity ? attachment : item))
      : [...index.attachments, attachment],
  };
}

export function replaceInvocation(
  index: HarnessIndexPayload,
  invocation: HarnessInvocationIndexEntry,
): HarnessIndexPayload {
  return {
    ...index,
    invocations: index.invocations.map(item =>
      item.invocationIdentity === invocation.invocationIdentity ? invocation : item,
    ),
  };
}

export function replacePreparation(
  index: HarnessIndexPayload,
  preparation: UserPullPreparationIndexEntry,
): HarnessIndexPayload {
  return {
    ...index,
    preparations: index.preparations.map(item =>
      item.preparationIdentity === preparation.preparationIdentity ? preparation : item,
    ),
  };
}
