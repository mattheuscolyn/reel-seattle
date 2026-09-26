import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BROWSE_ROWS,
  BROWSE_SHOWTIMES_ID,
} from '../../v2/explore/exploreBrowseBy.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  browseUiForQuickStart,
  buildQuickStartItems,
  DEFAULT_QUICK_START,
  pickDiverseQuickStartItems,
  QUICK_START_ALL_SHOWTIMES_ID,
  QUICK_START_TODAY_ID,
  rankQuickStartCandidates,
  resolveQuickStartCandidate,
} from '../../v2/explore/exploreQuickStart.js';
import {
  browseDestinationId,
  loadQuickStartHistory,
  normalizeQuickStartHistory,
  QUICK_START_HISTORY_MAX_EVENTS,
  QUICK_START_HISTORY_STORAGE_KEY,
  recordQuickStartVisit,
  showtimesDestinationId,
  theaterDestinationId,
} from '../../v2/explore/quickStartHistoryStore.js';
import {
  createInitialNavState,
  navigateBack,
  openShowtimesBrowse,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPLORE_SRC = readFileSync(
  join(ROOT, 'v2/explore/ExploreDestination.jsx'),
  'utf8',
);
const QUICK_SRC = readFileSync(
  join(ROOT, 'v2/explore/ExploreQuickStart.jsx'),
  'utf8',
);
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/explore/ExploreBrowseBy.jsx'),
  'utf8',
);

const NOW = new Date('2026-09-25T18:00:00-07:00');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v));
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

function daysAgo(days) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

test('Showtimes appears under Browse By above Movies and is not duplicated', () => {
  assert.equal(BROWSE_ROWS[0].id, BROWSE_SHOWTIMES_ID);
  assert.equal(BROWSE_ROWS[0].label, 'Showtimes');
  assert.equal(BROWSE_ROWS[1].id, COLLECTION_IDS.allMovies);
  assert.equal(BROWSE_ROWS[1].label, 'Movies');
  assert.equal(
    BROWSE_ROWS.filter((row) => row.label === 'Showtimes').length,
    1,
  );
  assert.match(BROWSE_SRC, /data-browse-by=\{row\.id\}/);
  assert.match(EXPLORE_SRC, /isBrowseShowtimesId/);
  assert.match(EXPLORE_SRC, /buildQuickStartItems/);
  assert.equal(QUICK_SRC.includes('Showtimes'), false);
});

test('new user / no history gets deterministic defaults', () => {
  const items = buildQuickStartItems({ storage: memoryStorage(), now: NOW });
  assert.deepEqual(
    items.map((i) => i.id),
    DEFAULT_QUICK_START.map((i) => i.id),
  );
});

test('repeat and recent visits influence Quick Start ranking', () => {
  const history = {
    version: 1,
    events: [
      {
        destinationId: theaterDestinationId('amc-pacific-place'),
        kind: 'theater',
        label: 'AMC Pacific Place',
        at: daysAgo(1),
      },
      {
        destinationId: theaterDestinationId('amc-pacific-place'),
        kind: 'theater',
        label: 'AMC Pacific Place',
        at: daysAgo(2),
      },
      {
        destinationId: theaterDestinationId('amc-pacific-place'),
        kind: 'theater',
        label: 'AMC Pacific Place',
        at: daysAgo(3),
      },
      {
        destinationId: browseDestinationId(COLLECTION_IDS.formats),
        kind: 'browse',
        label: 'Formats & Experiences',
        at: daysAgo(1),
      },
      {
        destinationId: browseDestinationId(COLLECTION_IDS.formats),
        kind: 'browse',
        label: 'Formats & Experiences',
        at: daysAgo(2),
      },
      {
        destinationId: showtimesDestinationId(QUICK_START_TODAY_ID),
        kind: 'showtimes',
        label: 'Today',
        at: daysAgo(10),
      },
      {
        destinationId: showtimesDestinationId(QUICK_START_TODAY_ID),
        kind: 'showtimes',
        label: 'Today',
        at: daysAgo(11),
      },
    ],
  };
  const homeData = {
    theatersById: {
      'amc-pacific-place': { id: 'amc-pacific-place', name: 'AMC Pacific Place' },
    },
  };
  const items = buildQuickStartItems({ history, homeData, now: NOW });
  assert.equal(items[0].kind, 'theater');
  assert.equal(items[0].action.theaterId, 'amc-pacific-place');
  assert.ok(items.some((item) => item.kind === 'browse'));
  assert.equal(items.length, 3);
});

test('soft diversity does not let a weak kind displace a much stronger candidate', () => {
  const ranked = [
    {
      item: resolveQuickStartCandidate('theater:a', {
        theatersById: { a: { name: 'Theater A' } },
      }),
      score: 10,
      lastAt: 3,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate('theater:b', {
        theatersById: { b: { name: 'Theater B' } },
      }),
      score: 9,
      lastAt: 2,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate('format:imax'),
      score: 2,
      lastAt: 1,
      kind: 'format',
    },
  ].filter((row) => row.item);

  const limited = pickDiverseQuickStartItems(ranked, 2);
  assert.deepEqual(
    limited.map((item) => item.id),
    ['theater:a', 'theater:b'],
  );

  const full = pickDiverseQuickStartItems(ranked, 3);
  assert.deepEqual(
    full.map((item) => item.id),
    ['theater:a', 'theater:b', 'format:imax'],
  );
});

test('soft diversity prefers a near-score different kind over a third same-kind', () => {
  const ranked = [
    {
      item: resolveQuickStartCandidate('theater:a', {
        theatersById: { a: { name: 'Theater A' } },
      }),
      score: 10,
      lastAt: 3,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate('theater:b', {
        theatersById: { b: { name: 'Theater B' } },
      }),
      score: 9,
      lastAt: 2,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate('format:imax'),
      score: 8,
      lastAt: 1,
      kind: 'format',
    },
  ].filter((row) => row.item);

  const picked = pickDiverseQuickStartItems(ranked, 2);
  assert.equal(picked[0].id, 'theater:a');
  assert.equal(picked[1].kind, 'format');
});

test('generic Browse By hubs need more signal than specific destinations', () => {
  const history = {
    version: 1,
    events: [
      {
        destinationId: browseDestinationId(COLLECTION_IDS.theaters),
        kind: 'browse',
        label: 'Theaters',
        at: daysAgo(1),
      },
      {
        destinationId: theaterDestinationId('amc-pacific-place'),
        kind: 'theater',
        label: 'AMC Pacific Place',
        at: daysAgo(1),
      },
    ],
  };
  const homeData = {
    theatersById: {
      'amc-pacific-place': { id: 'amc-pacific-place', name: 'AMC Pacific Place' },
    },
  };
  const ranked = rankQuickStartCandidates(history, { now: NOW, homeData });
  assert.equal(
    ranked.some((row) => row.item.id === browseDestinationId(COLLECTION_IDS.theaters) || row.item.id === COLLECTION_IDS.theaters),
    false,
  );
  assert.equal(ranked[0].item.kind, 'theater');
});

test('different candidate types can appear via soft diversity when scores are near', () => {
  const ranked = [
    {
      item: resolveQuickStartCandidate('theater:a', {
        theatersById: { a: { name: 'A' } },
      }),
      score: 9,
      lastAt: 3,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate('theater:b', {
        theatersById: { b: { name: 'B' } },
      }),
      score: 8,
      lastAt: 2,
      kind: 'theater',
    },
    {
      item: resolveQuickStartCandidate(browseDestinationId(COLLECTION_IDS.collections)),
      score: 7,
      lastAt: 1,
      kind: 'browse',
    },
  ].filter((row) => row.item);
  const picked = pickDiverseQuickStartItems(ranked, 3);
  assert.equal(picked[0].kind, 'theater');
  assert.equal(picked[1].kind, 'browse');
  assert.equal(picked[2].kind, 'theater');
});

test('malformed persisted history falls back safely', () => {
  const storage = memoryStorage({
    [QUICK_START_HISTORY_STORAGE_KEY]: '{not-json',
  });
  assert.deepEqual(loadQuickStartHistory(storage).events, []);
  assert.deepEqual(normalizeQuickStartHistory({ version: 99, items: [] }).events, []);
  const items = buildQuickStartItems({ storage, now: NOW });
  assert.deepEqual(
    items.map((i) => i.id),
    DEFAULT_QUICK_START.map((i) => i.id),
  );
})

test('storage unavailable does not break Explore Quick Start', () => {
  assert.doesNotThrow(() => {
    const items = buildQuickStartItems({ storage: null, now: NOW });
    assert.equal(items.length, 3);
    recordQuickStartVisit(null, {
      destinationId: browseDestinationId(COLLECTION_IDS.theaters),
      kind: 'browse',
      label: 'Theaters',
    });
  });
});

test('history is capped and debounce avoids rerender double-count', () => {
  const storage = memoryStorage();
  const base = Date.parse(NOW.toISOString());
  for (let i = 0; i < QUICK_START_HISTORY_MAX_EVENTS + 20; i += 1) {
    recordQuickStartVisit(storage, {
      destinationId: `theater:t-${i}`,
      kind: 'theater',
      label: `Theater ${i}`,
      at: base + i * 10_000,
    });
  }
  const store = loadQuickStartHistory(storage);
  assert.equal(store.events.length, QUICK_START_HISTORY_MAX_EVENTS);

  const before = store.events.length;
  recordQuickStartVisit(storage, {
    destinationId: theaterDestinationId('same'),
    kind: 'theater',
    label: 'Same',
    at: base + 1_000_000,
  });
  recordQuickStartVisit(storage, {
    destinationId: theaterDestinationId('same'),
    kind: 'theater',
    label: 'Same',
    at: base + 1_000_500,
  });
  const after = loadQuickStartHistory(storage);
  assert.equal(
    after.events.filter((e) => e.destinationId === 'theater:same').length,
    1,
  );
  assert.equal(after.events.length, before); // replaced within cap, one new unique then debounce
});

test('Quick Start showtimes items navigate via existing browse UI helper', () => {
  const item = DEFAULT_QUICK_START[0];
  const browseUi = browseUiForQuickStart(item.action.quickStartId);
  assert.equal(browseUi.dateMode, 'week');
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openShowtimesBrowse(nav, {
    originPrimary: 'explore',
    exploreRestore: { scrollY: 12 },
    browseUi,
  });
  assert.equal(nav.surface?.type, 'showtimes-browse');
  const back = navigateBack(nav);
  assert.equal(back.surface, null);
  assert.equal(back.primaryDestinationId, 'explore');
});

test('Explore destination wires personalized Quick Start builder and Browse Showtimes', () => {
  assert.match(EXPLORE_SRC, /buildQuickStartItems/);
  assert.match(EXPLORE_SRC, /recordQuickStartVisit/);
  assert.match(EXPLORE_SRC, /handleBrowseBy/);
  assert.match(EXPLORE_SRC, /onOpenTheaterDetail/);
  assert.match(EXPLORE_SRC, /items=\{quickStartItems\}/);
  assert.match(QUICK_SRC, /items = \[\]/);
  assert.equal(QUICK_SRC.includes('Recommended by AI'), false);
  assert.equal(QUICK_SRC.includes('Because you'), false);
});

test('one-off old visits do not displace defaults without qualification', () => {
  const history = {
    version: 1,
    events: [
      {
        destinationId: theaterDestinationId('obscure'),
        kind: 'theater',
        label: 'Obscure',
        at: daysAgo(30),
      },
    ],
  };
  const ranked = rankQuickStartCandidates(history, { now: NOW });
  assert.equal(ranked.length, 0);
  const items = buildQuickStartItems({ history, now: NOW });
  assert.deepEqual(
    items.map((i) => i.id),
    [QUICK_START_ALL_SHOWTIMES_ID, QUICK_START_TODAY_ID, 'this-weekend'],
  );
});
