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

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} theaterId
 * @returns {object}
 */
export function composeTheaterDetailPresentation(homeData, theaterId) {
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
  }).map((film) => ({
    ...film,
    badge: null,
  }));

  const todaysShowtimes = buildTodaysShowtimes(homeData, id);

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
      todaysShowtimes: todaysShowtimes.screens.length > 0,
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
 * @param {object | null | undefined} homeData
 * @param {string} theaterId
 */
function buildTodaysShowtimes(homeData, theaterId) {
  const empty = {
    title: "Today's showtimes",
    viewWeekLabel: 'View 7 days',
    filtersLabel: 'Filters',
    screenTabs: [{ id: 'all', label: 'All Screens' }],
    featuredFilm: null,
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

  /** @type {Map<string, { id: string, label: string, times: object[] }>} */
  const byFilm = new Map();
  for (const opp of todayOpps) {
    const filmKey = opp.filmKey;
    if (!filmKey) continue;
    let bucket = byFilm.get(filmKey);
    if (!bucket) {
      const film = filmsByKey.get(filmKey);
      bucket = {
        id: `film-${filmKey}`,
        label: film?.title ?? opp.title ?? filmKey,
        times: [],
      };
      byFilm.set(filmKey, bucket);
    }
    const timeLabel =
      typeof opp.localTime === 'string' && opp.localTime
        ? opp.localTime
        : formatLocalDateLabel(opp.localDate) ?? 'Showtime';
    bucket.times.push({
      id: opp.opportunityKey ?? `${filmKey}-${timeLabel}`,
      label: timeLabel,
      formatLabel:
        (Array.isArray(opp.formatLabels) ? opp.formatLabels : [])
          .map(formatUserFacingFormatLabel)
          .find(Boolean) ?? null,
    });
  }

  const screens = [...byFilm.values()];
  const firstOpp = todayOpps[0];
  const firstFilm = firstOpp ? filmsByKey.get(firstOpp.filmKey) : null;

  return {
    title: firstDate
      ? `Showtimes · ${formatLocalDateLabel(firstDate) ?? firstDate}`
      : "Today's showtimes",
    viewWeekLabel: 'View 7 days',
    filtersLabel: 'Filters',
    screenTabs: [{ id: 'all', label: 'All films' }],
    featuredFilm: firstFilm
      ? {
          filmKey: firstFilm.filmKey,
          title: firstFilm.title,
          metaLabel: null,
          formatLabel:
            (Array.isArray(firstOpp.formatLabels)
              ? firstOpp.formatLabels
              : []
            )
              .map(formatUserFacingFormatLabel)
              .find(Boolean) ?? null,
          posterUrl: firstFilm.posterUrl ?? null,
          seatingNote: null,
        }
      : null,
    screens,
  };
}
