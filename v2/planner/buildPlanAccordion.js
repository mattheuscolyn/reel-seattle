/**
 * Build a Plan accordion helpers — single-open state + scroll anchoring.
 * No React; safe for node tests.
 */

export const BUILD_PLAN_ACCORDION_IDS = Object.freeze([
  'when',
  'where',
  'what',
  'fineTuning',
]);

/**
 * @param {string | null | undefined} raw
 * @returns {null | 'when' | 'what' | 'where' | 'fineTuning'}
 */
export function parseBuildPlanSectionQuery(raw) {
  if (raw == null || raw === '' || raw === 'none' || raw === 'collapsed') {
    return null;
  }
  const key = String(raw).trim().toLowerCase();
  if (key === 'when') return 'when';
  if (key === 'what') return 'what';
  if (key === 'where') return 'where';
  if (key === 'fine-tuning' || key === 'finetuning' || key === 'fine') {
    return 'fineTuning';
  }
  return null;
}

/**
 * Toggle single-open accordion: open target, or close if already open.
 * @param {null | string} current
 * @param {string} target
 */
export function nextOpenSection(current, target) {
  if (!BUILD_PLAN_ACCORDION_IDS.includes(target)) return current ?? null;
  return current === target ? null : target;
}

/**
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Comfortable offset below sticky app header for newly opened section headers.
 */
export const BUILD_PLAN_SCROLL_TOP_OFFSET_PX = 72;

/**
 * After layout commits, keep the target accordion header visible and
 * compensate for height changes when switching sections.
 *
 * @param {{
 *   headerEl: Element | null,
 *   beforeTop: number | null,
 *   mode: 'open' | 'collapse' | 'switch',
 * }} args
 */
export function adjustBuildPlanAccordionScroll({
  headerEl,
  beforeTop,
  mode,
}) {
  if (!headerEl || typeof window === 'undefined') return;

  const reduced = prefersReducedMotion();
  const behavior = reduced ? 'auto' : 'smooth';
  const afterTop = headerEl.getBoundingClientRect().top;

  if (
    typeof beforeTop === 'number' &&
    Number.isFinite(beforeTop) &&
    (mode === 'switch' || mode === 'collapse')
  ) {
    const delta = afterTop - beforeTop;
    if (Math.abs(delta) > 1) {
      window.scrollBy({ top: delta, behavior: 'auto' });
    }
  }

  if (mode === 'open' || mode === 'switch') {
    const top = headerEl.getBoundingClientRect().top;
    const target = BUILD_PLAN_SCROLL_TOP_OFFSET_PX;
    const delta = top - target;
    if (delta < -12 || delta > 48) {
      window.scrollBy({ top: delta, behavior });
    }
  }

  // Avoid scrolling past document end after a collapse shrinks the page.
  const maxScroll = Math.max(
    0,
    document.documentElement.scrollHeight - window.innerHeight,
  );
  if (window.scrollY > maxScroll) {
    window.scrollTo({ top: maxScroll, behavior: 'auto' });
  }
}

/**
 * Compact collapsed summaries derived from form state (not hard-coded copy).
 * @param {object} form
 * @param {{ theaterPrefs?: Array<{ id: string, title: string }> }} [chrome]
 */
export function buildCollapsedSectionSummaries(form, chrome = {}) {
  const theaterPrefs = chrome.theaterPrefs ?? [];
  const theater =
    theaterPrefs.find((p) => p.id === form.theaterPrefId)?.title ??
    'Any theater';
  const flexibleBit = form.flexible ? ' · Flexible' : '';
  const when = `${form.dateDisplay} · ${form.startAfter}–${form.finishBefore}${flexibleBit}`;
  const what = `${form.mustInclude.length} must include · ${form.wouldLove.length} interested · ${form.notInterested.length} excluded`;
  const where = `${theater} · ${form.locationDisplay}`;
  const gapLabel = String(form.maxGap || '')
    .replace(/^Max\s+/i, '')
    .trim();
  const fine = `${form.planSize} · Max ${gapLabel} gap · Premium formats`;
  return { when, what, where, fineTuning: fine };
}

/**
 * Sticky summary lines for the CTA footer.
 * @param {object} form
 */
export function buildPlanFooterSummary(form) {
  return {
    line1: `${form.dateShort} · ${form.startAfter}–${form.finishBefore}`,
    line2: `${form.mustInclude.length} must include · ${form.wouldLove.length} interested · ${form.locationShort}`,
  };
}
