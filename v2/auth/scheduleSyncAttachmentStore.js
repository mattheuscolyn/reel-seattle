/**
 * Browser-local schedule sync attachment (T-ACCOUNT-CLOUD-SYNC-SCHEDULE-01).
 * Separate from film-sync attachment. No tokens.
 */

export const SCHEDULE_SYNC_ATTACHMENT_KEY =
  'reel-seattle.v2.scheduleSyncAttachment';
export const SCHEDULE_SYNC_ATTACHMENT_VERSION = 1;

/**
 * @typedef {{
 *   version: number,
 *   attachedUserId: string,
 *   lastSuccessfulPullAt: string | null,
 *   lastSuccessfulSyncAt: string | null,
 * }} ScheduleSyncAttachment
 */

/**
 * @param {Storage | null | undefined} storage
 * @returns {ScheduleSyncAttachment | null}
 */
export function readScheduleSyncAttachment(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(SCHEDULE_SYNC_ATTACHMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== SCHEDULE_SYNC_ATTACHMENT_VERSION) return null;
    if (
      typeof parsed.attachedUserId !== 'string' ||
      !parsed.attachedUserId.trim()
    ) {
      return null;
    }
    return {
      version: SCHEDULE_SYNC_ATTACHMENT_VERSION,
      attachedUserId: parsed.attachedUserId.trim(),
      lastSuccessfulPullAt:
        typeof parsed.lastSuccessfulPullAt === 'string'
          ? parsed.lastSuccessfulPullAt
          : null,
      lastSuccessfulSyncAt:
        typeof parsed.lastSuccessfulSyncAt === 'string'
          ? parsed.lastSuccessfulSyncAt
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {ScheduleSyncAttachment} attachment
 */
export function writeScheduleSyncAttachment(storage, attachment) {
  try {
    if (!storage) return false;
    storage.setItem(
      SCHEDULE_SYNC_ATTACHMENT_KEY,
      JSON.stringify({
        version: SCHEDULE_SYNC_ATTACHMENT_VERSION,
        attachedUserId: attachment.attachedUserId,
        lastSuccessfulPullAt: attachment.lastSuccessfulPullAt ?? null,
        lastSuccessfulSyncAt: attachment.lastSuccessfulSyncAt ?? null,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage | null | undefined} storage
 */
export function clearScheduleSyncAttachment(storage) {
  try {
    storage?.removeItem?.(SCHEDULE_SYNC_ATTACHMENT_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string | null | undefined} userId
 */
export function isBrowserScheduleAttachedToUser(storage, userId) {
  if (!userId) return false;
  const attachment = readScheduleSyncAttachment(storage);
  return Boolean(attachment && attachment.attachedUserId === userId);
}
