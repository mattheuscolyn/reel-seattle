import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  buildOpeningThisWeek,
  joinOpeningEntryToHomeFilm,
  openingCategoryForEntry,
  refineOpeningCategory,
} from '../../v2/adapters/buildOpeningThisWeek.js';
import { ALLOWED_V2_DATA_ROUTES } from '../../v2/data/allowedDataRoutes.js';
import { loadHomeData } from '../../v2/data/loadHomeData.js';
import {
  buildLiveOpeningThisWeekPresentation,
  buildOpeningSections,
  filterOpeningFilmsByCategory,
} from '../../v2/opening/buildLiveOpeningPresentation.js';
import { buildOpeningDateCopy } from '../../v2/opening/openingDateCopy.js';
import {
  filterOpeningFilms,
  sortOpeningFilms,
} from '../../v2/opening/openingListControls.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function baseHomeInput(overrides = {}) {
  return {
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    openingThisWeek: loadFixture('v2_opening_this_week_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
    ...overrides,
  };
}

test('opening artifact is optional on v2 allowlist', () => {
  assert.ok(ALLOWED_V2_DATA_ROUTES['/data/opening_this_week_current.json']);
});

test('loadHomeData tolerates missing opening artifact', async () => {
  const showtimes = loadFixture('v2_showtimes_home_mini.json');
  const fetchImpl = async (url) => {
    if (url.includes('showtimes_current')) {
      return { ok: true, status: 200, json: async () => showtimes };
    }
    if (url.includes('opening_this_week')) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () =>
        url.includes('theaters')
          ? { theaters: [] }
          : url.includes('newly_added')
            ? { entries: [] }
            : { status: 'success', sources: {}, messages: [] },
    };
  };
  const result = await loadHomeData({ fetchImpl, includePipelineReport: false });
  assert.equal(result.ok, true);
  assert.equal(result.homeData.openingThisWeek.status, 'unavailable');
  assert.ok(result.homeData.newlyAdded.length >= 0);
});

test('buildHomeData normalizes openingThisWeek entries', () => {
  const home = buildHomeData(baseHomeInput());
  assert.equal(home.openingThisWeek.status, 'available');
  assert.equal(home.openingThisWeek.entries.length, 5);
  assert.equal(home.counts.openingThisWeek, 5);
  assert.ok(home.newlyAdded.length > 0);
});

test('identity join prefers parent/showtime keys over title', () => {
  const home = buildHomeData(baseHomeInput());
  const sinnersEntry = home.openingThisWeek.entries.find(
    (entry) => entry.showtimeFilmKey === 'sinners',
  );
  const joined = joinOpeningEntryToHomeFilm(sinnersEntry, home.films);
  assert.equal(joined?.filmKey, 'sinners');
  assert.equal(joined?.title, 'Sinners');
});

test('artifact member without current showtimes is retained', () => {
  const home = buildHomeData(baseHomeInput());
  const ended = home.openingThisWeek.entries.find(
    (entry) => entry.showtimeFilmKey === 'harry-potter-and-the-half-blood-prince',
  );
  assert.equal(ended.visibleShowtimeCount, 0);
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const card = presentation.films.find(
    (film) => film.filmKey === 'harry-potter-and-the-half-blood-prince',
  );
  assert.ok(card);
  assert.equal(card.hasUpcomingShowtimes, false);
  assert.equal(card.availabilityLabel, 'No upcoming showtimes');
});

test('opening categories map artifact types', () => {
  assert.equal(openingCategoryForEntry({ openingType: 'theatrical', title: 'Sinners' }).id, 'new');
  assert.equal(openingCategoryForEntry({ openingType: 'repertory', title: 'Memento' }).id, 'revival');
  assert.equal(
    openingCategoryForEntry({ openingType: 'event', title: 'Screen Unseen' }).id,
    'event',
  );
});

test('limited Harry Potter maps to revival via release year', () => {
  const category = refineOpeningCategory(
    {
      openingType: 'limited',
      title: 'Harry Potter And The Half Blood Prince',
      showtimeFilmKey: 'harry-potter-and-the-half-blood-prince',
      engagementDays: 1,
    },
    { releaseYear: 2009, currentYear: 2026 },
  );
  assert.equal(category.categoryId, 'revival');
});

test('limited Hunger Games 2026 maps to new', () => {
  const category = openingCategoryForEntry({
    openingType: 'limited',
    title: 'The Hunger Games',
    showtimeFilmKey: 'hunger-games-2026',
    engagementDays: 1,
  });
  assert.equal(category.id, 'new');
});

test('source alone does not force category', () => {
  const beaconLimited = openingCategoryForEntry({
    openingType: 'limited',
    title: 'Contemporary Indie',
    showtimeFilmKey: 'contemporary-indie',
    engagementDays: 1,
  });
  assert.equal(beaconLimited.id, 'new');
});

test('live presentation does not use newlyAdded membership', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(presentation.source, 'live-opening-artifact');
  assert.ok(presentation.films.some((film) => film.filmKey === 'memento'));
  assert.equal(
    presentation.films.some((film) => film.title.includes('recently added')),
    false,
  );
});

test('All view builds sectioned categories and omits empty sections', () => {
  const openingArtifact = loadFixture('v2_opening_this_week_mini.json');
  const home = buildHomeData({
    ...baseHomeInput(),
    openingThisWeek: {
      ...openingArtifact,
      entries: openingArtifact.entries.filter(
        (entry) =>
          entry.opening_type === 'repertory' || entry.opening_type === 'event',
      ),
    },
  });
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const sections = buildOpeningSections(presentation.films, 'all');
  assert.equal(sections.some((section) => section.id === 'new'), false);
  assert.ok(sections.some((section) => section.id === 'revival'));
});

test('category chip filter limits visible films', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const events = filterOpeningFilmsByCategory(presentation.films, 'event');
  assert.equal(events.length, 1);
  assert.match(events[0].title, /Screen Unseen/i);
});

test('opening date sort uses artifact openingDate', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const sorted = sortOpeningFilms(presentation.films, 'opening-date');
  assert.equal(sorted[0].openingDate, '2026-08-31');
  assert.equal(sorted.at(-1).openingDate, '2026-09-04');
});

test('filters compose with category selection', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const byCategory = filterOpeningFilmsByCategory(presentation.films, 'event');
  const filtered = filterOpeningFilms(byCategory, {
    theaterId: null,
    formatLabel: null,
    openingDate: '2026-09-04',
  });
  assert.equal(filtered.length, 1);
  assert.match(filtered[0].title, /Screen Unseen/i);
});

test('date copy handles today, future, past, one-night, and no showtimes', () => {
  assert.equal(
    buildOpeningDateCopy({
      openingDate: '2026-09-02',
      todayIso: '2026-09-02',
      hasUpcomingShowtimes: true,
    }).dateLabel,
    'Opens today',
  );
  assert.match(
    buildOpeningDateCopy({
      openingDate: '2026-09-04',
      todayIso: '2026-09-02',
      hasUpcomingShowtimes: true,
    }).dateLabel,
    /^Opens /,
  );
  assert.match(
    buildOpeningDateCopy({
      openingDate: '2026-08-31',
      todayIso: '2026-09-02',
      hasUpcomingShowtimes: true,
    }).dateLabel,
    /^Opened /,
  );
  assert.match(
    buildOpeningDateCopy({
      openingDate: '2026-09-04',
      engagementDays: 1,
      categoryId: 'event',
      todayIso: '2026-09-02',
      hasUpcomingShowtimes: true,
    }).dateLabel,
    /^One night · /,
  );
  assert.equal(
    buildOpeningDateCopy({
      openingDate: '2026-08-31',
      todayIso: '2026-09-02',
      hasUpcomingShowtimes: false,
    }).availabilityLabel,
    'No upcoming showtimes',
  );
});

test('zero-showtime card has no showtimes action fields', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const card = presentation.films.find((film) => film.visibleShowtimeCount === 0);
  assert.equal(card.hasUpcomingShowtimes, false);
  assert.equal(card.opportunityKey, null);
});

test('showtimes-ready card keeps opportunity context', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const card = presentation.films.find((film) => film.filmKey === 'sinners');
  assert.equal(card.hasUpcomingShowtimes, true);
  assert.ok(card.opportunityKey);
});

test('missing artifact yields honest unavailable presentation', () => {
  const home = buildHomeData(baseHomeInput({ openingThisWeek: null }));
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(presentation.source, 'live-unavailable');
  assert.match(presentation.unavailableTitle, /isn’t available/i);
  assert.equal(presentation.films.length, 0);
});

test('empty artifact yields honest empty presentation', () => {
  const home = buildHomeData(baseHomeInput({ openingThisWeek: { ...loadFixture('v2_opening_this_week_mini.json'), entries: [] } }));
  assert.equal(home.openingThisWeek.status, 'empty');
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(presentation.source, 'live-empty');
  assert.match(presentation.emptyTitle, /Nothing opening/i);
});

test('invalid artifact does not break buildHomeData', () => {
  const home = buildHomeData(baseHomeInput({ openingThisWeek: { bad: true } }));
  assert.equal(home.openingThisWeek.status, 'invalid');
  assert.equal(home.films.length > 0, true);
});
