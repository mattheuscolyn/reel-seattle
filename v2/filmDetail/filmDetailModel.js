/**
 * Film Detail view-models — honest signals from HomeData only.
 * No fabricated synopsis, year, director, Letterboxd ranks, or thematic tags.
 */

import { pacificDateString } from '../explore/exploreCatalog.js';
import { formatRuntimeLabel } from '../home/shelfData.js';
import {
  formatLocalDateLabel,
  formatUserFacingFormatLabel,
} from '../topOpportunities/topOpportunityFormat.js';

const PREMIUM_FORMAT_HINTS = Object.freeze([
  '70mm',
  'imax',
  'dolby',
  '35mm',
  '4dx',
  'screenx',
]);

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 */
export function resolveFilm(homeData, filmKey) {
  return (Array.isArray(homeData?.films) ? homeData.films : []).find(
    (f) => f.filmKey === filmKey,
  ) ?? null;
}

/**
 * @param {object | null} homeData
 * @param {string} filmKey
 */
export function listFilmOpportunities(homeData, filmKey) {
  return (Array.isArray(homeData?.opportunities) ? homeData.opportunities : [])
    .filter((opp) => opp.filmKey === filmKey)
    .sort((a, b) => {
      if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
        return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
      }
      return a.opportunityKey < b.opportunityKey ? -1 : 1;
    });
}

/**
 * Best Way opportunity: prefer emphasized entry key when still valid, else
 * earliest upcoming; soft-prefer premium formats among same-day earliest.
 *
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {string | null} [emphasizedOpportunityKey]
 */
export function selectBestOpportunity(
  homeData,
  filmKey,
  emphasizedOpportunityKey = null,
) {
  const opps = listFilmOpportunities(homeData, filmKey);
  if (opps.length === 0) return null;
  const today = pacificDateString();
  if (emphasizedOpportunityKey) {
    const hit = opps.find((o) => o.opportunityKey === emphasizedOpportunityKey);
    if (hit && typeof hit.localDate === 'string' && hit.localDate >= today) {
      return hit;
    }
  }
  const upcoming = opps.filter(
    (o) => typeof o.localDate === 'string' && o.localDate >= today,
  );
  const pool = upcoming.length > 0 ? upcoming : opps;
  const scored = [...pool].sort((a, b) => {
    const pa = premiumScore(a);
    const pb = premiumScore(b);
    if (pa !== pb) return pb - pa;
    if (a.sortableLocalDateTime !== b.sortableLocalDateTime) {
      return a.sortableLocalDateTime < b.sortableLocalDateTime ? -1 : 1;
    }
    return a.opportunityKey < b.opportunityKey ? -1 : 1;
  });
  return scored[0] ?? null;
}

function premiumScore(opp) {
  const tags = (opp.formatLabels ?? []).map((t) => String(t).toLowerCase());
  let score = 0;
  for (const hint of PREMIUM_FORMAT_HINTS) {
    if (tags.some((t) => t.includes(hint))) score += 2;
  }
  return score;
}

/**
 * @param {object} opportunity
 */
export function opportunityFormatLabel(opportunity) {
  const labels = (opportunity?.formatLabels ?? [])
    .map(formatUserFacingFormatLabel)
    .filter(Boolean);
  return labels[0] ?? null;
}

/**
 * Database-derived Why See It signals (no editorial invention).
 * @param {object | null} homeData
 * @param {object} film
 * @returns {{ id: string, type: string, primary: string, secondary: string | null, tone: string }[]}
 */
export function buildWhySeeItSignals(homeData, film) {
  if (!film?.filmKey) return [];
  const opps = listFilmOpportunities(homeData, film.filmKey);
  const today = pacificDateString();
  const theaters = new Set(opps.map((o) => o.theaterId).filter(Boolean));
  const formatVenueMap = new Map();
  for (const opp of opps) {
    for (const raw of opp.formatLabels ?? []) {
      const label = formatUserFacingFormatLabel(raw);
      if (!label) continue;
      if (!formatVenueMap.has(label)) formatVenueMap.set(label, new Set());
      if (opp.theaterId) formatVenueMap.get(label).add(opp.theaterId);
    }
  }

  /** @type {{ id: string, type: string, primary: string, secondary: string | null, tone: string }[]} */
  const signals = [];

  const newly = (Array.isArray(homeData?.newlyAdded) ? homeData.newlyAdded : []).find(
    (e) => e.filmKey === film.filmKey,
  );
  if (newly || opps.some((o) => o.isNewlyAdded)) {
    signals.push({
      id: 'newly-added',
      type: 'newly_added',
      primary: 'Newly added',
      secondary: newly?.firstObservedAt
        ? `First seen ${formatLocalDateLabel(newly.firstObservedAt) ?? newly.firstObservedAt}`
        : 'Recently appeared in Seattle listings',
      tone: 'violet',
      icon: 'spark',
    });
  }

  for (const [label, venueSet] of formatVenueMap) {
    const lower = label.toLowerCase();
    const isPremium = PREMIUM_FORMAT_HINTS.some((h) => lower.includes(h));
    if (!isPremium) continue;
    const n = venueSet.size;
    signals.push({
      id: `format-${label}`,
      type: 'special_format',
      primary:
        n === 1
          ? `${label} presentation`
          : `${label} at ${n} venues`,
      secondary:
        n === 1
          ? 'Limited local presentation'
          : `Showing at ${n} Seattle-area venues`,
      tone: lower.includes('70') || lower.includes('imax') ? 'violet' : 'cyan',
      icon: 'spark',
    });
  }

  if (theaters.size === 1) {
    const onlyId = [...theaters][0];
    const name =
      opps.find((o) => o.theaterId === onlyId)?.theaterName ?? 'one venue';
    signals.push({
      id: 'only-venue',
      type: 'limited_venue',
      primary: `Only at ${name}`,
      secondary: 'Single-venue engagement in the current window',
      tone: 'cyan',
      icon: 'building',
    });
  } else if (theaters.size > 1 && theaters.size <= 3) {
    signals.push({
      id: 'few-venues',
      type: 'limited_venue',
      primary: `${theaters.size} venues in Seattle`,
      secondary: 'Limited theatrical footprint right now',
      tone: 'cyan',
      icon: 'building',
    });
  }

  const future = opps.filter((o) => o.localDate >= today);
  if (future.length > 0 && future.length <= 5) {
    const last = future[future.length - 1];
    signals.push({
      id: 'screenings-left',
      type: 'scarcity',
      primary:
        future.length === 1
          ? '1 screening left'
          : `${future.length} screenings left`,
      secondary: last?.localDate
        ? `Through ${formatLocalDateLabel(last.localDate) ?? last.localDate}`
        : null,
      tone: 'coral',
      icon: 'calendar',
    });
  }

  if (opps.some((o) => o.isSpecialScreening)) {
    signals.push({
      id: 'special-screening',
      type: 'special_event',
      primary: 'Special screening',
      secondary: 'Marked as a special presentation in source data',
      tone: 'gold',
      icon: 'star',
    });
  }

  // Deterministic order: scarcity/format first, then newly added, then venue.
  const order = {
    special_format: 0,
    scarcity: 1,
    newly_added: 2,
    limited_venue: 3,
    special_event: 4,
  };
  signals.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9));

  // Dedupe by primary text
  const seen = new Set();
  return signals.filter((s) => {
    if (seen.has(s.primary)) return false;
    seen.add(s.primary);
    return true;
  });
}

/**
 * @param {object} opportunity
 * @param {object | null} film
 * @param {object | null} [homeData]
 */
export function buildBestWayCard(opportunity, film, homeData = null) {
  if (!opportunity) return null;
  const today = pacificDateString();
  const formatLabel = opportunityFormatLabel(opportunity);
  const dateLabel =
    opportunity.localDate === today
      ? 'Today'
      : formatLocalDateLabel(opportunity.localDate);
  const facts = [];
  const tags = (opportunity.formatLabels ?? []).map((t) => String(t).toLowerCase());
  const isPremium = PREMIUM_FORMAT_HINTS.some((h) =>
    tags.some((t) => t.includes(h)),
  );
  if (isPremium && formatLabel) {
    facts.push({ id: 'format', label: 'Premier format', icon: 'star' });
  }
  if ((film?.theaterCount ?? 0) === 1) {
    facts.push({ id: 'only', label: 'Only local venue', icon: 'building' });
  }
  // Distance is not available in public artifacts — prefer neighborhood when present.
  const theaterMeta =
    homeData?.theatersById?.[opportunity.theaterId] ??
    (Array.isArray(homeData?.theaters)
      ? homeData.theaters.find((t) => t.id === opportunity.theaterId)
      : null);
  const neighborhood =
    asTrimmed(theaterMeta?.neighborhood) ??
    asTrimmed(opportunity.neighborhood);
  if (neighborhood) {
    facts.push({ id: 'place', label: neighborhood, icon: 'pin' });
  }
  if (opportunity.isNewlyAdded && facts.length < 3) {
    facts.push({ id: 'new', label: 'Newly listed', icon: 'spark' });
  }
  if (opportunity.isSpecialScreening && facts.length < 3) {
    facts.push({ id: 'special', label: 'Special engagement', icon: 'spark' });
  }

  return {
    opportunityKey: opportunity.opportunityKey,
    filmKey: opportunity.filmKey,
    formatLabel: formatLabel ?? 'Standard',
    theaterName: opportunity.theaterName ?? 'Theater',
    presentationLabel: formatLabel
      ? `${formatLabel} presentation`
      : 'Theatrical presentation',
    whenLabel: [dateLabel, opportunity.timeDisplay].filter(Boolean).join(' · '),
    facts: facts.slice(0, 3),
    ticketUrl: opportunity.ticketUrl ?? null,
    /** Non-ticket context only — never a ticket-action fallback. */
    sourceUrl: opportunity.sourceUrl ?? null,
  };
}

function asTrimmed(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Compact venue mark for Today’s Showtimes rows (no invented logos).
 * @param {string | null | undefined} theaterName
 * @param {string | null | undefined} theaterId
 */
export function buildVenueMark(theaterName, theaterId = null) {
  const name = String(theaterName ?? '').trim();
  const lower = name.toLowerCase();
  let label = 'TH';
  let accent = 'neutral';
  if (lower.includes('siff')) {
    label = 'SIFF';
    accent = 'violet';
  } else if (lower.includes('amc')) {
    label = 'AMC';
    accent = 'coral';
  } else if (lower.includes('regal')) {
    label = 'RGL';
    accent = 'cyan';
  } else if (lower.includes('central')) {
    label = 'CEN';
    accent = 'gold';
  } else if (lower.includes('northwest') || lower.includes('nwff')) {
    label = 'NW';
    accent = 'cyan';
  } else if (name) {
    const words = name.split(/\s+/).filter(Boolean);
    label = words
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 3);
  }
  // Deterministic accent fallback from id when still neutral.
  if (accent === 'neutral' && theaterId) {
    const tones = ['violet', 'cyan', 'gold', 'coral'];
    let hash = 0;
    for (let i = 0; i < theaterId.length; i += 1) {
      hash = (hash + theaterId.charCodeAt(i) * (i + 1)) % tones.length;
    }
    accent = tones[hash];
  }
  return { label, accent };
}

/**
 * Today's showtimes grouped by theater (Pacific local date).
 * @param {object | null} homeData
 * @param {string} filmKey
 * @param {string | null} [emphasizedOpportunityKey]
 */
export function buildTodaysShowtimes(
  homeData,
  filmKey,
  emphasizedOpportunityKey = null,
) {
  const today = pacificDateString();
  const opps = listFilmOpportunities(homeData, filmKey).filter(
    (o) => o.localDate === today,
  );
  /** @type {Map<string, object>} */
  const byTheater = new Map();
  for (const opp of opps) {
    const id = opp.theaterId ?? opp.theaterName ?? opp.opportunityKey;
    if (!byTheater.has(id)) {
      byTheater.set(id, {
        theaterId: opp.theaterId ?? id,
        theaterName: opp.theaterName ?? 'Theater',
        formats: new Set(),
        times: [],
      });
    }
    const row = byTheater.get(id);
    const label = opportunityFormatLabel(opp);
    if (label) row.formats.add(label);
    row.times.push({
      opportunityKey: opp.opportunityKey,
      timeDisplay: opp.timeDisplay,
      emphasized: opp.opportunityKey === emphasizedOpportunityKey,
      ticketUrl: opp.ticketUrl ?? null,
    });
  }

  const rows = [...byTheater.values()]
    .map((row) => {
      const mark = buildVenueMark(row.theaterName, row.theaterId);
      const sortedTimes = row.times.sort((a, b) =>
        String(a.timeDisplay).localeCompare(String(b.timeDisplay)),
      );
      return {
        theaterId: row.theaterId,
        theaterName: row.theaterName,
        venueMark: mark.label,
        accent: mark.accent,
        formatChips: [...row.formats].slice(0, 2),
        times: sortedTimes.slice(0, 3),
        extraTimeCount: Math.max(0, sortedTimes.length - 3),
        totalTimes: sortedTimes.length,
      };
    })
    .sort((a, b) => String(a.theaterName).localeCompare(String(b.theaterName)));

  return {
    localDate: today,
    rows,
    empty: rows.length === 0,
  };
}

/**
 * Hero view-model — enrichment fields filled by composeFilmDetailPresentation
 * via shared resolveEnrichedFilmPresentation (exact filmId join).
 * @param {object | null} film
 * @param {object | null} bestOpp
 */
export function buildFilmHero(film, bestOpp) {
  if (!film) return null;
  const badges = [];
  const formatLabel = opportunityFormatLabel(bestOpp);
  if (formatLabel) {
    badges.push({ id: 'fmt', label: formatLabel.toUpperCase(), tone: 'neutral' });
  }
  return {
    filmKey: film.filmKey,
    filmId: film.filmId ?? null,
    title: film.title,
    posterUrl: film.posterUrl ?? null,
    /** Backdrop enrichment deferred — poster soft-wash only. */
    backdropUrl: null,
    runtimeLabel: formatRuntimeLabel(film.runtimeMin),
    year: null,
    rating: null,
    genres: null,
    director: null,
    badges,
    synopsis: null,
  };
}

/**
 * Synopsis preview helper — used when enrichment exists.
 * @param {string | null | undefined} text
 * @param {number} [maxChars]
 */
export function truncateSynopsis(text, maxChars = 160) {
  if (typeof text !== 'string' || !text.trim()) {
    return { preview: null, full: null, needsMore: false };
  }
  const full = text.trim();
  if (full.length <= maxChars) {
    return { preview: full, full, needsMore: false };
  }
  const cut = full.slice(0, maxChars).replace(/\s+\S*$/, '');
  return {
    preview: `${cut}…`,
    full,
    needsMore: true,
  };
}

/**
 * Attach newly-added badge when applicable.
 * @param {object | null} homeData
 * @param {object} hero
 * @param {object | null} film
 */
export function attachHeroBadges(homeData, hero, film) {
  if (!hero || !film) return hero;
  const badges = [...(hero.badges ?? [])];
  const newly = (Array.isArray(homeData?.newlyAdded) ? homeData.newlyAdded : []).some(
    (e) => e.filmKey === film.filmKey,
  );
  if (newly) {
    badges.push({ id: 'newly', label: 'NEWLY ADDED', tone: 'neutral' });
  }
  const special = listFilmOpportunities(homeData, film.filmKey).some(
    (o) => o.isSpecialScreening,
  );
  if (special) {
    badges.push({ id: 'special', label: 'SPECIAL', tone: 'neutral' });
  }
  return { ...hero, badges: badges.slice(0, 4) };
}

/**
 * Back label for contextual header.
 * @param {string} originPrimary
 * @param {object | null} returnSurface
 */
export function resolveFilmDetailBackLabel(originPrimary, returnSurface) {
  if (returnSurface?.type === 'collection') {
    if (returnSurface.collectionId === 'search-results') return 'Search';
    return 'Explore';
  }
  if (returnSurface?.type === 'theater-detail') return 'Theater';
  if (originPrimary === 'home') return 'Home';
  if (originPrimary === 'planner') return 'Planner';
  if (originPrimary === 'explore') return 'Explore';
  if (originPrimary === 'profile') return 'Profile';
  return 'Back';
}

export { formatRuntimeLabel, formatLocalDateLabel };
