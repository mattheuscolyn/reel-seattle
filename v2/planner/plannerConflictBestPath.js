/**
 * Deterministic "Best path" recommendation for Planner conflict review.
 */

const TIE_EPSILON = 5;

/**
 * @param {string} isoDate
 */
function weekdayLongFromIso(isoDate) {
  try {
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
    }).format(date);
  } catch {
    return '';
  }
}

/**
 * @param {Array<{ dayShort?: string | null, localDate?: string | null }>} alternates
 */
function uniqueDayLabels(alternates) {
  /** @type {string[]} */
  const days = [];
  const seen = new Set();
  for (const alt of alternates) {
    const label =
      weekdayLongFromIso(alt.localDate ?? '') ||
      (typeof alt.dayShort === 'string' ? alt.dayShort.trim() : '');
    if (!label || seen.has(label)) continue;
    seen.add(label);
    days.push(label);
  }
  return days;
}

/**
 * @param {string[]} days
 */
function formatDayList(days) {
  if (days.length === 0) return 'another day';
  if (days.length === 1) return days[0];
  if (days.length === 2) return `${days[0]} or ${days[1]}`;
  const last = days[days.length - 1];
  const rest = days.slice(0, -1).join(', ');
  return `${rest}, or ${last}`;
}

/**
 * Lower score = better alternate (less disruptive).
 * @param {object} alternate
 * @param {object} member
 */
function scoreAlternate(alternate, member) {
  let score = 0;
  if (alternate.localDate !== member.localDate) score += 1000;
  if (alternate.theaterId && member.theaterId && alternate.theaterId !== member.theaterId) {
    score += 200;
  }
  const startMs = alternate.startMs ?? null;
  const memberStart = member.startMs ?? null;
  if (startMs != null && memberStart != null) {
    score += Math.abs(startMs - memberStart) / 60_000;
  }
  return score;
}

/**
 * @param {Array<object>} alternates
 * @param {object} member
 */
function pickBestAlternate(alternates, member) {
  if (!alternates?.length) return null;
  return [...alternates].sort(
    (a, b) => scoreAlternate(a, member) - scoreAlternate(b, member),
  )[0];
}

/**
 * @param {Array<{
 *   planId: string,
 *   performanceKey: string,
 *   title: string,
 *   weekdayLabel?: string | null,
 *   dateLabel?: string | null,
 *   localDate?: string | null,
 *   theaterId?: string | null,
 *   startMs?: number | null,
 *   viableAlternates?: object[],
 * }>} members
 */
export function recommendConflictBestPath(members) {
  const list = Array.isArray(members) ? members : [];
  if (list.length < 2) {
    return {
      kind: 'unavailable',
      text: 'These screenings overlap.',
      moveTarget: null,
    };
  }

  const enriched = list.map((member) => {
    const viableAlternates = Array.isArray(member.viableAlternates)
      ? member.viableAlternates
      : [];
    return {
      ...member,
      viableAlternates,
      bestAlternate: pickBestAlternate(viableAlternates, member),
      bestScore:
        viableAlternates.length > 0
          ? scoreAlternate(pickBestAlternate(viableAlternates, member), member)
          : Number.POSITIVE_INFINITY,
    };
  });

  const movable = enriched.filter((m) => m.viableAlternates.length > 0);
  const immovable = enriched.filter((m) => m.viableAlternates.length === 0);

  if (movable.length === 0) {
    return {
      kind: 'none',
      text: 'No conflict-free alternate is currently available. Remove one screening or leave the conflict unresolved.',
      moveTarget: null,
    };
  }

  if (movable.length === 1 && immovable.length >= 1) {
    const keep = immovable[0];
    const move = movable[0];
    const dayRef =
      keep.weekdayLabel ||
      keep.dateLabel?.split(',')[0]?.trim() ||
      'this day';
    const altDays = uniqueDayLabels(move.viableAlternates);
    return {
      kind: 'move-one',
      text: `Keep ${keep.title} on ${dayRef} and move ${move.title} to ${formatDayList(altDays)}.`,
      moveTarget: {
        planId: move.planId,
        performanceKey: move.performanceKey,
      },
    };
  }

  if (movable.length >= 2) {
    const ranked = [...movable].sort((a, b) => a.bestScore - b.bestScore);
    const best = ranked[0];
    const second = ranked[1];
    if (
      second &&
      Math.abs(best.bestScore - second.bestScore) <= TIE_EPSILON
    ) {
      return {
        kind: 'tie',
        text: 'Either film can move to a conflict-free showtime. Pick the change you prefer.',
        moveTarget: null,
      };
    }
    const others = enriched.filter(
      (m) =>
        m.planId !== best.planId ||
        m.performanceKey !== best.performanceKey,
    );
    const keep = others[0] ?? enriched[0];
    const dayRef =
      keep.weekdayLabel ||
      keep.dateLabel?.split(',')[0]?.trim() ||
      'this day';
    const altDays = uniqueDayLabels(best.viableAlternates);
    return {
      kind: 'move-one',
      text: `Keep ${keep.title} on ${dayRef} and move ${best.title} to ${formatDayList(altDays)}.`,
      moveTarget: {
        planId: best.planId,
        performanceKey: best.performanceKey,
      },
    };
  }

  return {
    kind: 'unavailable',
    text: 'These screenings overlap.',
    moveTarget: null,
  };
}
