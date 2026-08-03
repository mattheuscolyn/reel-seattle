/**
 * Browser-local film sync attachment record (T-ACCOUNT-CLOUD-SYNC-FILMS-01).
 *
 * Does not store tokens. Each browser must attach independently.
 */

export const FILM_SYNC_ATTACHMENT_KEY = 'reel-seattle.v2.filmSyncAttachment';
export const FILM_SYNC_ATTACHMENT_VERSION = 1;

/**
 * @typedef {{
 *   version: number,
 *   attachedUserId: string,
 *   lastSuccessfulPullAt: string | null,
 *   lastSuccessfulSyncAt: string | null,
 * }} FilmSyncAttachment
 */

/**
 * @param {Storage | null | undefined} storage
 * @returns {FilmSyncAttachment | null}
 */
export function readFilmSyncAttachment(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(FILM_SYNC_ATTACHMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.version !== FILM_SYNC_ATTACHMENT_VERSION) return null;
    if (
      typeof parsed.attachedUserId !== 'string' ||
      !parsed.attachedUserId.trim()
    ) {
      return null;
    }
    return {
      version: FILM_SYNC_ATTACHMENT_VERSION,
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
 * @param {FilmSyncAttachment} attachment
 * @returns {boolean}
 */
export function writeFilmSyncAttachment(storage, attachment) {
  try {
    if (!storage) return false;
    storage.setItem(
      FILM_SYNC_ATTACHMENT_KEY,
      JSON.stringify({
        version: FILM_SYNC_ATTACHMENT_VERSION,
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
 * Clears attachment for this browser only. Does not clear film preference stores.
 * @param {Storage | null | undefined} storage
 */
export function clearFilmSyncAttachment(storage) {
  try {
    storage?.removeItem?.(FILM_SYNC_ATTACHMENT_KEY);
  } catch {
    // ignore
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {string | null | undefined} userId
 * @returns {boolean}
 */
export function isBrowserAttachedToUser(storage, userId) {
  if (!userId) return false;
  const attachment = readFilmSyncAttachment(storage);
  return Boolean(attachment && attachment.attachedUserId === userId);
}
