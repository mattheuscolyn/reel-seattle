import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import { formatShelfDetailMonthDay } from '../../v2/homeShelfDetail/formatShelfDetailMonthDay.js';
import { formatCompactTheaterLine } from '../../v2/homeShelfDetail/compactTheaterLine.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const SHELL_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailSurface.jsx'),
  'utf8',
);
const CARD_SRC = readFileSync(
  join(ROOT, 'v2/homeShelfDetail/HomeShelfDetailFilmCard.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
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
const SP_SRC = readFileSync(
  join(ROOT, 'v2/specialPresentations/SpecialPresentationsSurface.jsx'),
  'utf8',
);

const SHELF_SURFACES = [
  {
    id: COLLECTION_IDS.openingThisWeek,
    name: 'Opening This Week',
    src: OPENING_SRC,
    appFlag: 'isOpeningThisWeek',
    surface: 'OpeningThisWeekSurface',
  },
  {
    id: COLLECTION_IDS.leavingSoon,
    name: 'Leaving Soon',
    src: LEAVING_SRC,
    appFlag: 'isLeavingSoon',
    surface: 'LeavingSoonSurface',
  },
  {
    id: COLLECTION_IDS.justAnnounced,
    name: 'Just Announced',
    src: JA_SRC,
    appFlag: 'isJustAnnounced',
    surface: 'JustAnnouncedSurface',
  },
  {
    id: COLLECTION_IDS.specialPresentations,
    name: 'Special Presentations',
    src: SP_SRC,
    appFlag: 'isSpecialPresentations',
    surface: 'SpecialPresentationsSurface',
  },
];

test('all four Home See all actions route to dedicated destinations', () => {
  assert.match(HOME_SRC, /COLLECTION_IDS\.openingThisWeek/);
  assert.match(HOME_SRC, /COLLECTION_IDS\.leavingSoon/);
  assert.match(HOME_SRC, /COLLECTION_IDS\.justAnnounced/);
  assert.match(HOME_SRC, /COLLECTION_IDS\.specialPresentations/);
  assert.equal(HOME_SRC.includes('onSeeAll={() => {}}'), false);
  assert.equal(HOME_SRC.includes('See all is visual-only'), false);

  for (const shelf of SHELF_SURFACES) {
    let nav = createInitialNavState();
    nav = selectPrimaryDestination(nav, 'home');
    nav = openCollection(nav, {
      collectionId: shelf.id,
      originPrimary: 'home',
    });
    assert.equal(nav.surface?.collectionId, shelf.id);
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
  }
});

test('all four destinations use shared shell + card + scroll lock', () => {
  for (const shelf of SHELF_SURFACES) {
    assert.match(APP_SRC, new RegExp(shelf.surface));
    assert.match(APP_SRC, new RegExp(shelf.appFlag));
    assert.match(shelf.src, /HomeShelfDetailSurface/);
    assert.match(shelf.src, /HomeShelfDetailFilmCard/);
    assert.match(shelf.src, /useBodyScrollLock/);
    assert.equal(shelf.src.includes('className="v2-shelf-detail-page"'), false);
    assert.equal(shelf.src.includes('className="v2-opening-page"'), false);
  }
  assert.match(SHELL_SRC, /className="v2-shelf-detail-page"/);
  assert.match(CARD_SRC, /v2-shelf-detail-card/);
});

test('shared CSS uses neutral shelf-detail names; obsolete opening-card gone', () => {
  assert.match(CSS, /\.v2-shelf-detail-page\b/);
  assert.match(CSS, /\.v2-shelf-detail-card\b/);
  assert.match(CSS, /\.v2-shelf-detail-page-sort\b/);
  assert.equal(/\b\.v2-opening-card\b/.test(CSS), false);
  assert.equal(/\b\.v2-opening-page\b/.test(CSS), false);
  assert.equal(CARD_SRC.includes('v2-opening-card'), false);
  assert.equal(SHELL_SRC.includes('v2-opening-page'), false);
});

test('card hierarchy collapses missing meta and places synopsis after shelf facts', () => {
  const synopsisAt = CARD_SRC.indexOf('film.synopsis');
  const theaterAt = CARD_SRC.indexOf('film.theaterName');
  const dateAt = CARD_SRC.indexOf('film.dateLabel');
  const formatAt = CARD_SRC.indexOf('film.formatLabel');
  assert.ok(dateAt > 0 && theaterAt > 0 && synopsisAt > 0);
  assert.ok(dateAt < synopsisAt);
  assert.ok(theaterAt < synopsisAt);
  assert.ok(formatAt < synopsisAt);
  assert.match(CARD_SRC, /hasShowingMeta/);
  assert.match(CARD_SRC, /noCurrentShowtimes/);
});

test('month/day formatting and theater aggregation stay shared', () => {
  assert.equal(formatShelfDetailMonthDay('2026-09-14'), 'Sep 14');
  assert.equal(formatShelfDetailMonthDay(null), null);
  assert.equal(
    formatCompactTheaterLine(['SIFF', 'The Beacon', 'AMC', 'Central']),
    'SIFF · The Beacon · +2 more',
  );
  assert.match(
    readFileSync(
      join(ROOT, 'v2/leaving/buildLiveLeavingSoonPresentation.js'),
      'utf8',
    ),
    /formatShelfDetailMonthDay/,
  );
  assert.match(
    readFileSync(
      join(ROOT, 'v2/justAnnounced/resolveJustAnnouncedOpeningDate.js'),
      'utf8',
    ),
    /formatShelfDetailMonthDay/,
  );
  assert.match(
    readFileSync(
      join(
        ROOT,
        'v2/specialPresentations/buildLiveSpecialPresentationsPresentation.js',
      ),
      'utf8',
    ),
    /formatShelfDetailMonthDay/,
  );
});

test('OTW/Leaving/JA omit generic a11y chips; SP may show qualifying OC/AD', () => {
  assert.match(OPENING_SRC, /HomeShelfDetailFilmCard/);
  assert.equal(OPENING_SRC.includes('Closed Captions'), false);
  assert.equal(LEAVING_SRC.includes('Closed Captions'), false);
  assert.equal(JA_SRC.includes('Closed Captions'), false);
  assert.match(
    readFileSync(
      join(ROOT, 'v2/opening/buildLiveOpeningPresentation.js'),
      'utf8',
    ),
    /isOpeningScreeningLevelFormatLabel/,
  );
  assert.match(
    readFileSync(
      join(
        ROOT,
        'v2/specialPresentations/buildLiveSpecialPresentationsPresentation.js',
      ),
      'utf8',
    ),
    /Open Captions|specialPresentationBrowseLabel/,
  );
});

test('shelf-specific control semantics remain distinct', () => {
  assert.match(OPENING_SRC, /useState\('opening-date'\)/);
  assert.match(OPENING_SRC, /categoryChips/);
  assert.match(LEAVING_SRC, /useState\('leaving-soonest'\)/);
  assert.equal(LEAVING_SRC.includes('categoryChips={null}'), true);
  assert.match(JA_SRC, /useState\('recently-announced'\)/);
  assert.equal(JA_SRC.includes('IconSliders'), false);
  assert.match(SP_SRC, /useState\('soonest-presentation'\)/);
  assert.match(SP_SRC, /presentationCanonicalId/);
});
