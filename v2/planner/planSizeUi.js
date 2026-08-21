/**
 * Plan-size UI mode helpers (PR2 / PLAN-06).
 */

import {
  PLAN_SIZE_MAX_BOUND,
  PLAN_SIZE_MIN_BOUND,
  clampPlanSize,
  normalizePlanSize,
} from './planSize.js';

/**
 * @param {unknown} value
 * @returns {'exact' | 'range' | 'max'}
 */
export function planSizeUiMode(value) {
  const size = normalizePlanSize(value);
  if (size.mode === 'max') return 'max';
  if (size.min === size.max) return 'exact';
  return 'range';
}

/**
 * @param {'exact' | 'range' | 'max'} mode
 * @param {{ exact?: number, min?: number, max?: number }} [parts]
 */
export function planSizeFromUiMode(mode, parts = {}) {
  if (mode === 'max') {
    return clampPlanSize(PLAN_SIZE_MIN_BOUND, PLAN_SIZE_MAX_BOUND, {
      mode: 'max',
    });
  }
  if (mode === 'exact') {
    const n =
      parts.exact ??
      parts.min ??
      parts.max ??
      4;
    return clampPlanSize(n, n);
  }
  let min = parts.min ?? 1;
  let max = parts.max ?? 3;
  return clampPlanSize(min, max);
}

export const PLAN_SIZE_COUNT_OPTIONS = Object.freeze(
  Array.from(
    { length: PLAN_SIZE_MAX_BOUND - PLAN_SIZE_MIN_BOUND + 1 },
    (_, i) => PLAN_SIZE_MIN_BOUND + i,
  ),
);
