import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isShortsProgramClassification,
} from '../../v2/adapters/contentClassification.js';
import {
  homeFilmKeyIsShortsProgram,
  isEligibleForStandardHomeShelf,
  isShortsProgramListing,
} from '../../v2/home/excludeShortsProgramsFromStandardHome.js';
import {
  buildJustAnnouncedShelf,
  buildLeavingSoonShelf,
  buildOpeningThisWeekShelf,
  buildSpecialPresentationsShelf,
} from '../../v2/home/shelfData.js';
import { buildLiveJustAnnouncedPresentation } from '../../v2/justAnnounced/buildLiveJustAnnouncedPresentation.js';
import { buildLiveLeavingSoonPresentation } from '../../v2/leaving/buildLiveLeavingSoonPresentation.js';
import { buildLiveOpeningThisWeekPresentation } from '../../v2/opening/buildLiveOpeningPresentation.js';
import { buildLiveSpecialPresentationsPresentation } from '../../v2/specialPresentations/buildLiveSpecialPresentationsPresentation.js';
import {
  buildShortFilmsShelf,
  rankEligibleHomeShortFilms,
} from '../../v2/shortsPrograms/composeHomeShortFilms.js';
import { indexShortsProgramsArtifact } from '../../v2/shortsPrograms/shortsProgramsModel.js';
import {
  buildOpportunityFeatureContext,
  buildOpportunityFeatureVector,
} from '../../v2/topOpportunities/opportunityFeatureVector.js';
import {
  evaluateOpportunityEligibility,
  scoreOpportunityFeatureVector,
} from '../../v2/topOpportunities/opportunityRanking.js';
import { openShortsProgramDetail, createInitialNavState } from '../../v2/navigation/navState.js';

const NOW = new Date('2026-09-13T12:00:00-07:00');

function baseHome() {
  return {
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'sinners',
        title: 'Sinners',
        filmId: 'tmdb:1',
        theaterCount: 2,
        showtimeCount: 4,
        contentClassification: null,
      },
      {
        filmKey: 'like-a-local-shorts',
        title: 'Local Sightings 2026 – Like a Local (Shorts)',
        filmId: null,
        theaterCount: 1,
        showtimeCount: 1,
        contentClassification: 'shorts_program',
        sourceFilmId: 'local-sightings-2026-like-a-local',
      },
      {
        filmKey: 'dune',
        title: 'Dune',
        filmId: 'tmdb:2',
        theaterCount: 1,
        showtimeCount: 2,
        contentClassification: null,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-sinners',
        filmKey: 'sinners',
        theaterId: 'amc',
        theaterName: 'AMC',
        localDate: '2026-09-14',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-09-14T19:00:00',
        formatLabels: ['IMAX'],
        contentClassification: null,
        status: 'active',
      },
      {
        opportunityKey: 'opp-like-a-local',
        filmKey: 'like-a-local-shorts',
        theaterId: 'nwff',
        theaterName: 'Northwest Film Forum',
        localDate: '2026-09-19',
        localTime: '19:30',
        timeDisplay: '7:30 PM',
        sortableLocalDateTime: '2026-09-19T19:30:00',
        formatLabels: [],
        contentClassification: 'shorts_program',
        status: 'active',
      },
      {
        opportunityKey: 'opp-dune-imax',
        filmKey: 'dune',
        theaterId: 'amc',
        theaterName: 'AMC',
        localDate: '2026-09-15',
        localTime: '20:00',
        timeDisplay: '8:00 PM',
        sortableLocalDateTime: '2026-09-15T20:00:00',
        formatLabels: ['IMAX'],
        contentClassification: null,
        status: 'active',
      },
    ],
    newlyAdded: [
      {
        filmKey: 'sinners',
        title: 'Sinners',
        firstObservedAt: '2026-09-10',
        hasActiveShowtimes: true,
        nextShowtimeAt: '2026-09-14T19:00:00',
      },
      {
        filmKey: 'like-a-local-shorts',
        title: 'Local Sightings 2026 – Like a Local (Shorts)',
        firstObservedAt: '2026-09-11',
        hasActiveShowtimes: true,
        nextShowtimeAt: '2026-09-19T19:30:00',
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        {
          filmKey: 'sinners',
          title: 'Sinners',
          openingDate: '2026-09-10',
          openingType: 'wide',
          visibleShowtimeCount: 4,
          engagementDays: 3,
          theaterCountOnOpeningDate: 2,
        },
        {
          filmKey: 'like-a-local-shorts',
          title: 'Local Sightings 2026 – Like a Local (Shorts)',
          openingDate: '2026-09-12',
          openingType: 'limited',
          visibleShowtimeCount: 1,
          engagementDays: 1,
          theaterCountOnOpeningDate: 1,
        },
      ],
    },
    leavingSoon: {
      status: 'available',
      entries: [
        {
          filmKey: 'sinners',
          title: 'Sinners',
          bucket: 'final_days',
          bucketLabel: 'Final days',
          totalVisibleShowtimes: 2,
          maxShowDate: '2026-09-16',
        },
        {
          filmKey: 'like-a-local-shorts',
          title: 'Local Sightings 2026 – Like a Local (Shorts)',
          bucket: 'final_days',
          bucketLabel: 'Final days',
          totalVisibleShowtimes: 1,
          maxShowDate: '2026-09-19',
        },
      ],
    },
  };
}

function shortsFixture() {
  return indexShortsProgramsArtifact({
    shortsPrograms: [
      {
        shortsProgramId: 'prog:like-a-local',
        title: 'Like a Local (Shorts)',
        showtimeFilmKey: 'like-a-local-shorts',
      },
    ],
    shorts: [
      {
        shortId: 'short:dicks',
        title: "Dick's-A-Thon",
        directors: ['Dylan Young'],
        year: 2025,
        runtimeMin: 18,
        canonicalFilmId: 'tmdb:1669215',
      },
    ],
    memberships: [
      {
        shortsProgramId: 'prog:like-a-local',
        shortId: 'short:dicks',
        position: 1,
      },
    ],
  });
}

describe('Home excludes ShortsPrograms from standard shelves', () => {
  test('detection uses contentClassification, not title heuristics', () => {
    assert.equal(isShortsProgramClassification('shorts_program'), true);
    assert.equal(isShortsProgramClassification('non_film_event'), false);
    assert.equal(
      isShortsProgramListing({
        filmKey: 'anything',
        film: {
          filmKey: 'anything',
          title: 'Something (Shorts)',
          contentClassification: null,
        },
      }),
      false,
    );
    assert.equal(
      isShortsProgramListing({
        contentClassification: 'shorts_program',
        film: { title: 'Plain Title Without Marker' },
      }),
      true,
    );
  });

  test('shorts_program excluded from Top Opportunities', () => {
    const home = baseHome();
    const ctx = buildOpportunityFeatureContext(home, { now: NOW });
    const shortsOpp = home.opportunities.find(
      (row) => row.filmKey === 'like-a-local-shorts',
    );
    const ordinaryOpp = home.opportunities.find(
      (row) => row.filmKey === 'sinners',
    );
    const shortsScore = scoreOpportunityFeatureVector(
      buildOpportunityFeatureVector(shortsOpp, ctx),
    );
    const ordinaryScore = scoreOpportunityFeatureVector(
      buildOpportunityFeatureVector(ordinaryOpp, ctx),
    );
    assert.equal(shortsScore.eligible, false);
    assert.equal(shortsScore.exclusionReason, 'shorts_program');
    assert.equal(ordinaryScore.eligible, true);
    const elig = evaluateOpportunityEligibility(
      buildOpportunityFeatureVector(shortsOpp, ctx),
    );
    assert.equal(elig.exclusionReason, 'shorts_program');
  });

  test('excluded from Opening This Week shelf and See all', () => {
    const home = baseHome();
    const shelf = buildOpeningThisWeekShelf(home);
    assert.ok(shelf.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
    const seeAll = buildLiveOpeningThisWeekPresentation(home);
    assert.ok(seeAll.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      seeAll.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
  });

  test('excluded from Leaving Soon shelf and See all', () => {
    const home = baseHome();
    const shelf = buildLeavingSoonShelf(home);
    assert.ok(shelf.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
    const seeAll = buildLiveLeavingSoonPresentation(home);
    assert.ok(seeAll.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      seeAll.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
  });

  test('excluded from Special Presentations shelf and See all', () => {
    const home = baseHome();
    const shelf = buildSpecialPresentationsShelf(home);
    assert.ok(shelf.films.some((film) => film.filmKey === 'sinners' || film.filmKey === 'dune'));
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
    const seeAll = buildLiveSpecialPresentationsPresentation(home);
    assert.equal(
      seeAll.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
  });

  test('excluded from Just Announced shelf and See all', () => {
    const home = baseHome();
    const shelf = buildJustAnnouncedShelf(home, null, { now: NOW });
    assert.ok(shelf.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
    const seeAll = buildLiveJustAnnouncedPresentation(home, null, { now: NOW });
    assert.ok(seeAll.films.some((film) => film.filmKey === 'sinners'));
    assert.equal(
      seeAll.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
  });

  test('normal Films remain eligible for standard Home shelves', () => {
    const home = baseHome();
    assert.equal(
      isEligibleForStandardHomeShelf({
        filmKey: 'sinners',
        homeData: home,
      }),
      true,
    );
    assert.equal(homeFilmKeyIsShortsProgram(home, 'sinners'), false);
    assert.ok(buildOpeningThisWeekShelf(home).films.length >= 1);
    assert.ok(buildLeavingSoonShelf(home).films.length >= 1);
    assert.ok(buildJustAnnouncedShelf(home, null, { now: NOW }).films.length >= 1);
  });

  test('individual Shorts remain in Short Films; ShortsProgram does not', () => {
    const home = baseHome();
    const shortsIndex = shortsFixture();
    const shelf = buildShortFilmsShelf(home, shortsIndex, null, { now: NOW });
    assert.ok(shelf.films.some((film) => film.shortId === 'short:dicks'));
    assert.equal(
      shelf.films.some((film) => film.filmKey === 'like-a-local-shorts'),
      false,
    );
    assert.equal(
      shelf.films.some((film) => /Like a Local/i.test(film.title)),
      false,
    );
    const ranked = rankEligibleHomeShortFilms(home, shortsIndex, null, {
      now: NOW,
      maxCards: null,
    });
    assert.equal(ranked.every((film) => film.entityKind === 'short'), true);
  });

  test('All Showtimes / schedule data still contains the ShortsProgram', () => {
    const home = baseHome();
    assert.ok(
      home.opportunities.some((opp) => opp.filmKey === 'like-a-local-shorts'),
    );
    assert.ok(
      home.films.some(
        (film) =>
          film.filmKey === 'like-a-local-shorts' &&
          film.contentClassification === 'shorts_program',
      ),
    );
  });

  test('Shorts Program Detail remains routable', () => {
    let nav = openShortsProgramDetail(createInitialNavState(), {
      shortsProgramId: 'prog:like-a-local',
      originPrimary: 'home',
    });
    assert.equal(nav.surface?.type, 'shorts-program-detail');
    assert.equal(nav.surface.shortsProgramId, 'prog:like-a-local');
  });

  test('resilient join via shortsIndex when classification stamp is missing', () => {
    const home = baseHome();
    const film = home.films.find((row) => row.filmKey === 'like-a-local-shorts');
    film.contentClassification = null;
    const shortsIndex = shortsFixture();
    assert.equal(homeFilmKeyIsShortsProgram(home, 'like-a-local-shorts'), false);
    assert.equal(
      homeFilmKeyIsShortsProgram(home, 'like-a-local-shorts', shortsIndex),
      true,
    );
  });
});
