/**
 * Canonical Build-a-Plan plan size: { min, max }.
 * Also normalizes every legacy UI string used by BuildPlanSurface.
 */

export const PLAN_SIZE_MIN_BOUND = 1;
export const PLAN_SIZE_MAX_BOUND = 6;

/** Default matches historical live default "1–3 movies". */
export const DEFAULT_PLAN_SIZE = Object.freeze({ min: 1, max: 3 });

/**
 * @typedef {{ min: number, max: number, mode?: 'range' | 'max' }} PlanSize
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Clamp and order a min/max pair into a valid PlanSize.
 * @param {number} min
 * @param {number} max
 * @param {{ mode?: 'range' | 'max' }} [extra]
 * @returns {PlanSize}
 */
export function clampPlanSize(min, max, extra = {}) {
  let a = Number(min);
  let b = Number(max);
  if (!Number.isFinite(a)) a = DEFAULT_PLAN_SIZE.min;
  if (!Number.isFinite(b)) b = DEFAULT_PLAN_SIZE.max;
  a = Math.round(a);
  b = Math.round(b);
  a = Math.max(PLAN_SIZE_MIN_BOUND, Math.min(PLAN_SIZE_MAX_BOUND, a));
  b = Math.max(PLAN_SIZE_MIN_BOUND, Math.min(PLAN_SIZE_MAX_BOUND, b));
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  /** @type {PlanSize} */
  const out = { min: a, max: b };
  if (extra.mode === 'max') out.mode = 'max';
  return out;
}

/**
 * Normalize any planSize representation into { min, max }.
 * Accepts object shape, legacy strings, missing/invalid → default.
 *
 * @param {unknown} value
 * @returns {PlanSize}
 */
export function normalizePlanSize(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = /** @type {Record<string, unknown>} */ (value);
    if (record.mode === 'max' || record.maxMode === true) {
      return clampPlanSize(
        PLAN_SIZE_MIN_BOUND,
        PLAN_SIZE_MAX_BOUND,
        { mode: 'max' },
      );
    }
    return clampPlanSize(record.min, record.max);
  }

  const raw = asTrimmed(value) ?? '';
  if (!raw) return { ...DEFAULT_PLAN_SIZE };

  if (/as many|max/i.test(raw)) {
    return clampPlanSize(
      PLAN_SIZE_MIN_BOUND,
      PLAN_SIZE_MAX_BOUND,
      { mode: 'max' },
    );
  }

  const range = raw.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) {
    return clampPlanSize(Number(range[1]), Number(range[2]));
  }

  const single = raw.match(/(\d+)\s*movies?/i);
  if (single) {
    const n = Number(single[1]);
    return clampPlanSize(n, n);
  }

  return { ...DEFAULT_PLAN_SIZE };
}

/**
 * Expand normalized plan size into engine film-count loop values.
 * @param {unknown} value
 * @returns {number[] | 'max'}
 */
export function planSizeToFilmCounts(value) {
  const size = normalizePlanSize(value);
  if (size.mode === 'max') return 'max';
  return Array.from({ length: size.max - size.min + 1 }, (_, i) => size.min + i);
}

/**
 * Human label for UI selects / summaries (legacy-compatible wording).
 * @param {unknown} value
 * @returns {string}
 */
export function formatPlanSizeLabel(value) {
  const size = normalizePlanSize(value);
  if (size.mode === 'max') return 'As many as possible';
  if (size.min === size.max) {
    return size.min === 1 ? '1 movie' : `${size.min} movies`;
  }
  return `${size.min}–${size.max} movies`;
}

/**
 * @deprecated Prefer normalizePlanSize + planSizeToFilmCounts.
 * Kept as a thin wrapper for existing imports.
 * @param {unknown} planSize
 * @returns {number[] | 'max'}
 */
export function parsePlanSizeFilmCounts(planSize) {
  return planSizeToFilmCounts(planSize);
}
