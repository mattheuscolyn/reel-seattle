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
import { buildOpeningThisWeekShelf } from '../../v2/home/shelfData.js';
import { ALLOWED_V2_DATA_ROUTES } from '../../v2/data/allowedDataRoutes.js';
import { loadHomeData } from '../../v2/data/loadHomeData.js';
import {
  aggregateOpeningTheaters,
  buildLiveOpeningThisWeekPresentation,
  buildOpeningSections,
  filterOpeningFilmsByCategory,
  formatCompactTheaterLine,
  isOpeningScreeningLevelFormatLabel,
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

test('limited ended single-day Harry Potter maps to revival without enrichment', () => {
  const home = buildHomeData(baseHomeInput());
  const shelf = buildOpeningThisWeekShelf(home, null);
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  const hpEntry = home.openingThisWeek.entries.find(
    (entry) => entry.showtimeFilmKey === 'harry-potter-and-the-half-blood-prince',
  );
  assert.equal(hpEntry.openingType, 'limited');
  assert.equal(hpEntry.engagementDays, 1);
  assert.equal(hpEntry.visibleShowtimeCount, 0);
  const shelfCard = shelf.films.find(
    (film) => film.filmKey === 'harry-potter-and-the-half-blood-prince',
  );
  const dedicatedCard = presentation.films.find(
    (film) => film.filmKey === 'harry-potter-and-the-half-blood-prince',
  );
  if (shelfCard) {
    assert.equal(shelfCard.surfaceReasonLabel, 'Revival');
    assert.equal(shelfCard.badge, '8/31');
    assert.equal(shelfCard.categoryId, dedicatedCard.categoryId);
  }
  assert.equal(dedicatedCard.badge, 'Revival');
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

test('Opening This Week presentation omits redundant intro copy', () => {
  const home = buildHomeData(baseHomeInput());
  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(presentation.pageTitle, 'Opening This Week');
  assert.equal(presentation.pageSubtitle, null);
  assert.equal(presentation.countLabel, null);
  assert.equal(
    JSON.stringify(presentation).includes('Films opening in Seattle this week'),
    false,
  );
});

test('compact theater line joins names and truncates with +N more', () => {
  assert.equal(isOpeningScreeningLevelFormatLabel('Closed Captions'), true);
  assert.equal(isOpeningScreeningLevelFormatLabel('Open Captions'), true);
  assert.equal(isOpeningScreeningLevelFormatLabel('Audio Description'), true);
  assert.equal(isOpeningScreeningLevelFormatLabel('IMAX'), false);

  const theaters = aggregateOpeningTheaters(
    [
      {
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
      },
      {
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
      },
      {
        theaterId: 'siff-cinema-uptown',
        theaterName: 'SIFF Cinema Uptown',
      },
      {
        theaterId: 'the-beacon-cinema',
        theaterName: 'The Beacon Cinema',
      },
      {
        theaterId: 'amc-oak-tree-6',
        theaterName: 'AMC Oak Tree 6',
      },
      {
        theaterId: 'northwest-film-forum',
        theaterName: 'Northwest Film Forum',
      },
    ],
    [],
    {},
  );
  assert.equal(theaters.length, 5);
  assert.deepEqual(
    theaters.map((theater) => theater.name),
    [
      'AMC Pacific Place 11',
      'SIFF Cinema Uptown',
      'The Beacon Cinema',
      'AMC Oak Tree 6',
      'Northwest Film Forum',
    ],
  );
  assert.equal(
    formatCompactTheaterLine(theaters.map((theater) => theater.name)),
    'AMC Pacific Place 11 · SIFF Cinema Uptown · +3 more',
  );
  assert.equal(
    formatCompactTheaterLine(['AMC Pacific Place 11', 'SIFF Cinema Uptown']),
    'AMC Pacific Place 11 · SIFF Cinema Uptown',
  );
});

test('Opening cards aggregate unique theaters and omit screening-level badges', () => {
  const home = buildHomeData(baseHomeInput());
  const baseOpps = home.opportunities.filter((opp) => opp.filmKey !== 'sinners');
  const sinnersOpps = [
    {
      opportunityKey: 'opp-sinners-amc-1',
      filmKey: 'sinners',
      theaterId: 'amc-pacific-place-11',
      theaterName: 'AMC Pacific Place 11',
      localDate: '2026-09-04',
      localTime: '12:15',
      timeDisplay: '12:15pm',
      sortableLocalDateTime: '2026-09-04T12:15',
      formatLabels: ['closed-caption', 'IMAX'],
      ticketUrl: null,
    },
    {
      opportunityKey: 'opp-sinners-amc-2',
      filmKey: 'sinners',
      theaterId: 'amc-pacific-place-11',
      theaterName: 'AMC Pacific Place 11',
      localDate: '2026-09-04',
      localTime: '19:30',
      timeDisplay: '7:30pm',
      sortableLocalDateTime: '2026-09-04T19:30',
      formatLabels: ['closed-caption'],
      ticketUrl: null,
    },
    {
      opportunityKey: 'opp-sinners-siff',
      filmKey: 'sinners',
      theaterId: 'siff-cinema-uptown',
      theaterName: 'SIFF Cinema Uptown',
      localDate: '2026-09-05',
      localTime: '19:00',
      timeDisplay: '7:00pm',
      sortableLocalDateTime: '2026-09-05T19:00',
      formatLabels: ['audio-description'],
      ticketUrl: null,
    },
  ];
  home.opportunities = [...sinnersOpps, ...baseOpps];

  const presentation = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(presentation.pageSubtitle, null);
  assert.equal(presentation.countLabel, null);

  const sinners = presentation.films.find((film) => film.filmKey === 'sinners');
  assert.ok(sinners);
  assert.equal(sinners.theaters.length, 2);
  assert.equal(
    sinners.theaterName,
    'AMC Pacific Place 11 · SIFF Cinema Uptown',
  );
  assert.equal(
    sinners.theaters.filter((theater) => theater.id === 'amc-pacific-place-11')
      .length,
    1,
  );
  assert.equal(sinners.formatLabel, 'IMAX');
  assert.equal(sinners.formatLabels.includes('Closed Captions'), false);
  assert.equal(sinners.formatLabels.includes('Audio Description'), false);
  assert.equal(sinners.alsoPlaying, null);
  assert.ok(sinners.opportunityKey);

  // Accessibility-only formats leave the film-level format chip empty.
  home.opportunities = [
    ...sinnersOpps.map((opp) => ({
      ...opp,
      formatLabels: ['closed-caption', 'audio-description'],
    })),
    ...baseOpps,
  ];
  const a11yPresentation = buildLiveOpeningThisWeekPresentation(home, null);
  const a11yCard = a11yPresentation.films.find((film) => film.filmKey === 'sinners');
  assert.equal(a11yCard.formatLabel, null);
  assert.deepEqual(a11yCard.formatLabels, []);

  // Theater filter matches any venue on the film, not only the primary.
  const bySiff = filterOpeningFilms(presentation.films, {
    theaterId: 'siff-cinema-uptown',
  });
  assert.ok(bySiff.some((film) => film.filmKey === 'sinners'));
});
