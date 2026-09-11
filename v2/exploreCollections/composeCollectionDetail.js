/**
 * Collection detail presentation.
 * Upcoming rows join only collection-associated source listings — never filmId alone.
 */

import { resolveEnrichedFilmPresentation } from '../enrichment/resolveEnrichedFilmPresentation.js';
import { pacificDateString } from '../explore/exploreCatalog.js';
import { resolveFilmDetailNavParams } from '../identity/filmIdentity.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';
import { membershipsByCollectionId, findCollectionById } from './composeCollectionsIndex.js';
import {
  asText,
  collectionAssociatedUpcoming,
  collectionSourceLabel,
  collectionSourceLinkLabel,
  collectionTypeLabel,
  formatCollectionDateRangeLabel,
  listingJoinKey,
  memberDisplayTitle,
  membershipListingKey,
  opportunityListingKey,
  safeExternalHttpUrl,
} from './collectionsModel.js';

/**
 * @param {object | null | undefined} homeData
 * @param {string | null} source
 * @param {string | null} sourceFilmId
 */
function findHomeFilmForListing(homeData, source, sourceFilmId) {
  const key = listingJoinKey(source, sourceFilmId);
  if (!key) return null;
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const opp = opportunities.find((row) => opportunityListingKey(row) === key);
  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  if (opp?.filmKey) {
    return films.find((film) => film.filmKey === opp.filmKey) ?? null;
  }
  return (
    films.find(
      (film) => listingJoinKey(film.source, film.sourceFilmId) === key,
    ) ??
    films.find((film) => asText(film.sourceFilmId) === asText(sourceFilmId)) ??
    null
  );
}

/**
 * @param {object[]} opportunities
 * @returns {object[]}
 */
function sortOpportunities(opportunities) {
  return [...opportunities].sort((a, b) => {
    const dateA = asText(a.localDate) ?? '9999-12-31';
    const dateB = asText(b.localDate) ?? '9999-12-31';
    if (dateA !== dateB) return dateA < dateB ? -1 : 1;
    const timeA = asText(a.sortableLocalDateTime) ?? asText(a.localTime) ?? '';
    const timeB = asText(b.sortableLocalDateTime) ?? asText(b.localTime) ?? '';
    if (timeA !== timeB) return timeA < timeB ? -1 : 1;
    return 0;
  });
}

/**
 * @param {object} opportunity
 */
function formatWhenLabel(opportunity) {
  const dateLabel = formatLocalDateLabel(opportunity.localDate);
  const timeLabel =
    formatDisplayClock(opportunity.localTime ?? opportunity.timeDisplay) ||
    asText(opportunity.timeDisplay);
  if (dateLabel && timeLabel) return `${dateLabel} · ${timeLabel}`;
  return dateLabel ?? timeLabel;
}

/**
 * @param {object | null | undefined} artifact
 * @param {string} collectionId
 * @param {{
 *   homeData?: object | null,
 *   enrichmentIndex?: object | null,
 *   now?: Date,
 * }} [options]
 */
export function composeCollectionDetail(artifact, collectionId, options = {}) {
  const collection = findCollectionById(artifact, collectionId);
  if (!collection) {
    return {
      found: false,
      collectionId: asText(collectionId),
      title: 'Collection',
      upcoming: [],
      alsoInCollection: [],
    };
  }

  const todayIso = pacificDateString(options.now ?? new Date());
  const generatedAt = asText(artifact?.generated_at);
  const members = membershipsByCollectionId(artifact).get(
    collection.collectionId,
  ) ?? [];
  const homeData = options.homeData ?? null;
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const upcomingOpps = sortOpportunities(
    collectionAssociatedUpcoming(members, opportunities, todayIso),
  );

  /** @type {Map<string, object[]>} */
  const upcomingByMember = new Map();
  for (const opp of upcomingOpps) {
    const key = opportunityListingKey(opp);
    if (!key) continue;
    const list = upcomingByMember.get(key) ?? [];
    list.push(opp);
    upcomingByMember.set(key, list);
  }

  /** @type {object[]} */
  const upcoming = [];
  /** @type {object[]} */
  const alsoInCollection = [];

  for (const membership of members) {
    const listingKey = membershipListingKey(membership);
    const memberOpps = listingKey
      ? upcomingByMember.get(listingKey) ?? []
      : [];
    const nextOpp = memberOpps[0] ?? null;
    const homeFilm = findHomeFilmForListing(
      homeData,
      membership.source,
      membership.sourceFilmId,
    );
    const sourceTitle = memberDisplayTitle(membership);
    const filmId = asText(membership.canonicalFilmId);
    const presentation = resolveEnrichedFilmPresentation({
      sourceFilm: {
        filmId,
        title: sourceTitle,
        posterUrl: homeFilm?.posterUrl ?? null,
      },
      enrichmentIndex: options.enrichmentIndex ?? null,
      context: 'collection',
    });
    const nav = resolveFilmDetailNavParams(
      {
        filmKey: nextOpp?.filmKey ?? homeFilm?.filmKey ?? filmId,
        filmId,
        parentFilmKey: nextOpp?.parentFilmKey ?? homeFilm?.parentFilmKey,
        opportunityKey: nextOpp?.opportunityKey ?? null,
      },
      homeData,
    );
    const canOpenFilmDetail = Boolean(nav?.filmKey && filmId);
    const canOpenFromShowtime = Boolean(nav?.filmKey && nextOpp);
    const formatLabel =
      (Array.isArray(nextOpp?.formatLabels) ? nextOpp.formatLabels : [])
        .map((label) => formatUserFacingFormatLabel(label))
        .find(Boolean) ?? null;

    const row = {
      listingKey: listingKey ?? membership.sourceFilmUrl,
      title: presentation.displayTitle ?? sourceTitle,
      year: presentation.canonicalYear,
      directors: presentation.directors,
      genreLine: presentation.genreLine,
      posterUrl: presentation.posterUrl,
      filmId,
      filmKey: nav?.filmKey ?? null,
      opportunityKey: nav?.opportunityKey ?? null,
      unresolved: !filmId,
      sourceUrl: safeExternalHttpUrl(membership.sourceFilmUrl),
      theaterName: asText(nextOpp?.theaterName),
      formatLabel,
      nextWhenLabel: nextOpp ? formatWhenLabel(nextOpp) : null,
      moreCount: Math.max(0, memberOpps.length - 1),
      canOpenFilmDetail: canOpenFilmDetail || canOpenFromShowtime,
    };

    if (nextOpp) {
      upcoming.push(row);
    } else {
      alsoInCollection.push({
        ...row,
        noUpcomingLabel: 'No upcoming screening',
        canOpenFilmDetail,
      });
    }
  }

  const dateRangeLabel = formatCollectionDateRangeLabel(
    collection.startDate,
    collection.endDate,
    generatedAt,
  );
  const memberCount = Number(collection.memberCount) || members.length;
  const upcomingCount = upcoming.length;
  const artifactShowtimeCount = Number(collection.currentShowtimeCount) || 0;

  return {
    found: true,
    collectionId: collection.collectionId,
    title: asText(collection.title) ?? 'Untitled collection',
    source: asText(collection.source),
    sourceLabel: collectionSourceLabel(collection.source),
    type: asText(collection.sourceCollectionType),
    typeLabel: collectionTypeLabel(collection.sourceCollectionType),
    imageUrl: safeExternalHttpUrl(collection.imageUrl),
    description: asText(collection.description),
    sourceUrl: safeExternalHttpUrl(collection.sourceUrl),
    sourceLinkLabel: collectionSourceLinkLabel(collection.source),
    memberCount,
    upcomingCount,
    artifactShowtimeCount,
    dateRangeLabel,
    upcoming,
    alsoInCollection,
    todayIso,
  };
}
