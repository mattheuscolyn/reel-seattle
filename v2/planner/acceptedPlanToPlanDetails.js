/**
 * Adapt an accepted-plan snapshot into a Plan Details–compatible plan object.
 *
 * Accepted plans store `performances[]` (no Results `items` / break rows).
 * Breaks are recomputed from expected end → next start (same approach as
 * My Schedule week visual breaks). Does not rewrite stored records.
 */

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
 * @param {string | null | undefined} iso
 * @returns {string}
 */
function clockFromIso(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(ms));
}

/**
 * @param {number} minutes
 */
function formatBreakLabel(minutes) {
  const n = Math.max(0, Math.round(minutes));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h > 0 && m > 0) return `Break ${h}h ${m}m`;
  if (h > 0) return `Break ${h}h`;
  return `Break ${m}m`;
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanPerformance} perf
 * @param {number} index
 */
function performanceToPlanDetailsItem(perf, index) {
  const filmKey = asTrimmed(perf.filmKey);
  const startTime =
    clockFromIso(perf.startsAt) || asTrimmed(perf.localTime) || '';
  const endTime = clockFromIso(perf.expectedEndsAt);
  return {
    id: `${perf.performanceKey || `perf-${index}`}`,
    type: 'film',
    title: perf.title,
    theater: perf.theaterName,
    theaterId: perf.theaterId,
    theater_id: perf.theaterId,
    theaterName: perf.theaterName,
    startTime,
    endTime,
    time: perf.localTime,
    localTime: perf.localTime,
    date: perf.localDate,
    localDate: perf.localDate,
    runtime: perf.runtimeMin,
    runtimeMin: perf.runtimeMin,
    runtimeLabel:
      Number.isFinite(perf.runtimeMin) && perf.runtimeMin > 0
        ? `${Math.floor(perf.runtimeMin / 60) > 0 ? `${Math.floor(perf.runtimeMin / 60)}h ` : ''}${perf.runtimeMin % 60}m`.trim()
        : '',
    format: perf.format,
    formatBadge: perf.format ? String(perf.format).toUpperCase() : null,
    formatLabel: perf.format,
    imageUrl: perf.posterUrl,
    posterUrl: perf.posterUrl,
    filmId: perf.filmId ?? null,
    filmKey,
    parentFilmKey: perf.parentFilmKey ?? null,
    showtimeFilmKey: filmKey,
    opportunityKey: perf.opportunityKey ?? null,
    ticketUrl: perf.ticketUrl ?? null,
    ticket_url: perf.ticketUrl ?? null,
    source: perf.source ?? null,
    sourceShowtimeId: perf.sourceShowtimeId ?? null,
    source_showtime_id: perf.sourceShowtimeId ?? null,
    addressLabel: perf.addressLabel ?? null,
    performanceKey: perf.performanceKey,
  };
}

/**
 * @param {import('../stores/acceptedPlansStore.js').AcceptedPlanItem | null | undefined} plan
 * @returns {object | null}
 */
export function acceptedPlanToPlanDetailsPlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const performances = Array.isArray(plan.performances)
    ? [...plan.performances]
    : [];
  if (performances.length === 0) return null;

  performances.sort((a, b) => {
    const da = Date.parse(a.startsAt) - Date.parse(b.startsAt);
    if (da !== 0) return da;
    return String(a.performanceKey).localeCompare(String(b.performanceKey));
  });

  /** @type {object[]} */
  const items = [];
  for (let i = 0; i < performances.length; i += 1) {
    const perf = performances[i];
    items.push(performanceToPlanDetailsItem(perf, i));
    const next = performances[i + 1];
    if (!next) continue;
    const endMs = Date.parse(perf.expectedEndsAt);
    const startMs = Date.parse(next.startsAt);
    if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) continue;
    const gapMin = Math.round((startMs - endMs) / 60000);
    if (gapMin < 5) continue;
    items.push({
      id: `${plan.planId}-break-${i}`,
      type: 'break',
      label: formatBreakLabel(gapMin),
      durationMin: gapMin,
      fromTheater: perf.theaterName,
      toTheater: next.theaterName,
    });
  }

  return {
    id: plan.planId,
    planId: plan.planId,
    provenance: 'live',
    source: 'accepted-plan',
    label: plan.label,
    date: plan.date,
    dateLabel: plan.date,
    dateDisplay: plan.date,
    items,
  };
}
