import type { ReviewHarnessInteractionViewScope } from '@buildframe/workspace/harness-interaction';
import type { WorkspaceProjectionViewScope } from '@buildframe/workspace/projection';
import type { ReviewIdentity } from '@buildframe/workspace/reviewing';

import type { HomeMode, ReviewLoadTarget, ReviewSelectionHint } from './reviewingModel.js';

/** Where Reviewing's loader is: Home at a page, or a Review at a target. */

export interface ActiveHomeRoute {
  readonly kind: 'home';
  readonly offset: number;
  readonly preferredReviewIdentity?: ReviewIdentity;
  readonly mode?: HomeMode;
  readonly autoOpenActive?: boolean;
}

export interface ActiveReviewRoute {
  readonly kind: 'review';
  readonly target: ReviewLoadTarget;
  readonly selection?: ReviewSelectionHint;
  readonly fromSearch?: boolean;
}

export type ActiveRoute = ActiveHomeRoute | ActiveReviewRoute;

export type ReviewingSubscriptionScope = WorkspaceProjectionViewScope | ReviewHarnessInteractionViewScope;
