/**
 * Nested Profile Settings — one surface, section-specific content.
 */

import { useEffect, useState } from 'react';
import ProfileAccountPanel from '../../auth/ProfileAccountPanel.jsx';
import { signInWithGoogle } from '../../auth/authSessionStore.js';
import { useAuth } from '../../auth/useAuth.js';
import TmdbAttribution from '../../enrichment/TmdbAttribution.jsx';
import { SCHEDULE_SETTINGS_TIME_FORMATS } from '../../fixtures/scheduleSettingsMockupFixture.js';
import {
  getExperiencePreferences,
  subscribeExperiencePreferences,
  updateExperiencePreferences,
} from '../../stores/experiencePreferencesStore.js';
import {
  getScheduleSettings,
  subscribeScheduleSettings,
  updateScheduleSettings,
} from '../../stores/scheduleSettingsStore.js';
import {
  getVisibilityPreferences,
  subscribeVisibilityPreferences,
  updateVisibilityPreferences,
} from '../../stores/visibilityPreferencesStore.js';
import {
  getFriendActivityPrivacy,
  subscribeFriendActivityPrivacy,
} from '../../friends/friendActivityPrivacyStore.js';
import {
  pullShareFilmActivityPreference,
  setShareFilmActivityWithFriends,
} from '../../friends/friendFilmActivityApi.js';
import { PROFILE_SETTINGS_COPY } from './profileSettingsCopy.js';
import {
  PROFILE_SETTINGS_SECTION_IDS,
  resolveProfileSettingsSectionId,
} from './profileSettingsIds.js';

function getBrowserStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function SettingsCopyCard({ title, body }) {
  return (
    <div className="v2-settings-card">
      {title ? <h2 className="v2-settings-card-title">{title}</h2> : null}
      <p className="v2-settings-card-body">{body}</p>
    </div>
  );
}

function NotificationsSection() {
  const auth = useAuth();
  const [signInBusy, setSignInBusy] = useState(false);
  const signedIn = auth.status === 'signed_in' && Boolean(auth.user);
  const copy = PROFILE_SETTINGS_COPY.notifications;
  const body = signedIn
    ? copy.signedInBody
    : auth.status === 'unconfigured'
      ? copy.unconfiguredBody
      : copy.signedOutBody;

  const handleSignIn = async () => {
    if (signInBusy) return;
    setSignInBusy(true);
    await signInWithGoogle();
    setSignInBusy(false);
  };

  return (
    <div data-settings-panel="notifications">
      <SettingsCopyCard
        title={copy.savedTitle}
        body={body}
      />
      {!signedIn && auth.status !== 'unconfigured' && auth.status !== 'loading' ? (
        <button
          type="button"
          className="v2-profile-account-btn"
          disabled={signInBusy}
          aria-busy={signInBusy ? 'true' : undefined}
          onClick={() => void handleSignIn()}
        >
          {signInBusy ? 'Signing in…' : copy.signInLabel}
        </button>
      ) : null}
    </div>
  );
}

function PreferencesSection() {
  const storage = getBrowserStorage();
  const [timeFormatId, setTimeFormatId] = useState(
    () => getScheduleSettings(storage).timeFormatId,
  );
  const [experience, setExperience] = useState(() =>
    getExperiencePreferences(storage),
  );
  const [visibility, setVisibility] = useState(() =>
    getVisibilityPreferences(storage),
  );

  useEffect(() => {
    const unsubTime = subscribeScheduleSettings(() => {
      setTimeFormatId(getScheduleSettings(storage).timeFormatId);
    });
    const unsubExp = subscribeExperiencePreferences(() => {
      setExperience(getExperiencePreferences(storage));
    });
    const unsubVis = subscribeVisibilityPreferences(() => {
      setVisibility(getVisibilityPreferences(storage));
    });
    return () => {
      unsubTime();
      unsubExp();
      unsubVis();
    };
  }, [storage]);

  const captionsOn = experience.captionsPreference === 'prefer_open_caption';
  const adOn =
    experience.audioDescriptionPreference === 'prefer_audio_description';
  const copy = PROFILE_SETTINGS_COPY.preferences;

  return (
    <div data-settings-panel="preferences">
      <div className="v2-settings-group">
        <h2 className="v2-settings-group-label" id="v2-settings-time-h">
          {copy.timeFormatLabel}
        </h2>
        <div
          className="v2-settings-segments"
          role="radiogroup"
          aria-labelledby="v2-settings-time-h"
          data-settings-control="time-format"
        >
          {SCHEDULE_SETTINGS_TIME_FORMATS.map((option) => {
            const selected = timeFormatId === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={
                  selected
                    ? 'v2-settings-segment v2-settings-segment-active'
                    : 'v2-settings-segment'
                }
                onClick={() => {
                  const result = updateScheduleSettings(storage, {
                    timeFormatId: option.id,
                  });
                  if (result.ok) setTimeFormatId(result.settings.timeFormatId);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="v2-settings-group">
        <button
          type="button"
          role="switch"
          aria-checked={captionsOn}
          className="v2-settings-switch-row"
          data-settings-control="captions"
          onClick={() => {
            const result = updateExperiencePreferences(storage, {
              captionsPreference: captionsOn ? 'none' : 'prefer_open_caption',
            });
            if (result.ok) setExperience(result.settings);
          }}
        >
          <span className="v2-settings-switch-label">{copy.captionsLabel}</span>
          <span className="v2-settings-switch-track" aria-hidden="true">
            <span className="v2-settings-switch-thumb" />
          </span>
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={adOn}
          className="v2-settings-switch-row"
          data-settings-control="audio-description"
          onClick={() => {
            const result = updateExperiencePreferences(storage, {
              audioDescriptionPreference: adOn
                ? 'none'
                : 'prefer_audio_description',
            });
            if (result.ok) setExperience(result.settings);
          }}
        >
          <span className="v2-settings-switch-label">
            {copy.audioDescriptionLabel}
          </span>
          <span className="v2-settings-switch-track" aria-hidden="true">
            <span className="v2-settings-switch-thumb" />
          </span>
        </button>
        <p className="v2-settings-note">{copy.experienceNote}</p>
      </div>

      <div className="v2-settings-group" data-settings-group="discovery">
        <h2 className="v2-settings-group-label" id="v2-settings-discovery-h">
          {copy.discoveryGroupLabel}
        </h2>
        <button
          type="button"
          role="switch"
          aria-checked={visibility.hideNotInterested}
          aria-describedby="v2-settings-hide-ni-desc"
          className="v2-settings-switch-row"
          data-settings-control="hide-not-interested"
          onClick={() => {
            const result = updateVisibilityPreferences(storage, {
              hideNotInterested: !visibility.hideNotInterested,
            });
            if (result.ok) setVisibility(result.settings);
          }}
        >
          <span className="v2-settings-switch-label">
            {copy.hideNotInterestedLabel}
          </span>
          <span className="v2-settings-switch-track" aria-hidden="true">
            <span className="v2-settings-switch-thumb" />
          </span>
        </button>
        <p id="v2-settings-hide-ni-desc" className="v2-settings-note">
          {copy.hideNotInterestedDescription}
        </p>
        <button
          type="button"
          role="switch"
          aria-checked={visibility.hideSeen}
          aria-describedby="v2-settings-hide-seen-desc"
          className="v2-settings-switch-row"
          data-settings-control="hide-seen"
          onClick={() => {
            const result = updateVisibilityPreferences(storage, {
              hideSeen: !visibility.hideSeen,
            });
            if (result.ok) setVisibility(result.settings);
          }}
        >
          <span className="v2-settings-switch-label">{copy.hideSeenLabel}</span>
          <span className="v2-settings-switch-track" aria-hidden="true">
            <span className="v2-settings-switch-thumb" />
          </span>
        </button>
        <p id="v2-settings-hide-seen-desc" className="v2-settings-note">
          {copy.hideSeenDescription}
        </p>
      </div>
    </div>
  );
}

function PrivacySection() {
  const copy = PROFILE_SETTINGS_COPY.privacy;
  const auth = useAuth();
  const storage = getBrowserStorage();
  const [privacy, setPrivacy] = useState(() => getFriendActivityPrivacy(storage));
  const [shareError, setShareError] = useState(/** @type {string | null} */ (null));
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(
    () =>
      subscribeFriendActivityPrivacy(() => {
        setPrivacy(getFriendActivityPrivacy(storage));
      }),
    [storage],
  );

  // Cloud profile is authoritative when signed in.
  useEffect(() => {
    if (!auth.user?.id) return undefined;
    let cancelled = false;
    void (async () => {
      const result = await pullShareFilmActivityPreference({ storage });
      if (cancelled) return;
      if (result.ok && result.settings) setPrivacy(result.settings);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user?.id, storage]);

  const shareOn = privacy.shareFilmActivityWithFriends === true;

  return (
    <div data-settings-panel="privacy-sharing">
      <SettingsCopyCard title={copy.inviteOnlyTitle} body={copy.inviteOnlyBody} />
      <div className="v2-settings-group" data-settings-group="friend-activity">
        <button
          type="button"
          role="switch"
          aria-checked={shareOn}
          aria-describedby="v2-settings-share-activity-desc"
          className="v2-settings-switch-row"
          data-settings-control="share-film-activity"
          disabled={shareBusy}
          onClick={() => {
            if (shareBusy) return;
            setShareBusy(true);
            setShareError(null);
            void (async () => {
              const result = await setShareFilmActivityWithFriends(!shareOn, {
                storage,
              });
              setShareBusy(false);
              if (result.settings) setPrivacy(result.settings);
              if (!result.ok) {
                setShareError(copy.shareActivityError);
                return;
              }
              setShareError(null);
            })();
          }}
        >
          <span className="v2-settings-switch-label">{copy.shareActivityLabel}</span>
          <span className="v2-settings-switch-track" aria-hidden="true">
            <span className="v2-settings-switch-thumb" />
          </span>
        </button>
        <p id="v2-settings-share-activity-desc" className="v2-settings-note">
          {copy.shareActivityDescription}
        </p>
        {shareError ? (
          <p
            className="v2-settings-note"
            role="status"
            data-settings-error="share-film-activity"
          >
            {shareError}
          </p>
        ) : null}
      </div>
      <SettingsCopyCard title={copy.localDataTitle} body={copy.localDataBody} />
    </div>
  );
}

function AccountSection({ onAuthAction }) {
  return (
    <div data-settings-panel="account-security">
      <ProfileAccountPanel
        variant="account-security"
        showHeading={false}
        onAuthAction={onAuthAction}
      />
    </div>
  );
}

function CalendarSection() {
  const copy = PROFILE_SETTINGS_COPY.calendar;
  return (
    <div data-settings-panel="calendar">
      <SettingsCopyCard title={copy.icsTitle} body={copy.icsBody} />
      <SettingsCopyCard body={copy.noProviderBody} />
    </div>
  );
}

function AboutSection() {
  const copy = PROFILE_SETTINGS_COPY.about;
  return (
    <div data-settings-panel="about">
      <SettingsCopyCard body={copy.productBody} />
      <TmdbAttribution />
    </div>
  );
}

const SECTION_META = {
  [PROFILE_SETTINGS_SECTION_IDS.notifications]:
    PROFILE_SETTINGS_COPY.notifications,
  [PROFILE_SETTINGS_SECTION_IDS.preferences]: PROFILE_SETTINGS_COPY.preferences,
  [PROFILE_SETTINGS_SECTION_IDS.privacySharing]: PROFILE_SETTINGS_COPY.privacy,
  [PROFILE_SETTINGS_SECTION_IDS.accountSecurity]: PROFILE_SETTINGS_COPY.account,
  [PROFILE_SETTINGS_SECTION_IDS.calendar]: PROFILE_SETTINGS_COPY.calendar,
  [PROFILE_SETTINGS_SECTION_IDS.about]: PROFILE_SETTINGS_COPY.about,
};

/**
 * @param {{
 *   sectionId?: string,
 *   onAuthAction?: (actionId: string) => void,
 * }} [props]
 */
export default function ProfileSettingsSurface({
  sectionId = PROFILE_SETTINGS_SECTION_IDS.notifications,
  onAuthAction,
}) {
  const section = resolveProfileSettingsSectionId(sectionId);
  const meta = SECTION_META[section];

  return (
    <section
      className="v2-settings"
      aria-labelledby="v2-settings-title"
      data-settings-section={section}
    >
      <header className="v2-settings-header">
        <h1 id="v2-settings-title" className="v2-settings-title">
          {meta.title}
        </h1>
        {meta.subtitle ? (
          <p className="v2-settings-subtitle">{meta.subtitle}</p>
        ) : null}
      </header>

      {section === PROFILE_SETTINGS_SECTION_IDS.notifications ? (
        <NotificationsSection />
      ) : null}
      {section === PROFILE_SETTINGS_SECTION_IDS.preferences ? (
        <PreferencesSection />
      ) : null}
      {section === PROFILE_SETTINGS_SECTION_IDS.privacySharing ? (
        <PrivacySection />
      ) : null}
      {section === PROFILE_SETTINGS_SECTION_IDS.accountSecurity ? (
        <AccountSection onAuthAction={onAuthAction} />
      ) : null}
      {section === PROFILE_SETTINGS_SECTION_IDS.calendar ? (
        <CalendarSection />
      ) : null}
      {section === PROFILE_SETTINGS_SECTION_IDS.about ? <AboutSection /> : null}
    </section>
  );
}
