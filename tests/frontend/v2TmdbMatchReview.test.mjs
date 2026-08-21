import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openAdminTmdbReview,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  REVIEW_DECISIONS,
  REVIEW_TABS,
  normalizeReviewDecision,
  tabForIdentity,
} from '../../v2/admin/tmdbReview/reviewDecisions.js';
import {
  buildMatcherContextFromCatalogFilm,
  buildReviewDecisionSnapshot,
  inferSelectionMethod,
  REVIEW_SNAPSHOT_VERSION,
  SELECTION_METHODS,
} from '../../v2/admin/tmdbReview/reviewSnapshot.js';
import {
  buildTmdbReviewQueue,
  filterReviewIdentities,
  listReviewSources,
  nextReviewKeyAfterSave,
} from '../../v2/admin/tmdbReview/reviewQueueModel.js';
import {
  fetchFilmIdentityReviews,
  saveFilmIdentityReview,
} from '../../v2/admin/tmdbReview/reviewSync.js';
import {
  parseSourceIdentityKey,
  profileIsAdmin,
  sourceIdentityKey,
} from '../../v2/admin/tmdbReview/sourceIdentity.js';
import { fetchTmdbSearchResults } from '../../v2/search/tmdbSearchClient.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = readFileSync(
  join(
    ROOT,
    'supabase/migrations/20260818000000_admin_film_identity_reviews.sql',
  ),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const SURFACE_SRC = readFileSync(
  join(ROOT, 'v2/admin/tmdbReview/TmdbMatchReviewSurface.jsx'),
  'utf8',
);
const PROFILE_SRC = readFileSync(
  join(ROOT, 'v2/profile/ProfileDestination.jsx'),
  'utf8',
);
const PLACEHOLDER_SRC = readFileSync(
  join(ROOT, 'v2/DestinationPlaceholder.jsx'),
  'utf8',
);
const NAV_SRC = readFileSync(join(ROOT, 'v2/PrimaryNav.jsx'), 'utf8');
const SYNC_SRC = readFileSync(
  join(ROOT, 'v2/admin/tmdbReview/reviewSync.js'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function sampleHome() {
  const films = [
    {
      filmKey: 'seattle-shorts',
      filmId: null,
      title: 'Seattle Shorts: Love & Loss',
      sourceTitle: 'Seattle Shorts: Love & Loss',
      runtimeMin: 103,
    },
    {
      filmKey: 'sinners',
      filmId: 'tmdb:12321',
      title: 'Sinners',
      sourceTitle: 'Sinners',
      runtimeMin: 137,
    },
    {
      filmKey: 'music-night',
      filmId: null,
      title: 'SIFF Music Night',
      sourceTitle: 'SIFF Music Night',
      runtimeMin: null,
    },
  ];
  return {
    // Production homeData shape from buildHomeData: films array, not filmsByKey.
    films,
    theatersById: {
      'siff-center': { name: 'SIFF Film Center' },
      nwff: { name: 'Northwest Film Forum' },
      amc: { name: 'AMC Pacific Place' },
    },
    opportunities: [
      {
        source: 'siff',
        sourceFilmId: 'shorts-love',
        filmKey: 'seattle-shorts',
        theaterId: 'siff-center',
        theaterName: 'SIFF Film Center',
        localDate: '2026-08-18',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-08-18T19:00',
        sourceUrl: 'https://example.test/siff/shorts',
      },
      {
        source: 'siff',
        sourceFilmId: 'shorts-love',
        filmKey: 'seattle-shorts',
        theaterId: 'nwff',
        theaterName: 'Northwest Film Forum',
        localDate: '2026-08-19',
        timeDisplay: '6:30 PM',
        sortableLocalDateTime: '2026-08-19T18:30',
      },
      {
        source: 'amc',
        sourceFilmId: '72474',
        filmKey: 'sinners',
        theaterId: 'amc',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-08-18',
        timeDisplay: '8:15 PM',
        sortableLocalDateTime: '2026-08-18T20:15',
      },
      {
        source: 'siff',
        sourceFilmId: 'music-1',
        filmKey: 'music-night',
        theaterId: 'siff-center',
        theaterName: 'SIFF Film Center',
        localDate: '2026-08-20',
        timeDisplay: '9:00 PM',
        sortableLocalDateTime: '2026-08-20T21:00',
      },
    ],
  };
}

function createReviewClient({
  sessionUser = null,
  selectError = null,
  upsertError = null,
  rows = [],
  onUpsert,
} = {}) {
  return {
    auth: {
      getSession: async () => ({
        data: { session: sessionUser ? { user: sessionUser } : null },
        error: null,
      }),
    },
    from(table) {
      assert.equal(table, 'film_identity_reviews');
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order: async () => ({ data: rows, error: selectError }),
        upsert(row, opts) {
          onUpsert?.(row, opts);
          return {
            select() {
              return {
                maybeSingle: async () => ({
                  data: upsertError ? null : { id: 'rev-1', ...row },
                  error: upsertError,
                }),
              };
            },
          };
        },
      };
    },
  };
}

test('source identity key prefers source film id then showtime key', () => {
  assert.equal(
    sourceIdentityKey({ source: 'siff', sourceFilmId: 'shorts-love' }),
    'siff|id|shorts-love',
  );
  assert.equal(
    sourceIdentityKey({ source: 'siff', showtimeFilmKey: 'seattle-shorts' }),
    'siff|key|seattle-shorts',
  );
  assert.equal(sourceIdentityKey({ source: 'siff' }), null);
  assert.deepEqual(parseSourceIdentityKey('siff|id|shorts-love'), {
    source: 'siff',
    sourceFilmId: 'shorts-love',
    showtimeFilmKey: null,
  });
});

test('admin flag is server-backed is_admin, not an email check', () => {
  assert.equal(profileIsAdmin({ is_admin: true, email: 'other@example.com' }), true);
  assert.equal(
    profileIsAdmin({ is_admin: false, email: 'mattheus@example.com' }),
    false,
  );
  assert.equal(profileIsAdmin(null), false);
  assert.equal(SURFACE_SRC.includes("email ==="), false);
  assert.equal(SYNC_SRC.includes('mattheus@'), false);
  assert.match(SYNC_SRC, /auth\.getSession/);
  assert.match(SYNC_SRC, /reviewed_by: user\.id/);
});

test('admin route is gated out of primary nav and opens from Profile', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((item) => item.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  assert.equal(NAV_SRC.includes('TMDB Match Review'), false);
  assert.equal(NAV_SRC.includes('admin-tmdb-review'), false);

  let nav = selectPrimaryDestination(createInitialNavState(), 'profile');
  nav = openAdminTmdbReview(nav, { originPrimary: 'profile' });
  assert.equal(nav.surface.type, 'admin-tmdb-review');
  assert.equal(nav.primaryDestinationId, 'profile');
  assert.equal(resolveActivePrimaryId(nav), 'profile');
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'profile');

  assert.match(APP_SRC, /isAdminTmdbReview/);
  assert.match(APP_SRC, /TmdbMatchReviewSurface/);
  assert.match(APP_SRC, /params\.get\('admin'\) !== 'tmdb-review'/);
  assert.match(APP_SRC, /isAdminTmdbReview \? null :[\s\S]*PrimaryNav/);
  assert.match(PROFILE_SRC, /profileIsAdmin\(auth\.profile\)/);
  assert.match(PROFILE_SRC, /TMDB Match Review/);
  assert.match(PLACEHOLDER_SRC, /onOpenAdminTmdbReview/);
});

test('non-admin and unsigned-in surfaces fail closed without loading reviews', () => {
  assert.match(SURFACE_SRC, /This admin tool isn’t available for this account/);
  assert.match(SURFACE_SRC, /if \(!isAdmin\) return undefined/);
  assert.match(SURFACE_SRC, /fetchFilmIdentityReviews/);
});

test('unmatched queue rendering uses live counts and source evidence', () => {
  const queue = buildTmdbReviewQueue(sampleHome());
  assert.equal(queue.counts.unmatched, 2);
  assert.equal(queue.counts['review-matched'], 1);
  assert.equal(queue.counts.flagged, 0);
  assert.equal(queue.counts['needs-follow-up'], 0);

  const unmatched = filterReviewIdentities(queue.identities, {
    tab: REVIEW_TABS.unmatched,
  });
  assert.equal(unmatched.length, 2);
  const shorts = unmatched.find((row) => row.displayTitle.includes('Shorts'));
  assert.ok(shorts);
  assert.equal(shorts.sourceIdentityKey, 'siff|id|shorts-love');
  assert.equal(shorts.rawTitle, 'Seattle Shorts: Love & Loss');
  assert.equal(shorts.statusLabel, 'Unmatched');
  assert.deepEqual(shorts.theaters, ['SIFF Film Center', 'Northwest Film Forum']);
  assert.equal(shorts.showtimes.length, 2);
  assert.equal(shorts.sourceUrl, 'https://example.test/siff/shorts');
  assert.equal(shorts.runtimeMin, 103);
  assert.equal(shorts.canonicalFilmId, null);
  assert.equal(shorts.matchOrigin, 'none');

  const matched = filterReviewIdentities(queue.identities, {
    tab: REVIEW_TABS.reviewMatched,
  });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].displayTitle, 'Sinners');
  assert.equal(matched[0].canonicalFilmId, 'tmdb:12321');
  assert.equal(matched[0].matchOrigin, 'pipeline');
});

test('production films[] shape classifies pipeline matches without filmsByKey Map', () => {
  const home = sampleHome();
  assert.equal(home.filmsByKey, undefined);
  assert.ok(Array.isArray(home.films));
  const queue = buildTmdbReviewQueue(home);
  assert.equal(queue.counts['review-matched'], 1);
  assert.equal(
    queue.identities.find((row) => row.sourceIdentityKey === 'amc|id|72474')
      ?.canonicalFilmId,
    'tmdb:12321',
  );
});

test('film_id tmdb ids count as matched and aggregation keeps the first canonical match', () => {
  assert.equal(
    tabForIdentity({ canonicalFilmId: 'tmdb:12345', review: null }),
    REVIEW_TABS.reviewMatched,
  );
  assert.equal(
    tabForIdentity({ canonicalFilmId: null, review: null }),
    REVIEW_TABS.unmatched,
  );
  assert.equal(
    tabForIdentity({
      canonicalFilmId: 'tmdb:9',
      review: { decision: 'not_film' },
    }),
    REVIEW_TABS.flagged,
  );
  assert.equal(
    tabForIdentity({
      canonicalFilmId: 'tmdb:9',
      review: { decision: 'needs_follow_up' },
    }),
    REVIEW_TABS.needsFollowUp,
  );
  assert.equal(
    tabForIdentity({
      canonicalFilmId: null,
      review: { decision: 'matched' },
    }),
    REVIEW_TABS.reviewMatched,
  );
  assert.equal(
    tabForIdentity({
      canonicalFilmId: null,
      review: { decision: 'multiple_shorts' },
    }),
    REVIEW_TABS.flagged,
  );

  const home = {
    films: [
      {
        filmKey: 'coyote',
        filmId: 'tmdb:1204680',
        title: 'Coyote vs. Acme',
        sourceTitle: 'Coyote vs. Acme',
      },
      {
        filmKey: 'orphan-row',
        filmId: null,
        title: 'Should not win',
      },
    ],
    theatersById: { a: { name: 'A' }, b: { name: 'B' } },
    opportunities: [
      {
        source: 'amc',
        sourceFilmId: 'coyote-1',
        filmKey: 'coyote',
        theaterId: 'a',
        sortableLocalDateTime: '2026-08-18T19:00',
      },
      {
        source: 'amc',
        sourceFilmId: 'coyote-1',
        filmKey: 'coyote',
        theaterId: 'b',
        sortableLocalDateTime: '2026-08-19T19:00',
      },
    ],
  };
  const queue = buildTmdbReviewQueue(home);
  const row = queue.identities.find(
    (item) => item.sourceIdentityKey === 'amc|id|coyote-1',
  );
  assert.equal(row.tab, REVIEW_TABS.reviewMatched);
  assert.equal(row.canonicalFilmId, 'tmdb:1204680');
  assert.deepEqual(row.theaters, ['A', 'B']);
});

test('one missing film row does not wipe an otherwise matched identity', () => {
  const home = {
    films: [
      {
        filmKey: 'sinners',
        filmId: 'tmdb:12321',
        title: 'Sinners',
      },
    ],
    theatersById: { amc: { name: 'AMC' } },
    opportunities: [
      {
        source: 'amc',
        sourceFilmId: '72474',
        filmKey: 'missing-key',
        theaterId: 'amc',
        sortableLocalDateTime: '2026-08-18T18:00',
      },
      {
        source: 'amc',
        sourceFilmId: '72474',
        filmKey: 'sinners',
        theaterId: 'amc',
        sortableLocalDateTime: '2026-08-18T20:15',
      },
    ],
  };
  const queue = buildTmdbReviewQueue(home);
  const row = queue.identities.find(
    (item) => item.sourceIdentityKey === 'amc|id|72474',
  );
  assert.equal(row.canonicalFilmId, 'tmdb:12321');
  assert.equal(row.tab, REVIEW_TABS.reviewMatched);
});

test('candidate Use this match does not auto-save and shows selected state', () => {
  assert.match(SURFACE_SRC, /Use this match/);
  assert.match(SURFACE_SRC, /setDraftDecision\(REVIEW_DECISIONS\.matched\)/);
  assert.match(SURFACE_SRC, /v2-admin-review-selected-badge/);
  assert.match(SURFACE_SRC, /year: candidate\.year/);
  assert.equal(SURFACE_SRC.includes('saveFilmIdentityReview({\n            tmdbId: candidate'), false);
  assert.match(SURFACE_SRC, /Save decision/);
  assert.match(SURFACE_SRC, /Replace with selected TMDB title/);
  assert.match(SURFACE_SRC, /Confirm existing match/);
});

test('selecting a queue item is local state and preserves identity key', () => {
  const queue = buildTmdbReviewQueue(sampleHome());
  const unmatched = filterReviewIdentities(queue.identities, {
    tab: REVIEW_TABS.unmatched,
  });
  const selected = unmatched[0];
  assert.ok(selected.sourceIdentityKey);
  assert.match(SURFACE_SRC, /setSelectedKey\(row\.sourceIdentityKey\)/);
  assert.match(SURFACE_SRC, /data-source-identity-key/);
});

test('switching queue tabs uses real counts', () => {
  const reviews = [
    {
      source_identity_key: 'siff|id|shorts-love',
      decision: 'multiple_shorts',
      tmdb_id: null,
    },
    {
      source_identity_key: 'siff|id|music-1',
      decision: 'needs_follow_up',
      tmdb_id: null,
    },
  ];
  const queue = buildTmdbReviewQueue(sampleHome(), reviews);
  assert.equal(queue.counts.unmatched, 0);
  assert.equal(queue.counts['review-matched'], 1);
  assert.equal(queue.counts.flagged, 1);
  assert.equal(queue.counts['needs-follow-up'], 1);
  assert.equal(
    filterReviewIdentities(queue.identities, { tab: REVIEW_TABS.flagged })[0]
      .displayTitle,
    'Seattle Shorts: Love & Loss',
  );
  assert.match(SURFACE_SRC, /setTab\(item\.id\)/);
});

test('text search and source filter narrow the queue', () => {
  const queue = buildTmdbReviewQueue(sampleHome());
  const sources = listReviewSources(queue.identities);
  assert.deepEqual(sources, ['amc', 'siff']);
  const filtered = filterReviewIdentities(queue.identities, {
    tab: REVIEW_TABS.unmatched,
    query: 'music',
    source: 'siff',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].displayTitle, 'SIFF Music Night');
});

test('TMDB candidate search, zero results, and failed search', async () => {
  assert.match(SURFACE_SRC, /fetchTmdbSearchResults/);
  assert.match(SURFACE_SRC, /Search TMDB/);
  assert.match(SURFACE_SRC, /Use this match/);
  assert.match(SURFACE_SRC, /Preview/);
  assert.match(SURFACE_SRC, /searchAttempted/);
  assert.match(SURFACE_SRC, /No TMDB candidates/);
  assert.match(SURFACE_SRC, /TMDB search failed/);

  const empty = await fetchTmdbSearchResults('Unused Title', {
    apiConfig: {
      available: true,
      searchPath: 'https://example.test/tmdb-api',
      usesQueryAction: true,
      headers: {},
    },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ results: [] }),
    }),
  });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.results, []);

  const failed = await fetchTmdbSearchResults('Unused Title', {
    apiConfig: {
      available: true,
      searchPath: 'https://example.test/tmdb-api',
      usesQueryAction: true,
      headers: {},
    },
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }),
  });
  assert.equal(failed.ok, false);
});

test('selecting a candidate and saving a TMDB match', async () => {
  assert.match(SURFACE_SRC, /setDraftDecision\(REVIEW_DECISIONS\.matched\)/);
  assert.match(SURFACE_SRC, /saveFilmIdentityReview/);

  let upserted = null;
  const result = await saveFilmIdentityReview(
    {
      sourceIdentityKey: 'siff|id|shorts-love',
      source: 'siff',
      sourceFilmId: 'shorts-love',
      showtimeFilmKey: 'seattle-shorts',
      decision: 'matched',
      tmdbId: 424242,
      adminNote: 'Source title is wrong; this is the 1997 film',
      snapshot: { raw_title: 'Seattle Shorts: Love & Loss' },
    },
    {
      client: createReviewClient({
        sessionUser: { id: 'admin-1' },
        onUpsert: (row) => {
          upserted = row;
        },
      }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(upserted.decision, 'matched');
  assert.equal(upserted.tmdb_id, 424242);
  assert.equal(upserted.reviewed_by, 'admin-1');
  assert.equal(upserted.active, true);
  assert.equal(upserted.admin_note.includes('1997'), true);
});

test('confirm existing match, not a film, multiple shorts, needs follow-up', async () => {
  assert.match(SURFACE_SRC, /Confirm existing match/);
  assert.match(SURFACE_SRC, /Mark not a film/);
  assert.match(SURFACE_SRC, /Mark as multiple shorts/);
  assert.match(SURFACE_SRC, /Needs follow-up/);
  assert.match(SURFACE_SRC, /Save decision/);

  const client = createReviewClient({ sessionUser: { id: 'admin-1' } });
  const confirm = await saveFilmIdentityReview(
    {
      source: 'amc',
      sourceFilmId: '72474',
      decision: 'confirmed_match',
      tmdbId: 12321,
    },
    { client },
  );
  assert.equal(confirm.ok, true);
  assert.equal(confirm.review.decision, 'matched');

  const notFilm = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'music-1', decision: 'not_film' },
    { client },
  );
  assert.equal(notFilm.review.decision, 'not_film');
  assert.equal(notFilm.review.tmdb_id, null);

  const shorts = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'shorts-love', decision: 'multiple_shorts' },
    { client },
  );
  assert.equal(shorts.review.decision, 'multiple_shorts');

  const follow = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'music-1', decision: 'needs_follow_up' },
    { client },
  );
  assert.equal(follow.review.decision, 'needs_follow_up');
});

test('reviewed item reflects updated state and flagged records stay in queue', () => {
  const home = sampleHome();
  let queue = buildTmdbReviewQueue(home);
  const key = 'siff|id|shorts-love';
  assert.equal(
    tabForIdentity(queue.identities.find((row) => row.sourceIdentityKey === key)),
    REVIEW_TABS.unmatched,
  );

  queue = buildTmdbReviewQueue(home, [
    { source_identity_key: key, decision: 'not_film', tmdb_id: null },
  ]);
  const flagged = queue.identities.find((row) => row.sourceIdentityKey === key);
  assert.equal(flagged.tab, REVIEW_TABS.flagged);
  assert.equal(flagged.statusLabel, 'Not a film');
  assert.equal(queue.identities.some((row) => row.sourceIdentityKey === key), true);

  queue = buildTmdbReviewQueue(home, [
    {
      source_identity_key: key,
      decision: 'multiple_shorts',
      tmdb_id: null,
      snapshot: { display_title: 'Seattle Shorts: Love & Loss' },
    },
  ]);
  assert.equal(
    queue.identities.find((row) => row.sourceIdentityKey === key).tab,
    REVIEW_TABS.flagged,
  );
});

test('manual match overrides auto-match in queue classification', () => {
  const home = sampleHome();
  const auto = buildTmdbReviewQueue(home).identities.find(
    (row) => row.sourceIdentityKey === 'amc|id|72474',
  );
  assert.equal(auto.canonicalFilmId, 'tmdb:12321');
  assert.equal(auto.tab, REVIEW_TABS.reviewMatched);
  assert.equal(auto.matchOrigin, 'pipeline');

  const overridden = buildTmdbReviewQueue(home, [
    {
      source_identity_key: 'amc|id|72474',
      decision: 'matched',
      tmdb_id: 999001,
    },
  ]).identities.find((row) => row.sourceIdentityKey === 'amc|id|72474');
  assert.equal(overridden.matchOrigin, 'manual');
  assert.equal(overridden.review.tmdb_id, 999001);
  assert.equal(overridden.tab, REVIEW_TABS.reviewMatched);

  const paused = buildTmdbReviewQueue(home, [
    {
      source_identity_key: 'amc|id|72474',
      decision: 'needs_follow_up',
      tmdb_id: null,
    },
  ]).identities.find((row) => row.sourceIdentityKey === 'amc|id|72474');
  assert.equal(paused.tab, REVIEW_TABS.needsFollowUp);
  assert.equal(paused.canonicalFilmId, 'tmdb:12321');
});

test('review-only flagged identities are preserved after leaving showtimes', () => {
  const queue = buildTmdbReviewQueue(sampleHome(), [
    {
      source_identity_key: 'nwff|id|gone-program',
      source: 'nwff',
      source_film_id: 'gone-program',
      decision: 'multiple_shorts',
      snapshot: { display_title: 'Local Shorts Night' },
      reviewed_at: '2026-08-01T00:00:00Z',
    },
  ]);
  const preserved = queue.identities.find(
    (row) => row.sourceIdentityKey === 'nwff|id|gone-program',
  );
  assert.ok(preserved);
  assert.equal(preserved.tab, REVIEW_TABS.flagged);
  assert.equal(preserved.displayTitle, 'Local Shorts Night');
  assert.equal(queue.counts.flagged, 1);
});

test('save advances to the next visible item', () => {
  const visible = [
    { sourceIdentityKey: 'a' },
    { sourceIdentityKey: 'b' },
    { sourceIdentityKey: 'c' },
  ];
  assert.equal(nextReviewKeyAfterSave(visible, 'a'), 'b');
  assert.equal(nextReviewKeyAfterSave([{ sourceIdentityKey: 'a' }], 'a'), null);
});

test('unauthenticated and non-admin clients cannot read or write reviews', async () => {
  const signedOutRead = await fetchFilmIdentityReviews({
    client: createReviewClient({ sessionUser: null }),
  });
  assert.equal(signedOutRead.ok, false);
  assert.equal(signedOutRead.reviews.length, 0);
  assert.equal(signedOutRead.error, 'signed_out');

  const signedOutWrite = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'x', decision: 'not_film' },
    { client: createReviewClient({ sessionUser: null }) },
  );
  assert.equal(signedOutWrite.ok, false);
  assert.equal(signedOutWrite.error, 'signed_out');

  const rlsDenied = await fetchFilmIdentityReviews({
    client: createReviewClient({
      sessionUser: { id: 'user-1' },
      selectError: { message: 'permission denied for table film_identity_reviews' },
    }),
  });
  assert.equal(rlsDenied.ok, false);
  assert.equal(rlsDenied.reviews.length, 0);

  const rlsWrite = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'x', decision: 'not_film' },
    {
      client: createReviewClient({
        sessionUser: { id: 'user-1' },
        upsertError: { message: 'new row violates row-level security policy' },
      }),
    },
  );
  assert.equal(rlsWrite.ok, false);

  const missingClient = await fetchFilmIdentityReviews({ client: null });
  assert.equal(missingClient.error, 'supabase_unconfigured');
});

test('admin can read and upsert a review when the session is present', async () => {
  const rows = [
    {
      source_identity_key: 'siff|id|shorts-love',
      decision: 'needs_follow_up',
    },
  ];
  const read = await fetchFilmIdentityReviews({
    client: createReviewClient({
      sessionUser: { id: 'admin-1' },
      rows,
    }),
  });
  assert.equal(read.ok, true);
  assert.equal(read.reviews.length, 1);

  const saved = await saveFilmIdentityReview(
    { source: 'siff', sourceFilmId: 'shorts-love', decision: 'not_film' },
    { client: createReviewClient({ sessionUser: { id: 'admin-1' } }) },
  );
  assert.equal(saved.ok, true);
  assert.equal(saved.review.decision, 'not_film');
});

test('save and search errors surface in the workspace', () => {
  assert.match(SURFACE_SRC, /Choose a decision before saving/);
  assert.match(SURFACE_SRC, /Select a TMDB title before saving a match/);
  assert.match(SURFACE_SRC, /Save failed/);
  assert.match(SURFACE_SRC, /TMDB search failed/);
  assert.equal(normalizeReviewDecision('bogus'), null);
});

test('review snapshot retains selected TMDB telemetry fields', () => {
  const matcherContext = buildMatcherContextFromCatalogFilm({
    match_status: 'review_required',
    match_confidence: 1.0,
    normalized_title: 'Bottoms',
    year_interpretation: {
      base_title: 'Bottoms',
      scoring_year: null,
      event_year_not_canonical: false,
    },
    presentation_labels: [],
    top_candidate_margin: 0.25,
    auto_confirm_blocked_reason: 'same_title_remake_ambiguity',
    candidates: [
      {
        tmdb_id: 814776,
        title: 'Bottoms',
        release_year: 2023,
        runtime_min: 91,
        score: 1.0,
        warnings: [],
        signals: { title_exact: true, runtime_near: true, year_status: 'unavailable' },
      },
      {
        tmdb_id: 999,
        title: 'Bottoms',
        release_year: 2010,
        runtime_min: 80,
        score: 0.75,
        warnings: [],
        signals: { title_exact: true, runtime_near: false, year_status: 'unavailable' },
      },
    ],
  });
  const snapshot = buildReviewDecisionSnapshot({
    identity: {
      rawTitle: 'Bottoms',
      displayTitle: 'Bottoms',
      theaters: ['Beacon'],
      runtimeMin: 92,
      canonicalFilmId: null,
      source: 'beacon',
      sourceFilmId: 'bottoms',
      sourceIdentityKey: 'beacon|id|bottoms',
    },
    decision: REVIEW_DECISIONS.matched,
    selectedTmdb: {
      tmdbId: 814776,
      title: 'Bottoms',
      year: 2023,
      runtimeMin: 91,
      selectionMethod: SELECTION_METHODS.proposedCandidate,
      candidateRank: 1,
    },
    matcherContext,
    reviewedAt: '2026-08-21T00:00:00.000Z',
  });
  assert.equal(snapshot.snapshot_version, REVIEW_SNAPSHOT_VERSION);
  assert.equal(snapshot.search_title, 'Bottoms');
  assert.equal(snapshot.pre_review_match_status, 'review_required');
  assert.equal(snapshot.proposed_tmdb_id, 814776);
  assert.equal(snapshot.match_confidence, 1.0);
  assert.equal(snapshot.top_candidate_margin, 0.25);
  assert.equal(snapshot.auto_confirm_blocked_reason, 'same_title_remake_ambiguity');
  assert.equal(snapshot.candidates.length, 2);
  assert.equal(snapshot.selected_tmdb_id, 814776);
  assert.equal(snapshot.selected_tmdb_title, 'Bottoms');
  assert.equal(snapshot.selected_candidate_rank, 1);
  assert.equal(snapshot.selection_method, SELECTION_METHODS.proposedCandidate);
  assert.equal(snapshot.reviewed_at, '2026-08-21T00:00:00.000Z');
  assert.equal(
    inferSelectionMethod({
      selectedTmdbId: 1204680,
      canonicalFilmId: 'tmdb:1204680',
      fromManualSearch: false,
    }),
    SELECTION_METHODS.confirmExistingCanonical,
  );
  assert.equal(
    inferSelectionMethod({
      selectedTmdbId: 814776,
      proposedTmdbId: 814776,
      fromMatcherCandidate: true,
    }),
    SELECTION_METHODS.proposedCandidate,
  );
  assert.equal(
    inferSelectionMethod({
      selectedTmdbId: 999,
      proposedTmdbId: 814776,
      fromMatcherCandidate: true,
    }),
    SELECTION_METHODS.alternateCandidate,
  );
});

test('matched decision requires a TMDB id', async () => {
  const result = await saveFilmIdentityReview(
    { source: 'amc', sourceFilmId: '1', decision: 'matched' },
    { client: createReviewClient({ sessionUser: { id: 'admin-1' } }) },
  );
  assert.equal(result.ok, false);
  assert.equal(result.error, 'tmdb_id_required');
});

test('migration enforces admin-only RLS and does not grant anon or delete', () => {
  assert.match(MIGRATION, /add column if not exists is_admin boolean not null default false/);
  assert.match(MIGRATION, /jwt_role in \('authenticated', 'anon'\)/);
  assert.match(MIGRATION, /new\.is_admin := false/);
  assert.match(MIGRATION, /new\.is_admin := old\.is_admin/);
  assert.match(MIGRATION, /create table if not exists public\.film_identity_reviews/);
  assert.match(MIGRATION, /enable row level security/);
  assert.match(MIGRATION, /using \(public\.is_admin\(\)\)/);
  assert.match(MIGRATION, /with check \(public\.is_admin\(\)\)/);
  assert.match(MIGRATION, /revoke all on table public\.film_identity_reviews from anon/);
  assert.match(MIGRATION, /revoke all on function public\.is_admin\(\) from anon/);
  assert.match(MIGRATION, /grant select, insert, update on table public\.film_identity_reviews to authenticated/);
  assert.equal(/grant delete on table public\.film_identity_reviews/i.test(MIGRATION), false);
  assert.equal(/for delete/i.test(MIGRATION), false);
  assert.match(MIGRATION, /new\.reviewed_by := auth\.uid\(\)/);
  assert.match(MIGRATION, /decision <> 'matched' and tmdb_id is null/);
  assert.match(
    MIGRATION,
    /decision in \(\s*'matched',\s*'not_film',\s*'multiple_shorts',\s*'needs_follow_up'\s*\)/s,
  );
});

test('admin workspace is dense and not in consumer primary nav', () => {
  assert.match(CSS, /\.v2-admin-review/);
  assert.match(CSS, /\.v2-admin-review-grid/);
  assert.match(SURFACE_SRC, /Source evidence/);
  assert.match(SURFACE_SRC, /TMDB candidates/);
  assert.match(SURFACE_SRC, /Admin note/);
  assert.equal(SURFACE_SRC.includes('TMDB_API_KEY'), false);
  assert.equal(SURFACE_SRC.includes('TMDB_READ_ACCESS_TOKEN'), false);
});
