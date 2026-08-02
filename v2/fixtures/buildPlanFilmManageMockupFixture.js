/**
 * Build a Plan film-manage MOCKUP FIXTURE.
 *
 * Visual authority:
 * - Would Love: Canonical Mockup Images/Build a Plan Page Manage Would Love To See.png
 * - Not Interested: Canonical Mockup Images/Build a Plan Page Manage Not Interested In.png
 * - Must Include: Would Love layout with Must Include config
 *
 * QC: `?buildPlanMockup=1&manage=mustInclude|wouldLove|notInterested`
 * Never seeds production Build a Plan form outside mockup mode.
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';
import {
  BUILD_PLAN_MOCKUP_QUERY,
  createBuildPlanFormState,
  isBuildPlanMockupMode,
} from './buildPlanMockupFixture.js';
import {
  parseBuildPlanFilmManageMode,
  getBuildPlanFilmManageConfig,
} from '../planner/buildPlanFilmManageConfig.js';

export const BUILD_PLAN_MANAGE_QUERY = 'manage';

function filmCard({ id, title, detailLabel = 'Any theater', imageUrl }) {
  return Object.freeze({
    id,
    title,
    detailLabel,
    theaterLabel: detailLabel,
    imageUrl,
  });
}

/** Would Love selected — matches manage mockup. */
export const MANAGE_WOULD_LOVE_SELECTED = Object.freeze([
  filmCard({
    id: 'love-perfect-blue',
    title: 'Perfect Blue',
    imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
  }),
  filmCard({
    id: 'love-memories',
    title: 'Memories of Murder',
    imageUrl: PLACEHOLDER_POSTERS.memoriesOfMurder,
  }),
  filmCard({
    id: 'love-blue-hour',
    title: 'Blue Hour',
    imageUrl: PLACEHOLDER_POSTERS.blueHour,
  }),
  filmCard({
    id: 'love-saltwater',
    title: 'Saltwater Road',
    imageUrl: PLACEHOLDER_POSTERS.saltwaterRoad,
  }),
]);

export const MANAGE_WOULD_LOVE_CANDIDATES = Object.freeze([
  filmCard({
    id: 'cand-heaven',
    title: 'All That Heaven Allows',
    imageUrl: PLACEHOLDER_POSTERS.lastRehearsal,
  }),
  filmCard({
    id: 'cand-paris',
    title: 'Paris, Texas',
    imageUrl: PLACEHOLDER_POSTERS.quietCity,
  }),
  filmCard({
    id: 'cand-drive',
    title: 'Drive My Car',
    imageUrl: PLACEHOLDER_POSTERS.harbor,
  }),
  filmCard({
    id: 'cand-taste',
    title: 'The Taste of Things',
    imageUrl: PLACEHOLDER_POSTERS.winter,
  }),
]);

export const MANAGE_NOT_INTERESTED_SELECTED = Object.freeze([
  filmCard({
    id: 'ni-minions',
    title: 'Minions & Monsters',
    imageUrl: PLACEHOLDER_POSTERS.minionsMonsters,
  }),
  filmCard({
    id: 'ni-moana',
    title: 'Moana',
    imageUrl: PLACEHOLDER_POSTERS.moana,
  }),
  filmCard({
    id: 'ni-young-wa',
    title: 'Young Washington',
    imageUrl: PLACEHOLDER_POSTERS.north,
  }),
  filmCard({
    id: 'ni-quiet',
    title: 'Quiet City',
    imageUrl: PLACEHOLDER_POSTERS.quietCity,
  }),
  filmCard({
    id: 'ni-perfect',
    title: 'Perfect Moment',
    imageUrl: PLACEHOLDER_POSTERS.perfect,
  }),
]);

export const MANAGE_NOT_INTERESTED_CANDIDATES = Object.freeze([
  filmCard({
    id: 'cand-forest',
    title: 'Forest Whispers',
    imageUrl: PLACEHOLDER_POSTERS.afterStorm,
  }),
  filmCard({
    id: 'cand-summer',
    title: 'Summer Lights',
    imageUrl: PLACEHOLDER_POSTERS.river,
  }),
  filmCard({
    id: 'cand-midnight',
    title: 'Midnight Train',
    imageUrl: PLACEHOLDER_POSTERS.midnight,
  }),
  filmCard({
    id: 'cand-fallen',
    title: 'Fallen Leaves',
    imageUrl: PLACEHOLDER_POSTERS.goodbyeYesterday,
  }),
]);

/** Must Include uses Would Love visual structure with Must Include selections. */
export const MANAGE_MUST_INCLUDE_SELECTED = Object.freeze([
  filmCard({
    id: 'must-2001',
    title: '2001: A Space Odyssey',
    detailLabel: 'Central Cinema · 70mm · Sat 7:00 PM',
    imageUrl: PLACEHOLDER_POSTERS.spaceOdyssey,
  }),
]);

export const MANAGE_MUST_INCLUDE_CANDIDATES = Object.freeze([
  ...MANAGE_WOULD_LOVE_CANDIDATES,
]);

/**
 * @returns {null | 'mustInclude' | 'wouldLove' | 'notInterested'}
 */
export function getBuildPlanFilmManageMockupMode() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(BUILD_PLAN_MOCKUP_QUERY) !== '1') return null;
    return parseBuildPlanFilmManageMode(params.get(BUILD_PLAN_MANAGE_QUERY));
  } catch {
    return null;
  }
}

/**
 * Seed form buckets for mockup manage deep-links.
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} mode
 */
export function createBuildPlanFilmManageMockupForm(mode) {
  const form = createBuildPlanFormState();
  if (mode === 'wouldLove') {
    form.wouldLove = MANAGE_WOULD_LOVE_SELECTED.map((f) => ({ ...f }));
  } else if (mode === 'notInterested') {
    form.notInterested = MANAGE_NOT_INTERESTED_SELECTED.map((f) => ({ ...f }));
  } else if (mode === 'mustInclude') {
    form.mustInclude = MANAGE_MUST_INCLUDE_SELECTED.map((f) => ({ ...f }));
  }
  return form;
}

/**
 * Deterministic candidate pool for mockup mode.
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} mode
 */
export function getBuildPlanFilmManageMockupCandidates(mode) {
  if (mode === 'notInterested') {
    return MANAGE_NOT_INTERESTED_CANDIDATES.map((f) => ({ ...f }));
  }
  if (mode === 'mustInclude') {
    return MANAGE_MUST_INCLUDE_CANDIDATES.map((f) => ({ ...f }));
  }
  return MANAGE_WOULD_LOVE_CANDIDATES.map((f) => ({ ...f }));
}

/**
 * @param {'mustInclude' | 'wouldLove' | 'notInterested'} mode
 * @param {object[]} selected
 * @param {object[]} [extraCandidates]
 */
export function resolveBuildPlanFilmManageCandidates(
  mode,
  selected,
  extraCandidates = [],
) {
  const selectedIds = new Set(selected.map((f) => f.id));
  const mockup = isBuildPlanMockupMode()
    ? getBuildPlanFilmManageMockupCandidates(mode)
    : [];
  const pool = [...mockup, ...extraCandidates];
  const seen = new Set();
  const out = [];
  for (const film of pool) {
    if (!film?.id || selectedIds.has(film.id) || seen.has(film.id)) continue;
    seen.add(film.id);
    out.push({
      id: film.id,
      title: film.title,
      detailLabel: film.detailLabel ?? film.theaterLabel ?? 'Any theater',
      theaterLabel: film.theaterLabel ?? film.detailLabel ?? 'Any theater',
      imageUrl: film.imageUrl ?? '',
    });
  }
  return out;
}

export { getBuildPlanFilmManageConfig, parseBuildPlanFilmManageMode };
