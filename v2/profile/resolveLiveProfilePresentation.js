/**
 * Live Profile presentation.
 * Identity from auth + profiles; Your Films / favorites from local stores.
 */

import {
  initialsFromDisplayName,
  resolveProfileAvatarUrl,
  resolveProfileDisplayName,
} from '../auth/profileIdentity.js';
import {
  buildYourFilmsItems,
  getProfileFavoriteTheaters,
} from './profileActivity.js';
import {
  PROFILE_SETTINGS_ROWS,
  PROFILE_SETTINGS_SECTION_TITLE,
} from './profileSettingsRows.js';

function emptyIdentity(mode) {
  return {
    mode,
    displayName: null,
    initials: null,
    avatarUrl: null,
    email: null,
    secondaryLabel: null,
    supportingCopy: null,
    editLabel: null,
    showEdit: false,
    showSignIn: false,
  };
}

function sharedSections(storage) {
  return {
    yourFilms: buildYourFilmsItems(storage),
    yourFilmsSection: {
      title: 'Your Films',
      viewAllLabel: 'View all',
    },
    favoriteTheaters: getProfileFavoriteTheaters(storage),
    favoriteTheatersSection: {
      title: 'Favorite Theaters',
      viewAllLabel: 'View all',
      emptyTitle: 'No favorite theaters yet',
      emptyActionLabel: 'Find theaters',
    },
    settingsRows: PROFILE_SETTINGS_ROWS,
    settingsSectionTitle: PROFILE_SETTINGS_SECTION_TITLE,
  };
}

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
  const sections = sharedSections(storage);

  if (status === 'loading' || status === 'unconfigured') {
    return {
      source: 'live',
      pageTitle: 'Profile',
      pageTagline: 'Your moviegoing, your way.',
      identity: {
        ...emptyIdentity(status === 'loading' ? 'loading' : 'unconfigured'),
        displayName: status === 'unconfigured' ? 'Profile' : null,
        secondaryLabel:
          status === 'unconfigured'
            ? 'Account sign-in is not configured in this build.'
            : null,
        supportingCopy:
          status === 'unconfigured'
            ? 'Reel Seattle still works on this device without an account.'
            : null,
        showSignIn: false,
      },
      ...sections,
      profileStatus,
    };
  }

  if (!signedIn || !user) {
    const reconnect = status === 'error';
    return {
      source: 'live',
      pageTitle: 'Profile',
      pageTagline: 'Your moviegoing, your way.',
      identity: {
        mode: reconnect ? 'error' : 'signed_out',
        displayName: 'Profile',
        initials: null,
        avatarUrl: null,
        email: null,
        secondaryLabel: reconnect
          ? 'Account sign-in is temporarily unavailable.'
          : 'Sign in to sync your Reel Seattle activity',
        supportingCopy: reconnect
          ? 'Your Saved films, Seen list, and plans on this device are unaffected.'
          : 'Signing in alone does not move your data. Saved, Seen, Not Interested, and Planner stay on this device until you enable sync.',
        editLabel: null,
        showEdit: false,
        showSignIn: true,
        signInLabel: 'Continue with Google',
      },
      ...sections,
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
      supportingCopy: null,
      editLabel: 'Edit profile',
      showEdit: true,
      showSignIn: false,
      profileDisplayName:
        profile && typeof profile.display_name === 'string'
          ? profile.display_name
          : null,
    },
    ...sections,
    profileStatus,
  };
}
