/**
 * Shared draft validation entry for Build a Plan Generate (PR2).
 * Reuses PR1 domain validation — no duplicate JSX logic.
 */

import { homeDataToPlannerRows } from './homeDataToPlannerRows.js';
import { mapBuildFormToPlannerFilters } from './mapBuildFormToPlannerFilters.js';
import { validatePlannerDraftConstraints } from './validatePlannerDraftConstraints.js';

/**
 * @param {object} form
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date),
 *   enrichmentIndex?: object | null,
 * }} [options]
 */
export function validateBuildPlanDraftForGenerate(form, homeData, options = {}) {
  if (!homeData) {
    return {
      ok: false,
      conflicts: [
        {
          code: 'missing_home_data',
          message: 'Showtimes aren’t loaded yet.',
        },
      ],
      resolvedLocks: [],
      planSize: null,
    };
  }
  const rows = homeDataToPlannerRows(homeData, {
    enrichmentIndex: options.enrichmentIndex ?? null,
  });
  const mapped = mapBuildFormToPlannerFilters(form, homeData, {
    now: options.now,
  });
  return validatePlannerDraftConstraints({
    form,
    rows,
    filters: mapped.filters,
    dateIso: mapped.dateIso,
    theaterIds: mapped.theaterIds ?? [],
  });
}
