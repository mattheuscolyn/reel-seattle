/**
 * Notification bell header presentation (entry point only).
 *
 * Unread indicator is driven by live notification state (`hasUnreadNotifications`),
 * not by merely opening the sheet. QC may force visibility via
 * `?qcHeaderNotifications=logged-out|read|unread`.
 */

/**
 * @param {unknown} raw
 * @returns {'logged-out' | 'read' | 'unread' | null}
 */
export function parseQcHeaderNotificationsMode(raw) {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'logged-out' || value === 'logged_out' || value === 'out') {
    return 'logged-out';
  }
  if (value === 'read' || value === 'all-read' || value === 'none') {
    return 'read';
  }
  if (value === 'unread' || value === 'has-unread') {
    return 'unread';
  }
  return null;
}

/**
 * Read optional QC override from the current URL (browser only).
 * @returns {'logged-out' | 'read' | 'unread' | null}
 */
export function readQcHeaderNotificationsModeFromLocation(
  locationLike = typeof window !== 'undefined' ? window.location : null,
) {
  if (!locationLike || typeof locationLike.search !== 'string') return null;
  try {
    const params = new URLSearchParams(locationLike.search);
    return parseQcHeaderNotificationsMode(
      params.get('qcHeaderNotifications'),
    );
  } catch {
    return null;
  }
}

/**
 * Resolve whether the header bell should appear and whether unread is indicated.
 *
 * QC `read` / `unread` force a logged-in-looking bell (for visual QA without auth).
 * The purple unread dot always follows `hasUnreadNotifications` so Mark all as read
 * can clear it during a QC session.
 *
 * @param {{
 *   signedIn?: boolean,
 *   hasUnreadNotifications?: boolean,
 *   qcMode?: 'logged-out' | 'read' | 'unread' | null,
 * }} [input]
 * @returns {{ visible: boolean, hasUnread: boolean }}
 */
export function resolveNotificationBellPresentation(input = {}) {
  const qcMode = input.qcMode ?? null;
  if (qcMode === 'logged-out') {
    return { visible: false, hasUnread: false };
  }

  const signedIn =
    Boolean(input.signedIn) || qcMode === 'read' || qcMode === 'unread';
  if (!signedIn) {
    return { visible: false, hasUnread: false };
  }

  return {
    visible: true,
    hasUnread: Boolean(input.hasUnreadNotifications),
  };
}

/**
 * Accessible label for the header notifications control.
 * @param {{ hasUnread?: boolean }} [input]
 */
export function notificationBellAriaLabel(input = {}) {
  return input.hasUnread ? 'Notifications, unread' : 'Notifications';
}
