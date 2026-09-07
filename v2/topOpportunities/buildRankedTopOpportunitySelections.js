/**
 * Shadow adapter: ranked Top Opportunity candidates → Home UI selection shape.
 *
 * Not imported by TopOpportunityFeature or selectTopOpportunities.
 * Ranking stays in opportunityRanking.js; this layer only presents.
 *
 * Pipeline:
 *   feature extraction → ranking → selection → presentation adaptation → (future) UI
 */

import { buildRankedTopOpportunityCandidates } from './opportunityRanking.js';
import {
  presentRankedOpportunityReason,
  presentSupportingRankedReasons,
} from './rankedOpportunityReasonLabels.js';

/**
 * @param {object | null | undefined} scored
 */
export function rankedFilmKey(scored) {
  return scored?.vector?.identifiers?.filmKey ?? scored?.vector?.identifiers?.parentFilmKey ?? null;
}

/**
 * Map one ranked candidate onto the live TopOpportunityFeature selection contract,
 * plus namespaced ranking metadata.
 *
 * @param {object} scored
 * @param {object | null | undefined} homeData
 * @param {{
 *   rawRank?: number | null,
 *   selectedRank?: number | null,
 * }} [meta]
 */
export function adaptRankedOpportunityForHome(scored, homeData, meta = {}) {
  const vector = scored?.vector ?? {};
  const ids = vector.identifiers ?? {};
  const opportunityKey = ids.opportunityKey ?? null;
  const filmKey = rankedFilmKey(scored);

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const homeFilm =
    (filmKey && films.find((f) => f.filmKey === filmKey)) ||
    (ids.parentFilmKey && films.find((f) => f.filmKey === ids.parentFilmKey)) ||
    null;
  const homeOpportunity =
    (opportunityKey &&
      opportunities.find((o) => o.opportunityKey === opportunityKey)) ||
    null;

  const formatLabels = Array.isArray(homeOpportunity?.formatLabels)
    ? [...homeOpportunity.formatLabels]
    : Array.isArray(vector.presentation?.canonicalFormatLabels)
      ? [...vector.presentation.canonicalFormatLabels]
      : [];

  const localDate =
    homeOpportunity?.localDate ?? ids.localDate ?? null;
  const localTime =
    homeOpportunity?.localTime ?? ids.localTime ?? null;
  const sortableLocalDateTime =
    homeOpportunity?.sortableLocalDateTime ?? ids.sortableLocalDateTime ?? null;
  const theaterId = homeOpportunity?.theaterId ?? ids.theaterId ?? null;
  const theaterName = homeOpportunity?.theaterName ?? ids.theaterName ?? null;

  const film = {
    filmKey: filmKey ?? homeFilm?.filmKey ?? null,
    parentFilmKey: homeFilm?.parentFilmKey ?? ids.parentFilmKey ?? null,
    filmId: homeFilm?.filmId ?? ids.filmId ?? null,
    title: homeFilm?.title ?? ids.title ?? null,
    posterUrl: homeFilm?.posterUrl ?? null,
    backdropUrl: homeFilm?.backdropUrl ?? null,
    runtimeMin: homeFilm?.runtimeMin ?? null,
    genre: homeFilm?.genre ?? null,
    showtimeCount: homeFilm?.showtimeCount ?? vector.filmWindow?.filmWindowShowtimeCount ?? 0,
    theaterCount:
      homeFilm?.theaterCount ??
      homeFilm?.theaterIds?.size ??
      vector.filmWindow?.filmWindowTheaterCount ??
      0,
  };

  const representativeOpportunity = {
    opportunityKey,
    filmKey: film.filmKey,
    theaterId,
    theaterName,
    localDate,
    localTime,
    timeDisplay:
      homeOpportunity?.timeDisplay ?? (localTime ? String(localTime) : null),
    sortableLocalDateTime,
    formatLabels,
    ticketUrl: homeOpportunity?.ticketUrl ?? null,
    screeningVariantType:
      homeOpportunity?.screeningVariantType ??
      vector.event?.screeningVariantType ??
      null,
    status: homeOpportunity?.status ?? null,
  };

  const reason = scored?.dominantReason ?? {};
  const presented = presentRankedOpportunityReason(reason, vector);
  const supportingReasons = presentSupportingRankedReasons(reason, vector);
  const selectionReasonCode = presented.code;
  const selectionReasonLabelKey = presented.labelKey;
  const selectionReasonLabel = presented.label;
  const showtimeCount = Number.isFinite(film.showtimeCount) ? film.showtimeCount : 0;
  const additionalShowtimeCount = Math.max(0, showtimeCount - 1);
  const chronologicalKey = [
    sortableLocalDateTime ?? '',
    theaterId ?? '',
    film.filmKey ?? '',
    opportunityKey ?? '',
  ].join('|');

  const components = scored?.components ?? {};
  const componentScores = Object.fromEntries(
    Object.entries(components).map(([key, value]) => [
      key,
      typeof value?.score === 'number' ? value.score : 0,
    ]),
  );

  return {
    film,
    representativeOpportunity,
    selectionReasonCode,
    selectionReasonLabelKey,
    selectionReasonLabel,
    supportingReasonCodes: supportingReasons.map((item) => item.code),
    supportingReasons,
    supportingFacts: {
      filmShowtimeCount: film.showtimeCount,
      filmTheaterCount: film.theaterCount,
      formatLabels,
      presentationShowtimeCount:
        vector.presentation?.presentationShowtimeCount ?? null,
      leavingSoonBucket: vector.leavingSoon?.leavingSoonBucket ?? null,
      screeningVariantType: representativeOpportunity.screeningVariantType,
      noveltyClass: scored?.noveltyClass ?? components.novelty?.noveltyClass ?? null,
    },
    additionalShowtimeCount,
    candidateIndex: meta.selectedRank != null ? meta.selectedRank - 1 : 0,
    chronologicalKey,
    ranking: {
      rawScore: scored?.totalScore ?? 0,
      diversificationPenalty: scored?.diversificationPenalty ?? 0,
      finalSelectionScore: scored?.selectionScore ?? scored?.totalScore ?? 0,
      rawRank: meta.rawRank ?? null,
      selectedRank: meta.selectedRank ?? null,
      dominantReason: {
        category: selectionReasonCode,
        labelKey: selectionReasonLabelKey,
        score: reason.score ?? null,
        salience: reason.salience ?? null,
      },
      supportingReasons: supportingReasons.map((item) => ({
        code: item.code,
        labelKey: item.labelKey,
        label: item.label,
      })),
      components: componentScores,
      noveltyClass: scored?.noveltyClass ?? components.novelty?.noveltyClass ?? null,
    },
  };
}

/**
 * End-to-end shadow selections (unwired).
 *
 * @param {object | null | undefined} homeData
 * @param {{
 *   now?: Date | (() => Date) | string,
 *   enrichmentIndex?: object | null,
 *   weights?: object,
 *   topN?: number,
 * }} [options]
 */
export function buildRankedTopOpportunitySelections(homeData, options = {}) {
  const rankingResult = buildRankedTopOpportunityCandidates(homeData, options);
  const reps = Array.isArray(rankingResult.filmRepresentatives)
    ? rankingResult.filmRepresentatives
    : [];
  const rawRankByKey = new Map(
    reps.map((item, index) => [
      item.vector?.identifiers?.opportunityKey,
      index + 1,
    ]),
  );
  const selected = Array.isArray(rankingResult.selected)
    ? rankingResult.selected
    : [];
  const selections = selected.map((item, index) =>
    adaptRankedOpportunityForHome(item, homeData, {
      rawRank:
        rawRankByKey.get(item.vector?.identifiers?.opportunityKey) ?? null,
      selectedRank: item.selectionRank ?? index + 1,
    }),
  );

  return {
    nowSortable: rankingResult.nowSortable,
    todayIso: rankingResult.todayIso,
    counts: rankingResult.counts,
    selections,
    rankingResult,
  };
}
