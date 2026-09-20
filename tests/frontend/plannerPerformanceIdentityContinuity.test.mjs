import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPerformanceKey } from '../../src/utils/performanceIdentity.js';

test('Planner wraps a stable opportunity key with opp namespace', () => {
  const opportunityKey = 'xsrc:grand-illusion:0123456789abcdef';
  const giPlannerKey = buildPerformanceKey({
    opportunityKey,
    source: 'grand_illusion',
  });
  const hostPlannerKey = buildPerformanceKey({
    opportunityKey,
    source: 'siff',
  });

  assert.equal(giPlannerKey, `opp:${opportunityKey}`);
  assert.equal(hostPlannerKey, giPlannerKey);
});
