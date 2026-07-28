/**
 * Film Detail presentation composer.
 * Separates real HomeData rendering from visual-fixture mode.
 */

import {
  attachHeroBadges,
  buildBestWayCard,
  buildFilmHero,
  buildTodaysShowtimes,
  buildWhySeeItSignals,
  resolveFilm,
  selectBestOpportunity,
  truncateSynopsis,
} from './filmDetailModel.js';
import { FILM_DETAIL_DESIGN_FIXTURE } from '../fixtures/filmDetailVisualFixtures.js';

/**
 * Join metadata fragments without dangling separators.
 * @param {...(string | null | undefined)} parts
 */
export function joinMetaParts(...parts) {
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
    .join(' · ');
}

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {string | null} opportunityKey
 * @param {{ visualFixtureMode?: boolean, longTitleDemo?: boolean, longTheaterDemo?: boolean }} [options]
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
  return composeRealPresentation(homeData, filmKey, opportunityKey);
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
    synopsis: {
      available: true,
      preview: synopsis.preview,
      full: synopsis.full,
      needsMore: synopsis.needsMore,
      tags: [...fx.tags],
    },
    bestWay,
    bestWayEmpty: false,
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

function composeRealPresentation(homeData, filmKey, opportunityKey) {
  const film = resolveFilm(homeData, filmKey);
  if (!film) {
    return {
      mode: /** @type {'real'} */ ('real'),
      source: 'home-data',
      resolved: false,
      filmKey,
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
      today: { localDate: null, rows: [], empty: true },
    };
  }

  const bestOpp = selectBestOpportunity(homeData, filmKey, opportunityKey);
  const baseHero = buildFilmHero(film, bestOpp);
  const hero = attachHeroBadges(homeData, baseHero, film);
  const signals = buildWhySeeItSignals(homeData, film);
  const bestWay = buildBestWayCard(bestOpp, film, homeData);
  const today = buildTodaysShowtimes(
    homeData,
    filmKey,
    opportunityKey ?? bestOpp?.opportunityKey,
  );

  // Real enrichment fields are not in public artifacts today.
  const synopsisText =
    typeof film.synopsis === 'string' && film.synopsis.trim()
      ? film.synopsis.trim()
      : null;
  const synopsisParts = truncateSynopsis(synopsisText, 160);

  return {
    mode: /** @type {'real'} */ ('real'),
    source: 'home-data',
    resolved: true,
    filmKey: film.filmKey,
    displayTitle: film.title,
    hero: {
      ...hero,
      metaLine: joinMetaParts(
        hero.year,
        hero.runtimeLabel,
        hero.rating,
      ),
    },
    signals,
    signalTotal: signals.length,
    synopsis: {
      available: Boolean(synopsisText),
      preview: synopsisParts.preview,
      full: synopsisParts.full,
      needsMore: synopsisParts.needsMore,
      tags: [],
    },
    bestWay,
    bestWayEmpty: !bestWay,
    today,
  };
}
