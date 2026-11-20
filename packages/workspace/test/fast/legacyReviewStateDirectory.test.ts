import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { legacyReviewStateDirectory } from '../../src/legacyReviewImport/index.js';

describe('legacy Review import state directory', () => {
  it('retains the old product state-base rule independently of v1 State', () => {
    expect(legacyReviewStateDirectory({ XDG_STATE_HOME: '/configured/legacy-state' }, '/home/developer')).toBe(
      path.resolve('/configured/legacy-state'),
    );
    expect(legacyReviewStateDirectory({}, '/home/developer')).toBe(path.join('/home/developer', '.local', 'state'));
    expect(legacyReviewStateDirectory({ XDG_STATE_HOME: ' relative-state ' }, '/home/developer')).toBe(
      path.resolve('relative-state'),
    );
  });
});
