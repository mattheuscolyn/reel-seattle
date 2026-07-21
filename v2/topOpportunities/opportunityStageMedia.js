/**
 * Resolve artwork for the Top Opportunities wide stage (I-03R).
 *
 * Prefer future `backdropUrl` when present; otherwise use portrait `posterUrl`
 * as a full-bleed cover crop. Never invent URLs.
 *
 * @param {{
 *   backdropUrl?: string | null,
 *   posterUrl?: string | null,
 * }} media
 * @returns {{
 *   kind: 'backdrop' | 'poster' | 'fallback',
 *   url: string | null,
 * }}
 */
export function resolveOpportunityStageMedia(media = {}) {
  const backdrop =
    typeof media.backdropUrl === 'string' && media.backdropUrl.trim()
      ? media.backdropUrl.trim()
      : null;
  if (backdrop) {
    return { kind: 'backdrop', url: backdrop };
  }

  const poster =
    typeof media.posterUrl === 'string' && media.posterUrl.trim()
      ? media.posterUrl.trim()
      : null;
  if (poster) {
    return { kind: 'poster', url: poster };
  }

  return { kind: 'fallback', url: null };
}
