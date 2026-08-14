/**
 * Notifications MOCKUP / QC FIXTURE — visual QA only.
 *
 * Activated only via query params (`qcNotifications` / related header QC).
 * Never written to localStorage or Supabase. Production source is always empty.
 */

import { NOTIFICATION_TYPES } from '../notifications/notificationModel.js';

function poster(label, from = '#2a2140', to = '#0f0c14') {
  const safe = String(label).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="${from}"/><stop offset="100%" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <text x="20" y="560" fill="#f5f5f7" font-family="Georgia, serif" font-size="20">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** @type {import('../notifications/notificationModel.js').NotificationItem} */
const DUNE_UNREAD = Object.freeze({
  id: 'fixture-dune-showtimes',
  type: NOTIFICATION_TYPES.showtimesAvailable,
  filmId: 'tmdb:693134',
  filmKey: 'tmdb:693134',
  headline: 'Dune: Part Three has showtimes',
  body: 'You saved this film before showtimes were announced.',
  posterUrl: poster('Dune', '#3a2a12', '#120c08'),
  createdAt: '2026-08-12T18:00:00.000Z',
  readAt: null,
  actionLabel: 'View showtimes',
  snapshot: Object.freeze({
    theaterName: 'SIFF Downtown',
    dateLabel: 'Dec 17',
    timeLabel: 'First showing 7:00 PM',
    opportunityKey: null,
  }),
});

/** @type {import('../notifications/notificationModel.js').NotificationItem} */
const ODYSSEY_READ = Object.freeze({
  id: 'fixture-2001-showtimes',
  type: NOTIFICATION_TYPES.showtimesAvailable,
  filmId: 'tmdb:62',
  filmKey: 'tmdb:62',
  headline: '2001: A Space Odyssey has showtimes',
  body: 'Showtimes were added for a film you saved.',
  posterUrl: poster('2001', '#1a2438', '#080c12'),
  createdAt: '2026-08-06T16:00:00.000Z',
  readAt: '2026-08-06T17:00:00.000Z',
  actionLabel: null,
  snapshot: Object.freeze({
    theaterName: 'SIFF Uptown',
    dateLabel: 'Aug 6',
    timeLabel: null,
    opportunityKey: null,
  }),
});

/** @type {import('../notifications/notificationModel.js').NotificationItem} */
const PARASITE_READ = Object.freeze({
  id: 'fixture-parasite-showtimes',
  type: NOTIFICATION_TYPES.showtimesAvailable,
  filmId: 'tmdb:496243',
  filmKey: 'tmdb:496243',
  headline: 'Parasite has showtimes',
  body: 'Showtimes were added for a film you saved.',
  posterUrl: poster('Parasite', '#2a1218', '#0c080a'),
  createdAt: '2026-07-28T15:00:00.000Z',
  readAt: '2026-07-28T16:00:00.000Z',
  actionLabel: null,
  snapshot: Object.freeze({
    theaterName: 'AMC Southcenter 16',
    dateLabel: 'Jul 28',
    timeLabel: null,
    opportunityKey: null,
  }),
});

export const NOTIFICATIONS_FIXTURE_SOURCE = 'notifications-mockup-fixture';

/**
 * @param {'unread' | 'all-read' | 'empty'} mode
 * @returns {import('../notifications/notificationModel.js').NotificationItem[]}
 */
export function getNotificationsFixtureItems(mode) {
  if (mode === 'empty') return [];
  if (mode === 'all-read') {
    return [
      { ...DUNE_UNREAD, readAt: '2026-08-12T19:00:00.000Z', actionLabel: null },
      { ...ODYSSEY_READ },
      { ...PARASITE_READ },
    ];
  }
  // unread mixed
  return [{ ...DUNE_UNREAD }, { ...ODYSSEY_READ }, { ...PARASITE_READ }];
}

/**
 * @param {unknown} raw
 * @returns {'unread' | 'all-read' | 'empty' | null}
 */
export function parseQcNotificationsMode(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'unread' || value === 'mixed' || value === 'open') {
    return 'unread';
  }
  if (
    value === 'all-read' ||
    value === 'all_read' ||
    value === 'read' ||
    value === 'history'
  ) {
    return 'all-read';
  }
  if (value === 'empty' || value === 'none') {
    return 'empty';
  }
  return null;
}

/**
 * @param {Location | { search?: string } | null | undefined} locationLike
 * @returns {'unread' | 'all-read' | 'empty' | null}
 */
export function readQcNotificationsModeFromLocation(
  locationLike = typeof window !== 'undefined' ? window.location : null,
) {
  if (!locationLike || typeof locationLike.search !== 'string') return null;
  try {
    const params = new URLSearchParams(locationLike.search);
    return (
      parseQcNotificationsMode(params.get('qcNotifications')) ??
      parseQcNotificationsMode(params.get('qcNotificationsSheet'))
    );
  } catch {
    return null;
  }
}

/**
 * Resolve which fixture (if any) feeds the notification list.
 * Production → empty. QC header unread also loads mixed fixture so the
 * unread bell indicator has a real source of truth.
 *
 * @param {{
 *   qcNotifications?: 'unread' | 'all-read' | 'empty' | null,
 *   qcHeaderNotifications?: 'logged-out' | 'read' | 'unread' | null,
 * }} [input]
 * @returns {{
 *   source: 'production' | 'fixture',
 *   mode: 'production' | 'unread' | 'all-read' | 'empty',
 *   items: import('../notifications/notificationModel.js').NotificationItem[],
 * }}
 */
export function resolveNotificationsDataSource(input = {}) {
  const sheet = input.qcNotifications ?? null;
  const header = input.qcHeaderNotifications ?? null;

  if (header === 'logged-out') {
    return { source: 'production', mode: 'production', items: [] };
  }
  if (sheet === 'empty') {
    return {
      source: 'fixture',
      mode: 'empty',
      items: getNotificationsFixtureItems('empty'),
    };
  }
  if (sheet === 'all-read' || (header === 'read' && !sheet)) {
    return {
      source: 'fixture',
      mode: 'all-read',
      items: getNotificationsFixtureItems('all-read'),
    };
  }
  if (sheet === 'unread' || header === 'unread') {
    return {
      source: 'fixture',
      mode: 'unread',
      items: getNotificationsFixtureItems('unread'),
    };
  }
  return { source: 'production', mode: 'production', items: [] };
}
