/**
 * Exceptional-only sync attention for Profile (Slice 1).
 * Healthy attached sync must not produce UI.
 */

const ATTENTION_ATTACHED_STATUSES = new Set([
  'degraded',
  'retry_scheduled',
  'offline_pending',
]);

/**
 * @param {{ attached?: boolean, uiStatus?: string, userId?: string | null } | null | undefined} snap
 */
export function filmSyncNeedsAttention(snap) {
  if (!snap || !snap.userId) return false;
  if (!snap.attached) return true;
  return ATTENTION_ATTACHED_STATUSES.has(snap.uiStatus);
}

/**
 * @param {{ attached?: boolean, uiStatus?: string, userId?: string | null } | null | undefined} snap
 */
export function scheduleSyncNeedsAttention(snap) {
  if (!snap || !snap.userId) return false;
  if (!snap.attached) return true;
  return ATTENTION_ATTACHED_STATUSES.has(snap.uiStatus);
}

/**
 * @param {string | null | undefined} uiStatus
 */
export function syncAttentionIsRecovery(uiStatus) {
  return ATTENTION_ATTACHED_STATUSES.has(uiStatus);
}
