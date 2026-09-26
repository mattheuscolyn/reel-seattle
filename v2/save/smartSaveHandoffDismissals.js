/**
 * Local dismissal of Smart Save → Planner prompts while a film remains saved.
 *
 * Cleared when the film is unsaved so a later re-save can prompt again.
 */

import {
  normalizeSavedFilmRef,
  savedFilmRefsEqual,
} from '../stores/savedFilmsStore.js';

export const SMART_SAVE_DISMISSALS_STORAGE_KEY =
  'reel-seattle.v2.smartSaveHandoffDismissals';
export const SMART_SAVE_DISMISSALS_VERSION = 1;

function emptyStore() {
  return { version: SMART_SAVE_DISMISSALS_VERSION, items: [] };
}

/**
 * @param {Storage | null | undefined} storage
 */
export function readSmartSaveDismissalsStore(storage) {
  if (!storage || typeof storage.getItem !== 'function') return emptyStore();
  try {
    const raw = storage.getItem(SMART_SAVE_DISMISSALS_STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyStore();
    if (parsed.version !== SMART_SAVE_DISMISSALS_VERSION) return emptyStore();
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      version: SMART_SAVE_DISMISSALS_VERSION,
      items: items
        .map((item) => {
          const filmRef = normalizeSavedFilmRef(item?.filmRef ?? item);
          if (!filmRef) return null;
          return {
            filmRef,
            dismissedAt:
              typeof item?.dismissedAt === 'string'
                ? item.dismissedAt
                : new Date().toISOString(),
          };
        })
        .filter(Boolean),
    };
  } catch {
    return emptyStore();
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {{ version: number, items: object[] }} store
 */
function writeStore(storage, store) {
  if (!storage || typeof storage.setItem !== 'function') {
    return { ok: false, error: 'no_storage' };
  }
  try {
    storage.setItem(SMART_SAVE_DISMISSALS_STORAGE_KEY, JSON.stringify(store));
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error?.name === 'QuotaExceededError' ? 'quota_exceeded' : 'storage_set_failed',
    };
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 */
export function isSmartSaveHandoffDismissed(storage, filmRef) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return false;
  const store = readSmartSaveDismissalsStore(storage);
  return store.items.some((item) =>
    savedFilmRefsEqual(item.filmRef, normalized),
  );
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 */
export function dismissSmartSaveHandoff(storage, filmRef) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return { ok: false, error: 'invalid_ref', changed: false };
  const store = readSmartSaveDismissalsStore(storage);
  if (store.items.some((item) => savedFilmRefsEqual(item.filmRef, normalized))) {
    return { ok: true, error: null, changed: false };
  }
  const next = {
    version: SMART_SAVE_DISMISSALS_VERSION,
    items: [
      ...store.items,
      { filmRef: normalized, dismissedAt: new Date().toISOString() },
    ],
  };
  const written = writeStore(storage, next);
  return { ...written, changed: Boolean(written.ok) };
}

/**
 * @param {Storage | null | undefined} storage
 * @param {object | null | undefined} filmRef
 */
export function clearSmartSaveHandoffDismissal(storage, filmRef) {
  const normalized = normalizeSavedFilmRef(filmRef);
  if (!normalized) return { ok: false, error: 'invalid_ref', changed: false };
  const store = readSmartSaveDismissalsStore(storage);
  const items = store.items.filter(
    (item) => !savedFilmRefsEqual(item.filmRef, normalized),
  );
  if (items.length === store.items.length) {
    return { ok: true, error: null, changed: false };
  }
  const written = writeStore(storage, {
    version: SMART_SAVE_DISMISSALS_VERSION,
    items,
  });
  return { ...written, changed: Boolean(written.ok) };
}
