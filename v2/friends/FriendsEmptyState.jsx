import { IconBookmark, IconCalendar, IconFilm, IconPerson, IconSparkle } from '../icons.jsx';
import { FRIENDS_COPY } from './friendsCopy.js';

const POINT_ICONS = {
  interest: IconBookmark,
  plans: IconCalendar,
  personal: IconPerson,
};

/**
 * Onboarding composition when the viewer has no friends.
 * CSS and icons only — not a generated illustration.
 */
export default function FriendsEmptyState({ onInvite, onEnterCode }) {
  return (
    <div className="v2-friends-empty">
      <div
        className="v2-friends-empty-art"
        aria-hidden="true"
        data-friends-empty-art="placeholder"
      >
        <span className="v2-friends-empty-note v2-friends-empty-note-left">
          See what your friends are saving
        </span>
        <span className="v2-friends-empty-note v2-friends-empty-note-right">
          Discover what you both want to watch
        </span>
        <span className="v2-friends-empty-poster v2-friends-empty-poster-left">
          <IconFilm width={22} height={22} />
          <span className="v2-friends-empty-face"><IconPerson width={16} height={16} /></span>
        </span>
        <span className="v2-friends-empty-poster v2-friends-empty-poster-center">
          <IconSparkle width={18} height={18} />
          <span className="v2-friends-empty-face v2-friends-empty-face-top">
            <IconPerson width={16} height={16} />
          </span>
        </span>
        <span className="v2-friends-empty-poster v2-friends-empty-poster-right">
          <IconFilm width={20} height={20} />
          <span className="v2-friends-empty-face"><IconPerson width={16} height={16} /></span>
        </span>
        <span className="v2-friends-empty-plan">
          <span className="v2-friends-empty-plan-poster" />
          <span className="v2-friends-empty-plan-copy">
            <span className="v2-friends-empty-plan-title">Movie night</span>
            <span className="v2-friends-empty-plan-when">Sat · 7:00 PM</span>
          </span>
          <span className="v2-friends-empty-plan-going">Going</span>
        </span>
      </div>

      <ul className="v2-friends-empty-points">
        {FRIENDS_COPY.emptyPoints.map((point) => {
          const Icon = POINT_ICONS[point.id] ?? IconFilm;
          return (
            <li key={point.id} data-friends-empty-point={point.id}>
              <Icon width={22} height={22} />
              <span className="v2-friends-empty-point-title">{point.title}</span>
              <span className="v2-friends-empty-point-body">{point.body}</span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="v2-profile-account-btn v2-friends-invite-cta"
        data-friends-action="invite-from-empty"
        onClick={onInvite}
      >
        <IconPerson width={18} height={18} />
        {FRIENDS_COPY.inviteFriend}
      </button>
      <button
        type="button"
        className="v2-profile-link v2-friends-code-link"
        data-friends-action="enter-code"
        onClick={onEnterCode}
      >
        {FRIENDS_COPY.haveInviteCode}
      </button>
    </div>
  );
}
