import { resolvePlannerFilmToken } from './plannerFilms.js';
import { parseRuntimeMinutes } from './timeUtils.js';

/**
 * @typedef {object} MockFilmSlot
 * @property {'required'|'first'|'last'|'preferred'|'any'} type
 * @property {{ title: string, poster: string, showtime_film_key: string, avgRuntimeMin: number|null }|null} film
 * @property {number} position - 0-indexed slot position
 * @property {boolean} isAnchored - true for first/last
 * @property {number|null} estimatedDurationMin
 */

/**
 * @typedef {object} MockPreviewData
 * @property {MockFilmSlot[]} slots
 * @property {number|null} startAfterMin
 * @property {number|null} finishByMin
 * @property {number|null} minGapMin
 * @property {number|null} maxGapMin
 * @property {string[]} preferredFilms
 */

/**
 * Determine if the preview should be shown based on current filter state.
 *
 * @param {object} filters
 * @param {string} filters.selectedDate
 * @param {number|string} filters.filmCount
 * @param {string[]} filters.includeFilms
 * @param {string} filters.firstFilm
 * @param {string} filters.lastFilm
 * @param {string|null} filters.startAfter
 * @param {string|null} filters.finishBy
 * @param {number|null} filters.minGapMin
 * @param {number|null} filters.maxGapMin
 * @returns {boolean}
 */
export function shouldShowPreview(filters) {
  if (!filters.selectedDate) return false;
  if (!filters.filmCount) return false;

  const hasFilmConstraints =
    filters.includeFilms.length > 0 ||
    (filters.firstFilm && filters.firstFilm.trim() !== '') ||
    (filters.lastFilm && filters.lastFilm.trim() !== '');

  const hasTimeConstraints =
    (filters.startAfter && filters.startAfter.trim() !== '') ||
    (filters.finishBy && filters.finishBy.trim() !== '') ||
    (filters.minGapMin != null && filters.minGapMin > 0) ||
    (filters.maxGapMin != null);

  return hasFilmConstraints || hasTimeConstraints;
}

/**
 * Calculate average runtime for a film from showtime rows.
 *
 * @param {string} filmKey
 * @param {object[]} rows
 * @param {string} date
 * @returns {number|null} - Average runtime in minutes, or null if not found
 */
export function getAverageRuntimeForFilm(filmKey, rows, date) {
  const runtimes = [];

  for (const row of rows) {
    if (row.Date !== date) continue;
    const rowKey = row.showtime_film_key || row.Film;
    const rowTitle = row.Film;

    if (rowKey === filmKey || rowTitle === filmKey) {
      const runtime = parseRuntimeMinutes(row.Runtime);
      if (runtime != null && runtime > 0) {
        runtimes.push(runtime);
      }
    }
  }

  if (runtimes.length === 0) return null;
  return Math.round(runtimes.reduce((sum, r) => sum + r, 0) / runtimes.length);
}

/**
 * Build mock film slots from current filter state for preview visualization.
 *
 * @param {object} filters
 * @param {string} filters.selectedDate
 * @param {number|string} filters.filmCount - 2, 3, 4, or 'max'
 * @param {string[]} filters.includeFilms
 * @param {string[]} filters.preferredFilms
 * @param {string} filters.firstFilm
 * @param {string} filters.lastFilm
 * @param {string|null} filters.startAfter
 * @param {string|null} filters.finishBy
 * @param {number|null} filters.minGapMin
 * @param {number|null} filters.maxGapMin
 * @param {object[]} catalog - Film catalog from buildPlannerFilmCatalog
 * @param {object[]} showtimeRows - Raw showtime rows for runtime calculation
 * @returns {MockPreviewData}
 */
export function buildMockSlotsFromFilters(filters, catalog, showtimeRows) {
  const {
    selectedDate,
    filmCount,
    includeFilms,
    preferredFilms,
    firstFilm,
    lastFilm,
    startAfter,
    finishBy,
    minGapMin,
    maxGapMin,
  } = filters;

  const slotCount = filmCount === 'max' ? 5 : Number(filmCount) || 2;
  const slots = [];

  const resolvedFirstFilm = firstFilm ? resolvePlannerFilmToken(firstFilm, catalog) : null;
  const resolvedLastFilm = lastFilm ? resolvePlannerFilmToken(lastFilm, catalog) : null;

  const resolvedIncludeFilms = includeFilms
    .map((token) => resolvePlannerFilmToken(token, catalog))
    .filter(Boolean);

  for (let i = 0; i < slotCount; i++) {
    let slot = {
      position: i,
      type: 'any',
      film: null,
      isAnchored: false,
      estimatedDurationMin: null,
    };

    if (i === 0 && resolvedFirstFilm) {
      slot = {
        ...slot,
        type: 'first',
        film: {
          title: resolvedFirstFilm.title,
          poster: resolvedFirstFilm.poster,
          showtime_film_key: resolvedFirstFilm.key,
          avgRuntimeMin: getAverageRuntimeForFilm(
            resolvedFirstFilm.key,
            showtimeRows,
            selectedDate,
          ),
        },
        isAnchored: true,
      };
      slot.estimatedDurationMin = slot.film.avgRuntimeMin;
    } else if (i === slotCount - 1 && resolvedLastFilm) {
      slot = {
        ...slot,
        type: 'last',
        film: {
          title: resolvedLastFilm.title,
          poster: resolvedLastFilm.poster,
          showtime_film_key: resolvedLastFilm.key,
          avgRuntimeMin: getAverageRuntimeForFilm(
            resolvedLastFilm.key,
            showtimeRows,
            selectedDate,
          ),
        },
        isAnchored: true,
      };
      slot.estimatedDurationMin = slot.film.avgRuntimeMin;
    } else if (resolvedIncludeFilms.length > 0) {
      const availableFilms = resolvedIncludeFilms.filter(
        (f) =>
          f.key !== resolvedFirstFilm?.key &&
          f.key !== resolvedLastFilm?.key &&
          !slots.some((s) => s.film?.showtime_film_key === f.key),
      );

      if (availableFilms.length > 0) {
        const nextFilm = availableFilms[0];
        slot = {
          ...slot,
          type: 'required',
          film: {
            title: nextFilm.title,
            poster: nextFilm.poster,
            showtime_film_key: nextFilm.key,
            avgRuntimeMin: getAverageRuntimeForFilm(nextFilm.key, showtimeRows, selectedDate),
          },
        };
        slot.estimatedDurationMin = slot.film.avgRuntimeMin;
      }
    }

    if (slot.estimatedDurationMin == null) {
      slot.estimatedDurationMin = 120;
    }

    slots.push(slot);
  }

  return {
    slots,
    startAfterMin: startAfter ? parseCompactTimeToMinutes(startAfter) : null,
    finishByMin: finishBy ? parseCompactTimeToMinutes(finishBy) : null,
    minGapMin: minGapMin != null ? minGapMin : null,
    maxGapMin: maxGapMin != null ? maxGapMin : null,
    preferredFilms: preferredFilms || [],
  };
}

/**
 * Parse compact time string to minutes since midnight.
 *
 * @param {string} timeStr - e.g., "2:00PM", "14:00"
 * @returns {number|null}
 */
function parseCompactTimeToMinutes(timeStr) {
  if (!timeStr) return null;

  const cleaned = String(timeStr).trim().toUpperCase();

  const match12 = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const meridiem = match12[3];

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    return hours * 60 + minutes;
  }

  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Detect potentially impossible constraint combinations and return warning message.
 *
 * @param {MockPreviewData} previewData
 * @returns {string|null}
 */
export function detectImpossibleConstraints(previewData) {
  const { slots, startAfterMin, finishByMin, maxGapMin } = previewData;

  if (startAfterMin != null && finishByMin != null && startAfterMin >= finishByMin) {
    return 'Start after time is at or after finish by time. No results are possible.';
  }

  if (finishByMin != null && slots.length > 0) {
    const totalEstimatedRuntime = slots.reduce(
      (sum, slot) => sum + (slot.estimatedDurationMin || 120),
      0,
    );
    const minGapsTime = (slots.length - 1) * (previewData.minGapMin || 0);
    const minTotalTime = totalEstimatedRuntime + minGapsTime;

    const availableWindow = startAfterMin != null ? finishByMin - startAfterMin : finishByMin;

    if (availableWindow < minTotalTime && startAfterMin != null) {
      return `Time window may be too tight. ${slots.length} films need ~${Math.round(minTotalTime / 60)}h ${minTotalTime % 60}min but window is ~${Math.round(availableWindow / 60)}h ${availableWindow % 60}min.`;
    }
  }

  if (maxGapMin != null && maxGapMin < 10 && slots.length > 2) {
    return `Very short max gap (${maxGapMin} min) with ${slots.length} films may have few results.`;
  }

  return null;
}
