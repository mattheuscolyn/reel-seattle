import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  resolveActivePrimaryId,
  resolveHeaderBackLabel,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openComingSoonDetail,
  openFilmDetail,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { resolveFilmDetailBackLabel } from '../../v2/filmDetail/filmDetailModel.js';
import { V2_DATA_ARTIFACTS } from '../../v2/data/allowedDataRoutes.js';
import { loadComingSoonCurrent } from '../../v2/comingSoon/loadComingSoonCurrent.js';
import {
  canOpenCanonicalFilmDetail,
  comingSoonActiveFilterCount,
  comingSoonEntryMatchesFilters,
  comingSoonKindChip,
  comingSoonMonthKey,
  comingSoonTheatricalFridayIso,
  comingSoonWeekStartIso,
  compareComingSoonEntries,
  composeComingSoonDetail,
  composeComingSoonPage,
  COMING_SOON_SCOPE,
  DEFAULT_COMING_SOON_FILTERS,
  formatComingSoonMonthLabel,
  formatComingSoonTheaterLine,
  formatComingSoonWeekLabel,
  isComingSoonRecommendedEntry,
  isRenderableComingSoonEntry,
  selectComingSoonOpenTarget,
} from '../../v2/comingSoon/comingSoonModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const PAGE_SRC = readFileSync(
  join(ROOT, 'v2/comingSoon/ComingSoonSurface.jsx'),
  'utf8',
);
const MODEL_SRC = readFileSync(
  join(ROOT, 'v2/comingSoon/comingSoonModel.js'),
  'utf8',
);
const DETAIL_SRC = readFileSync(
  join(ROOT, 'v2/comingSoon/ComingSoonDetailSurface.jsx'),
  'utf8',
);
const COLLECTION_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/CollectionSurface.jsx'),
  'utf8',
);
const EXPLORE_SRC = readFileSync(
  join(ROOT, 'v2/explore/ExploreDestination.jsx'),
  'utf8',
);
const CATALOG_SRC = readFileSync(
  join(ROOT, 'v2/explore/exploreCatalog.js'),
  'utf8',
);
const ARTIFACT_PATH = join(ROOT, 'public/data/coming_soon_current.json');
const ANALYSIS_PATH = join(
  ROOT,
  'data/audits/coming_soon_candidates_current.json',
);

function liveArtifact() {
  return JSON.parse(readFileSync(ARTIFACT_PATH, 'utf8'));
}

function entry({
  title,
  date,
  classification = 'amc_announced',
  relevanceTier,
  joinKey,
  filmId = null,
  filmIdConfirmed = false,
  tmdbId = null,
  tmdbInferred = false,
  kind = 'film',
  posterUrl = null,
  theaters = [],
  showtimeKeys = [],
  overview = null,
  inRecommended,
}) {
  const confirmed = classification === 'confirmed_local';
  const tier =
    relevanceTier ??
    (confirmed
      ? 'confirmed_local'
      : classification === 'amc_announced'
        ? 'strongly_expected'
        : null);
  const recommended =
    typeof inRecommended === 'boolean'
      ? inRecommended
      : tier === 'confirmed_local' ||
        tier === 'locally_announced' ||
        tier === 'strongly_expected';
  return {
    film_id: filmId,
    title,
    join_key: joinKey ?? title.toLowerCase().replace(/\s+/g, '-'),
    parent_film_keys: [],
    showtime_film_keys: showtimeKeys,
    tmdb_id: tmdbId,
    amc_movie_id: '1',
    amc_movie_ids: ['1'],
    expected_release_date: date,
    expected_release_date_source: 'amc_catalog_release_date',
    amc_catalog_release_date: date,
    tmdb_us_release_date: null,
    first_local_screening_date: confirmed ? date : null,
    first_local_screening_source: confirmed ? 'reel_seattle_showtimes' : null,
    local_status: confirmed ? 'scheduled' : 'not_announced',
    local_theater_ids: theaters.map((row) => row.theater_id),
    local_theaters: theaters,
    local_theater_count: theaters.length,
    local_showtime_count: confirmed ? 1 : 0,
    evidence: {
      amc_coming_soon_catalog: true,
      amc_theater_booking: confirmed,
      tmdb_us_theatrical: Boolean(tmdbId) || tier === 'strongly_expected',
      reel_seattle_scheduled: confirmed,
    },
    classification,
    relevance_tier: tier,
    user_visible: true,
    in_recommended: recommended,
    engagements: [],
    presentation: {
      kind,
      source: posterUrl ? 'amc_catalog' : 'fallback',
      poster_url: posterUrl,
      poster_path: null,
      backdrop_url: null,
      backdrop_path: null,
      overview,
      runtime_minutes: 100,
      rating: 'PG-13',
      release_year: 2026,
    },
    identity: {
      method: filmIdConfirmed ? 'film_id' : 'amc_movie_id',
      film_id_confirmed: filmIdConfirmed,
      tmdb_id_inferred: tmdbInferred,
      ambiguous: false,
      synthetic_film_group: false,
      variant_titles: [title],
      contributing_sources: ['amc_catalog'],
    },
    source_metadata: { amc: { amc_movie_id: '1' }, tmdb: tmdbId ? { tmdb_id: tmdbId } : null },
  };
}

function fixtureArtifact(entries) {
  return {
    schema_version: '1.4.0',
    generated_at: '2026-09-14T12:00:00-07:00',
    timezone: 'America/Los_Angeles',
    entries,
  };
}

test('Coming Soon designed page replaces CollectionSurface scaffold', () => {
  assert.match(APP_SRC, /isComingSoon/);
  assert.match(APP_SRC, /ComingSoonSurface/);
  assert.match(APP_SRC, /ComingSoonDetailSurface/);
  assert.match(PAGE_SRC, /data-coming-soon-surface="list"/);
  assert.equal(PAGE_SRC.includes('Explore · scaffold'), false);
  assert.equal(
    CATALOG_SRC.includes('no approved upcoming-film classification'),
    false,
  );
  assert.equal(
    EXPLORE_SRC.includes('Coming Soon, Special Events'),
    false,
  );
  assert.equal(
    COLLECTION_SRC.includes('ComingSoonSurface'),
    false,
  );
});

test('Coming Soon artifact is optional on the v2 allowlist and not the analysis dump', () => {
  const routes = V2_DATA_ARTIFACTS.map((artifact) => artifact.route);
  assert.ok(routes.includes('/data/coming_soon_current.json'));
  assert.equal(
    V2_DATA_ARTIFACTS.find((a) => a.route === '/data/coming_soon_current.json')
      ?.required,
    false,
  );
  assert.equal(
    routes.includes('/data/coming_soon_candidates_current.json'),
    false,
  );
  assert.equal(existsSync(ARTIFACT_PATH), true);
  assert.equal(
    ANALYSIS_PATH.replace(/\\/g, '/').includes('public/data/'),
    false,
  );
});

test('loader accepts a valid artifact and degrades when missing', async () => {
  const ready = await loadComingSoonCurrent({
    artifact: fixtureArtifact([
      entry({ title: 'Alpha', date: '2026-09-18', classification: 'amc_announced' }),
    ]),
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.artifact.entries.length, 1);

  const missing = await loadComingSoonCurrent({
    fetchImpl: async () => ({ ok: false, status: 404 }),
  });
  assert.equal(missing.status, 'unavailable');
  assert.equal(missing.artifact, null);

  const emptyReady = composeComingSoonPage(
    fixtureArtifact([]),
    DEFAULT_COMING_SOON_FILTERS,
    { loadStatus: 'ready' },
  );
  assert.equal(emptyReady.state, 'empty');
  assert.match(emptyReady.emptyMessage, /No upcoming titles/);

  const unavailable = composeComingSoonPage(null, DEFAULT_COMING_SOON_FILTERS, {
    loadStatus: 'unavailable',
  });
  assert.equal(unavailable.state, 'unavailable');
  assert.match(unavailable.emptyMessage, /isn’t available right now/);
});

test('month grouping with release-weekend subgroups when dense enough', () => {
  const page = composeComingSoonPage(
    fixtureArtifact([
      entry({
        title: 'Zed Unannounced',
        date: '2026-09-25',
        classification: 'amc_announced',
      }),
      entry({
        title: 'Alpha Confirmed',
        date: '2026-09-25',
        classification: 'confirmed_local',
        theaters: [{ theater_id: 'siff-uptown', name: 'SIFF Uptown' }],
      }),
      entry({
        title: 'Weekend B',
        date: '2026-09-18',
        classification: 'amc_announced',
      }),
      entry({
        title: 'October Opener',
        date: '2026-10-02',
        classification: 'amc_announced',
      }),
      entry({
        title: 'October Later',
        date: '2026-10-09',
        classification: 'amc_announced',
      }),
      entry({
        title: 'October Mid',
        date: '2026-10-03',
        classification: 'amc_announced',
      }),
      entry({
        title: 'October Extra',
        date: '2026-10-10',
        classification: 'amc_announced',
      }),
    ]),
  );
  assert.equal(page.sections.length, 2);
  assert.equal(page.sections[0].label, 'September');
  assert.equal(page.sections[0].monthKey, '2026-09');
  assert.equal(page.sections[1].label, 'October');
  // September has 3 titles across 2 weekends → flat (sparse)
  assert.equal(page.sections[0].subgroups.length, 1);
  assert.equal(page.sections[0].subgroups[0].label, null);
  assert.equal(page.sections[0].subgroups[0].entries[0].title, 'Weekend B');
  assert.equal(page.sections[0].subgroups[0].entries[1].title, 'Alpha Confirmed');
  assert.equal(page.sections[0].subgroups[0].entries[2].title, 'Zed Unannounced');
  // October has 4 titles across 2 weekends → week subgroups
  assert.ok(page.sections[1].subgroups.length >= 2);
  assert.equal(page.sections[1].subgroups[0].label, 'Oct 2');
  assert.equal(page.sections[1].subgroups[1].label, 'Oct 9');
  assert.equal(comingSoonWeekStartIso('2026-09-25'), '2026-09-21');
  assert.equal(comingSoonTheatricalFridayIso('2026-09-25'), '2026-09-25');
  assert.equal(comingSoonTheatricalFridayIso('2026-09-23'), '2026-09-25');
  assert.equal(comingSoonMonthKey('2026-10-02'), '2026-10');
  assert.equal(formatComingSoonMonthLabel('2026-10-02'), 'October');
  assert.equal(formatComingSoonWeekLabel('2026-09-21', '2026-09-27'), 'SEP 21–27');
});

test('sparse months stay flat without week headings', () => {
  const page = composeComingSoonPage(
    fixtureArtifact([
      entry({ title: 'Only One', date: '2026-11-06' }),
      entry({ title: 'Only Two', date: '2026-11-13' }),
    ]),
  );
  assert.equal(page.sections.length, 1);
  assert.equal(page.sections[0].label, 'November');
  assert.equal(page.sections[0].subgroups.length, 1);
  assert.equal(page.sections[0].subgroups[0].label, null);
  assert.equal(page.sections[0].subgroups[0].entries.length, 2);
});

test('Recommended is the default scope; All releases expands the list', () => {
  const artifact = fixtureArtifact([
    entry({
      title: 'Curated',
      date: '2026-09-25',
      classification: 'amc_announced',
      inRecommended: true,
    }),
    entry({
      title: 'Broader',
      date: '2026-09-25',
      classification: 'amc_announced',
      relevanceTier: 'weak_national_only',
      inRecommended: false,
    }),
    entry({
      title: 'TMDB Noise',
      date: '2026-09-25',
      classification: 'tmdb_only',
      relevanceTier: null,
      inRecommended: false,
    }),
  ]);
  const recommended = composeComingSoonPage(artifact);
  assert.equal(recommended.scope, COMING_SOON_SCOPE.recommended);
  assert.equal(recommended.visibleCount, 1);
  assert.equal(recommended.sections[0].subgroups[0].entries[0].title, 'Curated');

  const all = composeComingSoonPage(artifact, {
    ...DEFAULT_COMING_SOON_FILTERS,
    scope: COMING_SOON_SCOPE.all,
  });
  assert.equal(all.scope, COMING_SOON_SCOPE.all);
  assert.equal(all.visibleCount, 2);
  const titles = all.sections[0].subgroups[0].entries.map((row) => row.title);
  assert.deepEqual(titles, ['Curated', 'Broader']);
  assert.equal(isComingSoonRecommendedEntry(artifact.entries[0]), true);
  assert.equal(isComingSoonRecommendedEntry(artifact.entries[1]), false);
  assert.equal(isRenderableComingSoonEntry(artifact.entries[2]), false);
  assert.match(PAGE_SRC, /Recommended|COMING_SOON_SCOPE_OPTIONS/);
  assert.match(MODEL_SRC, /All releases/);
  assert.match(MODEL_SRC, /Recommended/);
  assert.match(PAGE_SRC, /data-coming-soon-scope/);
});

test('All releases still excludes non-film programming kinds from live filters', () => {
  const artifact = fixtureArtifact([
    entry({
      title: 'Movie',
      date: '2026-09-25',
      kind: 'film',
      inRecommended: false,
      relevanceTier: 'weak_national_only',
    }),
    entry({
      title: 'Mystery',
      date: '2026-09-25',
      kind: 'mystery_screening',
      inRecommended: true,
    }),
  ]);
  const moviesOnly = composeComingSoonPage(artifact, {
    scope: COMING_SOON_SCOPE.all,
    local: 'all',
    kinds: ['movies'],
  });
  assert.equal(moviesOnly.visibleCount, 1);
  assert.equal(moviesOnly.sections[0].subgroups[0].entries[0].title, 'Movie');
});

test('confirmed_local rows show Seattle status and theater names', () => {
  const page = composeComingSoonPage(
    fixtureArtifact([
      entry({
        title: 'Local Film',
        date: '2026-09-18',
        classification: 'confirmed_local',
        theaters: [
          { theater_id: 'siff-uptown', name: 'SIFF Uptown' },
          { theater_id: 'amc-pacific-place-11', name: 'AMC Pacific Place' },
          { theater_id: 'amc-oak-tree-6', name: 'AMC Oak Tree 6' },
        ],
      }),
    ]),
  );
  const row = page.sections[0].subgroups[0].entries[0];
  assert.equal(row.localStatusLabel, 'Confirmed in Seattle');
  assert.equal(row.theaterLine, 'SIFF Uptown + 2 more');
  assert.equal(row.classification, 'confirmed_local');
});

test('amc_announced rows show showtimes-not-announced and no theaters', () => {
  const page = composeComingSoonPage(
    fixtureArtifact([
      entry({
        title: 'National Title',
        date: '2026-10-02',
        classification: 'amc_announced',
        theaters: [{ theater_id: 'amc-pacific-place-11', name: 'AMC Pacific Place' }],
      }),
    ]),
  );
  const row = page.sections[0].subgroups[0].entries[0];
  assert.equal(row.localStatusLabel, 'Showtimes not announced yet');
  assert.equal(row.theaterLine, null);
  assert.match(PAGE_SRC, /Showtimes not announced yet|localStatusLabel/);
});

test('missing poster uses a text-forward row without fake artwork', () => {
  const page = composeComingSoonPage(
    fixtureArtifact([
      entry({ title: 'No Art', date: '2026-09-20', posterUrl: null }),
      entry({
        title: 'Has Art',
        date: '2026-09-20',
        posterUrl: 'https://example.com/poster.jpg',
      }),
    ]),
  );
  const byTitle = Object.fromEntries(
    page.sections[0].subgroups[0].entries.map((row) => [row.title, row]),
  );
  assert.equal(byTitle['No Art'].hasPoster, false);
  assert.equal(byTitle['Has Art'].hasPoster, true);
  assert.match(PAGE_SRC, /v2-cs-row-text/);
  assert.match(PAGE_SRC, /row\.hasPoster/);
  assert.equal(PAGE_SRC.includes('broken'), false);
});

test('kind labels appear only for rerelease, event, and mystery screening', () => {
  assert.equal(comingSoonKindChip({ presentation: { kind: 'film' } }), null);
  assert.equal(comingSoonKindChip({ presentation: { kind: 'other' } }), null);
  assert.deepEqual(comingSoonKindChip({ presentation: { kind: 'rerelease' } }), {
    id: 'rerelease',
    label: 'Rerelease',
  });
  assert.deepEqual(comingSoonKindChip({ presentation: { kind: 'event' } }), {
    id: 'event',
    label: 'Special Event',
  });
  assert.deepEqual(
    comingSoonKindChip({ presentation: { kind: 'mystery_screening' } }),
    { id: 'mystery_screening', label: 'Mystery Screening' },
  );
});

test('All / Confirmed filtering removes empty month sections', () => {
  const artifact = fixtureArtifact([
    entry({
      title: 'Local A',
      date: '2026-09-16',
      classification: 'confirmed_local',
      theaters: [{ theater_id: 'siff-uptown', name: 'SIFF Uptown' }],
    }),
    entry({
      title: 'National B',
      date: '2026-09-24',
      classification: 'amc_announced',
    }),
  ]);
  const all = composeComingSoonPage(artifact, { local: 'all', kinds: [] });
  assert.equal(all.sections.length, 1);
  assert.equal(all.sections[0].subgroups[0].entries.length, 2);
  const confirmed = composeComingSoonPage(artifact, {
    local: 'confirmed',
    kinds: [],
  });
  assert.equal(confirmed.sections.length, 1);
  assert.equal(confirmed.sections[0].subgroups[0].entries.length, 1);
  assert.equal(confirmed.sections[0].subgroups[0].entries[0].title, 'Local A');
  assert.equal(confirmed.activeFilterCount, 1);

  const eventsOnly = composeComingSoonPage(
    fixtureArtifact([
      entry({
        title: 'Q&A',
        date: '2026-09-16',
        kind: 'event',
      }),
      entry({
        title: 'Movie',
        date: '2026-09-24',
        kind: 'film',
      }),
    ]),
    { local: 'all', kinds: ['events'] },
  );
  assert.equal(eventsOnly.sections.length, 1);
  assert.equal(eventsOnly.sections[0].subgroups[0].entries[0].title, 'Q&A');
});

test('confirmed film_id opens Film Detail; inferred tmdb_id does not', () => {
  const confirmed = entry({
    title: 'Canonical',
    date: '2026-09-18',
    classification: 'confirmed_local',
    filmId: 'tmdb:299534',
    filmIdConfirmed: true,
    tmdbId: 299534,
    showtimeKeys: ['avengers-endgame-encore'],
  });
  const inferred = entry({
    title: 'Inferred',
    date: '2026-09-18',
    tmdbId: 1486426,
    tmdbInferred: true,
    filmId: null,
    filmIdConfirmed: false,
  });
  const amcOnly = entry({
    title: 'AMC Only',
    date: '2026-09-18',
    filmId: null,
    tmdbId: null,
  });

  assert.equal(canOpenCanonicalFilmDetail(confirmed), true);
  assert.deepEqual(selectComingSoonOpenTarget(confirmed), {
    type: 'film-detail',
    filmKey: 'avengers-endgame-encore',
    filmId: 'tmdb:299534',
  });

  assert.equal(canOpenCanonicalFilmDetail(inferred), false);
  assert.deepEqual(selectComingSoonOpenTarget(inferred), {
    type: 'coming-soon-detail',
    entryId: 'inferred',
  });
  assert.equal(selectComingSoonOpenTarget(inferred).filmId, undefined);

  assert.deepEqual(selectComingSoonOpenTarget(amcOnly), {
    type: 'coming-soon-detail',
    entryId: 'amc-only',
  });
});

test('Coming Soon detail has no canonical-film actions', () => {
  const detail = composeComingSoonDetail(
    fixtureArtifact([
      entry({
        title: 'Upcoming',
        date: '2026-10-02',
        overview: 'A plot.',
      }),
    ]),
    'upcoming',
  );
  assert.equal(detail.found, true);
  assert.equal(detail.overview, 'A plot.');
  assert.equal(detail.localStatusLabel, 'Showtimes not announced yet');
  assert.equal(DETAIL_SRC.includes('onToggleSave'), false);
  assert.equal(DETAIL_SRC.includes('onToggleSeen'), false);
  assert.equal(DETAIL_SRC.includes('Not Interested'), false);
  assert.equal(DETAIL_SRC.includes('Add to Planner'), false);
  assert.equal(DETAIL_SRC.includes('ticketUrl'), false);
  assert.equal(DETAIL_SRC.includes('openFilmDetail'), false);
  assert.match(DETAIL_SRC, /data-coming-soon-surface="detail"/);
});

test('Coming Soon → detail → Back restores Coming Soon with Explore active', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.comingSoon,
    originPrimary: 'explore',
    exploreRestore: { scrollY: 120 },
  });
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, 'coming-soon');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Explore');

  nav = openComingSoonDetail(nav, {
    entryId: 'national-title',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface?.type, 'coming-soon-detail');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Coming Soon');

  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, 'coming-soon');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
});

test('confirmed Film Detail back returns to Coming Soon', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.comingSoon,
    originPrimary: 'explore',
  });
  const comingSoonSurface = nav.surface;
  nav = openFilmDetail(nav, {
    filmKey: 'avengers-endgame-encore',
    filmId: 'tmdb:299534',
    originPrimary: 'explore',
    returnSurface: comingSoonSurface,
  });
  assert.equal(nav.surface?.type, 'film-detail');
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(
    resolveFilmDetailBackLabel('explore', comingSoonSurface),
    'Coming Soon',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, 'coming-soon');
});

test('public artifact stays renderable across Recommended and All releases', () => {
  const artifact = liveArtifact();
  assert.equal(artifact.schema_version, '1.4.0');
  const hidden = artifact.entries.filter(
    (row) =>
      row.classification === 'tmdb_only' || row.user_visible === false,
  );
  assert.equal(hidden.length, 0);
  assert.ok(artifact.entries.every((row) => typeof row.in_recommended === 'boolean'));
  const recommendedEntries = artifact.entries.filter((row) => row.in_recommended);
  const allOnly = artifact.entries.filter((row) => !row.in_recommended);
  assert.ok(recommendedEntries.length > 0);
  assert.ok(allOnly.length > 0);
  assert.ok(
    allOnly.every((row) => row.relevance_tier === 'weak_national_only'),
  );

  const page = composeComingSoonPage(artifact);
  assert.equal(page.scope, COMING_SOON_SCOPE.recommended);
  assert.ok(page.visibleCount > 0);
  assert.equal(page.visibleCount, recommendedEntries.length);
  assert.ok(page.sections.every((section) => section.type === 'month'));
  assert.ok(
    page.sections.every((section) =>
      section.subgroups.every((subgroup) => subgroup.entries.length > 0),
    ),
  );

  const allPage = composeComingSoonPage(artifact, {
    ...DEFAULT_COMING_SOON_FILTERS,
    scope: COMING_SOON_SCOPE.all,
  });
  assert.equal(allPage.visibleCount, artifact.entries.length);
  assert.ok(allPage.visibleCount > page.visibleCount);

  const inferred = artifact.entries.filter(
    (row) => row.identity?.tmdb_id_inferred && !row.identity?.film_id_confirmed,
  );
  assert.ok(inferred.length > 0);
  for (const row of inferred) {
    const target = selectComingSoonOpenTarget(row);
    assert.equal(target.type, 'coming-soon-detail');
  }
  const confirmed = artifact.entries.filter((row) =>
    canOpenCanonicalFilmDetail(row),
  );
  for (const row of confirmed) {
    assert.equal(selectComingSoonOpenTarget(row).type, 'film-detail');
    assert.equal(selectComingSoonOpenTarget(row).filmId, row.film_id);
  }
  const filtered = composeComingSoonPage(artifact, {
    local: 'confirmed',
    kinds: [],
  });
  assert.ok(filtered.visibleCount < page.visibleCount);
  assert.ok(
    filtered.sections.every((section) =>
      section.subgroups.every((subgroup) =>
        subgroup.entries.every((row) => row.classification === 'confirmed_local'),
      ),
    ),
  );
});

test('theater formatter and sort helpers stay stable', () => {
  assert.equal(formatComingSoonTheaterLine([]), null);
  assert.equal(
    formatComingSoonTheaterLine([{ name: 'SIFF Uptown' }]),
    'SIFF Uptown',
  );
  assert.equal(
    formatComingSoonTheaterLine([
      { name: 'SIFF Uptown' },
      { name: 'AMC Pacific Place' },
    ]),
    'SIFF Uptown + 1 more',
  );
  const sorted = [
    entry({ title: 'B', date: '2026-09-16', classification: 'amc_announced' }),
    entry({ title: 'A', date: '2026-09-16', classification: 'confirmed_local' }),
  ].sort(compareComingSoonEntries);
  assert.equal(sorted[0].title, 'A');
  assert.equal(comingSoonActiveFilterCount({ local: 'confirmed', kinds: ['events'] }), 2);
  assert.equal(
    comingSoonEntryMatchesFilters(
      entry({ title: 'X', date: '2026-09-16', kind: 'film' }),
      { local: 'all', kinds: ['events'] },
    ),
    false,
  );
});
