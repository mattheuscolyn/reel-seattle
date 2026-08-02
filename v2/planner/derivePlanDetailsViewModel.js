/**
 * Derive Plan Details presentation from a Results plan object.
 * Pure / data-driven — no fixture hardcoding in production paths.
 */

/**
 * @param {unknown} value
 * @returns {string}
 */
function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Parse "2:15 PM" / "14:15" style clocks to minutes from midnight.
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseClockToMinutes(value) {
  const raw = asText(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const mins = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins)) return null;
  const mer = m[3] ? m[3].toUpperCase() : null;
  if (mer === 'AM' || mer === 'PM') {
    hours = hours % 12;
    if (mer === 'PM') hours += 12;
  }
  return hours * 60 + mins;
}

/**
 * @param {number} totalMin
 * @returns {string}
 */
export function formatDurationMinutes(totalMin) {
  const n = Math.max(0, Math.round(Number(totalMin) || 0));
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * @param {number | null} minutes
 * @returns {string}
 */
export function formatClockFromMinutes(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  const day = ((Math.round(minutes) % (24 * 60)) + 24 * 60) % (24 * 60);
  let h = Math.floor(day / 60);
  const m = day % 60;
  const mer = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${mer}`;
}

/**
 * @param {unknown} label
 * @returns {number | null}
 */
export function parseBreakDurationMinutes(label) {
  const raw = asText(label);
  if (!raw) return null;
  const hm = raw.match(/(\d+)\s*h(?:ours?)?\s*(\d+)\s*m/i);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const hOnly = raw.match(/(\d+)\s*h(?:ours?)?\b/i);
  const mOnly = raw.match(/(\d+)\s*m(?:in(?:utes?)?)?\b/i);
  if (hOnly && mOnly) return Number(hOnly[1]) * 60 + Number(mOnly[1]);
  if (hOnly) return Number(hOnly[1]) * 60;
  if (mOnly) return Number(mOnly[1]);
  return null;
}

/**
 * @param {unknown} runtimeLabel
 * @returns {number | null}
 */
export function parseRuntimeMinutes(runtimeLabel) {
  return parseBreakDurationMinutes(runtimeLabel);
}

/**
 * @param {number | null} start
 * @param {number | null} end
 * @returns {string}
 */
function formatRangePill(start, end) {
  if (start == null || end == null) return '';
  const a = formatClockFromMinutes(start);
  const b = formatClockFromMinutes(end);
  if (!a || !b) return a || b;
  const aMer = a.slice(-2);
  const bMer = b.slice(-2);
  if (aMer === bMer) {
    return `${a.replace(` ${aMer}`, '')}–${b}`;
  }
  return `${a.replace(' ', '')}–${b}`;
}

/**
 * @param {object} film
 * @returns {{ startMin: number | null, endMin: number | null, runtimeMin: number | null }}
 */
function filmTiming(film) {
  const startMin = parseClockToMinutes(film?.startTime ?? film?.time);
  let endMin = parseClockToMinutes(film?.endTime);
  let runtimeMin =
    typeof film?.runtimeMin === 'number'
      ? film.runtimeMin
      : parseRuntimeMinutes(film?.runtimeLabel);
  if (endMin == null && startMin != null && runtimeMin != null) {
    endMin = startMin + runtimeMin;
  }
  if (runtimeMin == null && startMin != null && endMin != null) {
    runtimeMin = Math.max(0, endMin - startMin);
  }
  return { startMin, endMin, runtimeMin };
}

/**
 * Build chronological itinerary rows with transfer labeling.
 * @param {object | null | undefined} plan
 */
export function buildPlanDetailsItinerary(plan) {
  const items = Array.isArray(plan?.items) ? plan.items : [];
  /** @type {object[]} */
  const rows = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object') continue;

    if (item.type === 'break') {
      const prev = [...items.slice(0, i)].reverse().find((x) => x?.type !== 'break');
      const next = items.slice(i + 1).find((x) => x?.type !== 'break');
      const prevTiming = prev ? filmTiming(prev) : { endMin: null };
      const nextTiming = next ? filmTiming(next) : { startMin: null };
      let durationMin =
        typeof item.durationMin === 'number'
          ? item.durationMin
          : parseBreakDurationMinutes(item.label);
      if (
        durationMin == null &&
        prevTiming.endMin != null &&
        nextTiming.startMin != null
      ) {
        durationMin = Math.max(0, nextTiming.startMin - prevTiming.endMin);
      }
      const fromTheater = asText(item.fromTheater) || asText(prev?.theater);
      const toTheater = asText(item.toTheater) || asText(next?.theater);
      const isTransfer = Boolean(
        fromTheater && toTheater && fromTheater !== toTheater,
      );
      const gapMinutes =
        typeof item.gapMinutes === 'number'
          ? item.gapMinutes
          : typeof item.transferMinutes === 'number'
            ? item.transferMinutes
            : isTransfer
              ? null
              : 0;

      rows.push({
        id: item.id ?? `break-${i}`,
        kind: 'break',
        startMin: prevTiming.endMin,
        endMin: nextTiming.startMin,
        timePill: formatRangePill(prevTiming.endMin, nextTiming.startMin),
        durationMin,
        durationLabel:
          durationMin != null ? formatDurationMinutes(durationMin) : '',
        breakLabel:
          durationMin != null
            ? `Break · ${formatDurationMinutes(durationMin)}`
            : asText(item.label) || 'Break',
        fromTheater,
        toTheater,
        isTransfer,
        transferLabel: isTransfer
          ? `${fromTheater} → ${toTheater}`
          : fromTheater || toTheater || '',
        gapMinutes,
      });
      continue;
    }

    const timing = filmTiming(item);
    const startLabel = asText(item.startTime) || formatClockFromMinutes(timing.startMin);
    const endLabel = asText(item.endTime) || formatClockFromMinutes(timing.endMin);
    const runtimeLabel =
      asText(item.runtimeLabel) ||
      (timing.runtimeMin != null
        ? formatDurationMinutes(timing.runtimeMin)
        : '');
    const rangeLine = [startLabel, endLabel].filter(Boolean).join(' – ');
    rows.push({
      id: item.id ?? `film-${i}`,
      kind: 'film',
      title: asText(item.title) || 'Untitled',
      theater: asText(item.theater),
      formatBadge: asText(item.formatBadge) || null,
      imageUrl: asText(item.imageUrl) || null,
      startMin: timing.startMin,
      endMin: timing.endMin,
      runtimeMin: timing.runtimeMin,
      timePill: startLabel,
      rangeLine:
        rangeLine && runtimeLabel
          ? `${rangeLine} · ${runtimeLabel}`
          : rangeLine || runtimeLabel,
    });
  }

  return rows;
}

/**
 * @param {object | null | undefined} plan
 * @param {{ dateLabel?: string | null }} [options]
 */
export function derivePlanDetailsViewModel(plan, options = {}) {
  if (!plan || typeof plan !== 'object') {
    return null;
  }

  const itinerary = buildPlanDetailsItinerary(plan);
  const films = itinerary.filter((r) => r.kind === 'film');
  const breaks = itinerary.filter((r) => r.kind === 'break');

  const startMins = films.map((f) => f.startMin).filter((n) => n != null);
  const endMins = films.map((f) => f.endMin).filter((n) => n != null);
  const earliestStartMin = startMins.length ? Math.min(...startMins) : null;
  const latestFinishMin = endMins.length ? Math.max(...endMins) : null;

  const totalMovieRuntimeMin = films.reduce(
    (sum, f) => sum + (f.runtimeMin ?? 0),
    0,
  );
  const totalBreakTimeMin = breaks.reduce(
    (sum, b) => sum + (b.durationMin ?? 0),
    0,
  );
  const gapParts = breaks
    .map((b) => b.gapMinutes)
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  const totalGapsMin = gapParts.length
    ? gapParts.reduce((a, b) => a + b, 0)
    : null;

  const totalTimeOutMin =
    earliestStartMin != null && latestFinishMin != null
      ? Math.max(0, latestFinishMin - earliestStartMin)
      : null;

  const theaters = [
    ...new Set(films.map((f) => f.theater).filter(Boolean)),
  ];

  const dateLabel =
    asText(options.dateLabel) ||
    asText(plan.dateLabel) ||
    asText(plan.dateDisplay) ||
    asText(plan.summaryDate) ||
    '';

  const startClock = formatClockFromMinutes(earliestStartMin);
  const endClock = formatClockFromMinutes(latestFinishMin);
  const windowLabel =
    startClock && endClock ? `${startClock}–${endClock}` : startClock || endClock;

  const movieCount = films.length;
  const movieCountLabel =
    movieCount === 1 ? '1 movie' : `${movieCount} movies`;

  const summaryBits = [dateLabel, windowLabel, movieCountLabel].filter(Boolean);

  return {
    planId: plan.id ?? null,
    rank: plan.rank ?? null,
    title: 'Your Movie Day Plan',
    summaryLine: summaryBits.join(' · '),
    dateLabel,
    windowLabel,
    movieCount,
    movieCountLabel,
    stats: {
      totalLabel: totalTimeOutMin != null ? formatDurationMinutes(totalTimeOutMin) : '—',
      totalCaption: 'total',
      breaksValue: String(breaks.length),
      breaksCaption: 'breaks',
      theatersValue: String(theaters.length),
      theatersCaption: 'theaters',
    },
    itinerary,
    summary: {
      earliestStart: startClock || '—',
      latestFinish: endClock || '—',
      totalTimeOut:
        totalTimeOutMin != null ? formatDurationMinutes(totalTimeOutMin) : '—',
      totalMovieRuntime:
        totalMovieRuntimeMin > 0
          ? formatDurationMinutes(totalMovieRuntimeMin)
          : '—',
      totalBreakTime:
        totalBreakTimeMin > 0 ? formatDurationMinutes(totalBreakTimeMin) : '0m',
      totalGaps:
        totalGapsMin == null
          ? '—'
          : totalGapsMin === 0
            ? '0 min'
            : `~${totalGapsMin} min`,
    },
    provenance: asText(plan.provenance) || asText(plan.source) || '',
  };
}
