import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPosterUrl, normalizePosterUrl } from '../../src/utils/posterUtils.js';

test('hasPosterUrl returns true for a valid URL', () => {
  assert.equal(hasPosterUrl('https://example.com/poster.jpg'), true);
});

test('hasPosterUrl returns false for empty string', () => {
  assert.equal(hasPosterUrl(''), false);
});

test('hasPosterUrl returns false for whitespace-only string', () => {
  assert.equal(hasPosterUrl('   '), false);
});

test('hasPosterUrl returns false for null and undefined', () => {
  assert.equal(hasPosterUrl(null), false);
  assert.equal(hasPosterUrl(undefined), false);
});

test('hasPosterUrl returns false for legacy None sentinel', () => {
  assert.equal(hasPosterUrl('None'), false);
  assert.equal(hasPosterUrl(' none '), false);
});

test('normalizePosterUrl trims surrounding whitespace', () => {
  assert.equal(
    normalizePosterUrl('  https://example.com/poster.jpg  '),
    'https://example.com/poster.jpg',
  );
});

test('normalizePosterUrl returns null for invalid values', () => {
  for (const value of ['', '   ', null, undefined, 'None', ' None ']) {
    assert.equal(normalizePosterUrl(value), null, `expected null for ${String(value)}`);
  }
});
