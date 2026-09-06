import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isEligibleBrowseOpportunity,
  listEligibleBrowseOpportunities,
  opportunityDedupeKey,
  pacificSortableDateTime,
  parseLocalTimeMinutes,
} from '../../v2/showtimes/showtimeEligibility.js';
import {
  SHOWTIMES_BROWSE_QUICK_START_ID,
  buildShowtimesBrowsePresentation,
  createDefaultShowtimesBrowseUi,
  filterBrowseOpportunities,
  groupBrowseOpportunitiesByFilm,
  normalizeBrowseFormat,
  opportunityMatchesTimeRange,
} from '../../v2/showtimes/showtimesBrowseModel.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openShowtimesBrowse,
  openTheaterDetail,
  selectPrimaryDestination,
  updateShowtimesBrowseUi,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import { PRIMARY_DESTINATIONS } from '../../v2/destinations.js';
import { QUICK_START } from '../../v2/explore/exploreQuickStart.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { normalizeExternalTicketUrl } from '../../v2/ticket/externalTicketUrl.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

/** Fixed Pacific-day: 2026-08-01 15:00 PDT ≈ 22:00 UTC */
const NOW = new Date('2026-08-01T22:00:00.000Z');

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'alpha',
        title: 'Alpha',
        runtimeMin: 100,
        posterUrl: 'https://example.com/a.jpg',
        rating: 'PG-13',
      },
      {
        filmKey: 'beta',
        title: 'Beta',
        runtimeMin: 90,
        posterUrl: null,
      },
      {
        filmKey: 'gamma',
        title: 'Gamma No Enrichment',
        runtimeMin: 80,
      },
    ],
    opportunities: [
      // Past date — excluded
      {
        opportunityKey: 'past',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-07-31',
        localTime: '20:00',
        sortableLocalDateTime: '2026-07-31T20:00',
        formatLabels: ['Digital'],
        ticketUrl: 'https://tickets.example/past',
      },
      // Today already passed (before 15:00 Pacific)
      {
        opportunityKey: 'today-past',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '10:00',
        sortableLocalDateTime: '2026-08-01T10:00',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      // Today future
      {
        opportunityKey: 'today-a',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['imax-at-amc'],
        ticketUrl: 'https://tickets.example/a',
      },
      // Exact duplicate of today-a
      {
        opportunityKey: 'today-a',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['imax-at-amc'],
        ticketUrl: 'https://tickets.example/a',
      },
      {
        opportunityKey: 'today-b',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-01',
        localTime: '16:30',
        sortableLocalDateTime: '2026-08-01T16:30',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      {
        opportunityKey: 'today-g',
        filmKey: 'gamma',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '21:15',
        sortableLocalDateTime: '2026-08-01T21:15',
        formatLabels: ['35mm'],
        ticketUrl: 'https://tickets.example/g',
      },
      // Tomorrow
      {
        opportunityKey: 'tm-a',
        filmKey: 'alpha',
        theaterId: 't2',
        theaterName: 'Theater Two',
        localDate: '2026-08-02',
        localTime: '14:00',
        sortableLocalDateTime: '2026-08-02T14:00',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      // Later in week
      {
        opportunityKey: 'wk-b',
        filmKey: 'beta',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-05',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-05T18:00',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      // Beyond week window (today+7)
      {
        opportunityKey: 'beyond',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-08',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-08T19:00',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
      // Missing film — excluded
      {
        opportunityKey: 'orphan',
        filmKey: 'missing',
        theaterId: 't1',
        theaterName: 'Theater One',
        localDate: '2026-08-01',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-01T20:00',
        formatLabels: ['Digital'],
        ticketUrl: null,
      },
    ],
  };
}

test('parseLocalTimeMinutes and format normalization', () => {
  assert.equal(parseLocalTimeMinutes('19:05'), 19 * 60 + 5);
  assert.equal(parseLocalTimeMinutes('bad'), null);
  assert.equal(normalizeBrowseFormat('imax-at-amc')?.label, 'IMAX');
  assert.equal(normalizeBrowseFormat('IMAX')?.key, 'imax');
});

test('eligibility excludes past dates, passed today times, orphans; dedupes', () => {
  const today = listEligibleBrowseOpportunities(sampleHome(), 'today', NOW);
  const keys = today.map((o) => o.opportunityKey).sort();
  assert.deepEqual(keys, ['today-a', 'today-b', 'today-g']);
  assert.ok(!keys.includes('today-past'));
  assert.ok(!keys.includes('past'));
  assert.ok(!keys.includes('orphan'));

  const tomorrow = listEligibleBrowseOpportunities(
    sampleHome(),
    'tomorrow',
    NOW,
  );
  assert.deepEqual(
    tomorrow.map((o) => o.opportunityKey),
    ['tm-a'],
  );

  const week = listEligibleBrowseOpportunities(sampleHome(), 'week', NOW);
  const weekKeys = week.map((o) => o.opportunityKey).sort();
  assert.deepEqual(weekKeys, [
    'tm-a',
    'today-a',
    'today-b',
    'today-g',
    'wk-b',
  ]);
  assert.ok(!weekKeys.includes('beyond'));

  // Gamma without enrichment still included
  assert.ok(week.some((o) => o.filmKey === 'gamma'));
});

test('every eligible opportunity appears under at least one date mode', () => {
  const home = sampleHome();
  const filmsByKey = new Map(home.films.map((f) => [f.filmKey, f]));
  const modes = ['today', 'tomorrow', 'week'];
  const covered = new Set();
  for (const mode of modes) {
    for (const opp of listEligibleBrowseOpportunities(home, mode, NOW)) {
      covered.add(opportunityDedupeKey(opp));
    }
  }
  for (const opp of home.opportunities) {
    if (
      !isEligibleBrowseOpportunity(opp, {
        dateMode: 'week',
        filmsByKey,
        now: NOW,
      })
    ) {
      continue;
    }
    assert.ok(
      covered.has(opportunityDedupeKey(opp)),
      `missing coverage for ${opp.opportunityKey}`,
    );
  }
});

test('filters use intersection; reset restores matches', () => {
  const eligible = listEligibleBrowseOpportunities(sampleHome(), 'today', NOW);
  const byTheater = filterBrowseOpportunities(eligible, {
    theaterIds: ['t1'],
    formatKeys: [],
    timeRangeId: 'any',
  });
  assert.ok(byTheater.every((o) => o.theaterId === 't1'));

  const byFormat = filterBrowseOpportunities(eligible, {
    theaterIds: [],
    formatKeys: ['imax'],
    timeRangeId: 'any',
  });
  assert.equal(byFormat.length, 1);
  assert.equal(byFormat[0].opportunityKey, 'today-a');

  assert.equal(
    opportunityMatchesTimeRange(
      { localTime: '11:00' },
      'morning',
    ),
    true,
  );
  assert.equal(
    opportunityMatchesTimeRange({ localTime: '12:00' }, 'morning'),
    false,
  );
  assert.equal(
    opportunityMatchesTimeRange({ localTime: '17:00' }, 'evening'),
    true,
  );
  assert.equal(
    opportunityMatchesTimeRange({ localTime: '21:00' }, 'late'),
    true,
  );

  const combined = filterBrowseOpportunities(eligible, {
    theaterIds: ['t1'],
    formatKeys: ['35mm'],
    timeRangeId: 'late',
  });
  assert.equal(combined.length, 1);
  assert.equal(combined[0].opportunityKey, 'today-g');

  const presentation = buildShowtimesBrowsePresentation(
    sampleHome(),
    {
      ...createDefaultShowtimesBrowseUi(),
      dateMode: 'today',
      theaterIds: ['t2'],
      formatKeys: ['imax'],
    },
    { now: NOW },
  );
  assert.equal(presentation.films.length, 0);
  assert.equal(presentation.emptyMessage, 'No showtimes match these filters.');
  assert.equal(presentation.showResetFilters, true);
});

test('grouping sorts by earliest showtime; each film once; week groups by date', () => {
  const week = listEligibleBrowseOpportunities(sampleHome(), 'week', NOW);
  const films = groupBrowseOpportunitiesByFilm(week, sampleHome(), 'week');
  assert.equal(new Set(films.map((f) => f.filmKey)).size, films.length);
  for (let i = 1; i < films.length; i += 1) {
    assert.ok(films[i - 1].earliestSortable <= films[i].earliestSortable);
  }
  const alpha = films.find((f) => f.filmKey === 'alpha');
  assert.ok(alpha.dateGroups.length >= 2);
  assert.ok(alpha.dateGroups[0].localDate < alpha.dateGroups[1].localDate);

  const presentation = buildShowtimesBrowsePresentation(
    sampleHome(),
    { ...createDefaultShowtimesBrowseUi(), dateMode: 'today' },
    { now: NOW },
  );
  assert.equal(presentation.eligibleCount, 3);
  assert.equal(presentation.filteredCount, 3);
  assert.equal(presentation.filmCount, 3);
});

test('ticket URLs normalize; unsafe URLs suppressed', () => {
  assert.equal(
    normalizeExternalTicketUrl('https://tickets.example/a'),
    'https://tickets.example/a',
  );
  assert.equal(normalizeExternalTicketUrl('/relative'), null);
  assert.equal(normalizeExternalTicketUrl(null), null);

  const presentation = buildShowtimesBrowsePresentation(
    sampleHome(),
    createDefaultShowtimesBrowseUi(),
    { now: NOW },
  );
  const alpha = presentation.films.find((f) => f.filmKey === 'alpha');
  const withTicket = alpha.showtimes.find((s) => s.opportunityKey === 'today-a');
  const beta = presentation.films.find((f) => f.filmKey === 'beta');
  assert.equal(withTicket.ticketUrl, 'https://tickets.example/a');
  assert.equal(beta.showtimes[0].ticketUrl, null);
});

test('navigation: Home/Explore origins, film/theater return preserve browse UI', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'home');
  nav = openShowtimesBrowse(nav, {
    originPrimary: 'home',
    homeRestore: { scrollY: 40, expandedShelfId: null, expandedFilmKey: null, topOppIndex: 0 },
  });
  assert.equal(nav.surface.type, 'showtimes-browse');
  assert.equal(resolveActivePrimaryId(nav), 'home');

  nav = updateShowtimesBrowseUi(nav, {
    dateMode: 'tomorrow',
    theaterIds: ['t1'],
    timeRangeId: 'evening',
  });
  assert.equal(nav.surface.browseUi.dateMode, 'tomorrow');

  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    originPrimary: 'home',
    returnSurface: {
      ...nav.surface,
      browseUi: nav.surface.browseUi,
    },
  });
  const backToBrowse = navigateBack(nav);
  assert.equal(backToBrowse.surface?.type, 'showtimes-browse');
  assert.equal(backToBrowse.surface.browseUi.dateMode, 'tomorrow');
  assert.deepEqual(backToBrowse.surface.browseUi.theaterIds, ['t1']);

  nav = openTheaterDetail(backToBrowse, {
    theaterId: 't1',
    originPrimary: 'home',
    returnSurface: backToBrowse.surface,
  });
  const backAgain = navigateBack(nav);
  assert.equal(backAgain.surface?.type, 'showtimes-browse');
  assert.equal(backAgain.surface.browseUi.timeRangeId, 'evening');

  const leave = navigateBack(backAgain);
  assert.equal(leave.surface, null);
  assert.equal(leave.primaryDestinationId, 'home');
  assert.equal(leave._restoredHome?.scrollY, 40);

  let exploreNav = selectPrimaryDestination(createInitialNavState(), 'explore');
  exploreNav = openShowtimesBrowse(exploreNav, { originPrimary: 'explore' });
  assert.equal(resolveActivePrimaryId(exploreNav), 'explore');
});

test('Quick Start includes All showtimes; no fifth primary tab', () => {
  assert.ok(
    QUICK_START.some((item) => item.id === SHOWTIMES_BROWSE_QUICK_START_ID),
  );
  assert.equal(PRIMARY_DESTINATIONS.length, 4);
  assert.ok(!PRIMARY_DESTINATIONS.some((d) => d.label === 'Showtimes'));

  const homeSrc = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(homeSrc, /BrowseShowtimesStrip|Browse Showtimes/);
  assert.equal(homeSrc.includes('Browse all showtimes'), false);
  const appSrc = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  assert.match(appSrc, /ShowtimesBrowseSurface/);
  assert.match(appSrc, /openShowtimesBrowse/);
});

test('empty date-mode messages are honest', () => {
  const emptyHome = { films: sampleHome().films, opportunities: [] };
  const today = buildShowtimesBrowsePresentation(
    emptyHome,
    createDefaultShowtimesBrowseUi(),
    { now: NOW },
  );
  assert.equal(today.emptyMessage, 'No more showtimes today.');
  const tomorrow = buildShowtimesBrowsePresentation(
    emptyHome,
    { ...createDefaultShowtimesBrowseUi(), dateMode: 'tomorrow' },
    { now: NOW },
  );
  assert.equal(tomorrow.emptyMessage, 'No showtimes tomorrow.');
});

test('pacificSortableDateTime returns ISO-like key', () => {
  const key = pacificSortableDateTime(NOW);
  assert.match(key, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('Explore Quick Start All showtimes is not a collection id', () => {
  assert.equal(
    Object.values(COLLECTION_IDS).includes(SHOWTIMES_BROWSE_QUICK_START_ID),
    false,
  );
});
