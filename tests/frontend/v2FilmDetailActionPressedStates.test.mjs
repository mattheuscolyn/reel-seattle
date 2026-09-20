import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildNotInterestedActionState,
} from '../../v2/save/notInterestedActionState.js';
import { buildSaveActionState } from '../../v2/save/saveActionState.js';
import { buildSeenActionState } from '../../v2/save/seenActionState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function actionBlock(classToken) {
  const start = SURFACE.indexOf(`v2-fd-action-${classToken}`);
  assert.ok(start >= 0, `missing ${classToken} action`);
  const end = SURFACE.indexOf('</button>', start);
  return SURFACE.slice(start - 80, end + '</button>'.length);
}

test('Film Detail toggle actions expose aria-pressed; Planner does not', () => {
  assert.match(SURFACE, /aria-pressed=\{isSaved\}/);
  assert.match(SURFACE, /aria-pressed=\{isSeen\}/);
  assert.match(SURFACE, /aria-pressed=\{isNotInterested\}/);

  const planner = actionBlock('planner');
  assert.equal(planner.includes('aria-pressed'), false);
  assert.match(planner, /Find a time/);
  assert.match(planner, /onClick=\{openAllShowtimes\}/);
});

test('selected toggles use shared is-selected plus accent classes', () => {
  assert.match(
    SURFACE,
    /v2-fd-action v2-fd-action-save v2-fd-action-save-on is-selected/,
  );
  assert.match(
    SURFACE,
    /v2-fd-action v2-fd-action-seen v2-fd-action-seen-on is-selected/,
  );
  assert.match(
    SURFACE,
    /v2-fd-action v2-fd-action-hide v2-fd-action-hide-on is-selected/,
  );
  assert.equal(SURFACE.includes('v2-fd-action-planner is-selected'), false);
  assert.match(SURFACE, /: 'v2-fd-action v2-fd-action-save'/);
  assert.match(SURFACE, /: 'v2-fd-action v2-fd-action-seen'/);
  assert.match(SURFACE, /: 'v2-fd-action v2-fd-action-hide'/);
});

test('selected actions render a decorative IconCheck only when pressed', () => {
  assert.match(SURFACE, /IconCheck/);
  assert.match(SURFACE, /v2-fd-action-check/);
  assert.match(SURFACE, /\{isSaved \? \(/);
  assert.match(SURFACE, /\{isSeen \? \(/);
  assert.match(SURFACE, /\{isNotInterested \? \(/);
  assert.match(SURFACE, /aria-hidden="true"/);
  const planner = actionBlock('planner');
  assert.equal(planner.includes('IconCheck'), false);
});

test('selected CSS uses container cues beyond color alone', () => {
  assert.match(CSS, /\.v2-fd-action\.is-selected\s*\{[^}]*font-weight:\s*700/s);
  assert.match(CSS, /\.v2-fd-action-seen-on[\s\S]*?background:\s*rgba\(/);
  assert.match(CSS, /\.v2-fd-action-seen-on[\s\S]*?box-shadow:\s*inset/);
  assert.match(CSS, /\.v2-fd-action-save-on[\s\S]*?background:\s*rgba\(/);
  assert.match(CSS, /\.v2-fd-action-save-on[\s\S]*?box-shadow:\s*inset/);
  assert.match(CSS, /\.v2-fd-action-hide-on[\s\S]*?background:\s*rgba\(/);
  assert.match(CSS, /\.v2-fd-action-hide-on[\s\S]*?box-shadow:\s*inset/);

  const seenOn = CSS.match(
    /\.v2-fd-action-seen-on,\s*\.v2-fd-action-seen\.is-selected\s*\{([^}]+)\}/,
  );
  assert.ok(seenOn, 'Seen selected rule missing');
  assert.match(seenOn[1], /background:/);
  assert.match(seenOn[1], /box-shadow:\s*inset/);
  assert.equal(seenOn[1].includes('background: transparent'), false);
});

test('focus-visible remains usable on selected actions', () => {
  assert.match(CSS, /\.v2-fd-action:focus-visible\s*\{[^}]*outline:\s*2px/s);
});

test('disabled styling overrides selected accents', () => {
  assert.match(CSS, /\.v2-fd-action\.is-selected:disabled/);
  assert.match(CSS, /\.v2-fd-action:disabled/);
  assert.match(
    CSS,
    /\.v2-fd-action\.is-selected:disabled[\s\S]*?background:\s*transparent/,
  );
});

test('action-state builders never mark selected when unavailable', () => {
  const save = buildSaveActionState({ mode: 'production', film: null });
  const seen = buildSeenActionState({ mode: 'production', film: null });
  const hide = buildNotInterestedActionState({
    mode: 'production',
    film: null,
  });
  assert.equal(save.available, false);
  assert.equal(save.isSaved, false);
  assert.equal(seen.available, false);
  assert.equal(seen.isSeen, false);
  assert.equal(hide.available, false);
  assert.equal(hide.isNotInterested, false);
});

test('Save label still flips to Saved when active', () => {
  const saved = buildSaveActionState({
    mode: 'mockup-fixture',
    fixtureIsSaved: true,
  });
  const idle = buildSaveActionState({
    mode: 'mockup-fixture',
    fixtureIsSaved: false,
  });
  assert.equal(saved.label, 'Saved');
  assert.equal(idle.label, 'Save');
  assert.match(SURFACE, /\{saveLabel\}/);
  assert.match(SURFACE, /v2-fd-action-text">Seen</);
  assert.match(SURFACE, /v2-fd-action-text">Not interested</);
});

test('four-column Film Detail action toolbar is preserved', () => {
  assert.match(CSS, /\.v2-fd-actions\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/s);
  assert.match(SURFACE, /role="toolbar"/);
  assert.match(SURFACE, /aria-label="Film actions"/);
});
