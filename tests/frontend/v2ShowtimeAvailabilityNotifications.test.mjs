import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  hasQualifyingFutureShowtimes,
  pickEarliestQualifyingOpportunity,
} from '../../v2/showtimes/qualifyingShowtimes.js';
import {
  buildShowtimesAvailableOccurrenceKey,
  detectShowtimeAvailabilityNotifications,
  reconcileShowtimeWatch,
} from '../../v2/notifications/detectShowtimeAvailability.js';
import {
  notificationItemFromSupabaseRow,
  notificationItemsFromSupabaseRows,
} from '../../v2/notifications/notificationFromSupabase.js';
import {
  countUnreadNotifications,
  isNotificationUnread,
} from '../../v2/notifications/notificationModel.js';
import { resolveNotificationsDataSource } from '../../v2/fixtures/notificationsMockupFixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const MINI = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/frontend/v2_showtimes_home_mini.json'),
    'utf8',
  ),
);

const homeData = buildHomeData({
  showtimesCurrent: MINI,
  theatersRegistry: { theaters: MINI.theaters },
  newlyAddedArtifact: { entries: [] },
});

/** Fixed "now" before all mini showtimes (2026-06-26 evening PT-ish). */
const NOW = new Date('2026-06-26T20:00:00-07:00');

test('hasQualifyingFutureShowtimes matches earliest pick for catalog film', () => {
  assert.equal(hasQualifyingFutureShowtimes(homeData, 'sinners', NOW), true);
  const earliest = pickEarliestQualifyingOpportunity(homeData, 'sinners', NOW);
  assert.equal(earliest?.localDate, '2026-06-28');
  assert.equal(earliest?.localTime, '00:15');
});

test('already-started today showtimes are not qualifying', () => {
  const late = new Date('2026-06-28T23:00:00-07:00');
  // After 00:15 and 19:30 on 6/28; remaining sinners row is 6/29 14:00.
  assert.equal(hasQualifyingFutureShowtimes(homeData, 'sinners', late), true);
  const earliest = pickEarliestQualifyingOpportunity(homeData, 'sinners', late);
  assert.equal(earliest?.localDate, '2026-06-29');
});

test('zero → available creates notification; rerun does not', () => {
  const prefs = [
    {
      user_id: 'user-a',
      film_key: 'tmdb:1133620',
      film_id: 'tmdb:1133620',
      showtime_film_key: 'sinners',
      is_active: true,
      title_snapshot: 'Sinners',
      poster_url_snapshot: null,
    },
  ];
  const resolveHomeFilm = () =>
    homeData.films.find((f) => f.filmKey === 'sinners') ?? null;

  const first = detectShowtimeAvailabilityNotifications({
    homeData: { ...homeData, opportunities: [] },
    savedPreferences: prefs,
    watches: [],
    resolveHomeFilm,
    now: NOW,
    newEpisodeId: () => 'episode-1',
  });
  assert.equal(first.notificationInserts.length, 0);
  assert.equal(first.watchUpserts[0].enrolled_unavailable, true);

  const second = detectShowtimeAvailabilityNotifications({
    homeData,
    savedPreferences: prefs,
    watches: first.watchUpserts,
    resolveHomeFilm,
    now: NOW,
    newEpisodeId: () => 'episode-should-not-use',
  });
  assert.equal(second.notificationInserts.length, 1);
  assert.equal(
    second.notificationInserts[0].occurrence_key,
    buildShowtimesAvailableOccurrenceKey('user-a', 'tmdb:1133620', 'episode-1'),
  );
  assert.match(second.notificationInserts[0].title_snapshot, /Sinners/);

  const third = detectShowtimeAvailabilityNotifications({
    homeData,
    savedPreferences: prefs,
    watches: second.watchUpserts,
    resolveHomeFilm,
    now: NOW,
    newEpisodeId: () => 'episode-x',
  });
  assert.equal(third.notificationInserts.length, 0);
  assert.equal(third.counts.skippedAlreadyNotified, 1);
});

test('saved after already available does not notify', () => {
  const prefs = [
    {
      user_id: 'user-b',
      film_key: 'tmdb:1133620',
      film_id: 'tmdb:1133620',
      showtime_film_key: 'sinners',
      is_active: true,
      title_snapshot: 'Sinners',
    },
  ];
  const resolveHomeFilm = () =>
    homeData.films.find((f) => f.filmKey === 'sinners') ?? null;
  const result = detectShowtimeAvailabilityNotifications({
    homeData,
    savedPreferences: prefs,
    watches: [],
    resolveHomeFilm,
    now: NOW,
    newEpisodeId: () => 'ep-avail',
  });
  assert.equal(result.notificationInserts.length, 0);
  assert.equal(result.watchUpserts[0].enrolled_unavailable, false);
  assert.equal(result.counts.skippedBaselineAvailable, 1);
});

test('unsaved watch does not create notification', () => {
  const result = reconcileShowtimeWatch({
    userId: 'user-c',
    filmKey: 'tmdb:1',
    isSavedActive: false,
    available: true,
    existingWatch: {
      is_active: true,
      enrolled_unavailable: true,
      episode_id: 'ep',
      notified_at: null,
    },
  });
  assert.equal(result.shouldNotify, false);
  assert.equal(result.watch?.is_active, false);
  assert.equal(result.skipReason, 'unsaved');
});

test('temporary disappearance does not re-enroll baseline-available watch', () => {
  const result = reconcileShowtimeWatch({
    userId: 'user-d',
    filmKey: 'tmdb:1',
    isSavedActive: true,
    available: false,
    existingWatch: {
      is_active: true,
      enrolled_unavailable: false,
      episode_id: 'ep',
      notified_at: null,
    },
  });
  assert.equal(result.shouldNotify, false);
  assert.equal(result.watch?.enrolled_unavailable, false);
});

test('re-save while unavailable starts a new eligible episode', () => {
  const result = reconcileShowtimeWatch({
    userId: 'user-e',
    filmKey: 'tmdb:1',
    isSavedActive: true,
    available: false,
    existingWatch: {
      is_active: false,
      enrolled_unavailable: true,
      episode_id: 'old-ep',
      notified_at: '2026-01-01T00:00:00.000Z',
    },
    newEpisodeId: () => 'new-ep',
  });
  assert.equal(result.shouldNotify, false);
  assert.equal(result.watch?.episode_id, 'new-ep');
  assert.equal(result.watch?.enrolled_unavailable, true);
  assert.equal(result.watch?.notified_at, null);
});

test('multiple users same film each get one notification', () => {
  const prefs = ['u1', 'u2'].map((user_id) => ({
    user_id,
    film_key: 'tmdb:1133620',
    film_id: 'tmdb:1133620',
    showtime_film_key: 'sinners',
    is_active: true,
    title_snapshot: 'Sinners',
  }));
  const watches = prefs.map((p) => ({
    user_id: p.user_id,
    film_key: p.film_key,
    film_id: p.film_id,
    showtime_film_key: p.showtime_film_key,
    is_active: true,
    enrolled_unavailable: true,
    episode_id: `ep-${p.user_id}`,
    notified_at: null,
  }));
  const resolveHomeFilm = () =>
    homeData.films.find((f) => f.filmKey === 'sinners') ?? null;
  const result = detectShowtimeAvailabilityNotifications({
    homeData,
    savedPreferences: prefs,
    watches,
    resolveHomeFilm,
    now: NOW,
  });
  assert.equal(result.notificationInserts.length, 2);
  const keys = new Set(result.notificationInserts.map((n) => n.occurrence_key));
  assert.equal(keys.size, 2);
});

test('Supabase row maps to NotificationItem presentation model', () => {
  const item = notificationItemFromSupabaseRow({
    id: '11111111-1111-1111-1111-111111111111',
    type: 'SHOWTIMES_AVAILABLE',
    film_key: 'tmdb:1133620',
    film_id: 'tmdb:1133620',
    title_snapshot: 'Sinners',
    body_snapshot: 'You saved this film before showtimes were announced.',
    poster_url_snapshot: null,
    created_at: '2026-06-26T12:00:00.000Z',
    read_at: null,
    event_snapshot: {
      theaterName: 'AMC Pacific Place 11',
      dateLabel: 'Jun 28',
      timeLabel: 'First showing 12:15 AM',
      opportunityKey: 'opp-1',
    },
  });
  assert.ok(item);
  assert.equal(item.headline, 'Sinners has showtimes');
  assert.equal(isNotificationUnread(item), true);
  assert.equal(item.snapshot.theaterName, 'AMC Pacific Place 11');
  assert.equal(item.actionLabel, 'View showtimes');
});

test('production source uses productionItems; QC cannot leak without params', () => {
  const cloud = notificationItemsFromSupabaseRows([
    {
      id: 'n1',
      type: 'SHOWTIMES_AVAILABLE',
      film_key: 'tmdb:1',
      film_id: 'tmdb:1',
      title_snapshot: 'Cloud Film',
      body_snapshot: 'body',
      created_at: '2026-06-26T12:00:00.000Z',
      read_at: null,
      event_snapshot: {},
    },
  ]);
  const prod = resolveNotificationsDataSource({ productionItems: cloud });
  assert.equal(prod.source, 'production');
  assert.equal(prod.items.length, 1);
  assert.equal(countUnreadNotifications(prod.items), 1);

  const emptyProd = resolveNotificationsDataSource({});
  assert.deepEqual(emptyProd.items, []);

  const qc = resolveNotificationsDataSource({
    qcNotifications: 'unread',
    productionItems: cloud,
  });
  assert.equal(qc.source, 'fixture');
  assert.match(qc.items[0].headline, /Dune/);
});

test('migration SQL enables RLS and blocks client inserts', () => {
  const sql = readFileSync(
    join(
      ROOT,
      'supabase/migrations/20260814000000_user_notifications_showtime_watches.sql',
    ),
    'utf8',
  );
  assert.match(sql, /enable row level security/);
  assert.match(sql, /user_notifications_select_own/);
  assert.match(sql, /user_notifications_update_own/);
  assert.match(sql, /occurrence_key/);
  assert.doesNotMatch(sql, /user_notifications_insert_own/);
  assert.match(sql, /revoke all on table public\.user_film_showtime_watches from authenticated/);
  assert.match(sql, /immutable fields cannot be changed/);
});

test('V2App wires Supabase notification fetch and mark-read persistence', () => {
  const app = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
  assert.match(app, /fetchUserNotifications/);
  assert.match(app, /markUserNotificationRead/);
  assert.match(app, /markAllUserNotificationsRead/);
  assert.match(app, /productionItems:\s*auth\?\.signedIn \? cloudNotifications/);
  assert.match(app, /window\.addEventListener\('focus'/);
});

test('detector Dune availability fixture is valid qualifying future showtime', () => {
  const fixture = JSON.parse(
    readFileSync(
      join(
        ROOT,
        'tests/fixtures/detector/showtimes_dune_part_three_available.json',
      ),
      'utf8',
    ),
  );
  const home = buildHomeData({
    showtimesCurrent: fixture,
    theatersRegistry: { theaters: fixture.theaters },
    newlyAddedArtifact: { entries: [] },
  });
  const film = home.films.find((f) => f.filmId === 'tmdb:1170608');
  assert.ok(film);
  assert.equal(film.title, 'Dune: Part Three');
  const frozen = new Date('2026-08-14T12:00:00-07:00');
  assert.equal(hasQualifyingFutureShowtimes(home, film.filmKey, frozen), true);
  const earliest = pickEarliestQualifyingOpportunity(home, film.filmKey, frozen);
  assert.equal(earliest?.localDate, '2026-12-17');
  assert.equal(earliest?.localTime, '19:00');
  assert.match(String(earliest?.theaterName ?? ''), /SIFF/);
});
