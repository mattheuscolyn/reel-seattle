import { IconBookmark, IconCalendar, IconCheck, IconChevron, IconMore } from '../icons.jsx';
import FriendAvatar from './FriendAvatar.jsx';
import { friendDisplayLabel } from './friendsCopy.js';

/**
 * @param {{
 *   card: {
 *     userId: string,
 *     displayName?: string | null,
 *     avatarUrl?: string | null,
 *     mutualState: string,
 *     mutualLabel: string | null,
 *     planLabel: string | null,
 *     preview: string,
 *     posters: Array<{ key: string, posterUrl: string | null }>,
 *     plan: {
 *       planId: string,
 *       title: string,
 *       when: string,
 *       theaterName: string | null,
 *       posterUrl: string | null,
 *       responseLabel: string,
 *     } | null,
 *   },
 *   menuOpen: boolean,
 *   onOpen: () => void,
 *   onMenu: () => void,
 *   onRemove: () => void,
 *   removeLabel: string,
 * }} props
 */
export default function FriendsListCard({
  card,
  menuOpen,
  onOpen,
  onMenu,
  onRemove,
  removeLabel,
}) {
  const name = friendDisplayLabel(card.displayName);
  return (
    <li
      className="v2-friend-card"
      data-friend-row={card.userId}
      data-friend-card={card.userId}
      data-list-restore-key={card.userId}
      data-friend-mutual={
        card.mutualState === 'shared' ? String(card.mutualLabel ? 'shown' : 'zero') : card.mutualState
      }
      data-friend-mutual-count={card.mutualCount ?? ''}
      data-friend-plan-count={card.planCount ?? ''}
      data-friend-preview={card.preview}
    >
      <button
        type="button"
        className="v2-friend-card-open"
        data-friends-action="open-friend-detail"
        onClick={onOpen}
      >
        <span className="v2-friend-card-identity">
          <FriendAvatar
            displayName={card.displayName}
            avatarUrl={card.avatarUrl}
            size="md"
          />
          <span className="v2-friend-card-copy">
            <span className="v2-friends-row-name">{name}</span>
            {card.mutualLabel ? (
              <span className="v2-friend-card-stat">
                <IconBookmark width={14} height={14} />
                {card.mutualLabel}
              </span>
            ) : null}
            {card.planLabel ? (
              <span className="v2-friend-card-stat">
                <IconCalendar width={14} height={14} />
                {card.planLabel}
              </span>
            ) : null}
          </span>
          <IconChevron className="v2-friend-card-chevron" width={16} height={16} />
        </span>

        {card.preview === 'plan' && card.plan ? (
          <span className="v2-friend-card-plan" data-friend-plan-preview={card.plan.planId}>
            <span className="v2-friend-card-plan-kicker">Upcoming plan</span>
            <span className="v2-friend-card-plan-row">
              {card.plan.posterUrl ? (
                <img src={card.plan.posterUrl} alt="" />
              ) : (
                <span className="v2-shelf-poster-fallback" />
              )}
              <span className="v2-friend-card-plan-copy">
                <span className="v2-friend-card-plan-title">{card.plan.title}</span>
                {card.plan.when ? (
                  <span className="v2-friend-card-plan-when">{card.plan.when}</span>
                ) : null}
                {card.plan.theaterName ? (
                  <span className="v2-friend-card-plan-theater">{card.plan.theaterName}</span>
                ) : null}
                <span className="v2-friend-detail-plan-response">
                  {card.plan.response === 'going' ? (
                    <IconCheck width={12} height={12} />
                  ) : null}
                  {card.plan.responseLabel}
                </span>
              </span>
            </span>
          </span>
        ) : null}

        {card.preview === 'posters' ? (
          <span className="v2-friend-card-posters" data-friend-posters="">
            {card.posters.map((poster) => (
              <span key={poster.key} className="v2-friend-card-poster" data-friend-poster={poster.key}>
                {poster.posterUrl ? (
                  <img src={poster.posterUrl} alt="" />
                ) : (
                  <span className="v2-shelf-poster-fallback" />
                )}
              </span>
            ))}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        className="v2-friends-more v2-friend-card-more"
        aria-label={`More options for ${name}`}
        aria-expanded={menuOpen}
        data-friends-action="row-menu"
        onClick={onMenu}
      >
        <IconMore width={18} height={18} />
      </button>
      {menuOpen ? (
        <div className="v2-friends-row-menu v2-friend-card-menu" role="menu">
          <button
            type="button"
            className="v2-friends-row-menu-item"
            role="menuitem"
            data-friends-action="remove-friend"
            onClick={onRemove}
          >
            {removeLabel}
          </button>
        </div>
      ) : null}
    </li>
  );
}
