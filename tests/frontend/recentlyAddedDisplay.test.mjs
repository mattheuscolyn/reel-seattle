import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  daysBackFromArtifact,
  parseRecentlyAddedEntries,
} from '../../src/utils/recentlyAddedAdapter.js';
import {
  buildRecentlyAddedFilms,
  buildRecentlyAddedSection,
  formatFirstAnnouncedLabel,
  formatRecentlyAddedSectionCount,
  formatRecentlyAddedSubtitle,
} from '../../src/utils/recentlyAddedDisplay.js';
import { rowsFromShowtimesCurrent } from '../../src/showtimesAdapter.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const miniArtifact = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'newly_added_current_mini.json'), 'utf8'),
);
const showtimesArtifact = JSON.parse(
  readFileSync(join(FIXTURES_DIR, 'showtimes_current_mini.json'), 'utf8'),
);
const miniRows = rowsFromShowtimesCurrent(showtimesArtifact);

test('parseRecentlyAddedEntries maps valid artifact entries', () => {
  const entries = parseRecentlyAddedEntries(miniArtifact);

  assert.equal(entries.length, 4);
  assert.equal(entries[0].showtime_film_key, 'sinners');
  assert.equal(entries[0].theater_id, 'amc-pacific-place-11');
  assert.equal(entries[0].first_announced_date, '2026-06-25');
  assert.ok(!entries.some((entry) => entry.showtime_film_key === 'bad-entry'));
});

test('buildRecentlyAddedFilms groups entries by film', () => {
  const films = buildRecentlyAddedFilms(miniArtifact, miniRows);

  assert.equal(films.length, 2);
  assert.deepEqual(
    films.map((film) => film.showtime_film_key),
    ['indie-film', 'sinners'],
  );
  assert.equal(films[0].film_title, 'Indie Film');
  assert.equal(films[0].theaters.length, 1);
});

test('buildRecentlyAddedFilms dedupes duplicate theater entries', () => {
  const films = buildRecentlyAddedFilms(miniArtifact, miniRows);
  const indie = films.find((film) => film.showtime_film_key === 'indie-film');

  assert.ok(indie);
  assert.equal(indie.theaters.length, 1);
  assert.equal(indie.showtimeCount, 1);
});

test('buildRecentlyAddedFilms omits entries with no matching showtime rows', () => {
  const films = buildRecentlyAddedFilms(miniArtifact, miniRows);
  const keys = films.map((film) => film.showtime_film_key);

  assert.ok(!keys.includes('ghost-film'));
});

test('buildRecentlyAddedFilms sorts newest first announced films first', () => {
  const films = buildRecentlyAddedFilms(miniArtifact, miniRows);

  assert.equal(films[0].showtime_film_key, 'indie-film');
  assert.equal(films[0].first_announced_date, '2026-06-26');
  assert.equal(films[1].showtime_film_key, 'sinners');
  assert.equal(films[1].first_announced_date, '2026-06-25');
});

test('buildRecentlyAddedFilms includes poster from matching showtime rows', () => {
  const films = buildRecentlyAddedFilms(miniArtifact, miniRows);
  const sinners = films.find((film) => film.showtime_film_key === 'sinners');

  assert.equal(sinners.poster, 'https://example.com/sinners.jpg');
});

test('buildRecentlyAddedFilms handles missing rows gracefully', () => {
  assert.deepEqual(buildRecentlyAddedFilms(miniArtifact, []), []);
  assert.deepEqual(buildRecentlyAddedFilms(null, miniRows), []);
});

test('formatRecentlyAddedSubtitle uses days_back when available', () => {
  assert.equal(
    formatRecentlyAddedSubtitle(daysBackFromArtifact(miniArtifact)),
    'Newly announced in the last 7 days and currently showing.',
  );
  assert.equal(
    formatRecentlyAddedSubtitle(null),
    'Newly announced in the last 7 days and currently showing.',
  );
});

test('formatFirstAnnouncedLabel formats ISO date', () => {
  assert.equal(formatFirstAnnouncedLabel('2026-06-26', 'en-US'), 'Added Jun 26');
  assert.equal(formatFirstAnnouncedLabel('invalid'), null);
});

test('formatRecentlyAddedSectionCount handles singular and plural', () => {
  assert.equal(formatRecentlyAddedSectionCount(1), '1 film');
  assert.equal(formatRecentlyAddedSectionCount(3), '3 films');
  assert.equal(formatRecentlyAddedSectionCount(0), null);
});

test('buildRecentlyAddedSection returns count and subtitle', () => {
  const section = buildRecentlyAddedSection(miniArtifact, miniRows);

  assert.equal(section.countLabel, '2 films');
  assert.equal(section.films.length, 2);
  assert.match(section.subtitle, /last 7 days/);
});
