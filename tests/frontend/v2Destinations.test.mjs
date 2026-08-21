import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INITIAL_DESTINATION_ID,
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
  containsRejectedPrimaryNavLabel,
  getDestinationById,
  resolveActivePrimaryId,
  resolveDestinationId,
} from '../../v2/destinations.js';

test('PRIMARY_DESTINATIONS is Home Explore Planner Profile', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((item) => item.label),
    ['Home', 'Explore', 'Planner', 'Profile'],
  );
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((item) => item.id),
    ['home', 'explore', 'planner', 'profile'],
  );
});

test('Movies Theaters Me are rejected primary labels', () => {
  const labels = PRIMARY_DESTINATIONS.map((item) => item.label);
  assert.equal(containsRejectedPrimaryNavLabel(labels), false);
  for (const rejected of ['Movies', 'Theaters', 'Me']) {
    assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes(rejected));
    assert.equal(labels.includes(rejected), false);
  }
});

test('initial destination is Home', () => {
  assert.equal(INITIAL_DESTINATION_ID, 'home');
  assert.equal(getDestinationById(INITIAL_DESTINATION_ID)?.label, 'Home');
});

test('resolveDestinationId falls back to Home', () => {
  assert.equal(resolveDestinationId('explore'), 'explore');
  assert.equal(resolveDestinationId('movies'), 'home');
  assert.equal(resolveDestinationId('me'), 'home');
});

test('Film Detail keeps originating primary active', () => {
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: 'home',
      surface: { type: 'film-detail', originPrimary: 'home' },
    }),
    'home',
  );
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: 'explore',
      surface: { type: 'film-detail', originPrimary: 'explore' },
    }),
    'explore',
  );
});

test('collection surfaces highlight Explore except Home-owned Opening', () => {
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: 'home',
      surface: {
        type: 'collection',
        collectionId: 'opening-this-week',
        originPrimary: 'home',
      },
    }),
    'home',
  );
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: 'home',
      surface: {
        type: 'collection',
        collectionId: 'theaters',
        originPrimary: 'explore',
      },
    }),
    'explore',
  );
});
