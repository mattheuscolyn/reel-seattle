import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTENT_CLASSIFICATION_SHORTS_PROGRAM } from '../../v2/adapters/contentClassification.js';
import { listV2DataArtifacts } from '../../v2/data/allowedDataRoutes.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openShortDetail,
  openShortsProgramDetail,
} from '../../v2/navigation/navState.js';
import { resolveHeaderBackLabel, resolveActivePrimaryId } from '../../v2/destinations.js';
import { composeShortDetailPresentation } from '../../v2/shortsPrograms/composeShortDetailPresentation.js';
import { composeShortsProgramDetailPresentation } from '../../v2/shortsPrograms/composeShortsProgramDetailPresentation.js';
import {
  indexShortsProgramsArtifact,
  resolveShortsProgramIdForListing,
} from '../../v2/shortsPrograms/shortsProgramsModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ARTIFACT = JSON.parse(
  readFileSync(join(ROOT, 'public/data/shorts_programs_current.json'), 'utf8'),
);

const LIKE_A_LOCAL_ID = 'nwff:program:local-sightings-2026-like-a-local';
const DICKS_ID =
  'nwff:short:local-sightings-2026-like-a-local:dick-s-a-thon';

describe('v2 shorts program UI', () => {
  it('allowlists shorts_programs_current.json', () => {
    const routes = listV2DataArtifacts().map((row) => row.route);
    assert.ok(routes.includes('/data/shorts_programs_current.json'));
  });

  it('opens Short Detail without a TMDB id', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const view = composeShortDetailPresentation({
      index,
      shortId: DICKS_ID,
      shortsProgramId: LIKE_A_LOCAL_ID,
      homeData: {
        films: [
          {
            filmKey: 'local-sightings-2026-like-a-local-shorts-2026',
            title: 'Like a Local',
            contentClassification: CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
          },
        ],
        opportunities: [
          {
            filmKey: 'local-sightings-2026-like-a-local-shorts-2026',
            theaterName: 'Northwest Film Forum',
            startsAt: '2026-09-19T19:30:00-07:00',
          },
        ],
      },
      collectionsArtifact: {
        collections: [
          {
            collectionId: 'nwff:local-sightings-film-festival-pacific-nw',
            title: 'Local Sightings Film Festival 2026',
            startDate: '2026-09-18',
            endDate: '2026-09-27',
          },
        ],
      },
    });
    assert.equal(view.resolved, true);
    assert.equal(view.canonicalFilmId, null);
    assert.equal(view.hero.title, "Dick's-A-Thon");
    assert.match(view.hero.metaLine || '', /2025/);
    assert.match(view.hero.director || '', /Dylan Young/);
    assert.equal(view.hero.genres, null);
    assert.ok(
      view.detailRows.some(
        (row) => row.label === 'Location' && /Seattle/i.test(String(row.value)),
      ),
    );
    assert.ok(!view.detailRows.some((row) => row.label === 'Source'));
    assert.ok(view.synopsis.available);
    assert.match(view.synopsis.full || '', /marathon|Drive-In|outdoors/i);
    assert.equal(view.hasShortOwnedShowtimes, false);
    assert.equal(view.screensAsPartOf?.title, 'Like a Local');
    assert.equal(view.screensAsPartOf?.shortsProgramId, LIKE_A_LOCAL_ID);
    assert.ok(view.detailRows.every((row) => row.value));
  });

  it('does not invent empty detail labels and keeps unresolved TMDB shorts valid', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const view = composeShortDetailPresentation({
      index,
      shortId: DICKS_ID,
    });
    assert.equal(view.resolved, true);
    assert.equal(view.canonicalFilmId, null);
    for (const row of view.detailRows) {
      assert.ok(row.label);
      assert.ok(String(row.value).trim());
    }
  });

  it('renders Shorts Program members in source order and joins schedule film key', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const view = composeShortsProgramDetailPresentation({
      index,
      shortsProgramId: LIKE_A_LOCAL_ID,
      homeData: {
        films: [
          {
            filmKey: 'local-sightings-2026-like-a-local-shorts-2026',
            title: 'Like a Local',
            contentClassification: CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
            posterUrl: null,
          },
        ],
        opportunities: [
          {
            opportunityKey: 'opp-like',
            filmKey: 'local-sightings-2026-like-a-local-shorts-2026',
            theaterId: 'northwest-film-forum',
            theaterName: 'Northwest Film Forum',
            localDate: '2026-09-19',
            timeDisplay: '7:30 PM',
            sortableLocalDateTime: '2026-09-19T19:30',
            formatTags: [],
            isSpecialScreening: false,
          },
        ],
        theatersById: {
          'northwest-film-forum': { id: 'northwest-film-forum', name: 'Northwest Film Forum' },
        },
        newlyAdded: [],
      },
      collectionsArtifact: {
        collections: [
          {
            collectionId: 'nwff:local-sightings-film-festival-pacific-nw',
            title: 'Local Sightings Film Festival 2026',
            startDate: '2026-09-18',
            endDate: '2026-09-27',
          },
        ],
      },
    });
    assert.equal(view.resolved, true);
    assert.equal(view.hero.title, 'Like a Local');
    assert.equal(view.showtimeFilmKey, 'local-sightings-2026-like-a-local-shorts-2026');
    assert.equal(view.members.length, 5);
    assert.deepEqual(
      view.members.map((m) => m.title),
      [
        'Aurora Ave: Sunrise to Sunset',
        "Dick's-A-Thon",
        'Roll Modelz',
        'Mother Goddess: Theater of Illusions',
        'Vanishing Seattle Presents: The Grand Illusion Cinema',
      ],
    );
    assert.equal(view.members[0].shortId.includes('aurora'), true);
    assert.ok(view.filmPresentation?.resolved);
    assert.equal(view.bestWayEmpty, false);
    assert.ok(view.bestWay);
    assert.match(view.bestWay.theaterName || '', /Film Forum/i);
    assert.match(
      `${view.bestWay.whenLabel || ''} ${view.bestWay.timeLabel || ''} ${view.bestWay.dateLabel || ''}`,
      /7:30|Sep 19|Sep\. 19/i,
    );
    assert.equal(view.today?.empty, true);
  });

  it('routes shorts_program schedule listings to Shorts Program Detail', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const programId = resolveShortsProgramIdForListing({
      film: {
        filmKey: 'local-sightings-2026-like-a-local-shorts-2026',
        sourceFilmId: 'local-sightings-2026-like-a-local',
        contentClassification: CONTENT_CLASSIFICATION_SHORTS_PROGRAM,
      },
      index,
    });
    assert.equal(programId, LIKE_A_LOCAL_ID);

    let nav = createInitialNavState();
    nav = openShortsProgramDetail(nav, {
      shortsProgramId: programId,
      originPrimary: 'home',
    });
    assert.equal(nav.surface.type, 'shorts-program-detail');
    assert.equal(resolveActivePrimaryId(nav), 'home');
  });

  it('keeps normal film listings on Film Detail', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const programId = resolveShortsProgramIdForListing({
      film: {
        filmKey: 'sugarfly-2026',
        sourceFilmId: 'local-sightings-2026-sugarfly',
        contentClassification: null,
      },
      index,
    });
    assert.equal(programId, null);

    let nav = createInitialNavState();
    nav = openFilmDetail(nav, {
      filmKey: 'sugarfly-2026',
      originPrimary: 'home',
    });
    assert.equal(nav.surface.type, 'film-detail');
  });

  it('supports Program → Short → Program back navigation', () => {
    let nav = createInitialNavState();
    nav = openShortsProgramDetail(nav, {
      shortsProgramId: LIKE_A_LOCAL_ID,
      originPrimary: 'explore',
    });
    nav = openShortDetail(nav, {
      shortId: DICKS_ID,
      shortsProgramId: LIKE_A_LOCAL_ID,
      originPrimary: 'explore',
      returnSurface: nav.surface,
    });
    assert.equal(nav.surface.type, 'short-detail');
    assert.equal(resolveHeaderBackLabel(nav), 'Program');
    nav = navigateBack(nav);
    assert.equal(nav.surface.type, 'shorts-program-detail');
    assert.equal(nav.surface.shortsProgramId, LIKE_A_LOCAL_ID);
  });

  it('resolves collection member listing keys to Shorts Program Detail', () => {
    const index = indexShortsProgramsArtifact(ARTIFACT);
    const programId = resolveShortsProgramIdForListing({
      sourceListingKey: 'nwff|id|local-sightings-2026-like-a-local',
      index,
    });
    assert.equal(programId, LIKE_A_LOCAL_ID);
  });

  it('Short Detail surface source omits today showtimes section', () => {
    const source = readFileSync(
      join(ROOT, 'v2/surfaces/ShortDetailSurface.jsx'),
      'utf8',
    );
    assert.doesNotMatch(source, /Today’s showtimes|Todays showtimes|today's showtimes/i);
    assert.match(source, /Screens as part of/);
    assert.match(source, /data-sd-has-short-owned-showtimes/);
    assert.doesNotMatch(source, /View program details/);
  });

  it('Shorts Program Detail surface omits empty Today’s showtimes section', () => {
    const source = readFileSync(
      join(ROOT, 'v2/surfaces/ShortsProgramDetailSurface.jsx'),
      'utf8',
    );
    assert.match(source, /!today\.empty/);
    assert.doesNotMatch(
      source,
      /No showtimes for today in the current window/,
    );
  });

  it('Film Detail surface remains present and unchanged in role', () => {
    const source = readFileSync(
      join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
      'utf8',
    );
    assert.match(source, /Today’s showtimes/);
    assert.match(source, /Best way to see it/);
    assert.doesNotMatch(source, /Screens as part of/);
  });
});
