/**
 * Film Detail departure-timing helpers.
 * Formats publisher semantic fields; does not invent confidence from probabilities.
 */

import { formatShelfDetailMonthDay } from '../homeShelfDetail/formatShelfDetailMonthDay.js';

export const DEPARTURE_TIMING_FRESHNESS_MAX_AGE_DAYS = 2;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmedString(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * @param {string | null | undefined} isoDate
 * @param {{ asOfIso?: string | null }} [options]
 */
export function formatDepartureDateLabel(isoDate, options = {}) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  const short = formatShelfDetailMonthDay(isoDate);
  if (!short) return null;
  const asOf = asTrimmedString(options.asOfIso);
  if (asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    const predYear = Number(isoDate.slice(0, 4));
    const asOfYear = Number(asOf.slice(0, 4));
    if (Number.isFinite(predYear) && Number.isFinite(asOfYear) && predYear !== asOfYear) {
      return `${short}, ${predYear}`;
    }
  }
  return short;
}

/**
 * @param {string | null | undefined} predictionAsOf
 * @param {string | null | undefined} todayIso
 */
export function isDepartureTimingFresh(predictionAsOf, todayIso) {
  if (
    typeof predictionAsOf !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(predictionAsOf) ||
    typeof todayIso !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)
  ) {
    return false;
  }
  const asOf = Date.parse(`${predictionAsOf}T12:00:00`);
  const today = Date.parse(`${todayIso}T12:00:00`);
  if (!Number.isFinite(asOf) || !Number.isFinite(today)) return false;
  const ageDays = Math.round((today - asOf) / 86_400_000);
  return ageDays >= 0 && ageDays <= DEPARTURE_TIMING_FRESHNESS_MAX_AGE_DAYS;
}

/**
 * Resolve Leaving Soon entry for a Film Detail film via durable keys only.
 * @param {object | null | undefined} film
 * @param {object[] | null | undefined} entries
 */
export function findLeavingSoonEntryForFilm(film, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (!film || list.length === 0) return null;
  const filmKey = asTrimmedString(film.filmKey);
  const parentKey = asTrimmedString(film.parentFilmKey);
  if (filmKey) {
    const direct = list.find((entry) => entry?.filmKey === filmKey);
    if (direct) return direct;
  }
  if (parentKey) {
    const byParent = list.find((entry) => entry?.filmKey === parentKey);
    if (byParent) return byParent;
  }
  // Variant film keys: entry may be parent while film is a screening variant.
  if (filmKey) {
    const childOfEntry = list.find((entry) => {
      const key = asTrimmedString(entry?.filmKey);
      return key && (film.parentFilmKey === key || film.filmKey === key);
    });
    if (childOfEntry) return childOfEntry;
  }
  return null;
}

/**
 * @param {object | null | undefined} entry
 * @param {{ todayIso?: string | null }} [options]
 * @returns {{
 *   scope: 'amc',
 *   confidence: 'high' | 'moderate' | 'low',
 *   mode: 'likely_around' | 'could_around' | 'horizon_only',
 *   predictedEndDate: string | null,
 *   bookedThroughDate: string | null,
 *   predictionAsOf: string | null,
 *   primaryLabel: string,
 *   secondaryLabel: string | null,
 * } | null}
 */
export function buildDepartureTimingPresentation(entry, options = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const confidence = asTrimmedString(entry.timingConfidence);
  const mode = asTrimmedString(entry.timingMode);
  const predictionAsOf = asTrimmedString(entry.predictionAsOf);
  const bookedThroughDate = asTrimmedString(entry.maxShowDate);
  const predictedEndDate = asTrimmedString(entry.predictedEndDate);
  if (!confidence || !mode) return null;

  const todayIso = asTrimmedString(options.todayIso);
  const fresh = predictionAsOf
    ? isDepartureTimingFresh(predictionAsOf, todayIso ?? predictionAsOf)
    : false;

  let effectiveMode = mode;
  let effectiveConfidence = confidence;
  let effectivePredicted = predictedEndDate;
  if (!fresh || (mode !== 'horizon_only' && !predictedEndDate)) {
    effectiveMode = 'horizon_only';
    effectiveConfidence = 'low';
    effectivePredicted = null;
  }

  const dateLabel = formatDepartureDateLabel(effectivePredicted, {
    asOfIso: predictionAsOf,
  });
  const bookedLabel = formatDepartureDateLabel(bookedThroughDate, {
    asOfIso: predictionAsOf,
  });

  let primaryLabel = null;
  if (effectiveMode === 'likely_around' && dateLabel) {
    primaryLabel = `Likely leaving AMC around ${dateLabel}`;
  } else if (effectiveMode === 'could_around' && dateLabel) {
    primaryLabel = `Could leave AMC around ${dateLabel}`;
  } else {
    const bucket = asTrimmedString(entry.bucket);
    primaryLabel =
      bucket === 'last_chance'
        ? 'Could leave AMC within the next week'
        : 'Could leave AMC within the next two weeks';
  }

  let secondaryLabel = null;
  if (bookedLabel) {
    secondaryLabel = `Currently booked through ${bookedLabel}`;
  }

  return {
    scope: 'amc',
    confidence: /** @type {'high' | 'moderate' | 'low'} */ (effectiveConfidence),
    mode: /** @type {'likely_around' | 'could_around' | 'horizon_only'} */ (
      effectiveMode
    ),
    predictedEndDate: effectivePredicted,
    bookedThroughDate,
    predictionAsOf,
    primaryLabel,
    secondaryLabel,
  };
}
