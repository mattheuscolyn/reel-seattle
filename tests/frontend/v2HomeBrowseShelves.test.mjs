import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  buildJustAnnouncedShelf,
  buildSpecialPresentationsShelf,
  resolveBestSpecialCanonicalId,
} from '../../v2/home/shelfData.js';
import {
  createInitialNavState,
  openCollection,
  openFilmDetail,
  openShowtimesBrowse,
  navigateBack,
} from '../../v2/navigation/navState.js';
import { COLLECTION_IDS } from '../../v2/destinations.js';
import { resolveWeekendRange } from '../../v2/explore/exploreCatalog.js';
import { normalizeBrowseFilters } from '../../v2/showtimes/browseFilterState.js';
import { createDefaultShowtimesBrowseUi } from '../../v2/showtimes/showtimesBrowseModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const STRIP_SRC = readFileSync(
  join(ROOT, 'v2/home/BrowseShowtimesStrip.jsx'),
  'utf8',
);
const SHELF_SRC = readFileSync(join(ROOT, 'v2/home/FilmShelf.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function homeWithSpecials() {
  return {
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'dune',
        title: 'Dune',
        theaterCount: 2,
        showtimeCount: 3,
        runtimeMin: 155,
        posterUrl: null,
        filmId: null,
      },
      {
        filmKey: 'sinners',
        title: 'Sinners',
        theaterCount: 1,
        showtimeCount: 1,
        runtimeMin: 137,
        posterUrl: null,
        filmId: null,
      },
      {
        filmKey: 'plain',
        title: 'Plain Film',
        theaterCount: 1,
        showtimeCount: 1,
        runtimeMin: 100,
        posterUrl: null,
        filmId: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-imax',
        filmKey: 'dune',
        theaterName: 'AMC',
        formatLabels: ['IMAX at AMC'],
        sortableLocalDateTime: '2026-09-07T19:00:00',
      },
      {
        opportunityKey: 'opp-oc',
        filmKey: 'dune',
        theaterName: 'SIFF',
        formatLabels: ['Open Caption'],
        sortableLocalDateTime: '2026-09-06T14:00:00',
      },
      {
        opportunityKey: 'opp-70',
        filmKey: 'sinners',
        theaterName: 'Cinerama',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-08T20:00:00',
      },
      {
        opportunityKey: 'opp-plain',
        filmKey: 'plain',
        theaterName: 'SIFF',
        formatLabels: ['Digital'],
        sortableLocalDateTime: '2026-09-06T18:00:00',
      },
    ],
    newlyAdded: [
      {
        filmKey: 'dune',
        title: 'Dune',
        firstObservedAt: '2026-09-04',
        hasActiveShowtimes: true,
        opportunityCount: 2,
        theaterCount: 2,
        nextShowtimeAt: '2026-09-06T14:00:00',
        posterUrl: null,
      },
      {
        filmKey: 'old',
        title: 'Old News',
        firstObservedAt: '2026-08-01',
        hasActiveShowtimes: true,
        opportunityCount: 1,
        theaterCount: 1,
        nextShowtimeAt: '2026-09-10T12:00:00',
        posterUrl: null,
      },
      {
        filmKey: 'inactive',
        title: 'Gone',
        firstObservedAt: '2026-09-03',
        hasActiveShowtimes: false,
        opportunityCount: 0,
        theaterCount: 0,
        nextShowtimeAt: null,
        posterUrl: null,
      },
    ],
  };
}

describe('Home browse + shelves redesign', () => {
  test('Home section order and removed quick-links', () => {
    assert.match(HOME_SRC, /BrowseShowtimesStrip/);
    assert.equal(HOME_SRC.includes('PlannerCta'), false);
    assert.equal(HOME_SRC.includes('ExploreMore'), false);
    assert.equal(HOME_SRC.includes('Browse all showtimes'), false);

    const markers = [
      'TopOpportunityFeature',
      'BrowseShowtimesStrip',
      'id="v2-leaving"',
      'id="v2-special"',
      'id="v2-opening"',
      'id="v2-announced"',
    ];
    let cursor = -1;
    for (const marker of markers) {
      const at = HOME_SRC.indexOf(marker, cursor + 1);
      assert.ok(at > cursor, `missing or out of order: ${marker}`);
      cursor = at;
    }
  });

  test('Browse Showtimes strip is a neutral launcher without See all or active chip', () => {
    assert.match(STRIP_SRC, /Browse Showtimes/);
    assert.match(STRIP_SRC, /data-home-browse-strip/);
    assert.match(STRIP_SRC, /data-browse-entry=\{entry\.id\}/);
    assert.match(STRIP_SRC, /id: 'all'/);
    assert.match(STRIP_SRC, /id: 'today'/);
    assert.match(STRIP_SRC, /id: 'weekend'/);
    assert.match(STRIP_SRC, /label: 'This weekend'|This weekend/);
    assert.match(STRIP_SRC, /id: 'theaters'/);
    assert.match(STRIP_SRC, /v2-home-browse-icon/);
    assert.match(STRIP_SRC, /IconBrowseGrid|IconCalendar|IconHome/);
    assert.equal(STRIP_SRC.includes("id: 'nearby'"), false);
    assert.equal(STRIP_SRC.includes('Nearby'), false);
    assert.equal(STRIP_SRC.includes('Favorite'), false);
    assert.equal(STRIP_SRC.includes('favoritesOnly'), false);
    assert.equal(STRIP_SRC.includes('getFavoriteTheaters'), false);
    assert.equal(STRIP_SRC.includes('See all'), false);
    assert.equal(STRIP_SRC.includes('v2-search-chip-active'), false);
    assert.equal(STRIP_SRC.includes('aria-pressed'), false);
    assert.match(STRIP_SRC, /dateMode: 'week'/);
    assert.match(STRIP_SRC, /dateMode: 'today'/);
    assert.match(STRIP_SRC, /resolveWeekendRange/);
    assert.match(STRIP_SRC, /mode: 'range'/);
    assert.match(STRIP_SRC, /COLLECTION_IDS\.theaters/);
    assert.match(CSS, /\.v2-home-browse-chip\b/);
    assert.match(CSS, /grid-template-columns:\s*repeat\(4/);
    assert.equal(CSS.includes('.v2-home-browse-chip-active'), false);
  });

  test('Browse entry actions open intended nav surfaces', () => {
    let nav = openShowtimesBrowse(createInitialNavState(), {
      originPrimary: 'home',
      browseUi: {
        ...createDefaultShowtimesBrowseUi(),
        dateMode: 'week',
      },
    });
    assert.equal(nav.surface?.type, 'showtimes-browse');
    assert.equal(nav.surface?.browseUi?.dateMode, 'week');
    const allNormalized = normalizeBrowseFilters(nav.surface.browseUi);
    assert.equal(allNormalized.dateSelection.mode, 'week');

    nav = openShowtimesBrowse(createInitialNavState(), {
      originPrimary: 'home',
      browseUi: {
        ...createDefaultShowtimesBrowseUi(),
        dateMode: 'today',
      },
    });
    assert.equal(nav.surface?.browseUi?.dateMode, 'today');
    const todayNormalized = normalizeBrowseFilters(nav.surface.browseUi);
    assert.equal(todayNormalized.dateSelection.mode, 'today');
    assert.notEqual(
      allNormalized.dateSelection.endDate,
      todayNormalized.dateSelection.endDate,
    );

    nav = openShowtimesBrowse(createInitialNavState(), {
      originPrimary: 'home',
      browseUi: {
        dateSelection: {
          mode: 'range',
          startDate: '2026-09-11',
          endDate: '2026-09-13',
        },
      },
    });
    assert.equal(nav.surface?.browseUi?.dateSelection?.mode, 'range');
    assert.equal(nav.surface?.browseUi?.dateSelection?.startDate, '2026-09-11');
    assert.equal(nav.surface?.browseUi?.dateSelection?.endDate, '2026-09-13');

    const normalized = normalizeBrowseFilters(nav.surface.browseUi);
    assert.equal(normalized.dateSelection.mode, 'range');
    assert.equal(normalized.dateSelection.startDate, '2026-09-11');
    assert.equal(normalized.dateSelection.endDate, '2026-09-13');

    nav = openCollection(createInitialNavState(), {
      collectionId: COLLECTION_IDS.theaters,
      originPrimary: 'home',
    });
    assert.equal(nav.surface?.type, 'collection');
    assert.equal(nav.surface?.collectionId, 'theaters');
  });

  test('This weekend resolves Friday–Sunday for weekday and weekend boundaries', () => {
    // Wednesday → upcoming Fri–Sun
    assert.deepEqual(resolveWeekendRange('2026-09-02'), {
      start: '2026-09-04',
      end: '2026-09-06',
    });
    // Friday → current weekend
    assert.deepEqual(resolveWeekendRange('2026-09-04'), {
      start: '2026-09-04',
      end: '2026-09-06',
    });
    // Saturday → current weekend
    assert.deepEqual(resolveWeekendRange('2026-09-05'), {
      start: '2026-09-04',
      end: '2026-09-06',
    });
    // Sunday → current weekend
    assert.deepEqual(resolveWeekendRange('2026-09-06'), {
      start: '2026-09-04',
      end: '2026-09-06',
    });

    for (const today of [
      '2026-09-02',
      '2026-09-04',
      '2026-09-05',
      '2026-09-06',
    ]) {
      const weekend = resolveWeekendRange(today);
      const filters = normalizeBrowseFilters({
        ...createDefaultShowtimesBrowseUi(),
        dateSelection: {
          mode: 'range',
          startDate: weekend.start,
          endDate: weekend.end,
        },
      });
      assert.equal(filters.dateSelection.mode, 'range');
      assert.equal(filters.dateSelection.startDate, weekend.start);
      assert.equal(filters.dateSelection.endDate, weekend.end);
    }
  });

  test('Special Presentations selects notable formats and dedupes by film', () => {
    const home = homeWithSpecials();
    assert.equal(
      resolveBestSpecialCanonicalId(home.opportunities[0]),
      'imax',
    );
    const shelf = buildSpecialPresentationsShelf(home);
    assert.equal(shelf.status, 'ready');
    assert.equal(shelf.films.length, 2);
    assert.equal(shelf.films[0].filmKey, 'sinners');
    assert.equal(shelf.films[0].badge, '70mm');
    assert.equal(shelf.films[1].filmKey, 'dune');
    assert.equal(shelf.films[1].badge, 'IMAX');
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'plain'),
      false,
    );
  });

  test('Just Announced uses newlyAdded firstObserved window with active showtimes', () => {
    const home = homeWithSpecials();
    const shelf = buildJustAnnouncedShelf(home, null, {
      now: new Date('2026-09-05T20:00:00-07:00'),
      windowDays: 7,
    });
    assert.equal(shelf.status, 'ready');
    assert.equal(shelf.films.length, 1);
    assert.equal(shelf.films[0].filmKey, 'dune');
    assert.equal(shelf.films[0].badge, 'Just announced');
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'old'),
      false,
    );
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'inactive'),
      false,
    );
  });

  test('Just Announced hides See all; other shelves keep See all wiring', () => {
    assert.match(SHELF_SRC, /hideSeeAll/);
    assert.match(HOME_SRC, /id="v2-announced"[\s\S]*hideSeeAll/s);
    assert.match(HOME_SRC, /COLLECTION_IDS\.leavingSoon/);
    assert.match(HOME_SRC, /COLLECTION_IDS\.formats/);
    assert.match(HOME_SRC, /COLLECTION_IDS\.openingThisWeek/);
  });

  test('shelf horizontal strip contract remains', () => {
    assert.match(SHELF_SRC, /data-shelf-visible-slots="4"/);
    assert.match(CSS, /scroll-snap-type:\s*x proximity/);
    assert.match(CSS, /\.v2-shelf-row\s*\{[^}]*overflow-x:\s*auto/s);
  });

  test('Home film detail restoration still works', () => {
    let nav = openFilmDetail(createInitialNavState(), {
      filmKey: 'dune',
      originPrimary: 'home',
      homeRestore: {
        scrollY: 320,
        expandedShelfId: 'v2-special',
        expandedFilmKey: 'dune',
        topOppIndex: 1,
      },
    });
    const back = navigateBack(nav);
    assert.equal(back.surface, null);
    assert.equal(back._restoredHome?.scrollY, 320);
    assert.equal(back._restoredHome?.expandedShelfId, 'v2-special');
  });
});
