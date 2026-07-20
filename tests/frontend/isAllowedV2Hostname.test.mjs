import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_V2_HOSTNAMES,
  isAllowedV2Hostname,
} from '../../v2/isAllowedV2Hostname.js';

test('isAllowedV2Hostname accepts localhost variants', () => {
  assert.equal(isAllowedV2Hostname('localhost'), true);
  assert.equal(isAllowedV2Hostname('127.0.0.1'), true);
  assert.equal(isAllowedV2Hostname('[::1]'), true);
});

test('isAllowedV2Hostname rejects non-local hostnames', () => {
  assert.equal(isAllowedV2Hostname('reelseattle.com'), false);
  assert.equal(isAllowedV2Hostname('www.reelseattle.com'), false);
  assert.equal(isAllowedV2Hostname('example.com'), false);
  assert.equal(isAllowedV2Hostname(''), false);
  assert.equal(isAllowedV2Hostname('LOCALHOST'), false);
});

test('isAllowedV2Hostname rejects non-string values', () => {
  assert.equal(isAllowedV2Hostname(null), false);
  assert.equal(isAllowedV2Hostname(undefined), false);
  assert.equal(isAllowedV2Hostname(127), false);
});

test('ALLOWED_V2_HOSTNAMES lists the three local hosts', () => {
  assert.deepEqual([...ALLOWED_V2_HOSTNAMES], [
    'localhost',
    '127.0.0.1',
    '[::1]',
  ]);
});
