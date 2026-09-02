/**
 * Live Profile presentation (T-ACCOUNT-PROFILE-DATA-01).
 * Identity from auth + profiles; activity from local stores.
 * Fixture file remains available for historical mockup reference only.
 */

import {
  initialsFromDisplayName,
  resolveProfileAvatarUrl,
  resolveProfileDisplayName,
} from '../auth/profileIdentity.js';
import {
  buildProfileActivityItems,
  getProfileFavoriteTheaters,
  getProfileNextPlan,
} from './profileActivity.js';
import {
  PROFILE_SETTINGS_ROWS,
  PROFILE_SETTINGS_SECTION_TITLE,
} from './profileSettingsRows.js';

/**
 * @param {{
 *   auth?: {
 *     status?: string,
 *     user?: object | null,
 *     profile?: object | null,
 *     profileStatus?: string,
 *     signedIn?: boolean,
 *   } | null,
 *   storage?: Storage | null,
 *   now?: Date,
 * }} [options]
 */
export function resolveLiveProfilePresentation(options = {}) {
  const auth = options.auth ?? null;
  const storage = options.storage;
  const status = auth?.status ?? 'signed_out';
  const user = auth?.user ?? null;
  const profile = auth?.profile ?? null;
  const profileStatus = auth?.profileStatus ?? 'idle';
  const signedIn = Boolean(
    auth?.signedIn || (status === 'signed_in' && user),
  );

  const settingsRows = PROFILE_SETTINGS_ROWS;
  const settingsSectionTitle = PROFILE_SETTINGS_SECTION_TITLE;

  if (status === 'loading' || status === 'unconfigured') {
    return {
      source: 'live',
      pageTitle: 'Profile',
      pageTagline: 'Your moviegoing, your way.',
      identity: {
        mode: status === 'loading' ? 'loading' : 'unconfigured',
        displayName: null,
        initials: null,
        avatarUrl: null,
        email: null,
        secondaryLabel: null,
        editLabel: null,
        showEdit: false,
      },
      activity: buildProfileActivityItems(storage),
      nextPlan: buildNextPlanSection(storage, options.now),
      membership: { available: false, sectionTitle: 'Membership' },
      favoriteTheaters: getProfileFavoriteTheaters(storage),
      favoriteTheatersSection: {
        title: 'Favorite theaters',
        viewAllLabel: 'View all',
      },
      settingsRows,
      settingsSectionTitle,
      profileStatus,
    };
  }

  if (!signedIn || !user) {
    return {
      source: 'live',
      pageTitle: 'Profile',
      pageTagline: 'Your moviegoing, your way.',
      identity: {
        mode: 'signed_out',
        displayName: 'Profile',
        initials: null,
        avatarUrl: null,
        email: null,
        secondaryLabel: 'Sign in to sync your Reel Seattle activity',
        supportingCopy:
          'Saved films, Seen, Not Interested, and Planner stay on this device until you enable sync.',
        editLabel: null,
        showEdit: false,
      },
      activity: buildProfileActivityItems(storage),
      nextPlan: buildNextPlanSection(storage, options.now),
      membership: { available: false, sectionTitle: 'Membership' },
      favoriteTheaters: getProfileFavoriteTheaters(storage),
      favoriteTheatersSection: {
        title: 'Favorite theaters',
        viewAllLabel: 'View all',
      },
      settingsRows,
      settingsSectionTitle,
      profileStatus,
    };
  }

  const displayName = resolveProfileDisplayName(user, profile);
  const avatarUrl = resolveProfileAvatarUrl(profile, user);
  const email = typeof user.email === 'string' ? user.email.trim() : '';

  return {
    source: 'live',
    pageTitle: 'Profile',
    pageTagline: 'Your moviegoing, your way.',
    identity: {
      mode: 'signed_in',
      displayName,
      initials: initialsFromDisplayName(displayName),
      avatarUrl,
      email: email || null,
      secondaryLabel: email || null,
      editLabel: 'Edit profile',
      showEdit: true,
      profileDisplayName:
        profile && typeof profile.display_name === 'string'
          ? profile.display_name
          : null,
    },
    activity: buildProfileActivityItems(storage),
    nextPlan: buildNextPlanSection(storage, options.now),
    membership: { available: false, sectionTitle: 'Membership' },
    favoriteTheaters: getProfileFavoriteTheaters(storage),
    favoriteTheatersSection: {
      title: 'Favorite theaters',
      viewAllLabel: 'View all',
    },
    settingsRows,
    settingsSectionTitle,
    profileStatus,
  };
}

/**
 * @param {Storage | null | undefined} storage
 * @param {Date | undefined} now
 */
function buildNextPlanSection(storage, now) {
  const next = getProfileNextPlan(storage, { now });
  if (next) return next;
  return {
    available: false,
    sectionTitle: 'Up next',
    viewAllLabel: 'View all plans',
  };
}
