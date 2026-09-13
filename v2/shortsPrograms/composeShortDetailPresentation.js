/**
 * Compose Short Detail presentation from shorts artifact + schedule join.
 * Shorts never own showtimes — program context is display-only.
 */

import { truncateSynopsis } from '../filmDetail/filmDetailModel.js';
import {
  asText,
  buildShortDetailRows,
  collectionIdsForProgram,
  formatShortDirectors,
  formatShortMetaLine,
  getShort,
  getShortsProgram,
  membershipsForProgram,
  programDisplayTitle,
  programMembershipsForShort,
  shortDisplayTitle,
} from './shortsProgramsModel.js';

/**
 * @param {{
 *   index: import('./shortsProgramsModel.js').indexShortsProgramsArtifact extends Function
 *     ? ReturnType<import('./shortsProgramsModel.js').indexShortsProgramsArtifact>
 *     : any,
 *   shortId: string | null | undefined,
 *   shortsProgramId?: string | null,
 *   collectionsArtifact?: object | null,
 *   homeData?: object | null,
 * }} input
 */
export function composeShortDetailPresentation(input) {
  const index = input?.index ?? null;
  const shortId = asText(input?.shortId);
  const short = getShort(index, shortId);
  if (!short || !shortId) {
    return {
      resolved: false,
      shortId,
      reason: 'short_not_found',
    };
  }

  const memberships = programMembershipsForShort(index, shortId);
  const preferredProgramId =
    asText(input?.shortsProgramId) ||
    asText(memberships[0]?.shortsProgramId);
  const membership =
    memberships.find((m) => m.shortsProgramId === preferredProgramId) ||
    memberships[0] ||
    null;
  const program = getShortsProgram(
    index,
    membership?.shortsProgramId || preferredProgramId,
  );

  const title = shortDisplayTitle(short.title) || 'Untitled short';
  const metaLine = formatShortMetaLine(short, membership);
  const directorLine = formatShortDirectors(short, membership);

  const description =
    asText(short.description) ||
    asText(membership?.parsedDescription) ||
    asText(membership?.rawDescription);
  const synopsis = truncateSynopsis(description, 160);

  const imageUrl = asText(short.imageUrl) || asText(program?.imageUrl);
  const hero = {
    title,
    metaLine,
    genres: null,
    director: directorLine,
    posterUrl: imageUrl,
    backdropUrl: imageUrl,
    badges: [],
  };

  let screensAsPartOf = null;
  if (program) {
    const programTitle =
      programDisplayTitle(program.title) || asText(program.title);
    const showtimeFilmKey = asText(program.showtimeFilmKey);
    const film = Array.isArray(input?.homeData?.films)
      ? input.homeData.films.find((row) => row?.filmKey === showtimeFilmKey)
      : null;
    const opp = Array.isArray(input?.homeData?.opportunities)
      ? input.homeData.opportunities
          .filter((row) => row?.filmKey === showtimeFilmKey)
          .sort((a, b) => String(a.startsAt || '').localeCompare(String(b.startsAt || '')))[0]
      : null;
    const whenLabel =
      formatOpportunityWhen(opp) ||
      (asText(opp?.localDate) && asText(opp?.timeDisplay)
        ? formatLocalDateTimeLabel(opp.localDate, opp.timeDisplay)
        : null);
    const theaterName =
      asText(opp?.theaterName) ||
      asText(film?.theaterName) ||
      'NW Film Forum';
    screensAsPartOf = {
      shortsProgramId: program.shortsProgramId,
      title: programTitle,
      kicker: 'Short Film Program',
      theaterName,
      whenLabel,
      imageUrl: asText(program.imageUrl),
      showtimeFilmKey,
    };
  }

  const collectionId = collectionIdsForProgram(program)[0] ?? null;
  const collection = resolveCollectionCard(input?.collectionsArtifact, collectionId);

  const siblingMemberships = membershipsForProgram(
    index,
    program?.shortsProgramId,
  ).filter((m) => m.shortId !== shortId);
  const otherShorts = siblingMemberships.map((m) => {
    const sibling = getShort(index, m.shortId);
    return {
      shortId: m.shortId,
      title: shortDisplayTitle(sibling?.title || m.parsedTitle || m.rawTitle),
      metaLine: formatShortMetaLine(sibling, m),
      runtimeLabel:
        sibling?.runtimeMin != null
          ? `${sibling.runtimeMin} min`
          : m.parsedRuntimeMin != null
            ? `${m.parsedRuntimeMin} min`
            : null,
      imageUrl: asText(sibling?.imageUrl),
    };
  });

  const detailRows = buildShortDetailRows(short, membership);

  return {
    resolved: true,
    shortId,
    shortsProgramId: program?.shortsProgramId ?? null,
    canonicalFilmId: asText(short.canonicalFilmId),
    hero,
    synopsis: {
      available: Boolean(synopsis.full),
      preview: synopsis.preview,
      full: synopsis.full,
      needsMore: synopsis.needsMore,
      tags: [],
    },
    screensAsPartOf,
    collection,
    otherShorts,
    detailRows,
    // Explicit invariant for tests / UI: no Short-owned showtimes section.
    hasShortOwnedShowtimes: false,
  };
}

/**
 * @param {object | null | undefined} opp
 */
function formatOpportunityWhen(opp) {
  if (!opp) return null;
  if (asText(opp.localDate) && asText(opp.timeDisplay)) {
    return formatLocalDateTimeLabel(opp.localDate, opp.timeDisplay);
  }
  const explicit =
    asText(opp.whenLabel) ||
    asText(opp.dateLabel) ||
    asText(opp.timeDisplay);
  if (explicit) return explicit;
  const startsAt = asText(opp.startsAt);
  if (!startsAt) return null;
  try {
    const date = new Date(startsAt);
    if (Number.isNaN(date.getTime())) return null;
    const weekday = date.toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'America/Los_Angeles',
    });
    const monthDay = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    });
    const time = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
    return `${weekday}, ${monthDay} · ${time}`;
  } catch {
    return null;
  }
}

/**
 * @param {string} localDate
 * @param {string} timeDisplay
 */
function formatLocalDateTimeLabel(localDate, timeDisplay) {
  try {
    const date = new Date(`${localDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return `${localDate} · ${timeDisplay}`;
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    return `${weekday}, ${monthDay} · ${timeDisplay}`;
  } catch {
    return `${localDate} · ${timeDisplay}`;
  }
}

/**
 * @param {object | null | undefined} artifact
 * @param {string | null} collectionId
 */
function resolveCollectionCard(artifact, collectionId) {
  const id = asText(collectionId);
  if (!id || !artifact) return null;
  const row = (Array.isArray(artifact.collections) ? artifact.collections : []).find(
    (item) => item?.collectionId === id,
  );
  if (!row) {
    return {
      collectionId: id,
      title: id,
      venueLabel: 'NW Film Forum',
      dateLabel: null,
      imageUrl: null,
    };
  }
  const start = asText(row.startDate);
  const end = asText(row.endDate);
  let dateLabel = null;
  if (start && end && /^\d{4}-\d{2}-\d{2}/.test(start) && /^\d{4}-\d{2}-\d{2}/.test(end)) {
    dateLabel = formatCollectionDateRange(start, end);
  } else if (start) {
    dateLabel = start;
  }
  return {
    collectionId: id,
    title: asText(row.title) || id,
    venueLabel: 'NW Film Forum',
    dateLabel,
    imageUrl: asText(row.imageUrl),
  };
}

/**
 * @param {string} start
 * @param {string} end
 */
function formatCollectionDateRange(start, end) {
  try {
    const a = new Date(`${start}T12:00:00`);
    const b = new Date(`${end}T12:00:00`);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
      return `${start} – ${end}`;
    }
    const left = a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const right = b.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${left} – ${right}`;
  } catch {
    return `${start} – ${end}`;
  }
}
