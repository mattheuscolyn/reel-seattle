import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES,
  filmMatchesToken,
  findSchedules,
  normalizePlannerFilters,
} from '../../src/utils/plannerEngine.js';

const DATE = '06/28/2026';
const THEATER_A = 'Theater A';
const THEATER_B = 'Theater B';
const THEATER_A_ID = 'theater-a';
const THEATER_B_ID = 'theater-b';

function row({
  film,
  time,
  runtime = '90',
  theater = THEATER_A,
  theater_id = THEATER_A_ID,
  date = DATE,
  filmKey,
  poster = 'https://example.com/poster.jpg',
  premiumFormat = 'IMAX',
  isCanceled = 'False',
} = {}) {
  const key = filmKey ?? film.toLowerCase().replace(/\s+/g, '-');
  return {
    Date: date,
    Time: time,
    Theater: theater,
    theater_id,
    Film: film,
    Runtime: runtime,
    showtime_film_key: key,
    posterDynamic: poster,
    premiumFormat,
    isCanceled,
  };
}

function baseFilters(overrides = {}) {
  return normalizePlannerFilters({
    date: DATE,
    theaters: [],
    filmCount: 2,
    ...overrides,
  });
}

test('returns empty schedules for empty rows', () => {
  const result = findSchedules({ rows: [], filters: baseFilters() });
  assert.equal(result.schedules.length, 0);
  assert.equal(result.meta.candidateShowtimeCount, 0);
  assert.equal(result.meta.truncated, false);
});

test('filters by date', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', date: '06/29/2026' }),
    row({ film: 'Beta', time: '7:00PM', date: DATE }),
  ];
  const result = findSchedules({ rows, filters: baseFilters({ filmCount: 2 }) });
  assert.equal(result.schedules.length, 0);
  assert.equal(result.meta.candidateShowtimeCount, 1);
});

test('filters by theater', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', theater: THEATER_A }),
    row({ film: 'Beta', time: '7:00PM', theater: THEATER_B, theater_id: THEATER_B_ID }),
    row({ film: 'Gamma', time: '9:00PM', theater: THEATER_B, theater_id: THEATER_B_ID }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ theaters: [THEATER_B], filmCount: 2 }),
  });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].theater, THEATER_B);
});

test('skips canceled rows', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', isCanceled: 'True' }),
    row({ film: 'Beta', time: '7:00PM' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  assert.equal(result.schedules.length, 0);
  assert.equal(result.meta.candidateShowtimeCount, 1);
});

test('skips invalid runtime and time rows', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: 'Unknown' }),
    row({ film: 'Beta', time: 'bad', runtime: '90' }),
    row({ film: 'Gamma', time: '7:00PM' }),
    row({ film: 'Delta', time: '9:00PM' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  assert.equal(result.meta.candidateShowtimeCount, 2);
  assert.equal(result.schedules.length, 1);
});

test('finds a valid 2-film schedule', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].filmCount, 2);
  assert.deepEqual(result.schedules[0].films, ['Alpha', 'Beta']);
});

test('finds a valid 3-film schedule', () => {
  const rows = [
    row({ film: 'A', time: '12:00PM', runtime: '90' }),
    row({ film: 'B', time: '2:00PM', runtime: '90' }),
    row({ film: 'C', time: '4:00PM', runtime: '90' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters({ filmCount: 3 }) });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].filmCount, 3);
});

test('finds multiple schedules at one theater', () => {
  const rows = [
    row({ film: 'A', time: '12:00PM', runtime: '60' }),
    row({ film: 'B', time: '1:30PM', runtime: '60' }),
    row({ film: 'C', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters({ filmCount: 2 }) });
  assert.ok(result.schedules.length >= 2);
  assert.ok(result.schedules.every((s) => s.theater === THEATER_A));
});

test('does not chain across theaters', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', theater: THEATER_A, theater_id: THEATER_A_ID }),
    row({ film: 'Beta', time: '7:00PM', theater: THEATER_B, theater_id: THEATER_B_ID }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  assert.equal(result.schedules.length, 0);
});

test('enforces no repeated films by default', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM' }),
    row({ film: 'Alpha', time: '7:30PM', filmKey: 'alpha-alt' }),
    row({ film: 'Beta', time: '9:00PM' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  for (const schedule of result.schedules) {
    const keys = schedule.movies.map((m) => m.showtime_film_key);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('supports startAfterMin', () => {
  const rows = [
    row({ film: 'Early', time: '11:00AM', runtime: '90' }),
    row({ film: 'Late', time: '2:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '4:00PM', runtime: '90' }),
  ];
  const noon = 12 * 60;
  const result = findSchedules({
    rows,
    filters: baseFilters({ startAfterMin: noon }),
  });
  assert.ok(result.schedules.length >= 1);
  assert.ok(result.schedules.every((s) => s.startMin >= noon));
});

test('supports finishByMin', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '120' }),
    row({ film: 'Beta', time: '8:00PM', runtime: '120' }),
    row({ film: 'Gamma', time: '10:30PM', runtime: '90' }),
  ];
  const finish = 22 * 60;
  const result = findSchedules({
    rows,
    filters: baseFilters({ finishByMin: finish, filmCount: 2 }),
  });
  assert.ok(result.schedules.every((s) => s.endMin <= finish));
});

test('supports minGapMin', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '6:45PM', runtime: '90' }),
    row({ film: 'Gamma', time: '9:00PM', runtime: '90' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ minGapMin: 30 }),
  });
  assert.ok(result.schedules.length >= 1);
  assert.ok(result.schedules.every((s) => s.gapTimeMin >= 30));
  assert.ok(result.schedules.some((s) => s.films.includes('Gamma')));
});

test('supports maxGapMin', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '90' }),
    row({ film: 'Gamma', time: '10:00PM', runtime: '90' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ maxGapMin: 30 }),
  });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].films.join(','), 'Alpha,Beta');
});

test('supports required include films', () => {
  const rows = [
    row({ film: 'Alpha', time: '12:00PM', runtime: '60' }),
    row({ film: 'Beta', time: '1:30PM', runtime: '60' }),
    row({ film: 'Gamma', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2, includeFilms: ['Gamma'] }),
  });
  assert.ok(result.schedules.length >= 1);
  assert.ok(result.schedules.every((s) => s.films.includes('Gamma')));
});

test('supports excluded films', () => {
  const rows = [
    row({ film: 'Alpha', time: '12:00PM', runtime: '60' }),
    row({ film: 'Beta', time: '1:30PM', runtime: '60' }),
    row({ film: 'Gamma', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2, excludeFilms: ['Beta'] }),
  });
  assert.ok(result.schedules.every((s) => !s.films.includes('Beta')));
});

test('supports firstFilm anchor', () => {
  const rows = [
    row({ film: 'Alpha', time: '12:00PM', runtime: '60' }),
    row({ film: 'Beta', time: '1:30PM', runtime: '60' }),
    row({ film: 'Gamma', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2, firstFilm: 'Beta' }),
  });
  assert.ok(result.schedules.length >= 1);
  assert.equal(result.schedules[0].films[0], 'Beta');
});

test('supports lastFilm anchor', () => {
  const rows = [
    row({ film: 'Alpha', time: '12:00PM', runtime: '60' }),
    row({ film: 'Beta', time: '1:30PM', runtime: '60' }),
    row({ film: 'Gamma', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2, lastFilm: 'Gamma' }),
  });
  assert.ok(result.schedules.length >= 1);
  assert.equal(result.schedules[0].films.at(-1), 'Gamma');
});

test('computes total span, runtime, and gap time', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  const schedule = result.schedules[0];
  assert.equal(schedule.filmRuntimeMin, 190);
  assert.equal(schedule.gapTimeMin, schedule.totalSpanMin - schedule.filmRuntimeMin);
  assert.equal(schedule.gapTimeMin, 30);
});

test('sorts by earliest start by default', () => {
  const rows = [
    row({ film: 'A', time: '1:00PM', runtime: '60' }),
    row({ film: 'B', time: '2:30PM', runtime: '60' }),
    row({ film: 'C', time: '12:00PM', runtime: '60' }),
    row({ film: 'D', time: '1:30PM', runtime: '60' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters({ filmCount: 2 }) });
  assert.ok(result.schedules.length >= 2);
  assert.ok(result.schedules[0].startMin <= result.schedules[1].startMin);
});

test('sorts by shortest span when requested', () => {
  const rows = [
    row({ film: 'A', time: '12:00PM', runtime: '60' }),
    row({ film: 'B', time: '1:15PM', runtime: '60' }),
    row({ film: 'C', time: '3:00PM', runtime: '60' }),
    row({ film: 'D', time: '4:15PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2 }),
    sort: 'shortest_span',
  });
  assert.ok(result.schedules.length >= 2);
  assert.ok(result.schedules[0].totalSpanMin <= result.schedules[1].totalSpanMin);
});

test('sorts by most films in max mode', () => {
  const rows = [
    row({ film: 'A', time: '12:00PM', runtime: '60' }),
    row({ film: 'B', time: '1:15PM', runtime: '60' }),
    row({ film: 'C', time: '2:30PM', runtime: '60' }),
    row({ film: 'D', time: '5:00PM', runtime: '60' }),
    row({ film: 'E', time: '6:15PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 'max' }),
    sort: 'most_films',
  });
  assert.ok(result.schedules.length >= 1);
  const maxCount = Math.max(...result.schedules.map((s) => s.filmCount));
  assert.equal(result.schedules[0].filmCount, maxCount);
});

test('caps results and marks truncated', () => {
  const rows = [
    row({ film: 'A', time: '10:00AM', runtime: '60' }),
    row({ film: 'B', time: '11:30AM', runtime: '60' }),
    row({ film: 'C', time: '1:00PM', runtime: '60' }),
    row({ film: 'D', time: '2:30PM', runtime: '60' }),
    row({ film: 'E', time: '4:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2 }),
    limits: { maxResults: 1, maxChainDepth: 8 },
  });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.meta.truncated, true);
});

test('preserves poster and format metadata in movie output', () => {
  const rows = [
    row({
      film: 'Alpha',
      time: '5:00PM',
      poster: 'https://example.com/a.jpg',
      premiumFormat: 'IMAX,3D',
    }),
    row({ film: 'Beta', time: '7:00PM', premiumFormat: 'DOLBY' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters() });
  const first = result.schedules[0].movies[0];
  assert.equal(first.poster, 'https://example.com/a.jpg');
  assert.deepEqual(first.formatTags, ['IMAX', '3D']);
  assert.equal(first.premiumFormat, 'IMAX,3D');
});

test('generalizes double-feature style 2-film schedule with max gap', () => {
  const rows = [
    row({ film: 'Alpha', time: '5:00PM', runtime: '90' }),
    row({ film: 'Beta', time: '7:00PM', runtime: '100' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({
      filmCount: 2,
      maxGapMin: DEFAULT_DOUBLE_FEATURE_MAX_GAP_MINUTES - 1,
    }),
  });
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].gapTimeMin, 30);
  assert.deepEqual(result.schedules[0].films, ['Alpha', 'Beta']);
});

test('filmMatchesToken accepts key or title', () => {
  const identity = { key: 'toy-story', title: 'Toy Story' };
  assert.equal(filmMatchesToken('toy-story', identity), true);
  assert.equal(filmMatchesToken('Toy Story', identity), true);
  assert.equal(filmMatchesToken('Other', identity), false);
});

test('preferred films require at least one match', () => {
  const rows = [
    row({ film: 'Alpha', time: '12:00PM', runtime: '60' }),
    row({ film: 'Beta', time: '1:30PM', runtime: '60' }),
    row({ film: 'Gamma', time: '3:00PM', runtime: '60' }),
  ];
  const result = findSchedules({
    rows,
    filters: baseFilters({ filmCount: 2, preferredFilms: ['Zeta'] }),
  });
  assert.equal(result.schedules.length, 0);
});

test('max mode returns longest achievable chain count only', () => {
  const rows = [
    row({ film: 'A', time: '12:00PM', runtime: '60' }),
    row({ film: 'B', time: '1:15PM', runtime: '60' }),
    row({ film: 'C', time: '2:30PM', runtime: '60' }),
  ];
  const result = findSchedules({ rows, filters: baseFilters({ filmCount: 'max' }) });
  assert.ok(result.schedules.length >= 1);
  const counts = new Set(result.schedules.map((s) => s.filmCount));
  assert.equal(counts.size, 1);
  assert.equal([...counts][0], 3);
});
