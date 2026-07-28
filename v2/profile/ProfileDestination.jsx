/**
 * Stage 1 Profile hub — fixture-backed visual replica of Profile Page.png.
 *
 * Does not read or write Saved / Seen / Not Interested / Favorite stores.
 * Nested settings / management destinations are Stage 1 stubs only.
 */

import { useId, useState } from 'react';
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
import { resolveProfilePresentation } from '../fixtures/profileMockupFixture.js';

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
  const presentation = resolveProfilePresentation();
  const stubStatusId = useId();
  const [stubMessage, setStubMessage] = useState(null);

  const announceStub = (actionId, label) => {
    const message = `${label} isn’t available in this Stage 1 Profile shell yet.`;
    setStubMessage(message);
    onStubAction?.(actionId, label);
  };

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

  return (
    <section
      className="v2-profile"
      aria-labelledby="v2-profile-title"
      data-profile-source={presentation.source}
    >
      <header className="v2-profile-page-header">
        <h1 id="v2-profile-title" className="v2-profile-title">
          {pageTitle}
        </h1>
        <p className="v2-profile-tagline">{pageTagline}</p>
      </header>

      <div className="v2-profile-identity" data-profile-section="identity">
        <div
          className="v2-profile-avatar"
          aria-hidden="true"
        >
          <span className="v2-profile-avatar-letter">{identity.initials}</span>
        </div>
        <div className="v2-profile-identity-copy">
          <p className="v2-profile-name">{identity.displayName}</p>
          <p className="v2-profile-location">{identity.locationLabel}</p>
          <button
            type="button"
            className="v2-profile-link"
            onClick={() => announceStub('edit-profile', identity.editLabel)}
          >
            {identity.editLabel} <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

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
        {nextPlan.available ? (
          <button
            type="button"
            className="v2-profile-plan-card"
            onClick={() => announceStub('next-plan', nextPlan.title)}
          >
            <img
              className="v2-profile-plan-poster"
              src={nextPlan.posterUrl}
              alt=""
            />
            <div className="v2-profile-plan-copy">
              <p className="v2-profile-plan-title">{nextPlan.title}</p>
              <p className="v2-profile-plan-when">{nextPlan.whenLabel}</p>
              <p className="v2-profile-plan-theater">{nextPlan.theaterName}</p>
              <p className="v2-profile-plan-more">{nextPlan.moreFilmsLabel}</p>
            </div>
            <div className="v2-profile-plan-date" aria-hidden="true">
              <span>{nextPlan.dateStack.weekday}</span>
              <span>{nextPlan.dateStack.monthDay}</span>
            </div>
            <span className="v2-profile-plan-chevron" aria-hidden="true">
              <IconChevron />
            </span>
          </button>
        ) : null}
      </section>

      <section
        className="v2-profile-section"
        data-profile-section="membership"
        aria-labelledby="v2-profile-membership-h"
      >
        <h2 id="v2-profile-membership-h" className="v2-profile-section-label">
          {membership.sectionTitle}
        </h2>
        {membership.available ? (
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
        ) : null}
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
                  <img src={theater.imageUrl} alt="" />
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
                <span className="v2-profile-theater-loc">
                  {theater.locationLabel}
                </span>
              </button>
            </li>
          ))}
        </ul>
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
      </section>

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
