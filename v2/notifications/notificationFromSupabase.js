/**
 * Map Supabase user_notifications rows → NotificationItem presentation model.
 */

import { NOTIFICATION_TYPES } from './notificationModel.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * @param {unknown} row
 * @returns {import('./notificationModel.js').NotificationItem | null}
 */
export function notificationItemFromSupabaseRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = asTrimmedString(/** @type {any} */ (row).id);
  if (!id) return null;

  const type =
    asTrimmedString(/** @type {any} */ (row).type) ||
    NOTIFICATION_TYPES.showtimesAvailable;
  const filmKey = asTrimmedString(/** @type {any} */ (row).film_key);
  const filmId = asTrimmedString(/** @type {any} */ (row).film_id);
  const title = asTrimmedString(/** @type {any} */ (row).title_snapshot);
  const body = asTrimmedString(/** @type {any} */ (row).body_snapshot);
  const posterUrl = asTrimmedString(
    /** @type {any} */ (row).poster_url_snapshot,
  );
  const createdAt =
    asTrimmedString(/** @type {any} */ (row).created_at) ||
    new Date(0).toISOString();
  const readAt = asTrimmedString(/** @type {any} */ (row).read_at);

  const event =
    /** @type {any} */ (row).event_snapshot &&
    typeof /** @type {any} */ (row).event_snapshot === 'object'
      ? /** @type {any} */ (row).event_snapshot
      : {};

  const theaterName = asTrimmedString(event.theaterName);
  const dateLabel =
    asTrimmedString(event.dateLabel) ||
    asTrimmedString(event.localDate);
  const timeLabel = asTrimmedString(event.timeLabel);
  const opportunityKey = asTrimmedString(event.opportunityKey);

  const headline =
    type === NOTIFICATION_TYPES.showtimesAvailable
      ? `${title || 'A saved film'} has showtimes`
      : title || 'Notification';

  const unread = !readAt;

  return {
    id,
    type,
    filmId,
    filmKey,
    headline,
    body,
    posterUrl,
    createdAt,
    readAt,
    actionLabel: unread ? 'View showtimes' : null,
    snapshot: {
      theaterName,
      dateLabel,
      timeLabel,
      opportunityKey,
    },
  };
}

/**
 * @param {unknown[]} rows
 * @returns {import('./notificationModel.js').NotificationItem[]}
 */
export function notificationItemsFromSupabaseRows(rows) {
  if (!Array.isArray(rows)) return [];
  /** @type {import('./notificationModel.js').NotificationItem[]} */
  const items = [];
  for (const row of rows) {
    const item = notificationItemFromSupabaseRow(row);
    if (item) items.push(item);
  }
  return items;
}
