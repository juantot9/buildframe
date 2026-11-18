import { kindsOf } from '../kindRoutes.js';
import type { WorkspaceProjectionViewRequest, WorkspaceProjectionViewScope } from './contracts.js';

/** Every view and subscription the Workspace projection serves. */
export const PROJECTION_VIEW_KINDS: readonly WorkspaceProjectionViewRequest['kind'][] = kindsOf<
  WorkspaceProjectionViewRequest['kind']
>()([
  'review.bases',
  'review.command-result',
  'review.commit-graph',
  'review.comparison-preview',
  'review.context-contribution-content',
  'review.context-selection',
  'review.continuation',
  'review.diff',
  'review.history',
  'review.live-diff',
  'review.live-file-content',
  'review.live-files',
  'review.live-manifest',
  'review.manifest',
  'review.message-body',
  'review.message-origin',
  'review.messages',
  'review.question-body',
  'review.question-location',
  'review.questions',
  'review.search',
  'review.search-preview',
  'review.snapshot-context',
  'review.snapshot-context-content',
  'review.step-changes',
  'review.step-changes-diff',
  'review.versions',
  'workspace.home',
]);

export const PROJECTION_SCOPE_KINDS: readonly WorkspaceProjectionViewScope['kind'][] = kindsOf<
  WorkspaceProjectionViewScope['kind']
>()([
  'review.bases',
  'review.continuation',
  'review.diff',
  'review.live-file-content',
  'review.live-files',
  'review.live-manifest',
  'review.manifest',
  'review.messages',
  'review.questions',
  'review.versions',
  'workspace.home',
]);

/** Subscriptions that follow the working tree as well as State, so the file watcher runs while one is open. */
export type LiveScopeKind = 'review.live-manifest' | 'review.live-files' | 'review.continuation';

export function isLiveScopeKind(kind: string): kind is LiveScopeKind {
  return kind === 'review.live-manifest' || kind === 'review.live-files' || kind === 'review.continuation';
}

export function isLive<Item extends { readonly kind: string }>(
  item: Item,
): item is Extract<Item, { readonly kind: LiveScopeKind }> {
  return isLiveScopeKind(item.kind);
}
