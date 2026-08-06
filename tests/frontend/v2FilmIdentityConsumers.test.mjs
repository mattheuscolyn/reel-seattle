/**
 * Canonical film identity consumer hardening — regression coverage.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  collectIdentityAliases,
  describeFilmIdentity,
  explainFilmIdentity,
  filmIdentitiesEqual,
  filmIdentityTokens,
  resolveCanonicalFilmRef,
} from '../../v2/identity/filmIdentity.js';
import { filmRefFromHomeFilm } from '../../v2/save/filmRefFromFilm.js';
import {
  applyNotInterestedToggle,
  buildNotInterestedActionState,
} from '../../v2/save/notInterestedActionState.js';
import {
  applySaveToggle,
  buildSaveActionState,
} from '../../v2/save/saveActionState.js';
import {
  isFilmNotInterested,
  markFilmNotInterested,
} from '../../v2/stores/notInterestedFilmsStore.js';
import { isFilmSaved } from '../../v2/stores/savedFilmsStore.js';
import {
  allPlayingFilms,
} from '../../v2/explore/exploreCatalog.js';
import {
  buildSearchFilmResult,
  buildSearchResultsModel,
} from '../../v2/explore/searchResultsModel.js';
import { applyFilmBucketSelection } from '../../v2/planner/buildPlanFilmCatalog.js';
import { mapBuildFormToPlannerFilters } from '../../v2/planner/mapBuildFormToPlannerFilters.js';
import {
  generateLivePlannerResults,
  mapEngineScheduleToResultsPlan,
} from '../../v2/planner/generateLivePlannerResults.js';
import { homeDataToPlannerRows } from '../../v2/planner/homeDataToPlannerRows.js';
import { buildAcceptedPlanItem } from '../../v2/stores/acceptedPlansStore.js';
import { derivePlanDetailsViewModel } from '../../v2/planner/derivePlanDetailsViewModel.js';
import { groupBrowseOpportunitiesByFilm } from '../../v2/showtimes/showtimesBrowseModel.js';
import { filmMatchesToken } from '../../src/utils/plannerEngine.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

function memoryStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function makeHomeData() {
  return {
    films: [
      {
        filmKey: 'batman-2022',
        filmId: 'tmdb:414906',
        title: 'The Batman',
        parentFilmKey: null,
        runtimeMin: 176,
        posterUrl: '/p-batman.png',
        showtimeCount: 2,
        theaterCount: 1,
        source: 'siiff',
      },
      {
        filmKey: 'batman-2022-sensory',
        filmId: 'tmdb:414906',
        title: 'The Batman (Sensory Friendly)',
        parentFilmKey: 'batman-2022',
        parentDisplayTitle: 'The Batman',
        runtimeMin: 176,
        posterUrl: '/p-batman.png',
        showtimeCount: 1,
        theaterCount: 1,
        screeningVariantType: 'sensory',
        source: 'siiff',
      },
      {
        filmKey: 'batman-1989',
        filmId: 'tmdb:268',
        title: 'The Batman',
        parentFilmKey: null,
        runtimeMin: 126,
        posterUrl: '/p-batman89.png',
        showtimeCount: 1,
        theaterCount: 1,
        source: 'nwff',
      },
      {
        filmKey: 'shorts-night',
        filmId: null,
        title: 'Local Shorts Night',
        parentFilmKey: null,
        runtimeMin: 90,
        posterUrl: null,
        showtimeCount: 1,
        theaterCount: 1,
        source: 'nwff',
        sourceFilmId: 'nwff:shorts-night',
      },
    ],
    opportunities: [
      {
        filmKey: 'batman-2022',
        opportunityKey: 'opp-bat-1',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-28',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-07-28T19:00',
        formatLabels: ['Standard'],
        runtimeMin: 176,
        status: 'scheduled',
        source: 'siiff',
        sourceShowtimeId: 's1',
        ticketUrl: 'https://example.com/t1',
      },
      {
        filmKey: 'batman-2022-sensory',
        opportunityKey: 'opp-bat-sensory',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-28',
        localTime: '14:00',
        timeDisplay: '2:00 PM',
        sortableLocalDateTime: '2026-07-28T14:00',
        formatLabels: ['Sensory Friendly'],
        runtimeMin: 176,
        status: 'scheduled',
        source: 'siiff',
        sourceShowtimeId: 's2',
        ticketUrl: 'https://example.com/t2',
      },
      {
        filmKey: 'batman-1989',
        opportunityKey: 'opp-bat89',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-28',
        localTime: '21:30',
        timeDisplay: '9:30 PM',
        sortableLocalDateTime: '2026-07-28T21:30',
        formatLabels: ['35mm'],
        runtimeMin: 126,
        status: 'scheduled',
        source: 'nwff',
        sourceShowtimeId: 's3',
        ticketUrl: 'https://example.com/t3',
      },
      {
        filmKey: 'shorts-night',
        opportunityKey: 'opp-shorts',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-28',
        localTime: '16:00',
        timeDisplay: '4:00 PM',
        sortableLocalDateTime: '2026-07-28T16:00',
        formatLabels: [],
        runtimeMin: 90,
        status: 'scheduled',
        source: 'nwff',
        sourceShowtimeId: 's4',
        ticketUrl: 'https://example.com/t4',
      },
    ],
    theatersById: {
      t1: { id: 't1', name: 'SIFF Uptown', neighborhood: 'Lower Queen Anne' },
    },
    theaters: [{ id: 't1', name: 'SIFF Uptown' }],
  };
}

test('shared identity: TMDB filmRef, aliases, and variant equality', () => {
  const home = makeHomeData();
  const parent = home.films[0];
  const variant = home.films[1];
  const remake = home.films[2];
  const sourceEvent = home.films[3];

  assert.equal(resolveCanonicalFilmRef(parent), 'tmdb:414906');
  assert.equal(resolveCanonicalFilmRef(variant), 'tmdb:414906');
  assert.equal(resolveCanonicalFilmRef(remake), 'tmdb:268');
  assert.equal(resolveCanonicalFilmRef(sourceEvent), 'showtime:shorts-night');

  assert.equal(filmIdentitiesEqual(parent, variant), true);
  assert.equal(filmIdentitiesEqual(parent, remake), false);
  assert.equal(filmIdentitiesEqual(parent, sourceEvent), false);

  const aliases = collectIdentityAliases(variant);
  assert.ok(aliases.includes('batman-2022'));
  assert.ok(aliases.includes('batman-2022-sensory'));

  const explained = explainFilmIdentity(variant, {
    routeTarget: 'batman-2022',
  });
  assert.equal(explained.canonicalFilmId, 'tmdb:414906');
  assert.equal(explained.identityType, 'tmdb');
  assert.equal(explained.routeTarget, 'batman-2022');
});

test('Search Save/NI use canonical filmRef and share state with Film Detail path', () => {
  const storage = memoryStorage();
  const home = makeHomeData();
  const parent = home.films[0];
  const variant = home.films[1];
  const remake = home.films[2];

  const saveAction = buildSaveActionState({
    mode: 'production',
    film: parent,
    storage,
  });
  assert.equal(saveAction.filmRef.filmId, 'tmdb:414906');
  const saved = applySaveToggle({
    storage,
    filmRef: saveAction.filmRef,
    persist: true,
    currentIsSaved: false,
  });
  assert.equal(saved.ok, true);
  assert.equal(isFilmSaved(storage, filmRefFromHomeFilm(variant)), true);
  assert.equal(isFilmSaved(storage, filmRefFromHomeFilm(remake)), false);

  const niAction = buildNotInterestedActionState({
    mode: 'production',
    film: variant,
    storage,
  });
  assert.equal(niAction.filmRef.filmId, 'tmdb:414906');
  const ni = applyNotInterestedToggle({
    storage,
    filmRef: niAction.filmRef,
    persist: true,
    currentIsNotInterested: false,
  });
  assert.equal(ni.ok, true);
  assert.equal(isFilmNotInterested(storage, filmRefFromHomeFilm(parent)), true);
  assert.equal(isFilmNotInterested(storage, filmRefFromHomeFilm(remake)), false);

  const model = buildSearchResultsModel(home, 'Batman', {
    isDismissed: (film) =>
      Boolean(
        filmRefFromHomeFilm(film) &&
          isFilmNotInterested(storage, filmRefFromHomeFilm(film)),
      ),
  });
  assert.equal(
    model.films.some((f) => f.filmKey === 'batman-2022'),
    false,
  );
  assert.equal(
    model.films.some((f) => f.filmKey === 'batman-2022-sensory'),
    false,
  );
  assert.equal(
    model.films.some((f) => f.filmKey === 'batman-1989'),
    true,
  );
});

test('Explore adapters retain filmId through toFilmRow / search / showtimes browse', () => {
  const home = makeHomeData();
  const playing = allPlayingFilms(home);
  const bat = playing.find((f) => f.filmKey === 'batman-2022');
  assert.ok(bat);
  assert.equal(bat.filmId, 'tmdb:414906');
  assert.equal(bat.parentFilmKey, null);

  const search = buildSearchFilmResult(home, home.films[1]);
  assert.equal(search.filmId, 'tmdb:414906');
  assert.equal(search.parentFilmKey, 'batman-2022');

  const browse = groupBrowseOpportunitiesByFilm(
    home.opportunities,
    home,
    'today',
  );
  const browseBat = browse.find((f) => f.filmKey === 'batman-2022');
  assert.equal(browseBat?.filmId, 'tmdb:414906');
});

test('Planner catalog tokens prefer filmId; same-title remakes stay separate', () => {
  const home = makeHomeData();
  const a = home.films[0];
  const b = home.films[2];
  assert.deepEqual(filmIdentityTokens(a), [
    'tmdb:414906',
    'batman-2022',
  ]);
  assert.ok(filmIdentityTokens(b).includes('tmdb:268'));
  assert.ok(!filmIdentityTokens(b).includes('tmdb:414906'));

  let form = { mustInclude: [], wouldLove: [], notInterested: [] };
  form = {
    ...form,
    ...applyFilmBucketSelection(form, 'mustInclude', {
      ...a,
      id: a.filmKey,
      imageUrl: '',
    }),
  };
  assert.equal(form.mustInclude[0].filmId, 'tmdb:414906');

  form = {
    ...form,
    ...applyFilmBucketSelection(form, 'wouldLove', {
      ...b,
      id: b.filmKey,
      imageUrl: '',
    }),
  };
  assert.equal(form.wouldLove[0].filmId, 'tmdb:268');
  assert.equal(form.mustInclude.length, 1);

  const mapped = mapBuildFormToPlannerFilters(
    {
      ...createLiveBuildPlanFormState(
        () => new Date('2026-07-28T12:00:00-07:00'),
      ),
      mustInclude: form.mustInclude,
      wouldLove: form.wouldLove,
      notInterested: form.notInterested,
      planSize: '2 movies',
    },
    home,
    { now: () => new Date('2026-07-28T12:00:00-07:00') },
  );
  assert.ok(mapped.filters.includeFilms.includes('tmdb:414906'));
  assert.ok(mapped.filters.preferredFilms.includes('tmdb:268'));
  assert.ok(!mapped.filters.includeFilms.includes('The Batman'));
});

test('Planner exclusions: global NI + variants; remakes and source events independent', () => {
  const storage = memoryStorage();
  const home = makeHomeData();
  markFilmNotInterested(storage, filmRefFromHomeFilm(home.films[0]));

  const baseForm = createLiveBuildPlanFormState(
    () => new Date('2026-07-28T12:00:00-07:00'),
  );
  const generated = generateLivePlannerResults({
    homeData: home,
    form: { ...baseForm, planSize: '1 movie' },
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    storage,
  });
  assert.ok(generated.ok);
  const titles = generated.plans.flatMap((p) =>
    p.items.filter((i) => i.type !== 'break').map((i) => i.filmKey),
  );
  assert.ok(!titles.includes('batman-2022'));
  assert.ok(!titles.includes('batman-2022-sensory'));
  assert.ok(titles.includes('batman-1989') || titles.includes('shorts-night'));

  markFilmNotInterested(storage, filmRefFromHomeFilm(home.films[3]));
  const afterSource = generateLivePlannerResults({
    homeData: home,
    form: { ...baseForm, planSize: '1 movie' },
    now: () => new Date('2026-07-28T12:00:00-07:00'),
    storage,
  });
  const keys = afterSource.plans.flatMap((p) =>
    p.items.filter((i) => i.type !== 'break').map((i) => i.filmKey),
  );
  assert.ok(!keys.includes('shorts-night'));
});

test('Accepted plans preserve filmId + showtime key; legacy plans still load', () => {
  const home = makeHomeData();
  const rows = homeDataToPlannerRows(home);
  const row = rows.find((r) => r.showtime_film_key === 'batman-2022');
  assert.equal(row.filmId, 'tmdb:414906');

  const schedule = {
    theater: 'SIFF Uptown',
    theater_id: 't1',
    filmCount: 1,
    films: ['The Batman'],
    movies: [
      {
        film: 'The Batman',
        showtime_film_key: 'batman-2022',
        filmId: 'tmdb:414906',
        theater: 'SIFF Uptown',
        theater_id: 't1',
        date: '2026-07-28',
        time: '7:00PM',
        startMin: 19 * 60,
        endMin: 19 * 60 + 176 + 15,
        runtime: 176,
        poster: '/p-batman.png',
        premiumFormat: 'Standard',
        formatTags: ['Standard'],
      },
    ],
    totalSpanMin: 191,
    filmRuntimeMin: 176,
    gapTimeMin: 0,
    startMin: 19 * 60,
    endMin: 19 * 60 + 191,
  };
  const plan = mapEngineScheduleToResultsPlan(schedule, home, rows, 1);
  const film = plan.items.find((i) => i.type !== 'break');
  assert.equal(film.filmId, 'tmdb:414906');
  assert.equal(film.filmKey, 'batman-2022');

  const built = buildAcceptedPlanItem({
    performances: [film],
    label: 'Test',
    date: '2026-07-28',
    provenance: 'live',
  });
  assert.equal(built.ok, true);
  assert.equal(built.plan.performances[0].filmId, 'tmdb:414906');
  assert.equal(built.plan.performances[0].filmKey, 'batman-2022');

  const legacy = buildAcceptedPlanItem({
    performances: [
      {
        title: 'Legacy Film',
        filmKey: 'legacy-key',
        filmId: null,
        theaterId: 't1',
        theater: 'SIFF Uptown',
        date: '2026-07-28',
        localDate: '2026-07-28',
        time: '18:00',
        localTime: '18:00',
        runtime: 100,
        runtimeMin: 100,
        source: 'nwff',
        sourceShowtimeId: 'legacy-1',
      },
    ],
    label: 'Legacy',
    date: '2026-07-28',
    provenance: 'live',
  });
  assert.equal(legacy.ok, true);
  assert.equal(legacy.plan.performances[0].filmId, null);
  assert.equal(legacy.plan.performances[0].filmKey, 'legacy-key');

  const details = derivePlanDetailsViewModel(plan);
  const detailFilm = details.itinerary.find((r) => r.kind === 'film');
  assert.equal(detailFilm.filmId, 'tmdb:414906');
  assert.equal(detailFilm.filmKey, 'batman-2022');
});

test('filmMatchesToken does not collide same-title remakes via filmId', () => {
  const a = {
    key: 'batman-2022',
    title: 'The Batman',
    filmId: 'tmdb:414906',
    parentKey: null,
  };
  const b = {
    key: 'batman-1989',
    title: 'The Batman',
    filmId: 'tmdb:268',
    parentKey: null,
  };
  assert.equal(filmMatchesToken('tmdb:414906', a), true);
  assert.equal(filmMatchesToken('tmdb:414906', b), false);
  // Title fallback still matches both (documented last resort).
  assert.equal(filmMatchesToken('The Batman', a), true);
  assert.equal(filmMatchesToken('The Batman', b), true);
});

test('source-based events never invent TMDB identity', () => {
  const event = makeHomeData().films[3];
  const identity = describeFilmIdentity(event);
  assert.equal(identity.filmId, null);
  assert.equal(identity.identityType, 'source');
  assert.equal(identity.filmRef, 'showtime:shorts-night');
  assert.ok(!filmIdentityTokens(event).some((t) => t.startsWith('tmdb:')));
});

test('wiring: Search uses shared NI helpers; no title-first planner tokens', () => {
  const search = readFileSync(
    join(ROOT, 'v2/surfaces/SearchResultsSurface.jsx'),
    'utf8',
  );
  assert.match(search, /buildNotInterestedActionState/);
  assert.match(search, /applyNotInterestedToggle/);
  assert.equal(search.includes('saveDismissedFilmKeys'), false);

  const mapFilters = readFileSync(
    join(ROOT, 'v2/planner/mapBuildFormToPlannerFilters.js'),
    'utf8',
  );
  assert.match(mapFilters, /filmIdentityTokensFromCards/);
  assert.equal(mapFilters.includes('filmTitlesFromCards'), false);
});
