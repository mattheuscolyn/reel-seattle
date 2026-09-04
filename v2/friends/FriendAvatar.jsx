import { initialsFromDisplayName } from '../auth/profileIdentity.js';
import { IconPerson } from '../icons.jsx';
import { friendDisplayLabel } from './friendsCopy.js';

/**
 * @param {string | null | undefined} avatarUrl
 * @returns {string | null}
 */
function safeAvatarUrl(avatarUrl) {
  const raw = typeof avatarUrl === 'string' ? avatarUrl.trim() : '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   displayName?: string | null,
 *   avatarUrl?: string | null,
 *   size?: 'sm' | 'md' | 'lg',
 * }} props
 */
export default function FriendAvatar({
  displayName = null,
  avatarUrl = null,
  size = 'md',
}) {
  const label = friendDisplayLabel(displayName);
  const src = safeAvatarUrl(avatarUrl);
  const initials = initialsFromDisplayName(label);
  return (
    <span className={`v2-friend-avatar v2-friend-avatar-${size}`} aria-hidden="true">
      {src ? (
        <img className="v2-friend-avatar-img" src={src} alt="" />
      ) : initials && initials !== '?' ? (
        <span className="v2-friend-avatar-letter">{initials}</span>
      ) : (
        <span className="v2-friend-avatar-letter">
          <IconPerson width={size === 'lg' ? 28 : 18} height={size === 'lg' ? 28 : 18} />
        </span>
      )}
    </span>
  );
}
