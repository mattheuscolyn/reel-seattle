/**
 * Profile hub — live identity + activity (T-ACCOUNT-PROFILE-DATA-01).
 *
 * Identity from auth / public.profiles. Activity counts from local stores.
 * Membership fixture removed until a real source exists.
 */

import { useEffect, useId, useState } from 'react';
import {
  IconBell,
  IconBookmark,
  IconCalendar,
  IconChevron,
  IconEye,
  IconHeart,
  IconInfo,
  IconLink,
  IconLock,
  IconPerson,
  IconShield,
  IconStar,
  IconStarFill,
  IconSun,
} from '../icons.jsx';
import TmdbAttribution from '../enrichment/TmdbAttribution.jsx';
import ProfileAccountPanel from '../auth/ProfileAccountPanel.jsx';
import { useAuth } from '../auth/useAuth.js';
import {
  refreshOwnProfile,
  updateOwnDisplayName,
} from '../auth/profileData.js';
import {
  PROFILE_DISPLAY_NAME_MAX_LENGTH,
} from '../auth/profileIdentity.js';
import { subscribeProfileActivity } from './profileActivity.js';
import { resolveLiveProfilePresentation } from './resolveLiveProfilePresentation.js';

const ACTIVITY_ICONS = {
  eye: IconEye,
  heart: IconHeart,
  bookmark: IconBookmark,
  calendar: IconCalendar,
};

const SETTINGS_ICONS = {
  bell: IconBell,
  accessibility: IconPerson,
  sun: IconSun,
  lock: IconLock,
  shield: IconShield,
  link: IconLink,
  info: IconInfo,
};

/**
 * @param {{
 *   onStubAction?: (actionId: string, label: string) => void,
 * }} [props]
 */
export default function ProfileDestination({ onStubAction }) {
  const auth = useAuth();
  const stubStatusId = useId();
  const [activityTick, setActivityTick] = useState(0);
  const [stubMessage, setStubMessage] = useState(null);
  const [showDataSources, setShowDataSources] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(null);
  const [profileRetryMessage, setProfileRetryMessage] = useState(null);

  useEffect(() => {
    return subscribeProfileActivity(() => {
      setActivityTick((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (auth.status !== 'signed_in') {
      setEditing(false);
      setEditError(null);
      setProfileRetryMessage(null);
    }
  }, [auth.status, auth.user?.id]);

  // activityTick forces re-read of local stores after mutations
  void activityTick;

  const presentation = resolveLiveProfilePresentation({ auth });
  const {
    identity,
    activity,
    nextPlan,
    membership,
    favoriteTheaters,
    favoriteTheatersSection,
    settingsRows,
    settingsSectionTitle,
    pageTitle,
    pageTagline,
  } = presentation;

  const announceStub = (actionId, label) => {
    if (actionId === 'settings-about' || actionId === 'settings-privacy') {
      setShowDataSources(true);
      setStubMessage(null);
      return;
    }
    if (actionId === 'settings-account') {
      const el = document.querySelector('[data-profile-section="account"]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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

  const showFavorites = favoriteTheaters.length > 0;
  const showUpNext = Boolean(nextPlan?.available);
  const showMembership = Boolean(membership?.available);

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
        onAuthAction={(actionId) => onStubAction?.(actionId, actionId)}
      />

      <section
        className="v2-profile-section"
        data-profile-section="activity"
        aria-labelledby="v2-profile-activity-h"
      >
        <h2 id="v2-profile-activity-h" className="v2-profile-section-label">
          Activity snapshot
        </h2>
        <ul className="v2-profile-activity">
          {activity.map((item) => {
            const Icon = ACTIVITY_ICONS[item.icon] ?? IconEye;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  className={`v2-profile-activity-card v2-profile-activity-${item.tone}`}
                  onClick={() =>
                    announceStub(`activity-${item.key}`, item.label)
                  }
                >
                  <span className="v2-profile-activity-icon" aria-hidden="true">
                    <Icon width={16} height={16} />
                  </span>
                  <span className="v2-profile-activity-label">{item.label}</span>
                  <span className="v2-profile-activity-value">{item.value}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {showUpNext ? (
        <section
          className="v2-profile-section"
          data-profile-section="upNext"
          aria-labelledby="v2-profile-upnext-h"
        >
          <div className="v2-profile-section-row">
            <h2 id="v2-profile-upnext-h" className="v2-profile-section-label">
              {nextPlan.sectionTitle}
            </h2>
            <button
              type="button"
              className="v2-profile-link"
              onClick={() =>
                announceStub('view-all-plans', nextPlan.viewAllLabel)
              }
            >
              {nextPlan.viewAllLabel} <span aria-hidden="true">›</span>
            </button>
          </div>
          <button
            type="button"
            className="v2-profile-plan-card"
            onClick={() => announceStub('next-plan', nextPlan.title)}
          >
            {nextPlan.posterUrl ? (
              <img
                className="v2-profile-plan-poster"
                src={nextPlan.posterUrl}
                alt=""
              />
            ) : (
              <div
                className="v2-profile-plan-poster v2-profile-plan-poster-empty"
                aria-hidden="true"
              />
            )}
            <div className="v2-profile-plan-copy">
              <p className="v2-profile-plan-title">{nextPlan.title}</p>
              <p className="v2-profile-plan-when">{nextPlan.whenLabel}</p>
              <p className="v2-profile-plan-theater">{nextPlan.theaterName}</p>
              {nextPlan.moreFilmsLabel ? (
                <p className="v2-profile-plan-more">{nextPlan.moreFilmsLabel}</p>
              ) : null}
            </div>
            <div className="v2-profile-plan-date" aria-hidden="true">
              <span>{nextPlan.dateStack.weekday}</span>
              <span>{nextPlan.dateStack.monthDay}</span>
            </div>
            <span className="v2-profile-plan-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        </section>
      ) : null}

      {showMembership ? (
        <section
          className="v2-profile-section"
          data-profile-section="membership"
          aria-labelledby="v2-profile-membership-h"
        >
          <h2 id="v2-profile-membership-h" className="v2-profile-section-label">
            {membership.sectionTitle}
          </h2>
          <div className="v2-profile-membership-card">
            <img
              className="v2-profile-membership-logo"
              src={membership.logoUrl}
              alt=""
            />
            <div className="v2-profile-membership-copy">
              <p className="v2-profile-membership-name">{membership.name}</p>
              <p className="v2-profile-membership-renew">
                {membership.renewLabel}
              </p>
              <p className="v2-profile-membership-usage">
                {membership.usageLabel}
              </p>
            </div>
            <button
              type="button"
              className="v2-profile-link"
              onClick={() =>
                announceStub('manage-membership', membership.manageLabel)
              }
            >
              {membership.manageLabel} <span aria-hidden="true">›</span>
            </button>
          </div>
        </section>
      ) : null}

      {showFavorites ? (
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
              onClick={() =>
                announceStub(
                  'view-all-theaters',
                  favoriteTheatersSection.viewAllLabel,
                )
              }
            >
              {favoriteTheatersSection.viewAllLabel}{' '}
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <ul className="v2-profile-theaters">
            {favoriteTheaters.map((theater) => (
              <li key={theater.id}>
                <button
                  type="button"
                  className="v2-profile-theater-card"
                  onClick={() =>
                    announceStub(`theater-${theater.id}`, theater.name)
                  }
                >
                  <span className="v2-profile-theater-media">
                    {theater.imageUrl ? (
                      <img src={theater.imageUrl} alt="" />
                    ) : (
                      <span className="v2-profile-theater-fallback" aria-hidden="true" />
                    )}
                    <span
                      className={
                        theater.favorited
                          ? 'v2-profile-theater-star v2-profile-theater-star-on'
                          : 'v2-profile-theater-star'
                      }
                      aria-hidden="true"
                    >
                      {theater.favorited ? <IconStarFill /> : <IconStar />}
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
        </section>
      ) : null}

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
      </section>

      {showDataSources ? (
        <section
          className="v2-profile-section v2-profile-data-sources"
          data-profile-section="dataSources"
          aria-labelledby="v2-profile-data-sources-h"
        >
          <div className="v2-profile-section-row">
            <h2
              id="v2-profile-data-sources-h"
              className="v2-profile-section-label"
            >
              About &amp; data sources
            </h2>
            <button
              type="button"
              className="v2-profile-link"
              onClick={() => setShowDataSources(false)}
            >
              Close <span aria-hidden="true">›</span>
            </button>
          </div>
          <TmdbAttribution />
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
