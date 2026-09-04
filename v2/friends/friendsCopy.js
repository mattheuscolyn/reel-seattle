/**
 * User-facing Friends / invite copy. Keep terminology invite-only:
 * Friend, Friends, Invite friend, Connect, Remove friend.
 */

export const FRIENDS_COPY = Object.freeze({
  sectionTitle: 'Friends',
  viewAll: 'View all',
  moreLabel: 'more',
  emptyHelper: 'Connect with friends to share movie plans.',
  inviteFriend: 'Invite a friend',
  inviteFriendAction: 'Invite friend',
  enterCode: 'Enter invite code',
  signedOutTitle: 'Sign in to connect with friends',
  signInLabel: 'Continue with Google',
  loadError: 'Couldn’t load friends. Try again.',
  retry: 'Retry',
  removeFriend: 'Remove friend',
  removeConfirmBody: 'You’ll no longer be connected on Reel Seattle.',
  cancel: 'Cancel',
  notNow: 'Not now',
  accept: 'Accept',
  done: 'Done',
  viewFriends: 'View friends',
  inviteSheetTitle: 'Invite a friend',
  inviteExplanation:
    'Friends on Reel Seattle connect through private invites — there’s no public people search.',
  createInvite: 'Create invite',
  inviteLink: 'Invite link',
  inviteCode: 'Invite code',
  copyLink: 'Copy link',
  copyCode: 'Copy code',
  share: 'Share',
  copied: 'Copied',
  inviteLinkCopied: 'Invite link copied',
  inviteCodeCopied: 'Invite code copied',
  shareHelper: 'They can open the link or enter this code after signing in.',
  cancelInvite: 'Cancel invite',
  inviteCanceled: 'Invite canceled',
  createNewInvite: 'Create new invite',
  codeSheetTitle: 'Enter invite code',
  codeHelper: 'Ask your friend for their 8-character invite code.',
  codeInvalidLength: 'Enter the 8-character invite code.',
  rateLimited: 'Too many attempts. Try again in a few minutes.',
  signedOutCode: 'Sign in to enter an invite code.',
  lookupNetwork: 'Couldn’t look up that code. Try again.',
  acceptNetwork: 'Couldn’t accept this invite. Try again.',
  landingInvalid: 'This invite isn’t valid.',
  landingExpired: 'This invite has expired.',
  landingRevoked: 'This invite is no longer available.',
  landingAccepted: 'This invite isn’t available.',
  landingSelf: 'You can’t accept your own invite.',
  landingNetwork: 'Couldn’t load this invite. Try again.',
  landingLoad: 'Checking this invite…',
});

/**
 * @param {string | null | undefined} reason
 * @returns {string}
 */
export function inviteFailureCopy(reason) {
  switch (reason) {
    case 'invite_not_found':
      return FRIENDS_COPY.landingInvalid;
    case 'invite_expired':
      return FRIENDS_COPY.landingExpired;
    case 'invite_revoked':
      return FRIENDS_COPY.landingRevoked;
    case 'invite_accepted':
    case 'invite_not_pending':
      return FRIENDS_COPY.landingAccepted;
    case 'cannot_friend_self':
      return FRIENDS_COPY.landingSelf;
    case 'rate_limited':
      return FRIENDS_COPY.rateLimited;
    case 'not_authenticated':
      return FRIENDS_COPY.signedOutCode;
    default:
      return FRIENDS_COPY.landingNetwork;
  }
}

/**
 * @param {string | null | undefined} displayName
 * @returns {string}
 */
export function friendDisplayLabel(displayName) {
  const name = String(displayName || '').trim();
  return name || 'Friend';
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function removeFriendTitle(displayName) {
  return `Remove ${friendDisplayLabel(displayName)}?`;
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function connectWithTitle(displayName) {
  return `Connect with ${friendDisplayLabel(displayName)}?`;
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function invitedYouCopy(displayName) {
  return `${friendDisplayLabel(displayName)} invited you to connect on Reel Seattle.`;
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function alreadyFriendsCopy(displayName) {
  return `You’re already friends with ${friendDisplayLabel(displayName)}.`;
}

/**
 * @param {string} displayName
 * @returns {string}
 */
export function nowFriendsCopy(displayName) {
  return `You’re now friends with ${friendDisplayLabel(displayName)}.`;
}

export const INVITE_SHARE_PREFIX = 'Join me on Reel Seattle: ';

/**
 * @param {string} inviteUrl
 * @returns {string}
 */
export function buildInviteShareText(inviteUrl) {
  return `${INVITE_SHARE_PREFIX}${inviteUrl}`;
}
