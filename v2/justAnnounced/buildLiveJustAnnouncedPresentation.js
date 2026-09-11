/**
 * Just Announced full-list presentation — newly_added_current via homeData.newlyAdded.
 *
 * Announcement recency: firstObservedAt (from first_announced_date).
 * Moviegoing metadata: opening/first-screening date via resolveJustAnnouncedOpeningDate.
 * These must stay separate — never relabel announcement as opening.
 */

import {
  formatRuntimeLabel,
  JUST_ANNOUNCED_WINDOW_DAYS,
} from '../home/shelfData.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import {
  aggregateTheatersFromRows,
  formatCompactTheaterLine,
} from '../homeShelfDetail/compactTheaterLine.js';
import { pacificTodayIso } from '../opening/openingDateCopy.js';
import { selectNextScreeningForFilm } from '../showtimes/screeningSelectors.js';
import { announcementSortValue } from './justAnnouncedListControls.js';
import {
  buildJustAnnouncedOpeningDateLabel,
  resolveJustAnnouncedOpeningDate,
} from './resolveJustAnnouncedOpeningDate.js';

/**
 * @param {object} homeData
 * @param {string} filmKey
 */
function opportunitiesForFilm(homeData, filmKey) {
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  return opportunities
    .filter((opp) => opp?.filmKey === filmKey)
    .slice()
    .sort((a, b) =>
      String(a.sortableLocalDateTime ?? '').localeCompare(
        String(b.sortableLocalDateTime ?? ''),
      ),
    );
}

/**
 * Eligible Just Announced entries: within announcement window, has firstObservedAt.
 * Does not require active showtimes — films may be saveable before Seattle times appear.
 *
 * @param {object | null | undefined} homeData
 * @param {{ windowDays?: number, now?: Date }} [options]
 * @returns {object[]}
 */
export function selectJustAnnouncedEntries(homeData, options = {}) {
  const newlyAdded = Array.isArray(homeData?.newlyAdded)
    ? homeData.newlyAdded
    : [];
  if (newlyAdded.length === 0) return [];

  const windowDays = options.windowDays ?? JUST_ANNOUNCED_WINDOW_DAYS;
  const now = options.now instanceof Date ? options.now : new Date();
  const cutoffMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  return newlyAdded
    .filter((entry) => {
      const first =
        typeof entry?.firstObservedAt === 'string'
          ? entry.firstObservedAt.trim()
          : '';
      if (!first) return false;
      const parsed = announcementSortValue(first);
      if (!Number.isFinite(parsed)) return false;
      return parsed >= cutoffMs;
    })
    .sort((a, b) => {
      const aMs = announcementSortValue(a.firstObservedAt);
      const bMs = announcementSortValue(b.firstObservedAt);
      if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
        return bMs - aMs;
      }
      return String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
        sensitivity: 'base',
      });
    });
}

/**
 * @param {object | null | undefined} homeData
 * @param {object | null} [enrichmentIndex]
 * @param {{ windowDays?: number, now?: Date, todayIso?: string }} [options]
 */
export function buildLiveJustAnnouncedPresentation(
  homeData,
  enrichmentIndex = null,
  options = {},
) {
  if (!homeData) {
    return {
      source: 'live-unavailable',
      pageTitle: 'Just Announced',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Just Announced isn’t available right now.',
      unavailableBody: 'Check back later or browse current showtimes.',
      sortLabel: 'Sort',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const newlyAdded = Array.isArray(homeData.newlyAdded)
    ? homeData.newlyAdded
    : [];
  if (newlyAdded.length === 0) {
    return {
      source: 'live-unavailable',
      pageTitle: 'Just Announced',
      pageSubtitle: null,
      countLabel: null,
      unavailableTitle: 'Just Announced isn’t ready',
      unavailableBody:
        'When new films are first observed, they’ll appear here.',
      sortLabel: 'Sort',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const entries = selectJustAnnouncedEntries(homeData, options);
  if (entries.length === 0) {
    return {
      source: 'live-empty',
      pageTitle: 'Just Announced',
      pageSubtitle: null,
      countLabel: null,
      emptyTitle: 'Nothing just announced',
      emptyBody:
        'When new showtimes are first observed in the last week, they’ll appear here.',
      sortLabel: 'Sort',
      films: [],
      sections: [],
      categoryChips: [],
      showCategoryChips: false,
      totalCount: 0,
    };
  }

  const timezone = homeData.timezone ?? 'America/Los_Angeles';
  const todayIso =
    typeof options.todayIso === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.todayIso)
      ? options.todayIso
      : options.now instanceof Date
        ? options.now.toLocaleDateString('en-CA', { timeZone: timezone })
        : pacificTodayIso(timezone);
  const presentationFilms = entries.map((entry) => {
    const filmKey = entry.filmKey;
    const resolved = resolveCanonicalFilmPresentation({
      filmKey,
      filmId: entry.filmId ?? null,
      homeData,
      enrichmentIndex,
      fallbackRecord: entry,
      context: 'home',
    });
    const homeFilm = resolved.homeFilm;
    const enriched = resolved.enriched;
    const filmOpportunities = opportunitiesForFilm(homeData, filmKey);
    const nextOpportunity =
      filmOpportunities[0] ??
      selectNextScreeningForFilm(homeData, filmKey) ??
      null;

    const openingDate = resolveJustAnnouncedOpeningDate(entry, homeData);
    const dateLabel = buildJustAnnouncedOpeningDateLabel(openingDate, todayIso);

    const theaters = aggregateTheatersFromRows(filmOpportunities);
    const theaterLine =
      theaters.length > 0
        ? formatCompactTheaterLine(theaters.map((theater) => theater.name))
        : null;
    const primaryTheater = theaters[0] ?? null;
    const hasUpcomingShowtimes = filmOpportunities.length > 0;

    const metaParts = [
      enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
      formatRuntimeLabel(enriched.runtimeMin ?? homeFilm?.runtimeMin),
      enriched.genreLine,
    ].filter(Boolean);

    return {
      filmKey,
      filmId: enriched.filmId ?? homeFilm?.filmId ?? null,
      title: enriched.displayTitle ?? homeFilm?.title ?? entry.title ?? filmKey,
      badge: null,
      metaLine: metaParts.length > 0 ? metaParts.join(' · ') : null,
      synopsis: enriched.synopsisPreview,
      posterUrl:
        enriched.posterUrl ?? homeFilm?.posterUrl ?? entry.posterUrl ?? null,
      firstObservedAt: entry.firstObservedAt ?? null,
      openingDate,
      dateLabel,
      availabilityLabel: null,
      theaterId: primaryTheater?.id ?? nextOpportunity?.theaterId ?? null,
      theaterName: theaterLine,
      theaters,
      timeLabel: nextOpportunity?.timeDisplay ?? null,
      formatLabel: null,
      formatLabels: [],
      showtimeCount:
        homeFilm?.showtimeCount ??
        entry.opportunityCount ??
        filmOpportunities.length,
      theaterCount:
        theaters.length > 0
          ? theaters.length
          : (entry.theaterCount ?? homeFilm?.theaterCount ?? 0),
      hasUpcomingShowtimes,
      whySeeIt: null,
      alsoPlaying: null,
      initiallyExpanded: false,
      hasEnrichment: enriched.hasEnrichment,
      opportunityKey: nextOpportunity?.opportunityKey ?? null,
      surfaceReason: 'just-announced',
      surfaceReasonLabel: 'Just announced',
      source: 'newly-added',
      noCurrentShowtimes: !hasUpcomingShowtimes,
    };
  });

  return {
    source: 'live-just-announced',
    pageTitle: 'Just Announced',
    pageSubtitle: null,
    countLabel: null,
    sortLabel: 'Sort',
    films: presentationFilms,
    sections: [
      {
        id: 'just-announced',
        label: 'Just Announced',
        films: presentationFilms,
      },
    ],
    categoryChips: [],
    showCategoryChips: false,
    totalCount: presentationFilms.length,
  };
}
