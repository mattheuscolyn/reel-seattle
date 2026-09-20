/**
 * Recommended Experience UI + temporary adapter contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { composeFilmDetailPresentation } from '../../v2/filmDetail/composeFilmDetailPresentation.js';
import { toFilmDetailView } from '../../v2/filmDetail/toFilmDetailView.js';
import {
  buildRecommendedExperienceSignals,
  describeAvailabilityPattern,
  listMatchingOpportunitiesForExperience,
  resolvePremiumFormatId,
  resolveRecommendedExperience,
} from '../../v2/recommendedExperience/recommendedExperienceModel.js';
import { composeRecommendedExperienceDestination } from '../../v2/recommendedExperience/composeRecommendedExperienceDestination.js';
import { resolveShowtimeActionSheetState } from '../../v2/showtimes/showtimeActionSheetModel.js';
import { resolveHomeOpportunity } from '../../v2/showtimes/resolveHomeOpportunity.js';
import { addShowtimeToPlanner } from '../../v2/planner/addSavedFilmShowtimeToPlanner.js';
import {
  createInitialNavState,
  navigateBack,
  openFilmDetail,
  openOpportunityDetail,
  openRecommendedExperience,
} from '../../v2/navigation/navState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FD = readFileSync(
  join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'),
  'utf8',
);
const RE_SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/RecommendedExperienceSurface.jsx'),
  'utf8',
);
const APP = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const OPP_SURFACE = readFileSync(
  join(ROOT, 'v2/surfaces/OpportunityDetailSurface.jsx'),
  'utf8',
);

const NOW = new Date('2026-08-01T22:00:00.000Z');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function sampleHome() {
  return {
    films: [
      {
        filmKey: 'alpha',
        filmId: 'tmdb:100',
        title: 'Alpha',
        runtimeMin: 100,
        posterUrl: 'https://example.test/a.jpg',
      },
      {
        filmKey: 'plain',
        filmId: 'tmdb:200',
        title: 'Plain Digital',
        runtimeMin: 90,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'alpha-dolby-a',
        filmKey: 'alpha',
        theaterId: 'amc-alder',
        theaterName: 'AMC Alderwood Mall 16',
        localDate: '2026-08-01',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-01T19:00',
        formatLabels: ['Dolby Cinema'],
        ticketUrl: 'https://tickets.example/a',
        source: 'amc',
        sourceShowtimeId: 'a1',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'alpha-dolby-b',
        filmKey: 'alpha',
        theaterId: 'amc-south',
        theaterName: 'AMC Southcenter 16',
        localDate: '2026-08-01',
        localTime: '21:00',
        sortableLocalDateTime: '2026-08-01T21:00',
        formatLabels: ['Dolby Cinema'],
        ticketUrl: null,
        source: 'amc',
        sourceShowtimeId: 'a2',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'alpha-digital',
        filmKey: 'alpha',
        theaterId: 'amc-oak',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-08-01',
        localTime: '16:00',
        sortableLocalDateTime: '2026-08-01T16:00',
        formatLabels: ['Digital'],
        source: 'amc',
        sourceShowtimeId: 'a3',
        runtimeMin: 100,
      },
      {
        opportunityKey: 'plain-digital',
        filmKey: 'plain',
        theaterId: 'amc-oak',
        theaterName: 'AMC Oak Tree 6',
        localDate: '2026-08-01',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-01T18:00',
        formatLabels: ['Digital'],
        source: 'amc',
        sourceShowtimeId: 'p1',
        runtimeMin: 90,
      },
      {
        opportunityKey: 'siff-35',
        filmKey: 'plain',
        theaterId: 'siff-downtown',
        theaterName: 'SIFF Cinema Downtown',
        localDate: '2026-08-02',
        localTime: '19:30',
        sortableLocalDateTime: '2026-08-02T19:30',
        formatLabels: ['Digital'],
        source: 'siff',
        sourceShowtimeId: 's1',
        runtimeMin: 90,
      },
    ],
    leavingSoon: {
      entries: [
        {
          filmKey: 'alpha',
          timingConfidence: 'moderate',
          timingMode: 'likely_around',
          predictedEndDate: '2026-08-07',
          maxShowDate: '2026-08-06',
          predictionAsOf: '2026-08-01',
          bucket: 'leaving_soon',
        },
      ],
    },
  };
}

test('Recommended Experience card represents format/venue rather than one rigid performance', () => {
  const homeData = sampleHome();
  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'alpha',
    now: NOW,
  });
  assert.ok(experience);
  assert.equal(experience.type, 'format');
  assert.equal(experience.id, 'dolby-cinema');
  assert.equal(experience.label, 'Dolby Cinema');
  assert.equal(experience.reason, 'Best for sound and picture');
  assert.ok(experience.matchingPerformanceKeys.length >= 2);
  assert.ok(!experience.matchingPerformanceKeys.includes('alpha-digital'));
  assert.equal(experience.source, 'temporary_best_way_seed');
  assert.doesNotMatch(JSON.stringify(experience), /whenLabel|19:00 ·/);

  assert.match(FD, /Recommended Experience/);
  assert.match(FD, /recommendedExperience\.label/);
  assert.doesNotMatch(FD, /bestWay\.whenLabel/);
  assert.doesNotMatch(FD, /Best opportunity/);
});

test('card opens Recommended Experience destination, not Opportunity Scaffold', () => {
  assert.match(FD, /onOpenRecommendedExperience/);
  assert.doesNotMatch(FD, /onOpenOpportunity\?\.\(\{/);
  assert.match(APP, /openRecommendedExperience/);
  assert.match(APP, /RecommendedExperienceSurface/);
  assert.match(APP, /isRecommendedExperience/);

  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'alpha', originPrimary: 'explore' });
  nav = openRecommendedExperience(nav, {
    filmKey: 'alpha',
    experienceType: 'format',
    experienceId: 'dolby-cinema',
  });
  assert.equal(nav.surface.type, 'recommended-experience');
  assert.equal(nav.surface.experienceId, 'dolby-cinema');
  assert.equal(nav.surface.returnSurface?.type, 'film-detail');

  // Film Detail path must not open opportunity-detail for RE.
  assert.doesNotMatch(FD, /openOpportunityDetail/);
  assert.match(OPP_SURFACE, /scaffold/);
  assert.match(RE_SURFACE, /ShowtimeActionSheet/);
  assert.doesNotMatch(RE_SURFACE, /OpportunityDetailSurface|scaffold/);
});

test('destination filters to matching performances only', () => {
  const homeData = sampleHome();
  const dest = composeRecommendedExperienceDestination({
    homeData,
    filmKey: 'alpha',
    experienceType: 'format',
    experienceId: 'dolby-cinema',
    now: NOW,
  });
  assert.equal(dest.ok, true);
  assert.equal(dest.experience.label, 'Dolby Cinema');
  const keys = dest.groups.flatMap((g) =>
    g.theaters.flatMap((t) => t.times.map((time) => time.opportunityKey)),
  );
  assert.deepEqual(keys.sort(), ['alpha-dolby-a', 'alpha-dolby-b'].sort());
  assert.equal(keys.includes('alpha-digital'), false);
});

test('matching showtime preserves exact identity into canonical sheet / Planner', () => {
  assert.match(RE_SURFACE, /resolveHomeOpportunity\(homeData, time\.opportunityKey\)/);
  assert.match(RE_SURFACE, /<ShowtimeActionSheet/);

  const homeData = sampleHome();
  const opp = resolveHomeOpportunity(homeData, 'alpha-dolby-b');
  const state = resolveShowtimeActionSheetState({
    storage: memoryStorage(),
    opportunity: opp,
    filmKey: 'alpha',
    homeData,
  });
  assert.equal(state.ok, true);
  assert.equal(state.context.formatLabel, 'Dolby Cinema');
  assert.equal(state.context.theaterName, 'AMC Southcenter 16');

  const added = addShowtimeToPlanner(memoryStorage(), opp, 'alpha', {
    homeData,
    now: () => NOW,
  });
  assert.equal(added.status, 'added');
  assert.equal(added.plan.performances[0].localTime, '21:00');
  assert.equal(added.performanceKey, state.performanceKey);
});

test('observed booking language stays distinct from predicted departure', () => {
  const homeData = sampleHome();
  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'alpha',
    now: NOW,
    departureTiming: {
      primaryLabel: 'Likely leaving AMC around Aug 7',
      secondaryLabel: 'Currently booked through Aug 6',
      confidence: 'moderate',
    },
  });
  assert.match(experience.bookedThroughLabel, /Currently booked through/);
  assert.match(experience.departureTimingLabel, /Likely leaving/);
  assert.equal(experience.urgencyConfidence, 'moderate');

  const signals = buildRecommendedExperienceSignals(experience);
  const booked = signals.find((s) => s.id === 'booked');
  const departure = signals.find((s) => s.id === 'departure');
  assert.equal(booked?.kind, 'observed');
  assert.equal(departure?.kind, 'predicted');
  assert.doesNotMatch(booked.label, /final screening|last show/i);
  assert.doesNotMatch(JSON.stringify(signals), /final screening/i);
});

test('no-recommendation case is safe for plain digital films', () => {
  const homeData = sampleHome();
  // Emphasize digital-only AMC screening so temporary adapter finds no premium format
  // and no specialty venue.
  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'plain',
    opportunityKey: 'plain-digital',
    now: NOW,
  });
  assert.equal(experience, null);

  const composed = composeFilmDetailPresentation(homeData, 'plain', null, {
    now: NOW,
  });
  assert.equal(composed.recommendedExperience, null);
  assert.equal(composed.recommendedExperienceEmpty, true);

  const view = toFilmDetailView({
    mode: 'production',
    presentation: composed,
  });
  assert.equal(view.recommendedExperienceEmpty, true);
  assert.match(FD, /recommendedExperienceEmpty/);
  assert.match(FD, /\{!view\.recommendedExperienceEmpty && recommendedExperience \?/);
});

test('specialty venue can become a venue experience', () => {
  const homeData = sampleHome();
  const experience = resolveRecommendedExperience({
    homeData,
    filmKey: 'plain',
    opportunityKey: 'siff-35',
    now: NOW,
  });
  assert.ok(experience);
  assert.equal(experience.type, 'venue');
  assert.equal(experience.id, 'siff-downtown');
  assert.equal(experience.label, 'SIFF Cinema Downtown');
  assert.deepEqual(experience.matchingPerformanceKeys, ['siff-35']);
});

test('availability pattern helper only reports defensible patterns', () => {
  const pattern = describeAvailabilityPattern([
    { localTime: '19:00', localDate: '2026-08-03' }, // Mon
    { localTime: '21:00', localDate: '2026-08-04' }, // Tue
    { localTime: '20:00', localDate: '2026-08-05' }, // Wed
  ]);
  assert.equal(pattern, 'Mostly evenings');
  assert.equal(describeAvailabilityPattern([]), null);
});

test('return navigation from Recommended Experience restores Film Detail', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'alpha', originPrimary: 'home' });
  nav = openRecommendedExperience(nav, {
    filmKey: 'alpha',
    experienceType: 'format',
    experienceId: 'dolby-cinema',
  });
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'film-detail');
  assert.equal(nav.surface.filmKey, 'alpha');
});

test('Opportunity Scaffold remains for shorts / legacy callers only', () => {
  assert.match(APP, /ShortsProgramDetailSurface[\s\S]*onOpenOpportunity/);
  assert.match(APP, /handleOpenOpportunity/);
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, { filmKey: 'alpha', originPrimary: 'explore' });
  // Direct openOpportunityDetail still works if called, but Film Detail RE does not.
  nav = openOpportunityDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: 'alpha-dolby-a',
  });
  assert.equal(nav.surface.type, 'opportunity-detail');
});

test('premium format id resolution prefers IMAX 70mm over IMAX', () => {
  assert.equal(
    resolvePremiumFormatId({
      formatLabels: ['IMAX', 'IMAX 70mm'],
      theaterName: 'AMC',
    }),
    'imax-70mm',
  );
  assert.equal(
    resolvePremiumFormatId({ formatLabels: ['Digital'], theaterName: 'AMC' }),
    null,
  );
});

test('listMatchingOpportunitiesForExperience filters by identity', () => {
  const homeData = sampleHome();
  const matched = listMatchingOpportunitiesForExperience({
    homeData,
    filmKey: 'alpha',
    type: 'format',
    id: 'dolby-cinema',
    now: NOW,
  });
  assert.equal(matched.length, 2);
});
