/**
 * Compose Shorts Program Detail — Film Detail schedule sections + member list.
 */

import { composeFilmDetailPresentation } from '../filmDetail/composeFilmDetailPresentation.js';
import { truncateSynopsis } from '../filmDetail/filmDetailModel.js';
import {
  asText,
  collectionIdsForProgram,
  formatShortMetaLine,
  getShort,
  getShortsProgram,
  membershipsForProgram,
  programDisplayTitle,
  shortDisplayTitle,
} from './shortsProgramsModel.js';

/**
 * @param {{
 *   index: any,
 *   shortsProgramId: string | null | undefined,
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   collectionsArtifact?: object | null,
 *   timeFormatId?: string | null,
 *   opportunityKey?: string | null,
 * }} input
 */
export function composeShortsProgramDetailPresentation(input) {
  const index = input?.index ?? null;
  const shortsProgramId = asText(input?.shortsProgramId);
  const program = getShortsProgram(index, shortsProgramId);
  if (!program || !shortsProgramId) {
    return {
      resolved: false,
      shortsProgramId,
      reason: 'program_not_found',
    };
  }

  const displayTitle =
    programDisplayTitle(program.title) || asText(program.title) || 'Shorts program';
  const memberRows = membershipsForProgram(index, shortsProgramId).map((membership) => {
    const short = getShort(index, membership.shortId);
    return {
      shortId: membership.shortId,
      position: Number(membership.position) || 0,
      title: shortDisplayTitle(
        short?.title || membership.parsedTitle || membership.rawTitle,
      ),
      metaLine: formatShortMetaLine(short, membership),
      imageUrl: asText(short?.imageUrl) || asText(program.imageUrl),
      directors: Array.isArray(short?.directors)
        ? short.directors.filter(Boolean)
        : Array.isArray(membership.parsedDirectors)
          ? membership.parsedDirectors.filter(Boolean)
          : [],
    };
  });

  const showtimeFilmKey = asText(program.showtimeFilmKey);
  const filmPresentation =
    showtimeFilmKey && input?.homeData
      ? composeFilmDetailPresentation(
          input.homeData,
          showtimeFilmKey,
          input.opportunityKey ?? null,
          {
            enrichmentIndex: input.enrichmentIndex ?? null,
            timeFormatId: input.timeFormatId ?? null,
          },
        )
      : null;

  const yearHint = extractYearHint(program.title) || extractYearHint(displayTitle);
  const runtimeMin = program.runtimeMin != null ? Number(program.runtimeMin) : null;
  const metaParts = [];
  if (yearHint) metaParts.push(String(yearHint));
  if (runtimeMin != null && Number.isFinite(runtimeMin)) {
    metaParts.push(`${runtimeMin} min`);
  }
  metaParts.push(
    `${memberRows.length} short ${memberRows.length === 1 ? 'film' : 'films'}`,
  );

  const collectionId = collectionIdsForProgram(program)[0] ?? null;
  const collection = resolveCollectionCard(input?.collectionsArtifact, collectionId);

  const synopsisSource =
    asText(program.description) &&
    !/^ADD PROGRAM SYNOPSIS/i.test(program.description)
      ? program.description
      : null;
  const synopsis = truncateSynopsis(synopsisSource, 160);

  const imageUrl = asText(program.imageUrl);
  const filmHero = filmPresentation?.resolved ? filmPresentation.hero : null;

  /** @type {{ id: string, label: string, tone: string }[]} */
  const badges = [{ id: 'shorts-program', label: 'SHORT FILM PROGRAM', tone: 'accent' }];
  if (collection?.title) {
    badges.push({
      id: 'collection',
      label: collectionBadgeLabel(collection.title),
      tone: 'neutral',
    });
  }

  const whySeeIt = buildProgramWhySeeIt(collection);

  return {
    resolved: true,
    shortsProgramId,
    showtimeFilmKey,
    filmKey: showtimeFilmKey,
    sourceListingKey: asText(program.sourceListingKey),
    hero: {
      title: displayTitle,
      fullTitle: asText(program.title),
      metaLine: metaParts.join(' · '),
      genres: collection ? `Part of ${collection.title}` : null,
      director: null,
      posterUrl: imageUrl || filmHero?.posterUrl || null,
      backdropUrl: imageUrl || filmHero?.backdropUrl || imageUrl || null,
      badges,
    },
    synopsis: {
      available: Boolean(synopsis.full),
      preview: synopsis.preview,
      full: synopsis.full,
      needsMore: synopsis.needsMore,
      tags: [],
    },
    members: memberRows,
    memberCount: memberRows.length,
    runtimeMin: Number.isFinite(runtimeMin) ? runtimeMin : null,
    collection,
    whySeeIt,
    // Reuse Film Detail schedule composition for the linked listing.
    filmPresentation: filmPresentation?.resolved ? filmPresentation : null,
    bestWay: filmPresentation?.resolved ? filmPresentation.bestWay : null,
    bestWayEmpty: filmPresentation?.resolved
      ? Boolean(filmPresentation.bestWayEmpty)
      : true,
    today: filmPresentation?.resolved ? filmPresentation.today : { empty: true, rows: [], timezoneNote: 'Times shown in Pacific Time.' },
    availabilityNote: filmPresentation?.resolved
      ? filmPresentation.availabilityNote
      : 'No upcoming showtimes are available for this program in the current window.',
    availabilityHint: filmPresentation?.resolved
      ? filmPresentation.availabilityHint
      : null,
  };
}

/**
 * @param {string | null | undefined} title
 */
function extractYearHint(title) {
  const text = asText(title);
  if (!text) return null;
  const match = text.match(/\b(20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} title
 */
function collectionBadgeLabel(title) {
  if (/local sightings/i.test(title)) return 'LOCAL SIGHTINGS';
  return title.toUpperCase().slice(0, 28);
}

/**
 * @param {object | null} collection
 */
function buildProgramWhySeeIt(collection) {
  if (!collection?.title) {
    return { empty: true, signals: [] };
  }
  return {
    empty: false,
    signals: [
      {
        id: 'festival-context',
        tone: 'gold',
        icon: 'star',
        primary: `Festival pick — Part of ${collection.title}.`,
        secondary: null,
      },
    ],
  };
}

/**
 * @param {object | null | undefined} artifact
 * @param {string | null} collectionId
 */
function resolveCollectionCard(artifact, collectionId) {
  const id = asText(collectionId);
  if (!id) return null;
  const row = (Array.isArray(artifact?.collections) ? artifact.collections : []).find(
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
    // Collections may already store a human range in startDate.
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
