/**
 * Device-local Quick Start interaction history.
 *
 * Stores meaningful Explore navigations for deterministic personalization.
 * Corrupt / unavailable storage fails safely and never blocks navigation.
 */

export const QUICK_START_HISTORY_STORAGE_KEY =
  'reel-seattle.v2.quickStartHistory';
export const QUICK_START_HISTORY_VERSION = 1;
/** Soft cap on retained visit events. */
export const QUICK_START_HISTORY_MAX_EVENTS = 80;
/** Ignore duplicate visits to the same destination within this window. */
export const QUICK_START_VISIT_DEBOUNCE_MS = 2000;

/**
 * @typedef {'showtimes' | 'browse' | 'theater' | 'format' | 'collection'} QuickStartVisitKind
 */

/**
 * @typedef {{
 *   destinationId: string,
 *   kind: QuickStartVisitKind,
 *   label?: string | null,
 *   at: string,
 * }} QuickStartVisitEvent
 */

/**
 * @typedef {{
 *   version: number,
 *   events: QuickStartVisitEvent[],
 * }} QuickStartHistoryStore
 */

function emptyStore() {
  return {
    version: QUICK_START_HISTORY_VERSION,
    events: /** @type {QuickStartVisitEvent[]} */ ([]),
  };
}

/**
 * @param {unknown} value
 * @returns {QuickStartVisitKind | null}
 */
function normalizeKind(value) {
  if (
    value === 'showtimes' ||
    value === 'browse' ||
    value === 'theater' ||
    value === 'format' ||
    value === 'collection'
  ) {
    return value;
  }
  return null;
}

/**
 * @param {unknown} raw
 * @returns {QuickStartVisitEvent | null}
 */
function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const destinationId =
    typeof raw.destinationId === 'string' ? raw.destinationId.trim() : '';
  const kind = normalizeKind(raw.kind);
  const at = typeof raw.at === 'string' ? raw.at.trim() : '';
  if (!destinationId || !kind || !at) return null;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return null;
  const label =
    typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null;
  return { destinationId, kind, label, at };
}

/**
 * @param {unknown} value
 * @returns {QuickStartHistoryStore}
 */
export function normalizeQuickStartHistory(value) {
  if (!value || typeof value !== 'object') return emptyStore();
  if (value.version !== QUICK_START_HISTORY_VERSION) return emptyStore();
  const events = Array.isArray(value.events) ? value.events : [];
  const normalized = events
    .map(normalizeEvent)
    .filter(Boolean)
    .slice(-QUICK_START_HISTORY_MAX_EVENTS);
  return {
    version: QUICK_START_HISTORY_VERSION,
    events: /** @type {QuickStartVisitEvent[]} */ (normalized),
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @returns {QuickStartHistoryStore}
 */
export function loadQuickStartHistory(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return emptyStore();
    const raw = storage.getItem(QUICK_START_HISTORY_STORAGE_KEY);
    if (!raw) return emptyStore();
    return normalizeQuickStartHistory(JSON.parse(raw));
  } catch {
    return emptyStore();
  }
}

/**
 * @param {Storage | null | undefined} storage
 * @param {QuickStartHistoryStore} store
 */
export function saveQuickStartHistory(storage, store) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    const normalized = normalizeQuickStartHistory(store);
    storage.setItem(QUICK_START_HISTORY_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a meaningful navigation. Debounces rapid duplicates of the same id.
 *
 * @param {Storage | null | undefined} storage
 * @param {{
 *   destinationId: string,
 *   kind: QuickStartVisitKind,
 *   label?: string | null,
 *   at?: string | Date | number,
 * }} visit
 * @returns {QuickStartHistoryStore}
 */
export function recordQuickStartVisit(storage, visit) {
  const destinationId =
    typeof visit?.destinationId === 'string' ? visit.destinationId.trim() : '';
  const kind = normalizeKind(visit?.kind);
  if (!destinationId || !kind) {
    return loadQuickStartHistory(storage);
  }

  let atMs = Date.now();
  if (visit.at instanceof Date) {
    atMs = visit.at.getTime();
  } else if (typeof visit.at === 'number' && Number.isFinite(visit.at)) {
    atMs = visit.at;
  } else if (typeof visit.at === 'string') {
    const parsed = Date.parse(visit.at);
    if (Number.isFinite(parsed)) atMs = parsed;
  }

  const store = loadQuickStartHistory(storage);
  const last = store.events[store.events.length - 1];
  if (last && last.destinationId === destinationId) {
    const lastMs = Date.parse(last.at);
    if (
      Number.isFinite(lastMs) &&
      atMs - lastMs >= 0 &&
      atMs - lastMs < QUICK_START_VISIT_DEBOUNCE_MS
    ) {
      return store;
    }
  }

  const label =
    typeof visit.label === 'string' && visit.label.trim()
      ? visit.label.trim()
      : null;
  const next = {
    version: QUICK_START_HISTORY_VERSION,
    events: [
      ...store.events,
      {
        destinationId,
        kind,
        label,
        at: new Date(atMs).toISOString(),
      },
    ].slice(-QUICK_START_HISTORY_MAX_EVENTS),
  };
  saveQuickStartHistory(storage, next);
  return next;
}

/**
 * @param {string} theaterId
 */
export function theaterDestinationId(theaterId) {
  const id = typeof theaterId === 'string' ? theaterId.trim() : '';
  return id ? `theater:${id}` : '';
}

/**
 * @param {string} formatId
 */
export function formatDestinationId(formatId) {
  const id = typeof formatId === 'string' ? formatId.trim() : '';
  return id ? `format:${id}` : '';
}

/**
 * @param {string} collectionId
 */
export function collectionDestinationId(collectionId) {
  const id = typeof collectionId === 'string' ? collectionId.trim() : '';
  return id ? `collection:${id}` : '';
}

/**
 * @param {string} browseId
 */
export function browseDestinationId(browseId) {
  const id = typeof browseId === 'string' ? browseId.trim() : '';
  return id ? `browse:${id}` : '';
}

/**
 * @param {string} showtimesQuickId
 */
export function showtimesDestinationId(showtimesQuickId) {
  const id = typeof showtimesQuickId === 'string' ? showtimesQuickId.trim() : '';
  return id ? `showtimes:${id}` : '';
}
