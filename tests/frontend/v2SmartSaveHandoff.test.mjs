import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateSmartSaveHandoffMode,
  evaluateSmartSaveHandoff,
  SMART_SAVE_HANDOFF_MODE,
} from '../../v2/save/smartSaveHandoffModel.js';
import {
  clearSmartSaveHandoffDismissal,
  dismissSmartSaveHandoff,
  isSmartSaveHandoffDismissed,
  SMART_SAVE_DISMISSALS_STORAGE_KEY,
} from '../../v2/save/smartSaveHandoffDismissals.js';
import {
  processSmartSaveHandoffAfterToggle,
  subscribeSmartSaveHandoff,
  SMART_SAVE_HANDOFF_MODE as CONTROLLER_MODE,
} from '../../v2/save/smartSaveHandoffController.js';
import { applySaveToggleWithSmartHandoff } from '../../v2/save/applySaveToggleWithSmartHandoff.js';
import { applySaveToggle } from '../../v2/save/saveActionState.js';
import {
  addSavedFilmShowtimeToPlanner,
  listPlannedPerformanceKeys,
} from '../../v2/planner/addSavedFilmShowtimeToPlanner.js';
import {
  getSavedFilms,
  isFilmSaved,
  unsaveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SEARCH = readFileSync(
  join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'),
  'utf8',
);
const SHELF = readFileSync(join(ROOT, 'v2/home/FilmShelf.jsx'), 'utf8');
const HOST = readFileSync(
  join(ROOT, 'v2/save/SmartSaveHandoffHost.jsx'),
  'utf8',
);
const DIRECT = readFileSync(
  join(ROOT, 'v2/save/SmartSaveDirectAddSheet.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

const NOW = new Date('2026-05-10T12:00:00-07:00');

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

function opp(overrides) {
  return {
    opportunityKey: 'opp-1',
    filmKey: 'rare-film',
    theaterId: 'nwff',
    theaterName: 'NWFF',
    localDate: '2026-05-20',
    localTime: '19:00',
    sortableLocalDateTime: '2026-05-20T19:00:00',
    source: 'nwff',
    sourceShowtimeId: 'rare-1',
    runtimeMin: 90,
    ...overrides,
  };
}

function homeWithOpps(opportunities) {
  return {
    films: [
      {
        filmKey: 'rare-film',
        filmId: 'tmdb:999',
        title: 'Rare Film',
        posterUrl: 'https://example.test/rare.jpg',
        runtimeMin: 90,
        year: 2024,
      },
    ],
    opportunities,
  };
}

function filmRef() {
  return filmRefFromHomeFilm({
    filmKey: 'rare-film',
    filmId: 'tmdb:999',
    title: 'Rare Film',
  });
}

function nFuture(count, { includePast = false, includeDup = false } = {}) {
  /** @type {object[]} */
  const list = [];
  if (includePast) {
    list.push(
      opp({
        opportunityKey: 'opp-past',
        localDate: '2026-05-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-05-01T19:00:00',
        sourceShowtimeId: 'past-1',
      }),
    );
  }
  for (let i = 0; i < count; i += 1) {
    const day = 20 + i;
    const date = `2026-05-${String(day).padStart(2, '0')}`;
    list.push(
      opp({
        opportunityKey: `opp-${i + 1}`,
        localDate: date,
        localTime: '19:00',
        sortableLocalDateTime: `${date}T19:00:00`,
        sourceShowtimeId: `rare-${i + 1}`,
      }),
    );
  }
  if (includeDup && count > 0) {
    const first = list.find((o) => o.opportunityKey === 'opp-1');
    list.push({
      ...first,
      opportunityKey: 'opp-1-dup',
    });
  }
  return list;
}

test('threshold helper: 0 / 1 / 2 / 3 / 4+ modes', () => {
  assert.equal(evaluateSmartSaveHandoffMode([]).mode, SMART_SAVE_HANDOFF_MODE.none);
  assert.equal(
    evaluateSmartSaveHandoffMode([opp({})]).mode,
    SMART_SAVE_HANDOFF_MODE.directAdd,
  );
  assert.equal(
    evaluateSmartSaveHandoffMode(nFuture(2)).mode,
    SMART_SAVE_HANDOFF_MODE.chooseShowtime,
  );
  assert.equal(
    evaluateSmartSaveHandoffMode(nFuture(3)).mode,
    SMART_SAVE_HANDOFF_MODE.chooseShowtime,
  );
  assert.equal(
    evaluateSmartSaveHandoffMode(nFuture(4)).mode,
    SMART_SAVE_HANDOFF_MODE.none,
  );
});

test('save with 0 upcoming screenings → no prompt', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps([]);
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData,
    now: NOW,
    emit: undefined,
  });
  assert.equal(result.ok, true);
  assert.equal(result.becameSaved, true);
  assert.equal(result.isSaved, true);
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.none);
});

test('save with 1 upcoming screening → direct-add offer', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.equal(result.handoff.opportunities.length, 1);
  assert.equal(result.handoff.opportunity.opportunityKey, 'opp-1');
  assert.ok(result.handoff.rowLabel);
  assert.match(DIRECT, /Only one upcoming screening/);
  assert.match(DIRECT, /Add to Planner\?/);
  assert.match(DIRECT, /className="v2-ssh-title"/);
  assert.equal(DIRECT.includes('>Smart Save<'), false);
});

test('accepting the 1-screening offer adds the exact performance', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData,
    now: NOW,
  });
  const add = addSavedFilmShowtimeToPlanner(
    storage,
    result.handoff.opportunity,
    result.handoff.filmKey,
    { homeData },
  );
  assert.equal(add.ok, true);
  assert.equal(add.status === 'already_planned', false);
  assert.equal(listPlannedPerformanceKeys(storage).size, 1);
});

test('save with 2 screenings → choose-showtime', () => {
  const storage = memoryStorage();
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData: homeWithOpps(nFuture(2)),
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.chooseShowtime);
  assert.equal(result.handoff.opportunities.length, 2);
});

test('save with 3 screenings → choose-showtime', () => {
  const storage = memoryStorage();
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData: homeWithOpps(nFuture(3)),
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.chooseShowtime);
  assert.equal(result.handoff.opportunities.length, 3);
});

test('save with 4 screenings → no prompt', () => {
  const storage = memoryStorage();
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData: homeWithOpps(nFuture(4)),
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.none);
  assert.equal(result.handoff.reason, 'too_many_showtimes');
});

test('duplicates do not inflate the screening count', () => {
  const storage = memoryStorage();
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData: homeWithOpps(nFuture(1, { includeDup: true })),
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.equal(result.handoff.opportunities.length, 1);
});

test('past screenings do not inflate the screening count', () => {
  const storage = memoryStorage();
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData: homeWithOpps(nFuture(1, { includePast: true })),
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.equal(result.handoff.opportunities.length, 1);
  assert.equal(result.handoff.opportunity.opportunityKey, 'opp-1');
});

test('already-saved film does not trigger the prompt (no not-saved→saved)', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const ref = filmRef();
  const first = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(first.becameSaved, true);
  assert.equal(first.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.equal(isFilmSaved(storage, ref), true);

  const emitted = [];
  const unsub = subscribeSmartSaveHandoff((payload) => emitted.push(payload));
  const evalOnly = processSmartSaveHandoffAfterToggle({
    storage,
    filmRef: ref,
    becameSaved: false,
    becameUnsaved: false,
    homeData,
    now: NOW,
    emit: true,
  });
  unsub();
  assert.equal(evalOnly.mode, SMART_SAVE_HANDOFF_MODE.none);
  assert.equal(evalOnly.reason, 'not_transition');
  assert.equal(emitted.length, 0);
});

test('dismissing the prompt suppresses repeats while the film remains saved', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const ref = filmRef();
  const first = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(first.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);

  dismissSmartSaveHandoff(storage, ref);
  assert.equal(isSmartSaveHandoffDismissed(storage, ref), true);

  // Simulate another evaluation while still saved (would only happen if
  // something re-emitted; process with becameSaved must still respect dismiss).
  const suppressed = processSmartSaveHandoffAfterToggle({
    storage,
    filmRef: ref,
    becameSaved: true,
    homeData,
    now: NOW,
    emit: false,
  });
  assert.equal(suppressed.mode, SMART_SAVE_HANDOFF_MODE.none);
  assert.equal(suppressed.reason, 'dismissed');
  assert.ok(storage.getItem(SMART_SAVE_DISMISSALS_STORAGE_KEY));
});

test('unsave → resave resets eligibility after dismissal', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const ref = filmRef();

  applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  dismissSmartSaveHandoff(storage, ref);

  const unsaved = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(unsaved.becameUnsaved, true);
  assert.equal(isSmartSaveHandoffDismissed(storage, ref), false);

  const resaved = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(resaved.becameSaved, true);
  assert.equal(resaved.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
});

test('existing Planner duplicate protection still works for direct-add path', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(1));
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: filmRef(),
    persist: true,
    homeData,
    now: NOW,
  });
  const first = addSavedFilmShowtimeToPlanner(
    storage,
    result.handoff.opportunity,
    result.handoff.filmKey,
    { homeData },
  );
  const second = addSavedFilmShowtimeToPlanner(
    storage,
    result.handoff.opportunity,
    result.handoff.filmKey,
    { homeData },
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.status, 'already_planned');
  assert.equal(listPlannedPerformanceKeys(storage).size, 1);
});

test('2–3 screening path reuses SavedFilmChooseShowtimeSheet', () => {
  assert.match(HOST, /SavedFilmChooseShowtimeSheet/);
  assert.match(HOST, /SMART_SAVE_HANDOFF_MODE\.chooseShowtime/);
  assert.match(HOST, /SmartSaveDirectAddSheet/);
  assert.equal(HOST.includes('confirm('), false);
});

test('centralized Save integration points wire Smart Save handoff', () => {
  assert.match(APP, /applySaveToggleWithSmartHandoff/);
  assert.match(APP, /SmartSaveHandoffHost/);
  assert.match(SEARCH, /applySaveToggleWithSmartHandoff/);
  assert.match(SHELF, /applySaveToggleWithSmartHandoff/);
  assert.match(CSS, /\.v2-ssh-sheet\b/);
  assert.equal(CONTROLLER_MODE.directAdd, 'direct-add');
});

test('eligible performances exclude showtimes already in Planner', () => {
  const storage = memoryStorage();
  const homeData = homeWithOpps(nFuture(2));
  const ref = filmRef();
  // Pre-plan one of two showtimes → remaining eligible count is 1 → direct-add.
  addSavedFilmShowtimeToPlanner(storage, homeData.opportunities[0], 'rare-film', {
    homeData,
  });
  const result = applySaveToggleWithSmartHandoff({
    storage,
    filmRef: ref,
    persist: true,
    homeData,
    now: NOW,
  });
  assert.equal(result.handoff.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.equal(result.handoff.opportunities.length, 1);
  assert.equal(result.handoff.opportunity.opportunityKey, 'opp-2');
});

test('plain applySaveToggle without handoff still saves (save succeeds independently)', () => {
  const storage = memoryStorage();
  const ref = filmRef();
  const result = applySaveToggle({ storage, filmRef: ref, persist: true });
  assert.equal(result.ok, true);
  assert.equal(isFilmSaved(storage, ref), true);
  assert.equal(getSavedFilms(storage).length, 1);
  unsaveFilm(storage, ref);
  clearSmartSaveHandoffDismissal(storage, ref);
});

test('evaluateSmartSaveHandoff exposes row label for direct-add', () => {
  const evaluation = evaluateSmartSaveHandoff({
    homeData: homeWithOpps(nFuture(1)),
    filmRef: filmRef(),
    storage: memoryStorage(),
    timeFormatId: '12h',
    now: NOW,
  });
  assert.equal(evaluation.mode, SMART_SAVE_HANDOFF_MODE.directAdd);
  assert.match(evaluation.rowLabel, /NWFF|May|7:00/i);
});

test('corrupt dismissal localStorage fails safely', () => {
  const storage = memoryStorage({
    [SMART_SAVE_DISMISSALS_STORAGE_KEY]: '{not-json',
  });
  assert.equal(isSmartSaveHandoffDismissed(storage, filmRef()), false);
  const written = dismissSmartSaveHandoff(storage, filmRef());
  assert.equal(written.ok, true);
  assert.equal(isSmartSaveHandoffDismissed(storage, filmRef()), true);

  storage.setItem(SMART_SAVE_DISMISSALS_STORAGE_KEY, JSON.stringify({ version: 99, items: [] }));
  assert.equal(isSmartSaveHandoffDismissed(storage, filmRef()), false);
});

test('unavailable localStorage does not throw during Save handoff path', () => {
  const homeData = homeWithOpps(nFuture(1));
  const ref = filmRef();
  assert.doesNotThrow(() => {
    processSmartSaveHandoffAfterToggle({
      storage: null,
      filmRef: ref,
      becameSaved: true,
      homeData,
      now: NOW,
      emit: false,
    });
  });
  assert.doesNotThrow(() => {
    clearSmartSaveHandoffDismissal(null, ref);
    dismissSmartSaveHandoff(null, ref);
    isSmartSaveHandoffDismissed(null, ref);
  });
});

test('host clears handoff on navigationKey change', () => {
  assert.match(HOST, /navigationKey/);
  assert.match(HOST, /prevNavigationKeyRef/);
  assert.match(HOST, /declineSmartSaveHandoff/);
  assert.match(APP, /navigationKey=\{/);
});
