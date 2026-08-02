/**
 * T-CAL-02 — map HomeData opportunities to the shared ICS export contract.
 *
 * Local-only: builds a download via `src/utils/calendarExport.js` and triggers
 * a browser file save. No provider APIs, OAuth, permissions, or sync.
 */

import {
  buildPlanCalendarDownload,
  buildShowtimeCalendarDownload,
  triggerCalendarFileDownload,
} from '../../src/utils/calendarExport.js';
import { opportunityFormatLabel } from '../filmDetail/filmDetailModel.js';
import { formatTheaterAddressLabel } from '../theaters/resolveTheaterPresentation.js';

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Resolve theater meta from HomeData without inventing venues.
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} theaterId
 */
export function resolveTheaterForExport(homeData, theaterId) {
  const id = asTrimmed(theaterId);
  if (!id || !homeData) return null;
  if (homeData.theatersById?.[id]) return homeData.theatersById[id];
  if (Array.isArray(homeData.theaters)) {
    return homeData.theaters.find((t) => t?.id === id) ?? null;
  }
  return null;
}

/**
 * @param {object} opportunity — HomeData opportunity
 * @param {object | null | undefined} film — HomeData film row
 * @param {object | null | undefined} theater — curated theater meta
 * @returns {Record<string, unknown> | null}
 */
export function opportunityToCalendarInput(opportunity, film = null, theater = null) {
  if (!opportunity || typeof opportunity !== 'object') return null;

  const title =
    asTrimmed(film?.title) ??
    asTrimmed(opportunity.title) ??
    asTrimmed(opportunity.displayTitle);
  const date = asTrimmed(opportunity.localDate) ?? asTrimmed(opportunity.date);
  const time =
    asTrimmed(opportunity.localTime) ??
    asTrimmed(opportunity.time) ??
    asTrimmed(opportunity.timeDisplay);
  if (!title || !date || !time) return null;

  const runtime =
    typeof film?.runtimeMin === 'number' && Number.isFinite(film.runtimeMin)
      ? film.runtimeMin
      : typeof opportunity.runtimeMin === 'number' &&
          Number.isFinite(opportunity.runtimeMin)
        ? opportunity.runtimeMin
        : null;

  const format =
    opportunityFormatLabel(opportunity) ??
    asTrimmed(opportunity.formatLabel) ??
    null;

  const addressLabel =
    formatTheaterAddressLabel(theater) ??
    asTrimmed(theater?.address) ??
    null;

  /** @type {Record<string, unknown>} */
  const input = {
    title,
    date,
    time,
    runtime,
    theaterName:
      asTrimmed(opportunity.theaterName) ?? asTrimmed(theater?.name) ?? null,
    theaterId:
      asTrimmed(opportunity.theaterId) ?? asTrimmed(theater?.id) ?? null,
    filmKey:
      asTrimmed(opportunity.filmKey) ?? asTrimmed(film?.filmKey) ?? null,
    formatLabel: format,
    format,
    ticketUrl: opportunity.ticketUrl ?? null,
    source: asTrimmed(opportunity.source),
    sourceShowtimeId: asTrimmed(opportunity.sourceShowtimeId),
    publicShowtimeId: asTrimmed(opportunity.publicShowtimeId),
  };

  if (addressLabel) {
    input.addressLabel = addressLabel;
  } else if (theater) {
    // Pass curated fields through for calendarExport composition.
    input.addressLine1 = theater.addressLine1 ?? theater.address_line1 ?? null;
    input.addressLine2 = theater.addressLine2 ?? theater.address_line2 ?? null;
    input.city = theater.city ?? null;
    input.state = theater.state ?? theater.region ?? null;
    input.postalCode = theater.postalCode ?? theater.postal_code ?? null;
  }

  return input;
}

/**
 * Export one HomeData opportunity as a local .ics download.
 *
 * @param {{
 *   opportunity: object,
 *   film?: object | null,
 *   theater?: object | null,
 *   homeData?: object | null,
 * }} args
 * @returns {{
 *   ok: true,
 *   filename: string,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
export function exportOpportunityToCalendar({
  opportunity,
  film = null,
  theater = null,
  homeData = null,
}) {
  const resolvedTheater =
    theater ??
    resolveTheaterForExport(homeData, opportunity?.theaterId);
  const input = opportunityToCalendarInput(
    opportunity,
    film,
    resolvedTheater,
  );
  if (!input) {
    return {
      ok: false,
      error: {
        code: 'invalid_input',
        message: 'This showtime is missing fields needed for calendar export.',
      },
    };
  }

  const download = buildShowtimeCalendarDownload(input);
  if (!download.ok) {
    return {
      ok: false,
      error: download.error ?? {
        code: 'export_failed',
        message: 'Could not build a calendar file for this showtime.',
      },
    };
  }

  const saved = triggerCalendarFileDownload(download);
  if (!saved) {
    return {
      ok: false,
      error: {
        code: 'download_failed',
        message: 'Could not download the calendar file in this browser.',
      },
    };
  }

  return { ok: true, filename: download.filename };
}

/**
 * Export a multi-film plan (one VEVENT per selected film). Fail-closed.
 *
 * @param {{
 *   planId?: string | null,
 *   title?: string | null,
 *   films: object[],
 * }} plan
 * @returns {{
 *   ok: true,
 *   filename: string,
 *   eventCount: number,
 * } | {
 *   ok: false,
 *   error: { code: string, message: string },
 * }}
 */
export function exportPlanToCalendar(plan) {
  if (!plan || typeof plan !== 'object') {
    return {
      ok: false,
      error: { code: 'empty_plan', message: 'Plan is required.' },
    };
  }
  const films = Array.isArray(plan.films) ? plan.films : [];
  if (films.length === 0) {
    return {
      ok: false,
      error: {
        code: 'empty_plan',
        message: 'Select at least one film with a real showtime to export.',
      },
    };
  }

  const download = buildPlanCalendarDownload({
    planId: plan.planId ?? plan.id ?? null,
    title: plan.title ?? 'Movie day',
    films,
  });
  if (!download.ok) {
    return {
      ok: false,
      error: download.error ?? {
        code: 'export_failed',
        message: 'Could not build a calendar file for this plan.',
      },
    };
  }

  const saved = triggerCalendarFileDownload(download);
  if (!saved) {
    return {
      ok: false,
      error: {
        code: 'download_failed',
        message: 'Could not download the calendar file in this browser.',
      },
    };
  }

  return {
    ok: true,
    filename: download.filename,
    eventCount: download.events?.length ?? films.length,
  };
}

/**
 * User-facing copy for export outcomes (Film Detail / Results status).
 * @param {{ ok: boolean, error?: { code?: string, message?: string }, filename?: string }} result
 */
export function calendarExportStatusMessage(result) {
  if (result?.ok) {
    return result.filename
      ? `Calendar file downloaded (${result.filename}).`
      : 'Calendar file downloaded.';
  }
  const code = result?.error?.code;
  if (code === 'missing_runtime') {
    return 'Calendar export needs a runtime for this film. Try another showtime.';
  }
  if (code === 'missing_identity' || code === 'invalid_timestamp') {
    return 'This showtime can’t be exported yet — schedule details are incomplete.';
  }
  if (code === 'empty_plan' || code === 'invalid_plan_item') {
    return (
      result.error?.message ??
      'This plan can’t be exported yet. Export a real showtime from Film Detail.'
    );
  }
  return (
    result?.error?.message ??
    'Could not export to calendar. Try again or pick another showtime.'
  );
}
