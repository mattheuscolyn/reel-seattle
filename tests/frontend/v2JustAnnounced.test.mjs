import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildLiveJustAnnouncedPresentation,
  selectJustAnnouncedEntries,
} from '../../v2/justAnnounced/buildLiveJustAnnouncedPresentation.js';
import {
  JUST_ANNOUNCED_SORT_OPTIONS,
  sortJustAnnouncedFilms,
} from '../../v2/justAnnounced/justAnnouncedListControls.js';
import {
  buildJustAnnouncedOpeningDateLabel,
  resolveJustAnnouncedOpeningDate,
} from '../../v2/justAnnounced/resolveJustAnnouncedOpeningDate.js';
import { formatCompactTheaterLine } from '../../v2/homeShelfDetail/compactTheaterLine.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const JA_SRC = readFileSync(
  join(ROOT, 'v2/justAnnounced/JustAnnouncedSurface.jsx'),
  'utf8',
);
const PRESENTATION_SRC = readFileSync(
  join(ROOT, 'v2/justAnnounced/buildLiveJustAnnouncedPresentation.js'),
  'utf8',
);
const SHELL_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailSurface.jsx'),
  'utf8',
);
const CARD_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailFilmCard.jsx'),
  'utf8',
);
const OPENING_SRC = readFileSync(
  join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'),
  'utf8',
);
const LEAVING_SRC = readFileSync(
  join(ROOT, 'v2/leaving/LeavingSoonSurface.jsx'),
  'utf8',
);
const SHELF_DATA_SRC = readFileSync(join(ROOT, 'v2/home/shelfData.js'), 'utf8');

/**
 * Mixed-availability Just Announced home fixture.
 * - with-open: opening date + theaters
 * - opening-only: opening date, no theaters
 * - theater-only: theaters, no opening date
 * - bare: neither opening nor theaters
 * - older: outside window (excluded)
 */
function homeJustAnnouncedMixed(nowIso = '2026-09-05') {
  return {
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'with-open',
        title: 'With Opening',
        filmId: 'tmdb:1',
        runtimeMin: 120,
        posterUrl: null,
        theaterCount: 3,
        showtimeCount: 4,
      },
      {
        filmKey: 'opening-only',
        title: 'Opening Only',
        filmId: 'tmdb:2',
        runtimeMin: 100,
        posterUrl: null,
        theaterCount: 0,
        showtimeCount: 0,
      },
      {
        filmKey: 'theater-only',
        title: 'Theater Only',
        filmId: 'tmdb:3',
        runtimeMin: 95,
        posterUrl: null,
        theaterCount: 2,
        showtimeCount: 2,
      },
      {
        filmKey: 'bare',
        title: 'Bare Film',
        filmId: 'tmdb:4',
        runtimeMin: 88,
        posterUrl: null,
        theaterCount: 0,
        showtimeCount: 0,
      },
    ],
    opportunities: [
      {
        filmKey: 'with-open',
        theaterId: 'siff-cinema-uptown',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-12',
        sortableLocalDateTime: '2026-09-12T19:00:00',
        timeDisplay: '7:00 PM',
        opportunityKey: 'with-open|siff|1',
      },
      {
        filmKey: 'with-open',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-09-13',
        sortableLocalDateTime: '2026-09-13T19:00:00',
        timeDisplay: '7:00 PM',
        opportunityKey: 'with-open|beacon|1',
      },
      {
        filmKey: 'with-open',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-09-14',
        sortableLocalDateTime: '2026-09-14T19:00:00',
        timeDisplay: '7:00 PM',
        opportunityKey: 'with-open|amc|1',
      },
      {
        filmKey: 'with-open',
        theaterId: 'siff-cinema-uptown',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-15',
        sortableLocalDateTime: '2026-09-15T19:00:00',
        timeDisplay: '7:00 PM',
        opportunityKey: 'with-open|siff|2',
      },
      {
        filmKey: 'theater-only',
        theaterId: 'amc-oak-tree-6',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-09-08',
        sortableLocalDateTime: '2026-09-08T18:00:00',
        timeDisplay: '6:00 PM',
        opportunityKey: 'theater-only|oak|1',
      },
      {
        filmKey: 'theater-only',
        theaterId: 'central-cinema',
        theaterName: 'Central Cinema',
        localDate: '2026-09-09',
        sortableLocalDateTime: '2026-09-09T18:00:00',
        timeDisplay: '6:00 PM',
        opportunityKey: 'theater-only|central|1',
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        {
          filmKey: 'with-open',
          showtimeFilmKey: 'with-open',
          openingDate: '2026-09-12',
        },
        {
          filmKey: 'opening-only',
          showtimeFilmKey: 'opening-only',
          openingDate: '2026-09-20',
        },
      ],
    },
    newlyAdded: [
      {
        filmKey: 'with-open',
        title: 'With Opening',
        firstObservedAt: '2026-09-03',
        hasActiveShowtimes: true,
        opportunityCount: 4,
        theaterCount: 3,
        nextShowtimeAt: '2026-09-12T19:00:00',
        posterUrl: null,
      },
      {
        filmKey: 'opening-only',
        title: 'Opening Only',
        firstObservedAt: '2026-09-05',
        hasActiveShowtimes: false,
        opportunityCount: 0,
        theaterCount: 0,
        nextShowtimeAt: null,
        posterUrl: null,
      },
      {
        filmKey: 'theater-only',
        title: 'Theater Only',
        firstObservedAt: '2026-09-04',
        hasActiveShowtimes: true,
        opportunityCount: 2,
        theaterCount: 2,
        nextShowtimeAt: '2026-09-08T18:00:00',
        posterUrl: null,
      },
      {
        filmKey: 'bare',
        title: 'Bare Film',
        firstObservedAt: '2026-09-02',
        hasActiveShowtimes: false,
        opportunityCount: 0,
        theaterCount: 0,
        nextShowtimeAt: null,
        posterUrl: null,
      },
      {
        filmKey: 'older',
        title: 'Older Announcement',
        firstObservedAt: '2026-08-20',
        hasActiveShowtimes: true,
        opportunityCount: 1,
        theaterCount: 1,
        nextShowtimeAt: '2026-09-10T19:00:00',
        posterUrl: null,
      },
    ],
    _now: nowIso,
  };
}

function presentationFor(home = homeJustAnnouncedMixed()) {
  return buildLiveJustAnnouncedPresentation(home, null, {
    now: new Date('2026-09-05T20:00:00-07:00'),
    todayIso: '2026-09-05',
    windowDays: 7,
  });
}

test('Home Just Announced See all navigates to just-announced collection', () => {
  assert.match(HOME_SRC, /COLLECTION_IDS\.justAnnounced/);
  assert.equal(HOME_SRC.includes('See all is visual-only'), false);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.justAnnounced,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'just-announced');
  assert.equal(nav.surface?.originPrimary, 'home');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'home',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'home');
});

test('Just Announced full-list is routed through JustAnnouncedSurface + shared shell', () => {
  assert.match(APP_SRC, /JustAnnouncedSurface/);
  assert.match(APP_SRC, /isJustAnnounced/);
  assert.match(JA_SRC, /HomeShelfDetailSurface/);
  assert.match(JA_SRC, /HomeShelfDetailFilmCard/);
  assert.equal(JA_SRC.includes('className="v2-opening-page"'), false);
  assert.equal(JA_SRC.includes('className="v2-shelf-detail-page"'), false);
  assert.equal(JA_SRC.includes('function OpeningFilmCard'), false);
  assert.match(SHELL_SRC, /data-shelf-detail-surface/);
});

test('Just Announced title and no redundant subtitle', () => {
  const presentation = presentationFor();
  assert.equal(presentation.pageTitle, 'Just Announced');
  assert.equal(presentation.pageSubtitle, null);
  assert.equal(presentation.countLabel, null);
  assert.equal(presentation.showCategoryChips, false);
  assert.deepEqual(presentation.categoryChips, []);
  assert.equal(JA_SRC.includes('categoryChips={null}'), true);
  assert.equal(JA_SRC.includes('v2-opening-chip-row'), false);
});

test('default sort is most recently announced by firstObservedAt', () => {
  assert.equal(JUST_ANNOUNCED_SORT_OPTIONS[0].id, 'recently-announced');
  assert.match(JA_SRC, /useState\('recently-announced'\)/);

  const presentation = presentationFor();
  const sorted = sortJustAnnouncedFilms(
    presentation.films,
    'recently-announced',
  );
  assert.equal(sorted[0].filmKey, 'opening-only');
  assert.equal(sorted[0].firstObservedAt, '2026-09-05');
  assert.equal(sorted[1].firstObservedAt, '2026-09-04');
  assert.equal(sorted[2].firstObservedAt, '2026-09-03');
  assert.equal(sorted[3].firstObservedAt, '2026-09-02');

  const byOpening = sortJustAnnouncedFilms(presentation.films, 'opening-date');
  assert.equal(byOpening[0].filmKey, 'theater-only');
  assert.equal(byOpening[0].openingDate, '2026-09-08');
  assert.equal(byOpening[1].filmKey, 'with-open');
  assert.equal(byOpening[1].openingDate, '2026-09-12');
});

test('announcement date and opening date are not conflated', () => {
  const home = homeJustAnnouncedMixed();
  const entry = home.newlyAdded.find((item) => item.filmKey === 'with-open');
  const openingDate = resolveJustAnnouncedOpeningDate(entry, home);
  assert.equal(openingDate, '2026-09-12');
  assert.notEqual(openingDate, entry.firstObservedAt);
  assert.equal(
    PRESENTATION_SRC.includes('dateLabel: entry.firstObservedAt'),
    false,
  );
  assert.match(PRESENTATION_SRC, /resolveJustAnnouncedOpeningDate/);
  assert.match(SHELF_DATA_SRC, /resolveJustAnnouncedOpeningDate/);

  const film = presentationFor().films.find((f) => f.filmKey === 'with-open');
  assert.equal(film.firstObservedAt, '2026-09-03');
  assert.equal(film.openingDate, '2026-09-12');
  assert.equal(film.dateLabel, 'Opens Sep 12');
  assert.notEqual(film.dateLabel, 'Opens Sep 3');
});

test('opening-date metadata displays correctly; no fake date when missing', () => {
  assert.equal(
    buildJustAnnouncedOpeningDateLabel('2026-09-12', '2026-09-05'),
    'Opens Sep 12',
  );
  assert.equal(buildJustAnnouncedOpeningDateLabel(null), null);

  const presentation = presentationFor();
  const withOpen = presentation.films.find((f) => f.filmKey === 'with-open');
  assert.equal(withOpen.dateLabel, 'Opens Sep 12');
  assert.equal(withOpen.openingDate, '2026-09-12');

  // Earliest screening date is moviegoing metadata — not firstObservedAt.
  const theaterOnly = presentation.films.find(
    (f) => f.filmKey === 'theater-only',
  );
  assert.equal(theaterOnly.openingDate, '2026-09-08');
  assert.equal(theaterOnly.dateLabel, 'Opens Sep 8');
  assert.notEqual(theaterOnly.dateLabel, 'Opens Sep 4');
  assert.notEqual(theaterOnly.openingDate, theaterOnly.firstObservedAt);

  const bare = presentation.films.find((f) => f.filmKey === 'bare');
  assert.equal(bare.openingDate, null);
  assert.equal(bare.dateLabel, null);
  assert.equal(bare.theaterName, null);
  assert.equal(bare.firstObservedAt, '2026-09-02');
});

test('theater aggregation with +N more; omit theater line when none', () => {
  const presentation = presentationFor();
  const withOpen = presentation.films.find((f) => f.filmKey === 'with-open');
  assert.equal(withOpen.theaters.length, 3);
  assert.equal(
    withOpen.theaterName,
    'SIFF Cinema Uptown · The Beacon · +1 more',
  );
  assert.equal(
    formatCompactTheaterLine(withOpen.theaters.map((t) => t.name)),
    withOpen.theaterName,
  );

  const openingOnly = presentation.films.find(
    (f) => f.filmKey === 'opening-only',
  );
  assert.equal(openingOnly.theaters.length, 0);
  assert.equal(openingOnly.theaterName, null);
  assert.equal(openingOnly.dateLabel, 'Opens Sep 20');
  assert.equal(openingOnly.hasUpcomingShowtimes, false);
});

test('full list includes films without active showtimes; excludes outside window', () => {
  const home = homeJustAnnouncedMixed();
  const entries = selectJustAnnouncedEntries(home, {
    now: new Date('2026-09-05T20:00:00-07:00'),
    windowDays: 7,
  });
  assert.equal(
    entries.some((entry) => entry.filmKey === 'opening-only'),
    true,
  );
  assert.equal(entries.some((entry) => entry.filmKey === 'bare'), true);
  assert.equal(entries.some((entry) => entry.filmKey === 'older'), false);

  const presentation = presentationFor();
  assert.equal(presentation.films.length, 4);
  assert.equal(
    presentation.films.some((film) => film.filmKey === 'older'),
    false,
  );
});

test('no screening-level a11y chips; no unnecessary category pills', () => {
  const presentation = presentationFor();
  for (const film of presentation.films) {
    assert.equal(film.formatLabel, null);
    assert.deepEqual(film.formatLabels, []);
  }
  assert.equal(JSON.stringify(presentation).includes('Closed Captions'), false);
  assert.equal(JA_SRC.includes('Opening categories'), false);
  assert.equal(presentation.showCategoryChips, false);
});

test('film clickthrough works without active showtimes', () => {
  assert.match(JA_SRC, /onOpenFilmDetail/);
  assert.match(CARD_SRC, /More details/);
  const bare = presentationFor().films.find((f) => f.filmKey === 'bare');
  assert.equal(bare.hasUpcomingShowtimes, false);
  assert.equal(bare.opportunityKey, null);

  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.justAnnounced,
    originPrimary: 'home',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'bare',
    opportunityKey: null,
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(nav.surface?.filmKey, 'bare');
  assert.equal(nav.surface?.returnSurface?.collectionId, 'just-announced');
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'just-announced');
});

test('Opening This Week and Leaving Soon still use shared shell independently', () => {
  assert.match(OPENING_SRC, /HomeShelfDetailSurface/);
  assert.match(LEAVING_SRC, /HomeShelfDetailSurface/);
  assert.equal(OPENING_SRC.includes('JustAnnouncedSurface'), false);
  assert.equal(LEAVING_SRC.includes('JustAnnouncedSurface'), false);
});

test('no duplicated Just Announced page shell', () => {
  assert.equal(JA_SRC.includes('<section className="v2-opening-page"'), false);
  assert.equal(JA_SRC.includes('<section className="v2-shelf-detail-page"'), false);
  assert.match(
    JA_SRC,
    /from '\.\.\/homeShelfDetail\/HomeShelfDetailSurface\.jsx'/,
  );
});
