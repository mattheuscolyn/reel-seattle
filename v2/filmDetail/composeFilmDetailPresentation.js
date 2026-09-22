/**
 * Film Detail presentation composer.
 * Separates real HomeData rendering from visual-fixture mode.
 */

import {
  attachHeroBadges,
  buildBestWayCard,
  buildFilmHero,
  composeFilmDetailTodaySection,
  buildWhySeeItSignals,
  resolveFilm,
  selectBestOpportunity,
  truncateSynopsis,
} from './filmDetailModel.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import { resolveCanonicalFilmPresentation } from '../enrichment/resolveCanonicalFilmPresentation.js';
import { FILM_DETAIL_DESIGN_FIXTURE } from '../fixtures/filmDetailVisualFixtures.js';
import {
  buildRecommendedExperienceSignals,
  resolveRecommendedExperience,
} from '../recommendedExperience/recommendedExperienceModel.js';

/**
 * Join metadata fragments without dangling separators.
 * @param {...(string | number | null | undefined)} parts
 */
export function joinMetaParts(...parts) {
  return parts
    .map((p) => {
      if (typeof p === 'number' && Number.isFinite(p)) return String(p);
      return typeof p === 'string' ? p.trim() : '';
    })
    .filter(Boolean)
    .join(' · ');
}

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {string | null} opportunityKey
 * @param {{
 *   visualFixtureMode?: boolean,
 *   longTitleDemo?: boolean,
 *   longTheaterDemo?: boolean,
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 * }} [options]
 */
export function composeFilmDetailPresentation(
  homeData,
  filmKey,
  opportunityKey = null,
  options = {},
) {
  const visualFixtureMode = options.visualFixtureMode === true;
  if (visualFixtureMode) {
    return composeFixturePresentation(options);
  }
  return composeRealPresentation(
    homeData,
    filmKey,
    opportunityKey,
    options.enrichmentIndex ?? null,
    options.timeFormatId,
    options.now,
  );
}

function composeFixturePresentation(options = {}) {
  const fx = FILM_DETAIL_DESIGN_FIXTURE;
  const title = options.longTitleDemo ? fx.longTitle : fx.title;
  const bestWay = {
    ...fx.bestWay,
    theaterName: options.longTheaterDemo
      ? fx.bestWay.longTheaterName
      : fx.bestWay.theaterName,
  };
  const synopsis = truncateSynopsis(fx.synopsis, 160);

  return {
    mode: /** @type {'visual-fixture'} */ ('visual-fixture'),
    source: 'design-fixture',
    resolved: true,
    filmKey: fx.filmKey,
    displayTitle: title,
    hero: {
      filmKey: fx.filmKey,
      title,
      posterUrl: fx.posterUrl,
      backdropUrl: fx.backdropUrl,
      runtimeLabel: fx.runtimeLabel,
      year: fx.year,
      rating: fx.rating,
      genres: fx.genres,
      director: fx.director,
      badges: [...fx.badges],
      metaLine: joinMetaParts(fx.year, fx.runtimeLabel, fx.rating),
      synopsis: fx.synopsis,
    },
    signals: [...fx.signals],
    signalTotal: fx.signals.length,
    departureTiming: null,
    synopsis: {
      available: true,
      preview: synopsis.preview,
      full: synopsis.full,
      needsMore: synopsis.needsMore,
      tags: [...fx.tags],
    },
    bestWay,
    bestWayEmpty: false,
    recommendedExperience: {
      type: 'format',
      id: String(bestWay.formatLabel ?? 'experience')
        .toLowerCase()
        .replace(/\s+/g, '-'),
      label: bestWay.formatLabel ?? 'Recommended experience',
      reason: bestWay.presentationLabel ?? null,
      matchingPerformanceKeys: bestWay.opportunityKey
        ? [bestWay.opportunityKey]
        : [],
      venueCount: 1,
      showtimeCount: 1,
      firstShowDate: null,
      bookedThroughLabel: null,
      availabilityPattern: null,
      departureTimingLabel: null,
      urgencyConfidence: null,
      source: 'recommended_experience_engine_v1',
      seedOpportunityKey: bestWay.opportunityKey ?? null,
    },
    recommendedExperienceSignals: [
      {
        id: 'venue',
        label: bestWay.theaterName ?? '1 venue',
        kind: 'meta',
      },
    ],
    recommendedExperienceEmpty: false,
    today: {
      localDate: null,
      rows: fx.todayRows.map((row) => ({
        ...row,
        venueMark: row.venueMark,
        accent: row.accent,
        formatChips: [...row.formatChips],
        times: [...row.times],
      })),
      empty: false,
    },
  };
}

function composeRealPresentation(
  homeData,
  filmKey,
  opportunityKey,
  enrichmentIndex = null,
  timeFormatId = '12h',
  now = new Date(),
) {
  const film = resolveFilm(homeData, filmKey);
  if (!film) {
    return {
      mode: /** @type {'real'} */ ('real'),
      source: 'home-data',
      resolved: false,
      filmKey,
      filmId: null,
      displayTitle: null,
      hero: null,
      signals: [],
      signalTotal: 0,
      synopsis: {
        available: false,
        preview: null,
        full: null,
        needsMore: false,
        tags: [],
      },
      bestWay: null,
      bestWayEmpty: true,
      recommendedExperience: null,
      recommendedExperienceSignals: [],
      recommendedExperienceEmpty: true,
      today: {
        mode: 'none_upcoming',
        localDate: null,
        rows: [],
        empty: true,
        emptyMessage: 'No upcoming showtimes currently scheduled',
        fallback: null,
      },
    };
  }

  const bestOpp = selectBestOpportunity(homeData, filmKey, opportunityKey, {
    now,
  });
  const enriched = resolveCanonicalFilmPresentation({
    filmKey: film.filmKey ?? filmKey,
    filmId: film.filmId ?? null,
    homeData,
    enrichmentIndex,
    fallbackRecord: {
      filmId: film.filmId ?? null,
      title: film.title ?? null,
      sourceTitle: film.sourceTitle ?? film.title ?? null,
      posterUrl: film.posterUrl ?? null,
      backdropUrl: film.backdropUrl ?? null,
      runtimeMin: film.runtimeMin ?? null,
      synopsis: film.synopsis ?? null,
      certification: film.certification ?? film.rating ?? null,
    },
    context: 'film-detail',
  }).enriched;

  const baseHero = buildFilmHero(film, bestOpp);
  const yearLabel =
    enriched.canonicalYear != null ? String(enriched.canonicalYear) : null;
  const genresLabel =
    enriched.genres.length > 0 ? enriched.genres.join(' · ') : null;
  const directorLabel = enriched.directors
    ? `Directed by ${enriched.directors}`
    : null;
  const runtimeLabel =
    typeof enriched.runtimeMin === 'number'
      ? formatRuntimeLabel(enriched.runtimeMin)
      : baseHero.runtimeLabel;

  const hero = attachHeroBadges(
    homeData,
    {
      ...baseHero,
      filmId: enriched.filmId,
      title: enriched.displayTitle ?? baseHero.title,
      posterUrl: enriched.posterUrl,
      backdropUrl: enriched.backdropUrl,
      runtimeLabel,
      year: yearLabel,
      genres: genresLabel,
      director: directorLabel,
      rating: enriched.usCertification,
      synopsis: enriched.overview,
      hasEnrichment: enriched.hasEnrichment,
      fieldProvenance: enriched.fieldProvenance,
    },
    film,
  );

  const signals = buildWhySeeItSignals(homeData, film);
  const departureTiming =
    signals.find((s) => s.type === 'departure_timing')?.departureTiming ?? null;
  const bestWay = buildBestWayCard(bestOpp, film, homeData);
  const recommendedExperience = resolveRecommendedExperience({
    homeData,
    filmKey,
    opportunityKey: opportunityKey ?? null,
    departureTiming,
    now,
  });
  const recommendedExperienceSignals = buildRecommendedExperienceSignals(
    recommendedExperience,
  );
  const today = composeFilmDetailTodaySection(
    homeData,
    filmKey,
    opportunityKey ?? bestOpp?.opportunityKey,
    { timeFormatId, now },
  );

  // Prefer TMDB overview; allow source synopsis only as a non-provider fallback.
  const synopsisText =
    enriched.overview ??
    (typeof film.synopsis === 'string' && film.synopsis.trim()
      ? film.synopsis.trim()
      : null);
  const synopsisParts = truncateSynopsis(synopsisText, 160);

  return {
    mode: /** @type {'real'} */ ('real'),
    source: 'home-data',
    resolved: true,
    filmKey: film.filmKey,
    filmId: enriched.filmId,
    hasEnrichment: enriched.hasEnrichment,
    displayTitle: enriched.displayTitle ?? film.title,
    canonicalTitle: enriched.canonicalTitle,
    sourceTitle: enriched.sourceTitle ?? film.title,
    hero: {
      ...hero,
      metaLine: joinMetaParts(hero.year, hero.runtimeLabel, hero.rating),
    },
    signals,
    signalTotal: signals.length,
    departureTiming,
    synopsis: {
      available: Boolean(synopsisText),
      preview: synopsisParts.preview,
      full: synopsisParts.full,
      needsMore: synopsisParts.needsMore,
      tags: [],
    },
    bestWay,
    bestWayEmpty: !bestWay,
    recommendedExperience,
    recommendedExperienceSignals,
    recommendedExperienceEmpty: !recommendedExperience,
    today,
  };
}
