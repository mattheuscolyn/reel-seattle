/**
 * Adjust Film in Plans overlay — Require/Prefer/Exclude + stores wiring markers.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OVERLAY = readFileSync(
  join(ROOT, 'v2/planner/AdjustFilmInPlansOverlay.jsx'),
  'utf8',
);
const RESULTS = readFileSync(
  join(ROOT, 'v2/planner/BuildPlanResultsSurface.jsx'),
  'utf8',
);
const DIALOG = readFileSync(
  join(ROOT, 'v2/planner/PlanAdjustmentDialog.jsx'),
  'utf8',
);

test('film overlay exposes dialog semantics and Cancel/Apply', () => {
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(OVERLAY, /Cancel/);
  assert.match(OVERLAY, /Apply/);
});

test('require prefer exclude radio group', () => {
  assert.match(OVERLAY, /role="radiogroup"/);
  assert.match(OVERLAY, /role="radio"/);
  assert.match(OVERLAY, /id: 'require'/);
  assert.match(OVERLAY, /id: 'prefer'/);
  assert.match(OVERLAY, /id: 'exclude'/);
});

test('seen and not interested switches are isolated from preference radios', () => {
  assert.match(OVERLAY, /role="switch"/);
  assert.match(OVERLAY, /Seen/);
  assert.match(OVERLAY, /Not interested/);
  assert.match(RESULTS, /markFilmSeen|isFilmSeen/);
  assert.match(RESULTS, /markFilmNotInterested|isFilmNotInterested/);
});

test('results no longer mounts legacy PlanFilmInteractionSheet', () => {
  assert.doesNotMatch(RESULTS, /PlanFilmInteractionSheet/);
});
