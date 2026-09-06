import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIST_RESTORE_ATTR,
  captureListPosition,
  hasListRestore,
  normalizeListRestore,
  restoreListPosition,
} from '../../v2/navigation/listPositionRestore.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openShowtimesBrowse,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { createDefaultShowtimesBrowseUi } from '../../v2/showtimes/showtimesBrowseModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BROWSE_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/ShowtimesBrowseSurface.jsx'),
  'utf8',
);

function mockListRoot(keys) {
  const items = keys.map((key) => {
    const calls = [];
    return {
      key,
      calls,
      getAttribute: (attr) => (attr === LIST_RESTORE_ATTR ? key : null),
      scrollIntoView: (opts) => {
        calls.push(opts);
      },
    };
  });
  return {
    items,
    querySelectorAll: (selector) =>
      String(selector).includes(LIST_RESTORE_ATTR) ? items : [],
  };
}

test('list restore prefers a stable item key over pixel scroll', () => {
  const root = mockListRoot(['alpha', 'beta', 'gamma']);
  const scrolled = [];
  const result = restoreListPosition(
    { itemKey: 'gamma', scrollY: 900 },
    {
      root,
      scrollTo: (y) => scrolled.push(y),
    },
  );
  assert.equal(result.restored, true);
  assert.equal(result.method, 'item');
  assert.equal(root.items[2].calls.length, 1);
  assert.equal(scrolled.length, 0);
});

test('list restore falls back to scrollY when the item is missing', () => {
  const root = mockListRoot(['alpha']);
  const scrolled = [];
  const result = restoreListPosition(
    { restoreItemKey: 'missing-film', scrollY: 640 },
    {
      root,
      scrollTo: (y) => scrolled.push(y),
    },
  );
  assert.equal(result.restored, true);
  assert.equal(result.method, 'scroll');
  assert.deepEqual(scrolled, [640]);
  assert.equal(root.items[0].calls.length, 0);
});

test('fresh visits do not restore an unrelated old position', () => {
  assert.equal(hasListRestore(null), false);
  assert.equal(hasListRestore({ itemKey: null, scrollY: 0 }), false);
  assert.equal(hasListRestore(createDefaultShowtimesBrowseUi()), false);
  assert.equal(normalizeListRestore({ scrollY: 0 }), null);

  const root = mockListRoot(['alpha']);
  const scrolled = [];
  const result = restoreListPosition(
    { itemKey: null, scrollY: 0 },
    {
      root,
      scrollTo: (y) => scrolled.push(y),
    },
  );
  assert.equal(result.restored, false);
  assert.equal(result.method, null);
  assert.equal(scrolled.length, 0);
  assert.equal(root.items[0].calls.length, 0);

  const captured = captureListPosition(
    { itemKey: '  ' },
    { window: { scrollY: 0 } },
  );
  assert.equal(captured.itemKey, null);
  assert.equal(captured.scrollY, 0);
  assert.equal(hasListRestore(captured), false);
});

test('Showtimes film detail return restores originating item; fresh browse does not', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openShowtimesBrowse(nav, { originPrimary: 'explore' });
  assert.equal(nav.surface.browseUi, null);

  nav = openFilmDetail(nav, {
    filmKey: 'gamma',
    originPrimary: 'explore',
    returnSurface: {
      type: 'showtimes-browse',
      originPrimary: 'explore',
      browseUi: {
        dateMode: 'week',
        restoreItemKey: 'gamma',
        expandedFilmKey: 'gamma',
        scrollY: 1200,
      },
    },
  });
  const back = navigateBack(nav);
  assert.equal(back.surface?.type, 'showtimes-browse');
  assert.equal(back.surface.browseUi.restoreItemKey, 'gamma');
  assert.equal(back.surface.browseUi.scrollY, 1200);
  assert.equal(hasListRestore(back.surface.browseUi), true);

  const fresh = openShowtimesBrowse(
    selectPrimaryDestination(createInitialNavState(), 'explore'),
    { originPrimary: 'explore' },
  );
  assert.equal(hasListRestore(fresh.surface.browseUi), false);
  assert.equal(hasListRestore(createDefaultShowtimesBrowseUi()), false);
});

test('Showtimes browse surface restores after list content using the shared helper', () => {
  assert.match(BROWSE_SRC, /restoreListPosition/);
  assert.match(BROWSE_SRC, /restoreItemKey/);
  assert.match(BROWSE_SRC, /data-list-restore-key/);
  assert.match(BROWSE_SRC, /loadStatus === 'loading'/);
  assert.equal(BROWSE_SRC.includes("window.scrollTo(0, y)"), false);
});
