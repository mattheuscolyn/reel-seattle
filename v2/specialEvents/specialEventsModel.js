/**
 * Explore → Special Events presentation model.
 * Inclusion is driven only by HomeData opportunity.specialEvent
 * (isSpecialEvent === true && confidence === "high").
 * Never reconstructs classification from titles, formats, or legacy flags.
 */

import {
  addIsoDays,
  formatCompactDateLabel,
  isoWeekday,
  pacificDateString,
} from '../explore/exploreCatalog.js';
import { enrichHomeFilm } from '../enrichment/enrichHomeFilm.js';
import { formatUserFacingFormatLabel } from '../topOpportunities/topOpportunityFormat.js';

export const SPECIAL_EVENTS_PAGE_TITLE = 'Special Events';
export const SPECIAL_EVENTS_PAGE_TAGLINE =
  'Q&As, early access, opening nights, mystery screenings, and other special screening experiences.';

export const SPECIAL_EVENT_TYPE_LABELS = Object.freeze({
  q_and_a: 'Q&A',
  intro_or_discussion: 'Introduction / Discussion',
  early_access: 'Early Access',
  sneak_preview: 'Sneak Preview',
  opening_night: 'Opening Night',
  fan_event: 'Fan Event',
  mystery_screening: 'Mystery Screening',
  special_presentation: 'Special Presentation',
  other_event: 'Special Event',
});

/** Accessibility / language tags — never treat as event inclusion or primary card chrome. */
const SECONDARY_FORMAT_SKIP = new Set([
  'closed-caption',
  'closed-captions',
  'closed caption',
  'closed_caption',
  'open-caption',
  'open-captions',
  'open caption',
  'audio-description',
  'audio description',
  'oc',
  'cc',
  'standard',
]);

const SECTION_ORDER = Object.freeze([
  Object.freeze({ id: 'today', label: 'TODAY' }),
  Object.freeze({ id: 'tomorrow', label: 'TOMORROW' }),
  Object.freeze({ id: 'this-week', label: 'THIS WEEK' }),
  Object.freeze({ id: 'later', label: 'LATER' }),
]);

/**
 * @param {unknown} specialEvent
 */
export function isQualifyingSpecialEvent(specialEvent) {
  return (
    specialEvent != null &&
    typeof specialEvent === 'object' &&
    specialEvent.isSpecialEvent === true &&
    specialEvent.confidence === 'high'
  );
}

/**
 * @param {object | null | undefined} opportunity
 */
export function isQualifyingSpecialEventOpportunity(opportunity) {
  return isQualifyingSpecialEvent(opportunity?.specialEvent);
}

/**
 * @param {unknown} types
 * @returns {string[]}
 */
export function normalizeSpecialEventTypes(types) {
  if (!Array.isArray(types)) return [];
  return [
    ...new Set(
      types
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.trim()),
    ),
  ].sort();
}

/**
 * @param {unknown} labels
 * @returns {string[]}
 */
export function normalizeSpecialEventLabels(labels) {
  if (!Array.isArray(labels)) return [];
  const seen = new Set();
  const out = [];
  for (const lab of labels) {
    if (typeof lab !== 'string') continue;
    const trimmed = lab.trim().replace(/\s+/g, ' ');
    if (!trimmed) continue;
    const key = trimmed.toLocaleLowerCase('en');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.sort((a, b) =>
    a.toLocaleLowerCase('en').localeCompare(b.toLocaleLowerCase('en'), 'en'),
  );
}

/**
 * Conservative engagement identity:
 * parent film + normalized types + normalized labels
 * (+ date for mystery / sneak occurrences).
 * @param {object} opportunity
 */
export function specialEventEngagementKey(opportunity) {
  const se = opportunity?.specialEvent;
  const types = normalizeSpecialEventTypes(se?.types);
  const labels = normalizeSpecialEventLabels(se?.labels);
  const parentKey =
    (typeof opportunity?.parentFilmKey === 'string' &&
      opportunity.parentFilmKey.trim()) ||
    (typeof opportunity?.filmKey === 'string' && opportunity.filmKey.trim()) ||
    'unknown';
  const parts = [parentKey, types.join(','), labels.join('|').toLocaleLowerCase('en')];
  if (
    types.includes('mystery_screening') ||
    types.includes('sneak_preview')
  ) {
    parts.push(
      typeof opportunity?.localDate === 'string' ? opportunity.localDate : '',
    );
  }
  return parts.join('::');
}

/**
 * @param {string[]} types
 */
export function typeLabelsForTypes(types) {
  return normalizeSpecialEventTypes(types)
    .map((t) => SPECIAL_EVENT_TYPE_LABELS[t] ?? null)
    .filter(Boolean);
}

/**
 * Prefer richer specialEvent.labels when they add information;
 * otherwise join concise type labels. Avoid near-duplicate title echo.
 * @param {{ types?: string[], labels?: string[] }} specialEvent
 * @param {string} [filmTitle]
 */
export function formatSpecialEventDescription(specialEvent, filmTitle = '') {
  const types = normalizeSpecialEventTypes(specialEvent?.types);
  const labels = normalizeSpecialEventLabels(specialEvent?.labels);
  const typeLine = typeLabelsForTypes(types).join(' · ');
  const titleFold = filmTitle.trim().toLocaleLowerCase('en');

  const usefulLabels = labels.filter((lab) => {
    const fold = lab.toLocaleLowerCase('en');
    if (!fold) return false;
    // Drop only when the label restates the entire film title — not when the
    // title merely contains the event subtype (e.g. "Community Screening: …").
    if (titleFold && fold === titleFold) return false;
    return true;
  });

  if (usefulLabels.length === 1) {
    const lab = usefulLabels[0];
    // Prefer label when it carries multi-type meaning (e.g. Early Access + Q&A).
    if (types.length > 1 || lab.length >= (typeLine?.length ?? 0)) {
      return lab;
    }
  }
  if (usefulLabels.length > 1) {
    // One human-readable line — prefer the longest informative label.
    return usefulLabels.slice().sort((a, b) => b.length - a.length)[0];
  }
  if (typeLine) return typeLine;
  return 'Special Event';
}

/**
 * Premium / presentation formats only — never accessibility chips.
 * @param {unknown} formatLabels
 * @returns {string[]}
 */
export function secondaryFormatLabels(formatLabels) {
  if (!Array.isArray(formatLabels)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of formatLabels) {
    if (typeof raw !== 'string') continue;
    const key = raw.trim().toLowerCase();
    if (!key || SECONDARY_FORMAT_SKIP.has(key)) continue;
    const label = formatUserFacingFormatLabel(raw);
    if (!label) continue;
    // Skip accessibility labels that map through FORMAT_DISPLAY.
    if (
      /caption|audio description/i.test(label) ||
      label === 'OC' ||
      label === 'CC' ||
      label === 'Standard'
    ) {
      continue;
    }
    const fold = label.toLocaleLowerCase('en');
    if (seen.has(fold)) continue;
    seen.add(fold);
    out.push(label);
  }
  return out;
}

/**
 * @param {string} isoDate
 * @param {string} todayIso
 * @returns {'today' | 'tomorrow' | 'this-week' | 'later' | null}
 */
export function resolveSpecialEventSectionId(isoDate, todayIso = pacificDateString()) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return null;
  }
  if (isoDate < todayIso) return null;
  if (isoDate === todayIso) return 'today';
  const tomorrow = addIsoDays(todayIso, 1);
  if (isoDate === tomorrow) return 'tomorrow';
  const dow = isoWeekday(todayIso);
  const daysUntilSunday = dow === 0 ? 0 : 7 - dow;
  const sunday = addIsoDays(todayIso, daysUntilSunday);
  if (isoDate > tomorrow && isoDate <= sunday) return 'this-week';
  if (isoDate > sunday) return 'later';
  return null;
}

/**
 * @param {object} opportunity
 * @param {object | null | undefined} film
 */
export function resolveSpecialEventFilmTitle(opportunity, film = null) {
  const se = opportunity?.specialEvent;
  const types = normalizeSpecialEventTypes(se?.types);
  const labels = normalizeSpecialEventLabels(se?.labels);
  const parentTitle =
    typeof opportunity?.parentDisplayTitle === 'string'
      ? opportunity.parentDisplayTitle.trim()
      : '';
  const filmTitle =
    typeof film?.title === 'string' ? film.title.trim() : '';
  const sourceTitle =
    typeof opportunity?.sourceTitle === 'string'
      ? opportunity.sourceTitle.trim()
      : '';
  // Prefer parent display title — film aggregation may keep event-source titles.
  let base = parentTitle || filmTitle || sourceTitle || 'Special Event';

  if (types.includes('mystery_screening')) {
    const label = labels[0];
    if (label && (/^AMC$/i.test(base) || base.length <= 3)) {
      return label;
    }
    // Prefer the event label when the catalog title is also just a source slug.
    if (label && /^Screen Unseen/i.test(label) && /Screen Unseen/i.test(base)) {
      return label;
    }
  }
  return base;
}

/**
 * @param {object[]} opportunities
 * @param {{ now?: Date, enrichmentIndex?: object | null, homeData?: object | null }} [options]
 */
export function groupSpecialEventEngagements(opportunities, options = {}) {
  const todayIso = pacificDateString(options.now ?? new Date());
  const homeData = options.homeData ?? null;
  const enrichmentIndex = options.enrichmentIndex ?? null;

  /** @type {Map<string, object[]>} */
  const buckets = new Map();
  for (const opp of opportunities || []) {
    if (!isQualifyingSpecialEventOpportunity(opp)) continue;
    if (typeof opp.localDate === 'string' && opp.localDate < todayIso) continue;
    const key = specialEventEngagementKey(opp);
    const list = buckets.get(key);
    if (list) list.push(opp);
    else buckets.set(key, [opp]);
  }

  const engagements = [];
  for (const [engagementId, opps] of buckets) {
    const sorted = opps.slice().sort((a, b) => {
      const ta = String(a.sortableLocalDateTime ?? '');
      const tb = String(b.sortableLocalDateTime ?? '');
      if (ta !== tb) return ta < tb ? -1 : 1;
      return String(a.opportunityKey ?? '').localeCompare(
        String(b.opportunityKey ?? ''),
      );
    });
    const next = sorted[0];
    if (!next) continue;
    const film =
      homeData?.filmsByKey instanceof Map
        ? homeData.filmsByKey.get(next.filmKey) ?? null
        : (homeData?.films || []).find((f) => f?.filmKey === next.filmKey) ??
          null;
    const enriched = film
      ? enrichHomeFilm(film, enrichmentIndex, 'collection', homeData)
      : null;
    const filmTitle = resolveSpecialEventFilmTitle(next, film);
    const eventDescription = formatSpecialEventDescription(
      next.specialEvent,
      filmTitle,
    );
    const formats = secondaryFormatLabels(next.formatLabels);
    // Union of secondary formats across showtimes when next has none.
    const allFormats = formats.length
      ? formats
      : secondaryFormatLabels(
          sorted.flatMap((o) =>
            Array.isArray(o.formatLabels) ? o.formatLabels : [],
          ),
        );
    const posterUrl =
      (typeof enriched?.posterUrl === 'string' && enriched.posterUrl.trim()) ||
      (typeof film?.posterUrl === 'string' && film.posterUrl.trim()) ||
      null;
    const moreCount = Math.max(0, sorted.length - 1);
    const dateLabel = formatCompactDateLabel(next.localDate) ?? next.localDate;
    const timeLabel = next.timeDisplay || next.localTime || '';
    const sectionId = resolveSpecialEventSectionId(next.localDate, todayIso);
    if (!sectionId) continue;

    engagements.push({
      engagementId,
      filmKey: next.filmKey,
      filmId: film?.filmId ?? null,
      filmTitle,
      eventDescription,
      types: normalizeSpecialEventTypes(next.specialEvent?.types),
      labels: normalizeSpecialEventLabels(next.specialEvent?.labels),
      nextOpportunityKey: next.opportunityKey,
      nextLocalDate: next.localDate,
      nextLocalTime: next.localTime,
      nextTimeDisplay: timeLabel,
      nextDateLabel: dateLabel,
      nextWhenLabel: [dateLabel, timeLabel].filter(Boolean).join(' · '),
      nextTheaterName: next.theaterName || 'Theater TBA',
      nextTheaterId: next.theaterId ?? null,
      formatLabels: allFormats,
      moreCount,
      moreLabel:
        moreCount > 0
          ? `+ ${moreCount} more special-event showtime${moreCount === 1 ? '' : 's'}`
          : null,
      posterUrl,
      hasPoster: Boolean(posterUrl),
      sectionId,
      sortableLocalDateTime: next.sortableLocalDateTime,
      opportunities: sorted,
    });
  }

  engagements.sort((a, b) => {
    const ta = String(a.sortableLocalDateTime ?? '');
    const tb = String(b.sortableLocalDateTime ?? '');
    if (ta !== tb) return ta < tb ? -1 : 1;
    return a.filmTitle.localeCompare(b.filmTitle, 'en', { sensitivity: 'base' });
  });

  return engagements;
}

/**
 * @param {object | null | undefined} homeData
 * @param {{ loadStatus?: string, now?: Date, enrichmentIndex?: object | null }} [options]
 */
export function composeSpecialEventsPage(homeData, options = {}) {
  const loadStatus =
    options.loadStatus ?? (homeData ? 'ready' : 'unavailable');

  if (loadStatus === 'loading') {
    return {
      pageTitle: SPECIAL_EVENTS_PAGE_TITLE,
      pageTagline: SPECIAL_EVENTS_PAGE_TAGLINE,
      loadStatus: 'loading',
      state: 'loading',
      countLabel: 'Loading…',
      sections: [],
      emptyMessage: 'Loading Special Events…',
      visibleCount: 0,
      engagements: [],
    };
  }

  if (loadStatus === 'unavailable' || !homeData) {
    return {
      pageTitle: SPECIAL_EVENTS_PAGE_TITLE,
      pageTagline: SPECIAL_EVENTS_PAGE_TAGLINE,
      loadStatus: 'unavailable',
      state: 'unavailable',
      countLabel: null,
      sections: [],
      emptyMessage: 'Special Events isn’t available right now.',
      visibleCount: 0,
      engagements: [],
    };
  }

  const engagements = groupSpecialEventEngagements(homeData.opportunities, {
    now: options.now,
    enrichmentIndex: options.enrichmentIndex,
    homeData,
  });

  /** @type {Map<string, { id: string, label: string, engagements: object[] }>} */
  const sectionMap = new Map();
  for (const def of SECTION_ORDER) {
    sectionMap.set(def.id, { id: def.id, label: def.label, engagements: [] });
  }
  for (const eng of engagements) {
    sectionMap.get(eng.sectionId)?.engagements.push(eng);
  }
  const sections = SECTION_ORDER.map((def) => sectionMap.get(def.id)).filter(
    (s) => s && s.engagements.length > 0,
  );

  const empty =
    engagements.length === 0
      ? 'No special events are scheduled right now.'
      : null;

  return {
    pageTitle: SPECIAL_EVENTS_PAGE_TITLE,
    pageTagline: SPECIAL_EVENTS_PAGE_TAGLINE,
    loadStatus: 'ready',
    state: empty ? 'empty' : 'ready',
    countLabel:
      engagements.length === 1
        ? '1 special event'
        : `${engagements.length} special events`,
    sections,
    emptyMessage: empty,
    visibleCount: engagements.length,
    engagements,
  };
}

/**
 * @param {object | null | undefined} homeData
 * @param {string | null | undefined} engagementId
 * @param {{ now?: Date, enrichmentIndex?: object | null }} [options]
 */
export function composeSpecialEventsDetail(
  homeData,
  engagementId,
  options = {},
) {
  const page = composeSpecialEventsPage(homeData, {
    loadStatus: homeData ? 'ready' : 'unavailable',
    now: options.now,
    enrichmentIndex: options.enrichmentIndex,
  });
  const id = typeof engagementId === 'string' ? engagementId.trim() : '';
  const engagement = page.engagements.find((e) => e.engagementId === id);

  if (!engagement) {
    return {
      found: false,
      title: SPECIAL_EVENTS_PAGE_TITLE,
      emptyMessage: 'This special event isn’t available.',
    };
  }

  const showtimes = engagement.opportunities.map((opp) => {
    const dateLabel =
      formatCompactDateLabel(opp.localDate) ?? opp.localDate ?? '';
    const timeLabel = opp.timeDisplay || opp.localTime || '';
    const formats = secondaryFormatLabels(opp.formatLabels);
    return {
      opportunityKey: opp.opportunityKey,
      filmKey: opp.filmKey,
      localDate: opp.localDate,
      localTime: opp.localTime,
      timeDisplay: timeLabel,
      dateLabel,
      whenLabel: [dateLabel, timeLabel].filter(Boolean).join(' · '),
      theaterId: opp.theaterId,
      theaterName: opp.theaterName || 'Theater TBA',
      formatLabels: formats,
      ticketUrl: opp.ticketUrl ?? null,
      ariaLabel: [
        engagement.filmTitle,
        engagement.eventDescription,
        dateLabel,
        timeLabel,
        opp.theaterName,
      ]
        .filter(Boolean)
        .join(', '),
    };
  });

  return {
    found: true,
    engagementId: engagement.engagementId,
    filmKey: engagement.filmKey,
    filmId: engagement.filmId,
    filmTitle: engagement.filmTitle,
    eventDescription: engagement.eventDescription,
    types: engagement.types,
    labels: engagement.labels,
    posterUrl: engagement.posterUrl,
    hasPoster: engagement.hasPoster,
    canOpenFilmDetail: Boolean(engagement.filmKey),
    showtimes,
  };
}
