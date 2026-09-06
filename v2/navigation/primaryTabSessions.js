/**
 * In-memory per-primary-tab navigation sessions for the v2 shell.
 *
 * Tab switch = suspend current tab + resume target tab.
 * Explicit root opens still wipe a tab via openPrimaryTabRoot /
 * selectPrimaryDestination — they do not silently resume.
 */

import {
  PRIMARY_DESTINATIONS,
  resolveActivePrimaryId,
  resolveDestinationId,
} from '../destinations.js';
import { selectPrimaryDestination } from './navState.js';

export const PRIMARY_TAB_IDS = Object.freeze(
  PRIMARY_DESTINATIONS.map((destination) => destination.id),
);

/**
 * @typedef {{
 *   primaryDestinationId: string,
 *   surface: object | null,
 *   plannerSeed: object | null,
 * }} PrimaryTabSession
 */

/**
 * @returns {Record<string, PrimaryTabSession | null>}
 */
export function createEmptyTabSessions() {
  /** @type {Record<string, PrimaryTabSession | null>} */
  const sessions = {};
  for (const id of PRIMARY_TAB_IDS) {
    sessions[id] = null;
  }
  return sessions;
}

/**
 * Owning primary tab for the live nav stack (origin-aware).
 * Distinct from Film Detail chrome that may highlight Explore.
 *
 * @param {{
 *   primaryDestinationId?: string,
 *   surface?: { type?: string, originPrimary?: string } | null,
 * }} nav
 */
export function resolveOwningPrimaryTab(nav) {
  return resolveActivePrimaryId(nav);
}

/**
 * @param {object} value
 * @returns {object}
 */
function cloneJson(value) {
  if (value == null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Snapshot the resumable nav slice for a primary tab.
 * @param {object} nav
 * @returns {PrimaryTabSession}
 */
export function captureTabSession(nav) {
  const primaryDestinationId = resolveDestinationId(nav?.primaryDestinationId);
  return {
    primaryDestinationId,
    surface: nav?.surface == null ? null : cloneJson(nav.surface),
    plannerSeed: nav?.plannerSeed == null ? null : cloneJson(nav.plannerSeed),
  };
}

/**
 * @param {PrimaryTabSession | null | undefined} session
 * @param {string} fallbackPrimaryId
 */
export function navFromTabSession(session, fallbackPrimaryId) {
  const primaryDestinationId = resolveDestinationId(
    session?.primaryDestinationId ?? fallbackPrimaryId,
  );
  if (!session) {
    return {
      primaryDestinationId,
      surface: null,
      plannerSeed: null,
    };
  }
  return {
    primaryDestinationId,
    surface: session.surface == null ? null : cloneJson(session.surface),
    plannerSeed:
      session.plannerSeed == null ? null : cloneJson(session.plannerSeed),
  };
}

/**
 * Suspend the current owning tab and resume the target tab's last session.
 * Caller should no-op before calling when the chrome-active tab is re-tapped.
 *
 * @param {object} nav
 * @param {Record<string, PrimaryTabSession | null>} sessions
 * @param {string} destinationId
 * @returns {{ nav: object, sessions: Record<string, PrimaryTabSession | null> }}
 */
export function switchPrimaryTab(nav, sessions, destinationId) {
  const targetId = resolveDestinationId(destinationId);
  const owningId = resolveOwningPrimaryTab(nav);
  const nextSessions = { ...createEmptyTabSessions(), ...sessions };

  nextSessions[owningId] = captureTabSession(nav);

  const resumed = nextSessions[targetId];
  return {
    nav: navFromTabSession(resumed, targetId),
    sessions: nextSessions,
  };
}

/**
 * Explicit fresh/root navigation into a primary tab.
 * Suspends the previous owning tab (when different), clears the target
 * tab's suspended session, and lands on that tab's root.
 *
 * @param {object} nav
 * @param {Record<string, PrimaryTabSession | null>} sessions
 * @param {string} destinationId
 * @returns {{ nav: object, sessions: Record<string, PrimaryTabSession | null> }}
 */
export function openPrimaryTabRoot(nav, sessions, destinationId) {
  const targetId = resolveDestinationId(destinationId);
  const owningId = resolveOwningPrimaryTab(nav);
  const nextSessions = { ...createEmptyTabSessions(), ...sessions };

  if (owningId !== targetId) {
    nextSessions[owningId] = captureTabSession(nav);
  }
  nextSessions[targetId] = null;

  return {
    nav: selectPrimaryDestination(nav, targetId),
    sessions: nextSessions,
  };
}

/**
 * Surfaces that should not resume after sign-out / account switch.
 * @param {string | null | undefined} surfaceType
 */
export function isAuthSensitiveSurfaceType(surfaceType) {
  return (
    surfaceType === 'profile-friends' ||
    surfaceType === 'profile-settings' ||
    surfaceType === 'friend-invite-landing' ||
    surfaceType === 'admin-tmdb-review'
  );
}

/**
 * @param {PrimaryTabSession | null} session
 * @returns {PrimaryTabSession | null}
 */
function sanitizeSessionForSignedOut(session) {
  if (!session) return null;
  if (isAuthSensitiveSurfaceType(session.surface?.type)) {
    return {
      primaryDestinationId: 'profile',
      surface: null,
      plannerSeed: null,
    };
  }
  return session;
}

/**
 * Clear auth-sensitive resumable state after sign-out or account switch.
 *
 * @param {object} nav
 * @param {Record<string, PrimaryTabSession | null>} sessions
 * @returns {{ nav: object, sessions: Record<string, PrimaryTabSession | null>, changed: boolean }}
 */
export function clearAuthSensitiveTabState(nav, sessions) {
  const nextSessions = { ...createEmptyTabSessions(), ...sessions };
  let sessionsChanged = false;
  for (const id of PRIMARY_TAB_IDS) {
    const before = nextSessions[id];
    const after = sanitizeSessionForSignedOut(before);
    if (after !== before) {
      nextSessions[id] = after;
      sessionsChanged = true;
    }
  }

  let nextNav = nav;
  let navChanged = false;
  if (isAuthSensitiveSurfaceType(nav?.surface?.type)) {
    nextNav = selectPrimaryDestination(nav, 'profile');
    nextSessions.profile = null;
    navChanged = true;
  }

  return {
    nav: nextNav,
    sessions: nextSessions,
    changed: sessionsChanged || navChanged,
  };
}
