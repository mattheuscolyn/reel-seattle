import { buildInviteShareText } from './friendsCopy.js';

/**
 * @param {string} text
 * @param {{ writeText?: (value: string) => Promise<void> } | null} [clipboard]
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function copyInviteValue(text, clipboard) {
  const clip =
    clipboard ??
    (typeof navigator !== 'undefined' ? navigator.clipboard : null);
  if (!clip || typeof clip.writeText !== 'function') {
    return { ok: false, reason: 'clipboard_unavailable' };
  }
  try {
    await clip.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'clipboard_failed' };
  }
}

/**
 * Prefer Web Share. Fall back to copying the invite URL.
 *
 * @param {string} inviteUrl
 * @param {{
 *   share?: ((data: { text?: string, url?: string }) => Promise<void>) | null,
 *   clipboard?: { writeText?: (value: string) => Promise<void> } | null,
 * }} [deps]
 * @returns {Promise<{ ok: true, method: 'share' | 'copy' } | { ok: false, reason: string }>}
 */
export async function shareOrCopyInviteLink(inviteUrl, deps = {}) {
  const url = String(inviteUrl || '').trim();
  if (!url) return { ok: false, reason: 'missing_url' };
  const text = buildInviteShareText(url);
  const share =
    deps.share ??
    (typeof navigator !== 'undefined' && typeof navigator.share === 'function'
      ? navigator.share.bind(navigator)
      : null);
  if (typeof share === 'function') {
    try {
      await share({ text, url });
      return { ok: true, method: 'share' };
    } catch (error) {
      if (error && /** @type {{ name?: string }} */ (error).name === 'AbortError') {
        return { ok: false, reason: 'aborted' };
      }
    }
  }
  const copied = await copyInviteValue(url, deps.clipboard ?? undefined);
  if (copied.ok) return { ok: true, method: 'copy' };
  return { ok: false, reason: copied.reason };
}
