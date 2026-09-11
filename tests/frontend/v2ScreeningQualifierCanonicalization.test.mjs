import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveCanonicalFilmKey,
  isSafeScreeningQualifierVariant,
  SAFE_SCREENING_QUALIFIER_VARIANTS,
} from '../../v2/adapters/resolveCanonicalFilmKey.js';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  resolveFilm,
  resolveFilmFamilyKeys,
  listFilmOpportunities,
  screeningVariantLabel,
} from '../../v2/filmDetail/filmDetailModel.js';
import { resolveFilmDetailNavParams } from '../../v2/identity/filmIdentity.js';

const THEATER = {
  id: 'amc-pacific-place-11',
  name: 'AMC Pacific Place 11',
  source: 'amc',
  enabled: true,
  type: 'chain',
  city: 'Seattle',
};

function baseShowtimesArtifact({ films, showtimes }) {
  return {
    schema_version: '1.0.0',
    generated_at: '2026-09-10T12:00:00-07:00',
    timezone: 'America/Los_Angeles',
    window: { start_date: '2026-09-10', end_date: '2026-09-20' },
    sources_included: ['amc', 'siff'],
    stats: {
      showtime_count: showtimes.length,
      film_count: films.length,
      theater_count: 1,
    },
    theaters: [THEATER],
    films,
    showtimes,
  };
}

function homeFrom({ films, showtimes }) {
  return buildHomeData({
    showtimesCurrent: baseShowtimesArtifact({ films, showtimes }),
    theatersRegistry: { theaters: [THEATER] },
    newlyAdded: null,
    pipelineReport: null,
  });
}

test('safe qualifier allowlist includes early_access and excludes editions', () => {
  assert.ok(SAFE_SCREENING_QUALIFIER_VARIANTS.includes('early_access'));
  assert.equal(isSafeScreeningQualifierVariant('early_access'), true);
  assert.equal(isSafeScreeningQualifierVariant('double_feature'), false);
  assert.equal(isSafeScreeningQualifierVariant('anniversary'), false);
  assert.equal(isSafeScreeningQualifierVariant('directors_cut'), false);
});

test('resolveCanonicalFilmKey merges early_access onto parent', () => {
  const result = resolveCanonicalFilmKey({
    showtimeFilmKey: 'weight-early-access',
    parentFilmKey: 'weight',
    screeningVariantType: 'early_access',
    listingFilmId: 'tmdb:1433583',
    parentListingFilmId: 'tmdb:1433583',
  });
  assert.deepEqual(result, {
    filmKey: 'weight',
    merged: true,
    blockedReason: null,
  });
});

test('resolveCanonicalFilmKey blocks confirmed TMDB conflicts', () => {
  const result = resolveCanonicalFilmKey({
    showtimeFilmKey: 'weight-early-access',
    parentFilmKey: 'weight',
    screeningVariantType: 'early_access',
    listingFilmId: 'tmdb:1',
    parentListingFilmId: 'tmdb:2',
  });
  assert.equal(result.merged, false);
  assert.equal(result.filmKey, 'weight-early-access');
  assert.equal(result.blockedReason, 'tmdb_conflict');
});

test('resolveCanonicalFilmKey does not merge double features', () => {
  const result = resolveCanonicalFilmKey({
    showtimeFilmKey: 'space-seed-star-trek-ii-double-feature',
    parentFilmKey: 'space-seed',
    screeningVariantType: 'double_feature',
  });
  assert.equal(result.merged, false);
  assert.equal(result.blockedReason, 'non_merge_variant');
});

test('NORMAL + EARLY ACCESS merge into one film with two screenings', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'weight',
        title: 'The Weight',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'none',
        film_id: 'tmdb:1433583',
        source_title: 'The Weight',
      },
      {
        showtime_film_key: 'weight-early-access',
        title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        is_special_screening: true,
        film_id: 'tmdb:1433583',
        source_title: 'The Weight Early Access',
      },
    ],
    showtimes: [
      {
        id: 'st-weight-1',
        date: '2026-09-12',
        time: '19:00',
        time_display: '7:00 PM',
        theater_id: THEATER.id,
        showtime_film_key: 'weight',
        film_title: 'The Weight',
        source_title: 'The Weight',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'none',
        status: 'active',
        format_tags: [],
        source: 'amc',
        source_film_id: 'amc-weight',
      },
      {
        id: 'st-weight-ea',
        date: '2026-09-11',
        time: '20:00',
        time_display: '8:00 PM',
        theater_id: THEATER.id,
        showtime_film_key: 'weight-early-access',
        film_title: 'The Weight Early Access',
        source_title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        is_special_screening: true,
        status: 'active',
        format_tags: [],
        source: 'amc',
        source_film_id: 'amc-weight-ea',
      },
    ],
  });

  assert.equal(home.films.length, 1);
  const film = home.films[0];
  assert.equal(film.filmKey, 'weight');
  assert.equal(film.title, 'The Weight');
  assert.deepEqual(film.aliasKeys, ['weight-early-access']);
  assert.equal(film.screeningVariantType, null);
  assert.equal(film.filmId, 'tmdb:1433583');
  assert.equal(home.opportunities.length, 2);

  const normal = home.opportunities.find((o) => o.showtimeFilmKey === 'weight');
  const early = home.opportunities.find(
    (o) => o.showtimeFilmKey === 'weight-early-access',
  );
  assert.ok(normal);
  assert.ok(early);
  assert.equal(normal.filmKey, 'weight');
  assert.equal(early.filmKey, 'weight');
  assert.equal(normal.screeningVariantType, 'none');
  assert.equal(early.screeningVariantType, 'early_access');
  assert.equal(early.sourceTitle, 'The Weight Early Access');
  assert.equal(screeningVariantLabel(early.screeningVariantType), 'Early Access');

  const detail = resolveFilm(home, 'weight-early-access');
  assert.ok(detail);
  assert.equal(detail.filmKey, 'weight');
  assert.equal(detail.title, 'The Weight');
  const opps = listFilmOpportunities(home, 'weight');
  assert.equal(opps.length, 2);
});

test('EARLY ACCESS only still resolves clean parent title', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'weight-early-access',
        title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        is_special_screening: true,
        film_id: null,
        source_title: 'The Weight Early Access',
      },
    ],
    showtimes: [
      {
        id: 'st-weight-ea-only',
        date: '2026-09-11',
        time: '20:00',
        theater_id: THEATER.id,
        showtime_film_key: 'weight-early-access',
        film_title: 'The Weight Early Access',
        source_title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        is_special_screening: true,
        status: 'active',
        format_tags: [],
        source: 'siff',
      },
    ],
  });

  assert.equal(home.films.length, 1);
  assert.equal(home.films[0].filmKey, 'weight');
  assert.equal(home.films[0].title, 'The Weight');
  assert.equal(home.opportunities[0].screeningVariantType, 'early_access');
  assert.equal(home.opportunities[0].source, 'siff');
  assert.equal(home.opportunities[0].sourceTitle, 'The Weight Early Access');
});

test('unmatched parent variants can still merge without TMDB', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'indie',
        title: 'Indie',
        parent_film_key: 'indie',
        screening_variant_type: 'none',
        film_id: null,
      },
      {
        showtime_film_key: 'indie-early-access',
        title: 'Indie Early Access',
        parent_film_key: 'indie',
        parent_display_title: 'Indie',
        screening_variant_type: 'early_access',
        film_id: null,
      },
    ],
    showtimes: [
      {
        id: 'st-indie',
        date: '2026-09-12',
        time: '18:00',
        theater_id: THEATER.id,
        showtime_film_key: 'indie',
        film_title: 'Indie',
        parent_film_key: 'indie',
        screening_variant_type: 'none',
        status: 'active',
        format_tags: [],
        source: 'nwff',
      },
      {
        id: 'st-indie-ea',
        date: '2026-09-11',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'indie-early-access',
        film_title: 'Indie Early Access',
        source_title: 'Indie Early Access',
        parent_film_key: 'indie',
        parent_display_title: 'Indie',
        screening_variant_type: 'early_access',
        status: 'active',
        format_tags: [],
        source: 'nwff',
      },
    ],
  });
  assert.equal(home.films.length, 1);
  assert.equal(home.films[0].filmKey, 'indie');
  assert.equal(home.films[0].filmId, null);
});

test('TMDB conflict does not silently merge', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'weight',
        title: 'The Weight',
        parent_film_key: 'weight',
        film_id: 'tmdb:111',
      },
      {
        showtime_film_key: 'weight-early-access',
        title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        film_id: 'tmdb:222',
      },
    ],
    showtimes: [
      {
        id: 'st-a',
        date: '2026-09-12',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'weight',
        film_title: 'The Weight',
        parent_film_key: 'weight',
        screening_variant_type: 'none',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
      {
        id: 'st-b',
        date: '2026-09-11',
        time: '20:00',
        theater_id: THEATER.id,
        showtime_film_key: 'weight-early-access',
        film_title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
    ],
  });
  assert.equal(home.films.length, 2);
  assert.ok(home.films.some((f) => f.filmKey === 'weight'));
  assert.ok(home.films.some((f) => f.filmKey === 'weight-early-access'));
  assert.ok(
    home.warnings.some((w) => w.code === 'screening_qualifier_tmdb_conflict'),
  );
});

test('Director’s Cut style listings are not auto-collapsed', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'movie',
        title: 'Movie',
        film_id: 'tmdb:1',
      },
      {
        showtime_film_key: 'movie-directors-cut',
        title: "Movie Director's Cut",
        parent_film_key: 'movie',
        parent_display_title: 'Movie',
        // Not a safe screening qualifier — edition/cut identity.
        screening_variant_type: 'none',
        film_id: 'tmdb:1',
      },
    ],
    showtimes: [
      {
        id: 'st-movie',
        date: '2026-09-12',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'movie',
        film_title: 'Movie',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
      {
        id: 'st-dc',
        date: '2026-09-12',
        time: '21:00',
        theater_id: THEATER.id,
        showtime_film_key: 'movie-directors-cut',
        film_title: "Movie Director's Cut",
        parent_film_key: 'movie',
        parent_display_title: 'Movie',
        screening_variant_type: 'none',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
    ],
  });
  assert.equal(home.films.length, 2);
});

test('double-feature listings stay distinct film cards', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'space-seed',
        title: 'Space Seed',
      },
      {
        showtime_film_key: 'space-seed-star-trek-ii-double-feature',
        title: 'Space Seed + Star Trek II Double Feature',
        parent_film_key: 'space-seed-star-trek-ii-double-feature',
        screening_variant_type: 'double_feature',
        is_special_screening: true,
      },
    ],
    showtimes: [
      {
        id: 'st-ss',
        date: '2026-09-12',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'space-seed',
        film_title: 'Space Seed',
        status: 'active',
        format_tags: [],
        source: 'siff',
      },
      {
        id: 'st-df',
        date: '2026-09-12',
        time: '21:00',
        theater_id: THEATER.id,
        showtime_film_key: 'space-seed-star-trek-ii-double-feature',
        film_title: 'Space Seed + Star Trek II Double Feature',
        parent_film_key: 'space-seed-star-trek-ii-double-feature',
        screening_variant_type: 'double_feature',
        is_special_screening: true,
        status: 'active',
        format_tags: [],
        source: 'siff',
      },
    ],
  });
  assert.equal(home.films.length, 2);
});

test('IMAX format_variant collapses to parent while format labels remain', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'sinners',
        title: 'Sinners',
        film_id: 'tmdb:10',
      },
      {
        showtime_film_key: 'sinners-imax',
        title: 'Sinners IMAX',
        parent_film_key: 'sinners',
        parent_display_title: 'Sinners',
        screening_variant_type: 'format_variant',
        film_id: 'tmdb:10',
      },
    ],
    showtimes: [
      {
        id: 'st-s',
        date: '2026-09-12',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'sinners',
        film_title: 'Sinners',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
      {
        id: 'st-imax',
        date: '2026-09-12',
        time: '20:00',
        theater_id: THEATER.id,
        showtime_film_key: 'sinners-imax',
        film_title: 'Sinners IMAX',
        parent_film_key: 'sinners',
        parent_display_title: 'Sinners',
        screening_variant_type: 'format_variant',
        status: 'active',
        format_tags: ['IMAX'],
        source: 'amc',
      },
    ],
  });
  assert.equal(home.films.length, 1);
  assert.equal(home.films[0].filmKey, 'sinners');
  const imaxOpp = home.opportunities.find(
    (o) => o.showtimeFilmKey === 'sinners-imax',
  );
  assert.deepEqual(imaxOpp.formatLabels, ['IMAX']);
  assert.equal(imaxOpp.screeningVariantType, 'format_variant');
});

test('P0A durable filmId nav still resolves after qualifier merge', () => {
  const home = homeFrom({
    films: [
      {
        showtime_film_key: 'weight',
        title: 'The Weight',
        film_id: 'tmdb:1433583',
      },
      {
        showtime_film_key: 'weight-early-access',
        title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        film_id: 'tmdb:1433583',
      },
    ],
    showtimes: [
      {
        id: 'st-weight-1',
        date: '2026-09-12',
        time: '19:00',
        theater_id: THEATER.id,
        showtime_film_key: 'weight',
        film_title: 'The Weight',
        parent_film_key: 'weight',
        screening_variant_type: 'none',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
      {
        id: 'st-weight-ea',
        date: '2026-09-11',
        time: '20:00',
        theater_id: THEATER.id,
        showtime_film_key: 'weight-early-access',
        film_title: 'The Weight Early Access',
        parent_film_key: 'weight',
        parent_display_title: 'The Weight',
        screening_variant_type: 'early_access',
        status: 'active',
        format_tags: [],
        source: 'amc',
      },
    ],
  });

  const nav = resolveFilmDetailNavParams(
    {
      filmKey: 'weight-early-access',
      parentFilmKey: 'weight',
      filmId: 'tmdb:1433583',
    },
    home,
  );
  assert.equal(nav.filmKey, 'weight');
  assert.equal(nav.filmId, 'tmdb:1433583');

  const family = resolveFilmFamilyKeys(home, 'weight-early-access');
  assert.ok(family.has('weight'));
  assert.ok(family.has('weight-early-access'));
});
