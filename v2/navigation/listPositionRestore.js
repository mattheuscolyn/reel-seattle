/**
 * Reusable list-position restore for long destinations.
 *
 * Prefer a stable item key (film, plan, etc.) so restoration survives
 * layout/data height changes. Pixel scrollY is a fallback only.
 * Callers must pass a restore object from a prior navigation context —
 * a missing/empty restore is a fresh visit and must not move the viewport.
 */

export const LIST_RESTORE_ATTR = 'data-list-restore-key';

/**
 * @typedef {{
 *   itemKey: string | null,
 *   scrollY: number,
 * }} ListRestorePosition
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asItemKey(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function asScrollY(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * @param {{
 *   itemKey?: string | null,
 *   scrollY?: number,
 * }} [ui]
 * @param {{ window?: { scrollY?: number } | null }} [options]
 * @returns {ListRestorePosition}
 */
export function captureListPosition(ui = {}, options = {}) {
  const win =
    options.window !== undefined
      ? options.window
      : typeof window !== 'undefined'
        ? window
        : null;
  const fromWindow =
    win && Number.isFinite(win.scrollY) ? win.scrollY : 0;
  return {
    itemKey: asItemKey(ui.itemKey),
    scrollY: ui.scrollY != null ? asScrollY(ui.scrollY) : asScrollY(fromWindow),
  };
}

/**
 * True when this object represents a prior navigation context worth restoring.
 * Fresh visits (null, empty key, scrollY 0) return false.
 * @param {unknown} position
 * @returns {boolean}
 */
export function hasListRestore(position) {
  if (!position || typeof position !== 'object') return false;
  const record = /** @type {Record<string, unknown>} */ (position);
  if (asItemKey(record.itemKey ?? record.restoreItemKey)) return true;
  return asScrollY(record.scrollY) > 0;
}

/**
 * Normalize browse/nav restore blobs into a ListRestorePosition.
 * @param {unknown} raw
 * @returns {ListRestorePosition | null}
 */
export function normalizeListRestore(raw) {
  if (!hasListRestore(raw)) return null;
  const record = /** @type {Record<string, unknown>} */ (raw);
  return {
    itemKey: asItemKey(record.itemKey ?? record.restoreItemKey),
    scrollY: asScrollY(record.scrollY),
  };
}

/**
 * @param {Element} element
 * @param {string} attr
 * @param {string} itemKey
 * @returns {boolean}
 */
function elementMatchesKey(element, attr, itemKey) {
  if (typeof element.getAttribute !== 'function') return false;
  return element.getAttribute(attr) === itemKey;
}

/**
 * Restore after the destination list has enough content to scroll.
 * Prefers scrolling the originating item into view; falls back to scrollY.
 *
 * @param {unknown} position
 * @param {{
 *   root?: { querySelectorAll?: Function } | null,
 *   itemAttr?: string,
 *   scrollTo?: ((y: number) => void) | null,
 *   scrollIntoView?: ((el: object, opts?: object) => void) | null,
 * }} [options]
 * @returns {{ restored: boolean, method: 'item' | 'scroll' | null }}
 */
export function restoreListPosition(position, options = {}) {
  const normalized = normalizeListRestore(position);
  if (!normalized) return { restored: false, method: null };

  const attr = options.itemAttr ?? LIST_RESTORE_ATTR;
  const root =
    options.root !== undefined
      ? options.root
      : typeof document !== 'undefined'
        ? document
        : null;

  if (normalized.itemKey && root && typeof root.querySelectorAll === 'function') {
    const nodes = root.querySelectorAll(`[${attr}]`);
    const list = Array.from(nodes ?? []);
    const match = list.find((el) =>
      elementMatchesKey(/** @type {Element} */ (el), attr, normalized.itemKey),
    );
    if (match) {
      const scrollIntoView =
        options.scrollIntoView ??
        ((el, opts) => {
          if (typeof el.scrollIntoView === 'function') el.scrollIntoView(opts);
        });
      scrollIntoView(match, { block: 'start', behavior: 'auto' });
      return { restored: true, method: 'item' };
    }
  }

  if (normalized.scrollY > 0) {
    const scrollTo =
      options.scrollTo ??
      (typeof window !== 'undefined'
        ? (y) => window.scrollTo(0, y)
        : null);
    if (typeof scrollTo === 'function') {
      scrollTo(normalized.scrollY);
      return { restored: true, method: 'scroll' };
    }
  }

  return { restored: false, method: null };
}
