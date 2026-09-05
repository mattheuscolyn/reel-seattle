import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildHomeData,
  LEAVING_SOON_EXCLUDED,
} from '../../v2/adapters/buildHomeData.js';
import { buildOpportunityKey } from '../../v2/adapters/opportunityIdentity.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function baseInput(overrides = {}) {
  return {
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
    ...overrides,
  };
}

test('valid showtimes transform into films and opportunities', () => {
  const home = buildHomeData(baseInput());
  assert.equal(home.films.length, 2);
  assert.ok(home.opportunities.length >= 3);
  assert.equal(home.leavingSoonExcluded, false);
  assert.equal(LEAVING_SOON_EXCLUDED, false);
  assert.equal(home.leavingSoon.status, 'unavailable');

  const sinners = home.films.find((film) => film.filmKey === 'sinners');
  assert.ok(sinners);
  assert.equal(sinners.title, 'Sinners');
  assert.equal(sinners.posterUrl, 'https://example.com/sinners.jpg');
  assert.equal(sinners.runtimeMin, 137);
  assert.equal(sinners.filmId, 'tmdb:1133620');
  assert.ok(sinners.showtimeCount >= 2);
  assert.ok(sinners.theaterCount >= 1);
  assert.equal(sinners.firstShowtimeAt, '2026-06-28T00:15');

  const indie = home.films.find((film) => film.filmKey === 'indie-film');
  assert.equal(indie.filmId, null);
});

test('canonical filmId ignores raw source ids and titles', () => {
  const showtimes = loadFixture('v2_showtimes_home_mini.json');
  showtimes.films = showtimes.films.map((film) => ({
    ...film,
    film_id: film.showtime_film_key === 'sinners' ? 'amc-sinners' : 'Sinners',
  }));
  const home = buildHomeData(baseInput({ showtimesCurrent: showtimes }));
  assert.equal(home.films.find((film) => film.filmKey === 'sinners').filmId, null);
  assert.equal(home.films.find((film) => film.filmKey === 'indie-film').filmId, null);
});

test('theater registry resolves ids and neighborhoods', () => {
  const home = buildHomeData(baseInput());
  const pacific = home.theatersById['amc-pacific-place-11'];
  assert.equal(pacific.name, 'AMC Pacific Place 11');
  assert.equal(pacific.neighborhood, 'Downtown Seattle');
  assert.ok(pacific.opportunityCount >= 1);
  assert.equal(pacific.addressLine1, null);
  assert.equal(pacific.websiteUrl, null);
  assert.deepEqual(pacific.amenities, []);
  assert.deepEqual(pacific.capabilities, []);
});

test('unknown theater ids produce recoverable warnings', () => {
  const home = buildHomeData(baseInput());
  const unknown = home.warnings.find((warning) => warning.code === 'unknown_theater_id');
  assert.ok(unknown);
  assert.equal(unknown.severity, 'recoverable');
  assert.equal(unknown.context.theaterId, 'unknown-theater-99');
  const opp = home.opportunities.find((item) => item.theaterId === 'unknown-theater-99');
  assert.ok(opp);
});

test('missing optional poster does not fail film', () => {
  const home = buildHomeData(baseInput());
  const indie = home.films.find((film) => film.filmKey === 'indie-film');
  assert.ok(indie);
  assert.equal(indie.posterUrl, null);
  assert.equal(indie.title, 'Indie Film');
});

test('missing required title skips record with warning', () => {
  const home = buildHomeData(baseInput());
  const skipped = home.warnings.find((warning) => warning.code === 'missing_title');
  assert.ok(skipped);
  assert.equal(skipped.severity, 'record_skipped');
  assert.equal(
    home.films.some((film) => film.filmKey === 'blank-title'),
    false,
  );
});

test('opportunity ordering is deterministic chronological then stable keys', () => {
  const home = buildHomeData(baseInput());
  const keys = home.opportunities.map((item) => item.chronologicalKey ?? item.sortableLocalDateTime);
  const sorted = [...home.opportunities].sort((a, b) => {
    if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
      return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
    }
    if (a.theaterId !== b.theaterId) return a.theaterId < b.theaterId ? -1 : 1;
    if (a.filmKey !== b.filmKey) return a.filmKey < b.filmKey ? -1 : 1;
    return a.opportunityKey < b.opportunityKey ? -1 : 1;
  });
  assert.deepEqual(
    home.opportunities.map((item) => item.opportunityKey),
    sorted.map((item) => item.opportunityKey),
  );
  assert.equal(home.opportunities[0].sortableLocalDateTime, '2026-06-28T00:15');
  assert.ok(keys.length > 0);
});

test('distinct performances are preserved', () => {
  const home = buildHomeData(baseInput());
  const sinnersOpps = home.opportunities.filter((item) => item.filmKey === 'sinners');
  assert.ok(sinnersOpps.length >= 3);
  const times = new Set(sinnersOpps.map((item) => `${item.localDate}T${item.localTime}|${item.formatLabels.join(',')}`));
  assert.ok(times.size >= 3);
});

test('true duplicate identities are deduplicated with warning', () => {
  const home = buildHomeData(baseInput());
  const dup = home.warnings.find((warning) => warning.code === 'duplicate_opportunity_identity');
  assert.ok(dup);
  const matching = home.opportunities.filter(
    (item) => item.sourceShowtimeId === 'amc-perf-2',
  );
  assert.equal(matching.length, 1);
});

test('newly-added records connect to current opportunities when present', () => {
  const home = buildHomeData(baseInput());
  const sinners = home.newlyAdded.find((item) => item.filmKey === 'sinners');
  assert.ok(sinners);
  assert.equal(sinners.hasActiveShowtimes, true);
  assert.ok(sinners.opportunityCount >= 1);
  assert.equal(sinners.posterUrl, 'https://example.com/sinners.jpg');
  assert.ok(sinners.nextShowtimeAt);
});

test('newly-added without active showtimes stay honest', () => {
  const home = buildHomeData(baseInput());
  const ghost = home.newlyAdded.find((item) => item.filmKey === 'ghost-film');
  assert.ok(ghost);
  assert.equal(ghost.hasActiveShowtimes, false);
  assert.equal(ghost.opportunityCount, 0);
  assert.equal(ghost.nextShowtimeAt, null);
  assert.equal(ghost.posterUrl, null);
});

test('valid-empty showtimes return empty collections', () => {
  const empty = {
    schema_version: '1.0.0',
    generated_at: '2026-06-26T12:00:00-07:00',
    timezone: 'America/Los_Angeles',
    theaters: [],
    films: [],
    showtimes: [],
  };
  const home = buildHomeData({
    showtimesCurrent: empty,
    theatersRegistry: { theaters: [] },
    newlyAdded: { entries: [] },
    pipelineReport: null,
  });
  assert.equal(home.films.length, 0);
  assert.equal(home.opportunities.length, 0);
  assert.equal(home.newlyAdded.length, 0);
  assert.equal(home.counts.films, 0);
});

test('malformed top-level showtimes artifact fails clearly', () => {
  assert.throws(
    () => buildHomeData({ showtimesCurrent: { films: [] } }),
    /showtimes array/,
  );
  assert.throws(
    () => buildHomeData({ showtimesCurrent: null }),
    /JSON object/,
  );
});

test('midnight-adjacent times preserve local date semantics', () => {
  const home = buildHomeData(baseInput());
  const midnight = home.opportunities.find(
    (item) => item.sortableLocalDateTime === '2026-06-28T00:15',
  );
  assert.ok(midnight);
  assert.equal(midnight.localDate, '2026-06-28');
  assert.equal(midnight.localTime, '00:15');
  assert.equal(midnight.timeDisplay, '12:15 AM');
});

test('Home data contract includes Leaving Soon without fabricated fields', () => {
  const home = buildHomeData(baseInput());
  assert.equal(home.leavingSoonExcluded, false);
  assert.ok('leavingSoon' in home);
  assert.equal(home.leavingSoon.status, 'unavailable');
  assert.equal('leaving_soon' in home, false);

  for (const film of home.films) {
    assert.equal('culturalScore' in film, false);
    assert.equal('personalizedScore' in film, false);
    assert.equal('synopsis' in film, false);
    assert.equal('landscapeImageUrl' in film, false);
    assert.equal('bestOpportunity' in film, false);
  }
  for (const candidate of home.opportunityCandidates) {
    assert.equal('recommendationScore' in candidate, false);
    assert.equal('importance' in candidate, false);
    assert.equal('urgency' in candidate, false);
    assert.ok(candidate.chronologicalKey);
  }
});

test('opportunityCandidates provide mechanical selection inputs only', () => {
  const home = buildHomeData(baseInput());
  assert.equal(home.opportunityCandidates.length, home.opportunities.length);
  const first = home.opportunityCandidates[0];
  assert.equal(typeof first.isNewlyAdded, 'boolean');
  assert.equal(typeof first.filmShowtimeCount, 'number');
  assert.equal(typeof first.hasPoster, 'boolean');
});

test('source health maps pipeline report when present', () => {
  const home = buildHomeData(baseInput());
  assert.ok(home.sourceHealth);
  assert.equal(home.sourceHealth.status, 'success');
  assert.ok(home.sourceHealth.sources.amc);
});

test('buildOpportunityKey prefers source performance id', () => {
  assert.equal(
    buildOpportunityKey({
      id: 'local-id',
      source: 'amc',
      sourceShowtimeId: 'perf-9',
      theaterId: 't1',
      localDate: '2026-06-28',
      localTime: '19:30',
      filmKey: 'sinners',
      formatLabels: ['IMAX'],
    }),
    'src:amc:perf-9',
  );
});
