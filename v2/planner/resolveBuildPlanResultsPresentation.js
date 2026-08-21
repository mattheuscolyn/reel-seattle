/**
 * Build a Plan Results presentation mode switch (T-PENG-01).
 *
 * Live default: HomeData + Build form → same-theater planner engine.
 * Mockup QC only: `?planResultsMockup=1` or localStorage flag.
 * Never silently falls back to fixtures.
 */

import {
  BUILD_PLAN_RESULTS_MOCKUP_FIXTURE,
  BUILD_PLAN_RESULTS_SORT_OPTIONS,
  createBuildPlanResultsUiState,
  getBuildPlanResultsMockupPresentation,
  getBuildPlanResultsOrderedPlans,
} from '../fixtures/buildPlanResultsMockupFixture.js';
import { generateLivePlannerResults } from './generateLivePlannerResults.js';
import { createLiveBuildPlanFormState } from './createLiveBuildPlanFormState.js';
import { formatPlanSizeLabel } from './planSize.js';

export const PLAN_RESULTS_MOCKUP_FLAG_QUERY = 'planResultsMockup';
export const PLAN_RESULTS_MOCKUP_STORAGE_KEY =
  'reel-seattle.v2.planResultsMockup';

/**
 * @returns {boolean}
 */
export function isPlanResultsMockupMode() {
  if (typeof window === 'undefined' || !window.location) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get(PLAN_RESULTS_MOCKUP_FLAG_QUERY);
    if (q === '1' || q === 'true') return true;
    if (q === '0' || q === 'false') return false;
  } catch {
    /* ignore */
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const v = localStorage.getItem(PLAN_RESULTS_MOCKUP_STORAGE_KEY);
      return v === '1' || v === 'true';
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * @param {object | null | undefined} form
 */
function preferenceChipsFromForm(form) {
  /** @type {object[]} */
  const chips = [];
  for (const film of form?.mustInclude ?? []) {
    chips.push({
      id: `must-${film.id}`,
      kind: 'must',
      label: 'Must include',
      value: film.title,
      removable: true,
    });
  }
  for (const film of form?.wouldLove ?? []) {
    chips.push({
      id: `love-${film.id}`,
      kind: 'love',
      label: 'Would love',
      value: film.title,
      removable: true,
    });
  }
  const ni = form?.notInterested ?? [];
  if (ni.length === 1) {
    chips.push({
      id: `ni-${ni[0].id}`,
      kind: 'ni',
      label: 'Not interested',
      value: ni[0].title,
      removable: true,
    });
  } else if (ni.length > 1) {
    chips.push({
      id: 'ni-count',
      kind: 'ni',
      label: 'Not interested',
      value: `${ni.length} films`,
      removable: true,
    });
  }
  return chips;
}

/**
 * @param {object | null | undefined} form
 * @param {typeof BUILD_PLAN_RESULTS_MOCKUP_FIXTURE} chrome
 */
function quickAdjustFromForm(form, chrome) {
  return chrome.quickAdjust.map((item) => {
    if (item.id === 'startAfter') {
      return { ...item, value: form?.startAfter ?? item.value };
    }
    if (item.id === 'endBefore') {
      return { ...item, value: form?.finishBefore ?? item.value };
    }
    if (item.id === 'planSize') {
      return {
        ...item,
        value: formatPlanSizeLabel(form?.planSize ?? item.value),
      };
    }
    if (item.id === 'maxWalk') {
      // Travel suppressed — keep control shell, no live miles claim.
      return { ...item, value: 'Deferred' };
    }
    return { ...item };
  });
}

/**
 * @param {object | null | undefined} form
 * @param {typeof BUILD_PLAN_RESULTS_MOCKUP_FIXTURE} chrome
 */
function refineFromForm(form, chrome) {
  return {
    ...chrome.refine,
    fields: chrome.refine.fields.map((field) => {
      if (field.id === 'startAfter') {
        return { ...field, value: form?.startAfter ?? field.value };
      }
      if (field.id === 'endBefore') {
        return { ...field, value: form?.finishBefore ?? field.value };
      }
      if (field.id === 'planSize') {
        return {
          ...field,
          value: formatPlanSizeLabel(form?.planSize ?? field.value),
        };
      }
      if (field.id === 'maxWalk') {
        return { ...field, value: 'Deferred' };
      }
      return { ...field };
    }),
    premiumFormatsValue: form?.premiumFormats ?? chrome.refine.premiumFormatsValue,
  };
}

/**
 * @param {{
 *   homeData?: object | null,
 *   form?: object | null,
 *   sortId?: string | null,
 *   forceMockup?: boolean,
 *   now?: Date | (() => Date),
 * }} [options]
 */
export function resolveBuildPlanResultsPagePresentation(options = {}) {
  const mockup = options.forceMockup === true || isPlanResultsMockupMode();
  if (mockup) {
    const root = getBuildPlanResultsMockupPresentation();
    return {
      mode: 'mockup-fixture',
      source: 'mockup-fixture',
      ...root,
      plans: getBuildPlanResultsOrderedPlans(
        options.sortId ?? root.defaultSortId,
      ),
      emptyMessage: null,
      generation: null,
    };
  }

  const chrome = getBuildPlanResultsMockupPresentation();
  const form = options.form ?? createLiveBuildPlanFormState(options.now);
  const generated = generateLivePlannerResults({
    homeData: options.homeData,
    form,
    sortId: options.sortId ?? chrome.defaultSortId,
    now: options.now,
    storage: options.storage ?? null,
    enrichmentIndex: options.enrichmentIndex ?? null,
    timeFormatId: options.timeFormatId ?? '12h',
  });

  return {
    mode: 'live',
    source: 'live',
    pageTitle: chrome.pageTitle,
    summaryLine: generated.summaryLine || chrome.summaryLine,
    plansFoundLabel: generated.plansFoundLabel,
    loadMoreLabel: chrome.loadMoreLabel,
    shareLabel: chrome.shareLabel,
    viewPlanLabel: chrome.viewPlanLabel,
    savePlanLabel: chrome.savePlanLabel ?? 'Add to My Schedule',
    savedPlanLabel: chrome.savedPlanLabel ?? 'Added to My Schedule',
    moreActionsLabel: chrome.moreActionsLabel,
    addToScheduleLabel: chrome.addToScheduleLabel,
    filmSheet: chrome.filmSheet,
    sortLabel: chrome.sortLabel,
    preferenceChips: preferenceChipsFromForm(form),
    quickAdjust: quickAdjustFromForm(form, chrome),
    sortOptions: BUILD_PLAN_RESULTS_SORT_OPTIONS,
    refine: refineFromForm(form, chrome),
    defaultSortId: chrome.defaultSortId,
    defaultActivePlanId: generated.plans[0]?.id ?? null,
    plans: generated.plans,
    emptyMessage: generated.message,
    generation: generated,
  };
}

/**
 * UI state seeded from the current presentation plans.
 * @param {ReturnType<typeof resolveBuildPlanResultsPagePresentation>} presentation
 */
export function createBuildPlanResultsUiStateFromPresentation(presentation) {
  if (presentation?.source === 'mockup-fixture') {
    return createBuildPlanResultsUiState();
  }
  const plans = Array.isArray(presentation?.plans) ? presentation.plans : [];
  const films = plans.flatMap((planItem) =>
    (planItem.items ?? []).filter((i) => i.type !== 'break'),
  );
  const filmPreferences = Object.fromEntries(
    films.map((f) => [f.id, f.preference ?? 'neutral']),
  );
  return {
    sortId: presentation?.defaultSortId ?? 'best-match',
    activePlanId: presentation?.defaultActivePlanId ?? plans[0]?.id ?? null,
    selectedFilmIds: films.map((f) => f.id),
    filmPreferences,
    favoritedPlanIds: [],
    amcAListOnly: false,
    includeSpecialEvents: true,
    excludeSoldOut: false,
    dismissedChipIds: [],
  };
}

// Re-export mockup helpers used by tests / QC.
export {
  BUILD_PLAN_RESULTS_MOCKUP_FIXTURE,
  getBuildPlanResultsMockupPresentation,
  getBuildPlanResultsOrderedPlans,
  createBuildPlanResultsUiState,
};
