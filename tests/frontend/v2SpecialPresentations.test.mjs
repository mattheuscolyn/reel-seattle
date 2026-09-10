import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildSpecialPresentationsShelf,
  HOME_SPECIAL_PRESENTATIONS_MAX_CARDS,
} from '../../v2/home/shelfData.js';
import {
  buildLiveSpecialPresentationsPresentation,
  formatCompactPresentationLabelLine,
  formatSpecialPresentationDateShort,
} from '../../v2/specialPresentations/buildLiveSpecialPresentationsPresentation.js';
import {
  SPECIAL_PRESENTATIONS_SORT_OPTIONS,
  filterSpecialPresentationFilms,
  sortSpecialPresentationFilms,
} from '../../v2/specialPresentations/specialPresentationsListControls.js';
import { collectSpecialPresentationsByFilm } from '../../v2/specialPresentations/collectSpecialPresentations.js';
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
const SP_SRC = readFileSync(
  join(ROOT, 'v2/specialPresentations/SpecialPresentationsSurface.jsx'),
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
const JA_SRC = readFileSync(
  join(ROOT, 'v2/justAnnounced/JustAnnouncedSurface.jsx'),
  'utf8',
);

function homeWithSpecials() {
  return {
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'dune',
        title: 'Dune',
        theaterCount: 3,
        showtimeCount: 5,
        runtimeMin: 155,
        posterUrl: null,
        filmId: null,
      },
      {
        filmKey: 'sinners',
        title: 'Sinners',
        theaterCount: 1,
        showtimeCount: 2,
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
      {
        filmKey: 'extra-70',
        title: 'Extra Seventy',
        theaterCount: 1,
        showtimeCount: 1,
        runtimeMin: 110,
        posterUrl: null,
        filmId: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-imax',
        filmKey: 'dune',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-09-07',
        formatLabels: ['IMAX at AMC'],
        sortableLocalDateTime: '2026-09-07T19:00:00',
        timeDisplay: '7:00 PM',
      },
      {
        opportunityKey: 'opp-oc',
        filmKey: 'dune',
        theaterId: 'siff-cinema-uptown',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-06',
        formatLabels: ['Open Caption'],
        sortableLocalDateTime: '2026-09-06T14:00:00',
        timeDisplay: '2:00 PM',
      },
      {
        opportunityKey: 'opp-dune-digital',
        filmKey: 'dune',
        theaterId: 'central-cinema',
        theaterName: 'Central Cinema',
        localDate: '2026-09-05',
        formatLabels: ['Digital'],
        sortableLocalDateTime: '2026-09-05T18:00:00',
        timeDisplay: '6:00 PM',
      },
      {
        opportunityKey: 'opp-70-a',
        filmKey: 'sinners',
        theaterId: 'cinerama',
        theaterName: 'Cinerama',
        localDate: '2026-09-08',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-08T20:00:00',
        timeDisplay: '8:00 PM',
      },
      {
        opportunityKey: 'opp-70-b',
        filmKey: 'sinners',
        theaterId: 'cinerama',
        theaterName: 'Cinerama',
        localDate: '2026-09-09',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-09T20:00:00',
        timeDisplay: '8:00 PM',
      },
      {
        opportunityKey: 'opp-70-beacon',
        filmKey: 'sinners',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-09-10',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-10T19:00:00',
        timeDisplay: '7:00 PM',
      },
      {
        opportunityKey: 'opp-70-siff',
        filmKey: 'sinners',
        theaterId: 'siff-cinema-downtown',
        theaterName: 'SIFF Cinema Downtown',
        localDate: '2026-09-11',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-11T19:00:00',
        timeDisplay: '7:00 PM',
      },
      {
        opportunityKey: 'opp-plain',
        filmKey: 'plain',
        theaterId: 'siff-cinema-uptown',
        theaterName: 'SIFF Cinema Uptown',
        localDate: '2026-09-06',
        formatLabels: ['Digital'],
        sortableLocalDateTime: '2026-09-06T18:00:00',
        timeDisplay: '6:00 PM',
      },
      {
        opportunityKey: 'opp-extra',
        filmKey: 'extra-70',
        theaterId: 'the-beacon',
        theaterName: 'The Beacon',
        localDate: '2026-09-12',
        formatLabels: ['70mm'],
        sortableLocalDateTime: '2026-09-12T18:00:00',
        timeDisplay: '6:00 PM',
      },
    ],
  };
}

test('Home Special Presentations See all opens dedicated special-presentations page', () => {
  assert.match(HOME_SRC, /COLLECTION_IDS\.specialPresentations/);
  assert.equal(
    /id="v2-special"[\s\S]*COLLECTION_IDS\.formats/s.test(HOME_SRC),
    false,
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.specialPresentations,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.collectionId, 'special-presentations');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'home',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
});

test('Special Presentations renders through shared shell and card', () => {
  assert.match(APP_SRC, /SpecialPresentationsSurface/);
  assert.match(APP_SRC, /isSpecialPresentations/);
  assert.match(SP_SRC, /HomeShelfDetailSurface/);
  assert.match(SP_SRC, /HomeShelfDetailFilmCard/);
  assert.equal(SP_SRC.includes('className="v2-opening-page"'), false);
  assert.equal(SP_SRC.includes('className="v2-shelf-detail-page"'), false);
  assert.match(SHELL_SRC, /data-shelf-detail-surface/);
});

test('title is Special Presentations with no subtitle', () => {
  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  assert.equal(presentation.pageTitle, 'Special Presentations');
  assert.equal(presentation.pageSubtitle, null);
  assert.equal(presentation.countLabel, null);
  assert.equal(presentation.showCategoryChips, false);
  assert.equal(SP_SRC.includes('categoryChips={null}'), true);
});

test('full eligible set exceeds Home shelf card limit', () => {
  const home = homeWithSpecials();
  const collected = collectSpecialPresentationsByFilm(home);
  assert.ok(collected.length > HOME_SPECIAL_PRESENTATIONS_MAX_CARDS || collected.length >= 3);
  const shelf = buildSpecialPresentationsShelf(home, null, { maxCards: 2 });
  const presentation = buildLiveSpecialPresentationsPresentation(home);
  assert.equal(shelf.films.length, 2);
  assert.ok(presentation.films.length > shelf.films.length);
  assert.equal(presentation.films.some((f) => f.filmKey === 'extra-70'), true);
  assert.equal(presentation.films.some((f) => f.filmKey === 'plain'), false);
});

test('labels derive from canonical qualifying data and dedupe', () => {
  assert.equal(formatSpecialPresentationDateShort('2026-09-14'), 'Sep 14');
  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  const dune = presentation.films.find((f) => f.filmKey === 'dune');
  assert.ok(dune);
  assert.deepEqual(dune.presentationCanonicalIds, ['imax', 'open-caption']);
  assert.equal(dune.formatLabel, 'IMAX · Open Captions');
  assert.equal(
    formatCompactPresentationLabelLine(dune.formatLabels),
    dune.formatLabel,
  );

  const sinners = presentation.films.find((f) => f.filmKey === 'sinners');
  assert.deepEqual(sinners.presentationCanonicalIds, ['70mm']);
  assert.equal(sinners.formatLabel, '70mm');
  assert.equal(sinners.formatLabels.filter((l) => l === '70mm').length, 1);
});

test('ordinary Closed Captions chips do not appear', () => {
  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  assert.equal(JSON.stringify(presentation).includes('Closed Captions'), false);
  assert.equal(JSON.stringify(presentation).includes('closed captions'), false);
  for (const film of presentation.films) {
    assert.equal(film.formatLabels.includes('Closed Captions'), false);
  }
});

test('theater aggregation uses only qualifying special opportunities', () => {
  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  const dune = presentation.films.find((f) => f.filmKey === 'dune');
  assert.equal(dune.theaters.length, 2);
  assert.equal(
    dune.theaters.some((t) => t.name === 'Central Cinema'),
    false,
  );
  assert.equal(
    dune.theaterName,
    'AMC Pacific Place 11 · SIFF Cinema Uptown',
  );
  assert.equal(dune.dateLabel, 'Sep 6');

  const sinners = presentation.films.find((f) => f.filmKey === 'sinners');
  assert.equal(sinners.theaters.length, 3);
  assert.equal(
    sinners.theaterName,
    'Cinerama · The Beacon · +1 more',
  );
  assert.equal(
    formatCompactTheaterLine(sinners.theaters.map((t) => t.name)),
    sinners.theaterName,
  );
});

test('default sort is soonest qualifying presentation', () => {
  assert.equal(SPECIAL_PRESENTATIONS_SORT_OPTIONS[0].id, 'soonest-presentation');
  assert.match(SP_SRC, /useState\('soonest-presentation'\)/);

  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  const sorted = sortSpecialPresentationFilms(
    presentation.films,
    'soonest-presentation',
  );
  assert.equal(sorted[0].filmKey, 'dune');
  assert.equal(sorted[0].earliestLocalDate, '2026-09-06');
  assert.ok(
    sorted[0].earliestSortableLocalDateTime <=
      sorted[1].earliestSortableLocalDateTime,
  );
});

test('presentation type filter works on canonical ids', () => {
  const presentation = buildLiveSpecialPresentationsPresentation(
    homeWithSpecials(),
  );
  const filtered = filterSpecialPresentationFilms(presentation.films, {
    presentationCanonicalId: '70mm',
  });
  assert.ok(filtered.every((f) => f.presentationCanonicalIds.includes('70mm')));
  assert.equal(
    filtered.some((f) => f.filmKey === 'dune'),
    false,
  );
});

test('film clickthrough opens Film Detail and restores', () => {
  assert.match(SP_SRC, /onOpenFilmDetail/);
  assert.match(CARD_SRC, /More details/);
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'home');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.specialPresentations,
    originPrimary: 'home',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'dune',
    opportunityKey: null,
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(
    nav.surface?.returnSurface?.collectionId,
    'special-presentations',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.collectionId, 'special-presentations');
});

test('other shelf-detail surfaces remain independent; no duplicate shell', () => {
  assert.match(OPENING_SRC, /HomeShelfDetailSurface/);
  assert.match(LEAVING_SRC, /HomeShelfDetailSurface/);
  assert.match(JA_SRC, /HomeShelfDetailSurface/);
  assert.equal(OPENING_SRC.includes('SpecialPresentationsSurface'), false);
  assert.equal(LEAVING_SRC.includes('SpecialPresentationsSurface'), false);
  assert.equal(JA_SRC.includes('SpecialPresentationsSurface'), false);
  assert.equal(SP_SRC.includes('<section className="v2-opening-page"'), false);
  assert.equal(SP_SRC.includes('<section className="v2-shelf-detail-page"'), false);
  assert.match(
    SP_SRC,
    /from '\.\.\/homeShelfDetail\/HomeShelfDetailSurface\.jsx'/,
  );
});
