import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_NAV_LINKS, LEGACY_PLANNER_ROUTES } from '../../src/appNav.js';
import { buildPlannerPathFromDoubleFeature, buildPlannerPathFromMarathon } from '../../src/utils/plannerUrlState.js';
import { MARATHON_ROUTE } from '../../src/utils/routes.js';

test('APP_NAV_LINKS lists only primary app surfaces', () => {
  assert.deepEqual(
    APP_NAV_LINKS.map((link) => link.label),
    ['Showtimes', 'Planner'],
  );
  assert.equal(
    APP_NAV_LINKS.some((link) => link.label.toLowerCase().includes('legacy')),
    false,
  );
});

test('LEGACY_PLANNER_ROUTES keeps double-feature and marathon reachable', () => {
  assert.equal(LEGACY_PLANNER_ROUTES.doubleFeature, '/double-feature');
  assert.equal(LEGACY_PLANNER_ROUTES.marathon, '/marathon');
});

test('buildPlannerPathFromDoubleFeature redirects bare legacy route to planner count=2', () => {
  assert.equal(buildPlannerPathFromDoubleFeature(''), '/planner?count=2');
});

test('buildPlannerPathFromDoubleFeature maps legacy share URL to planner query params', () => {
  const path = buildPlannerPathFromDoubleFeature(
    'date=06/28/2026&theaters=AMC+Southcenter+16&start=2%3A00PM&movies=Sinners',
  );
  assert.match(path, /^\/planner\?/);
  assert.match(path, /count=2/);
  assert.match(path, /date=06%2F28%2F2026/);
  assert.match(path, /theaters=AMC\+Southcenter\+16/);
  assert.match(path, /start=2%3A00PM/);
  assert.match(path, /movies=Sinners/);
  assert.doesNotMatch(path, /finish=/);
  assert.doesNotMatch(path, /end=/);
});

test('buildPlannerPathFromDoubleFeature does not migrate legacy end param', () => {
  const path = buildPlannerPathFromDoubleFeature('date=06/28/2026&end=10%3A00PM');
  assert.doesNotMatch(path, /finish=/);
  assert.doesNotMatch(path, /end=/);
  assert.match(path, /date=06%2F28%2F2026/);
});

test('MARATHON_ROUTE has no trailing slash', () => {
  assert.equal(MARATHON_ROUTE, '/marathon');
});

test('buildPlannerPathFromMarathon redirects bare legacy route to planner count=max', () => {
  const storage = { getItem: () => null };
  assert.equal(buildPlannerPathFromMarathon(storage), '/planner?count=max&from=marathon');
});
