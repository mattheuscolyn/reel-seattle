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
import { buildEnrichmentIndex } from '../v2/enrichment/enrichmentIndex.js';
import { enrichHomeFilm } from '../v2/enrichment/enrichHomeFilm.js';
import { resolveTmdbImageUrl } from '../v2/enrichment/resolveTmdbImageUrl.js';
import { buildSearchFilmResult } from '../v2/explore/searchResultsModel.js';
import { groupBrowseOpportunitiesByFilm } from '../v2/showtimes/showtimesBrowseModel.js';
import { composeTheaterDetailPresentation } from '../v2/theaters/composeTheaterDetailPresentation.js';
import { composeFilmDetailPresentation } from '../v2/filmDetail/composeFilmDetailPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function posterDisagree(a, b) {
  const x = a || null;
  const y = b || null;
  return x !== y;
}

function findFilm(home, predicate) {
  return (home.films ?? []).find(predicate) ?? null;
}

function theaterForFilm(home, filmKey) {
  const opp = (home.opportunities ?? []).find((o) => o.filmKey === filmKey);
  return opp?.theaterId ?? null;
}

function auditFilm(label, home, index, film) {
  if (!film) {
    return { label, ok: false, reason: 'film not found in home data' };
  }

  const enriched = enrichHomeFilm(film, index, 'theater', home);
  const tmdbPoster = resolveTmdbImageUrl(
    index?.byFilmId?.get(film.filmId)?.poster,
    index?.imageConfig,
    'poster',
  );
  const sourcePoster = film.posterUrl ?? null;

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

  const surfaces = {
    resolver: enriched.posterUrl,
    search: search.posterUrl,
    showtimes: browse[0]?.posterUrl ?? null,
    theaterDetail: theaterGroup?.posterUrl ?? null,
    filmDetail: detail.hero?.posterUrl ?? null,
  };

  const posters = Object.values(surfaces).filter((p) => p != null);
  const agree =
    posters.length === 0 || posters.every((p) => p === posters[0]);

  return {
    label,
    filmKey: film.filmKey,
    filmId: film.filmId,
    title: enriched.displayTitle ?? film.title,
    tmdbId: film.filmId,
    tmdbPoster,
    sourcePoster,
    resolvedPoster: enriched.posterUrl,
    sourceDiffersFromTmdb: Boolean(
      tmdbPoster && sourcePoster && posterDisagree(tmdbPoster, sourcePoster),
    ),
    surfaces,
    agree,
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
        /ice cream man/i.test(f.title ?? '') && !f.parentFilmKey,
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
  ];

  /** @type {object[]} */
  const rows = [];
  for (const t of targets) {
    const film = findFilm(home, t.find);
    rows.push(auditFilm(t.label, home, index, film));
  }

  // Extra: films where source poster differs from TMDB (top conflicts).
  const conflicts = [];
  for (const film of home.films ?? []) {
    if (!film.filmId) continue;
    const enriched = enrichHomeFilm(film, index, 'theater', home);
    if (
      enriched.posterSource === 'tmdb' &&
      film.posterUrl &&
      enriched.posterUrl &&
      film.posterUrl !== enriched.posterUrl
    ) {
      conflicts.push({
        title: enriched.displayTitle ?? film.title,
        filmId: film.filmId,
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
    allPrioritizedAgree: rows.every((r) => r.agree !== false || !r.filmId),
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
