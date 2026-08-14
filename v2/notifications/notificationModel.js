/**
 * Notification presentation model (UI-facing).
 *
 * Independent of any future Supabase/table shape. Phase 3 can map
 * persisted records into these view models.
 */

export const NOTIFICATION_TYPES = Object.freeze({
  showtimesAvailable: 'SHOWTIMES_AVAILABLE',
});

/**
 * @typedef {{
 *   theaterName?: string | null,
 *   dateLabel?: string | null,
 *   timeLabel?: string | null,
 *   opportunityKey?: string | null,
 * }} NotificationShowtimesSnapshot
 */

/**
 * @typedef {{
 *   id: string,
 *   type: string,
 *   filmId: string | null,
 *   filmKey: string | null,
 *   headline: string,
 *   body: string | null,
 *   posterUrl: string | null,
 *   createdAt: string,
 *   readAt: string | null,
 *   actionLabel: string | null,
 *   snapshot: NotificationShowtimesSnapshot | null,
 * }} NotificationItem
 */

/**
 * @param {NotificationItem | null | undefined} item
 */
export function isNotificationUnread(item) {
  if (!item || typeof item !== 'object') return false;
  return !item.readAt;
}

/**
 * @param {NotificationItem[]} items
 */
export function countUnreadNotifications(items) {
  return (items ?? []).filter(isNotificationUnread).length;
}

/**
 * @param {NotificationItem[]} items
 * @returns {{
 *   unread: NotificationItem[],
 *   read: NotificationItem[],
 *   hasUnread: boolean,
 *   isEmpty: boolean,
 * }}
 */
export function groupNotificationsForSheet(items) {
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a, b) => {
    const at = a?.createdAt || '';
    const bt = b?.createdAt || '';
    if (at !== bt) return at < bt ? 1 : -1;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });
  const unread = list.filter(isNotificationUnread);
  const read = list.filter((item) => !isNotificationUnread(item));
  return {
    unread,
    read,
    hasUnread: unread.length > 0,
    isEmpty: list.length === 0,
  };
}

/**
 * Apply session-local read overrides (in-memory only — not persisted).
 * @param {NotificationItem[]} items
 * @param {Record<string, string | null | undefined>} readAtById
 * @returns {NotificationItem[]}
 */
export function applyNotificationReadOverrides(items, readAtById = {}) {
  if (!items?.length) return [];
  return items.map((item) => {
    if (!item?.id) return item;
    if (!Object.prototype.hasOwnProperty.call(readAtById, item.id)) {
      return item;
    }
    const readAt = readAtById[item.id] ?? null;
    return { ...item, readAt };
  });
}

/**
 * @param {NotificationItem[]} items
 * @param {string} id
 * @param {string} [readAtIso]
 */
export function markNotificationReadInOverrides(items, id, readAtById, readAtIso) {
  const next = { ...readAtById };
  const target = (items ?? []).find((item) => item.id === id);
  if (!target) return next;
  if (!isNotificationUnread(applyNotificationReadOverrides([target], readAtById)[0])) {
    return next;
  }
  next[id] = readAtIso || new Date().toISOString();
  return next;
}

/**
 * @param {NotificationItem[]} items
 * @param {Record<string, string | null | undefined>} readAtById
 * @param {string} [readAtIso]
 */
export function markAllNotificationsReadInOverrides(items, readAtById, readAtIso) {
  const stamp = readAtIso || new Date().toISOString();
  const next = { ...readAtById };
  for (const item of items ?? []) {
    const live = applyNotificationReadOverrides([item], readAtById)[0];
    if (isNotificationUnread(live)) {
      next[item.id] = stamp;
    }
  }
  return next;
}

/**
 * Film Detail navigation target from a notification.
 * @param {NotificationItem} item
 * @returns {{ filmKey: string, opportunityKey: string | null } | null}
 */
export function notificationNavigationTarget(item) {
  if (!item) return null;
  const filmKey =
    (typeof item.filmId === 'string' && item.filmId.trim()) ||
    (typeof item.filmKey === 'string' && item.filmKey.trim()) ||
    null;
  if (!filmKey) return null;
  const opportunityKey =
    typeof item.snapshot?.opportunityKey === 'string' &&
    item.snapshot.opportunityKey.trim()
      ? item.snapshot.opportunityKey.trim()
      : null;
  return { filmKey, opportunityKey };
}
