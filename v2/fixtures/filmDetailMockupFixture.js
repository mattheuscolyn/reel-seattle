/**

 * Film Detail MOCKUP FIXTURE — visual authority only.

 *

 * Content matches the approved Film Detail mockup exactly.

 * Not production Seattle data. Do not mix with HomeData adapters.

 * Activate only via `?fdMockup=1` or the localStorage flag — never as production default.

 *

 * Poster/backdrop: local raster crops from the canonical Film Detail mockup

 * (photographic 2001 poster + space-station/Earth hero). Deterministic; no remote URLs.

 */



/** @typedef {'mockup-fixture'} MockupSource */



export const FILM_DETAIL_MOCKUP_FLAG_QUERY = 'fdMockup';

export const FILM_DETAIL_MOCKUP_STORAGE_KEY = 'reel-seattle.v2.fdMockup';



/** Local raster assets — Vite resolves; Node tests get file: URLs. */

const POSTER_2001_URL = new URL(

  './assets/film-detail/poster-2001.png',

  import.meta.url,

).href;

const BACKDROP_2001_URL = new URL(

  './assets/film-detail/backdrop-2001.png',

  import.meta.url,

).href;



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

    genres: 'Science Fiction • Adventure',

    director: 'Directed by Stanley Kubrick',

    posterUrl: POSTER_2001_URL,

    backdropUrl: BACKDROP_2001_URL,

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

    totalCount: 5,

    signals: Object.freeze([

      Object.freeze({

        id: 'sig-70mm',

        icon: 'camera',

        tone: 'violet',

        primary: 'Rare 70mm\npresentation',

        secondary: 'Only 3 venues in Seattle',

      }),

      Object.freeze({

        id: 'sig-rank',

        icon: 'trophy',

        tone: 'gold',

        // Newlines match canonical card wrapping; contiguous phrase kept for smoke/markers.
        primary: '#13 on\nLetterboxd Top 250',

        secondary: null,

      }),

      Object.freeze({

        id: 'sig-left',

        icon: 'calendar',

        tone: 'coral',

        primary: '3 screenings\nleft',

        secondary: 'Ends May 19',

      }),

      Object.freeze({

        id: 'sig-venue',

        icon: 'building',

        tone: 'cyan',

        primary: 'Only at SIFF\nDowntown',

        secondary: 'Premium format engagement',

      }),

      Object.freeze({

        id: 'sig-event',

        icon: 'spark',

        tone: 'violet',

        primary: 'Special\nscreening',

        secondary: 'One-night program',

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

    whenLabel: 'Today, May 17 • 7:30 PM',

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

  'Letterboxd',

  'Mind-bending',

  'SIFF Cinema Downtown',

  '0.6 mi',

  'mockup-fixture',

  'poster-2001.png',

  'backdrop-2001.png',

]);

