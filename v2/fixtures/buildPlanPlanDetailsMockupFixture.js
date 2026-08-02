/**
 * Plan Details MOCKUP FIXTURE — visual authority for QC.
 *
 * Content matches Canonical Mockup Images/Build a Plan Results Page Plan Detail.png
 * (normalized to 393px: tmp-v2-qc/bpd-diagnostic/canonical-plan-details-393.png).
 *
 * QC: `?planDetailsMockup=1`
 * Never used as a silent production fallback.
 */

import { PLACEHOLDER_POSTERS } from './placeholderMedia.js';

export const PLAN_DETAILS_MOCKUP_FLAG_QUERY = 'planDetailsMockup';
export const PLAN_DETAILS_MOCKUP_STORAGE_KEY =
  'reel-seattle.v2.planDetailsMockup';

/**
 * @returns {boolean}
 */
export function isPlanDetailsMockupMode() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get(PLAN_DETAILS_MOCKUP_FLAG_QUERY);
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(PLAN_DETAILS_MOCKUP_STORAGE_KEY);
      return v === '1' || v === 'true';
    }
  } catch {
    /* ignore */
  }
  return false;
}

function film(row) {
  return Object.freeze({ ...row, type: 'film' });
}

function breakRow(row) {
  return Object.freeze({ ...row, type: 'break' });
}

/**
 * Canonical Plan Details itinerary (Sat, Jul 19).
 */
export const BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN = Object.freeze({
  id: 'pd-mock-plan-1',
  rank: 1,
  provenance: 'fixture',
  source: 'mockup-fixture',
  dateLabel: 'Sat, Jul 19',
  date: '2025-07-19',
  movieCountLabel: '3 movies',
  items: Object.freeze([
    film({
      id: 'pd-f1',
      title: '2001: A Space Odyssey',
      startTime: '2:15 PM',
      endTime: '4:31 PM',
      theater: 'Central Cinema',
      runtimeLabel: '2h 16m',
      runtimeMin: 136,
      formatBadge: '70MM',
      imageUrl: PLACEHOLDER_POSTERS.spaceOdyssey,
    }),
    breakRow({
      id: 'pd-b1',
      label: 'Break · 49m',
      durationMin: 49,
      fromTheater: 'Central Cinema',
      toTheater: 'SIFF Film Center',
      gapMinutes: 12,
    }),
    film({
      id: 'pd-f2',
      title: 'Perfect Blue',
      startTime: '5:20 PM',
      endTime: '7:15 PM',
      theater: 'SIFF Film Center',
      runtimeLabel: '1h 55m',
      runtimeMin: 115,
      formatBadge: 'SUBTITLED',
      imageUrl: PLACEHOLDER_POSTERS.perfectBlue,
    }),
    breakRow({
      id: 'pd-b2',
      label: 'Break · 30m',
      durationMin: 30,
      fromTheater: 'SIFF Film Center',
      toTheater: 'Central Cinema',
      gapMinutes: 8,
    }),
    film({
      id: 'pd-f3',
      title: 'Jurassic Park',
      startTime: '7:45 PM',
      endTime: '10:07 PM',
      theater: 'Central Cinema',
      runtimeLabel: '2h 22m',
      runtimeMin: 142,
      formatBadge: '35MM',
      imageUrl:
        PLACEHOLDER_POSTERS.jurassicPark ?? PLACEHOLDER_POSTERS.spaceOdyssey,
    }),
  ]),
});

export function getBuildPlanPlanDetailsMockupPlan() {
  return BUILD_PLAN_PLAN_DETAILS_MOCKUP_PLAN;
}
