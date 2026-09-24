/**
 * Coming Soon presentation — month/week grouping, filters, row/detail view-models.
 * Never promotes inferred TMDB ids into canonical film identity.
 */

import { formatBrowseShortDateRange } from '../showtimes/browseDateSortUtils.js';
import { formatRuntimeLabel } from '../home/shelfData.js';

export const COMING_SOON_PAGE_TITLE = 'Coming Soon';
export const COMING_SOON_PAGE_TAGLINE =
  'Films expected to become theatrically relevant in Seattle over the next 90 days. Local showtimes appear as they’re announced.';

export const PUBLIC_RELEVANCE_TIERS = Object.freeze([
  'confirmed_local',
  'locally_announced',
  'strongly_expected',
]);

/** Browser All-releases slice also includes weak national film calendar rows. */
export const ALL_RELEASES_RELEVANCE_TIERS = Object.freeze([
  ...PUBLIC_RELEVANCE_TIERS,
  'weak_national_only',
]);

const RELEVANCE_SORT_RANK = Object.freeze({
  confirmed_local: 0,
  locally_announced: 1,
  strongly_expected: 2,
  weak_national_only: 3,
});

export const COMING_SOON_SCOPE = Object.freeze({
  recommended: 'recommended',
  all: 'all',
});

export const COMING_SOON_SCOPE_OPTIONS = Object.freeze([
  Object.freeze({ id: COMING_SOON_SCOPE.recommended, label: 'Recommended' }),
  Object.freeze({ id: COMING_SOON_SCOPE.all, label: 'All releases' }),
]);

export const COMING_SOON_LOCAL_FILTERS = Object.freeze([
  Object.freeze({ id: 'all', label: 'All' }),
  Object.freeze({ id: 'confirmed', label: 'Confirmed in Seattle' }),
]);

export const COMING_SOON_KIND_FILTERS = Object.freeze([
  Object.freeze({
    id: 'movies',
    label: 'Movies',
    kinds: Object.freeze(['film', 'other']),
  }),
  Object.freeze({
    id: 'rereleases',
    label: 'Rereleases',
    kinds: Object.freeze(['rerelease']),
  }),
  Object.freeze({
    id: 'events',
    label: 'Special Events',
    kinds: Object.freeze(['event']),
  }),
  Object.freeze({
    id: 'mystery',
    label: 'Mystery Screenings',
    kinds: Object.freeze(['mystery_screening']),
  }),
]);

export const DEFAULT_COMING_SOON_FILTERS = Object.freeze({
  scope: COMING_SOON_SCOPE.recommended,
  local: 'all',
  kinds: Object.freeze([]),
});

/** Show week/weekend subgroups when a month has enough titles to benefit. */
const WEEK_SUBGROUP_MIN_TITLES = 4;
const WEEK_SUBGROUP_MIN_BUCKETS = 2;

const KIND_CHIP_LABELS = Object.freeze({
  rerelease: 'Rerelease',
  event: 'Special Event',
  mystery_screening: 'Mystery Screening',
});

const KIND_DETAIL_LABELS = Object.freeze({
  ...KIND_CHIP_LABELS,
  film: null,
  other: null,
});

const LOCAL_CONFIRMED_LABEL = 'Confirmed in Seattle';
const LOCAL_UNANNOUNCED_LABEL = 'Showtimes not announced yet';

/**
 * @param {unknown} filters
 */
export function normalizeComingSoonFilters(filters) {
  const scope =
    filters?.scope === COMING_SOON_SCOPE.all
      ? COMING_SOON_SCOPE.all
      : COMING_SOON_SCOPE.recommended;
  const local =
    filters?.local === 'confirmed' ? 'confirmed' : DEFAULT_COMING_SOON_FILTERS.local;
  const allowed = new Set(COMING_SOON_KIND_FILTERS.map((opt) => opt.id));
  const kinds = Array.isArray(filters?.kinds)
    ? [...new Set(filters.kinds.filter((id) => allowed.has(id)))]
    : [];
  return { scope, local, kinds };
}

/**
 * @param {{ local?: string, kinds?: string[] }} filters
 */
export function comingSoonActiveFilterCount(filters) {
  const normalized = normalizeComingSoonFilters(filters);
  return (normalized.local === 'confirmed' ? 1 : 0) + normalized.kinds.length;
}

/**
 * @param {object | null | undefined} entry
 */
export function comingSoonEntryId(entry) {
  const joinKey =
    typeof entry?.join_key === 'string' ? entry.join_key.trim() : '';
  return joinKey || null;
}

/**
 * Confirmed canonical film_id only — never inferred tmdb_id.
 * @param {object | null | undefined} entry
 */
export function canOpenCanonicalFilmDetail(entry) {
  const filmId =
    typeof entry?.film_id === 'string' ? entry.film_id.trim() : '';
  return Boolean(entry?.identity?.film_id_confirmed === true && filmId);
}

/**
 * @param {object | null | undefined} entry
 * @returns {{ type: 'film-detail', filmKey: string, filmId: string } | { type: 'coming-soon-detail', entryId: string } | null}
 */
export function selectComingSoonOpenTarget(entry) {
  const entryId = comingSoonEntryId(entry);
  if (!entryId) return null;
  if (canOpenCanonicalFilmDetail(entry)) {
    const filmId = String(entry.film_id).trim();
    const showtimeKey = Array.isArray(entry.showtime_film_keys)
      ? entry.showtime_film_keys.find(
          (key) => typeof key === 'string' && key.trim(),
        )
      : null;
    return {
      type: 'film-detail',
      filmKey: showtimeKey ? String(showtimeKey).trim() : filmId,
      filmId,
    };
  }
  return { type: 'coming-soon-detail', entryId };
}

/**
 * @param {object | null | undefined} entry
 */
export function comingSoonKindChip(entry) {
  const kind = String(entry?.presentation?.kind || '');
  const label = KIND_CHIP_LABELS[kind];
  return label ? { id: kind, label } : null;
}

/**
 * @param {object | null | undefined} entry
 */
export function comingSoonLocalStatusLabel(entry) {
  if (
    entry?.relevance_tier === 'confirmed_local' ||
    entry?.classification === 'confirmed_local'
  ) {
    return LOCAL_CONFIRMED_LABEL;
  }
  return LOCAL_UNANNOUNCED_LABEL;
}

/**
 * First theater name, then "+ N more" for additional known venues.
 * @param {Array<{ name?: string | null }> | null | undefined} theaters
 */
export function formatComingSoonTheaterLine(theaters) {
  const names = (Array.isArray(theaters) ? theaters : [])
    .map((row) => (typeof row?.name === 'string' ? row.name.trim() : ''))
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} more`;
}

/**
 * @param {string | null | undefined} isoDate
 */
export function formatComingSoonDate(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/**
 * @param {string | null | undefined} isoDate
 */
export function formatComingSoonMonthLabel(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
  }).format(date);
}

/**
 * Monday–Sunday Pacific calendar week of an ISO date.
 * Matches Opening This Week membership (`week_bounds` in opening_this_week.py).
 * @param {string} isoDate
 */
export function comingSoonWeekStartIso(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  const daysFromMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysFromMonday);
  return utc.toISOString().slice(0, 10);
}

/**
 * Friday of the Monday–Sunday week containing `isoDate` (US theatrical weekend anchor).
 * @param {string} isoDate
 */
export function comingSoonTheatricalFridayIso(isoDate) {
  const weekStart = comingSoonWeekStartIso(isoDate);
  const [year, month, day] = weekStart.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  utc.setUTCDate(utc.getUTCDate() + 4);
  return utc.toISOString().slice(0, 10);
}

/**
 * @param {string} startIso
 */
export function comingSoonWeekEndIso(startIso) {
  const [year, month, day] = startIso.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  utc.setUTCDate(utc.getUTCDate() + 6);
  return utc.toISOString().slice(0, 10);
}

/**
 * @param {string} startIso
 * @param {string} endIso
 */
export function formatComingSoonWeekLabel(startIso, endIso) {
  return formatBrowseShortDateRange(startIso, endIso).toUpperCase();
}

/**
 * @param {string} isoDate
 */
export function comingSoonMonthKey(isoDate) {
  return isoDate.slice(0, 7);
}

/**
 * @param {object | null | undefined} entry
 */
export function isComingSoonRecommendedEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.in_recommended === 'boolean') {
    return entry.in_recommended;
  }
  // Legacy fixtures / older artifacts without in_recommended.
  if (entry.user_visible === false) return false;
  const tier =
    typeof entry.relevance_tier === 'string' ? entry.relevance_tier : null;
  if (tier) return PUBLIC_RELEVANCE_TIERS.includes(tier);
  return (
    entry.classification === 'confirmed_local' ||
    entry.classification === 'amc_announced'
  );
}

/**
 * @param {object | null | undefined} entry
 */
export function isRenderableComingSoonEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (entry.classification === 'tmdb_only') return false;
  const tier =
    typeof entry.relevance_tier === 'string' ? entry.relevance_tier : null;
  if (tier) {
    if (!ALL_RELEASES_RELEVANCE_TIERS.includes(tier)) return false;
  } else if (
    entry.classification !== 'confirmed_local' &&
    entry.classification !== 'amc_announced'
  ) {
    // Legacy fixtures without relevance_tier.
    return false;
  }
  if (typeof entry.title !== 'string' || !entry.title.trim()) return false;
  if (
    typeof entry.expected_release_date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.expected_release_date)
  ) {
    return false;
  }
  return comingSoonEntryId(entry) != null;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ scope?: string, local?: string, kinds?: string[] }} filters
 */
export function comingSoonEntryMatchesFilters(entry, filters) {
  const normalized = normalizeComingSoonFilters(filters);
  if (
    normalized.scope === COMING_SOON_SCOPE.recommended &&
    !isComingSoonRecommendedEntry(entry)
  ) {
    return false;
  }
  if (normalized.local === 'confirmed') {
    const confirmed =
      entry.relevance_tier === 'confirmed_local' ||
      entry.classification === 'confirmed_local';
    if (!confirmed) return false;
  }
  if (normalized.kinds.length === 0) return true;
  const kind = String(entry?.presentation?.kind || 'film');
  return normalized.kinds.some((filterId) => {
    const option = COMING_SOON_KIND_FILTERS.find((row) => row.id === filterId);
    return option?.kinds.includes(kind);
  });
}

/**
 * @param {object} a
 * @param {object} b
 */
export function compareComingSoonEntries(a, b) {
  const dateA = a.expected_release_date;
  const dateB = b.expected_release_date;
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  const rankA =
    RELEVANCE_SORT_RANK[a.relevance_tier] ??
    (a.classification === 'confirmed_local' ? 0 : 2);
  const rankB =
    RELEVANCE_SORT_RANK[b.relevance_tier] ??
    (b.classification === 'confirmed_local' ? 0 : 2);
  if (rankA !== rankB) return rankA - rankB;
  return String(a.title).localeCompare(String(b.title), 'en', {
    sensitivity: 'base',
  });
}

/**
 * @param {object | null | undefined} entry
 */
export function composeComingSoonRow(entry) {
  const posterUrl =
    typeof entry?.presentation?.poster_url === 'string' &&
    entry.presentation.poster_url.trim()
      ? entry.presentation.poster_url.trim()
      : null;
  const confirmed =
    entry.relevance_tier === 'confirmed_local' ||
    entry.classification === 'confirmed_local';
  return {
    entryId: comingSoonEntryId(entry),
    title: entry.title.trim(),
    posterUrl,
    hasPoster: Boolean(posterUrl),
    expectedReleaseDate: entry.expected_release_date,
    expectedDateLabel: formatComingSoonDate(entry.expected_release_date),
    classification: entry.classification,
    relevanceTier: entry.relevance_tier ?? null,
    inRecommended: isComingSoonRecommendedEntry(entry),
    localStatusLabel: comingSoonLocalStatusLabel(entry),
    theaterLine: confirmed
      ? formatComingSoonTheaterLine(entry.local_theaters)
      : null,
    kindChip: comingSoonKindChip(entry),
    openTarget: selectComingSoonOpenTarget(entry),
  };
}

/**
 * @param {object[]} rows
 */
function groupComingSoonByMonthAndWeek(rows) {
  /** @type {Map<string, { id: string, label: string, monthKey: string, entries: object[] }>} */
  const months = new Map();
  for (const row of rows) {
    const monthKey = comingSoonMonthKey(row.expectedReleaseDate);
    let month = months.get(monthKey);
    if (!month) {
      month = {
        id: monthKey,
        monthKey,
        label: formatComingSoonMonthLabel(row.expectedReleaseDate),
        entries: [],
      };
      months.set(monthKey, month);
    }
    month.entries.push(row);
  }

  return [...months.values()].map((month) => {
    /** @type {Map<string, { id: string, label: string, weekStart: string, fridayIso: string, entries: object[] }>} */
    const weeks = new Map();
    for (const row of month.entries) {
      const weekStart = comingSoonWeekStartIso(row.expectedReleaseDate);
      const fridayIso = comingSoonTheatricalFridayIso(row.expectedReleaseDate);
      let week = weeks.get(weekStart);
      if (!week) {
        week = {
          id: `${month.monthKey}-${weekStart}`,
          weekStart,
          fridayIso,
          label: formatComingSoonDate(fridayIso),
          entries: [],
        };
        weeks.set(weekStart, week);
      }
      week.entries.push(row);
    }

    const weekBuckets = [...weeks.values()];
    const useWeekSubgroups =
      month.entries.length >= WEEK_SUBGROUP_MIN_TITLES &&
      weekBuckets.length >= WEEK_SUBGROUP_MIN_BUCKETS;

    if (!useWeekSubgroups) {
      return {
        id: month.id,
        type: 'month',
        label: month.label,
        monthKey: month.monthKey,
        subgroups: [
          {
            id: `${month.id}-all`,
            label: null,
            weekStart: null,
            fridayIso: null,
            entries: month.entries,
          },
        ],
      };
    }

    return {
      id: month.id,
      type: 'month',
      label: month.label,
      monthKey: month.monthKey,
      subgroups: weekBuckets.map((week) => ({
        id: week.id,
        label: week.label,
        weekStart: week.weekStart,
        fridayIso: week.fridayIso,
        entries: week.entries,
      })),
    };
  });
}

/**
 * @param {object | null | undefined} artifact
 * @param {{ scope?: string, local?: string, kinds?: string[] }} [filters]
 * @param {{ loadStatus?: string }} [options]
 */
export function composeComingSoonPage(
  artifact,
  filters = DEFAULT_COMING_SOON_FILTERS,
  options = {},
) {
  const loadStatus = options.loadStatus ?? (artifact ? 'ready' : 'unavailable');
  const normalized = normalizeComingSoonFilters(filters);
  const activeFilterCount = comingSoonActiveFilterCount(normalized);

  if (loadStatus === 'loading') {
    return {
      pageTitle: COMING_SOON_PAGE_TITLE,
      pageTagline: COMING_SOON_PAGE_TAGLINE,
      loadStatus: 'loading',
      state: 'loading',
      countLabel: 'Loading…',
      filtersLabel: 'Filters',
      activeFilterCount,
      filters: normalized,
      scope: normalized.scope,
      sections: [],
      emptyMessage: 'Loading Coming Soon…',
      visibleCount: 0,
    };
  }

  if (loadStatus === 'unavailable' || !artifact) {
    return {
      pageTitle: COMING_SOON_PAGE_TITLE,
      pageTagline: COMING_SOON_PAGE_TAGLINE,
      loadStatus: 'unavailable',
      state: 'unavailable',
      countLabel: null,
      filtersLabel: 'Filters',
      activeFilterCount,
      filters: normalized,
      scope: normalized.scope,
      sections: [],
      emptyMessage: 'Coming Soon isn’t available right now.',
      visibleCount: 0,
    };
  }

  const renderable = (artifact.entries || []).filter(isRenderableComingSoonEntry);
  const visible = renderable
    .filter((entry) => comingSoonEntryMatchesFilters(entry, normalized))
    .slice()
    .sort(compareComingSoonEntries);

  const sections = groupComingSoonByMonthAndWeek(
    visible.map((entry) => composeComingSoonRow(entry)),
  );
  const visibleCount = visible.length;
  let state = 'ready';
  let emptyMessage = null;
  if (visibleCount === 0) {
    state = activeFilterCount > 0 ? 'filtered-empty' : 'empty';
    emptyMessage =
      activeFilterCount > 0
        ? 'No upcoming titles match these filters.'
        : normalized.scope === COMING_SOON_SCOPE.all
          ? 'No upcoming releases in the next 90 days.'
          : 'No upcoming titles in the next 90 days.';
  }

  const countLabel =
    visibleCount === 1 ? '1 title' : `${visibleCount} titles`;

  return {
    pageTitle: COMING_SOON_PAGE_TITLE,
    pageTagline: COMING_SOON_PAGE_TAGLINE,
    loadStatus: 'ready',
    state,
    countLabel,
    filtersLabel: 'Filters',
    activeFilterCount,
    filters: normalized,
    scope: normalized.scope,
    sections,
    emptyMessage,
    visibleCount,
  };
}

/**
 * @param {object | null | undefined} artifact
 * @param {string | null | undefined} entryId
 */
export function findComingSoonEntry(artifact, entryId) {
  const id = typeof entryId === 'string' ? entryId.trim() : '';
  if (!id || !artifact || !Array.isArray(artifact.entries)) return null;
  return (
    artifact.entries.find((entry) => comingSoonEntryId(entry) === id) ?? null
  );
}

/**
 * @param {object | null | undefined} artifact
 * @param {string | null | undefined} entryId
 */
export function composeComingSoonDetail(artifact, entryId) {
  const entry = findComingSoonEntry(artifact, entryId);
  if (!entry || !isRenderableComingSoonEntry(entry)) {
    return {
      found: false,
      entryId: typeof entryId === 'string' ? entryId : null,
      title: 'Coming Soon',
      emptyMessage: 'This upcoming title isn’t available.',
    };
  }

  const presentation = entry.presentation || {};
  const posterUrl =
    typeof presentation.poster_url === 'string' && presentation.poster_url.trim()
      ? presentation.poster_url.trim()
      : null;
  const backdropUrl =
    typeof presentation.backdrop_url === 'string' &&
    presentation.backdrop_url.trim()
      ? presentation.backdrop_url.trim()
      : null;
  const overview =
    typeof presentation.overview === 'string' && presentation.overview.trim()
      ? presentation.overview.trim()
      : null;
  const kind = String(presentation.kind || 'film');
  const confirmed =
    entry.relevance_tier === 'confirmed_local' ||
    entry.classification === 'confirmed_local';
  const theaters = confirmed
    ? (Array.isArray(entry.local_theaters) ? entry.local_theaters : [])
        .map((row) => ({
          theaterId:
            typeof row?.theater_id === 'string' ? row.theater_id : null,
          name: typeof row?.name === 'string' ? row.name.trim() : '',
        }))
        .filter((row) => row.name)
    : [];

  return {
    found: true,
    entryId: comingSoonEntryId(entry),
    title: entry.title.trim(),
    posterUrl,
    backdropUrl,
    hasArtwork: Boolean(posterUrl || backdropUrl),
    expectedReleaseDate: entry.expected_release_date,
    expectedDateLabel: formatComingSoonDate(entry.expected_release_date),
    kind,
    kindLabel: KIND_DETAIL_LABELS[kind] ?? null,
    overview,
    runtimeLabel: formatRuntimeLabel(presentation.runtime_minutes),
    rating:
      typeof presentation.rating === 'string' && presentation.rating.trim()
        ? presentation.rating.trim()
        : null,
    releaseYear:
      typeof presentation.release_year === 'number'
        ? presentation.release_year
        : null,
    classification: entry.classification,
    relevanceTier: entry.relevance_tier ?? null,
    inRecommended: isComingSoonRecommendedEntry(entry),
    localStatusLabel: comingSoonLocalStatusLabel(entry),
    theaters,
    openTarget: selectComingSoonOpenTarget(entry),
  };
}
