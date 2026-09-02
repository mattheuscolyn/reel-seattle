import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composePlannerSavedFilmsPresentation,
  filterPlannerSavedFilmRows,
  sortPlannerSavedFilmRows,
} from '../../v2/planner/composePlannerSavedFilmsPresentation.js';
import {
  addSavedFilmShowtimeToPlanner,
  buildPerformanceKeyForOpportunity,
  findPlannedPerformanceByKey,
  listPlannedPerformanceKeys,
} from '../../v2/planner/addSavedFilmShowtimeToPlanner.js';
import { savedFilmRefHasFuturePlannedScreening } from '../../v2/planner/plannerSavedFilmsQueue.js';
import {
  deriveSavedFilmUrgency,
  formatSavedFilmShowtimeSummary,
  PLANNER_SAVED_URGENCY,
} from '../../v2/planner/plannerSavedFilmsUrgency.js';
import { PLANNER_SAVED_FILTER_OPTIONS } from '../../v2/planner/plannerSavedFilmsConfig.js';
import {
  getPlannerSavedFilmsMockupPresentation,
  PLANNER_SAVED_MOCKUP_NO_SHOWTIMES_FILM_KEY,
  PLANNER_SAVED_MOCKUP_SCHEDULED_FILM_KEY,
} from '../../v2/fixtures/plannerSavedFilmsMockupFixture.js';
import { composePlannerLandingFromAcceptedPlans } from '../../v2/planner/composePlannerLandingPresentation.js';
import {
  getSavedFilms,
  saveFilm,
  unsaveFilm,
} from '../../v2/stores/savedFilmsStore.js';
import { getAcceptedPlans, removePerformanceFromAcceptedPlan } from '../../v2/stores/acceptedPlansStore.js';
import { PLANNER_CONFLICT_REVIEW_MOCKUP_ID } from '../../v2/fixtures/plannerConflictReviewMockupFixture.js';
import { resolvePlannerConflictReviewPresentation } from '../../v2/planner/resolvePlannerConflictReviewPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PLANNER_SRC = readFileSync(join(ROOT, 'v2/planner/PlannerDestination.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

const NOW = new Date('2026-05-10T12:00:00-07:00');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'nosferatu',
        filmId: 'tmdb:426063',
        title: 'Nosferatu',
        posterUrl: 'https://example.test/nos.jpg',
        runtimeMin: 132,
        year: 2024,
      },
      {
        filmKey: 'heat',
        filmId: 'tmdb:949',
        title: 'Heat',
        posterUrl: 'https://example.test/heat.jpg',
        runtimeMin: 170,
        year: 1995,
      },
      {
        filmKey: 'rare-film',
        filmId: 'tmdb:999',
        title: 'Rare Film',
        runtimeMin: 90,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-nos-1',
        filmKey: 'nosferatu',
        theaterId: 'egyptian',
        theaterName: 'SIFF Cinema Egyptian',
        localDate: '2026-05-17',
        localTime: '19:00',
        sortableLocalDateTime: '2026-05-17T19:00:00',
        source: 'siff',
        sourceShowtimeId: 'nos-1',
        runtimeMin: 132,
      },
      {
        opportunityKey: 'opp-heat-1',
        filmKey: 'heat',
        theaterId: 'amc',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-05-12',
        localTime: '19:15',
        sortableLocalDateTime: '2026-05-12T19:15:00',
        source: 'amc',
        sourceShowtimeId: 'heat-1',
        runtimeMin: 170,
      },
      {
        opportunityKey: 'opp-heat-2',
        filmKey: 'heat',
        theaterId: 'amc',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-05-13',
        localTime: '19:15',
        sortableLocalDateTime: '2026-05-13T19:15:00',
        source: 'amc',
        sourceShowtimeId: 'heat-2',
        runtimeMin: 170,
      },
      {
        opportunityKey: 'opp-heat-3',
        filmKey: 'heat',
        theaterId: 'amc',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-05-14',
        localTime: '19:15',
        sortableLocalDateTime: '2026-05-14T19:15:00',
        source: 'amc',
        sourceShowtimeId: 'heat-3',
        runtimeMin: 170,
      },
      {
        opportunityKey: 'opp-rare-1',
        filmKey: 'rare-film',
        theaterId: 'nwff',
        theaterName: 'NWFF',
        localDate: '2026-05-20',
        localTime: '19:00',
        sortableLocalDateTime: '2026-05-20T19:00:00',
        source: 'nwff',
        sourceShowtimeId: 'rare-1',
        runtimeMin: 90,
      },
    ],
  };
}

function seedSaved(storage, films) {
  for (const film of films) {
    saveFilm(storage, film.filmKey, {
      now: () => NOW,
      title: film.title,
      posterUrl: film.posterUrl,
      year: film.year,
    });
  }
}

test('Planner Saved Films panel replaces stub in destination', () => {
  assert.match(PLANNER_SRC, /PlannerSavedFilmsPanel/);
  assert.equal(PLANNER_SRC.includes('v2-planner-saved-stub'), false);
  assert.match(CSS, /\.v2-psf\b/);
  assert.match(CSS, /\.v2-sfcs-sheet\b/);
});

test('Saved Films landing renders saved films with correct count', () => {
  const storage = memoryStorage();
  seedSaved(storage, [
    { filmKey: 'nosferatu', title: 'Nosferatu' },
    { filmKey: 'heat', title: 'Heat' },
  ]);
  const p = composePlannerSavedFilmsPresentation({
    storage,
    homeData: sampleHome(),
    now: NOW,
  });
  assert.equal(p.count, 2);
  assert.equal(p.rows[0].title === 'Nosferatu' || p.rows[1].title === 'Nosferatu', true);
});

test('rows derive showtime availability from HomeData', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'heat', title: 'Heat' }]);
  const p = composePlannerSavedFilmsPresentation({
    storage,
    homeData: sampleHome(),
    now: NOW,
  });
  assert.equal(p.rows[0].showtimeCount, 3);
  assert.match(p.rows[0].showtimeSummary, /showtimes/);
});

test('no-showtimes saved film is hidden from queue', () => {
  const storage = memoryStorage();
  saveFilm(
    storage,
    { filmId: 'tmdb:555', showtimeFilmKey: 'tmdb:tmdb:555', title: 'TMDB Only' },
    { now: () => NOW },
  );
  const p = composePlannerSavedFilmsPresentation({
    storage,
    homeData: sampleHome(),
    now: NOW,
  });
  assert.equal(p.count, 0);
  assert.equal(p.queueCount, 0);
  assert.equal(p.totalSavedLibraryCount, 1);
  assert.equal(p.isCaughtUp, true);
});

test('urgency derives last chance and leaving soon from showtime counts', () => {
  assert.equal(deriveSavedFilmUrgency(1).badge, 'Last chance');
  assert.equal(deriveSavedFilmUrgency(2).badge, 'Leaving soon');
  assert.equal(deriveSavedFilmUrgency(5).badge, null);
});

test('most urgent sort orders last chance before others', () => {
  const rows = [
    {
      id: 'a',
      sortTitle: 'zulu',
      urgencyRank: 10,
      nextSortable: '2026-05-20',
      savedAt: '2026-05-01',
    },
    {
      id: 'b',
      sortTitle: 'alpha',
      urgencyRank: 0,
      nextSortable: '2026-05-12',
      savedAt: '2026-05-02',
    },
  ];
  const sorted = sortPlannerSavedFilmRows(rows, 'urgent');
  assert.equal(sorted[0].id, 'b');
});

test('recently saved sort is newest first', () => {
  const rows = [
    { id: 'a', sortTitle: 'a', savedAt: '2026-05-01', urgencyRank: 10, nextSortable: 'z' },
    { id: 'b', sortTitle: 'b', savedAt: '2026-05-09', urgencyRank: 10, nextSortable: 'z' },
  ];
  const sorted = sortPlannerSavedFilmRows(rows, 'recent');
  assert.equal(sorted[0].id, 'b');
});

test('title sort is alphabetical', () => {
  const rows = [
    { id: 'a', sortTitle: 'zebra', savedAt: '', urgencyRank: 0, nextSortable: 'z' },
    { id: 'b', sortTitle: 'alpha', savedAt: '', urgencyRank: 0, nextSortable: 'z' },
  ];
  const sorted = sortPlannerSavedFilmRows(rows, 'title');
  assert.equal(sorted[0].id, 'b');
});

test('filters work for leaving soon', () => {
  const rows = [
    { showtimeCount: 1, urgencyId: PLANNER_SAVED_URGENCY.lastChance },
    { showtimeCount: 3, urgencyId: PLANNER_SAVED_URGENCY.none },
  ];
  assert.equal(filterPlannerSavedFilmRows(rows, 'leaving_soon').length, 1);
});

test('Has showtimes filter no longer exists', () => {
  assert.equal(
    PLANNER_SAVED_FILTER_OPTIONS.some((o) => o.id === 'has_showtimes'),
    false,
  );
});

test('saved film with future planned screening is hidden from queue', () => {
  const storage = memoryStorage();
  seedSaved(storage, [
    { filmKey: 'heat', title: 'Heat', filmId: 'tmdb:949' },
    { filmKey: 'rare-film', title: 'Rare Film' },
  ]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-heat-1');
  addSavedFilmShowtimeToPlanner(storage, opp, 'heat', { homeData, now: () => NOW });
  const p = composePlannerSavedFilmsPresentation({
    storage,
    homeData,
    now: NOW,
  });
  assert.equal(p.count, 1);
  assert.equal(p.rows[0].filmKey, 'rare-film');
  assert.equal(getSavedFilms(storage).length, 2);
});

test('scheduled-film detection uses film identity not title', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'heat', title: 'Heat', filmId: 'tmdb:949' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-heat-1');
  addSavedFilmShowtimeToPlanner(storage, opp, 'heat', { homeData, now: () => NOW });
  const savedRef = getSavedFilms(storage).find((s) => s.filmRef.showtimeFilmKey === 'heat')?.filmRef;
  assert.equal(savedFilmRefHasFuturePlannedScreening(savedRef, storage, NOW), true);
  assert.equal(
    savedFilmRefHasFuturePlannedScreening(
      { filmId: 'tmdb:949', showtimeFilmKey: 'different-key' },
      storage,
      NOW,
    ),
    true,
  );
});

test('add to planner removes film from queue but keeps saved state', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'rare-film', title: 'Rare Film' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-rare-1');
  addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', { homeData, now: () => NOW });
  const after = composePlannerSavedFilmsPresentation({
    storage,
    homeData,
    now: NOW,
  });
  assert.equal(after.count, 0);
  assert.equal(getSavedFilms(storage).length, 1);
});

test('removing planned screening returns film to queue when showtimes remain', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'heat', title: 'Heat', filmId: 'tmdb:949' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-heat-1');
  const added = addSavedFilmShowtimeToPlanner(storage, opp, 'heat', { homeData, now: () => NOW });
  assert.equal(
    composePlannerSavedFilmsPresentation({ storage, homeData, now: NOW }).count,
    0,
  );
  removePerformanceFromAcceptedPlan(storage, added.planId, added.performanceKey);
  const restored = composePlannerSavedFilmsPresentation({
    storage,
    homeData,
    now: NOW,
  });
  assert.equal(restored.count, 1);
  assert.equal(restored.rows[0].filmKey, 'heat');
});

test('choose showtime sheet component is wired', () => {
  assert.match(PLANNER_SRC, /PlannerSavedFilmsPanel/);
  const panelSrc = readFileSync(
    join(ROOT, 'v2/planner/PlannerSavedFilmsPanel.jsx'),
    'utf8',
  );
  assert.match(panelSrc, /SavedFilmChooseShowtimeSheet/);
  const mock = getPlannerSavedFilmsMockupPresentation();
  assert.ok(mock.rows[0].sheetShowtimes.length > 0);
});

test('add to planner persists exact performance and remains saved', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'rare-film', title: 'Rare Film' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-rare-1');
  const result = addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', {
    homeData,
    now: () => NOW,
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.ok(result.performanceKey);
  assert.equal(getSavedFilms(storage).length, 1);
  const planned = findPlannedPerformanceByKey(storage, result.performanceKey);
  assert.ok(planned);
  assert.equal(planned.performance.title, 'Rare Film');
});

test('duplicate exact showtime cannot be added twice', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'rare-film', title: 'Rare Film' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-rare-1');
  const first = addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', { homeData });
  const second = addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', { homeData });
  assert.equal(first.ok, true);
  assert.equal(second.status, 'already_planned');
  assert.equal(getAcceptedPlans(storage).length, 1);
});

test('different showtime for same film still adds second performance at store level', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'heat', title: 'Heat' }]);
  const homeData = sampleHome();
  const opp1 = homeData.opportunities.find((o) => o.opportunityKey === 'opp-heat-1');
  const opp2 = homeData.opportunities.find((o) => o.opportunityKey === 'opp-heat-2');
  const key1 = buildPerformanceKeyForOpportunity(opp1, homeData.films[1], null, homeData);
  const key2 = buildPerformanceKeyForOpportunity(opp2, homeData.films[1], null, homeData);
  assert.notEqual(key1, key2);
  addSavedFilmShowtimeToPlanner(storage, opp1, 'heat', { homeData });
  const second = addSavedFilmShowtimeToPlanner(storage, opp2, 'heat', { homeData });
  assert.equal(second.ok, true);
  assert.equal(second.changed, true);
  assert.equal(getAcceptedPlans(storage).length, 2);
});

test('added performance appears in Planner Upcoming compose', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'rare-film', title: 'Rare Film' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-rare-1');
  addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', { homeData, now: () => NOW });
  const landing = composePlannerLandingFromAcceptedPlans({ storage, now: NOW });
  assert.equal(landing.summary.screeningCount, 1);
});

test('remove from saved does not remove planner screening', () => {
  const storage = memoryStorage();
  seedSaved(storage, [{ filmKey: 'rare-film', title: 'Rare Film' }]);
  const homeData = sampleHome();
  const opp = homeData.opportunities.find((o) => o.opportunityKey === 'opp-rare-1');
  const added = addSavedFilmShowtimeToPlanner(storage, opp, 'rare-film', { homeData });
  const saved = getSavedFilms(storage)[0];
  unsaveFilm(storage, saved.filmRef);
  assert.equal(getSavedFilms(storage).length, 0);
  assert.ok(findPlannedPerformanceByKey(storage, added.performanceKey));
  assert.equal(listPlannedPerformanceKeys(storage).size, 1);
});

test('three-dot menu actions are present in panel source', () => {
  const panelSrc = readFileSync(
    join(ROOT, 'v2/planner/PlannerSavedFilmsPanel.jsx'),
    'utf8',
  );
  assert.match(panelSrc, /View film details/);
  assert.match(panelSrc, /Remove from Saved/);
  assert.match(panelSrc, /unsaveFilm/);
  assert.match(panelSrc, /Choose showtime/);
  assert.match(panelSrc, /v2-psf-card-footer/);
  assert.match(panelSrc, /v2-psf-more/);
  assert.match(panelSrc, /closeChooseShowtime/);
});

test('mockup mode renders actionable saved films queue rows', () => {
  const mock = getPlannerSavedFilmsMockupPresentation();
  assert.equal(mock.source, 'planner-saved-films-mockup');
  assert.equal(mock.count, 6);
  assert.equal(mock.rows[0].title, 'Bottoms');
  assert.equal(mock.rows[0].urgencyBadge, 'Last chance');
});

test('mockup queue hides scheduled and no-showtimes films', () => {
  const defaultQueue = getPlannerSavedFilmsMockupPresentation();
  assert.equal(
    defaultQueue.rows.some((r) => r.filmKey === PLANNER_SAVED_MOCKUP_NO_SHOWTIMES_FILM_KEY),
    false,
  );
  const scheduled = getPlannerSavedFilmsMockupPresentation({
    scheduledFilmKeys: [PLANNER_SAVED_MOCKUP_SCHEDULED_FILM_KEY],
  });
  assert.equal(scheduled.count, 5);
  assert.equal(
    scheduled.rows.some((r) => r.filmKey === PLANNER_SAVED_MOCKUP_SCHEDULED_FILM_KEY),
    false,
  );
});

test('regression: conflict review mockup still resolves', () => {
  const resolved = resolvePlannerConflictReviewPresentation({
    conflictId: PLANNER_CONFLICT_REVIEW_MOCKUP_ID,
    mockupMode: true,
  });
  assert.equal(resolved.ok, true);
});

test('regression: per-screening sheet still wired on landing', () => {
  assert.match(PLANNER_SRC, /PlannedScreeningSheet/);
});

test('showtime summary uses singular/plural copy', () => {
  assert.equal(formatSavedFilmShowtimeSummary(1, [], NOW), '1 showtime left');
  assert.equal(formatSavedFilmShowtimeSummary(2, [], NOW), '2 showtimes left');
});
