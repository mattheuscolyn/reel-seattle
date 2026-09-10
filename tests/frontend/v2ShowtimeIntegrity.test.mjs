import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import { buildRankedTopOpportunitySelections } from '../../v2/topOpportunities/buildRankedTopOpportunitySelections.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { composeTheaterDetailPresentation } from '../../v2/theaters/composeTheaterDetailPresentation.js';
import { composeFilmShowtimesPresentation } from '../../v2/showtimes/composeFilmShowtimesPresentation.js';
import { buildShowtimesBrowsePresentation } from '../../v2/showtimes/showtimesBrowseModel.js';
import { createDefaultBrowseFilters } from '../../v2/showtimes/browseFilterState.js';
import { generateLivePlannerResults } from '../../v2/planner/generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';
import {
  formatPresentationLabel,
  isActionableScreening,
} from '../../v2/showtimes/canonicalScreening.js';
import {
  getCanonicalScreening,
  listScreeningsForFilm,
  listScreeningsForTheater,
} from '../../v2/showtimes/screeningSelectors.js';
import { findNextOpportunityForFilm } from '../../v2/home/shelfData.js';
import { selectBestOpportunity } from '../../v2/filmDetail/filmDetailModel.js';

const NOW = new Date('2026-09-07T22:00:00.000Z'); // 3:00 PM PDT
const ROOT = dirname(fileURLToPath(import.meta.url));
const FD_SURFACE = readFileSync(
  join(ROOT, '../../v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const TD_SURFACE = readFileSync(
  join(ROOT, '../../v2/theaters/TheaterDetailSurface.jsx'),
  'utf8',
);

function showtime(partial) {
  return {
    status: 'active',
    runtime_min: 120,
    poster_url: 'https://example.com/poster.jpg',
    ticket_url: 'https://example.com/t',
    attributes: {},
    parent_film_key: null,
    parent_display_title: null,
    source_showtime_id: null,
    ...partial,
  };
}

function integrityHome(overrides = {}) {
  return buildHomeData({
    showtimesCurrent: {
      schema_version: '1.0.0',
      generated_at: '2026-09-07T04:14:05-07:00',
      timezone: 'America/Los_Angeles',
      window: { start_date: '2026-09-07', end_date: '2026-09-21' },
      theaters: [
        {
          id: 'amc-pacific-place-11',
          name: 'AMC Pacific Place 11',
          source: 'amc',
          enabled: true,
        },
        {
          id: 'siff-cinema-uptown',
          name: 'SIFF Cinema Uptown',
          source: 'siff',
          enabled: true,
        },
      ],
      films: [
        {
          showtime_film_key: 'sinners',
          title: 'Sinners',
          runtime_min: 137,
          poster_url: 'https://example.com/sinners.jpg',
          film_id: 'tmdb:1133620',
        },
        {
          showtime_film_key: 'indie-film',
          title: 'Indie Film',
          runtime_min: 100,
          poster_url: 'https://example.com/indie.jpg',
        },
      ],
      showtimes: [
        showtime({
          id: 'st-past',
          date: '2026-09-07',
          time: '11:00',
          time_display: '11:00 AM',
          theater_id: 'amc-pacific-place-11',
          showtime_film_key: 'sinners',
          film_title: 'Sinners',
          runtime_min: 137,
          format_tags: ['imax-at-amc'],
          source: 'amc',
        }),
        showtime({
          id: 'st-later',
          date: '2026-09-07',
          time: '19:30',
          time_display: '7:30 PM',
          theater_id: 'amc-pacific-place-11',
          showtime_film_key: 'sinners',
          film_title: 'Sinners',
          runtime_min: 137,
          format_tags: ['CLOSED-CAPTION', 'imax-at-amc'],
          source: 'amc',
        }),
        showtime({
          id: 'st-dup-source',
          date: '2026-09-07',
          time: '19:30',
          time_display: '7:30 PM',
          theater_id: 'amc-pacific-place-11',
          showtime_film_key: 'sinners',
          film_title: 'Sinners',
          runtime_min: 137,
          format_tags: ['IMAX', 'closed-caption'],
          source: 'manual',
        }),
        showtime({
          id: 'st-tomorrow',
          date: '2026-09-08',
          time: '18:00',
          time_display: '6:00 PM',
          theater_id: 'siff-cinema-uptown',
          showtime_film_key: 'indie-film',
          film_title: 'Indie Film',
          format_tags: ['70mm'],
          source: 'siff',
        }),
        showtime({
          id: 'st-indie-today',
          date: '2026-09-07',
          time: '21:00',
          time_display: '9:00 PM',
          theater_id: 'siff-cinema-uptown',
          showtime_film_key: 'indie-film',
          film_title: 'Indie Film',
          format_tags: ['35mm'],
          source: 'siff',
        }),
      ],
      ...overrides.showtimesCurrent,
    },
    theatersRegistry: {
      theaters: [
        { id: 'amc-pacific-place-11', name: 'AMC Pacific Place 11' },
        { id: 'siff-cinema-uptown', name: 'SIFF Cinema Uptown' },
      ],
    },
    pipelineReport: {
      schema_version: '1.0.0',
      generated_at: '2026-09-07T04:14:05-07:00',
      status: 'success',
      sources: {
        amc: { status: 'success' },
        siff: { status: 'success' },
      },
      totals: { showtime_count: 5 },
      messages: [],
    },
    ...overrides,
  });
}

test('canonical screenings expose identity, start timestamp, and availability', () => {
  const home = integrityHome();
  const later = home.opportunities.find((row) => row.localTime === '19:30');
  assert.ok(later);
  assert.ok(later.screeningId.startsWith('scr:'));
  assert.ok(later.opportunityKey.startsWith('id:'));
  assert.equal(later.startsAt, '2026-09-07T19:30:00-07:00');
  assert.equal(later.availability, 'available');
  assert.ok(Array.isArray(later.presentationLabels));
  assert.ok(later.presentationLabels.includes('IMAX'));
  assert.ok(later.presentationLabels.includes('Closed Captions'));
});

test('homepage opportunities reference an existing canonical screening', () => {
  const home = integrityHome();
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: NOW,
    topN: 3,
  });
  assert.ok(selections.length > 0);
  for (const selection of selections) {
    const id = selection.representativeOpportunity.opportunityKey;
    const canonical = getCanonicalScreening(home, id);
    assert.ok(canonical, `missing canonical screening ${id}`);
    assert.equal(canonical.filmKey, selection.representativeOpportunity.filmKey);
    assert.equal(canonical.theaterId, selection.representativeOpportunity.theaterId);
    assert.equal(canonical.localDate, selection.representativeOpportunity.localDate);
    assert.equal(canonical.localTime, selection.representativeOpportunity.localTime);
    assert.equal(isActionableScreening(canonical, NOW), true);
  }
});

test('a passed screening is not a Top Opportunity or Best Way', () => {
  const home = integrityHome();
  const past = home.opportunities.find((row) => row.localTime === '11:00');
  assert.ok(past);
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: NOW,
    topN: 5,
  });
  assert.equal(
    selections.some((s) => s.representativeOpportunity.opportunityKey === past.opportunityKey),
    false,
  );
  const best = selectBestOpportunity(home, 'sinners', null, { now: NOW });
  assert.ok(best);
  assert.notEqual(best.opportunityKey, past.opportunityKey);
  assert.equal(best.localTime, '19:30');
});

test('Best Opportunity appears in the film and theater schedules', () => {
  const home = integrityHome();
  const film = composeFilmDetailPresentation(home, 'sinners', null, { now: NOW });
  const bestKey = film.bestWay?.opportunityKey;
  assert.ok(bestKey);
  const inFilm = listScreeningsForFilm(home, 'sinners').some(
    (row) => row.opportunityKey === bestKey,
  );
  const best = getCanonicalScreening(home, bestKey);
  const inTheater = listScreeningsForTheater(home, best.theaterId).some(
    (row) => row.opportunityKey === bestKey,
  );
  const showtimes = composeFilmShowtimesPresentation(home, 'sinners', { now: NOW });
  const onShowtimesPage = (showtimes.theaterGroups ?? []).some((group) =>
    (group.times ?? []).some((time) => time.opportunityKey === bestKey),
  );
  assert.equal(inFilm, true);
  assert.equal(inTheater, true);
  assert.equal(onShowtimesPage, true);
});

test('Film Detail and Theater Detail agree about the same screening', () => {
  const home = integrityHome();
  const film = composeFilmDetailPresentation(home, 'sinners', null, { now: NOW });
  const theater = composeTheaterDetailPresentation(home, 'amc-pacific-place-11', null, {
    now: NOW,
  });
  const filmKeys = new Set(
    (film.today?.rows ?? []).flatMap((row) =>
      (row.times ?? []).map((time) => time.opportunityKey),
    ),
  );
  const theaterKeys = new Set(
    (theater.todaysShowtimes?.filmGroups ?? []).flatMap((group) =>
      (group.times ?? []).map((time) => time.opportunityKey ?? time.id),
    ),
  );
  for (const key of filmKeys) {
    if (!key) continue;
    const screening = getCanonicalScreening(home, key);
    if (screening?.theaterId !== 'amc-pacific-place-11') continue;
    assert.ok(theaterKeys.has(key), `theater schedule missing ${key}`);
    assert.equal(screening.localDate, '2026-09-07');
  }
});

test('Film Detail today keeps already-started times on the daily schedule', () => {
  const home = integrityHome();
  const film = composeFilmDetailPresentation(home, 'sinners', null, { now: NOW });
  const times = (film.today?.rows ?? []).flatMap((row) => row.times ?? []);
  const started = times.find((time) => time.localTime === '11:00');
  const upcoming = times.find((time) => time.localTime === '19:30');
  assert.ok(started);
  assert.ok(upcoming);
  assert.equal(started.actionable, false);
  assert.equal(started.past, true);
  assert.equal(started.stateLabel, 'Started');
  assert.equal(started.ticketUrl, null);
  assert.equal(started.emphasized, false);
  assert.equal(upcoming.actionable, true);
  assert.equal(upcoming.past, false);
  assert.equal(upcoming.stateLabel, null);
  assert.ok(upcoming.ticketUrl);
  assert.notEqual(film.bestWay?.localTime, '11:00');
});

test('Theater Detail keeps started times visible but not selectable', () => {
  const home = integrityHome();
  const theater = composeTheaterDetailPresentation(
    home,
    'amc-pacific-place-11',
    null,
    { now: NOW },
  );
  const times = (theater.todaysShowtimes?.filmGroups ?? []).flatMap(
    (group) => group.times ?? [],
  );
  const started = times.find((time) => time.localTime === '11:00');
  const upcoming = times.find((time) => time.localTime === '19:30');
  assert.ok(started);
  assert.ok(upcoming);
  assert.equal(started.actionable, false);
  assert.equal(started.stateLabel, 'Started');
  assert.equal(upcoming.actionable, true);
  assert.equal(upcoming.stateLabel, null);
  assert.notEqual(theater.todaysShowtimes.filmGroups[0].opportunityKey, started.opportunityKey);
});

test('Film Detail and Theater Detail surfaces expose started as a disabled state', () => {
  assert.match(FD_SURFACE, /v2-fd-today-time-started/);
  assert.match(FD_SURFACE, /Started/);
  assert.match(TD_SURFACE, /disabled=\{started\}/);
  assert.match(TD_SURFACE, /aria-disabled=\{started\}/);
  assert.match(TD_SURFACE, /v2-td-time-btn-started/);
  assert.match(TD_SURFACE, /Started/);
});

test('newly generated plans contain no past screenings and reference canonical rows', () => {
  const home = integrityHome();
  const form = {
    ...createLiveBuildPlanFormState(NOW),
    planSize: { min: 1, max: 1 },
  };
  const result = generateLivePlannerResults({
    homeData: home,
    form,
    now: NOW,
  });
  assert.ok(result.plans?.length > 0, result.message ?? 'expected plans');
  for (const plan of result.plans) {
    const movies = (plan.items ?? []).filter((item) => item.type !== 'break');
    assert.ok(movies.length > 0);
    for (const movie of movies) {
      assert.notEqual(movie.localTime, '11:00');
      if (movie.opportunityKey) {
        assert.ok(getCanonicalScreening(home, movie.opportunityKey));
      }
      if (movie.formatBadge) {
        assert.notEqual(movie.formatBadge, 'IMAX-AT-AMC');
        assert.notEqual(movie.formatBadge, 'CLOSED-CAPTION');
        assert.match(
          movie.formatBadge,
          /^(IMAX|70mm|35mm|Closed Captions|Dolby Cinema|Standard|Open Captions|Audio Description)/,
        );
      }
    }
  }
});

test('a future-date plan still includes evening screenings', () => {
  const home = integrityHome();
  const form = {
    ...createLiveBuildPlanFormState(NOW),
    dateIso: '2026-09-08',
    planSize: { min: 1, max: 1 },
  };
  const result = generateLivePlannerResults({
    homeData: home,
    form,
    now: NOW,
  });
  assert.ok(result.plans?.length > 0);
  const times = result.plans.flatMap((plan) =>
    (plan.items ?? [])
      .filter((item) => item.type !== 'break')
      .map((movie) => movie.localTime),
  );
  assert.ok(times.includes('18:00'));
});

test('invalidating a screening removes it from recommendations', () => {
  const home = integrityHome();
  const { selections } = buildRankedTopOpportunitySelections(home, {
    now: NOW,
    topN: 3,
  });
  const target = selections[0]?.representativeOpportunity?.opportunityKey;
  assert.ok(target);
  const nextHome = {
    ...home,
    opportunities: home.opportunities.filter((row) => row.opportunityKey !== target),
  };
  const after = buildRankedTopOpportunitySelections(nextHome, {
    now: NOW,
    topN: 3,
  });
  assert.equal(
    after.selections.some((s) => s.representativeOpportunity.opportunityKey === target),
    false,
  );
  assert.equal(selectBestOpportunity(nextHome, 'sinners', target, { now: NOW })?.opportunityKey !== target, true);
});

test('browse counts come from the same filtered records users can inspect', () => {
  const home = integrityHome();
  const presentation = buildShowtimesBrowsePresentation(
    home,
    createDefaultBrowseFilters(NOW),
    { now: NOW },
  );
  const visible = presentation.films.flatMap((film) => film.showtimes ?? []);
  assert.equal(presentation.filteredCount, visible.length);
  assert.equal(presentation.filmCount, presentation.films.length);
  assert.ok(!visible.some((row) => row.localTime === '11:00'));
  assert.ok(presentation.freshness?.lastRefreshedLabel);
  assert.equal(presentation.freshness.stale, true);
  assert.match(presentation.freshness.line, /may have changed/);
});

test('equivalent source/format slugs do not create duplicate browse rows', () => {
  const home = integrityHome();
  const presentation = buildShowtimesBrowsePresentation(
    home,
    createDefaultBrowseFilters(NOW),
    { now: NOW },
  );
  const sinners = presentation.films.find((film) => film.filmKey === 'sinners');
  const evening = (sinners?.showtimes ?? []).filter((row) => row.localTime === '19:30');
  assert.equal(evening.length, 1);
});

test('format labels agree across Home, Film Detail, Theater Detail, and Planner', () => {
  const home = integrityHome();
  const later = home.opportunities.find((row) => row.localTime === '19:30');
  const film = composeFilmDetailPresentation(home, 'sinners', later.opportunityKey, {
    now: NOW,
  });
  const theater = composeTheaterDetailPresentation(home, 'amc-pacific-place-11', null, {
    now: NOW,
  });
  const next = findNextOpportunityForFilm(home, 'sinners', NOW);
  assert.equal(formatPresentationLabel('IMAX-AT-AMC'), 'IMAX');
  assert.ok(
    (film.bestWay?.formatLabel ?? film.today?.rows?.[0]?.formatChips?.[0]) === 'IMAX' ||
      film.today?.rows?.some((row) =>
        (row.times ?? []).some((time) => time.formatLabel === 'IMAX' || time.detailLabel?.includes('IMAX')),
      ),
  );
  const theaterLabels = (theater.todaysShowtimes?.filmGroups ?? []).flatMap((group) =>
    (group.times ?? []).map((time) => time.formatLabel),
  );
  assert.ok(theaterLabels.some((label) => label === 'IMAX' || label === 'Closed Captions'));
  assert.equal(next?.localTime, '19:30');
});

test('multi-date ordering uses full timestamps', () => {
  const home = integrityHome();
  const filmRows = listScreeningsForFilm(home, 'indie-film');
  const keys = filmRows.map((row) => row.sortableLocalDateTime);
  assert.deepEqual([...keys].sort(), keys);
  assert.ok(keys[0] < keys[keys.length - 1]);
});
