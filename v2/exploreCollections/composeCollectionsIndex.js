/**
 * Collections index presentation from collections_current.json + live showtimes.
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import {
  activeCollectionsCountLabel,
  asText,
  collectionAssociatedUpcoming,
  collectionMatchesFilters,
  collectionSourceLabel,
  collectionTypeLabel,
  COLLECTIONS_FILTERS_LABEL,
  COLLECTIONS_PAGE_TAGLINE,
  COLLECTIONS_PAGE_TITLE,
  compareCollectionIndexRows,
  isDefaultVisibleCollection,
  membershipListingKey,
  normalizeCollectionFilters,
  parseCollectionDateRange,
  safeExternalHttpUrl,
} from './collectionsModel.js';

/**
 * @param {object | null | undefined} artifact
 * @returns {Map<string, object[]>}
 */
export function membershipsByCollectionId(artifact) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  const rows = Array.isArray(artifact?.memberships) ? artifact.memberships : [];
  for (const row of rows) {
    const id = asText(row?.collectionId);
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

/**
 * @param {object | null | undefined} artifact
 * @param {string} collectionId
 */
export function findCollectionById(artifact, collectionId) {
  const id = asText(collectionId);
  if (!id) return null;
  const collections = Array.isArray(artifact?.collections)
    ? artifact.collections
    : [];
  return collections.find((row) => asText(row?.collectionId) === id) ?? null;
}

/**
 * @param {object | null | undefined} artifact
 * @param {{
 *   homeData?: object | null,
 *   filters?: { sources?: string[], types?: string[] },
 *   now?: Date,
 *   includeArchive?: boolean,
 * }} [options]
 */
export function composeCollectionsIndex(artifact, options = {}) {
  const filters = normalizeCollectionFilters(options.filters);
  const todayIso = pacificDateString(options.now ?? new Date());
  const generatedAt = asText(artifact?.generated_at);
  const membersById = membershipsByCollectionId(artifact);
  const opportunities = Array.isArray(options.homeData?.opportunities)
    ? options.homeData.opportunities
    : [];
  const hasLiveShowtimes = Array.isArray(options.homeData?.opportunities);

  const collections = Array.isArray(artifact?.collections)
    ? artifact.collections
    : [];

  /** @type {object[]} */
  const cards = [];
  for (const collection of collections) {
    const collectionId = asText(collection?.collectionId);
    if (!collectionId) continue;

    const members = membersById.get(collectionId) ?? [];
    const upcomingOpps = collectionAssociatedUpcoming(
      members,
      opportunities,
      todayIso,
    );
    const upcomingMemberKeys = new Set();
    for (const opp of upcomingOpps) {
      const key = membershipListingKey({
        sourceListingKey: null,
        source: opp.source,
        sourceFilmId: opp.sourceFilmId,
      });
      if (key) upcomingMemberKeys.add(key);
    }

    const liveUpcomingCount = upcomingMemberKeys.size;
    const artifactShowtimeCount = Number(collection.currentShowtimeCount) || 0;
    const upcomingCount = hasLiveShowtimes
      ? liveUpcomingCount
      : artifactShowtimeCount;
    const upcomingScreeningCount = hasLiveShowtimes
      ? upcomingOpps.length
      : artifactShowtimeCount;

    if (
      !options.includeArchive &&
      !isDefaultVisibleCollection(collection, {
        upcomingCount: liveUpcomingCount,
        artifactShowtimeCount,
        todayIso,
        generatedAt,
      })
    ) {
      continue;
    }

    if (!collectionMatchesFilters(collection, filters)) continue;

    const range = parseCollectionDateRange(
      collection.startDate,
      collection.endDate,
      generatedAt,
    );
    const nearestFromOpps = upcomingOpps
      .map((opp) => asText(opp.localDate))
      .filter(Boolean)
      .sort()[0];

    cards.push({
      collectionId,
      title: asText(collection.title) ?? 'Untitled collection',
      source: asText(collection.source),
      sourceLabel: collectionSourceLabel(collection.source),
      type: asText(collection.sourceCollectionType),
      typeLabel: collectionTypeLabel(collection.sourceCollectionType),
      description: asText(collection.description),
      imageUrl: safeExternalHttpUrl(collection.imageUrl),
      memberCount: Number(collection.memberCount) || members.length,
      upcomingCount,
      upcomingScreeningCount,
      nearestUpcomingDate: nearestFromOpps ?? range.startIso,
      sourceUrl: safeExternalHttpUrl(collection.sourceUrl),
    });
  }

  cards.sort(compareCollectionIndexRows);

  return {
    pageTitle: COLLECTIONS_PAGE_TITLE,
    pageTagline: COLLECTIONS_PAGE_TAGLINE,
    filtersLabel: COLLECTIONS_FILTERS_LABEL,
    countLabel: activeCollectionsCountLabel(cards.length),
    todayIso,
    filters,
    collections: cards,
    totalArtifactCount: collections.length,
  };
}
