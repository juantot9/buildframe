import { kindsOf } from '../kindRoutes.js';
import type { WorkspaceEvidenceViewRequest } from './contracts.js';

/** Every view Workspace Evidence serves; it needs no State, so a read-only Workspace serves them too. */
export const EVIDENCE_VIEW_KINDS: readonly WorkspaceEvidenceViewRequest['kind'][] = kindsOf<
  WorkspaceEvidenceViewRequest['kind']
>()([
  'workspace.context.capture',
  'workspace.context.content',
  'workspace.context.manifest',
  'workspace.context.resolution',
  'workspace.context.verify',
  'workspace.current-changes.capture',
  'workspace.current-changes.content',
  'workspace.current-changes.manifest',
  'workspace.current-changes.verify',
  'workspace.review-comparison.capture',
]);
