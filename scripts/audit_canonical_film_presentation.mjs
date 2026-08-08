/**
 * Current-data cross-surface canonical film presentation audit.
 * Prints to stdout; does not write committed artifacts.
 *
 * Usage: node scripts/audit_canonical_film_presentation.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../v2/adapters/buildHomeData.js';
import { selectTopOpportunities } from '../v2/adapters/selectTopOpportunities.js';
import { buildEnrichmentIndex } from '../v2/enrichment/enrichmentIndex.js';
import { enrichHomeFilm } from '../v2/enrichment/enrichHomeFilm.js';
import { resolveTmdbImageUrl } from '../v2/enrichment/resolveTmdbImageUrl.js';
import { buildSearchFilmResult } from '../v2/explore/searchResultsModel.js';
import { filmsForKeys } from '../v2/explore/exploreCatalog.js';
import { groupBrowseOpportunitiesByFilm } from '../v2/showtimes/showtimesBrowseModel.js';
import { composeTheaterDetailPresentation } from '../v2/theaters/composeTheaterDetailPresentation.js';
import { composeFilmDetailPresentation } from '../v2/filmDetail/composeFilmDetailPresentation.js';
import { listPlannerEligibleFilms } from '../v2/planner/buildPlanFilmCatalog.js';
import {
  buildInlineQuickDetail,
  buildOpeningThisWeekShelf,
} from '../v2/home/shelfData.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function posterDisagree(a, b) {
  return (a || null) !== (b || null);
}

function findFilm(home, predicate) {
  return (home.films ?? []).find(predicate) ?? null;
}

function theaterForFilm(home, filmKey) {
  const opp = (home.opportunities ?? []).find((o) => o.filmKey === filmKey);
  return opp?.theaterId ?? null;
}

function valuesAgree(map) {
  const values = Object.values(map).filter((v) => v != null && v !== '');
  if (values.length === 0) return true;
  const first = values[0];
  return values.every((v) => v === first);
}

function auditFilm(label, home, index, film) {
  if (!film) {
    return { label, ok: false, reason: 'film not found in home data' };
  }

  const homeEnriched = enrichHomeFilm(film, index, 'home', home);
  const theaterEnriched = enrichHomeFilm(film, index, 'theater', home);
  const tmdbPoster = resolveTmdbImageUrl(
    index?.byFilmId?.get(film.filmId)?.poster,
    index?.imageConfig,
    'poster',
  );
  const sourcePoster = film.posterUrl ?? null;
  const enrichmentRow = film.filmId
    ? index?.byFilmId?.get(film.filmId) ?? null
    : null;
  const tmdbTitle = enrichmentRow?.display_title ?? null;

  const search = buildSearchFilmResult(home, film, {}, index);
  const browse = groupBrowseOpportunitiesByFilm(
    (home.opportunities ?? []).filter((o) => o.filmKey === film.filmKey),
    home,
    'all',
    index,
  );
  const detail = composeFilmDetailPresentation(home, film.filmKey, null, {
    enrichmentIndex: index,
  });

  const theaterId = theaterForFilm(home, film.filmKey);
  let theaterGroup = null;
  if (theaterId) {
    const theater = composeTheaterDetailPresentation(home, theaterId, index);
    theaterGroup =
      theater.todaysShowtimes?.filmGroups?.find((g) => {
        if (film.filmId) {
          return g.filmId === film.filmId || g.filmKey === film.filmKey;
        }
        return g.filmKey === film.filmKey;
      }) ?? null;
  }

  const shelf = buildOpeningThisWeekShelf(home, index);
  const shelfCard = shelf.films.find((f) => f.filmKey === film.filmKey) ?? null;
  const quick = shelfCard
    ? buildInlineQuickDetail(home, shelfCard, index)
    : null;

  const topSelections = selectTopOpportunities(home);
  const topRaw = topSelections.find((s) => s.film?.filmKey === film.filmKey);
  const topTitle = topRaw
    ? enrichHomeFilm(topRaw.film, index, 'home', home).displayTitle
    : null;
  const topPoster = topRaw
    ? enrichHomeFilm(topRaw.film, index, 'home', home).posterUrl
    : null;

  const collection = filmsForKeys(home, [film.filmKey], index)[0] ?? null;

  const today = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const planner = listPlannerEligibleFilms(home, {
    dateIso: today,
    enrichmentIndex: index,
    now: () => new Date(`${today}T12:00:00-07:00`),
  }).find((f) => {
    if (film.filmKey && f.filmKey === film.filmKey) return true;
    // Never match null===null across unrelated source events.
    return Boolean(film.filmId) && f.filmId === film.filmId;
  });

  const titles = {
    homeResolver: homeEnriched.displayTitle,
    theaterResolver: theaterEnriched.displayTitle,
    homeTopOpportunity: topTitle,
    homeShelf: shelfCard?.title ?? null,
    homeQuickDetail: quick?.title ?? null,
    exploreCollection: collection?.title ?? null,
    search: search.title,
    showtimes: browse[0]?.title ?? null,
    theaterDetail: theaterGroup?.title ?? null,
    filmDetail: detail.hero?.title ?? detail.displayTitle ?? null,
    planner: planner?.title ?? null,
  };

  const posters = {
    homeResolver: homeEnriched.posterUrl,
    homeTopOpportunity: topPoster,
    homeShelf: shelfCard?.posterUrl ?? null,
    exploreCollection: collection?.posterUrl ?? null,
    search: search.posterUrl,
    showtimes: browse[0]?.posterUrl ?? null,
    theaterDetail: theaterGroup?.posterUrl ?? null,
    filmDetail: detail.hero?.posterUrl ?? null,
    planner: planner?.posterUrl ?? null,
  };

  const years = {
    home: homeEnriched.canonicalYear,
    search: search.year,
    filmDetail: detail.hero?.year != null ? Number(detail.hero.year) : null,
  };

  const runtimes = {
    home: homeEnriched.runtimeMin,
    search: search.runtimeMin,
    showtimes: browse[0]?.runtimeMin ?? null,
    planner: planner?.runtimeMin ?? null,
  };

  const certs = {
    home: homeEnriched.usCertification,
    search: search.rating,
  };

  const genres = {
    home: homeEnriched.genreLine,
    search: search.genre,
  };

  return {
    label,
    filmKey: film.filmKey,
    filmId: film.filmId,
    sourceTitle: film.title,
    tmdbTitle,
    sourceTitleDiffersFromTmdb: Boolean(
      tmdbTitle && film.title && film.title !== tmdbTitle,
    ),
    tmdbPoster,
    sourcePoster,
    resolvedTitle: homeEnriched.displayTitle,
    resolvedPoster: homeEnriched.posterUrl,
    sourceDiffersFromTmdb: Boolean(
      tmdbPoster && sourcePoster && posterDisagree(tmdbPoster, sourcePoster),
    ),
    titles,
    posters,
    years,
    runtimes,
    certs,
    genres,
    titleAgree: valuesAgree(titles),
    posterAgree: valuesAgree(posters),
    yearAgree: valuesAgree(years),
    runtimeAgree: valuesAgree(runtimes),
    certAgree: valuesAgree(certs),
    genreAgree: valuesAgree(genres),
    agree:
      valuesAgree(titles) &&
      valuesAgree(posters) &&
      valuesAgree(years) &&
      valuesAgree(runtimes) &&
      valuesAgree(certs) &&
      valuesAgree(genres),
    theaterId,
  };
}

function main() {
  const showtimes = loadJson('public/data/showtimes_current.json');
  const theaters = loadJson('public/data/theaters.json');
  const newly = loadJson('public/data/newly_added_current.json');
  const enrichmentDoc = loadJson('public/data/film_enrichment_current.json');
  const index = buildEnrichmentIndex(enrichmentDoc);
  const home = buildHomeData({
    showtimesCurrent: showtimes,
    theatersRegistry: theaters,
    newlyAdded: newly,
  });

  const targets = [
    {
      label: 'Ice Cream Man',
      find: (f) =>
        f.filmId === 'tmdb:1477712' ||
        (/ice cream man/i.test(f.title ?? '') && !f.parentFilmKey),
    },
    {
      label: 'The Odyssey',
      find: (f) =>
        /odyssey/i.test(f.title ?? '') &&
        f.filmId &&
        !/sensory|imax/i.test(f.title ?? ''),
    },
    {
      label: 'Spider-Man: Brand New Day',
      find: (f) =>
        /spider-man.*brand new day/i.test(f.title ?? '') &&
        !/sensory|friendly/i.test(f.title ?? ''),
    },
    {
      label: 'Beacon film',
      find: (f) => {
        const opp = (home.opportunities ?? []).find(
          (o) => o.filmKey === f.filmKey && /beacon/i.test(o.theaterName ?? ''),
        );
        return Boolean(opp && f.filmId);
      },
    },
    {
      label: 'SIFF film',
      find: (f) => {
        const opp = (home.opportunities ?? []).find(
          (o) =>
            o.filmKey === f.filmKey &&
            (/siff/i.test(o.theaterName ?? '') ||
              /siff/i.test(o.theaterId ?? '')),
        );
        return Boolean(opp && f.filmId);
      },
    },
    {
      label: 'NWFF film',
      find: (f) => {
        const opp = (home.opportunities ?? []).find(
          (o) =>
            o.filmKey === f.filmKey &&
            (/northwest film forum|nwff/i.test(o.theaterName ?? '') ||
              /nwff|northwest/i.test(o.theaterId ?? '')),
        );
        return Boolean(opp && f.filmId);
      },
    },
    {
      label: 'Source-based event (no filmId)',
      find: (f) => !f.filmId && f.posterUrl,
    },
    {
      label: 'Source title differs from TMDB',
      find: (f) => {
        if (!f.filmId) return false;
        const row = index.byFilmId.get(f.filmId);
        const tmdbTitle = row?.display_title;
        return Boolean(tmdbTitle && f.title && f.title !== tmdbTitle);
      },
    },
  ];

  /** @type {object[]} */
  const rows = [];
  for (const t of targets) {
    const film = findFilm(home, t.find);
    rows.push(auditFilm(t.label, home, index, film));
  }

  const conflicts = [];
  for (const film of home.films ?? []) {
    if (!film.filmId) continue;
    const enriched = enrichHomeFilm(film, index, 'home', home);
    if (
      enriched.posterSource === 'tmdb' &&
      film.posterUrl &&
      enriched.posterUrl &&
      film.posterUrl !== enriched.posterUrl
    ) {
      conflicts.push({
        title: enriched.displayTitle ?? film.title,
        filmId: film.filmId,
        sourceTitle: film.title,
        canonicalTitle: enriched.displayTitle,
        sourcePoster: film.posterUrl,
        resolvedPoster: enriched.posterUrl,
      });
    }
  }
  conflicts.sort((a, b) => String(a.title).localeCompare(String(b.title)));

  const report = {
    generatedAt: new Date().toISOString(),
    enrichmentStatus: index.status,
    enrichmentRowCount: index.rowCount,
    homeFilmCount: home.films?.length ?? 0,
    prioritized: rows,
    sourceVsTmdbPosterConflicts: conflicts.slice(0, 40),
    conflictCount: conflicts.length,
    allPrioritizedAgree: rows.every((r) => r.agree === true || r.ok === false),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
