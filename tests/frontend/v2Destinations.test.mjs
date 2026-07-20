import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_DESTINATION_ID,
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
  containsRejectedPrimaryNavLabel,
  getDestinationById,
  resolveDestinationId,
} from '../../v2/destinations.js';

test('PRIMARY_DESTINATIONS uses canonical Home Explore Planner Profile order', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((item) => item.label),
    ['Home', 'Explore', 'Planner', 'Profile'],
  );
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((item) => item.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});

test('initial destination is Home', () => {
  assert.equal(INITIAL_DESTINATION_ID, 'home');
  assert.equal(getDestinationById(INITIAL_DESTINATION_ID)?.label, 'Home');
});

test('resolveDestinationId falls back to Home for unknown ids', () => {
  assert.equal(resolveDestinationId('explore'), 'explore');
  assert.equal(resolveDestinationId('missing'), 'home');
  assert.equal(resolveDestinationId(''), 'home');
});

test('primary destination labels do not include rejected names', () => {
  const labels = PRIMARY_DESTINATIONS.map((item) => item.label);
  assert.equal(containsRejectedPrimaryNavLabel(labels), false);
  for (const rejected of REJECTED_PRIMARY_NAV_LABELS) {
    assert.equal(labels.includes(rejected), false);
  }
});

test('containsRejectedPrimaryNavLabel detects forbidden labels', () => {
  assert.equal(containsRejectedPrimaryNavLabel(['Home', 'Movies']), true);
  assert.equal(containsRejectedPrimaryNavLabel(['Me']), true);
  assert.equal(containsRejectedPrimaryNavLabel(['Home', 'Explore']), false);
});

test('each destination exposes accessible title and placeholder copy', () => {
  for (const destination of PRIMARY_DESTINATIONS) {
    assert.ok(destination.title.length > 0);
    assert.ok(destination.description.length > 0);
    assert.match(destination.description, /slice|later|placeholder/i);
  }
});
