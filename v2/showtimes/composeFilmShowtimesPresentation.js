/**
 * Film Showtimes page presentation — film-scoped, live HomeData.
 *
 * Reuses family opportunities, shared eligibility (past-time exclusion),
 * selectBestOpportunity ranking, and canonical enrichHomeFilm presentation.
 */

import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import {
  listFilmOpportunities,
  opportunityFormatLabel,
  resolveFilm,
  screeningVariantLabel,
  buildVenueMark,
} from '../filmDetail/filmDetailModel.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatLocalDateLabel } from '../topOpportunities/topOpportunityFormat.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import { resolveTheaterPresentation } from '../theaters/resolveTheaterPresentation.js';
import {
  opportunitySortableKey,
  pacificSortableDateTime,
  parseLocalTimeMinutes,
} from './showtimeEligibility.js';
import {
  SHOWTIMES_BROWSE_TIME_RANGES,
  normalizeBrowseFormat,
} from './showtimesBrowseModel.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

export const FILM_SHOWTIMES_SORT_OPTIONS = Object.freeze([
  Object.freeze({ id: 'time', label: 'By time' }),
  Object.freeze({ id: 'theater', label: 'By theater' }),
]);

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} filmKey
 * @param {{
 *   selectedDate?: string | null,
 *   theaterId?: string | null,
 *   opportunityKey?: string | null,
 *   formatKeys?: string[],
 *   timeRangeId?: string,
 *   sortId?: 'time' | 'theater',
 *   enrichmentIndex?: object | null,
 *   now?: Date | (() => Date),
 *   timeFormatId?: string,
 * }} [options]
 */
export function composeFilmShowtimesPresentation(
  homeData,
  filmKey,
  options = {},
) {
  const nowFn =
    typeof options.now === 'function'
      ? options.now
      : () => options.now ?? new Date();
  const today = pacificDateString(nowFn());
  const nowKey = pacificSortableDateTime(nowFn());
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const timeFormatId =
    typeof options.timeFormatId === 'string' && options.timeFormatId
      ? options.timeFormatId
      : '12h';
  const formatKeys = Array.isArray(options.formatKeys)
    ? options.formatKeys.filter(Boolean)
    : [];
  const timeRangeId =
    typeof options.timeRangeId === 'string' && options.timeRangeId
      ? options.timeRangeId
      : 'any';
  const sortId = options.sortId === 'theater' ? 'theater' : 'time';
  const filterTheaterId =
    typeof options.theaterId === 'string' && options.theaterId.trim()
      ? options.theaterId.trim()
      : null;

  const film = resolveFilm(homeData, filmKey);
  if (!film || !filmKey) {
    return emptyPresentation({
      filmKey: filmKey ?? null,
      today,
      reason: 'Film not found.',
    });
  }

  const enriched = enrichHomeFilm(film, enrichmentIndex, 'showtimes', homeData);
  const metaParts = [
    enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
    formatRuntimeLabel(enriched.runtimeMin),
    enriched.usCertification,
  ].filter(Boolean);

  const allFamilyOpps = listFilmOpportunities(homeData, film.filmKey ?? filmKey);
  /** Upcoming calendar days only; today excludes already-started times. */
  const eligibleOpps = [];
  /** @type {Map<string, object>} */
  const deduped = new Map();
  for (const opp of allFamilyOpps) {
    const localDate = opp?.localDate;
    if (typeof localDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      continue;
    }
    if (localDate < today) continue;
    const sortable = opportunitySortableKey(opp);
    if (!sortable) continue;
    if (localDate === today && sortable < nowKey) continue;
    // Content identity (not opportunityKey) so parent/variant duplicates collapse.
    const dedupe = filmShowtimesDedupeKey(opp);
    if (deduped.has(dedupe)) continue;
    deduped.set(dedupe, opp);
    eligibleOpps.push(opp);
  }

  const dates = [...new Set(eligibleOpps.map((o) => o.localDate))].sort();
  const requestedDate =
    typeof options.selectedDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.selectedDate)
      ? options.selectedDate
      : null;
  let selectedDate = requestedDate;
  if (!selectedDate || !dates.includes(selectedDate)) {
    selectedDate = dates.includes(today) ? today : dates[0] ?? null;
  }

  const dateChips = dates.map((iso) => {
    const isToday = iso === today;
    return {
      id: iso,
      label: isToday ? 'Today' : formatLocalDateLabel(iso) ?? iso,
      isToday,
    };
  });

  const formatOptions = collectFormatOptions(eligibleOpps);
  const theaterOptions = collectTheaterOptions(eligibleOpps);

  const dayUnfiltered = eligibleOpps.filter(
    (o) => o.localDate === selectedDate,
  );
  let dayOpps = dayUnfiltered;
  if (filterTheaterId) {
    dayOpps = dayOpps.filter((o) => o.theaterId === filterTheaterId);
  }
  if (formatKeys.length > 0) {
    const wanted = new Set(formatKeys);
    dayOpps = dayOpps.filter((o) =>
      (o.formatLabels ?? []).some((raw) => {
        const normalized = normalizeBrowseFormat(raw);
        return normalized && wanted.has(normalized.key);
      }),
    );
  }
  if (timeRangeId !== 'any') {
    const range = SHOWTIMES_BROWSE_TIME_RANGES.find((r) => r.id === timeRangeId);
    if (range && Number.isFinite(range.minMin) && Number.isFinite(range.maxMin)) {
      dayOpps = dayOpps.filter((o) => {
        const mins = parseLocalTimeMinutes(o.localTime);
        return mins != null && mins >= range.minMin && mins <= range.maxMin;
      });
    }
  }

  const filtersActive =
    formatKeys.length > 0 ||
    timeRangeId !== 'any' ||
    Boolean(filterTheaterId);

  // Best option uses premium + earliest ranking only — not entry emphasis.
  const bestOnDate = selectBestFromPool(dayOpps);

  const emphasizedKey =
    (options.opportunityKey &&
      dayOpps.some((o) => o.opportunityKey === options.opportunityKey) &&
      options.opportunityKey) ||
    bestOnDate?.opportunityKey ||
    null;

  const theaterGroups = buildTheaterGroups(dayOpps, {
    emphasizedKey,
    bestKey: bestOnDate?.opportunityKey ?? null,
    sortId,
    homeData,
    timeFormatId,
  });

  const selectedOpp =
    dayOpps.find((o) => o.opportunityKey === options.opportunityKey) ??
    dayOpps.find((o) => o.opportunityKey === emphasizedKey) ??
    null;

  let emptyMessage = 'No showtimes for this date.';
  if (!selectedDate) {
    emptyMessage = 'No upcoming showtimes in the current window.';
  } else if (dayUnfiltered.length === 0) {
    emptyMessage =
      selectedDate === today
        ? 'No remaining showtimes today.'
        : 'No showtimes for this date.';
  } else if (filtersActive && dayOpps.length === 0) {
    emptyMessage = 'No showtimes match these filters.';
  } else if (selectedDate === today) {
    emptyMessage = 'No remaining showtimes today.';
  }

  return {
    resolved: true,
    filmKey: film.filmKey ?? filmKey,
    filmId: enriched.filmId ?? film.filmId ?? null,
    entryFilmKey: film.entryFilmKey ?? film.filmKey ?? filmKey,
    parentFilmKey: film.parentFilmKey ?? null,
    title: enriched.displayTitle ?? film.title ?? 'Showtimes',
    sourceTitle: film.title ?? null,
    posterUrl: enriched.posterUrl ?? null,
    metaLine: metaParts.length ? metaParts.join(' · ') : null,
    genreLine: enriched.genreLine ?? null,
    runtimeMin: enriched.runtimeMin ?? null,
    usCertification: enriched.usCertification ?? null,
    canonicalYear: enriched.canonicalYear ?? null,
    hasEnrichment: enriched.hasEnrichment === true,
    today,
    selectedDate,
    dateChips,
    filterTheaterId,
    formatKeys,
    formatOptions,
    theaterOptions,
    timeRangeId,
    timeRangeOptions: SHOWTIMES_BROWSE_TIME_RANGES,
    sortId,
    sortOptions: FILM_SHOWTIMES_SORT_OPTIONS,
    theaterGroups,
    showtimeCount: dayOpps.length,
    theaterCount: theaterGroups.length,
    empty: theaterGroups.length === 0,
    emptyMessage,
    bestOpportunityKey: bestOnDate?.opportunityKey ?? null,
    selectedOpportunityKey: selectedOpp?.opportunityKey ?? null,
    selectedOpportunity: selectedOpp,
    timezoneNote: 'All times in PT',
  };
}

/**
 * @param {{ filmKey: string | null, today: string, reason: string }} args
 */
function emptyPresentation({ filmKey, today, reason }) {
  return {
    resolved: false,
    filmKey,
    filmId: null,
    entryFilmKey: filmKey,
    parentFilmKey: null,
    title: 'Showtimes',
    sourceTitle: null,
    posterUrl: null,
    metaLine: null,
    genreLine: null,
    runtimeMin: null,
    usCertification: null,
    canonicalYear: null,
    hasEnrichment: false,
    today,
    selectedDate: null,
    dateChips: [],
    filterTheaterId: null,
    formatKeys: [],
    formatOptions: [],
    theaterOptions: [],
    timeRangeId: 'any',
    timeRangeOptions: SHOWTIMES_BROWSE_TIME_RANGES,
    sortId: 'time',
    sortOptions: FILM_SHOWTIMES_SORT_OPTIONS,
    theaterGroups: [],
    showtimeCount: 0,
    theaterCount: 0,
    empty: true,
    emptyMessage: reason,
    bestOpportunityKey: null,
    selectedOpportunityKey: null,
    selectedOpportunity: null,
    timezoneNote: 'All times in PT',
  };
}

/**
 * Dedupe key for film-scoped showtimes: same theater/slot/format/variant.
 * Ignores opportunityKey so parent/variant echoes of one screening collapse.
 * @param {object} opportunity
 */
function filmShowtimesDedupeKey(opportunity) {
  const formats = Array.isArray(opportunity?.formatLabels)
    ? opportunity.formatLabels
        .map((t) => String(t).toLowerCase())
        .sort()
        .join(',')
    : '';
  const variant =
    typeof opportunity?.screeningVariantType === 'string'
      ? opportunity.screeningVariantType.trim().toLowerCase()
      : '';
  return [
    opportunity?.theaterId ?? '',
    opportunity?.localDate ?? '',
    opportunity?.localTime ?? '',
    formats,
    variant,
  ].join('|');
}

/**
 * @param {object[]} opportunities
 */
function collectFormatOptions(opportunities) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const opp of opportunities) {
    for (const raw of opp.formatLabels ?? []) {
      const normalized = normalizeBrowseFormat(raw);
      if (normalized) map.set(normalized.key, normalized.label);
    }
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Same ranking spirit as selectBestOpportunity, scoped to an already-filtered pool.
 * Entry emphasis is handled separately as selection — not as “best.”
 * @param {object[]} opps
 */
function selectBestFromPool(opps) {
  if (!Array.isArray(opps) || opps.length === 0) return null;
  const scored = [...opps].sort((a, b) => {
    const pa = premiumScore(a);
    const pb = premiumScore(b);
    if (pa !== pb) return pb - pa;
    const ka = opportunitySortableKey(a) ?? '';
    const kb = opportunitySortableKey(b) ?? '';
    if (ka !== kb) return ka < kb ? -1 : 1;
    return String(a.opportunityKey ?? '').localeCompare(String(b.opportunityKey ?? ''));
  });
  return scored[0] ?? null;
}

const PREMIUM_FORMAT_HINTS = Object.freeze([
  '70mm',
  'imax',
  'dolby',
  '35mm',
  '4dx',
  'screenx',
]);

/**
 * @param {object} opp
 */
function premiumScore(opp) {
  const tags = (opp.formatLabels ?? []).map((t) => String(t).toLowerCase());
  let score = 0;
  for (const hint of PREMIUM_FORMAT_HINTS) {
    if (tags.some((t) => t.includes(hint))) score += 2;
  }
  return score;
}

/**
 * @param {object[]} opportunities
 */
function collectTheaterOptions(opportunities) {
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const opp of opportunities) {
    const id = opp.theaterId;
    if (typeof id !== 'string' || !id.trim()) continue;
    map.set(id, opp.theaterName ?? id);
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} theaterId
 */
function lookupTheaterCardMeta(homeData, theaterId) {
  if (!theaterId || !homeData) {
    return { locationLabel: null, thumbnailUrl: null };
  }
  const theater =
    homeData.theatersById?.[theaterId] ??
    (Array.isArray(homeData.theaters)
      ? homeData.theaters.find((t) => t?.id === theaterId)
      : null);
  if (!theater) {
    return { locationLabel: null, thumbnailUrl: null };
  }
  const card = resolveTheaterPresentation({
    theater,
    homeData,
    context: 'list',
  });
  return {
    locationLabel:
      card.neighborhood ?? card.city ?? card.addressLabel ?? null,
    thumbnailUrl: card.thumbnailUrl ?? card.imageUrl ?? null,
  };
}

/**
 * Attributes shared by every screening in a theater group.
 * @param {{ formatLabel: string | null, variantLabel: string | null }[]} times
 */
function computeSharedChips(times) {
  if (!Array.isArray(times) || times.length === 0) return [];
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const time of times) {
    const labels = [time.variantLabel, time.formatLabel].filter(Boolean);
    const unique = [...new Set(labels)];
    for (const label of unique) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count === times.length)
    .map(([label]) => ({ label }));
}

/**
 * @param {object[]} dayOpps
 * @param {{
 *   emphasizedKey: string | null,
 *   bestKey: string | null,
 *   sortId: string,
 *   homeData?: object | null,
 *   timeFormatId?: string,
 * }} opts
 */
function buildTheaterGroups(dayOpps, opts) {
  const timeFormatId = opts.timeFormatId ?? '12h';
  /** @type {Map<string, object>} */
  const byTheater = new Map();
  for (const opp of dayOpps) {
    const theaterId = opp.theaterId ?? opp.theaterName ?? opp.opportunityKey;
    if (!byTheater.has(theaterId)) {
      const mark = buildVenueMark(opp.theaterName, opp.theaterId);
      const meta = lookupTheaterCardMeta(opts.homeData, opp.theaterId);
      byTheater.set(theaterId, {
        theaterId: opp.theaterId ?? theaterId,
        theaterName: opp.theaterName ?? 'Theater',
        venueMark: mark.label,
        accent: mark.accent,
        locationLabel: meta.locationLabel,
        thumbnailUrl: meta.thumbnailUrl,
        times: [],
        earliestSortable: opportunitySortableKey(opp) ?? '9999',
      });
    }
    const group = byTheater.get(theaterId);
    const format = opportunityFormatLabel(opp);
    const variant = screeningVariantLabel(opp.screeningVariantType, opp);
    const sortable = opportunitySortableKey(opp) ?? '';
    if (sortable && sortable < group.earliestSortable) {
      group.earliestSortable = sortable;
    }
    group.times.push({
      id: opp.opportunityKey,
      opportunityKey: opp.opportunityKey,
      filmKey: opp.filmKey,
      timeDisplay: formatDisplayClock(
        opp.timeDisplay ?? opp.localTime ?? '',
        timeFormatId,
      ),
      localTime: opp.localTime ?? null,
      formatLabel: format,
      variantLabel: variant,
      detailLabel: null,
      ticketUrl: normalizeExternalTicketUrl(opp.ticketUrl),
      isBest: opp.opportunityKey === opts.bestKey,
      isSelected: opp.opportunityKey === opts.emphasizedKey,
      screeningVariantType: opp.screeningVariantType ?? null,
      isSpecialScreening: opp.isSpecialScreening === true,
      sortable,
    });
  }

  const groups = [...byTheater.values()].map((group) => {
    group.times.sort((a, b) => {
      if (a.sortable !== b.sortable) return a.sortable < b.sortable ? -1 : 1;
      return String(a.opportunityKey).localeCompare(String(b.opportunityKey));
    });
    const sharedChips = computeSharedChips(group.times);
    const sharedSet = new Set(sharedChips.map((c) => c.label));
    for (const time of group.times) {
      const distinct = [time.variantLabel, time.formatLabel].filter(
        (label) => label && !sharedSet.has(label),
      );
      time.detailLabel = distinct.length ? [...new Set(distinct)].join(' · ') : null;
    }
    group.sharedChips = sharedChips;
    group.isBestCard = group.times.some((t) => t.isBest);
    return group;
  });

  if (opts.sortId === 'theater') {
    groups.sort((a, b) =>
      String(a.theaterName).localeCompare(String(b.theaterName)),
    );
  } else {
    groups.sort((a, b) => {
      if (a.earliestSortable !== b.earliestSortable) {
        return a.earliestSortable < b.earliestSortable ? -1 : 1;
      }
      return String(a.theaterName).localeCompare(String(b.theaterName));
    });
  }

  return groups.map(({ earliestSortable: _e, ...group }) => group);
}
