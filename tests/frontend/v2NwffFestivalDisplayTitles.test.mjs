/**
 * NWFF Local Sightings festival display titles — evidence-based peel only.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  collectionAwareDisplayTitle,
  collectionPrefixCandidates,
  displayTitleForCollectionListing,
  filmFestivalYearAlias,
  indexCollectionDisplayTitleEvidence,
  stripKnownCollectionPrefix,
} from '../../v2/exploreCollections/collectionDisplayTitle.js';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { buildLiveJustAnnouncedPresentation } from '../../v2/justAnnounced/buildLiveJustAnnouncedPresentation.js';
import { resolveEnrichedFilmPresentation } from '../../v2/enrichment/resolveEnrichedFilmPresentation.js';
import { buildEnrichmentIndex } from '../../v2/enrichment/enrichmentIndex.js';
import {
  programDisplayTitle,
  shortDisplayTitle,
} from '../../v2/shortsPrograms/shortsProgramsModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FESTIVAL_ID = 'nwff:local-sightings-film-festival-pacific-nw';
const FESTIVAL_TITLE = 'Local Sightings Film Festival 2026';

function emptyEnrichmentIndex(films = []) {
  return buildEnrichmentIndex({
    version: 1,
    image_config: {
      secure_base_url: 'https://image.tmdb.org/t/p/',
      poster_size: 'w500',
      backdrop_size: 'w780',
    },
    films,
  });
}

function festivalCollection() {
  return {
    collectionId: FESTIVAL_ID,
    source: 'nwff',
    sourceCollectionType: 'festival',
    title: FESTIVAL_TITLE,
    titlePrefixAliases: [],
  };
}

function dadMembership() {
  return {
    collectionId: FESTIVAL_ID,
    source: 'nwff',
    sourceFilmId: 'local-sightings-2026-dad-genes',
    sourceFilmUrl: 'https://nwfilmforum.org/films/local-sightings-2026-dad-genes/',
    rawTitle: 'Local Sightings 2026 – Dad Genes',
    identityTitleCandidate: null,
    membershipEvidence: ['festival_catalogue_page_link'],
  };
}

function collectionsArtifact(extraMemberships = []) {
  return {
    collections: [festivalCollection()],
    memberships: [dadMembership(), ...extraMemberships],
  };
}

function baseShowtimes({ filmTitle, sourceFilmId, filmId = null, collectionIds = [FESTIVAL_ID] }) {
  const key = `${sourceFilmId}-2026`;
  return {
    schema_version: '1.0.0',
    timezone: 'America/Los_Angeles',
    generated_at: '2026-09-13T12:00:00-07:00',
    films: [
      {
        showtime_film_key: key,
        title: filmTitle,
        source_film_id: sourceFilmId,
        film_id: filmId,
      },
    ],
    theaters: [
      {
        id: 'northwest-film-forum',
        name: 'Northwest Film Forum',
      },
    ],
    showtimes: [
      {
        id: 'st-1',
        showtime_film_key: key,
        film_title: filmTitle,
        source_title: filmTitle,
        source: 'nwff',
        source_film_id: sourceFilmId,
        theater_id: 'northwest-film-forum',
        date: '2026-09-26',
        time: '16:00',
        status: 'active',
        attributes: collectionIds ? { collection_ids: collectionIds } : {},
      },
    ],
  };
}

test('1. Explicit Local Sightings feature peels to clean display title', () => {
  assert.equal(
    filmFestivalYearAlias(FESTIVAL_TITLE),
    'Local Sightings 2026',
  );
  assert.ok(
    collectionPrefixCandidates(FESTIVAL_TITLE).includes('Local Sightings 2026'),
  );
  assert.equal(
    collectionAwareDisplayTitle('Local Sightings 2026 – Dad Genes', {
      collectionTitle: FESTIVAL_TITLE,
    }),
    'Dad Genes',
  );
});

test('2. Unresolved (no TMDB) Local Sightings feature still gets clean title', () => {
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'Local Sightings 2026 – Dad Genes',
      sourceFilmId: 'local-sightings-2026-dad-genes',
      filmId: null,
    }),
    collectionsCurrent: collectionsArtifact(),
  });
  const film = home.films.find(
    (row) => row.sourceFilmId === 'local-sightings-2026-dad-genes',
  );
  assert.equal(film.title, 'Dad Genes');
  assert.equal(film.sourceTitle, 'Local Sightings 2026 – Dad Genes');
  assert.equal(film.filmId, null);

  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId: null,
      title: film.title,
      sourceTitle: film.sourceTitle,
    },
    enrichmentIndex: emptyEnrichmentIndex(),
    context: 'home',
  });
  assert.equal(enriched.displayTitle, 'Dad Genes');
  assert.equal(enriched.sourceTitle, 'Local Sightings 2026 – Dad Genes');
  assert.equal(enriched.hasEnrichment, false);
});

test('3. TMDB match still prefers canonical enrichment title', () => {
  const filmId = 'tmdb:999001';
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'Local Sightings 2026 – Beau Ideal',
      sourceFilmId: 'local-sightings-2026-beau-ideal',
      filmId,
    }),
    collectionsCurrent: collectionsArtifact([
      {
        collectionId: FESTIVAL_ID,
        source: 'nwff',
        sourceFilmId: 'local-sightings-2026-beau-ideal',
        sourceFilmUrl: 'https://nwfilmforum.org/films/local-sightings-2026-beau-ideal/',
        rawTitle: 'Local Sightings 2026 – Beau Ideal',
        identityTitleCandidate: null,
      },
    ]),
  });
  const film = home.films.find(
    (row) => row.sourceFilmId === 'local-sightings-2026-beau-ideal',
  );
  assert.equal(film.title, 'Beau Ideal');
  assert.equal(film.sourceTitle, 'Local Sightings 2026 – Beau Ideal');

  const enriched = resolveEnrichedFilmPresentation({
    sourceFilm: {
      filmId,
      title: film.title,
      sourceTitle: film.sourceTitle,
    },
    enrichmentIndex: emptyEnrichmentIndex([
      {
        film_id: filmId,
        display_title: 'Beau Ideal',
        original_title: 'Beau Ideal',
      },
    ]),
    context: 'film-detail',
  });
  assert.equal(enriched.displayTitle, 'Beau Ideal');
  assert.equal(enriched.canonicalTitle, 'Beau Ideal');
  assert.equal(enriched.sourceTitle, 'Local Sightings 2026 – Beau Ideal');
});

test('4. Normal NWFF non-festival film title remains unchanged', () => {
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'First Cow',
      sourceFilmId: 'first-cow',
      collectionIds: null,
    }),
    collectionsCurrent: collectionsArtifact(),
  });
  const film = home.films.find((row) => row.sourceFilmId === 'first-cow');
  assert.equal(film.title, 'First Cow');
  assert.equal(film.sourceTitle, 'First Cow');
});

test('5. Arbitrary em dash title is not stripped without festival evidence', () => {
  assert.equal(
    stripKnownCollectionPrefix('Alpha – Beta', collectionPrefixCandidates(FESTIVAL_TITLE)),
    null,
  );
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'Alpha – Beta',
      sourceFilmId: 'alpha-beta',
      collectionIds: null,
    }),
    collectionsCurrent: collectionsArtifact(),
  });
  const film = home.films.find((row) => row.sourceFilmId === 'alpha-beta');
  assert.equal(film.title, 'Alpha – Beta');
});

test('6. Local Sightings-like text without explicit festival evidence is not stripped', () => {
  assert.equal(
    displayTitleForCollectionListing(
      'Local Sightings 2026 – Dad Genes',
      indexCollectionDisplayTitleEvidence(collectionsArtifact()),
      {
        source: 'nwff',
        sourceFilmId: 'unrelated-listing',
        collectionIds: [],
      },
    ),
    'Local Sightings 2026 – Dad Genes',
  );
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'Local Sightings 2026 – Dad Genes',
      sourceFilmId: 'unrelated-listing',
      collectionIds: null,
    }),
    collectionsCurrent: collectionsArtifact(),
  });
  const film = home.films.find((row) => row.sourceFilmId === 'unrelated-listing');
  assert.equal(film.title, 'Local Sightings 2026 – Dad Genes');
});

test('7. Existing ShortsProgram display titles remain correct', () => {
  assert.equal(
    programDisplayTitle('Local Sightings 2026 – Like a Local (Shorts)', {
      collectionTitle: FESTIVAL_TITLE,
    }),
    'Like a Local',
  );
  assert.equal(
    programDisplayTitle('Local Sightings 2026 – Like a Local (Shorts)'),
    'Like a Local',
  );
});

test('8. Individual Short titles remain untouched', () => {
  assert.equal(shortDisplayTitle('Roll Modelz'), 'Roll Modelz');
  assert.equal(
    shortDisplayTitle('Local Sightings 2026 – Not A Program Title'),
    'Local Sightings 2026 – Not A Program Title',
  );
});

test('9. Just Announced uses the clean display title', () => {
  const showtimesCurrent = baseShowtimes({
    filmTitle: 'Local Sightings 2026 – Assets & Liabilities',
    sourceFilmId: 'local-sightings-2026-assets-liabilities',
  });
  const home = buildHomeData({
    showtimesCurrent,
    collectionsCurrent: collectionsArtifact([
      {
        collectionId: FESTIVAL_ID,
        source: 'nwff',
        sourceFilmId: 'local-sightings-2026-assets-liabilities',
        sourceFilmUrl:
          'https://nwfilmforum.org/films/local-sightings-2026-assets-liabilities/',
        rawTitle: 'Local Sightings 2026 – Assets & Liabilities',
        identityTitleCandidate: null,
      },
    ]),
    newlyAdded: {
      entries: [
        {
          showtime_film_key: 'local-sightings-2026-assets-liabilities-2026',
          film_title: 'Local Sightings 2026 – Assets & Liabilities',
          theater_id: 'northwest-film-forum',
          first_announced_date: '2026-09-13',
          last_seen_date: '2026-09-13',
        },
      ],
    },
  });
  const presentation = buildLiveJustAnnouncedPresentation(home, {
    enrichmentIndex: emptyEnrichmentIndex(),
    now: new Date('2026-09-14T12:00:00-07:00'),
  });
  const row = presentation.films.find((film) =>
    /assets/i.test(film.title) || /assets/i.test(film.filmKey),
  );
  assert.ok(row);
  assert.equal(row.title, 'Assets & Liabilities');
});

test('10. Film Detail uses the same clean display title when unresolved', () => {
  const home = buildHomeData({
    showtimesCurrent: baseShowtimes({
      filmTitle: 'Local Sightings 2026 – Dad Genes',
      sourceFilmId: 'local-sightings-2026-dad-genes',
      filmId: null,
    }),
    collectionsCurrent: collectionsArtifact(),
  });
  const film = home.films[0];
  const detail = composeFilmDetailPresentation(
    home,
    film.filmKey,
    null,
    { enrichmentIndex: emptyEnrichmentIndex() },
  );
  assert.equal(detail.resolved, true);
  assert.equal(detail.displayTitle, 'Dad Genes');
  assert.equal(detail.sourceTitle, 'Local Sightings 2026 – Dad Genes');
  assert.equal(detail.hero.title, 'Dad Genes');
});

test('live collections artifact derives Local Sightings year alias', () => {
  const artifact = JSON.parse(
    readFileSync(join(ROOT, 'public/data/collections_current.json'), 'utf8'),
  );
  const festival = artifact.collections.find(
    (row) => row.collectionId === FESTIVAL_ID,
  );
  assert.ok(festival);
  assert.equal(filmFestivalYearAlias(festival.title), 'Local Sightings 2026');
  const dad = artifact.memberships.find(
    (row) => row.sourceFilmId === 'local-sightings-2026-dad-genes',
  );
  assert.equal(
    collectionAwareDisplayTitle(dad.rawTitle, {
      collectionTitle: festival.title,
      titlePrefixAliases: festival.titlePrefixAliases,
    }),
    'Dad Genes',
  );
});
