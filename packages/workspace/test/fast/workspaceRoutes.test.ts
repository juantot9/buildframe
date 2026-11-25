import { describe, expect, it } from 'vitest';

import { HARNESS_COMMAND_KINDS, HARNESS_SCOPE_KINDS, HARNESS_VIEW_KINDS } from '../../src/harness-interaction/kinds.js';
import { KindRoutes } from '../../src/kindRoutes.js';
import { LEGACY_REVIEW_COMMAND_KINDS, LEGACY_REVIEW_VIEW_KINDS } from '../../src/legacyReviewImport/kinds.js';
import { PROJECTION_SCOPE_KINDS, PROJECTION_VIEW_KINDS } from '../../src/projection/kinds.js';
import { REVIEWING_COMMAND_KINDS } from '../../src/reviewing/kinds.js';
import { EVIDENCE_VIEW_KINDS } from '../../src/workspaceEvidence/kinds.js';

// Each list is checked complete against its owner's union when compiled; these
// checks prove no kind has two owners, so routing never depends on list order.
const OWNERS = {
  command: [REVIEWING_COMMAND_KINDS, LEGACY_REVIEW_COMMAND_KINDS, HARNESS_COMMAND_KINDS],
  view: [
    ['workspace.identity'],
    EVIDENCE_VIEW_KINDS,
    LEGACY_REVIEW_VIEW_KINDS,
    HARNESS_VIEW_KINDS,
    PROJECTION_VIEW_KINDS,
  ],
  subscription: [['workspace.identity'], HARNESS_SCOPE_KINDS, PROJECTION_SCOPE_KINDS],
} as const;

describe('Workspace routing by owner declaration', () => {
  it('gives every command, view and subscription kind exactly one owner', () => {
    for (const [what, lists] of Object.entries(OWNERS)) {
      const routes = new KindRoutes<number>(
        what,
        lists.map((kinds, owner) => [kinds, owner] as const),
      );
      const all = lists.flat();
      expect(routes.kinds()).toHaveLength(all.length);
      expect(new Set(all).size).toBe(all.length);
    }
    expect(OWNERS.command.flat()).toHaveLength(25);
    expect(OWNERS.view.flat()).toHaveLength(56);
    expect(OWNERS.subscription.flat()).toHaveLength(14);
  });

  it('refuses a kind claimed twice and an unknown kind', () => {
    expect(
      () =>
        new KindRoutes('command', [
          [['review.cancel'], 1],
          [['review.cancel'], 2],
        ]),
    ).toThrow('Workspace command kind review.cancel has two owners');
    const routes = new KindRoutes('command', [[['review.cancel'], 1]]);
    expect(routes.route('review.cancel', 'command')).toBe(1);
    expect(() => routes.route('review.unknown', 'command')).toThrow('Unknown Workspace command kind');
    expect(() => routes.route(undefined, 'command')).toThrow(TypeError);
  });
});
