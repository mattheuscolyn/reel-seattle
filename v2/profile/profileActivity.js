/**
 * Real Profile activity counts from local authoritative stores.
 * (T-ACCOUNT-PROFILE-DATA-01) — no fixture values.
 */

import { getAcceptedPlans } from '../stores/acceptedPlansStore.js';
import { getFavoriteTheaters } from '../stores/favoriteTheatersStore.js';
import { getNotInterestedFilms } from '../stores/notInterestedFilmsStore.js';
import { getSavedFilms } from '../stores/savedFilmsStore.js';
import { getSeenFilms } from '../stores/seenFilmsStore.js';
import { subscribeFilmStoreMutations } from '../auth/filmStoreMutationBridge.js';
import { subscribeScheduleStoreMutations } from '../auth/scheduleStoreMutationBridge.js';

/**
 * @param {Storage | null | undefined} [storage]
 * @returns {{
 *   seen: number,
 *   notInterested: number,
 *   saved: number,
 *   plans: number,
 *   favoriteTheaters: number,
 * }}
 */
export function getProfileActivityCounts(storage) {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage;
  return {
    seen: getSeenFilms(store).length,
    notInterested: getNotInterestedFilms(store).length,
    saved: getSavedFilms(store).length,
    plans: getAcceptedPlans(store).length,
    favoriteTheaters: getFavoriteTheaters(store).length,
  };
}

/**
 * Activity snapshot cards for Profile UI.
 * @param {Storage | null | undefined} [storage]
 */
export function buildProfileActivityItems(storage) {
  const counts = getProfileActivityCounts(storage);
  return Object.freeze([
    Object.freeze({
      key: 'seen',
      label: 'Seen',
      value: counts.seen,
      tone: 'accent',
      icon: 'eye',
    }),
    Object.freeze({
      key: 'notInterested',
      label: 'Not interested',
      value: counts.notInterested,
      tone: 'danger',
      icon: 'heart',
    }),
    Object.freeze({
      key: 'saved',
      label: 'Saved',
      value: counts.saved,
      tone: 'accent',
      icon: 'bookmark',
    }),
    Object.freeze({
      key: 'plans',
      label: 'Plans',
      value: counts.plans,
      tone: 'success',
      icon: 'calendar',
    }),
  ]);
}

/**
 * Subscribe to film + schedule store mutations (and optional focus) for count refresh.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function subscribeProfileActivity(listener) {
  const unsubFilm = subscribeFilmStoreMutations(() => listener());
  const unsubSchedule = subscribeScheduleStoreMutations(() => listener());
  const onFocus = () => listener();
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
  }
  return () => {
    unsubFilm();
    unsubSchedule();
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    }
  };
}

/**
 * Real favorite theaters for Profile (empty → hide section in UI).
 * @param {Storage | null | undefined} [storage]
 */
export function getProfileFavoriteTheaters(storage) {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage;
  return getFavoriteTheaters(store).map((t) =>
    Object.freeze({
      id: t.theaterRef?.theaterId ?? t.theaterId,
      name: t.name || t.theaterRef?.theaterId || 'Theater',
      locationLabel: t.neighborhood || '',
      imageUrl: t.imageUrl || '',
      favorited: true,
    }),
  );
}

/**
 * Next upcoming accepted plan for Profile "Up next", or null.
 * @param {Storage | null | undefined} [storage]
 * @param {{ now?: Date }} [options]
 */
export function getProfileNextPlan(storage, options = {}) {
  const store =
    storage === undefined
      ? typeof localStorage !== 'undefined'
        ? localStorage
        : null
      : storage;
  const now = options.now instanceof Date ? options.now : new Date();
  const today = formatLocalIsoDate(now);
  const plans = getAcceptedPlans(store)
    .filter((p) => typeof p.date === 'string' && p.date >= today)
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      const aStart = a.performances?.[0]?.startsAt ?? '';
      const bStart = b.performances?.[0]?.startsAt ?? '';
      return aStart < bStart ? -1 : aStart > bStart ? 1 : 0;
    });

  const plan = plans[0];
  if (!plan) return null;

  const first = plan.performances?.[0] ?? null;
  const title = first?.title ?? 'Accepted plan';
  const theaterName = first?.theaterName ?? first?.theaterId ?? '';
  const whenLabel = formatPlanWhenLabel(plan, first);
  const moreCount = Math.max(0, (plan.performances?.length ?? 0) - 1);
  const dateStack = formatDateStack(plan.date);

  return Object.freeze({
    available: true,
    sectionTitle: 'Up next',
    viewAllLabel: 'View all plans',
    title,
    whenLabel,
    theaterName,
    moreFilmsLabel: moreCount > 0 ? `+ ${moreCount} more films` : '',
    dateStack,
    posterUrl: first?.posterUrl || '',
    planId: plan.planId,
  });
}

/**
 * @param {Date} date
 * @returns {string}
 */
function formatLocalIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {object} plan
 * @param {object | null} first
 */
function formatPlanWhenLabel(plan, first) {
  const dateLabel = formatFriendlyDate(plan.date);
  const time = first?.localTime ?? '';
  if (dateLabel && time) return `${dateLabel} · ${time}`;
  return dateLabel || time || '';
}

/**
 * @param {string} isoDate
 */
function formatFriendlyDate(isoDate) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) return isoDate;
  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * @param {string} isoDate
 */
function formatDateStack(isoDate) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!parts) {
    return Object.freeze({ weekday: '', monthDay: isoDate });
  }
  const date = new Date(
    Number(parts[1]),
    Number(parts[2]) - 1,
    Number(parts[3]),
  );
  return Object.freeze({
    weekday: date
      .toLocaleDateString('en-US', { weekday: 'short' })
      .toUpperCase(),
    monthDay: date
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      .toUpperCase(),
  });
}
