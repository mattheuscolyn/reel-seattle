import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_COCKPIT_HOSTNAMES,
  isAllowedCockpitHostname,
} from '../../cockpit/isAllowedCockpitHostname.js';

test('isAllowedCockpitHostname accepts localhost variants', () => {
  assert.equal(isAllowedCockpitHostname('localhost'), true);
  assert.equal(isAllowedCockpitHostname('127.0.0.1'), true);
  assert.equal(isAllowedCockpitHostname('[::1]'), true);
});

test('isAllowedCockpitHostname rejects non-local hostnames', () => {
  assert.equal(isAllowedCockpitHostname('reelseattle.com'), false);
  assert.equal(isAllowedCockpitHostname('www.reelseattle.com'), false);
  assert.equal(isAllowedCockpitHostname('example.com'), false);
  assert.equal(isAllowedCockpitHostname(''), false);
  assert.equal(isAllowedCockpitHostname('LOCALHOST'), false);
});

test('isAllowedCockpitHostname rejects non-string values', () => {
  assert.equal(isAllowedCockpitHostname(null), false);
  assert.equal(isAllowedCockpitHostname(undefined), false);
  assert.equal(isAllowedCockpitHostname(127), false);
});

test('ALLOWED_COCKPIT_HOSTNAMES lists the three local hosts', () => {
  assert.deepEqual([...ALLOWED_COCKPIT_HOSTNAMES], [
    'localhost',
    '127.0.0.1',
    '[::1]',
  ]);
});
