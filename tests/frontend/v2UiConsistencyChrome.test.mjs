import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveActivePrimaryId,
  resolveHeaderBackLabel,
} from '../../v2/destinations.js';
import {
  createInitialNavState,
  openCollection,
  openFilmDetail,
  openShowtimesBrowse,
  selectPrimaryDestination,
} from '../../v2/navigation/navState.js';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const HEADER = readFileSync(join(ROOT, 'v2/home/AppHeader.jsx'), 'utf8');
const BACK = readFileSync(join(ROOT, 'v2/shell/BackButton.jsx'), 'utf8');
const PAGE = readFileSync(join(ROOT, 'v2/shell/PageHeader.jsx'), 'utf8');
const NAV = readFileSync(join(ROOT, 'v2/PrimaryNav.jsx'), 'utf8');
const ICONS = readFileSync(join(ROOT, 'v2/icons.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');
const THEATERS = readFileSync(join(ROOT, 'v2/theaters/TheatersSurface.jsx'), 'utf8');
const OPENING = readFileSync(join(ROOT, 'v2/opening/OpeningThisWeekSurface.jsx'), 'utf8');
const EXPLORE = readFileSync(join(ROOT, 'v2/explore/ExploreSearch.jsx'), 'utf8');
const PLANNER = readFileSync(join(ROOT, 'v2/planner/PlannerDestination.jsx'), 'utf8');
const PROFILE = readFileSync(join(ROOT, 'v2/profile/ProfileDestination.jsx'), 'utf8');

test('shared chrome primitives exist and are used', () => {
  assert.match(HEADER, /import BackButton from '\.\.\/shell\/BackButton/);
  assert.match(BACK, /IconChevronLeft/);
  assert.match(BACK, /aria-label=\{accessible\}/);
  assert.match(PAGE, /v2-page-title/);
  assert.match(EXPLORE, /PageHeader/);
  assert.match(PLANNER, /PageHeader/);
  assert.match(PROFILE, /PageHeader/);
  assert.match(NAV, /Four-destination bottom navigation/);
});

test('page header tokens match the consistency targets', () => {
  assert.match(CSS, /--v2-page-title-size:\s*2rem/);
  assert.match(CSS, /--v2-page-title-line-height:\s*2\.375rem/);
  assert.match(CSS, /--v2-page-title-weight:\s*600/);
  assert.match(CSS, /--v2-page-subtitle-size:\s*0\.9375rem/);
  assert.match(CSS, /--v2-page-subtitle-line-height:\s*1\.375rem/);
  assert.match(CSS, /--v2-page-header-top:\s*1\.5rem/);
  assert.match(CSS, /--v2-page-gutter-mobile:\s*1rem/);
  assert.match(CSS, /--v2-page-gutter-tablet:\s*1\.5rem/);
  assert.match(CSS, /--v2-page-gutter-desktop:\s*2rem/);
  assert.match(CSS, /--v2-back-min-size:\s*2\.75rem/);
});

test('nested list surfaces no longer render a second in-page back control', () => {
  assert.equal(THEATERS.includes('v2-theaters-page-back'), false);
  assert.equal(OPENING.includes('v2-opening-page-back'), false);
  assert.equal(THEATERS.includes('← '), false);
  assert.equal(OPENING.includes('← '), false);
});

test('primary nav icons are 22px and selected state is not color-only', () => {
  assert.match(ICONS, /width=\{22\} height=\{22\}/);
  assert.match(CSS, /\.v2-nav-icon svg\s*\{[^}]*width:\s*22px/s);
  assert.match(CSS, /\.v2-nav-button-active\s*\{[^}]*box-shadow/s);
  assert.match(CSS, /\.v2-nav-button-active \.v2-nav-label\s*\{[^}]*font-weight:\s*650/s);
  assert.match(NAV, /aria-current=\{isActive \? 'page'/);
});

test('header back has a visible focus treatment', () => {
  assert.match(CSS, /\.v2-header-back:focus-visible/);
});

test('Film Detail from Home keeps Home selected and labeled', () => {
  const nav = openFilmDetail(createInitialNavState(), {
    filmKey: 'sinners',
    originPrimary: 'home',
  });
  assert.equal(resolveActivePrimaryId(nav), 'home');
  assert.equal(resolveHeaderBackLabel(nav), 'Home');
});

test('Film Detail from Explore keeps Explore selected', () => {
  let nav = selectPrimaryDestination(createInitialNavState(), 'explore');
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.theaters,
    originPrimary: 'explore',
  });
  nav = openFilmDetail(nav, {
    filmKey: 'sinners',
    originPrimary: 'explore',
    returnSurface: nav.surface,
  });
  assert.equal(resolveActivePrimaryId(nav), 'explore');
  assert.equal(resolveHeaderBackLabel(nav), 'Explore');
});

test('Showtimes browse from Home keeps Home selected', () => {
  const nav = openShowtimesBrowse(createInitialNavState(), {
    originPrimary: 'home',
  });
  assert.equal(resolveActivePrimaryId(nav), 'home');
  assert.equal(resolveHeaderBackLabel(nav), 'Home');
});
