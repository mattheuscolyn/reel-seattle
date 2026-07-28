/**
 * Film Detail MOCKUP FIXTURE — visual authority only.
 *
 * Content matches the approved Film Detail mockup exactly.
 * Not production Seattle data. Do not mix with HomeData adapters.
 * Activate only via `?fdMockup=1` or the localStorage flag — never as production default.
 */

/** @typedef {'mockup-fixture'} MockupSource */

export const FILM_DETAIL_MOCKUP_FLAG_QUERY = 'fdMockup';
export const FILM_DETAIL_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.fdMockup';

/**
 * Explicit QC/mockup mode — never the production default.
 * @returns {boolean}
 */
export function isFilmDetailMockupFixtureMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(FILM_DETAIL_MOCKUP_FLAG_QUERY) === '1') return true;
    if (window.localStorage?.getItem(FILM_DETAIL_MOCKUP_STORAGE_KEY) === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

function spaceBackdropSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640">
  <defs>
    <radialGradient id="glow" cx="48%" cy="38%" r="48%">
      <stop offset="0%" stop-color="#8ec4ef" stop-opacity="0.75"/>
      <stop offset="28%" stop-color="#2b5f9a" stop-opacity="0.55"/>
      <stop offset="70%" stop-color="#0b1630" stop-opacity="0.2"/>
      <stop offset="100%" stop-color="#050814" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050a18"/>
      <stop offset="45%" stop-color="#0c1a36"/>
      <stop offset="100%" stop-color="#07080d"/>
    </linearGradient>
  </defs>
  <rect width="960" height="640" fill="url(#sky)"/>
  <circle cx="80" cy="70" r="1.4" fill="#fff" opacity="0.85"/>
  <circle cx="180" cy="120" r="1.1" fill="#fff" opacity="0.7"/>
  <circle cx="300" cy="40" r="1.2" fill="#fff" opacity="0.8"/>
  <circle cx="420" cy="95" r="0.9" fill="#fff" opacity="0.65"/>
  <circle cx="560" cy="55" r="1.3" fill="#fff" opacity="0.8"/>
  <circle cx="700" cy="110" r="1" fill="#fff" opacity="0.7"/>
  <circle cx="820" cy="45" r="1.5" fill="#fff" opacity="0.9"/>
  <circle cx="900" cy="140" r="0.9" fill="#fff" opacity="0.6"/>
  <circle cx="640" cy="180" r="0.8" fill="#fff" opacity="0.55"/>
  <circle cx="240" cy="180" r="0.7" fill="#fff" opacity="0.5"/>
  <ellipse cx="470" cy="250" rx="300" ry="190" fill="url(#glow)"/>
  <ellipse cx="470" cy="250" rx="230" ry="36" fill="none" stroke="#e4eefc" stroke-width="6" opacity="0.7" transform="rotate(-20 470 250)"/>
  <ellipse cx="470" cy="250" rx="165" ry="24" fill="none" stroke="#f3f7ff" stroke-width="3.5" opacity="0.45" transform="rotate(-20 470 250)"/>
  <g transform="translate(95 78) rotate(-14)" opacity="0.75">
    <rect x="0" y="14" width="88" height="14" rx="5" fill="#d5deec"/>
    <rect x="28" y="0" width="16" height="42" rx="3" fill="#b7c4d8"/>
    <rect x="58" y="8" width="10" height="26" rx="2" fill="#c7d2e4"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function spacePosterSvg() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050814"/>
      <stop offset="55%" stop-color="#0a1630"/>
      <stop offset="100%" stop-color="#1a0f28"/>
    </linearGradient>
    <radialGradient id="earth" cx="50%" cy="42%" r="38%">
      <stop offset="0%" stop-color="#7ec8ff" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="#2a5a9a" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#050814" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="400" height="600" fill="url(#bg)"/>
  <circle cx="200" cy="230" r="150" fill="url(#earth)"/>
  <ellipse cx="200" cy="230" rx="170" ry="28" fill="none" stroke="#c9d4e8" stroke-width="3" opacity="0.55" transform="rotate(-18 200 230)"/>
  <ellipse cx="200" cy="230" rx="120" ry="18" fill="none" stroke="#e8eef8" stroke-width="2" opacity="0.4" transform="rotate(-18 200 230)"/>
  <rect x="0" y="470" width="400" height="130" fill="rgba(0,0,0,0.55)"/>
  <text x="28" y="530" fill="#f5d76e" font-family="Georgia, serif" font-size="22">2001: a space odyssey</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Structured presentation matching the approved Film Detail mockup.
 */
export const FILM_DETAIL_MOCKUP_FIXTURE = Object.freeze({
  source: /** @type {MockupSource} */ ('mockup-fixture'),
  originLabel: 'Explore',
  originPrimary: 'explore',
  film: Object.freeze({
    title: '2001: A Space Odyssey',
    year: '1968',
    runtimeLabel: '2h 29m',
    rating: 'G',
    genres: 'Science Fiction · Adventure',
    director: 'Directed by Stanley Kubrick',
    posterUrl: spacePosterSvg(),
    backdropUrl: spaceBackdropSvg(),
    badges: Object.freeze([
      Object.freeze({ id: '70mm', label: '70MM', tone: 'neutral' }),
      Object.freeze({ id: 'classic', label: 'CLASSIC', tone: 'neutral' }),
      Object.freeze({
        id: 'top250',
        label: '#13 Top 250',
        tone: 'gold',
        icon: 'trophy',
      }),
    ]),
  }),
  actions: Object.freeze({
    saveAvailable: true,
    seenActive: false,
    notInterestedActive: true,
  }),
  whySeeIt: Object.freeze({
    totalCount: 7,
    signals: Object.freeze([
      Object.freeze({
        id: 'sig-70mm',
        icon: 'camera',
        tone: 'violet',
        primary: 'Rare 70mm presentation',
        secondary: 'Only 3 venues in Seattle',
      }),
      Object.freeze({
        id: 'sig-rank',
        icon: 'trophy',
        tone: 'gold',
        primary: '#13 Letterboxd Top 250',
        secondary: null,
      }),
      Object.freeze({
        id: 'sig-left',
        icon: 'calendar',
        tone: 'coral',
        primary: '3 screenings left',
        secondary: 'Ends May 19',
      }),
      Object.freeze({
        id: 'sig-venue',
        icon: 'building',
        tone: 'cyan',
        primary: 'Only at SIFF Downtown',
        secondary: 'Premium format',
      }),
    ]),
  }),
  synopsis: Object.freeze({
    preview:
      'A mysterious black monolith propels humankind from prehistoric Earth to a mission among the stars, where an astronaut confronts a sentient computer and the limits of human understanding.',
    full:
      'A mysterious black monolith propels humankind from prehistoric Earth to a mission among the stars, where an astronaut confronts a sentient computer and the limits of human understanding. Across vast stretches of time and space, the film traces evolution, technology, and wonder toward a final transformation.',
    tags: Object.freeze(['Mind-bending', 'Philosophical', 'Visually iconic']),
  }),
  bestWay: Object.freeze({
    formatLabel: '70MM',
    theaterName: 'SIFF Cinema Downtown',
    presentationLabel: '70mm Film Presentation',
    whenLabel: 'Today, May 17 · 7:30 PM',
    facts: Object.freeze([
      Object.freeze({ id: 'premier', icon: 'star', label: 'Premier format' }),
      Object.freeze({
        id: 'audience',
        icon: 'person',
        label: 'Best audience experience',
      }),
      Object.freeze({ id: 'distance', icon: 'pin', label: '0.6 mi' }),
    ]),
  }),
  todaysShowtimes: Object.freeze({
    rows: Object.freeze([
      Object.freeze({
        id: 'row-siff-dt',
        venueMark: 'siff',
        accent: 'cyan',
        theaterName: 'SIFF Cinema Downtown',
        chips: Object.freeze([
          Object.freeze({ label: '70MM' }),
          Object.freeze({ label: 'Premier format' }),
        ]),
        times: Object.freeze(['7:30 PM']),
      }),
      Object.freeze({
        id: 'row-amc',
        venueMark: 'AMC',
        accent: 'coral',
        theaterName: 'AMC Pacific Place 11',
        chips: Object.freeze([
          Object.freeze({ label: 'IMAX' }),
          Object.freeze({ label: 'A-List eligible', icon: 'lock' }),
        ]),
        times: Object.freeze(['4:00 PM', '7:15 PM']),
      }),
      Object.freeze({
        id: 'row-siff-up',
        venueMark: 'siff',
        accent: 'cyan',
        theaterName: 'SIFF Uptown',
        chips: Object.freeze([Object.freeze({ label: 'Digital' })]),
        times: Object.freeze(['6:45 PM', '9:15 PM']),
      }),
    ]),
    timezoneNote: 'All times in PT',
  }),
});

/**
 * @returns {typeof FILM_DETAIL_MOCKUP_FIXTURE}
 */
export function getFilmDetailMockupPresentation() {
  return FILM_DETAIL_MOCKUP_FIXTURE;
}

export const FILM_DETAIL_MOCKUP_MARKERS = Object.freeze([
  '2001: A Space Odyssey',
  'Directed by Stanley Kubrick',
  '#13 Letterboxd Top 250',
  'Mind-bending',
  'SIFF Cinema Downtown',
  '0.6 mi',
  'mockup-fixture',
]);
