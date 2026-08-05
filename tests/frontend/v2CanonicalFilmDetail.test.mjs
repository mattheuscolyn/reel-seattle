import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listFilmOpportunities,
  resolveFilm,
  resolveFilmFamilyKeys,
  screeningVariantLabel,
} from '../../v2/filmDetail/filmDetailModel.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXAMPLE = JSON.parse(
  readFileSync(
    join(ROOT, 'tests/fixtures/enrichment/film_enrichment_v1_example.json'),
    'utf8',
  ),
);

function miniHomeData() {
  return {
    films: [
      {
        filmKey: 'spider-man-brand-new-day',
        parentFilmKey: 'spider-man-brand-new-day',
        title: 'Spider-Man: Brand New Day',
        parentDisplayTitle: 'Spider-Man: Brand New Day',
        filmId: 'tmdb:969681',
        posterUrl: 'https://example.com/source-poster.jpg',
        runtimeMin: 145,
        screeningVariantType: 'none',
        isSpecialScreening: false,
      },
      {
        filmKey: 'spider-man-brand-new-day-sensory-friendly-screening',
        parentFilmKey: 'spider-man-brand-new-day',
        title: 'Spider-Man: Brand New Day: Sensory Friendly Screening',
        parentDisplayTitle: 'Spider-Man: Brand New Day',
        filmId: 'tmdb:969681',
        posterUrl: 'https://example.com/source-poster.jpg',
        runtimeMin: 145,
        screeningVariantType: 'sensory_friendly',
        isSpecialScreening: true,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'std-1',
        filmKey: 'spider-man-brand-new-day',
        theaterId: 'amc-pacific-place',
        theaterName: 'AMC Pacific Place',
        localDate: '2099-01-01',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2099-01-01T19:00:00',
        formatLabels: ['IMAX'],
        screeningVariantType: 'none',
        isSpecialScreening: false,
      },
      {
        opportunityKey: 'sensory-1',
        filmKey: 'spider-man-brand-new-day-sensory-friendly-screening',
        theaterId: 'amc-pacific-place',
        theaterName: 'AMC Pacific Place',
        localDate: '2099-01-01',
        timeDisplay: '4:00 PM',
        sortableLocalDateTime: '2099-01-01T16:00:00',
        formatLabels: [],
        screeningVariantType: 'sensory_friendly',
        isSpecialScreening: true,
      },
    ],
    newlyAdded: [],
  };
}

test('screening variant labels stay human-readable', () => {
  assert.equal(screeningVariantLabel('sensory_friendly'), 'Sensory Friendly');
  assert.equal(screeningVariantLabel('none'), null);
});

test('special screening and standard share family opportunities', () => {
  const home = miniHomeData();
  const family = resolveFilmFamilyKeys(
    home,
    'spider-man-brand-new-day-sensory-friendly-screening',
  );
  assert.ok(family.has('spider-man-brand-new-day'));
  assert.ok(family.has('spider-man-brand-new-day-sensory-friendly-screening'));
  const opps = listFilmOpportunities(
    home,
    'spider-man-brand-new-day-sensory-friendly-screening',
  );
  assert.equal(opps.length, 2);
});

test('Film Detail prefers parent canonical title for sensory entry', () => {
  const home = miniHomeData();
  const enrichmentIndex = buildEnrichmentIndex({
    ...EXAMPLE,
    films: [
      {
        ...EXAMPLE.films[0],
        film_id: 'tmdb:969681',
        tmdb_id: 969681,
        display_title: 'Spider-Man: Brand New Day',
        original_title: 'Spider-Man: Brand New Day',
        runtime_minutes: 145,
        us_certification: 'PG-13',
        overview: 'A new Spider-Man adventure.',
        poster: { path: '/spidey.jpg', url: null },
        backdrop: { path: '/spidey-bd.jpg', url: null },
      },
    ],
  });
  const presentation = composeFilmDetailPresentation(
    home,
    'spider-man-brand-new-day-sensory-friendly-screening',
    null,
    { enrichmentIndex },
  );
  assert.equal(presentation.resolved, true);
  assert.equal(presentation.displayTitle, 'Spider-Man: Brand New Day');
  assert.equal(presentation.hero.rating, 'PG-13');
  assert.match(presentation.hero.posterUrl, /image\.tmdb\.org/);
  assert.match(presentation.hero.backdropUrl, /image\.tmdb\.org/);
  assert.equal(presentation.filmId, 'tmdb:969681');
  const film = resolveFilm(
    home,
    'spider-man-brand-new-day-sensory-friendly-screening',
  );
  assert.equal(film.title, 'Spider-Man: Brand New Day');
});
