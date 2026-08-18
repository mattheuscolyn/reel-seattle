/**
 * Deterministic Help Me Choose recommendation logic.
 * General format guidance — not film-specific mastering analysis.
 */

import { FORMAT_CONTENT } from './formatsExperiencesContent.js';

/**
 * @typedef {'immersive-screen'|'picture-sound'|'on-film'|'watch-3d'|'easy-premium'} PriorityId
 * @typedef {{
 *   bestMatchId: string,
 *   alsoConsiderIds: string[],
 *   bestMatchBlurb: string,
 *   explanation: string,
 * }} RecommendResult
 */

/**
 * Pick first id that currently has showtimes; otherwise fall through the list.
 * @param {string[]} orderedIds
 * @param {Record<string, { hasCurrentShowtimes?: boolean, theaterCount?: number }>} availabilityMap
 * @returns {string | null}
 */
function firstAvailable(orderedIds, availabilityMap) {
  for (const id of orderedIds) {
    if (availabilityMap[id]?.hasCurrentShowtimes) return id;
  }
  return orderedIds[0] ?? null;
}

/**
 * Among candidates, pick the one with the highest theater count (ties keep order).
 * @param {string[]} candidateIds
 * @param {Record<string, { theaterCount?: number, hasCurrentShowtimes?: boolean }>} availabilityMap
 */
function broadestAvailable(candidateIds, availabilityMap) {
  let bestId = null;
  let bestCount = -1;
  for (const id of candidateIds) {
    const count = availabilityMap[id]?.theaterCount ?? 0;
    const available = availabilityMap[id]?.hasCurrentShowtimes;
    if (!available) continue;
    if (count > bestCount) {
      bestCount = count;
      bestId = id;
    }
  }
  if (bestId) return bestId;
  return candidateIds[0] ?? null;
}

/**
 * @param {PriorityId} priorityId
 * @param {Record<string, { theaterCount?: number, hasCurrentShowtimes?: boolean }>} [availabilityMap]
 * @returns {RecommendResult}
 */
export function recommendFormats(priorityId, availabilityMap = {}) {
  switch (priorityId) {
    case 'immersive-screen': {
      const best =
        firstAvailable(['imax-70mm', 'imax', 'xl-amc'], availabilityMap) ??
        'imax';
      const also = ['imax', 'xl-amc', 'dolby-cinema'].filter(
        (id) => id !== best,
      );
      return {
        bestMatchId: best,
        alsoConsiderIds: also.slice(0, 2),
        bestMatchBlurb:
          best === 'imax-70mm'
            ? 'Best for: maximum-scale analog IMAX when a 15/70 engagement exists.'
            : best === 'xl-amc'
              ? 'Best for: a large AMC auditorium when IMAX isn’t the practical pick.'
              : 'Best for: immersive screen scale and expanded image on supported films.',
        explanation:
          'When scale matters most, prefer IMAX 70mm if it’s actually playing, otherwise IMAX, with XL as a more broadly available large-screen alternative.',
      };
    }
    case 'picture-sound': {
      const best =
        firstAvailable(
          ['dolby-cinema', 'imax', 'xl-amc'],
          availabilityMap,
        ) ?? 'dolby-cinema';
      const also = ['imax', 'xl-amc', 'dolby-cinema'].filter(
        (id) => id !== best,
      );
      return {
        bestMatchId: best,
        alsoConsiderIds: also.slice(0, 2),
        bestMatchBlurb:
          best === 'dolby-cinema'
            ? 'Best for: contrast, highlights, and immersive Atmos sound.'
            : best === 'imax'
              ? 'Best for: scale and IMAX sound when Dolby Cinema isn’t available.'
              : 'Best for: a convenient premium picture upgrade.',
        explanation:
          'Dolby Cinema is the strongest general picture-and-sound package. IMAX is the alternative when scale matters more; XL is a convenient premium fallback.',
      };
    }
    case 'on-film': {
      const best =
        firstAvailable(['imax-70mm', '70mm', '35mm'], availabilityMap) ??
        '70mm';
      const also = ['imax-70mm', '70mm', '35mm'].filter((id) => id !== best);
      return {
        bestMatchId: best,
        alsoConsiderIds: also.slice(0, 2),
        bestMatchBlurb:
          best === 'imax-70mm'
            ? 'Best for: rare 15/70 film with enormous IMAX framing.'
            : best === '35mm'
              ? 'Best for: photochemical texture and repertory film character.'
              : 'Best for: large-format film detail distinct from IMAX 70mm.',
        explanation:
          'Film projection is the goal here. IMAX 70mm, conventional 70mm, and 35mm are different experiences — none is universally “better,” but each is worth seeking when available.',
      };
    }
    case 'watch-3d': {
      return {
        bestMatchId: 'reald-3d',
        alsoConsiderIds: [],
        bestMatchBlurb:
          'Best for: stereoscopic depth when a RealD engagement is playing.',
        explanation:
          'When you specifically want 3D, RealD 3D is the format to look for. Glasses and lower perceived brightness are the usual tradeoffs.',
      };
    }
    case 'easy-premium': {
      const premiumPool = ['xl-amc', 'dolby-cinema', 'imax'];
      const best =
        broadestAvailable(premiumPool, availabilityMap) ?? 'xl-amc';
      const also = premiumPool
        .filter((id) => id !== best)
        .sort(
          (a, b) =>
            (availabilityMap[b]?.theaterCount ?? 0) -
            (availabilityMap[a]?.theaterCount ?? 0),
        );
      return {
        bestMatchId: best,
        alsoConsiderIds: also.slice(0, 2),
        bestMatchBlurb: `Best for: a premium presentation that’s relatively easy to find right now (${FORMAT_CONTENT[best]?.name ?? best}).`,
        explanation:
          'This picks the general premium format with the broadest current Seattle availability among XL, Dolby Cinema, and IMAX.',
      };
    }
    default:
      return recommendFormats('picture-sound', availabilityMap);
  }
}
