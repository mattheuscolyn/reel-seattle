import test from 'node:test';
import assert from 'node:assert/strict';
import { isMarathonRoute, MARATHON_IFRAME_SRC, MARATHON_ROUTE } from '../../src/utils/routes.js';

test('MARATHON_ROUTE has no trailing slash', () => {
  assert.equal(MARATHON_ROUTE, '/marathon');
});

test('isMarathonRoute matches /marathon and /marathon/', () => {
  assert.equal(isMarathonRoute('/marathon'), true);
  assert.equal(isMarathonRoute('/marathon/'), true);
  assert.equal(isMarathonRoute('/marathon/index.html'), false);
});

test('MARATHON_IFRAME_SRC points at standalone planner HTML', () => {
  assert.equal(MARATHON_IFRAME_SRC, '/marathon/index.html');
});
