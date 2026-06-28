import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMovieSequenceItems,
  buildPlannerSearchFilters,
  buildTimelineSegments,
  formatFilmCountLabel,
  formatFilmListInput,
  formatGapBetweenLabel,
  formatMovieSequenceLabel,
  formatPlannerMovieDisplay,
  formatPlannerResultsHeading,
  formatPlannerScheduleSummary,
  formatPlannerSharedFiltersSummary,
  formatPlannerSortLabel,
  formatPlannerTimeLabel,
  formatPlannerTruncatedMessage,
  formatVisibleResultsLabel,
  getPlannerEmptyStateSuggestion,
  parseFilmListInput,
  parsePlannerTimeInput,
  PLANNER_RESULTS_PAGE_SIZE,
} from '../../src/utils/plannerDisplay.js';

const sampleTwoFilmSchedule = {
  theater: 'AMC Test',
  filmCount: 2,
  startMin: 720,
  endMin: 930,
  totalSpanMin: 210,
  filmRuntimeMin: 180,
  gapTimeMin: 30,
  movies: [
    { film: 'Alpha', startMin: 720, endMin: 780, runtime: 60, time: '12:00PM' },
    { film: 'Beta', startMin: 810, endMin: 930, runtime: 120, time: '1:30PM' },
  ],
};

const sampleFourFilmSchedule = {
  theater: 'AMC Test',
  filmCount: 4,
  startMin: 720,
  endMin: 1170,
  movies: [
    { film: 'A', startMin: 720, endMin: 780, runtime: 60, time: '12:00PM' },
    { film: 'B', startMin: 795, endMin: 855, runtime: 60, time: '1:15PM' },
    { film: 'C', startMin: 870, endMin: 930, runtime: 60, time: '2:30PM' },
    { film: 'D', startMin: 945, endMin: 1170, runtime: 225, time: '3:45PM' },
  ],
};

test('formatFilmCountLabel maps numeric and max modes', () => {
  assert.equal(formatFilmCountLabel(2), '2');
  assert.equal(formatFilmCountLabel(3), '3');
  assert.equal(formatFilmCountLabel(4), '4');
  assert.equal(formatFilmCountLabel(8), '8');
  assert.equal(formatFilmCountLabel('max'), 'As many as possible');
  assert.equal(formatFilmCountLabel('invalid'), '2');
});

test('formatPlannerTimeLabel formats minutes and handles missing values', () => {
  assert.equal(formatPlannerTimeLabel(870), '2:30PM');
  assert.equal(formatPlannerTimeLabel(null), 'Unknown');
});

test('parsePlannerTimeInput accepts valid times and rejects invalid input', () => {
  assert.equal(parsePlannerTimeInput('2:30PM'), 870);
  assert.equal(parsePlannerTimeInput(''), null);
  assert.equal(parsePlannerTimeInput('not-a-time'), null);
});

test('buildPlannerSearchFilters applies double-feature max gap for 2-film mode only', () => {
  const twoFilm = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: ['AMC Pacific Place 11'],
    filmCount: 2,
    startAfter: '2:00PM',
    finishBy: '10:00PM',
  });
  assert.equal(twoFilm.filmCount, 2);
  assert.equal(twoFilm.maxGapMin, 59);
  assert.equal(twoFilm.startAfterMin, 840);
  assert.equal(twoFilm.finishByMin, 1320);

  const twoFilmOverride = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: [],
    filmCount: 2,
    maxGapMin: '30',
    maxGapExplicit: true,
  });
  assert.equal(twoFilmOverride.maxGapMin, 30);

  const threeFilm = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: [],
    filmCount: 3,
    startAfter: '',
    finishBy: '',
  });
  assert.equal(threeFilm.maxGapMin, null);

  const maxMode = buildPlannerSearchFilters({
    date: '06/27/2026',
    theaters: [],
    filmCount: 'max',
    startAfter: '',
    finishBy: '',
  });
  assert.equal(maxMode.filmCount, 'max');
  assert.equal(maxMode.maxGapMin, null);
});

test('parseFilmListInput and formatFilmListInput round-trip titles', () => {
  assert.deepEqual(parseFilmListInput('Toy Story 5, Sinners'), ['Toy Story 5', 'Sinners']);
  assert.equal(formatFilmListInput(['Toy Story 5', 'Sinners']), 'Toy Story 5, Sinners');
});

test('formatPlannerSortLabel and shared summary helpers', () => {
  assert.equal(formatPlannerSortLabel('shortest_span'), 'Shortest total span');
  assert.equal(formatPlannerSortLabel(''), 'Default');
  const summary = formatPlannerSharedFiltersSummary({
    selectedDate: '06/27/2026',
    filmCount: 'max',
    sort: 'most_films',
  });
  assert.match(summary, /06\/27\/2026/);
  assert.match(summary, /As many as possible/);
});

test('formatPlannerScheduleSummary formats theater span and gap metrics', () => {
  const summary = formatPlannerScheduleSummary({
    theater: 'AMC Pacific Place 11',
    filmCount: 3,
    startMin: 720,
    endMin: 990,
    startLabel: '12:00PM',
    endLabel: '4:30PM',
    totalSpanMin: 270,
    filmRuntimeMin: 210,
    gapTimeMin: 60,
  });

  assert.equal(summary.theater, 'AMC Pacific Place 11');
  assert.equal(summary.filmCountLabel, '3');
  assert.equal(summary.startTime, '12:00PM');
  assert.equal(summary.endTime, '4:30PM');
  assert.equal(summary.totalSpan, '4h 30m');
  assert.equal(summary.totalGap, '60 min');
  assert.equal(summary.filmRuntime, '3h 30m');
});

test('formatPlannerResultsHeading uses film count labels', () => {
  assert.equal(formatPlannerResultsHeading(1, 2), '1 2-Film Plan Found');
  assert.equal(formatPlannerResultsHeading(3, 3), '3 3-Film Plans Found');
  assert.equal(formatPlannerResultsHeading(2, 'max'), '2 Schedule Plans Found');
});

test('formatPlannerMovieDisplay formats movie slot details', () => {
  const display = formatPlannerMovieDisplay({
    film: 'Alpha',
    time: '12:00PM',
    startMin: 720,
    endMin: 780,
    runtime: 60,
  });

  assert.equal(display.film, 'Alpha');
  assert.equal(display.startTime, '12:00PM');
  assert.equal(display.endTime, '1:00PM');
  assert.equal(display.runtime, '60 min');
});

test('formatGapBetweenLabel formats gap labels', () => {
  assert.equal(formatGapBetweenLabel(32), '32 min gap');
  assert.equal(formatGapBetweenLabel(1), '1 min gap');
  assert.equal(formatGapBetweenLabel(0), 'Back-to-back');
});

test('buildTimelineSegments builds proportional film and gap segments', () => {
  const twoFilm = buildTimelineSegments(sampleTwoFilmSchedule);
  assert.equal(twoFilm.segments.length, 3);
  assert.equal(twoFilm.segments[0].type, 'film');
  assert.equal(twoFilm.segments[1].type, 'gap');
  assert.equal(twoFilm.segments[1].durationMin, 30);
  assert.ok(twoFilm.segments[0].widthPct > 0);
  assert.ok(twoFilm.segments[2].widthPct > twoFilm.segments[1].widthPct);

  const fourFilm = buildTimelineSegments(sampleFourFilmSchedule);
  assert.equal(fourFilm.segments.filter((s) => s.type === 'film').length, 4);
  assert.equal(fourFilm.segments.filter((s) => s.type === 'gap').length, 3);
});

test('buildMovieSequenceItems interleaves films and gaps', () => {
  const items = buildMovieSequenceItems(sampleTwoFilmSchedule);
  assert.equal(items.length, 3);
  assert.equal(items[0].type, 'film');
  assert.equal(items[1].type, 'gap');
  assert.equal(items[1].label, '30 min gap');
});

test('formatVisibleResultsLabel and truncated message helpers', () => {
  assert.equal(formatVisibleResultsLabel(20, 200), 'Showing 20 of 200 plans');
  assert.equal(formatVisibleResultsLabel(5, 5), 'Showing 5 plans');
  assert.match(formatPlannerTruncatedMessage({ truncated: true }, 200), /capped results/);
  assert.equal(formatPlannerTruncatedMessage({ truncated: false }, 200), '');
});

test('empty state and sequence label helpers', () => {
  assert.match(getPlannerEmptyStateSuggestion(), /widening your time window/);
  assert.equal(formatMovieSequenceLabel(0, 4), 'Film 1 of 4');
  assert.equal(PLANNER_RESULTS_PAGE_SIZE, 20);
});
