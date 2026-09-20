import assert from 'node:assert/strict';
import test from 'node:test';

import { buildOpportunityKey } from '../../v2/adapters/opportunityIdentity.js';

const base = {
  id: 'abcdef01',
  source: 'siff',
  sourceShowtimeId: null,
  theaterId: 'siff-film-center',
  localDate: '2026-09-20',
  localTime: '18:30',
  filmKey: 'the-hole',
  formatLabels: [],
};

test('performanceId is returned directly for xsrc and host-compatible forms', () => {
  assert.equal(
    buildOpportunityKey({
      ...base,
      performanceId: 'xsrc:grand-illusion:0123456789abcdef',
    }),
    'xsrc:grand-illusion:0123456789abcdef',
  );
  assert.equal(
    buildOpportunityKey({ ...base, performanceId: 'id:abcdef01' }),
    'id:abcdef01',
  );
});

test('existing source and artifact id fallbacks are unchanged', () => {
  assert.equal(
    buildOpportunityKey({ ...base, sourceShowtimeId: 'native-123' }),
    'src:siff:native-123',
  );
  assert.equal(buildOpportunityKey(base), 'id:abcdef01');
});

test('GI to host transition preserves opportunity and Planner keys', () => {
  const performanceId = 'xsrc:grand-illusion:0123456789abcdef';
  const giKey = buildOpportunityKey({
    ...base,
    id: 'gi-fallback',
    source: 'grand_illusion',
    performanceId,
  });
  const hostKey = buildOpportunityKey({ ...base, performanceId });

  assert.equal(hostKey, giKey);
  assert.equal(`opp:${hostKey}`, `opp:${giKey}`);
});
