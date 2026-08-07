/**
 * Compose Theater Detail presentation from HomeData (T-THEA-10).
 * Suppresses empty visit sections; pricing/hours stay deferred.
 * Unknown / disabled IDs return an honest not-found presentation (no mockup fallback).
 */

import {
  THEATER_NOW_SHOWING_DETAIL_LIMIT,
  buildTheaterNowShowing,
  resolveTheaterPresentation,
} from './resolveTheaterPresentation.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { resolveFilmDetailNavParams } from '../identity/filmIdentity.js';
import {
  asCanonicalStoreFilmId,
  normalizeShowtimeFilmKey,
} from '../stores/savedFilmsStore.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function formatShowtimeVariantLabel(raw) {
  const known = formatUserFacingFormatLabel(raw);
  if (known) return known;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(trimmed)) {
    return trimmed
      .split(/[_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }
  return null;
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} theaterId
 * @param {object | null | undefined} [enrichmentIndex]
 * @returns {object}
 */
export function composeTheaterDetailPresentation(
  homeData,
  theaterId,
  enrichmentIndex = null,
) {
  const id = typeof theaterId === 'string' ? theaterId.trim() : '';
  const theater =
    (id && homeData?.theatersById?.[id]) ||
    (Array.isArray(homeData?.theaters)
      ? homeData.theaters.find((t) => t.id === id)
      : null) ||
    null;

  const disabled = theater?.enabled === false;
  const missing = !theater || !id || disabled;

  if (missing) {
    return {
      source: 'home-data',
      theaterId: id || null,
      resolved: false,
      notFound: true,
      backLabel: 'Theaters',
      name: null,
      notFoundTitle: 'Theater not found',
      notFoundBody: disabled
        ? 'This theater is not currently enabled in Reel Seattle.'
        : 'No theater matches this link in the current registry.',
      favoriteBadgeLabel: 'Favorite',
      heroImageUrl: null,
      imageAttribution: null,
      imageLicense: null,
      addressLabel: null,
      websiteLabel: 'Website',
      websiteUrl: null,
      directionsLabel: 'Directions',
      directionsUrl: null,
      descriptionPreview: null,
      descriptionFull: null,
      readMoreLabel: 'Read more',
      readLessLabel: 'Read less',
      shareLabel: 'Share theater',
      favoriteLabel: 'Favorite theater',
      stats: [],
      amenitiesTitle: 'Amenities',
      amenities: [],
      pricing: { title: 'Pricing', rows: [], linkLabel: 'View full pricing' },
      hours: { title: 'Hours', rows: [], linkLabel: 'View calendar' },
      nowShowing: { title: 'Now showing', viewAllLabel: 'View all', films: [] },
      todaysShowtimes: {
        title: "Today's showtimes",
        viewWeekLabel: 'View 7 days',
        filtersLabel: 'Filters',
        screenTabs: [],
        featuredFilm: null,
        filmGroups: [],
        screens: [],
      },
      sectionsVisible: {
        address: false,
        website: false,
        directions: false,
        description: false,
        image: false,
        screens: false,
        formats: false,
        nowShowing: false,
        amenities: false,
        stats: false,
        pricingHours: false,
        todaysShowtimes: false,
        descriptionExpand: false,
      },
      deferredMessages: {},
    };
  }

  const card = resolveTheaterPresentation({
    theater,
    homeData,
    context: 'detail',
  });

  const nowShowingFilms = buildTheaterNowShowing(homeData, id, {
    limit: THEATER_NOW_SHOWING_DETAIL_LIMIT,
    enrichmentIndex,
  }).map((film) => ({
    ...film,
    badge: null,
  }));

  const todaysShowtimes = buildTodaysShowtimes(homeData, id, enrichmentIndex);

  return {
    source: 'home-data',
    theaterId: card.id ?? (id || null),
    resolved: true,
    notFound: false,
    backLabel: 'Theaters',
    name: card.name,
    favoriteBadgeLabel: 'Favorite',
    heroImageUrl: card.heroImageUrl ?? card.imageUrl,
    imageAttribution: card.imageAttribution,
    imageLicense: card.imageLicense,
    addressLabel: card.addressLabel,
    websiteLabel: 'Website',
    websiteUrl: card.websiteUrl,
    directionsLabel: 'Directions',
    directionsUrl: card.directionsUrl,
    descriptionPreview: card.description,
    descriptionFull: card.description,
    readMoreLabel: 'Read more',
    readLessLabel: 'Read less',
    shareLabel: 'Share theater',
    favoriteLabel: 'Favorite theater',
    stats: card.stats,
    amenitiesTitle: 'Amenities',
    amenities: card.amenities,
    pricing: {
      title: 'Pricing',
      rows: [],
      linkLabel: 'View full pricing',
    },
    hours: {
      title: 'Hours',
      rows: [],
      linkLabel: 'View calendar',
    },
    nowShowing: {
      title: 'Now showing',
      viewAllLabel: 'View all',
      films: nowShowingFilms,
      emptyMessage: 'No showtimes in the next seven days.',
    },
    todaysShowtimes,
    sectionsVisible: {
      ...card.sectionsVisible,
      nowShowing: true,
      todaysShowtimes:
        (todaysShowtimes.filmGroups?.length ?? 0) > 0 ||
        todaysShowtimes.screens.length > 0,
      pricingHours: false,
      descriptionExpand:
        Boolean(card.description) && (card.description?.length ?? 0) > 180,
    },
    deferredMessages: {
      share: 'Shareable Theater Detail URLs are not available yet.',
      viewAll: 'Full theater program view is deferred.',
      viewWeek: '7-day schedule view is deferred.',
      filters: 'Showtime filters are deferred.',
      showtime: 'Open the film for ticket links when available.',
      pricing: 'Pricing is deferred until ownership and freshness policy land.',
      hours: 'Hours are deferred until ownership and freshness policy land.',
    },
  };
}

/**
 * Flat “today” showtimes for the venue (no auditorium model — G28 deferred).
 * Emits one `filmGroups` card per canonical identity; `featuredFilm` stays null
 * so live rendering does not nest every film inside the first mockup card.
 *
 * @param {object | null | undefined} homeData
 * @param {string} theaterId
 * @param {object | null | undefined} [enrichmentIndex]
 */
function buildTodaysShowtimes(homeData, theaterId, enrichmentIndex = null) {
  const empty = {
    title: "Today's showtimes",
    viewWeekLabel: 'View 7 days',
    filtersLabel: 'Filters',
    screenTabs: [{ id: 'all', label: 'All Screens' }],
    featuredFilm: null,
    filmGroups: [],
    screens: [],
  };

  if (!theaterId || !homeData) return empty;

  const opps = (Array.isArray(homeData.opportunities)
    ? homeData.opportunities
    : []
  )
    .filter((opp) => opp?.theaterId === theaterId)
    .slice()
    .sort((a, b) =>
      String(a.sortableLocalDateTime ?? '').localeCompare(
        String(b.sortableLocalDateTime ?? ''),
      ),
    );

  if (opps.length === 0) return empty;

  const firstDate = opps[0]?.localDate ?? null;
  const todayOpps = firstDate
    ? opps.filter((opp) => opp.localDate === firstDate)
    : opps.slice(0, 12);

  /** @type {Map<string, object>} */
  const filmsByKey = new Map(
    (Array.isArray(homeData.films) ? homeData.films : []).map((film) => [
      film.filmKey,
      film,
    ]),
  );

  /**
   * @type {Map<string, {
   *   id: string,
   *   filmKey: string,
   *   filmId: string | null,
   *   title: string,
   *   posterUrl: string | null,
   *   formatLabel: string | null,
   *   metaLabel: string | null,
   *   opportunityKey: string | null,
   *   sortKey: string,
   *   times: object[],
   * }>}
   */
  const byGroup = new Map();

  for (const opp of todayOpps) {
    const showtimeKey = normalizeShowtimeFilmKey(opp.filmKey);
    if (!showtimeKey) continue;
    const film = filmsByKey.get(showtimeKey) ?? null;
    const filmId =
      asCanonicalStoreFilmId(film?.filmId) ??
      asCanonicalStoreFilmId(opp.filmId);
    const parentKey =
      normalizeShowtimeFilmKey(film?.parentFilmKey) ??
      normalizeShowtimeFilmKey(opp.parentFilmKey);
    // Self-parent rows (parentFilmKey === filmKey) are parents, not variants.
    const effectiveParent =
      parentKey && parentKey !== showtimeKey ? parentKey : null;

    /** @type {string} */
    let groupKey;
    if (filmId) {
      groupKey = `id:${filmId}`;
    } else if (effectiveParent) {
      groupKey = `parent:${effectiveParent}`;
    } else {
      groupKey = `key:${showtimeKey}`;
    }

    const timeLabel =
      typeof opp.localTime === 'string' && opp.localTime
        ? opp.localTime
        : formatLocalDateLabel(opp.localDate) ?? 'Showtime';
    const formatLabel =
      (Array.isArray(opp.formatLabels) ? opp.formatLabels : [])
        .map(formatUserFacingFormatLabel)
        .find(Boolean) ?? null;
    const variantLabel =
      formatShowtimeVariantLabel(opp.screeningVariantType) ??
      formatShowtimeVariantLabel(film?.screeningVariantType) ??
      null;
    const timeRow = {
      id: opp.opportunityKey ?? `${showtimeKey}-${timeLabel}`,
      label: timeLabel,
      formatLabel: formatLabel ?? variantLabel,
      opportunityKey: opp.opportunityKey ?? null,
    };

    let bucket = byGroup.get(groupKey);
    if (!bucket) {
      const parentFilm = effectiveParent
        ? filmsByKey.get(effectiveParent) ?? null
        : null;
      const parentById =
        filmId &&
        (Array.isArray(homeData.films) ? homeData.films : []).find(
          (row) =>
            asCanonicalStoreFilmId(row?.filmId) === filmId &&
            (!normalizeShowtimeFilmKey(row?.parentFilmKey) ||
              normalizeShowtimeFilmKey(row?.parentFilmKey) ===
                normalizeShowtimeFilmKey(row?.filmKey)),
        );
      const headerFilm = parentFilm ?? parentById ?? film;
      const nav = resolveFilmDetailNavParams(
        {
          filmKey: showtimeKey,
          filmId,
          parentFilmKey: effectiveParent,
          opportunityKey: opp.opportunityKey ?? null,
        },
        homeData,
      );
      const navFilmKey = nav?.filmKey ?? effectiveParent ?? showtimeKey;
      const enriched = enrichHomeFilm(
        headerFilm ?? {
          filmKey: showtimeKey,
          filmId,
          parentFilmKey: effectiveParent,
          title: opp.title,
          posterUrl: film?.posterUrl ?? null,
          runtimeMin: film?.runtimeMin ?? null,
        },
        enrichmentIndex,
        'theater',
        homeData,
      );
      const metaParts = [
        enriched.canonicalYear != null ? String(enriched.canonicalYear) : null,
        enriched.runtimeMin != null ? `${enriched.runtimeMin} min` : null,
        enriched.usCertification,
      ].filter(Boolean);
      bucket = {
        id: groupKey,
        filmKey: navFilmKey,
        filmId: enriched.filmId ?? filmId,
        title: enriched.displayTitle ?? headerFilm?.title ?? opp.title ?? showtimeKey,
        posterUrl: enriched.posterUrl,
        formatLabel,
        metaLabel: metaParts.length ? metaParts.join(' · ') : null,
        opportunityKey: opp.opportunityKey ?? null,
        sortKey:
          String(opp.sortableLocalDateTime ?? '') ||
          `${firstDate ?? ''}${timeLabel}`,
        times: [],
      };
      byGroup.set(groupKey, bucket);
    } else {
      if (!bucket.formatLabel && (formatLabel || variantLabel)) {
        bucket.formatLabel = formatLabel ?? variantLabel;
      }
      if (!bucket.opportunityKey && opp.opportunityKey) {
        bucket.opportunityKey = opp.opportunityKey;
      }
      // Do not overwrite TMDB-resolved poster with later source-only art.
    }

    bucket.times.push(timeRow);
  }

  const filmGroups = [...byGroup.values()].sort((a, b) =>
    a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0,
  );

  // Compatibility: keep `screens` as per-group time blocks (no nested featured card).
  const screens = filmGroups.map((group) => ({
    id: group.id,
    label: group.title,
    seatingNote: null,
    times: group.times,
  }));

  return {
    title: firstDate
      ? `Showtimes · ${formatLocalDateLabel(firstDate) ?? firstDate}`
      : "Today's showtimes",
    viewWeekLabel: 'View 7 days',
    filtersLabel: 'Filters',
    screenTabs: [{ id: 'all', label: 'All films' }],
    featuredFilm: null,
    filmGroups: filmGroups.map(({ sortKey: _s, ...group }) => group),
    screens,
  };
}
