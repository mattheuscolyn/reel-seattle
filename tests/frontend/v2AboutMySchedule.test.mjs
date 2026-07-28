import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ABOUT_MY_SCHEDULE_MOCKUP_FIXTURE,
  ABOUT_MY_SCHEDULE_SECTION_ORDER,
  getAboutMyScheduleMockupPresentation,
  resolveAboutMySchedulePresentation,
} from '../../v2/fixtures/aboutMyScheduleMockupFixture.js';
import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  navigateBack,
  openAboutMySchedule,
  openFilmDetail,
  selectPrimaryDestination,
  startPlannerFromFilm,
} from '../../v2/navigation/navState.js';
import {
  FAVORITE_THEATERS_STORAGE_KEY,
  getFavoriteTheaters,
} from '../../v2/stores/favoriteTheatersStore.js';
import {
  SAVED_FILMS_STORAGE_KEY,
  getSavedFilms,
} from '../../v2/stores/savedFilmsStore.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ABOUT_SRC = readFileSync(
  join(ROOT, 'v2/surfaces/AboutMyScheduleSurface.jsx'),
  'utf8',
);
const FIXTURE_SRC = readFileSync(
  join(ROOT, 'v2/fixtures/aboutMyScheduleMockupFixture.js'),
  'utf8',
);
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NAV_SRC = readFileSync(join(ROOT, 'v2/navigation/navState.js'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('About My Schedule fixture matches canonical mockup sections', () => {
  const p = getAboutMyScheduleMockupPresentation();
  assert.equal(p.source, 'mockup-fixture');
  assert.equal(p, ABOUT_MY_SCHEDULE_MOCKUP_FIXTURE);
  assert.equal(resolveAboutMySchedulePresentation(), p);
  assert.equal(p.title, 'About My Schedule');
  assert.equal(
    p.intro,
    'Your moviegoing calendar, built around plans—not generic events.',
  );
  assert.equal(p.whatItDoes.title, 'What My Schedule does');
  assert.equal(p.twoViews.title, 'How the two views work');
  assert.equal(p.whatCountsAsPlan.title, 'What counts as a plan');
  assert.equal(p.featureCards.cards.length, 3);
  assert.equal(p.featureCards.cards[0].title, 'Understanding colors');
  assert.equal(p.featureCards.cards[1].title, 'Calendar sync');
  assert.equal(p.featureCards.cards[2].title, 'Tickets');
  assert.equal(p.privacy.title, 'Privacy & control');
  assert.equal(p.faq.title, 'Frequently asked questions');
  assert.equal(p.faq.items.length, 4);
  assert.deepEqual([...ABOUT_MY_SCHEDULE_SECTION_ORDER], [
    'header',
    'whatItDoes',
    'twoViews',
    'whatCountsAsPlan',
    'featureCards',
    'privacy',
    'faq',
  ]);
});

test('About fixture keeps exact key mockup copy and order', () => {
  const p = resolveAboutMySchedulePresentation();
  assert.equal(
    p.whatItDoes.leadAccent,
    'your personal movie calendar.',
  );
  assert.deepEqual([...p.whatItDoes.bullets], [
    'See all your planned showtimes in one place',
    'Use Week view to plan in detail',
    'Use Month view to spot patterns at a glance',
    'Tap open time on the timeline to find movies around that time',
  ]);
  assert.match(
    p.whatCountsAsPlan.body[0],
    /specific showtime/,
  );
  assert.match(
    p.whatCountsAsPlan.body[0],
    /does not place it on your schedule/,
  );
  assert.deepEqual(
    p.whatCountsAsPlan.flow.map((s) => s.label),
    ['Saved film', 'Selected showtime', 'Scheduled plan'],
  );
  assert.deepEqual(
    p.faq.items.map((i) => i.question),
    [
      "Why doesn't a saved movie appear in My Schedule?",
      'What happens when a showtime changes or is canceled?',
      'Can I plan movies without buying tickets?',
      'Can I add plans to my phone calendar?',
    ],
  );
  assert.match(
    p.featureCards.cards[1].bullets[2],
    /External edits won't sync back/,
  );
});

test('About fixture does not invent account/cloud claims beyond mockup', () => {
  const blob = JSON.stringify(resolveAboutMySchedulePresentation());
  assert.equal(blob.includes('cloud account'), false);
  assert.equal(blob.includes('sign in'), false);
  assert.equal(blob.includes('bidirectional'), false);
  assert.equal(FIXTURE_SRC.includes('stores/'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
});

test('About surface is a designed page, not a placeholder', () => {
  assert.match(APP_SRC, /AboutMyScheduleSurface/);
  assert.match(ABOUT_SRC, /data-about-source/);
  assert.match(ABOUT_SRC, /data-about-section=\{sectionKey\}/);
  assert.match(ABOUT_SRC, /sectionKey="header"|data-about-section="header"/);
  assert.match(ABOUT_SRC, /sectionKey="whatItDoes"/);
  assert.match(ABOUT_SRC, /sectionKey="twoViews"/);
  assert.match(ABOUT_SRC, /sectionKey="whatCountsAsPlan"/);
  assert.match(ABOUT_SRC, /data-about-section="featureCards"/);
  assert.match(ABOUT_SRC, /data-about-section="privacy"/);
  assert.match(ABOUT_SRC, /sectionKey="faq"/);
  assert.equal(ABOUT_SRC.includes('v2 shell · placeholder'), false);
  assert.match(ABOUT_SRC, /aria-labelledby="v2-about-title"/);
  assert.match(ABOUT_SRC, /aria-label="Back"/);
  assert.match(CSS, /\.v2-about\b/);
  assert.match(CSS, /\.v2-about-feature-card\b/);
});

test('About navigation keeps Planner active and Back restores origin', () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.id),
    ['home', 'explore', 'planner', 'profile'],
  );
  let nav = createInitialNavState();
  nav = selectPrimaryDestination(nav, 'planner');
  nav = openAboutMySchedule(nav, { originPrimary: 'planner' });
  assert.equal(nav.surface?.type, 'about-my-schedule');
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(
    resolveActivePrimaryId({
      primaryDestinationId: nav.primaryDestinationId,
      surface: nav.surface,
    }),
    'planner',
  );
  nav = navigateBack(nav);
  assert.equal(nav.surface, null);
  assert.equal(nav.primaryDestinationId, 'planner');
});

test('About opens without My Schedule and does not require Settings', () => {
  assert.match(NAV_SRC, /openAboutMySchedule/);
  assert.match(APP_SRC, /aboutSchedule/);
  assert.equal(ABOUT_SRC.includes('My Schedule Main'), false);
  assert.equal(ABOUT_SRC.includes('Schedule Settings'), false);
});

test('Existing Film Detail → Planner path unchanged', () => {
  let nav = createInitialNavState();
  nav = openFilmDetail(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    originPrimary: 'home',
  });
  nav = startPlannerFromFilm(nav, {
    filmKey: 'alpha',
    opportunityKey: null,
    mode: 'multi',
  });
  assert.equal(nav.primaryDestinationId, 'planner');
  assert.equal(nav.plannerSeed?.mode, 'multi');
  nav = openAboutMySchedule(nav, { originPrimary: 'planner' });
  assert.equal(nav.plannerSeed?.filmKey, 'alpha');
  nav = navigateBack(nav);
  assert.equal(nav.plannerSeed?.filmKey, 'alpha');
});

test('About surface does not mutate storage', () => {
  assert.equal(/localStorage/.test(ABOUT_SRC), false);
  assert.equal(ABOUT_SRC.includes('savedFilmsStore'), false);
  assert.equal(/localStorage/.test(FIXTURE_SRC), false);
  const storage = memoryStorage();
  assert.equal(getSavedFilms(storage).length, 0);
  assert.equal(getFavoriteTheaters(storage).length, 0);
  assert.equal(storage.getItem(SAVED_FILMS_STORAGE_KEY), null);
  assert.equal(storage.getItem(FAVORITE_THEATERS_STORAGE_KEY), null);
});
