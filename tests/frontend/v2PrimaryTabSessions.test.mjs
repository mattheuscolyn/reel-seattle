import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import {
  createInitialNavState,
  navigateBack,
  openBuildPlan,
  openCollection,
  openFilmDetail,
  openProfileFriends,
  openShowtimesBrowse,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import {
  captureTabSession,
  clearAuthSensitiveTabState,
  createEmptyTabSessions,
  isAuthSensitiveSurfaceType,
  navFromTabSession,
  openPrimaryTabRoot,
  resolveOwningPrimaryTab,
  switchPrimaryTab,
} from '../../v2/navigation/primaryTabSessions.js';
import {
  clearBuildPlanFormSession,
  ensureBuildPlanFormSession,
  getBuildPlanFormSession,
  setBuildPlanFormSession,
} from '../../v2/planner/buildPlanFormSession.js';
import { createLiveBuildPlanFormState } from '../../v2/planner/createLiveBuildPlanFormState.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const NOW = new Date('2026-09-05T20:00:00-07:00');

function memoryStorage() {
  /** @type {Record<string, string>} */
  const map = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
    },
    setItem(key, value) {
      map[key] = String(value);
    },
    removeItem(key) {
      delete map[key];
    },
  };
}

describe('primary tab sessions', () => {
  test('Planner Build a Plan resumes after Explore switch', () => {
    let nav = selectPrimaryDestination(createInitialNavState(), 'planner');
    nav = openBuildPlan(nav, { originPrimary: 'planner' });
    let sessions = createEmptyTabSessions();

    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'explore'));
    assert.equal(nav.primaryDestinationId, 'explore');
    assert.equal(nav.surface, null);
    assert.equal(sessions.planner?.surface?.type, 'build-plan');

    nav = openCollection(nav, {
      collectionId: 'search-results',
      query: 'sinners',
      originPrimary: 'explore',
    });
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'planner'));

    assert.equal(nav.primaryDestinationId, 'planner');
    assert.equal(nav.surface?.type, 'build-plan');
    assert.equal(sessions.explore?.surface?.type, 'collection');
    assert.equal(sessions.explore?.surface?.query, 'sinners');
  });

  test('Build a Plan draft inputs remain intact across tab resume', () => {
    const storage = memoryStorage();
    clearBuildPlanFormSession({ storage });
    const draft = createLiveBuildPlanFormState(NOW);
    draft.mustInclude = [{ filmKey: 'sinners', title: 'Sinners' }];
    draft.startAfter = '7:30 PM';
    setBuildPlanFormSession(draft, { storage });

    let nav = openBuildPlan(
      selectPrimaryDestination(createInitialNavState(), 'planner'),
      { originPrimary: 'planner' },
    );
    let sessions = createEmptyTabSessions();
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'explore'));
    ({ nav } = switchPrimaryTab(nav, sessions, 'planner'));

    assert.equal(nav.surface?.type, 'build-plan');
    assert.equal(getBuildPlanFormSession()?.mustInclude[0].filmKey, 'sinners');
    assert.equal(getBuildPlanFormSession()?.startAfter, '7:30 PM');

    clearBuildPlanFormSession({ persist: false, storage });
    const restored = ensureBuildPlanFormSession(
      () => createLiveBuildPlanFormState(NOW),
      { storage },
    );
    assert.equal(restored.mustInclude[0].filmKey, 'sinners');
    clearBuildPlanFormSession({ storage });
  });

  test('Explore nested film detail resumes independently of Planner', () => {
    let exploreNav = selectPrimaryDestination(createInitialNavState(), 'explore');
    exploreNav = openCollection(exploreNav, {
      collectionId: 'search-results',
      query: 'dune',
      originPrimary: 'explore',
    });
    exploreNav = openFilmDetail(exploreNav, {
      filmKey: 'dune-part-two',
      originPrimary: 'explore',
      returnSurface: exploreNav.surface,
    });

    let plannerNav = openBuildPlan(
      selectPrimaryDestination(createInitialNavState(), 'planner'),
      { originPrimary: 'planner' },
    );

    let sessions = createEmptyTabSessions();
    sessions.explore = captureTabSession(exploreNav);
    sessions.planner = captureTabSession(plannerNav);

    let nav = navFromTabSession(sessions.planner, 'planner');
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'explore'));
    assert.equal(nav.surface?.type, 'film-detail');
    assert.equal(nav.surface?.filmKey, 'dune-part-two');
    assert.equal(nav.surface?.returnSurface?.type, 'collection');

    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'planner'));
    assert.equal(nav.surface?.type, 'build-plan');

    ({ nav } = switchPrimaryTab(nav, sessions, 'explore'));
    assert.equal(nav.surface?.type, 'film-detail');
    assert.equal(nav.surface?.filmKey, 'dune-part-two');
  });

  test('explicit root open clears the target tab session', () => {
    let nav = openBuildPlan(
      selectPrimaryDestination(createInitialNavState(), 'planner'),
      { originPrimary: 'planner' },
    );
    let sessions = createEmptyTabSessions();
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'home'));
    assert.equal(sessions.planner?.surface?.type, 'build-plan');

    ({ nav, sessions } = openPrimaryTabRoot(nav, sessions, 'planner'));
    assert.equal(nav.primaryDestinationId, 'planner');
    assert.equal(nav.surface, null);
    assert.equal(sessions.planner, null);
  });

  test('re-selecting the owning tab is a no-op at the helper boundary', () => {
    let nav = openBuildPlan(
      selectPrimaryDestination(createInitialNavState(), 'planner'),
      { originPrimary: 'planner' },
    );
    const sessions = createEmptyTabSessions();
    assert.equal(resolveOwningPrimaryTab(nav), 'planner');
    // Active-tab no-op is enforced in V2App before switchPrimaryTab.
    assert.match(APP_SRC, /targetId === chromeActive/);
    assert.match(APP_SRC, /handleSelectDestination/);
    assert.match(APP_SRC, /switchPrimaryTab/);
    assert.match(APP_SRC, /handleOpenPrimaryRoot/);
    assert.match(APP_SRC, /openPrimaryTabRoot/);
    void sessions;
  });

  test('Showtimes browse → film detail → back still restores list context', () => {
    let nav = openShowtimesBrowse(
      selectPrimaryDestination(createInitialNavState(), 'explore'),
      {
        originPrimary: 'explore',
        browseUi: {
          restoreItemKey: 'film:dune',
          scrollY: 640,
          expandedFilmKey: 'dune',
        },
      },
    );
    nav = openFilmDetail(nav, {
      filmKey: 'dune',
      originPrimary: 'explore',
      returnSurface: nav.surface,
    });
    const back = navigateBack(nav);
    assert.equal(back.surface?.type, 'showtimes-browse');
    assert.equal(back.surface?.browseUi?.restoreItemKey, 'film:dune');
    assert.equal(back.surface?.browseUi?.scrollY, 640);
  });

  test('Home film detail returnSurface / homeRestore survive tab suspend', () => {
    let nav = openFilmDetail(createInitialNavState(), {
      filmKey: 'sinners',
      originPrimary: 'home',
      homeRestore: {
        scrollY: 420,
        expandedShelfId: 'v2-opening',
        expandedFilmKey: 'sinners',
        topOppIndex: 1,
      },
    });
    let sessions = createEmptyTabSessions();
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'planner'));
    ({ nav } = switchPrimaryTab(nav, sessions, 'home'));

    assert.equal(nav.surface?.type, 'film-detail');
    assert.equal(nav.surface?.homeRestore?.scrollY, 420);
    const back = navigateBack(nav);
    assert.equal(back.surface, null);
    assert.equal(back._restoredHome?.scrollY, 420);
  });

  test('auth reset clears private profile resume state', () => {
    assert.equal(isAuthSensitiveSurfaceType('profile-friends'), true);
    let nav = openProfileFriends(
      selectPrimaryDestination(createInitialNavState(), 'profile'),
      { originPrimary: 'profile', focusUserId: 'user-1' },
    );
    let sessions = createEmptyTabSessions();
    ({ nav, sessions } = switchPrimaryTab(nav, sessions, 'home'));
    assert.equal(sessions.profile?.surface?.type, 'profile-friends');

    const cleared = clearAuthSensitiveTabState(nav, sessions);
    assert.equal(cleared.changed, true);
    assert.equal(cleared.sessions.profile?.surface, null);

    nav = openProfileFriends(
      selectPrimaryDestination(createInitialNavState(), 'profile'),
      { originPrimary: 'profile' },
    );
    const live = clearAuthSensitiveTabState(nav, createEmptyTabSessions());
    assert.equal(live.nav.primaryDestinationId, 'profile');
    assert.equal(live.nav.surface, null);
  });

  test('DestinationPlaceholder uses explicit root opens, PrimaryNav resumes', () => {
    assert.match(APP_SRC, /onSelectDestination=\{handleOpenPrimaryRoot\}/);
    assert.match(
      APP_SRC,
      /onSelectDestination=\{handleSelectDestination\}/,
    );
    assert.match(APP_SRC, /clearAuthSensitiveTabState/);
  });

  test('tab sessions stay in-memory and do not use browser storage', () => {
    const sessionSrc = readFileSync(
      join(ROOT, 'v2/navigation/primaryTabSessions.js'),
      'utf8',
    );
    assert.equal(sessionSrc.includes('sessionStorage'), false);
    assert.equal(sessionSrc.includes('localStorage'), false);
    assert.match(APP_SRC, /createEmptyTabSessions/);
  });
});
