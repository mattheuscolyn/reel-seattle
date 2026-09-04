/**
 * Profile hub — identity, Your Films, favorites, settings (Slice 1).
 */

import { useEffect, useId, useState } from 'react';
import {
  IconBell,
  IconBookmark,
  IconCalendar,
  IconCheckCircle,
  IconChevron,
  IconClock,
  IconCloseCircle,
  IconInfo,
  IconLock,
  IconPerson,
  IconShield,
  IconStarFill,
} from '../icons.jsx';
import ProfileAccountPanel from '../auth/ProfileAccountPanel.jsx';
import { useAuth } from '../auth/useAuth.js';
import {
  refreshOwnProfile,
  updateOwnDisplayName,
} from '../auth/profileData.js';
import {
  signInWithGoogle,
} from '../auth/authSessionStore.js';
import {
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
} from '../auth/profileIdentity.js';
import { subscribeProfileActivity } from './profileActivity.js';
import { resolveLiveProfilePresentation } from './resolveLiveProfilePresentation.js';
import { profileIsAdmin } from '../admin/tmdbReview/sourceIdentity.js';
import { COLLECTION_IDS } from '../explore/exploreIds.js';
import { subscribeFavoriteTheaters } from '../stores/favoriteTheatersStore.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

const FILM_ICONS = {
  bookmark: IconBookmark,
  eye: IconCheckCircle,
  close: IconCloseCircle,
};

const SETTINGS_ICONS = {
  bell: IconBell,
  clock: IconClock,
  lock: IconLock,
  shield: IconShield,
  calendar: IconCalendar,
  info: IconInfo,
};

/**
 * @param {{
 *   onStubAction?: (actionId: string, label: string) => void,
 *   onOpenAdminTmdbReview?: () => void,
 *   onOpenCollection?: (payload: object) => void,
 *   onOpenTheaterDetail?: (payload: object) => void,
 * }} [props]
 */
export default function ProfileDestination({
  onStubAction,
  onOpenAdminTmdbReview,
  onOpenCollection,
  onOpenTheaterDetail,
}) {
  const auth = useAuth();
  const stubStatusId = useId();
  const storage = getBrowserStorage();
  const [activityTick, setActivityTick] = useState(0);
  const [stubMessage, setStubMessage] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(null);
  const [profileRetryMessage, setProfileRetryMessage] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signInBusy, setSignInBusy] = useState(false);

  useEffect(() => {
    const unsubActivity = subscribeProfileActivity(() => {
      setActivityTick((n) => n + 1);
    });
    const unsubFavorites = subscribeFavoriteTheaters(() => {
      setActivityTick((n) => n + 1);
    });
    return () => {
      unsubActivity();
      unsubFavorites();
    };
  }, []);

  useEffect(() => {
    if (auth.status !== 'signed_in') {
      setEditing(false);
      setEditError(null);
      setProfileRetryMessage(null);
    }
  }, [auth.status, auth.user?.id]);

  void activityTick;

  const presentation = resolveLiveProfilePresentation({ auth, storage });
  const {
    identity,
    yourFilms,
    yourFilmsSection,
    favoriteTheaters,
    favoriteTheatersSection,
    settingsRows,
    settingsSectionTitle,
    pageTitle,
    pageTagline,
  } = presentation;

  const openProfileCollection = (collectionId) => {
    onOpenCollection?.({
      collectionId,
      originPrimary: 'profile',
    });
  };

  const announceStub = (actionId, label) => {
    if (actionId === 'settings-account') {
      setAccountOpen((open) => !open);
      setStubMessage(null);
      return;
    }
    const message = `${label} isn’t available yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

  const openEdit = () => {
    const current =
      typeof auth.profile?.display_name === 'string'
        ? auth.profile.display_name
        : '';
    setEditValue(current);
    setEditError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (editBusy) return;
    setEditBusy(true);
    setEditError(null);
    const result = await updateOwnDisplayName(editValue);
    setEditBusy(false);
    if (!result.ok) {
      if (result.reason === 'user_switched') return;
      setEditError(result.message ?? 'Could not save your display name.');
      return;
    }
    setEditing(false);
  };

  const retryProfile = async () => {
    setProfileRetryMessage(null);
    const result = await refreshOwnProfile({ recoverMissing: true });
    if (!result.ok && result.reason !== 'stale' && result.reason !== 'signed_out') {
      setProfileRetryMessage(
        result.message ?? 'Could not refresh your profile.',
      );
    }
  };

  const handleIdentitySignIn = async () => {
    if (signInBusy) return;
    setSignInBusy(true);
    await signInWithGoogle();
    setSignInBusy(false);
  };

  return (
    <section
      className="v2-profile"
      aria-labelledby="v2-profile-title"
      data-profile-source={presentation.source}
      data-profile-identity={identity.mode}
    >
      <header className="v2-profile-page-header">
        <h1 id="v2-profile-title" className="v2-profile-title">
          {pageTitle}
        </h1>
        <p className="v2-profile-tagline">{pageTagline}</p>
      </header>

      <div className="v2-profile-identity" data-profile-section="identity">
        {identity.mode === 'loading' ? (
          <div
            className="v2-profile-identity-skeleton"
            aria-busy="true"
            aria-label="Loading profile"
          >
            <div className="v2-profile-avatar v2-profile-avatar-skeleton" />
            <div className="v2-profile-identity-copy">
              <p className="v2-profile-name">Profile</p>
              <p className="v2-profile-location">Checking account…</p>
            </div>
          </div>
        ) : (
          <>
            <div className="v2-profile-avatar" aria-hidden="true">
              {identity.avatarUrl ? (
                <img
                  className="v2-profile-avatar-img"
                  src={identity.avatarUrl}
                  alt=""
                />
              ) : identity.initials ? (
                <span className="v2-profile-avatar-letter">
                  {identity.initials}
                </span>
              ) : (
                <span className="v2-profile-avatar-letter" data-generic="">
                  <IconPerson width={22} height={22} />
                </span>
              )}
            </div>
            <div className="v2-profile-identity-copy">
              <p className="v2-profile-name">
                {identity.displayName ?? 'Profile'}
              </p>
              {identity.secondaryLabel ? (
                <p className="v2-profile-location">{identity.secondaryLabel}</p>
              ) : null}
              {identity.supportingCopy ? (
                <p className="v2-profile-identity-support">
                  {identity.supportingCopy}
                </p>
              ) : null}
              {identity.showEdit && !editing ? (
                <button
                  type="button"
                  className="v2-profile-link"
                  onClick={openEdit}
                >
                  {identity.editLabel} <span aria-hidden="true">›</span>
                </button>
              ) : null}
              {identity.showSignIn ? (
                <button
                  type="button"
                  className="v2-profile-account-btn v2-profile-identity-signin"
                  disabled={signInBusy}
                  aria-busy={signInBusy ? 'true' : undefined}
                  onClick={() => void handleIdentitySignIn()}
                >
                  {signInBusy ? 'Signing in…' : identity.signInLabel}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {editing ? (
        <div
          className="v2-profile-edit"
          data-profile-section="edit-display-name"
        >
          <label className="v2-profile-edit-label" htmlFor="v2-profile-display-name">
            Display name
          </label>
          <input
            id="v2-profile-display-name"
            className="v2-profile-edit-input"
            type="text"
            value={editValue}
            maxLength={PROFILE_DISPLAY_NAME_MAX_LENGTH}
            autoComplete="nickname"
            disabled={editBusy}
            onChange={(e) => setEditValue(e.target.value)}
          />
          <p className="v2-profile-edit-hint">
            Leave blank to use your Google name. Not a unique username.
          </p>
          {editError ? (
            <p className="v2-profile-edit-error" role="alert">
              {editError}
            </p>
          ) : null}
          <div className="v2-profile-edit-actions">
            <button
              type="button"
              className="v2-profile-account-btn"
              disabled={editBusy}
              onClick={saveEdit}
            >
              {editBusy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="v2-profile-account-btn v2-profile-account-btn-secondary"
              disabled={editBusy}
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {auth.status === 'signed_in' && auth.profileStatus === 'error' ? (
        <p className="v2-profile-profile-error" role="status">
          {profileRetryMessage ??
            'Could not load your Reel Seattle profile. Account details still work.'}{' '}
          <button
            type="button"
            className="v2-profile-link"
            onClick={retryProfile}
          >
            Retry
          </button>
        </p>
      ) : null}

      <ProfileAccountPanel
        variant="sync-attention"
        onAuthAction={(actionId) => onStubAction?.(actionId, actionId)}
      />

      <section
        className="v2-profile-section"
        data-profile-section="yourFilms"
        aria-labelledby="v2-profile-films-h"
      >
        <div className="v2-profile-section-row">
          <h2 id="v2-profile-films-h" className="v2-profile-section-label">
            {yourFilmsSection.title}
          </h2>
          <button
            type="button"
            className="v2-profile-link"
            onClick={() => openProfileCollection(COLLECTION_IDS.saved)}
          >
            {yourFilmsSection.viewAllLabel} <span aria-hidden="true">›</span>
          </button>
        </div>
        <ul className="v2-profile-films">
          {yourFilms.map((item) => {
            const Icon = FILM_ICONS[item.icon] ?? IconBookmark;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className="v2-profile-films-card"
                  onClick={() => openProfileCollection(item.collectionId)}
                >
                  <span className="v2-profile-films-icon" aria-hidden="true">
                    <Icon width={16} height={16} />
                  </span>
                  <span className="v2-profile-films-label">{item.label}</span>
                  <span className="v2-profile-films-value">{item.value}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="v2-profile-section"
        data-profile-section="favoriteTheaters"
        aria-labelledby="v2-profile-fav-h"
      >
        <div className="v2-profile-section-row">
          <h2 id="v2-profile-fav-h" className="v2-profile-section-label">
            {favoriteTheatersSection.title}
          </h2>
          <button
            type="button"
            className="v2-profile-link"
            onClick={() => openProfileCollection(COLLECTION_IDS.theaters)}
          >
            {favoriteTheatersSection.viewAllLabel}{' '}
            <span aria-hidden="true">›</span>
          </button>
        </div>
        {favoriteTheaters.length > 0 ? (
          <ul className="v2-profile-theaters">
            {favoriteTheaters.map((theater) => (
              <li key={theater.id}>
                <button
                  type="button"
                  className="v2-profile-theater-card"
                  onClick={() =>
                    onOpenTheaterDetail?.({
                      theaterId: theater.id,
                      originPrimary: 'profile',
                    })
                  }
                >
                  <span className="v2-profile-theater-media">
                    {theater.imageUrl ? (
                      <img src={theater.imageUrl} alt="" />
                    ) : (
                      <span className="v2-profile-theater-fallback" aria-hidden="true" />
                    )}
                    <span
                      className="v2-profile-theater-star v2-profile-theater-star-on"
                      aria-hidden="true"
                    >
                      <IconStarFill />
                    </span>
                  </span>
                  <span className="v2-profile-theater-name">{theater.name}</span>
                  {theater.locationLabel ? (
                    <span className="v2-profile-theater-loc">
                      {theater.locationLabel}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="v2-profile-theaters-empty">
            <p className="v2-profile-theaters-empty-copy">
              {favoriteTheatersSection.emptyTitle}
            </p>
            <button
              type="button"
              className="v2-profile-account-btn"
              onClick={() => openProfileCollection(COLLECTION_IDS.theaters)}
            >
              {favoriteTheatersSection.emptyActionLabel}
            </button>
          </div>
        )}
      </section>

      <section
        className="v2-profile-section"
        data-profile-section="settings"
        aria-labelledby="v2-profile-settings-h"
      >
        <h2 id="v2-profile-settings-h" className="v2-profile-section-label">
          {settingsSectionTitle}
        </h2>
        <ul className="v2-profile-settings">
          {settingsRows.map((row) => {
            const Icon = SETTINGS_ICONS[row.icon] ?? IconInfo;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="v2-profile-settings-row"
                  onClick={() => announceStub(`settings-${row.id}`, row.label)}
                >
                  <span className="v2-profile-settings-icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="v2-profile-settings-label">{row.label}</span>
                  <span aria-hidden="true">
                    <IconChevron />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {accountOpen ? (
          <div data-profile-section="account">
            <ProfileAccountPanel
              variant="account-security"
              onAuthAction={(actionId) => onStubAction?.(actionId, actionId)}
            />
          </div>
        ) : null}
      </section>

      {auth.signedIn && profileIsAdmin(auth.profile) ? (
        <section
          className="v2-profile-section v2-profile-admin"
          data-profile-section="admin"
          aria-labelledby="v2-profile-admin-h"
        >
          <h2 id="v2-profile-admin-h" className="v2-profile-section-label">
            Admin
          </h2>
          <button
            type="button"
            className="v2-profile-link"
            onClick={() => onOpenAdminTmdbReview?.()}
          >
            TMDB Match Review
          </button>
        </section>
      ) : null}

      <p
        id={stubStatusId}
        className="v2-visually-hidden"
        role="status"
        aria-live="polite"
      >
        {stubMessage ?? ''}
      </p>
    </section>
  );
}
