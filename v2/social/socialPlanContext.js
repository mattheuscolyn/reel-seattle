/**
 * Pure social-context copy for Film Detail, showtime sheets, and invite suggestions.
 * Attendance comes from shared-plan signals, never from Saved state.
 */

import { friendGivenName } from '../friends/friendsModel.js';
import { formatFriendNameOverflow } from '../friends/friendFilmActivityModel.js';
import { formatSharedPlanDateLabel } from '../sharedPlans/sharedPlanCopy.js';
import { formatDisplayClock } from '../stores/scheduleSettingsStore.js';

/**
 * @param {unknown} raw
 */
export function normalizeFriendPlanSignal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const row = /** @type {Record<string, unknown>} */ (raw);
  const friendId =
    typeof row.friend_id === 'string'
      ? row.friend_id
      : typeof row.friendId === 'string'
        ? row.friendId
        : null;
  const planId =
    typeof row.plan_id === 'string'
      ? row.plan_id
      : typeof row.planId === 'string'
        ? row.planId
        : null;
  const response =
    typeof row.response === 'string' ? row.response : null;
  if (!friendId || !planId || !response) return null;
  if (response !== 'interested' && response !== 'maybe' && response !== 'going') {
    return null;
  }
  return {
    friendId,
    friendName:
      typeof row.friend_name === 'string'
        ? row.friend_name
        : typeof row.friendName === 'string'
          ? row.friendName
          : null,
    avatarUrl:
      typeof row.avatar_url === 'string'
        ? row.avatar_url
        : typeof row.avatarUrl === 'string'
          ? row.avatarUrl
          : null,
    planId,
    planType:
      row.plan_type === 'decided' || row.planType === 'decided'
        ? 'decided'
        : 'proposal',
    visibility:
      typeof row.visibility === 'string' ? row.visibility : null,
    response,
    performanceKey:
      typeof row.performance_key === 'string'
        ? row.performance_key
        : typeof row.performanceKey === 'string'
          ? row.performanceKey
          : null,
    filmKey:
      typeof row.film_key === 'string'
        ? row.film_key
        : typeof row.filmKey === 'string'
          ? row.filmKey
          : null,
    filmId:
      typeof row.film_id === 'string'
        ? row.film_id
        : typeof row.filmId === 'string'
          ? row.filmId
          : null,
    title: typeof row.title === 'string' ? row.title : null,
    localDate:
      typeof row.local_date === 'string'
        ? row.local_date
        : typeof row.localDate === 'string'
          ? row.localDate
          : null,
    localTime:
      typeof row.local_time === 'string'
        ? row.local_time
        : typeof row.localTime === 'string'
          ? row.localTime
          : null,
    theaterName:
      typeof row.theater_name === 'string'
        ? row.theater_name
        : typeof row.theaterName === 'string'
          ? row.theaterName
          : null,
    viewerCanOpen: row.viewer_can_open !== false && row.viewerCanOpen !== false,
    viewerCanJoin: row.viewer_can_join === true || row.viewerCanJoin === true,
  };
}

/**
 * @param {ReturnType<typeof normalizeFriendPlanSignal>} signal
 * @param {{ performanceKey?: string | null }} target
 */
export function isSameShowtime(signal, target) {
  if (!signal?.performanceKey || !target?.performanceKey) return false;
  return signal.performanceKey === target.performanceKey;
}

/**
 * @param {string | null | undefined} response
 * @param {string | null | undefined} planType
 */
export function responseCountsAsAttendance(response, planType) {
  if (response === 'pending' || response === 'declined') return false;
  if (planType === 'decided') return response === 'going';
  return response === 'interested' || response === 'maybe' || response === 'going';
}

/**
 * @param {NonNullable<ReturnType<typeof normalizeFriendPlanSignal>>[]} signals
 */
function nearestPlanId(signals) {
  const sorted = [...signals].sort((a, b) => {
    const date = String(a.localDate || '').localeCompare(String(b.localDate || ''));
    if (date !== 0) return date;
    return String(a.localTime || '').localeCompare(String(b.localTime || ''));
  });
  return sorted[0]?.planId ?? null;
}

/**
 * Compact Film Detail plan line. Null when there is nothing to say.
 * @param {Array<ReturnType<typeof normalizeFriendPlanSignal>>} signals
 */
export function buildFilmPlanSocialLine(signals) {
  const rows = (Array.isArray(signals) ? signals : []).filter(
    (row) => row && responseCountsAsAttendance(row.response, row.planType),
  );
  if (rows.length === 0) return null;
  const planId = nearestPlanId(rows);
  const nearest = rows.filter((row) => row.planId === planId);
  const extraPlans = new Set(rows.map((row) => row.planId)).size - 1;
  const sample = nearest[0];
  const names = [];
  const seen = new Set();
  for (const row of nearest) {
    if (seen.has(row.friendId)) continue;
    seen.add(row.friendId);
    names.push(friendGivenName(row.friendName));
  }
  const nameText = formatFriendNameOverflow(names, 2);
  const whenClause = [formatSharedPlanDateLabel(sample.localDate), sample.localTime]
    .filter(Boolean)
    .join(' at ');
  const going = nearest.every((row) => row.response === 'going');
  let text;
  if (names.length > 2 && !going) {
    text = `${names.length} friends are planning to see this`;
  } else if (going) {
    text = whenClause
      ? `${nameText} ${names.length === 1 ? 'is' : 'are'} going ${whenClause}`
      : `${nameText} ${names.length === 1 ? 'is' : 'are'} going`;
  } else {
    text = whenClause
      ? `${nameText} ${names.length === 1 ? 'is' : 'are'} interested in ${whenClause}`
      : `${nameText} ${names.length === 1 ? 'is' : 'are'} interested`;
  }
  if (extraPlans > 0) text = `${text} · +${extraPlans} more`;
  const canJoin = nearest.some((row) => row.viewerCanJoin);
  return {
    planId,
    text,
    action: canJoin ? 'join' : 'view',
    actionLabel: canJoin ? 'Join plan' : 'View plan',
  };
}

/**
 * Exact-showtime chip label. Null when nobody is going to this performance.
 * @param {Array<ReturnType<typeof normalizeFriendPlanSignal>>} signals
 * @param {string | null | undefined} performanceKey
 */
export function showtimeAttendanceLabel(signals, performanceKey) {
  if (!performanceKey) return null;
  const going = (Array.isArray(signals) ? signals : []).filter(
    (row) =>
      row &&
      row.response === 'going' &&
      row.performanceKey === performanceKey,
  );
  if (going.length === 0) return null;
  const names = [];
  const seen = new Set();
  for (const row of going) {
    if (seen.has(row.friendId)) continue;
    seen.add(row.friendId);
    names.push(friendGivenName(row.friendName));
  }
  if (names.length === 1) return `${names[0]} going`;
  return `${names[0]} +${names.length - 1} going`;
}

/**
 * Showtime sheet cue. Same-showtime attendance wins over Saved interest.
 * @param {{
 *   performanceKey?: string | null,
 *   signals?: Array<ReturnType<typeof normalizeFriendPlanSignal>>,
 *   savedFriends?: Array<{ userId: string, displayName?: string | null }>,
 *   memberUserIds?: string[],
 * }} input
 */
export function buildShowtimeSocialCue(input) {
  const signals = Array.isArray(input?.signals) ? input.signals.filter(Boolean) : [];
  const key = input?.performanceKey || null;
  const members = new Set(input?.memberUserIds || []);
  const same = key
    ? signals.filter((row) => row.performanceKey === key && row.response === 'going')
    : [];
  if (same.length > 0) {
    const names = [...new Set(same.map((row) => friendGivenName(row.friendName)))];
    const nameText = formatFriendNameOverflow(names, 2);
    const verb = names.length === 1 ? 'is' : 'are';
    return {
      text: `${nameText} ${verb} going to this showtime.`,
      actionLabel: same.some((row) => row.viewerCanJoin) ? 'Join plan' : 'View plan',
      planId: same[0].planId,
      kind: 'attendance',
    };
  }
  const other = key
    ? signals.filter(
        (row) =>
          row.performanceKey &&
          row.performanceKey !== key &&
          responseCountsAsAttendance(row.response, row.planType),
      )
    : [];
  if (other.length > 0) {
    const name = friendGivenName(other[0].friendName);
    return {
      text: `${name} is planning another showtime`,
      actionLabel: other[0].viewerCanJoin ? 'Join plan' : 'View plan',
      planId: other[0].planId,
      kind: 'other-showtime',
    };
  }
  const saved = (Array.isArray(input?.savedFriends) ? input.savedFriends : []).filter(
    (friend) => friend?.userId && !members.has(friend.userId),
  );
  if (saved.length === 0) return null;
  const names = saved.map((friend) => friendGivenName(friend.displayName));
  const nameText = formatFriendNameOverflow(names, 2);
  return {
    text: `${nameText} saved this movie`,
    actionLabel: names.length === 1 ? `Invite ${names[0]}` : 'Invite them',
    planId: null,
    kind: 'saved',
    suggestUserIds: saved.map((friend) => friend.userId),
  };
}

/**
 * Invite picker suggestions. Does not include Not Interested, Seen-only,
 * or people already on the plan.
 *
 * @param {{
 *   friends?: Array<{ userId: string, displayName?: string | null }>,
 *   savedUserIds?: string[],
 *   notInterestedUserIds?: string[],
 *   seenUserIds?: string[],
 *   signals?: Array<ReturnType<typeof normalizeFriendPlanSignal>>,
 *   memberUserIds?: string[],
 * }} input
 */
export function buildInviteSuggestions(input) {
  const friends = Array.isArray(input?.friends) ? input.friends : [];
  const members = new Set(input?.memberUserIds || []);
  const notInterested = new Set(input?.notInterestedUserIds || []);
  const seen = new Set(input?.seenUserIds || []);
  const saved = new Set(input?.savedUserIds || []);
  const interested = new Set(
    (Array.isArray(input?.signals) ? input.signals : [])
      .filter(
        (row) =>
          row &&
          !members.has(row.friendId) &&
          (row.response === 'interested' || row.response === 'maybe' || row.response === 'going'),
      )
      .map((row) => row.friendId),
  );

  /** @type {Array<{ userId: string, displayName: string | null, reason: string }>} */
  const suggested = [];
  for (const friend of friends) {
    if (!friend?.userId || members.has(friend.userId)) continue;
    if (notInterested.has(friend.userId)) continue;
    if (saved.has(friend.userId)) {
      suggested.push({
        userId: friend.userId,
        displayName: friend.displayName ?? null,
        reason: 'Saved this movie',
      });
      continue;
    }
    if (interested.has(friend.userId)) {
      suggested.push({
        userId: friend.userId,
        displayName: friend.displayName ?? null,
        reason: 'Interested in this film',
      });
    } else if (seen.has(friend.userId)) {
      continue;
    }
  }
  return suggested;
}

/**
 * @param {NonNullable<ReturnType<typeof normalizeFriendPlanSignal>>} row
 */
function participantFromSignal(row) {
  if (!row?.friendId) return null;
  return {
    userId: row.friendId,
    displayName: row.friendName ?? null,
    avatarUrl: row.avatarUrl ?? null,
  };
}

/**
 * Friend Detail plan cards. One row per plan, nearest screening.
 * Scoped to friend plan signals the viewer can already see — not open invites
 * from the Friends list and not the viewer's unrelated Planner plans.
 *
 * @param {Array<ReturnType<typeof normalizeFriendPlanSignal>>} signals
 */
export function buildFriendPlanCards(signals) {
  /** @type {Map<string, { row: NonNullable<ReturnType<typeof normalizeFriendPlanSignal>>, titles: string[], participants: Array<{ userId: string, displayName: string | null, avatarUrl: string | null }> }>} */
  const byPlan = new Map();
  for (const row of Array.isArray(signals) ? signals : []) {
    if (!row || !responseCountsAsAttendance(row.response, row.planType)) continue;
    const person = participantFromSignal(row);
    const existing = byPlan.get(row.planId);
    if (!existing) {
      byPlan.set(row.planId, {
        row,
        titles: row.title ? [row.title] : [],
        participants: person ? [person] : [],
      });
      continue;
    }
    if (row.title && !existing.titles.includes(row.title)) existing.titles.push(row.title);
    if (person && !existing.participants.some((p) => p.userId === person.userId)) {
      existing.participants.push(person);
    }
    const existingKey = `${existing.row.localDate || ''} ${existing.row.localTime || ''}`;
    const nextKey = `${row.localDate || ''} ${row.localTime || ''}`;
    if (nextKey < existingKey) existing.row = row;
  }
  return [...byPlan.values()]
    .sort((a, b) =>
      `${a.row.localDate || ''} ${a.row.localTime || ''}`.localeCompare(
        `${b.row.localDate || ''} ${b.row.localTime || ''}`,
      ),
    )
    .slice(0, 6)
    .map(({ row, titles, participants }) => {
      const timeLabel = row.localTime
        ? formatDisplayClock(row.localTime, '12h')
        : '';
      return {
        planId: row.planId,
        title: titles.length > 1 ? titles.join(' / ') : titles[0] || row.title || 'Shared plan',
        when: [formatSharedPlanDateLabel(row.localDate), timeLabel]
          .filter(Boolean)
          .join(' · '),
        localDate: row.localDate,
        localTime: row.localTime,
        theaterName: row.theaterName,
        filmKey: row.filmKey,
        filmId: row.filmId,
        response: row.response,
        responseLabel:
          row.response === 'going'
            ? 'Going'
            : row.response === 'maybe'
              ? 'Maybe'
              : 'Interested',
        actionLabel: row.viewerCanJoin ? 'Join plan' : 'View plan',
        viewerOnPlan: row.viewerCanJoin !== true,
        participants,
      };
    });
}
