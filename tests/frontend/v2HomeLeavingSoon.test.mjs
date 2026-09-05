import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { buildLeavingSoon } from '../../v2/adapters/buildLeavingSoon.js';
import { buildLeavingSoonShelf } from '../../v2/home/shelfData.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

const leavingSoonArtifact = {
  schema_version: '1.1.0',
  generated_at: '2026-09-04T12:00:00-07:00',
  source: 'amc',
  model_version: 'amc_remaining_run_survival_v1',
  window: { start_date: '2026-09-04', end_date: '2026-09-17' },
  method: {
    name: 'amc_remaining_run_survival_v1',
    description: 'Frozen remaining-run model.',
    evaluated_precision: 0.925,
    evaluated_recall: 0.715,
    evaluated_coverage: 0.715,
    evaluation_note: 'Not a guarantee.',
  },
  stats: { candidate_film_count: 3, flagged_film_count: 2 },
  items: [
    {
      film_key: 'sinners',
      film_title: 'Sinners',
      risk_level: 'high',
      reason: 'This theatrical run looks likely to end this week.',
      leaving_soon_bucket: 'last_chance',
      sort_rank: 1,
      visible_show_date_count: 2,
      min_show_date: '2026-09-04',
      max_show_date: '2026-09-05',
      total_visible_showtimes: 4,
      total_visible_theaters: 2,
      theaters: [],
      show_dates: ['2026-09-04'],
      has_primetime: true,
      has_weekend_show: true,
      poster_url: 'https://example.com/sinners.jpg',
      runtime_min: 137,
    },
    {
      film_key: 'indie-film',
      film_title: 'Indie Film',
      risk_level: 'elevated',
      reason: 'This theatrical run may be winding down soon.',
      leaving_soon_bucket: 'leaving_soon',
      sort_rank: 2,
      visible_show_date_count: 3,
      min_show_date: '2026-09-04',
      max_show_date: '2026-09-10',
      total_visible_showtimes: 6,
      total_visible_theaters: 1,
      theaters: [],
      show_dates: ['2026-09-04'],
      has_primetime: true,
      has_weekend_show: false,
      poster_url: null,
      runtime_min: 100,
    },
  ],
};

test('Leaving Soon adapter maps buckets and preserves rank', () => {
  const model = buildLeavingSoon(leavingSoonArtifact);
  assert.equal(model.status, 'ready');
  assert.equal(model.entries.length, 2);
  assert.equal(model.entries[0].bucket, 'last_chance');
  assert.equal(model.entries[0].bucketLabel, 'Last chance');
  assert.equal(model.entries[1].bucketLabel, 'Leaving soon');
  assert.equal(model.modelVersion, 'amc_remaining_run_survival_v1');
});

test('Leaving Soon shelf renders bucket badges without exact-day copy', () => {
  const home = buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: { entries: [] },
    leavingSoon: leavingSoonArtifact,
  });
  const shelf = buildLeavingSoonShelf(home);
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films[0].badge, 'Last chance');
  assert.equal(shelf.films[1].badge, 'Leaving soon');
  const dump = JSON.stringify(shelf);
  assert.equal(/days left/i.test(dump), false);
  assert.equal(/\d+%/.test(dump), false);
  assert.equal(/AI/i.test(dump), false);
});

test('Leaving Soon empty artifact is an honest empty state', () => {
  const empty = buildLeavingSoon({
    ...leavingSoonArtifact,
    items: [],
    stats: { candidate_film_count: 0, flagged_film_count: 0 },
  });
  const shelf = buildLeavingSoonShelf({ leavingSoon: empty, films: [], opportunities: [] });
  assert.equal(shelf.films.length, 0);
  assert.match(shelf.emptyTitle, /Nothing leaving soon/i);
});

test('Leaving Soon missing artifact degrades without crashing', () => {
  const missing = buildLeavingSoon(null);
  assert.equal(missing.status, 'unavailable');
  const shelf = buildLeavingSoonShelf({
    leavingSoon: missing,
    films: [],
    opportunities: [],
  });
  assert.equal(shelf.status, 'unavailable');
  assert.equal(shelf.films.length, 0);
});
