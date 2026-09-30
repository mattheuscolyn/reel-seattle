/**
 * One presentation model for Plan Detail.
 * Single-screening and multi-film plans share this shape; the view adapts.
 * Does not invent metadata, ticket URLs, or calendar events.
 */

import { acceptedPlanToPlanDetailsPlan } from './acceptedPlanToPlanDetails.js';
import {
  derivePlanDetailsViewModel,
  formatDurationMinutes,
} from './derivePlanDetailsViewModel.js';
import { normalizeExternalTicketUrl } from '../ticket/externalTicketUrl.js';
import {
  formatSharedPlanResponseLabel,
  sharedPlanRsvpOptions,
} from '../sharedPlans/sharedPlanCopy.js';

/**
 * @param {unknown} value
 * @returns {string}
 */
function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Full local calendar date for the plan hero.
 * @param {string | null | undefined} isoDate
 * @returns {string}
 */
export function formatPlanDetailDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  try {
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoDate;
  }
}

/**
 * @param {'private' | 'invited' | 'friends' | string | null | undefined} visibility
 * @returns {string}
 */
export function planDetailSharingLabel(visibility) {
  if (visibility === 'friends') return 'All friends can see this plan';
  if (visibility === 'invited') return 'Specific friends can see this plan';
  return 'Only you can see this plan';
}

/**
 * @param {object} screening
 * @returns {object | null}
 */
function calendarFilmFromScreening(screening) {
  const date = asText(screening?.localDate);
  const time = asText(screening?.localTime);
  const runtime = Number(screening?.runtimeMin);
  const filmKey = asText(screening?.filmKey);
  const theaterId = asText(screening?.theaterId);
  if (!date || !time || !Number.isFinite(runtime) || runtime <= 0) return null;
  if (!filmKey && !theaterId) return null;
  return {
    title: asText(screening.title) || 'Film',
    date,
    time,
    runtime,
    theater: asText(screening.theaterName) || null,
    theater_id: theaterId || null,
    filmKey: filmKey || null,
    format: asText(screening.format) || null,
    ticket_url: normalizeExternalTicketUrl(screening.ticketUrl),
    source: screening.source ?? null,
    source_showtime_id: screening.sourceShowtimeId ?? null,
    addressLabel: asText(screening.addressLabel) || null,
  };
}

/**
 * @param {string} role
 * @returns {'solo' | 'owner' | 'participant' | 'discoverer'}
 */
function normalizeRole(role) {
  if (
    role === 'solo' ||
    role === 'owner' ||
    role === 'participant' ||
    role === 'discoverer'
  ) {
    return role;
  }
  return 'discoverer';
}

/**
 * @param {{
 *   planId: string,
 *   source?: 'accepted' | 'shared',
 *   label?: string | null,
 *   date?: string | null,
 *   screenings: object[],
 *   visibility?: 'private' | 'invited' | 'friends' | null,
 *   planType?: 'proposal' | 'decided' | null,
 *   viewerRole: 'solo' | 'owner' | 'participant' | 'discoverer',
 *   viewerSignedIn?: boolean,
 *   localPlanId?: string | null,
 *   canToggleTickets?: boolean,
 *   people?: Array<{
 *     userId: string,
 *     displayName: string,
 *     avatarUrl?: string | null,
 *     response?: string | null,
 *     responseLabel?: string | null,
 *     isSelf?: boolean,
 *     isOwner?: boolean,
 *   }>,
 *   organizerNote?: string | null,
 *   timeFormatId?: string,
 *   enrichmentIndex?: object | null,
 *   homeData?: object | null,
 * }} input
 */
export function deriveCanonicalPlanDetail(input) {
  const screenings = Array.isArray(input?.screenings) ? input.screenings : [];
  if (!input?.planId || screenings.length === 0) return null;

  const role = normalizeRole(input.viewerRole);
  const timeFormatId = asText(input.timeFormatId) || '12h';
  const details = acceptedPlanToPlanDetailsPlan(
    {
      planId: input.planId,
      date: input.date ?? screenings[0]?.localDate ?? null,
      label: input.label ?? null,
      performances: screenings,
      acceptedAt: null,
    },
    {
      enrichmentIndex: input.enrichmentIndex ?? null,
      homeData: input.homeData ?? null,
    },
  );
  if (!details) return null;

  const base = derivePlanDetailsViewModel(details, { timeFormatId });
  if (!base) return null;

  const itemById = new Map(
    (details.items ?? [])
      .filter((item) => item && item.type !== 'break')
      .map((item) => [item.id, item]),
  );

  const itinerary = base.itinerary.map((row) => {
    if (row.kind !== 'film') return row;
    const src = itemById.get(row.id);
    const ticketUrl = normalizeExternalTicketUrl(src?.ticketUrl);
    return {
      ...row,
      performanceKey: src?.performanceKey ?? row.id,
      ticketUrl,
      ticketsPurchased: src?.ticketsPurchased === true,
      formatBadge: row.formatBadge || null,
    };
  });

  const films = itinerary.filter((row) => row.kind === 'film');
  const breaks = itinerary.filter((row) => row.kind === 'break');
  const filmCount = films.length;
  const isMulti = filmCount > 1;
  const customLabel = asText(input.label);
  const title = isMulti
    ? customLabel || 'Your Movie Day Plan'
    : customLabel || films[0]?.title || 'Plan';

  const theaters = [
    ...new Set(films.map((film) => asText(film.theater)).filter(Boolean)),
  ];
  const theaterSummary = theaters.length === 1 ? theaters[0] : null;

  const elapsed =
    base.stats.totalLabel && base.stats.totalLabel !== '—'
      ? base.stats.totalLabel
      : '';
  const singleRuntime =
    films[0]?.runtimeMin != null && films[0].runtimeMin > 0
      ? formatDurationMinutes(films[0].runtimeMin)
      : elapsed;
  const durationLabel = isMulti ? elapsed : singleRuntime;
  const start = base.summary.earliestStart;
  const end = base.summary.latestFinish;
  const window =
    start && end && start !== '—' && end !== '—'
      ? `${start} – ${end}`
      : start && start !== '—'
        ? start
        : '';
  const scheduleLine = [
    window,
    durationLabel
      ? `${durationLabel}${isMulti ? ' total' : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const tags = !isMulti
    ? films.map((film) => film.formatBadge).filter(Boolean)
    : [];

  const posters = films
    .map((film) => asText(film.imageUrl))
    .filter(Boolean)
    .slice(0, 2);

  const breakCount = breaks.length;
  const statsLine = !isMulti
    ? '1 movie'
    : [
        `${filmCount} films`,
        breakCount === 1 ? '1 break' : breakCount > 1 ? `${breakCount} breaks` : null,
        elapsed ? `${elapsed} total` : null,
      ]
        .filter(Boolean)
        .join(' · ');

  /** @type {typeof input.people} */
  let people = Array.isArray(input.people) ? [...input.people] : [];
  if (role === 'solo' && people.length === 0) {
    people = [
      {
        userId: 'viewer',
        displayName: 'You',
        avatarUrl: null,
        response: 'going',
        isSelf: true,
        isOwner: true,
      },
    ];
  }
  const planType = input.planType ?? (role === 'solo' ? 'decided' : null);
  const peopleRows = people.map((person) => ({
    userId: person.userId,
    displayName: asText(person.displayName) || 'Friend',
    avatarUrl: person.avatarUrl ?? null,
    response: person.response ?? null,
    responseLabel:
      asText(person.responseLabel) ||
      (person.isOwner && !person.response
        ? 'Organizer'
        : formatSharedPlanResponseLabel(person.response, planType)),
    isSelf: person.isSelf === true,
    isOwner: person.isOwner === true,
  }));
  const others = peopleRows.filter((person) => !person.isSelf);
  const peopleMode =
    (role === 'solo' || role === 'owner') && others.length === 0
      ? 'compact'
      : 'list';

  const viewerSignedIn = input.viewerSignedIn === true;
  const localPlanId = asText(input.localPlanId) || null;
  const canManage = role === 'solo' || role === 'owner';
  const canToggleTickets =
    input.canToggleTickets === true && (role === 'solo' || role === 'owner');
  const canRemove =
    Boolean(localPlanId) && (role === 'solo' || role === 'owner');
  const canRespond = role === 'participant' && viewerSignedIn;
  const canJoin =
    role === 'discoverer' &&
    viewerSignedIn &&
    input.visibility === 'friends';

  const ticketRows = films
    .map((film) => ({
      performanceKey: film.performanceKey,
      title: film.title,
      ticketsPurchased: film.ticketsPurchased === true,
      ticketUrl: filmCount > 1 ? film.ticketUrl : null,
      canToggle: canToggleTickets && Boolean(film.performanceKey),
    }))
    .filter(
      (row) => row.canToggle || row.ticketUrl || row.ticketsPurchased,
    );

  const singleTicketUrl =
    filmCount === 1 ? films[0]?.ticketUrl ?? null : null;
  const calendarFilms = screenings
    .map((screening) => calendarFilmFromScreening(screening))
    .filter(Boolean);
  const canCalendar =
    calendarFilms.length > 0 && calendarFilms.length === screenings.length;

  const film = films[0];
  const filmDetail =
    filmCount === 1 && asText(film?.filmKey)
      ? {
          filmKey: film.filmKey,
          filmId: film.filmId ?? null,
          opportunityKey: film.opportunityKey ?? null,
        }
      : null;

  const showSharing =
    role === 'solo' ||
    role === 'owner' ||
    role === 'participant' ||
    input.visibility === 'friends' ||
    input.visibility === 'invited';

  return {
    planId: input.planId,
    source: input.source === 'shared' ? 'shared' : 'accepted',
    localPlanId,
    title,
    isMulti,
    showMovieDay: isMulti,
    filmCount,
    filmCountLabel: isMulti ? `${filmCount} films` : null,
    dateLabel: formatPlanDetailDate(details.date) || base.dateLabel,
    scheduleLine,
    theaterSummary,
    spansMultipleTheaters: theaters.length > 1,
    tags,
    posters,
    statsLine,
    itinerary,
    breakCount,
    peopleMode,
    showPeople: peopleMode === 'compact' || peopleRows.length > 0,
    people: peopleRows,
    peopleCount: peopleRows.length,
    viewerStatusLabel:
      peopleRows.find((person) => person.isSelf)?.responseLabel ?? null,
    organizerNote:
      role === 'discoverer' ? null : asText(input.organizerNote) || null,
    sharing: {
      show: showSharing,
      label: planDetailSharingLabel(
        role === 'solo' && !input.visibility ? 'private' : input.visibility,
      ),
      canManage,
      visibility: input.visibility ?? (role === 'solo' ? 'private' : null),
    },
    tickets: {
      scope: 'screening',
      rows: ticketRows,
    },
    tools: {
      canCalendar,
      calendarFilms: canCalendar ? calendarFilms : [],
      filmDetail,
      ticketUrl: singleTicketUrl,
    },
    permissions: {
      role,
      canInvite: canManage,
      canManageSharing: canManage,
      canRemove,
      canToggleTickets,
      canRespond,
      canJoin,
      joinLabel: planType === 'decided' ? 'Join' : 'Interested',
      rsvpOptions: canRespond ? sharedPlanRsvpOptions(planType || 'proposal') : [],
    },
    /**
     * Growing a one-screening plan into another screening needs an append
     * that keeps planId. That API does not exist yet, so the action is omitted.
     */
    addScreening: {
      available: false,
      reason: 'no-append-api',
    },
  };
}
