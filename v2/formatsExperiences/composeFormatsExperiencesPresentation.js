/**
 * Presentation helpers for Formats & Experiences surfaces.
 */

import {
  EXPERIENCE_CANONICAL_IDS,
  FORMAT_LANDING_ORDER,
  canonicalToBrowseFormatKey,
} from './formatNormalize.js';
import {
  COMPARE_ATTRIBUTES,
  COMPARE_INTRO,
  EXPERIENCE_CONTENT,
  FORMAT_CONTENT,
  LANDING_COPY,
  RECOMMEND_COPY,
  RECOMMEND_PRIORITIES,
  getExperienceContent,
  getFormatContent,
  listExperienceContent,
  listFormatContent,
} from './formatsExperiencesContent.js';
import {
  resolveAvailabilityMap,
  resolveCanonicalAvailability,
} from './availability.js';
import { recommendFormats } from './recommendationLogic.js';

/**
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date),
 *   filters?: {
 *     availableOnly?: boolean,
 *     kinds?: Array<'format' | 'experience'>,
 *     ids?: string[],
 *   },
 * }} [opts]
 */
export function composeFormatsExperiencesLanding(homeData, opts = {}) {
  const availability = resolveAvailabilityMap(
    homeData,
    [...FORMAT_LANDING_ORDER, ...EXPERIENCE_CANONICAL_IDS],
    { now: opts.now },
  );

  const filters = opts.filters ?? {};
  const availableOnly = Boolean(filters.availableOnly);
  const kindSet =
    Array.isArray(filters.kinds) && filters.kinds.length > 0
      ? new Set(filters.kinds)
      : null;
  const idSet =
    Array.isArray(filters.ids) && filters.ids.length > 0
      ? new Set(filters.ids)
      : null;

  const formats = listFormatContent()
    .map((format) => {
      const avail = availability[format.id] ?? {
        theaterCount: 0,
        hasCurrentShowtimes: false,
        availabilityLabel: 'No current showtimes',
      };
      return {
        id: format.id,
        name: format.name,
        shortDescription: format.shortDescription,
        tileTone: format.tileTone,
        tileLabel: format.tileLabel,
        availabilityLabel: avail.availabilityLabel,
        theaterCount: avail.theaterCount,
        hasCurrentShowtimes: avail.hasCurrentShowtimes,
        browseFormatKey: canonicalToBrowseFormatKey(format.browseCanonicalId),
      };
    })
    .filter((row) => {
      if (kindSet && !kindSet.has('format')) return false;
      if (idSet && !idSet.has(row.id)) return false;
      if (availableOnly && !row.hasCurrentShowtimes) return false;
      return true;
    });

  const experiences = listExperienceContent()
    .map((experience) => {
      const avail = availability[experience.id] ?? {
        theaterCount: 0,
        hasCurrentShowtimes: false,
        availableAtLabel: 'No current Seattle showtimes',
      };
      return {
        id: experience.id,
        name: experience.name,
        shortDescription: experience.shortDescription,
        cardSummary: experience.cardSummary ?? experience.shortDescription,
        icon: experience.icon,
        theaterCount: avail.theaterCount,
        hasCurrentShowtimes: avail.hasCurrentShowtimes,
        availableAtLabel: avail.availableAtLabel,
        browseFormatKey: canonicalToBrowseFormatKey(
          experience.browseCanonicalId,
        ),
      };
    })
    .filter((row) => {
      if (kindSet && !kindSet.has('experience')) return false;
      if (idSet && !idSet.has(row.id)) return false;
      if (availableOnly && !row.hasCurrentShowtimes) return false;
      return true;
    });

  return {
    copy: LANDING_COPY,
    countLabel: LANDING_COPY.countTemplate(
      listFormatContent().length,
      listExperienceContent().length,
    ),
    formats,
    experiences,
    availability,
    filterOptions: {
      formats: listFormatContent().map((f) => ({ id: f.id, label: f.name })),
      experiences: listExperienceContent().map((e) => ({
        id: e.id,
        label: e.name,
      })),
    },
  };
}

/**
 * @param {string} formatId
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [opts]
 */
export function composeFormatDetail(formatId, homeData, opts = {}) {
  const content = getFormatContent(formatId);
  if (!content) return null;
  const availability = resolveCanonicalAvailability(homeData, formatId, opts);
  return {
    ...content,
    availability,
    availabilityLabel: availability.availabilityLabel,
    availableAtLabel: availability.availableAtLabel,
    browseFormatKey: canonicalToBrowseFormatKey(content.browseCanonicalId),
    showtimesCta: `View ${content.name} showtimes`,
    compareCta: 'Compare formats',
  };
}

/**
 * @param {string} experienceId
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [opts]
 */
export function composeExperienceDetail(experienceId, homeData, opts = {}) {
  const content = getExperienceContent(experienceId);
  if (!content) return null;
  const availability = resolveCanonicalAvailability(
    homeData,
    experienceId,
    opts,
  );
  return {
    ...content,
    availability,
    availableAtLabel: availability.availableAtLabel,
    browseFormatKey: canonicalToBrowseFormatKey(content.browseCanonicalId),
    showtimesCta: 'Browse showtimes',
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [opts]
 */
export function composeCompareFormats(homeData, opts = {}) {
  const availability = resolveAvailabilityMap(
    homeData,
    FORMAT_LANDING_ORDER,
    opts,
  );
  const columns = FORMAT_LANDING_ORDER.map((id) => {
    const content = FORMAT_CONTENT[id];
    const avail = availability[id];
    return {
      id,
      name: content.name,
      tileTone: content.tileTone,
      tileLabel: content.tileLabel,
      cells: {
        ...content.comparison,
        availability: avail?.availabilityLabel ?? 'No current showtimes',
      },
      browseFormatKey: canonicalToBrowseFormatKey(content.browseCanonicalId),
      theaterCount: avail?.theaterCount ?? 0,
      hasCurrentShowtimes: avail?.hasCurrentShowtimes ?? false,
    };
  });

  return {
    intro: COMPARE_INTRO,
    attributes: COMPARE_ATTRIBUTES,
    columns,
  };
}

/**
 * @param {string} priorityId
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [opts]
 */
export function composeFormatRecommendation(priorityId, homeData, opts = {}) {
  const availability = resolveAvailabilityMap(
    homeData,
    FORMAT_LANDING_ORDER,
    opts,
  );
  const result = recommendFormats(priorityId, availability);
  const best = FORMAT_CONTENT[result.bestMatchId];
  const also = result.alsoConsiderIds
    .map((id) => FORMAT_CONTENT[id])
    .filter(Boolean)
    .map((format) => ({
      id: format.id,
      name: format.name,
      shortDescription: format.shortDescription,
      tileTone: format.tileTone,
      tileLabel: format.tileLabel,
      browseFormatKey: canonicalToBrowseFormatKey(format.browseCanonicalId),
      availabilityLabel:
        availability[format.id]?.availabilityLabel ?? 'No current showtimes',
    }));

  return {
    copy: RECOMMEND_COPY,
    priorities: RECOMMEND_PRIORITIES,
    selectedPriorityId: priorityId,
    bestMatch: best
      ? {
          id: best.id,
          name: best.name,
          shortDescription: best.shortDescription,
          tileTone: best.tileTone,
          tileLabel: best.tileLabel,
          blurb: result.bestMatchBlurb,
          browseFormatKey: canonicalToBrowseFormatKey(best.browseCanonicalId),
          availabilityLabel:
            availability[best.id]?.availabilityLabel ?? 'No current showtimes',
        }
      : null,
    alsoConsider: also,
    explanation: result.explanation,
    ruleOfThumb: RECOMMEND_COPY.ruleOfThumb,
  };
}

export {
  FORMAT_CONTENT,
  EXPERIENCE_CONTENT,
  FORMAT_LANDING_ORDER,
  EXPERIENCE_CANONICAL_IDS,
};
