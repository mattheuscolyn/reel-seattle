import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHomeData } from '../../v2/adapters/buildHomeData.js';
import {
  HOME_OPENING_SHELF_MAX_CARDS,
  rankOpeningShelfEntries,
} from '../../v2/home/openingShelfRanking.js';
import {
  buildInlineQuickDetail,
  buildOpeningThisWeekShelf,
} from '../../v2/home/shelfData.js';
import { buildLiveOpeningThisWeekPresentation } from '../../v2/opening/buildLiveOpeningPresentation.js';
import { buildOpeningDateCopy, pacificTodayIso } from '../../v2/opening/openingDateCopy.js';
import { resolveOpeningEntryPresentation } from '../../v2/opening/resolveOpeningEntryPresentation.js';

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/frontend');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8'));
}

function makeOpeningEntry(overrides = {}) {
  return {
    filmKey: 'film-a',
    parentFilmKey: 'film-a',
    showtimeFilmKey: 'film-a',
    filmId: null,
    title: 'Alpha',
    openingDate: '2026-07-21',
    openingType: 'theatrical',
    categoryId: 'new',
    categoryLabel: 'New',
    categoryBadge: 'New',
    theaterCountOnOpeningDate: 2,
    theatersOnOpeningDate: ['t1'],
    visibleShowtimeCount: 3,
    engagementDays: 3,
    confidence: 'high',
    ...overrides,
  };
}

function baseHome(overrides = {}) {
  return {
    generatedAt: '2026-07-20T12:00:00Z',
    leavingSoonExcluded: true,
    timezone: 'America/Los_Angeles',
    films: [
      {
        filmKey: 'film-a',
        title: 'Alpha',
        posterUrl: 'https://example.com/a.jpg',
        runtimeMin: 110,
        showtimeCount: 3,
        theaterCount: 2,
      },
      {
        filmKey: 'film-b',
        title: 'Beta',
        posterUrl: null,
        runtimeMin: null,
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    opportunities: [
      {
        opportunityKey: 'opp-a',
        filmKey: 'film-a',
        theaterId: 't1',
        theaterName: 'SIFF Uptown',
        localDate: '2026-07-21',
        localTime: '19:00',
        timeDisplay: '7:00 PM',
        sortableLocalDateTime: '2026-07-21T19:00',
        formatLabels: ['35mm'],
        ticketUrl: null,
      },
    ],
    newlyAdded: [
      {
        filmKey: 'film-a',
        title: 'Alpha',
        posterUrl: 'https://example.com/a.jpg',
        firstObservedAt: '2026-07-20',
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [makeOpeningEntry()],
    },
    ...overrides,
  };
}

test('Home Opening shelf reads openingThisWeek not newlyAdded', () => {
  const home = baseHome({
    newlyAdded: [
      {
        filmKey: 'film-z',
        title: 'Should Not Appear',
        firstObservedAt: '2026-07-20',
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [makeOpeningEntry({ filmKey: 'film-a', title: 'Alpha' })],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films.length, 1);
  assert.equal(shelf.films[0].title, 'Alpha');
  assert.equal(shelf.films[0].source, 'opening-this-week-verified');
});

test('missing Opening artifact does not fall back to Newly Added', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'unavailable',
      entries: [],
    },
    newlyAdded: [
      {
        filmKey: 'film-a',
        title: 'Alpha',
        firstObservedAt: '2026-07-20',
      },
    ],
  });
  const shelf = buildOpeningThisWeekShelf(home);
  assert.equal(shelf.status, 'unavailable');
  assert.equal(shelf.films.length, 0);
});

test('Home Opening shelf caps at six cards', () => {
  const entries = Array.from({ length: 8 }, (_, index) =>
    makeOpeningEntry({
      filmKey: `film-${index}`,
      parentFilmKey: `film-${index}`,
      showtimeFilmKey: `film-${index}`,
      title: `Film ${index}`,
      openingDate: `2026-07-${String(21 + index).padStart(2, '0')}`,
    }),
  );
  const ranked = rankOpeningShelfEntries(entries);
  assert.equal(ranked.length, HOME_OPENING_SHELF_MAX_CARDS);
  const shelf = buildOpeningThisWeekShelf(
    baseHome({ openingThisWeek: { status: 'available', timezone: 'America/Los_Angeles', entries } }),
  );
  assert.equal(shelf.films.length, 6);
});

test('ranking prioritizes New then Events then Revivals', () => {
  const entries = [
    makeOpeningEntry({
      filmKey: 'revival-1',
      title: 'Revival One',
      openingType: 'repertory',
      categoryId: 'revival',
      categoryBadge: 'Revival',
      visibleShowtimeCount: 2,
    }),
    makeOpeningEntry({
      filmKey: 'event-1',
      title: 'Event One',
      openingType: 'event',
      categoryId: 'event',
      categoryBadge: 'Special Event',
      visibleShowtimeCount: 1,
      engagementDays: 1,
    }),
    makeOpeningEntry({
      filmKey: 'new-1',
      title: 'New One',
      categoryId: 'new',
      categoryBadge: 'New',
    }),
    makeOpeningEntry({
      filmKey: 'new-2',
      title: 'New Two',
      openingDate: '2026-07-22',
      categoryId: 'new',
      categoryBadge: 'New',
    }),
  ];
  const ranked = rankOpeningShelfEntries(entries);
  assert.deepEqual(
    ranked.map((entry) => entry.filmKey),
    ['new-1', 'new-2', 'event-1', 'revival-1'],
  );
});

test('stale one-night Event with zero showtimes is deprioritized off Home', () => {
  const entries = [
    makeOpeningEntry({
      filmKey: 'new-1',
      title: 'New One',
      categoryId: 'new',
      categoryBadge: 'New',
    }),
    makeOpeningEntry({
      filmKey: 'stale-event',
      title: 'Past Screen Unseen',
      openingType: 'event',
      categoryId: 'event',
      categoryBadge: 'Special Event',
      visibleShowtimeCount: 0,
      engagementDays: 1,
    }),
    makeOpeningEntry({
      filmKey: 'active-event',
      title: 'Active Screen Unseen',
      openingType: 'event',
      categoryId: 'event',
      categoryBadge: 'Special Event',
      visibleShowtimeCount: 2,
      engagementDays: 1,
    }),
  ];
  const ranked = rankOpeningShelfEntries(entries);
  assert.deepEqual(
    ranked.map((entry) => entry.filmKey),
    ['new-1', 'active-event'],
  );
});

test('no-New week still renders Events and Revivals', () => {
  const entries = [
    makeOpeningEntry({
      filmKey: 'event-1',
      title: 'Event One',
      openingType: 'event',
      categoryId: 'event',
      categoryBadge: 'Special Event',
      visibleShowtimeCount: 1,
      engagementDays: 1,
    }),
    makeOpeningEntry({
      filmKey: 'revival-1',
      title: 'Revival One',
      openingType: 'repertory',
      categoryId: 'revival',
      categoryBadge: 'Revival',
      visibleShowtimeCount: 2,
    }),
  ];
  const shelf = buildOpeningThisWeekShelf(
    baseHome({ openingThisWeek: { status: 'available', timezone: 'America/Los_Angeles', entries } }),
  );
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.films.length, 2);
  assert.equal(shelf.films[0].badge, 'Special Event');
});

test('Home badges use normalized category labels', () => {
  const shelf = buildOpeningThisWeekShelf(baseHome());
  assert.equal(shelf.films[0].badge, 'New');
  assert.equal(shelf.films[0].badge, shelf.films[0].surfaceReasonLabel);
});

test('Home date copy uses artifact openingDate in compact mode', () => {
  const today = pacificTodayIso();
  const future = new Date(`${today}T12:00:00`);
  future.setDate(future.getDate() + 2);
  const futureIso = future.toLocaleDateString('en-CA', {
    timeZone: 'America/Los_Angeles',
  });
  const copy = buildOpeningDateCopy({
    openingDate: futureIso,
    todayIso: today,
    compact: true,
    hasUpcomingShowtimes: true,
  });
  assert.match(copy.dateLabel, /^Opens /);

  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [makeOpeningEntry({ openingDate: futureIso })],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  assert.match(shelf.films[0].metaLabel, /^Opens /);
});

test('one-night event compact copy', () => {
  const copy = buildOpeningDateCopy({
    openingDate: '2026-07-21',
    engagementDays: 1,
    categoryId: 'event',
    todayIso: '2026-07-20',
    compact: true,
    hasUpcomingShowtimes: true,
  });
  assert.match(copy.dateLabel, /^One night · /);
});

test('zero entries uses honest Home empty state', () => {
  const shelf = buildOpeningThisWeekShelf(
    baseHome({ openingThisWeek: { status: 'empty', timezone: 'America/Los_Angeles', entries: [] } }),
  );
  assert.equal(shelf.status, 'unavailable');
  assert.match(shelf.emptyTitle, /Nothing opening/i);
});

test('provisional Opening disclaimer removed from Home shelf', () => {
  const shelf = buildOpeningThisWeekShelf(baseHome());
  assert.equal(shelf.status, 'ready');
  assert.equal(shelf.reason, null);
  assert.equal(String(shelf.reason ?? '').includes('recently added'), false);
  const shelfSrc = readFileSync(join(ROOT, 'v2/home/shelfData.js'), 'utf8');
  assert.equal(shelfSrc.includes('newly-added-provisional'), false);
});

test('inline quick detail uses category badge not Newly added', () => {
  const shelf = buildOpeningThisWeekShelf(baseHome());
  const detail = buildInlineQuickDetail(baseHome(), shelf.films[0]);
  assert.equal(detail.surfaceReasonLabel, 'New');
  assert.equal(detail.opportunityKey, 'opp-a');
});

test('no-current-opportunity card omits opportunity key', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          visibleShowtimeCount: 0,
        }),
      ],
    },
    opportunities: [],
  });
  const shelf = buildOpeningThisWeekShelf(home);
  assert.equal(shelf.films[0].nextOpportunityKey, null);
  const detail = buildInlineQuickDetail(home, shelf.films[0]);
  assert.equal(detail.opportunityKey, null);
});

test('homeData.newlyAdded still exists after Opening migration', () => {
  const home = buildHomeData({
    showtimesCurrent: loadFixture('v2_showtimes_home_mini.json'),
    theatersRegistry: loadFixture('v2_theaters_home_mini.json'),
    newlyAdded: loadFixture('v2_newly_added_home_mini.json'),
    openingThisWeek: loadFixture('v2_opening_this_week_mini.json'),
    pipelineReport: loadFixture('pipeline_report_mini.json'),
  });
  assert.ok(home.newlyAdded.length > 0);
  assert.ok(home.openingThisWeek.entries.length > 0);
});

test('dedicated Opening surface path unchanged in dedicated builder', () => {
  const dedicatedSrc = readFileSync(
    join(ROOT, 'v2/opening/buildLiveOpeningPresentation.js'),
    'utf8',
  );
  assert.match(dedicatedSrc, /live-opening-artifact/);
  assert.equal(dedicatedSrc.includes('newlyAdded'), false);
});

test('Home and dedicated surface resolve the same final category', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'film-a',
          title: 'Alpha',
          openingType: 'theatrical',
        }),
      ],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(shelf.films[0].badge, dedicated.films[0].badge);
  assert.equal(shelf.films[0].categoryId, dedicated.films[0].categoryId);
});

test('limited classic with enrichment releaseYear is Revival on both surfaces', () => {
  const home = baseHome({
    films: [
      {
        filmKey: 'classic-limited',
        title: 'Classic Limited',
        filmId: 'tmdb:27019',
        showtimeCount: 1,
        theaterCount: 1,
      },
    ],
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'classic-limited',
          parentFilmKey: 'classic-limited',
          showtimeFilmKey: 'classic-limited',
          filmId: 'tmdb:27019',
          title: 'Classic Limited',
          openingType: 'limited',
          openingDate: '2026-07-21',
          visibleShowtimeCount: 1,
          engagementDays: 1,
        }),
      ],
    },
  });
  const enrichmentIndex = {
    status: 'ready',
    byFilmId: new Map([
      [
        'tmdb:27019',
        {
          display_title: 'Classic Limited',
          release_year: 1974,
          genres: [],
        },
      ],
    ]),
  };
  const shelf = buildOpeningThisWeekShelf(home, enrichmentIndex);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, enrichmentIndex);
  assert.equal(shelf.films[0].badge, 'Revival');
  assert.equal(dedicated.films[0].badge, 'Revival');
});

test('ended single-day limited without enrichment resolves to Revival on both surfaces', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'harry-potter-and-the-half-blood-prince',
          parentFilmKey: 'harry-potter-and-the-half-blood-prince',
          showtimeFilmKey: 'harry-potter-and-the-half-blood-prince',
          title: 'Harry Potter And The Half Blood Prince',
          openingType: 'limited',
          openingDate: '2026-08-31',
          visibleShowtimeCount: 0,
          engagementDays: 1,
        }),
      ],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home, null);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, null);
  const hpShelf = shelf.films.find((film) =>
    film.title.includes('Half Blood Prince'),
  );
  const hpDedicated = dedicated.films.find((film) =>
    film.title.includes('Half Blood Prince'),
  );
  assert.equal(hpShelf?.badge, 'Revival');
  assert.equal(hpDedicated?.badge, 'Revival');
  assert.equal(hpShelf?.categoryId, hpDedicated?.categoryId);
});

test('Home ranking buckets use final refined category', () => {
  const entries = [
    makeOpeningEntry({
      filmKey: 'ended-limited',
      title: 'Ended Limited',
      openingType: 'limited',
      openingDate: '2026-08-31',
      visibleShowtimeCount: 0,
      engagementDays: 1,
    }),
    makeOpeningEntry({
      filmKey: 'new-today',
      title: 'New Today',
      openingDate: pacificTodayIso(),
      visibleShowtimeCount: 3,
      engagementDays: 2,
    }),
  ];
  const ranked = rankOpeningShelfEntries(
    entries.map((entry) => {
      const resolved = resolveOpeningEntryPresentation(entry, {
        homeData: baseHome({
          openingThisWeek: { status: 'available', timezone: 'America/Los_Angeles', entries },
        }),
        todayIso: pacificTodayIso(),
      });
      return { ...entry, categoryId: resolved.categoryId };
    }),
  );
  assert.equal(ranked[0].categoryId, 'new');
  assert.equal(ranked[1].categoryId, 'revival');
});

test('shelfData has no category heuristics', () => {
  const shelfSrc = readFileSync(join(ROOT, 'v2/home/shelfData.js'), 'utf8');
  assert.equal(shelfSrc.includes('openingCategoryForEntry'), false);
  assert.equal(shelfSrc.includes('EVENT_TITLE_HINT'), false);
  assert.match(shelfSrc, /resolveOpeningEntryPresentation/);
});

test('contemporary limited release is New on both surfaces', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'hunger-games-2026',
          parentFilmKey: 'hunger-games-2026',
          showtimeFilmKey: 'hunger-games-2026',
          title: 'The Hunger Games',
          openingType: 'limited',
          engagementDays: 3,
          visibleShowtimeCount: 2,
        }),
      ],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(shelf.films[0].badge, 'New');
  assert.equal(dedicated.films[0].badge, 'New');
});

test('event-pattern limited engagement is Special Event on both surfaces', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'screen-unseen',
          parentFilmKey: 'screen-unseen',
          showtimeFilmKey: 'screen-unseen',
          title: 'Screen Unseen: Mystery Title',
          openingType: 'limited',
          engagementDays: 1,
          visibleShowtimeCount: 1,
        }),
      ],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(shelf.films[0].badge, 'Special Event');
  assert.equal(dedicated.films[0].badge, 'Special Event');
});

test('theater alone does not alter category on either surface', () => {
  const home = baseHome({
    openingThisWeek: {
      status: 'available',
      timezone: 'America/Los_Angeles',
      entries: [
        makeOpeningEntry({
          filmKey: 'beacon-limited',
          parentFilmKey: 'beacon-limited',
          showtimeFilmKey: 'beacon-limited',
          title: 'Contemporary Indie',
          openingType: 'limited',
          theatersOnOpeningDate: ['beacon'],
          theaterCountOnOpeningDate: 1,
          engagementDays: 2,
          visibleShowtimeCount: 1,
        }),
      ],
    },
  });
  const shelf = buildOpeningThisWeekShelf(home);
  const dedicated = buildLiveOpeningThisWeekPresentation(home, null);
  assert.equal(shelf.films[0].badge, 'New');
  assert.equal(dedicated.films[0].badge, 'New');
});

test('HomeDestination still wires See all to Opening collection', () => {
  const homeSrc = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
  assert.match(homeSrc, /COLLECTION_IDS\.openingThisWeek/);
  assert.match(homeSrc, /maxVisible=\{6\}/);
});
