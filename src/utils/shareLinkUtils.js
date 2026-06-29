/**
 * Build a shareable URL from a Location-like object.
 *
 * @param {{ href?: string, origin?: string, pathname?: string, search?: string }} location
 * @returns {string}
 */
export function getShareUrlFromLocation(location) {
  if (location?.href) return location.href;

  const origin = location?.origin ?? '';
  const pathname = location?.pathname ?? '';
  const search = location?.search ?? '';
  if (!origin && !pathname) return '';

  return `${origin}${pathname}${search}`;
}

/**
 * Copy text to the clipboard with a legacy fallback.
 *
 * @param {string} text
 * @returns {Promise<{ ok: boolean }>}
 */
export async function copyTextToClipboard(text) {
  if (!text) return { ok: false };

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch {
      // Fall through to execCommand fallback.
    }
  }

  if (typeof document === 'undefined') return { ok: false };

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return { ok: Boolean(ok) };
  } catch {
    return { ok: false };
  }
}

/**
 * Share text via the Web Share API when available, otherwise copy to clipboard.
 *
 * @param {{ title?: string, text: string }} payload
 * @returns {Promise<{ ok: boolean, method: 'share' | 'clipboard' | 'cancelled' | 'none' }>}
 */
export async function shareTextWithFallback({ title = '', text }) {
  if (!text) return { ok: false, method: 'none' };

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return { ok: true, method: 'share' };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return { ok: false, method: 'cancelled' };
      }
    }
  }

  const { ok } = await copyTextToClipboard(text);
  return { ok, method: ok ? 'clipboard' : 'none' };
}
