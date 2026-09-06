import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canGoNext,
  canGoPrevious,
  clampSelectionIndex,
  selectTopOpportunities,
  wrapSelectionIndex,
} from '../../v2/adapters/selectTopOpportunities.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { pacificTodayIso } from '../../v2/opening/openingDateCopy.js';
import {
  buildInlineQuickDetail,
  buildLeavingSoonShelf,
  buildOpeningThisWeekShelf,
  formatRuntimeLabel,
} from '../../v2/home/shelfData.js';
import { TOP_OPPORTUNITY_FIXTURES } from '../../v2/fixtures/homeVisualFixtures.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function minimalHomeData(overrides = {}) {
  const today = pacificTodayIso();
  const future = new Date(`${today}T12:00:00`);
  future.setDate(future.getDate() + 1);
  const openingDate = future.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  return {
    generatedAt: '2026-07-20T12:00:00Z',
    leavingSoonExcluded: true,
    films: [
      {
        filmKey: 'film-a',
        title: 'Alpha',
        posterUrl: 'https://example.com/a.jpg',
        runtimeMin: 110,
        showtimeCount: 3,
        theaterCount: 2,
      },
      {
        filmKey: 'film-b',
        title: 'Beta',
        posterUrl: null,
        runtimeMin: null,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-a',
        filmKey: 'film-a',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-21',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-07-21T19:00',
        formatLabels: ['35mm'],
        ticketUrl: null,
      },
      {
        opportunityKey: 'opp-b',
        filmKey: 'film-b',
        theaterId: 't2',
        theaterName: 'Beacon',
        localDate: '2026-07-21',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: '2026-07-21T20:00',
        formatLabels: [],
        ticketUrl: null,
      },
    ],
    newlyAdded: [
      {
        filmKey: 'film-a',
        title: 'Alpha',
        posterUrl: 'https://example.com/a.jpg',
        firstObservedAt: '2026-07-20',
        lastSeenDate: '2026-07-20',
        theaterCount: 2,
        opportunityCount: 1,
        hasActiveShowtimes: true,
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        {
          filmKey: 'film-a',
          parentFilmKey: 'film-a',
          showtimeFilmKey: 'film-a',
          filmId: null,
          title: 'Alpha',
          openingDate,
          openingType: 'theatrical',
          categoryId: 'new',
          categoryLabel: 'New',
          categoryBadge: 'New',
          theaterCountOnOpeningDate: 2,
          theatersOnOpeningDate: ['t1'],
          visibleShowtimeCount: 3,
          engagementDays: 3,
          confidence: 'high',
        },
      ],
    },
    opportunityCandidates: [
      {
        opportunityKey: 'opp-a',
        filmKey: 'film-a',
        title: 'Alpha',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        sortableLocalDateTime: '2026-07-21T19:00',
        chronologicalKey: '2026-07-21T19:00|opp-a',
        formatLabels: ['35mm'],
        isNewlyAdded: true,
        filmShowtimeCount: 3,
        filmTheaterCount: 2,
      },
      {
        opportunityKey: 'opp-b',
        filmKey: 'film-b',
        title: 'Beta',
        theaterId: 't2',
        theaterName: 'Beacon',
        sortableLocalDateTime: '2026-07-21T20:00',
        chronologicalKey: '2026-07-21T20:00|opp-b',
        formatLabels: [],
        isNewlyAdded: false,
        filmShowtimeCount: 1,
        filmTheaterCount: 1,
      },
    ],
    ...overrides,
  };
}

test('Top Opportunity selector returns real film keys not fixture titles', () => {
  const selections = selectTopOpportunities(minimalHomeData());
  assert.ok(selections.length >= 1);
  const titles = selections.map((item) => item.film.title);
  for (const fixture of TOP_OPPORTUNITY_FIXTURES) {
    assert.equal(titles.includes(fixture.title), false);
  }
  assert.ok(selections.every((item) => item.film.filmKey));
  assert.ok(selections.every((item) => item.representativeOpportunity?.opportunityKey));
});

test('carousel wraps circularly with previous/next', () => {
  assert.equal(canGoPrevious(0, 3), true);
  assert.equal(canGoNext(0, 3), true);
  assert.equal(canGoPrevious(2, 3), true);
  assert.equal(canGoNext(2, 3), true);
  assert.equal(wrapSelectionIndex(3, 3), 0);
  assert.equal(wrapSelectionIndex(-1, 3), 2);
  assert.equal(wrapSelectionIndex(5, 3), 2);
  assert.equal(clampSelectionIndex(5, 3), 2);
  assert.equal(clampSelectionIndex(-1, 3), 0);
  assert.equal(canGoPrevious(0, 1), false);
  assert.equal(canGoNext(0, 1), false);
});

test('Opening This Week Home shelf uses verified opening artifact', () => {
  const shelf = buildOpeningThisWeekShelf(minimalHomeData());
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films.length, 1);
  assert.equal(shelf.films[0].filmKey, 'film-a');
  assert.equal(shelf.films[0].source, 'opening-this-week-verified');
  assert.equal(shelf.films[0].badge, 'New');
  assert.equal(shelf.films[0].title.includes('Long Horizon'), false);
});

test('Leaving Soon shelf is unavailable without a published artifact', () => {
  const shelf = buildLeavingSoonShelf(minimalHomeData());
  assert.equal(shelf.status, 'unavailable');
  assert.equal(shelf.films.length, 0);
  assert.equal(shelf.semantics, 'leaving-soon-unavailable');
  assert.match(shelf.emptyTitle, /Leaving Soon/i);
  assert.match(shelf.emptyBody, /theatrical run/i);
  assert.equal(shelf.reason.toLowerCase().includes('gated'), false);
  assert.equal(shelf.reason.toLowerCase().includes('consumed by v2'), false);
});

test('Opening This Week Home shelf uses opening date copy', () => {
  const shelf = buildOpeningThisWeekShelf(minimalHomeData());
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.reason, null);
  assert.match(shelf.films[0].metaLabel, /Opens/);
  assert.equal(shelf.films[0].title.includes('Blue Hour'), false);
});

test('Home production UI omits developer diagnostics and Home TMDB block', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const homeSrc = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  const shelfSrc = readFileSync(join(root, 'v2/home/FilmShelf.jsx'), 'utf8');
  assert.equal(homeSrc.includes('TmdbAttribution'), false);
  assert.equal(homeSrc.includes('Development notes'), false);
  assert.equal(homeSrc.includes('v2-dev-details'), false);
  assert.match(shelfSrc, /v2-shelf-note/);
  assert.match(shelfSrc, /v2-shelf-empty/);
  const profileSrc = readFileSync(
    join(root, 'v2/profile/ProfileDestination.jsx'),
    'utf8',
  );
  assert.equal(profileSrc.includes('TmdbAttribution'), false);
  assert.equal(profileSrc.includes('About &amp; data sources'), false);
  assert.equal(profileSrc.includes('About & data sources'), false);
});

test('mockup mode stays isolated behind homeMockup query', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const mockSrc = readFileSync(
    join(root, 'v2/fixtures/homeLandingMockupPresentation.js'),
    'utf8',
  );
  const homeSrc = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(mockSrc, /HOME_MOCKUP_QUERY/);
  assert.match(homeSrc, /isHomeMockupMode/);
  assert.match(homeSrc, /data-home-source/);
  assert.equal(homeSrc.includes('fixture-open-2') || homeSrc.includes('Blue Hour'), true);
});

test('shared Home shelves and Browse Showtimes structure used for live and mockup', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const homeSrc = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(homeSrc, /TopOpportunityFeature/);
  assert.match(homeSrc, /BrowseShowtimesStrip/);
  assert.match(homeSrc, /FilmShelf/);
  assert.match(homeSrc, /EditorialIntro/);
  assert.equal(homeSrc.includes('PlannerCta'), false);
  assert.equal(homeSrc.includes('ExploreMore'), false);
  assert.equal(homeSrc.includes('TOP_OPPORTUNITY_FIXTURES'), false);
  assert.match(homeSrc, /id="v2-leaving"/);
  assert.match(homeSrc, /id="v2-special"/);
  assert.match(homeSrc, /id="v2-opening"/);
  assert.match(homeSrc, /id="v2-announced"/);
  const leavingAt = homeSrc.indexOf('id="v2-leaving"');
  const specialAt = homeSrc.indexOf('id="v2-special"');
  const openingAt = homeSrc.indexOf('id="v2-opening"');
  const announcedAt = homeSrc.indexOf('id="v2-announced"');
  assert.ok(leavingAt > 0 && specialAt > leavingAt);
  assert.ok(openingAt > specialAt && announcedAt > openingAt);
});

test('inline quick detail omits missing synopsis rating year genre without enrichment', () => {
  const home = minimalHomeData();
  const shelfFilm = buildOpeningThisWeekShelf(home).films[0];
  const detail = buildInlineQuickDetail(home, shelfFilm);
  assert.equal(detail.synopsis, null);
  assert.equal(detail.rating, null);
  assert.equal(detail.year, null);
  assert.equal(detail.genre, null);
  assert.ok(detail.showingLine);
  assert.equal(detail.opportunityKey, 'opp-a');
  assert.match(detail.alsoPlayingLabel, /2 theaters/);
  assert.equal(detail.surfaceReasonLabel, 'New');
});

test('inline quick detail shows only one opportunity line', () => {
  const home = minimalHomeData({
    opportunities: [
      ...minimalHomeData().opportunities,
      {
        opportunityKey: 'opp-a2',
        filmKey: 'film-a',
        theaterId: 't3',
        theaterName: 'Other',
        localDate: '2026-07-22',
        localTime: '21:00',
        timeDisplay: '9:00 PM',
        sortableLocalDateTime: '2026-07-22T21:00',
        formatLabels: [],
        ticketUrl: null,
      },
    ],
  });
  const detail = buildInlineQuickDetail(home, buildOpeningThisWeekShelf(home).films[0]);
  assert.equal(detail.opportunityKey, 'opp-a');
  assert.equal(detail.showingLine.includes('Other'), false);
});

test('formatRuntimeLabel produces compact runtime', () => {
  assert.equal(formatRuntimeLabel(134), '2h 14m');
  assert.equal(formatRuntimeLabel(45), '45m');
  assert.equal(formatRuntimeLabel(null), null);
});

test('nav open Film Detail preserves Home origin and restores on back', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'film-a',
    opportunityKey: 'opp-a',
    originPrimary: 'home',
    homeRestore: {
      scrollY: 420,
      expandedShelfId: 'v2-opening',
      expandedFilmKey: 'film-a',
      topOppIndex: 1,
    },
  });
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.originPrimary, 'home');
  assert.equal(nav.primaryDestinationId, 'home');
  const back = navigateBack(nav);
  assert.equal(back.surface, null);
  assert.equal(back.primaryDestinationId, 'home');
  assert.equal(back._restoredHome.scrollY, 420);
  assert.equal(back._restoredHome.expandedFilmKey, 'film-a');
});

test('See all opens Explore-associated collection surfaces', () => {
  let nav = createInitialNavState();
  nav = openCollection(nav, { collectionId: 'opening-this-week' });
  assert.equal(nav.primaryDestinationId, 'explore');
  assert.equal(nav.surface.collectionId, 'opening-this-week');
  nav = openCollection(createInitialNavState(), {
    collectionId: 'leaving-soon',
  });
  assert.equal(nav.surface.collectionId, 'leaving-soon');
});

test('HomeDestination does not import fictional Top Opportunity fixtures as default', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const source = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  assert.equal(source.includes('TOP_OPPORTUNITY_FIXTURES'), false);
  assert.equal(source.includes('OPENING_THIS_WEEK_FIXTURES'), false);
  assert.equal(source.includes('LEAVING_SOON_FIXTURES'), false);
  assert.match(source, /selectTopOpportunities|TopOpportunityFeature/);
  assert.match(source, /buildOpeningThisWeekShelf/);
  assert.match(source, /isHomeMockupMode/);
  assert.match(source, /homeLandingMockupPresentation/);
});

test('Explore landing remains a primary destination root', () => {
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'explore');
  assert.equal(nav.primaryDestinationId, 'explore');
  assert.equal(nav.surface, null);
});

test('Home Quick Paths fixture labels remain available for Explore/mockup reuse', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const exploreSrc = readFileSync(join(root, 'v2/home/ExploreMore.jsx'), 'utf8');
  assert.match(exploreSrc, /Quick Paths/);
  assert.match(exploreSrc, /HOME_QUICK_PATH_ROWS/);
  const mockSrc = readFileSync(
    join(root, 'v2/fixtures/homeLandingMockupPresentation.js'),
    'utf8',
  );
  assert.match(mockSrc, /Your saved films and upcoming picks/);
  assert.match(mockSrc, /Blue Hour/);
  assert.match(mockSrc, /The Long Horizon/);
  const homeSrc = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  assert.equal(homeSrc.includes('ExploreMore'), false);
});

test('TopOpportunityFeature uses selector not fixture array', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const source = readFileSync(
    join(root, 'v2/home/TopOpportunityFeature.jsx'),
    'utf8',
  );
  assert.match(source, /selectTopOpportunities/);
  assert.equal(source.includes('TOP_OPPORTUNITY_FIXTURES'), false);
  assert.match(source, /canGoPrevious/);
  assert.match(source, /canGoNext/);
  assert.match(source, /wrapSelectionIndex/);
  assert.match(source, /wrap:\s*true/);
  assert.match(source, /onOpenFilmDetail/);
});

test('Home FilmShelf uses shared four-slot horizontal scroll contract', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const shelfSrc = readFileSync(join(root, 'v2/home/FilmShelf.jsx'), 'utf8');
  const homeSrc = readFileSync(join(root, 'v2/HomeDestination.jsx'), 'utf8');
  const css = readFileSync(join(root, 'v2/v2.css'), 'utf8');
  assert.equal(homeSrc.includes('maxVisible'), false);
  assert.match(shelfSrc, /data-shelf-visible-slots="4"/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /scroll-snap-type:\s*x proximity/);
});
