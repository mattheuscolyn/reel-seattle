import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAVING_SOON_FIXTURES,
  OPENING_THIS_WEEK_FIXTURES,
  TOP_OPPORTUNITY_FIXTURES,
} from '../../v2/fixtures/homeVisualFixtures.js';

test('visual-only fixtures remain labeled design-fixture and are not Home defaults', () => {
  assert.equal(TOP_OPPORTUNITY_FIXTURES.length, 3);
  assert.equal(OPENING_THIS_WEEK_FIXTURES.length, 4);
  assert.equal(LEAVING_SOON_FIXTURES.length, 4);
  for (const item of [
    ...TOP_OPPORTUNITY_FIXTURES,
    ...OPENING_THIS_WEEK_FIXTURES,
    ...LEAVING_SOON_FIXTURES,
  ]) {
    assert.equal(item.source, 'design-fixture');
  }
});
