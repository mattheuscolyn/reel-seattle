/**
 * Truthful Settings copy for nested Profile Settings (Slice 2).
 */

export const PROFILE_SETTINGS_COPY = Object.freeze({
  notifications: Object.freeze({
    title: 'Notifications & Alerts',
    subtitle: 'What Reel Seattle can tell you today.',
    savedTitle: 'Saved-film showtimes',
    signedInBody:
      'When a Saved film gets Seattle showtimes, Reel Seattle can notify you in the app. There isn’t a separate on/off setting yet — Saving a film while signed in is what enrolls that watch.',
    signedOutBody:
      'Sign in to get notified when Saved films get Seattle showtimes. Saving still works on this device without an account.',
    unconfiguredBody:
      'Saved-film showtime alerts need a signed-in account. Sign-in isn’t configured in this build. Saving still works on this device.',
    signInLabel: 'Continue with Google',
  }),
  preferences: Object.freeze({
    title: 'Preferences',
    subtitle: 'How times and accessibility should feel in Reel Seattle.',
    timeFormatLabel: 'Time format',
    captionsLabel: 'Prefer Open Caption screenings when available',
    audioDescriptionLabel:
      'Prefer Audio Description screenings when available',
    experienceNote:
      'These are soft preferences. Reel Seattle does not hide other screenings.',
  }),
  privacy: Object.freeze({
    title: 'Privacy & Sharing',
    subtitle: 'How social features will work when they arrive.',
    inviteOnlyTitle: 'Invite-only connections',
    inviteOnlyBody:
      'Future Friends will use direct invites. Reel Seattle does not offer public profile search or discoverability.',
    localDataTitle: 'Data on this device',
    localDataBody:
      'Saved, Seen, Not Interested, favorite theaters, and plans stay on this browser until you enable sync from Profile.',
  }),
  account: Object.freeze({
    title: 'Account & Security',
    subtitle: 'Sign in to optionally back up film activity and Planner.',
  }),
  calendar: Object.freeze({
    title: 'Calendar',
    subtitle: 'How Reel Seattle adds screenings to your calendar.',
    icsTitle: 'Add to calendar',
    icsBody:
      'Add to calendar downloads a standard .ics calendar file that can be opened by your calendar app.',
    noProviderBody:
      'Reel Seattle does not connect to Google Calendar or Apple Calendar accounts.',
  }),
  about: Object.freeze({
    title: 'About Reel Seattle',
    subtitle: 'Seattle-area moviegoing, in one place.',
    productBody:
      'Reel Seattle helps you find showtimes, theaters, and plans across Seattle-area cinema — without turning moviegoing into an account dashboard.',
  }),
});
