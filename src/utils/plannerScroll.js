export const MOBILE_PLANNER_MEDIA_QUERY = '(max-width: 768px)';

/** Default offset for sticky mobile filter summary bar (px). */
export const PLANNER_MOBILE_STICKY_SCROLL_OFFSET = 72;

/**
 * @returns {boolean}
 */
export function isMobilePlannerViewport() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(MOBILE_PLANNER_MEDIA_QUERY).matches;
}

/**
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {{ smooth?: boolean }} [options]
 * @returns {'auto' | 'smooth'}
 */
export function getScrollBehavior({ smooth = true } = {}) {
  if (!smooth || prefersReducedMotion()) return 'auto';
  return 'smooth';
}

/**
 * Run callback after the next layout/paint (double rAF).
 *
 * @param {() => void} callback
 */
export function runAfterLayout(callback) {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

/**
 * Adjust window scroll when a block above the viewport changes height (collapse/expand).
 *
 * @param {{ top: number, heightBefore: number, heightAfter: number, smooth?: boolean }} options
 *   top — document Y of the element before height change
 */
export function compensateScrollForLayoutHeightChange({
  top,
  heightBefore,
  heightAfter,
  smooth = false,
}) {
  if (typeof window === 'undefined') return;
  if (!heightBefore || heightBefore === heightAfter) return;

  const removedHeight = heightBefore - heightAfter;
  if (!removedHeight) return;

  const scrollY = window.scrollY;
  const elementBottom = top + heightBefore;

  let scrollAdjust = 0;
  if (elementBottom <= scrollY) {
    scrollAdjust = removedHeight;
  } else if (top < scrollY) {
    const aboveViewport = scrollY - top;
    scrollAdjust = removedHeight * (aboveViewport / heightBefore);
  }

  if (Math.abs(scrollAdjust) < 1) return;

  window.scrollTo({
    top: scrollY - scrollAdjust,
    left: 0,
    behavior: getScrollBehavior({ smooth }),
  });
}

/**
 * Scroll so an element's top aligns below a sticky offset.
 *
 * @param {HTMLElement | null | undefined} element
 * @param {{ offset?: number, smooth?: boolean }} [options]
 */
export function scrollElementIntoViewWithOffset(element, { offset = 0, smooth = true } = {}) {
  if (!element || typeof window === 'undefined') return;

  const rect = element.getBoundingClientRect();
  const targetTop = rect.top + window.scrollY - offset;
  window.scrollTo({
    top: Math.max(0, targetTop),
    left: 0,
    behavior: getScrollBehavior({ smooth }),
  });
}

/**
 * @param {HTMLElement | null | undefined} anchor
 * @returns {number}
 */
export function measureDocumentTop(anchor) {
  if (!anchor || typeof window === 'undefined') return 0;
  return anchor.getBoundingClientRect().top + window.scrollY;
}
