import test from 'node:test';
import assert from 'node:assert/strict';
import { getShareUrlFromLocation } from '../../src/utils/shareLinkUtils.js';

test('getShareUrlFromLocation returns href when present', () => {
  assert.equal(
    getShareUrlFromLocation({
      href: 'http://localhost:5173/double-feature?date=06%2F27%2F2026',
    }),
    'http://localhost:5173/double-feature?date=06%2F27%2F2026',
  );
});

test('getShareUrlFromLocation builds URL from origin pathname and search', () => {
  assert.equal(
    getShareUrlFromLocation({
      origin: 'http://localhost:5173',
      pathname: '/double-feature',
      search: '?theaters=SIFF',
    }),
    'http://localhost:5173/double-feature?theaters=SIFF',
  );
});

test('getShareUrlFromLocation returns empty string for missing location parts', () => {
  assert.equal(getShareUrlFromLocation({}), '');
  assert.equal(getShareUrlFromLocation(null), '');
});
