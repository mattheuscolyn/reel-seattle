/**
 * Profile MOCKUP FIXTURE — Stage 1 visual authority only.
 *
 * Content matches Canonical Mockup Images/Profile Page.png.
 * Not production user data. Does not import or write local stores.
 * Stage 4 may replace resolveProfilePresentation() without redesigning the surface.
 */

function posterSvg(title, from, to) {
  const safe = String(title).replace(/[<>&]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="600" fill="url(#g)"/>
  <rect x="0" y="420" width="400" height="180" fill="rgba(0,0,0,0.45)"/>
  <text x="20" y="500" fill="#f5f5f7" font-family="Georgia, serif" font-size="22">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function theaterThumbSvg(label, from, to) {
  const safe = String(label).replace(/[<>&']/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <defs>
    <linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${from}"/>
      <stop offset="100%" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="480" height="320" fill="url(#t)"/>
  <rect x="0" y="220" width="480" height="100" fill="rgba(0,0,0,0.4)"/>
  <text x="24" y="280" fill="#f5f5f7" font-family="Segoe UI, sans-serif" font-size="28">${safe}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function amcLogoSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <circle cx="48" cy="48" r="46" fill="#c8102e"/>
  <text x="48" y="56" text-anchor="middle" fill="#fff" font-family="Arial Black, Arial, sans-serif" font-size="22" font-weight="700">AMC</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Canonical mockup section order markers (for tests + docs). */
export const PROFILE_MOCKUP_SECTION_ORDER = Object.freeze([
  'identity',
  'activity',
  'upNext',
  'membership',
  'favoriteTheaters',
  'settings',
]);

/**
 * Stage 1 Profile presentation — fixture-backed.
 * @returns {Readonly<object>}
 */
export function getProfileMockupPresentation() {
  return PROFILE_MOCKUP_FIXTURE;
}

/**
 * @type {Readonly<{
 *   source: 'mockup-fixture',
 *   pageTitle: string,
 *   pageTagline: string,
 *   identity: object,
 *   activity: object[],
 *   nextPlan: object,
 *   membership: object,
 *   favoriteTheaters: object[],
 *   settingsRows: object[],
 * }>}
 */
export const PROFILE_MOCKUP_FIXTURE = Object.freeze({
  source: 'mockup-fixture',
  pageTitle: 'Profile',
  pageTagline: 'Your moviegoing, your way.',
  identity: Object.freeze({
    displayName: 'Mattheus',
    initials: 'M',
    locationLabel: 'Seattle, WA',
    editLabel: 'Edit profile',
  }),
  activity: Object.freeze([
    Object.freeze({
      key: 'seen',
      label: 'Seen',
      value: 83,
      tone: 'accent',
      icon: 'eye',
    }),
    Object.freeze({
      key: 'notInterested',
      label: 'Not interested',
      value: 27,
      tone: 'danger',
      icon: 'heart',
    }),
    Object.freeze({
      key: 'saved',
      label: 'Saved',
      value: 46,
      tone: 'accent',
      icon: 'bookmark',
    }),
    Object.freeze({
      key: 'plans',
      label: 'Plans',
      value: 3,
      tone: 'success',
      icon: 'calendar',
    }),
  ]),
  nextPlan: Object.freeze({
    available: true,
    sectionTitle: 'Up next',
    viewAllLabel: 'View all plans',
    title: 'Mission: Impossible – The Final Reckoning',
    whenLabel: 'Sat, May 24 · 7:30pm',
    theaterName: 'AMC Pacific Place 11',
    moreFilmsLabel: '+ 2 more films',
    dateStack: Object.freeze({
      weekday: 'SAT',
      monthDay: 'MAY 24',
    }),
    posterUrl: posterSvg('Mission: Impossible', '#1a1028', '#3d1f4a'),
  }),
  membership: Object.freeze({
    available: true,
    sectionTitle: 'Membership',
    name: 'AMC Stubs A-List',
    renewLabel: 'Renews Jun 10, 2025',
    usageLabel: '4 of 4 this week',
    manageLabel: 'Manage',
    logoUrl: amcLogoSvg(),
  }),
  favoriteTheaters: Object.freeze([
    Object.freeze({
      id: 'siff-cinema-downtown',
      name: 'SIFF Cinema Downtown',
      locationLabel: 'Seattle, WA',
      imageUrl: theaterThumbSvg('SIFF Downtown', '#1a2030', '#4a3a28'),
      favorited: true,
    }),
    Object.freeze({
      id: 'the-beacon',
      name: 'The Beacon Cinema',
      locationLabel: 'Seattle, WA',
      imageUrl: theaterThumbSvg('The Beacon', '#241820', '#5a3040'),
      favorited: true,
    }),
    Object.freeze({
      id: 'central-cinema',
      name: 'Central Cinema',
      locationLabel: 'Seattle, WA',
      imageUrl: theaterThumbSvg('Central', '#182028', '#3a5060'),
      favorited: false,
    }),
  ]),
  favoriteTheatersSection: Object.freeze({
    title: 'Favorite theaters',
    viewAllLabel: 'View all',
  }),
  settingsSectionTitle: 'Settings',
  settingsRows: Object.freeze([
    Object.freeze({
      id: 'notifications',
      label: 'Notifications & Alerts',
      icon: 'bell',
    }),
    Object.freeze({
      id: 'accessibility',
      label: 'Accessibility',
      icon: 'accessibility',
    }),
    Object.freeze({
      id: 'appearance',
      label: 'Appearance',
      icon: 'sun',
    }),
    Object.freeze({
      id: 'privacy',
      label: 'Privacy & Data',
      icon: 'lock',
    }),
    Object.freeze({
      id: 'account',
      label: 'Account & Security',
      icon: 'shield',
    }),
    Object.freeze({
      id: 'connected',
      label: 'Connected Services',
      icon: 'link',
    }),
    Object.freeze({
      id: 'about',
      label: 'About Reel Seattle',
      icon: 'info',
    }),
  ]),
});

/**
 * Resolve Profile presentation for Stage 1 (always fixture).
 * Later Stage 4 can branch here without changing ProfileDestination layout.
 *
 * @returns {ReturnType<typeof getProfileMockupPresentation>}
 */
export function resolveProfilePresentation() {
  return getProfileMockupPresentation();
}
