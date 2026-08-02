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
  assert.equal(isAllowedV2Hostname('LOCALHOST'), true);
});

test('isAllowedV2Hostname accepts production Reel Seattle hosts', () => {
  assert.equal(isAllowedV2Hostname('www.reelseattle.com'), true);
  assert.equal(isAllowedV2Hostname('reelseattle.com'), true);
  assert.equal(isAllowedV2Hostname('WWW.ReelSeattle.COM'), true);
  assert.equal(isAllowedV2Hostname('  www.reelseattle.com  '), true);
});

test('isAllowedV2Hostname rejects non-allowlisted hostnames', () => {
  assert.equal(isAllowedV2Hostname('example.com'), false);
  assert.equal(isAllowedV2Hostname('staging.reelseattle.com'), false);
  assert.equal(isAllowedV2Hostname('reelseattle.com.evil.example'), false);
  assert.equal(isAllowedV2Hostname('mattheuscolyn.github.io'), false);
  assert.equal(isAllowedV2Hostname(''), false);
  assert.equal(isAllowedV2Hostname('   '), false);
});

test('isAllowedV2Hostname rejects non-string values', () => {
  assert.equal(isAllowedV2Hostname(null), false);
  assert.equal(isAllowedV2Hostname(undefined), false);
  assert.equal(isAllowedV2Hostname(127), false);
});

test('ALLOWED_V2_HOSTNAMES lists local and production hosts', () => {
  assert.deepEqual([...ALLOWED_V2_HOSTNAMES].sort(), [
    '127.0.0.1',
    '[::1]',
    'localhost',
    'reelseattle.com',
    'www.reelseattle.com',
  ].sort());
});
