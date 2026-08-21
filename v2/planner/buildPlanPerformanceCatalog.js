/**
 * Performance-level catalog for Locked showtimes picker (PR2 / PLAN-11).
 */

import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';
import { formatScheduleClock } from '../stores/scheduleSettingsStore.js';
import { normalizeLockedShowtime } from './lockedShowtimes.js';
import {
  isEligiblePlannerCatalogOpportunity,
} from './buildPlanFilmCatalog.js';
import {
  opportunityMatchesHardConstraints,
  resolveBuildPlanHardConstraints,
  parseOpportunityStartMinutes,
} from './buildPlanHardConstraints.js';

/**
 * @param {object} opportunity
 * @param {string} [timeFormatId]
 * @returns {string}
 */
export function formatPerformanceClockLabel(opportunity, timeFormatId = '12h') {
  if (typeof opportunity?.timeDisplay === 'string' && opportunity.timeDisplay.trim()) {
    return opportunity.timeDisplay.trim();
  }
  const localTime = opportunity?.localTime;
  if (typeof localTime !== 'string' || !localTime.trim()) return '';
  const startMin = parseOpportunityStartMinutes(localTime);
  if (startMin == null) return localTime;
  return formatScheduleClock(startMin, timeFormatId);
}

/**
 * @param {object | null | undefined} homeData
 * @param {object} form
 * @param {{
 *   now?: Date | (() => Date),
 *   enrichmentIndex?: object | null,
 *   timeFormatId?: string,
 * }} [options]
 * @returns {object[]}
 */
export function listPlannerEligiblePerformances(homeData, form, options = {}) {
  const now = options.now ?? new Date();
  const nowFn = typeof now === 'function' ? now : () => now;
  const enrichmentIndex = options.enrichmentIndex ?? null;
  const hard = resolveBuildPlanHardConstraints(form, homeData, { now: nowFn });

  const films = Array.isArray(homeData?.films) ? homeData.films : [];
  const opportunities = Array.isArray(homeData?.opportunities)
    ? homeData.opportunities
    : [];
  const filmsByKey = new Map(films.map((f) => [f.filmKey, f]));

  /** @type {object[]} */
  const out = [];

  for (const opp of opportunities) {
    if (
      !isEligiblePlannerCatalogOpportunity(opp, {
        dateIso: hard.dateIso,
        filmsByKey,
        now: nowFn,
      })
    ) {
      continue;
    }

    const film = filmsByKey.get(opp.filmKey);
    if (!film) continue;

    const enriched = enrichHomeFilm(film, enrichmentIndex, 'planner', homeData);
    const runtimeMin =
      typeof enriched.runtimeMin === 'number' && Number.isFinite(enriched.runtimeMin)
        ? enriched.runtimeMin
        : typeof film.runtimeMin === 'number'
          ? film.runtimeMin
          : typeof opp.runtimeMin === 'number'
            ? opp.runtimeMin
            : null;

    if (
      !opportunityMatchesHardConstraints(opp, {
        ...hard,
        runtimeMin,
      })
    ) {
      continue;
    }

    const formatLabels = Array.isArray(opp.formatLabels)
      ? opp.formatLabels
          .map((raw) => formatUserFacingFormatLabel(raw) ?? String(raw).trim())
          .filter(Boolean)
      : [];

    const clock = formatPerformanceClockLabel(opp, options.timeFormatId);
    const draft = normalizeLockedShowtime({
      title: enriched.displayTitle ?? film.title ?? opp.title,
      filmKey: film.filmKey,
      filmId: enriched.filmId ?? film.filmId ?? null,
      parentFilmKey: film.parentFilmKey ?? null,
      theaterId: opp.theaterId,
      theaterName: opp.theaterName,
      localDate: opp.localDate,
      localTime: opp.localTime,
      runtimeMin,
      source: opp.source,
      sourceShowtimeId: opp.sourceShowtimeId,
      opportunityKey: opp.opportunityKey,
      formatLabel: formatLabels[0] ?? null,
      posterUrl: enriched.posterUrl ?? film.posterUrl ?? null,
    });
    if (!draft?.performanceKey) continue;

    const startMin = parseOpportunityStartMinutes(opp.localTime) ?? 0;

    out.push({
      ...draft,
      id: draft.performanceKey,
      clockLabel: clock,
      formatLabels,
      formatSummary: formatLabels.join(' · '),
      detailLabel: [clock, opp.theaterName].filter(Boolean).join(' · '),
      startMin: startMin ?? 0,
      imageUrl: draft.posterUrl ?? '',
    });
  }

  return out.sort((a, b) => {
    if (a.startMin !== b.startMin) return a.startMin - b.startMin;
    return String(a.title).localeCompare(String(b.title));
  });
}

/**
 * Add a lock if not already present (exact performanceKey).
 * @param {object} form
 * @param {object} performanceCard
 * @returns {{ form: object, added: boolean, reason?: string }}
 */
export function addLockedShowtimeToForm(form, performanceCard) {
  const lock = normalizeLockedShowtime(performanceCard);
  if (!lock) {
    return { form, added: false, reason: 'invalid' };
  }
  const existing = Array.isArray(form?.lockedShowtimes)
    ? form.lockedShowtimes
    : [];
  if (existing.some((item) => item?.performanceKey === lock.performanceKey)) {
    return { form, added: false, reason: 'duplicate' };
  }
  return {
    form: {
      ...form,
      lockedShowtimes: [...existing, lock],
    },
    added: true,
  };
}

/**
 * @param {object} form
 * @param {string} performanceKey
 */
export function removeLockedShowtimeFromForm(form, performanceKey) {
  const key = String(performanceKey ?? '').trim();
  const existing = Array.isArray(form?.lockedShowtimes)
    ? form.lockedShowtimes
    : [];
  return {
    ...form,
    lockedShowtimes: existing.filter((item) => item?.performanceKey !== key),
  };
}

/**
 * Group eligible performances by film, then by theater (Add-a-showtime UI).
 * Chips never carry theater names — theater labels live on the group.
 *
 * @param {object[]} performances
 * @returns {object[]}
 */
export function groupPerformancesByFilm(performances) {
  const list = Array.isArray(performances) ? performances : [];
  /** @type {Map<string, object>} */
  const byFilm = new Map();

  for (const perf of list) {
    const filmKey = String(perf?.filmKey ?? perf?.title ?? '').trim();
    if (!filmKey) continue;
    let group = byFilm.get(filmKey);
    if (!group) {
      group = {
        filmKey,
        filmId: perf.filmId ?? null,
        title: perf.title,
        posterUrl: perf.posterUrl ?? perf.imageUrl ?? null,
        imageUrl: perf.imageUrl ?? perf.posterUrl ?? '',
        /** @type {Map<string, object>} */
        theaterMap: new Map(),
      };
      byFilm.set(filmKey, group);
    }

    const theaterId = String(perf.theaterId ?? perf.theaterName ?? 'unknown');
    const theaterName = perf.theaterName ?? theaterId;
    let theaterGroup = group.theaterMap.get(theaterId);
    if (!theaterGroup) {
      theaterGroup = {
        theaterId,
        theaterName,
        performances: [],
        earliestStart: perf.startMin ?? Number.POSITIVE_INFINITY,
      };
      group.theaterMap.set(theaterId, theaterGroup);
    }
    theaterGroup.performances.push(perf);
    theaterGroup.earliestStart = Math.min(
      theaterGroup.earliestStart,
      perf.startMin ?? Number.POSITIVE_INFINITY,
    );
  }

  return [...byFilm.values()]
    .map((group) => {
      const theaterGroups = [...group.theaterMap.values()]
        .map((tg) => {
          const perfs = [...tg.performances].sort(
            (a, b) =>
              (a.startMin ?? 0) - (b.startMin ?? 0) ||
              String(a.clockLabel ?? '').localeCompare(String(b.clockLabel ?? '')),
          );
          const formats = new Set(
            perfs.map((p) => p.formatLabel).filter(Boolean),
          );
          return {
            theaterId: tg.theaterId,
            theaterName: tg.theaterName,
            performances: perfs,
            showFormatOnChips: formats.size > 1,
            earliestStart: tg.earliestStart,
          };
        })
        .sort(
          (a, b) =>
            a.earliestStart - b.earliestStart ||
            String(a.theaterName).localeCompare(String(b.theaterName)),
        );

      const multiTheater = theaterGroups.length > 1;
      const allPerformances = theaterGroups.flatMap((tg) => tg.performances);
      const singleTheaterName = theaterGroups[0]?.theaterName ?? 'Theater';

      return {
        filmKey: group.filmKey,
        filmId: group.filmId,
        title: group.title,
        posterUrl: group.posterUrl,
        imageUrl: group.imageUrl,
        theaterCount: theaterGroups.length,
        multiTheater,
        /** @deprecated use theaterGroups; kept for older tests */
        theaterLine: multiTheater
          ? `${theaterGroups.length} theaters`
          : singleTheaterName,
        theaterGroups,
        performances: allPerformances,
      };
    })
    .sort((a, b) => {
      const aStart = a.theaterGroups[0]?.earliestStart ?? 0;
      const bStart = b.theaterGroups[0]?.earliestStart ?? 0;
      if (aStart !== bStart) return aStart - bStart;
      return String(a.title).localeCompare(String(b.title));
    });
}

/**
 * Compact chip label: time (+ premium format when useful). Never includes theater.
 * @param {object} perf
 * @param {{ includeFormat?: boolean }} [options]
 */
export function formatShowtimeChipLabel(perf, options = {}) {
  const clock = perf?.clockLabel || perf?.localTime || '';
  if (options.includeFormat === false) return clock;
  const format = compactChipFormatLabel(perf?.formatLabel || perf?.formatSummary);
  if (format) return [clock, format].filter(Boolean).join(' · ');
  return clock;
}

/**
 * Premium / experience formats only — omit accessibility tags from chips.
 * @param {string | null | undefined} raw
 * @returns {string | null}
 */
export function compactChipFormatLabel(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const facing = formatUserFacingFormatLabel(raw) ?? raw.trim();
  const lower = facing.toLowerCase();
  if (
    /caption|audio description|\boc\b|\bcc\b|live score|subtitled/i.test(lower)
  ) {
    return null;
  }
  if (lower.includes('imax')) return facing.includes('70') ? 'IMAX 70mm' : 'IMAX';
  if (lower.includes('dolby cinema')) return 'Dolby';
  if (lower.includes('dolby atmos')) return 'Atmos';
  if (lower.includes('reald') || lower === '3d') return facing.includes('RealD') ? 'RealD 3D' : '3D';
  if (/\bxl\b/.test(lower)) return 'XL';
  if (lower.includes('4dx')) return '4DX';
  if (lower.includes('screenx') || lower.includes('screen x')) return 'ScreenX';
  if (lower.includes('rpx')) return 'RPX';
  if (lower.includes('70mm')) return '70mm';
  if (lower.includes('35mm')) return '35mm';
  if (lower.includes('laser')) return 'Laser';
  if (lower.includes('prime')) return 'Prime';
  // Unknown accessibility-ish or generic digital — omit from chip.
  if (/digital|standard|2d|reserved/i.test(lower)) return null;
  // Short premium-looking leftovers only.
  if (facing.length <= 10) return facing;
  return null;
}

/**
 * Display line for a locked row.
 * @param {object} lock
 * @returns {string}
 */
export function formatLockedShowtimeDetail(lock) {
  const time =
    formatPerformanceClockLabel({
      localTime: lock?.localTime,
      timeDisplay: lock?.clockLabel,
    }) ||
    lock?.localTime ||
    '';
  const theater = lock?.theaterName || lock?.theaterId || '';
  const format = lock?.formatLabel || '';
  return [time, theater, format].filter(Boolean).join(' · ');
}

/**
 * @param {object} lock
 * @param {object} form
 * @param {object | null | undefined} homeData
 * @param {{ now?: Date | (() => Date) }} [options]
 * @returns {boolean}
 */
export function isLockedShowtimeEligibleUnderForm(lock, form, homeData, options = {}) {
  if (!lock?.performanceKey) return false;
  const hard = resolveBuildPlanHardConstraints(form, homeData, options);
  if (lock.localDate && lock.localDate !== hard.dateIso) return false;
  const theaterIds = hard.theaterIds;
  if (
    theaterIds.length &&
    lock.theaterId &&
    !theaterIds.includes(lock.theaterId) &&
    !theaterIds.includes(lock.theaterName)
  ) {
    return false;
  }
  // Build a synthetic opportunity for time-window check
  return opportunityMatchesHardConstraints(
    {
      localDate: lock.localDate ?? hard.dateIso,
      localTime: lock.localTime,
      theaterId: lock.theaterId,
      theaterName: lock.theaterName,
      runtimeMin: lock.runtimeMin,
    },
    { ...hard, runtimeMin: lock.runtimeMin },
  );
}
