import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearches,
  normalizeRecentSearches,
  removeRecentSearch,
  saveRecentSearches,
} from '../../v2/explore/recentSearchesStore.js';
import {
  dismissFilm,
  loadDismissedFilmKeys,
  normalizeDismissedFilmKeys,
  saveDismissedFilmKeys,
  undismissFilm,
} from '../../v2/explore/dismissedFilmsStore.js';
import {
  loadSeenFilmKeys,
  markFilmSeen,
  normalizeSeenFilmKeys,
  saveSeenFilmKeys,
  unmarkFilmSeen,
} from '../../v2/explore/seenFilmsStore.js';
import {
  addIsoDays,
  allPlayingFilms,
  buildExploreCollection,
  filmsForKeys,
  filmsOnDate,
  filmsWithFormatTags,
  formatCompactDateRange,
  isoWeekday,
  normalizeSearchQuery,
  pacificDateString,
  resolveWeekendRange,
  searchExplore,
} from '../../v2/explore/exploreCatalog.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import { QUICK_START } from '../../v2/explore/exploreQuickStart.js';
import { SHOWTIMES_BROWSE_QUICK_START_ID } from '../../v2/showtimes/showtimesBrowseModel.js';
import { BROWSE_ROWS } from '../../v2/explore/exploreBrowseBy.js';
import { buildSuggestedStarts } from '../../v2/explore/exploreSuggestedStarts.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  PRIMARY_DESTINATIONS,
  REJECTED_PRIMARY_NAV_LABELS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleHome() {
  const today = pacificDateString();
  const tomorrow = addIsoDays(today, 1);
  return {
    films: [
      {
        filmKey: 'alpha',
        title: 'Alpha Night',
        posterUrl: 'https://example.com/a.jpg',
        runtimeMin: 100,
        showtimeCount: 2,
        theaterCount: 1,
      },
      {
        filmKey: 'beta',
        title: 'Beta Dawn',
        posterUrl: null,
        runtimeMin: 90,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'alpha',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: today,
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: today + 'T19:00',
        formatLabels: ['imax-at-amc'],
      },
      {
        opportunityKey: 'o2',
        filmKey: 'beta',
        theaterId: 't2',
        theaterName: 'Central Cinema',
        localDate: tomorrow,
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: tomorrow + 'T20:00',
        formatLabels: ['70mm'],
      },
    ],
    theatersById: {
      t1: {
        id: 't1',
        name: 'SIFF Uptown',
        city: 'Seattle',
        neighborhood: 'Queen Anne',
        opportunityCount: 1,
      },
      t2: {
        id: 't2',
        name: 'Central Cinema',
        city: 'Seattle',
        neighborhood: 'Central District',
        opportunityCount: 1,
      },
    },
  };
}

test('Explore remains a primary destination; Theaters and Saved are not', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.label),
    ['Home', 'Explore', 'Planner', 'Profile'],
  );
  assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes('Theaters'));
  assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes('Me'));
  assert.ok(REJECTED_PRIMARY_NAV_LABELS.includes('Saved'));
});

test('Explore landing source section order and Hidden preview absence', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const source = readFileSync(
    join(root, 'v2/explore/ExploreDestination.jsx'),
    'utf8',
  );
  const quick = source.indexOf('<ExploreQuickStart');
  const browse = source.indexOf('<ExploreBrowseBy');
  const activity = source.indexOf('<ExploreFilmActivity');
  const recent = source.indexOf('<ExploreRecentSearches');
  assert.ok(quick > 0 && browse > quick);
  assert.ok(activity > browse);
  assert.ok(recent > activity);
  assert.equal(source.includes('ExploreSuggestedStarts'), false);
  assert.equal(source.includes('ExploreHiddenPreview'), false);
  assert.equal(source.includes('Everything Everywhere All at Once'), false);
  assert.equal(source.includes('Young Washington'), false);
  assert.equal(source.includes('The Odyssey'), false);
});

test('Film Activity copy and cards avoid device-only / gradient treatments', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const activitySrc = readFileSync(
    join(root, 'v2/explore/ExploreFilmActivity.jsx'),
    'utf8',
  );
  const css = readFileSync(join(root, 'v2/v2.css'), 'utf8');
  assert.match(
    activitySrc,
    /Seen films can still appear for special opportunities\. With an account,\s*activity can sync across devices\./,
  );
  assert.equal(activitySrc.includes('Activity stays on this device'), false);
  assert.match(css, /\.v2-activity-card-seen\s*\{[^}]*background:\s*var\(--v2-bg-raised\)/s);
  assert.match(css, /\.v2-activity-card-hidden\s*\{[^}]*background:\s*var\(--v2-bg-raised\)/s);
  assert.equal(
    /\.v2-activity-card-seen\s*\{[^}]*linear-gradient/s.test(css),
    false,
  );
  assert.equal(
    /\.v2-activity-card-hidden\s*\{[^}]*linear-gradient/s.test(css),
    false,
  );
});

test('Suggested Starts helper still builds date scopes for catalog/deep links', () => {
  const items = buildSuggestedStarts();
  assert.deepEqual(
    items.map((item) => item.title),
    ['Everything', 'Today', 'This Week', 'Weekend'],
  );
  assert.deepEqual(
    items.map((item) => item.id),
    [
      COLLECTION_IDS.allMovies,
      COLLECTION_IDS.today,
      COLLECTION_IDS.thisWeek,
      COLLECTION_IDS.weekend,
    ],
  );
});

test('Today uses Pacific date; This Week is rolling 7 days; Weekend is Fri-Sun', () => {
  const today = pacificDateString();
  const week = buildExploreCollection(sampleHome(), COLLECTION_IDS.thisWeek);
  assert.match(week.reason, /rolling 7-day/i);
  assert.equal(week.films.length >= 1, true);

  const wed = '2026-07-22';
  assert.equal(isoWeekday(wed), 3);
  assert.deepEqual(resolveWeekendRange(wed), {
    start: '2026-07-24',
    end: '2026-07-26',
  });
  assert.deepEqual(resolveWeekendRange('2026-07-25'), {
    start: '2026-07-24',
    end: '2026-07-26',
  });
  const weekend = buildExploreCollection(sampleHome(), COLLECTION_IDS.weekend);
  assert.equal(weekend.status, 'ready');
  assert.match(weekend.reason, /Friday/);
  assert.match(formatCompactDateRange(today, addIsoDays(today, 6)), /–/);
  assert.equal(filmsOnDate(sampleHome(), today)[0]?.filmKey, 'alpha');
});

test('empty search query does not produce navigation payload', () => {
  assert.equal(normalizeSearchQuery('   '), '');
  const result = searchExplore(sampleHome(), '  ');
  assert.equal(result.query, '');
  assert.equal(result.films.length, 0);
});

test('search matches titles and theaters, not people', () => {
  const byTitle = searchExplore(sampleHome(), 'Alpha');
  assert.equal(byTitle.films.length, 1);
  assert.equal(byTitle.films[0].filmKey, 'alpha');
  assert.equal(byTitle.personSearchSupported, false);
});

test('recent searches still dedupe, order, remove, and clear', () => {
  let list = [];
  list = addRecentSearch('IMAX', list);
  list = addRecentSearch('Alpha', list);
  list = addRecentSearch('imax', list);
  assert.deepEqual(list, ['imax', 'Alpha']);
  list = removeRecentSearch('Alpha', list);
  assert.deepEqual(list, ['imax']);
  const storage = memoryStorage();
  saveRecentSearches(storage, list);
  assert.deepEqual(loadRecentSearches(storage), ['imax']);
  clearRecentSearches(storage);
  assert.deepEqual(loadRecentSearches(storage), []);
});

test('corrupt recent-search storage fails safely', () => {
  const storage = memoryStorage({
    'reel-seattle.v2.recentSearches': '{not-json',
  });
  assert.deepEqual(loadRecentSearches(storage), []);
  assert.deepEqual(normalizeRecentSearches({ nope: true }), []);
});

test('Seen count reflects local store or zero; stale keys fail gracefully', () => {
  assert.deepEqual(normalizeSeenFilmKeys([]), []);
  let keys = markFilmSeen('alpha', []);
  keys = markFilmSeen('missing', keys);
  assert.deepEqual(keys, ['missing', 'alpha']);
  const films = filmsForKeys(sampleHome(), keys);
  assert.equal(films.length, 1);
  assert.equal(films[0].title, 'Alpha Night');
  keys = unmarkFilmSeen('alpha', keys);
  assert.deepEqual(keys, ['missing']);
  const storage = memoryStorage();
  saveSeenFilmKeys(storage, ['alpha']);
  assert.deepEqual(loadSeenFilmKeys(storage), ['alpha']);
  const seen = buildExploreCollection(sampleHome(), COLLECTION_IDS.seen, {
    seenKeys: [],
  });
  assert.equal(seen.films.length, 0);
  assert.match(seen.reason, /No films marked Seen/i);
});

test('Not interested count reflects dismissed-film store', () => {
  let keys = dismissFilm('alpha', []);
  assert.deepEqual(keys, ['alpha']);
  keys = undismissFilm('alpha', keys);
  assert.deepEqual(keys, []);
  assert.deepEqual(normalizeDismissedFilmKeys(['alpha', 'alpha', 3]), ['alpha']);
  const populated = buildExploreCollection(sampleHome(), COLLECTION_IDS.hidden, {
    dismissedKeys: ['alpha'],
  });
  assert.equal(populated.films.length, 1);
  assert.equal(populated.films[0].title, 'Alpha Night');
  const empty = buildExploreCollection(sampleHome(), COLLECTION_IDS.hidden, {
    dismissedKeys: [],
  });
  assert.equal(empty.films.length, 0);
  const storage = memoryStorage();
  saveDismissedFilmKeys(storage, dismissFilm('beta', []));
  assert.deepEqual(loadDismissedFilmKeys(storage), ['beta']);
});

test('Film Activity and Not interested scaffolds keep Explore active', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, { collectionId: COLLECTION_IDS.filmActivity });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.filmActivity);
  nav = openCollection(nav, { collectionId: COLLECTION_IDS.hidden });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  const back = navigateBack(nav);
  assert.equal(back.surface, null);
  assert.equal(back.primaryDestinationId, 'explore');
});

test('All Movies / IMAX / 35mm honesty unchanged', () => {
  assert.equal(allPlayingFilms(sampleHome()).length, 2);
  const imax = buildExploreCollection(sampleHome(), COLLECTION_IDS.imax);
  assert.equal(imax.films[0].filmKey, 'alpha');
  const mm = buildExploreCollection(sampleHome(), COLLECTION_IDS.thirtyFiveMm);
  assert.equal(mm.status, 'unavailable');
  assert.equal(filmsWithFormatTags(sampleHome(), ['35mm']).length, 0);
});

test('Quick Start and Browse By ids remain Explore surfaces', () => {
  for (const item of QUICK_START) {
    if (item.id === SHOWTIMES_BROWSE_QUICK_START_ID) continue;
    assert.ok(Object.values(COLLECTION_IDS).includes(item.id));
  }
  for (const row of BROWSE_ROWS) {
    assert.ok(Object.values(COLLECTION_IDS).includes(row.id));
  }
  assert.ok(
    QUICK_START.some((item) => item.id === SHOWTIMES_BROWSE_QUICK_START_ID),
  );
});

test('Film Detail from Explore collection keeps Explore active', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, { collectionId: COLLECTION_IDS.weekend });
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: 'o1',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  const back = navigateBack(nav);
  assert.equal(back.surface?.collectionId, COLLECTION_IDS.weekend);
});
