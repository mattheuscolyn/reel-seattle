/**
 * Map Build a Plan form state → plannerEngine filters (T-PENG-01).
 *
 * Walk / budget / multi-theater miles are ignored (suppressed).
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import { filmIdentityTokensFromCards } from '../identity/filmIdentity.js';
import { buildPlannerSearchFilters } from '../../src/utils/plannerDisplay.js';
import { parseBreakLabelToMinutes } from './planBreakRange.js';

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
 * @param {string | null | undefined} planSize
 * @returns {number[] | 'max'}
 */
export function parsePlanSizeFilmCounts(planSize) {
  const raw = asTrimmed(planSize) ?? '';
  if (/as many|max/i.test(raw)) return 'max';
  const range = raw.match(/(\d+)\s*[–-]\s*(\d+)/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a >= 1 && b >= a && b <= 6) {
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
  }
  const single = raw.match(/(\d+)\s*movies?/i);
  if (single) {
    const n = Number(single[1]);
    if (n >= 1 && n <= 6) return [n];
  }
  return [2, 3, 4];
}

/**
 * @param {string | null | undefined} maxGap
 * @returns {number | null} null = Any / unrestricted
 */
export function parseMaxGapMinutes(maxGap) {
  return parseBreakLabelToMinutes(maxGap);
}

/**
 * @param {string | null | undefined} minGap
 * @returns {number} defaults to 0 when blank/Any/invalid
 */
export function parseMinGapMinutes(minGap) {
  const parsed = parseBreakLabelToMinutes(minGap);
  if (parsed == null || !Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

/**
 * Normalize min/max gap so min ≥ 0, max ≥ 0 (or null=Any), and min ≤ max.
 * @param {string | null | undefined} minGap
 * @param {string | null | undefined} maxGap
 * @returns {{ minGapMin: number, maxGapMin: number | null }}
 */
export function normalizeBreakGapRange(minGap, maxGap) {
  let minGapMin = parseMinGapMinutes(minGap);
  let maxGapMin = parseMaxGapMinutes(maxGap);
  if (maxGapMin != null && (!Number.isFinite(maxGapMin) || maxGapMin < 0)) {
    maxGapMin = null;
  }
  if (maxGapMin != null && minGapMin > maxGapMin) {
    minGapMin = maxGapMin;
  }
  return { minGapMin, maxGapMin };
}

/**
 * Resolve ISO plan date from form (prefer dateIso; else Pacific today).
 * @param {object} form
 * @param {Date | (() => Date)} [now]
 */
export function resolveBuildFormDateIso(form, now = new Date()) {
  const iso = asTrimmed(form?.dateIso);
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const nowFn = typeof now === 'function' ? now : () => now;
  return pacificDateString(nowFn());
}

/**
 * Theater id list from Where preference + HomeData registry.
 * @param {object} form
 * @param {object | null | undefined} homeData
 * @returns {string[]}
 */
export function resolveTheaterFilterIds(form, homeData) {
  const pref = asTrimmed(form?.theaterPrefId) ?? 'any';
  console.log('[resolveTheaterFilterIds] pref:', pref);
  if (pref === 'any') return [];
  
  // Custom: use explicitly selected theaters
  if (pref === 'custom') {
    const selected = Array.isArray(form?.selectedTheaters)
      ? form.selectedTheaters.filter(Boolean)
      : [];
    console.log('[resolveTheaterFilterIds] custom selected:', selected);
    return selected;
  }

  const theaters = Array.isArray(homeData?.theaters)
    ? homeData.theaters
    : Object.values(homeData?.theatersById ?? {});

  if (pref === 'amc') {
    return theaters
      .filter((t) => /amc/i.test(String(t?.name ?? '')) || /amc/i.test(String(t?.id ?? '')))
      .map((t) => t.id)
      .filter(Boolean);
  }
  if (pref === 'indie' || pref === 'independent') {
    return theaters
      .filter((t) => {
        const name = String(t?.name ?? '');
        const id = String(t?.id ?? '');
        return !/amc|regal/i.test(name) && !/amc|regal/i.test(id);
      })
      .map((t) => t.id)
      .filter(Boolean);
  }
  // Specific theater id selected
  if (theaters.some((t) => t.id === pref)) return [pref];
  return [];
}

/**
 * Stable planner filter tokens from bucket cards.
 * Prefers filmId + showtime keys; title only when no usable identity exists.
 *
 * @param {object[]} filmCards
 * @returns {string[]}
 */
function filmTokensFromCards(filmCards) {
  return filmIdentityTokensFromCards(filmCards);
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function compactPlannerClock(value) {
  const raw = asTrimmed(value);
  if (!raw) return '';
  // Fixture / UI clocks are "2:00 PM"; engine parse needs "2:00PM".
  return raw.replace(/\s+/g, '');
}

/**
 * @param {object} form
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [options]
 */
export function mapBuildFormToPlannerFilters(form, homeData, options = {}) {
  const date = resolveBuildFormDateIso(form, options.now);
  const theaters = resolveTheaterFilterIds(form, homeData);
  const counts = parsePlanSizeFilmCounts(form?.planSize);
  // Engine filmCount is a single mode; caller may loop. Default to 2 for filter shell.
  const filmCount = counts === 'max' ? 'max' : counts.includes(2) ? 2 : counts[0] ?? 2;
  const { minGapMin, maxGapMin } = normalizeBreakGapRange(
    form?.minGap,
    form?.maxGap,
  );
  // Form always owns max gap (including explicit “Any”); do not fall back to
  // the 2-film engine default when the user cleared the ceiling.
  const maxGapFieldSet = asTrimmed(form?.maxGap) != null;

  const filters = buildPlannerSearchFilters({
    date,
    theaters,
    filmCount,
    startAfter: compactPlannerClock(form?.startAfter),
    finishBy: compactPlannerClock(form?.finishBefore),
    minGapMin: String(minGapMin),
    maxGapMin: maxGapMin != null ? String(maxGapMin) : '',
    maxGapExplicit: maxGapFieldSet,
    includeFilms: filmTokensFromCards(form?.mustInclude),
    preferredFilms: filmTokensFromCards(form?.wouldLove),
    excludeFilms: filmTokensFromCards(form?.notInterested),
  });

  filters.allowRepeatFilms = Boolean(form?.allowRepeats);

  // Premium format preference is soft — engine has no format hard-filter.
  // Walk / budget / multi-theater miles intentionally omitted (D08 / D16).

  return {
    filters,
    filmCounts: counts,
    dateIso: date,
    suppressed: Object.freeze({
      walking: true,
      budget: true,
      multiTheater: true,
    }),
  };
}
