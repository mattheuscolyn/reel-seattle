/**
 * Personal film collection model (Saved / Seen / Not Interested).
 *
 * Resolves preference store items against HomeData by filmKey, filmId, and
 * aliases — then falls back to persisted title/poster/year snapshots so
 * TMDB-only Saved films remain visible.
 *
 * "Watching for showtimes" is derived (Saved ∧ no qualifying future showtimes).
 */

import { COLLECTION_IDS } from '../explore/exploreIds.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import {
  asCanonicalStoreFilmId,
  filmRefKeySet,
  normalizeShowtimeFilmKey,
  savedFilmRefsEqual,
} from '../stores/savedFilmsStore.js';
import { findNextOpportunityForFilm } from '../home/shelfData.js';
import {
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';

export const PERSONAL_COLLECTION_IDS = Object.freeze([
  COLLECTION_IDS.saved,
  COLLECTION_IDS.seen,
  COLLECTION_IDS.hidden,
]);

export function isPersonalCollectionId(collectionId) {
  return PERSONAL_COLLECTION_IDS.includes(collectionId);
}

export const PERSONAL_COLLECTION_COPY = Object.freeze({
  [COLLECTION_IDS.saved]: {
    title: 'Saved',
    subtitle:
      'Films you want to see. We’ll keep an eye out for showtimes in Seattle.',
    emptyTitle: 'No saved films yet',
    emptyBody: 'Save films you want to keep track of.',
    privacySignedIn: 'Saved is private to you and syncs across your devices.',
    privacyLocal: 'Saved is private and stored on this device.',
    sortDefault: 'recent',
    sortOptions: Object.freeze([
      { id: 'recent', label: 'Recently saved' },
      { id: 'title', label: 'Title' },
    ]),
  },
  [COLLECTION_IDS.seen]: {
    title: 'Seen',
    subtitle: 'Films you’ve marked as seen.',
    emptyTitle: 'No films marked Seen yet',
    emptyBody: 'Mark films as Seen when you’ve watched them.',
    privacySignedIn: 'Seen is private to you and syncs across your devices.',
    privacyLocal: 'Seen is private and stored on this device.',
    sortDefault: 'recent',
    sortOptions: Object.freeze([
      { id: 'recent', label: 'Recently marked' },
      { id: 'title', label: 'Title' },
    ]),
  },
  [COLLECTION_IDS.hidden]: {
    title: 'Not Interested',
    subtitle:
      'Films you’ve marked as not interested. We’ll show you less of these.',
    emptyTitle: 'Nothing here yet',
    emptyBody: 'Films you mark as Not interested will appear here.',
    privacySignedIn:
      'This list is private and syncs across your devices. You can remove films at any time.',
    privacyLocal:
      'This list is private and stored only for you. You can remove films at any time.',
    sortDefault: 'recent',
    sortOptions: Object.freeze([
      { id: 'recent', label: 'Date added (newest)' },
      { id: 'title', label: 'Title' },
    ]),
  },
});

/**
 * @param {string} collectionId
 */
export function personalCollectionSegmentId(collectionId) {
  if (collectionId === COLLECTION_IDS.seen) return 'seen';
  if (collectionId === COLLECTION_IDS.hidden) return 'not-interested';
  return 'saved';
}

/**
 * @param {'saved' | 'seen' | 'not-interested'} segmentId
 */
export function collectionIdFromPersonalSegment(segmentId) {
  if (segmentId === 'seen') return COLLECTION_IDS.seen;
  if (segmentId === 'not-interested') return COLLECTION_IDS.hidden;
  return COLLECTION_IDS.saved;
}

/**
 * Index HomeData films for Saved resolution (key + filmId + aliases).
 * @param {object | null | undefined} homeData
 */
export function buildHomeFilmIdentityIndex(homeData) {
  /** @type {Map<string, object>} */
  const byKey = new Map();
  /** @type {Map<string, object>} */
  const byFilmId = new Map();
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  for (const film of films) {
    if (!film || typeof film !== 'object') continue;
    const key = normalizeShowtimeFilmKey(film.filmKey);
    if (key) byKey.set(key, film);
    const filmId = asCanonicalStoreFilmId(film.filmId);
    if (filmId && !byFilmId.has(filmId)) byFilmId.set(filmId, film);
    if (Array.isArray(film.identityAliases)) {
      for (const alias of film.identityAliases) {
        const aliasKey = normalizeShowtimeFilmKey(alias);
        if (aliasKey && !byKey.has(aliasKey)) byKey.set(aliasKey, film);
      }
    }
  }
  return { byKey, byFilmId };
}

/**
 * Resolve a preference filmRef against HomeData.
 * @param {object | null | undefined} filmRef
 * @param {{ byKey: Map<string, object>, byFilmId: Map<string, object> }} index
 */
export function resolveHomeFilmForPreferenceRef(filmRef, index) {
  if (!filmRef || !index) return null;
  const keys = filmRefKeySet(filmRef);
  for (const key of keys) {
    const hit = index.byKey.get(key);
    if (hit) return hit;
  }
  const filmId = asCanonicalStoreFilmId(filmRef.filmId);
  if (filmId) {
    const hit = index.byFilmId.get(filmId);
    if (hit) return hit;
  }
  return null;
}

/**
 * @param {string | null | undefined} iso
 */
export function formatPreferenceDateLabel(iso) {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/Los_Angeles',
    }).format(d);
  } catch {
    return null;
  }
}

/**
 * @param {number | string | null | undefined} year
 */
function normalizeYear(year) {
  if (typeof year === 'number' && Number.isFinite(year) && year > 1800) {
    return Math.round(year);
  }
  if (typeof year === 'string' && /^\d{4}$/.test(year.trim())) {
    return Number(year.trim());
  }
  return null;
}

/**
 * @param {object | null} homeData
 * @param {object} homeFilm
 * @param {object | null} enrichmentIndex
 */
function buildAvailableMeta(homeData, homeFilm, enrichmentIndex) {
  const enriched = enrichHomeFilm(homeFilm, enrichmentIndex, 'collection', homeData);
  const next = findNextOpportunityForFilm(homeData, homeFilm.filmKey);
  const formatRaw = Array.isArray(next?.formatLabels) ? next.formatLabels[0] : null;
  const formatLabel = formatRaw
    ? formatUserFacingFormatLabel(formatRaw) || formatRaw
    : null;
  const showtimeLine = next
    ? [next.theaterName, next.timeDisplay].filter(Boolean).join(' · ')
    : null;
  const genre =
    typeof enriched.genreLine === 'string' && enriched.genreLine.trim()
      ? enriched.genreLine.split(/[·,]/)[0]?.trim() || null
      : null;
  /** @type {{ label: string, tone: 'accent' | 'neutral' }[]} */
  const tags = [];
  if (formatLabel) tags.push({ label: formatLabel, tone: 'accent' });
  if (genre) tags.push({ label: genre, tone: 'neutral' });

  return {
    showtimeLine,
    tags,
    nextOpportunityKey: next?.opportunityKey ?? null,
    hasQualifyingShowtimes: Boolean(next),
    year: normalizeYear(enriched.canonicalYear ?? homeFilm.releaseYear ?? homeFilm.year),
    genre,
    director: enriched.directors ?? null,
  };
}

/**
 * @param {object} item — store item
 * @param {object | null} homeFilm
 * @param {object | null} homeData
 * @param {object | null} enrichmentIndex
 * @param {'saved' | 'seen' | 'hidden'} kind
 */
export function buildPersonalCollectionRow(
  item,
  homeFilm,
  homeData,
  enrichmentIndex,
  kind,
) {
  const filmRef = item?.filmRef;
  if (!filmRef?.showtimeFilmKey) return null;

  const stampedAt =
    kind === 'saved'
      ? item.savedAt
      : kind === 'seen'
        ? item.seenAt
        : item.markedAt;

  if (homeFilm) {
    const enriched = enrichHomeFilm(
      homeFilm,
      enrichmentIndex,
      'collection',
      homeData,
    );
    const available = buildAvailableMeta(homeData, homeFilm, enrichmentIndex);
    const watching = kind === 'saved' && !available.hasQualifyingShowtimes;
    const year =
      available.year ??
      normalizeYear(item.year) ??
      null;
    const genre = available.genre;
    const director = available.director;
    const metaParts = watching
      ? [
          year != null ? String(year) : null,
          director ? `Director ${director}` : genre,
        ].filter(Boolean)
      : kind === 'saved'
        ? []
        : [year != null ? String(year) : null, genre].filter(Boolean);

    return {
      rowKey: `${kind}:${filmRef.showtimeFilmKey}`,
      kind,
      origin: /** @type {'catalog'} */ ('catalog'),
      watching,
      filmKey: homeFilm.filmKey,
      filmId: asCanonicalStoreFilmId(enriched.filmId ?? homeFilm.filmId) ??
        asCanonicalStoreFilmId(filmRef.filmId),
      filmRef,
      title:
        enriched.displayTitle ??
        homeFilm.title ??
        item.title ??
        'Untitled',
      posterUrl: enriched.posterUrl ?? item.posterUrl ?? null,
      year,
      genre,
      director,
      metaLine: metaParts.length ? metaParts.join(' · ') : null,
      showtimeLine:
        kind === 'saved' && !watching ? available.showtimeLine : null,
      statusLine: watching
        ? 'No Seattle showtimes yet'
        : kind === 'seen'
          ? stampedAt
            ? `Marked ${formatPreferenceDateLabel(stampedAt) ?? ''}`.trim()
            : null
          : kind === 'hidden'
            ? stampedAt
              ? `Added ${formatPreferenceDateLabel(stampedAt) ?? ''}`.trim()
              : null
            : null,
      tags: kind === 'saved' && !watching ? available.tags : [],
      showWatchingBadge: watching,
      // Canonical Not Interested mockup shows an explicit Remove control.
      // Saved/Seen rely on Film Detail (and Save/Seen toggles) instead.
      showRemove: kind === 'hidden',
      removeLabel: 'Remove',
      nextOpportunityKey: available.nextOpportunityKey,
      stampedAt: stampedAt ?? null,
      sortTitle:
        (enriched.displayTitle ?? homeFilm.title ?? item.title ?? '').toLowerCase(),
    };
  }

  // Snapshot-only (TMDB-only / catalog-absent)
  const year = normalizeYear(item.year);
  const title = (typeof item.title === 'string' && item.title.trim()) || 'Untitled';
  const filmId = asCanonicalStoreFilmId(filmRef.filmId);
  const filmKey = filmId || filmRef.showtimeFilmKey;

  return {
    rowKey: `${kind}:${filmRef.showtimeFilmKey}`,
    kind,
    origin: /** @type {'snapshot'} */ ('snapshot'),
    watching: kind === 'saved',
    filmKey,
    filmId,
    filmRef,
    title,
    posterUrl: item.posterUrl ?? null,
    year,
    genre: null,
    director: null,
    metaLine: year != null ? String(year) : null,
    showtimeLine: null,
    statusLine:
      kind === 'saved'
        ? 'No Seattle showtimes yet'
        : kind === 'seen'
          ? stampedAt
            ? `Marked ${formatPreferenceDateLabel(stampedAt) ?? ''}`.trim()
            : null
          : stampedAt
            ? `Added ${formatPreferenceDateLabel(stampedAt) ?? ''}`.trim()
            : null,
    tags: [],
    showWatchingBadge: kind === 'saved',
    showRemove: kind === 'hidden',
    removeLabel: 'Remove',
    nextOpportunityKey: null,
    stampedAt: stampedAt ?? null,
    sortTitle: title.toLowerCase(),
  };
}

/**
 * @param {object[]} rows
 * @param {'recent' | 'title'} sortId
 */
export function sortPersonalCollectionRows(rows, sortId) {
  const list = [...(rows ?? [])];
  if (sortId === 'title') {
    list.sort((a, b) => {
      const cmp = String(a.sortTitle).localeCompare(String(b.sortTitle));
      if (cmp !== 0) return cmp;
      return String(a.rowKey).localeCompare(String(b.rowKey));
    });
    return list;
  }
  list.sort((a, b) => {
    const at = a.stampedAt || '';
    const bt = b.stampedAt || '';
    if (at !== bt) return at < bt ? 1 : -1;
    return String(a.sortTitle).localeCompare(String(b.sortTitle));
  });
  return list;
}

/**
 * Deduplicate preference items that share identity (same filmId / keys).
 * Keeps the newest stamp; merges refs.
 * @param {object[]} items
 * @param {(item: object) => string | null} stampOf
 */
export function dedupePreferenceItemsByIdentity(items, stampOf) {
  /** @type {object[]} */
  const out = [];
  for (const item of items ?? []) {
    if (!item?.filmRef) continue;
    const idx = out.findIndex((row) =>
      savedFilmRefsEqual(row.filmRef, item.filmRef),
    );
    if (idx < 0) {
      out.push(item);
      continue;
    }
    const existing = out[idx];
    const a = stampOf(existing) || '';
    const b = stampOf(item) || '';
    // Prefer newer stamp; keep richer snapshots.
    const preferNew = b > a;
    const base = preferNew ? item : existing;
    const other = preferNew ? existing : item;
    out[idx] = {
      ...base,
      title: base.title ?? other.title ?? null,
      posterUrl: base.posterUrl ?? other.posterUrl ?? null,
      year: base.year ?? other.year ?? null,
      filmRef: {
        ...base.filmRef,
        filmId: base.filmRef.filmId ?? other.filmRef.filmId ?? null,
        aliasKeys: [
          ...new Set([
            ...(base.filmRef.aliasKeys ?? []),
            ...(other.filmRef.aliasKeys ?? []),
            other.filmRef.showtimeFilmKey,
          ].filter(Boolean)),
        ].filter((k) => k !== base.filmRef.showtimeFilmKey),
      },
    };
  }
  return out;
}

/**
 * Build the full personal collection presentation model.
 *
 * @param {{
 *   collectionId: string,
 *   homeData: object | null,
 *   enrichmentIndex?: object | null,
 *   savedItems?: object[],
 *   seenItems?: object[],
 *   notInterestedItems?: object[],
 *   sortId?: string,
 *   signedIn?: boolean,
 * }} params
 */
export function buildPersonalCollectionModel({
  collectionId,
  homeData,
  enrichmentIndex = null,
  savedItems = [],
  seenItems = [],
  notInterestedItems = [],
  sortId = null,
  signedIn = false,
}) {
  const copy =
    PERSONAL_COLLECTION_COPY[collectionId] ??
    PERSONAL_COLLECTION_COPY[COLLECTION_IDS.saved];
  const resolvedSort =
    copy.sortOptions.some((o) => o.id === sortId) ? sortId : copy.sortDefault;

  const index = buildHomeFilmIdentityIndex(homeData);
  const kind =
    collectionId === COLLECTION_IDS.seen
      ? 'seen'
      : collectionId === COLLECTION_IDS.hidden
        ? 'hidden'
        : 'saved';

  const rawItems =
    kind === 'saved'
      ? dedupePreferenceItemsByIdentity(savedItems, (i) => i.savedAt)
      : kind === 'seen'
        ? dedupePreferenceItemsByIdentity(seenItems, (i) => i.seenAt)
        : dedupePreferenceItemsByIdentity(notInterestedItems, (i) => i.markedAt);

  const rows = [];
  for (const item of rawItems) {
    const homeFilm = resolveHomeFilmForPreferenceRef(item.filmRef, index);
    const row = buildPersonalCollectionRow(
      item,
      homeFilm,
      homeData,
      enrichmentIndex,
      kind,
    );
    if (row) rows.push(row);
  }

  const sorted = sortPersonalCollectionRows(rows, resolvedSort);

  /** @type {{ id: string, title: string, subtitle: string, icon: string, rows: object[] }[]} */
  let sections = [];
  if (kind === 'saved') {
    const available = sorted.filter((r) => !r.watching);
    const watching = sorted.filter((r) => r.watching);
    if (available.length) {
      sections.push({
        id: 'available',
        title: 'Available to watch',
        subtitle: `${available.length} film${available.length === 1 ? '' : 's'} with showtimes in Seattle.`,
        icon: 'ticket',
        rows: available,
      });
    }
    if (watching.length) {
      sections.push({
        id: 'watching',
        title: 'Watching for showtimes',
        subtitle: `${watching.length} film${watching.length === 1 ? '' : 's'} with no Seattle showtimes yet.`,
        icon: 'eye',
        rows: watching,
      });
    }
  } else {
    sections.push({
      id: 'all',
      title: null,
      subtitle: null,
      icon: null,
      rows: sorted,
    });
  }

  return {
    collectionId,
    kind,
    title: copy.title,
    subtitle: copy.subtitle,
    emptyTitle: copy.emptyTitle,
    emptyBody: copy.emptyBody,
    privacyNote: signedIn ? copy.privacySignedIn : copy.privacyLocal,
    privacyTone: kind === 'hidden' ? 'info' : 'lock',
    sortId: resolvedSort,
    sortOptions: copy.sortOptions,
    totalCount: sorted.length,
    sections,
    rows: sorted,
    segmentId: personalCollectionSegmentId(collectionId),
  };
}
