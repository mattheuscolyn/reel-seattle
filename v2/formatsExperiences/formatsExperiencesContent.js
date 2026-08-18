/**
 * Editorial / factual content for Formats & Experiences.
 * Source of truth: Canonical Mockup Images/reel-seattle-formats-experiences-source-of-truth.md
 * Layout/visual language comes from mockups; facts come from this module.
 */

import {
  EXPERIENCE_CANONICAL_IDS,
  FORMAT_LANDING_ORDER,
} from './formatNormalize.js';

/**
 * @typedef {{ id: string, label: string, value: string, icon?: string }} AtAGlanceItem
 * @typedef {{
 *   id: string,
 *   name: string,
 *   shortDescription: string,
 *   tileTone: string,
 *   tileLabel: string,
 *   atAGlance: AtAGlanceItem[],
 *   whatItIs: string,
 *   whyChooseIt: string[],
 *   goodToKnow: string[],
 *   bestFor: string,
 *   browseCanonicalId: string,
 *   comparison: Record<string, string>,
 * }} FormatContent
 * @typedef {{
 *   id: string,
 *   name: string,
 *   shortDescription: string,
 *   icon: string,
 *   whatItIs: string,
 *   whyChooseIt: { title: string, description: string, icon: string }[],
 *   whatToKnow: string[],
 *   browseCanonicalId: string,
 * }} ExperienceContent
 */

/** @type {Readonly<Record<string, FormatContent>>} */
export const FORMAT_CONTENT = Object.freeze({
  '70mm': Object.freeze({
    id: '70mm',
    name: '70mm',
    shortDescription:
      'Large-format 70mm film projection with exceptional detail and a distinctive analog image.',
    tileTone: 'film',
    tileLabel: '70mm',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Physical 5-perf 70mm film',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'detail',
        label: 'Image detail',
        value: 'Very high (print-dependent)',
        icon: 'spark',
      }),
      Object.freeze({
        id: 'aspect',
        label: 'Aspect ratio',
        value: 'Often ~2.20:1 where applicable',
        icon: 'aspect',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'Depends on release and theater',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      'Conventional theatrical 70mm usually means 5-perforation 70mm projection from large-format photography or a 70mm print. It is distinct from IMAX 70mm (15/70), which uses a horizontal 15-perf frame.',
    whyChooseIt: Object.freeze([
      'Exceptional large-format film detail potential',
      'Analog texture with a grand, big-format image',
      'Rare enough to make a showtime feel like an event',
    ]),
    goodToKnow: Object.freeze([
      'Not the same as IMAX 70mm — no 15/70 tall frame by itself',
      'Print condition and projection setup matter',
      'No standardized HDR or single branded audio system',
    ]),
    bestFor: '65mm-photographed epics, restorations, and film-detail enthusiasts',
    browseCanonicalId: '70mm',
    comparison: Object.freeze({
      projectionMedium: 'Physical film (5-perf 70mm)',
      imageCharacter: 'Large-format film detail + fine grain',
      screenScale: 'Large-format film image; not IMAX 15/70 scale',
      expandedImage: 'No IMAX-style expanded-image requirement',
      contrastHdr: 'No',
      soundEmphasis: 'Depends on release / theater',
      is3d: 'No',
      analogTexture: 'Strong / fine-grained',
      bestFor: 'Large-format film detail',
      biggestCaveat: 'Rarity and print/projection dependence',
    }),
  }),
  imax: Object.freeze({
    id: 'imax',
    name: 'IMAX',
    shortDescription:
      'An immersive large-screen presentation with powerful IMAX sound and, on supported films, expanded image.',
    tileTone: 'imax',
    tileLabel: 'IMAX',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Usually digital',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'expanded',
        label: 'Expanded image',
        value: 'Select films',
        icon: 'expand',
      }),
      Object.freeze({
        id: 'aspect',
        label: 'Aspect ratio',
        value: '1.90:1 or 1.43:1 depending on film and theater',
        icon: 'aspect',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'Premium IMAX audio',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      'IMAX is a premium cinema format built around large screens, specialized projection, proprietary sound, and — for selected films — expanded aspect ratios that reveal more image vertically than a standard theatrical presentation. Modern IMAX is not one single projector configuration.',
    whyChooseIt: Object.freeze([
      'Expanded aspect ratio on supported films',
      'Immersive screen scale',
      'Powerful premium sound as a defining part of the system',
    ]),
    goodToKnow: Object.freeze([
      'IMAX auditoriums vary by theater (screen, projection, max ratio)',
      'Not every movie uses expanded IMAX imagery',
      'The IMAX label alone does not mean film projection — most modern screenings are digital',
      'IMAX is not synonymous with IMAX 70mm',
    ]),
    bestFor: 'Scale, immersion, and films with expanded IMAX framing',
    browseCanonicalId: 'imax',
    comparison: Object.freeze({
      projectionMedium: 'Usually digital for modern screenings',
      imageCharacter: 'High to very high; auditorium/system dependent',
      screenScale: 'Large immersive screen emphasis',
      expandedImage: 'Yes, for films mastered with expanded IMAX framing',
      contrastHdr: 'System dependent (not the defining comparison point)',
      soundEmphasis: 'Yes — a major part of IMAX presentation',
      is3d: 'Sometimes',
      analogTexture: 'No for digital IMAX',
      bestFor: 'Big-screen immersion and expanded image',
      biggestCaveat: 'Auditorium variance; not every title expands',
    }),
  }),
  'xl-amc': Object.freeze({
    id: 'xl-amc',
    name: 'XL at AMC',
    shortDescription:
      'AMC’s larger premium auditorium with bright 4K laser projection on one of the theater’s biggest screens.',
    tileTone: 'xl',
    tileLabel: 'XL',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: '4K Barco laser',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'screen',
        label: 'Screen',
        value: 'Among AMC’s largest auditoriums',
        icon: 'expand',
      }),
      Object.freeze({
        id: 'image',
        label: 'Image',
        value: 'Bright 4K digital',
        icon: 'spark',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'Auditorium dependent',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      'XL at AMC is AMC’s large-screen premium option: its largest screens and auditoriums with premium 4K laser projection by Barco. It is not IMAX or Dolby Cinema, and Reel Seattle only applies this label when the source identifies XL at AMC.',
    whyChooseIt: Object.freeze([
      'Bigger AMC auditorium and screen than a standard house',
      'Bright 4K laser projection',
      'Straightforward premium upgrade when IMAX or Dolby timing is less convenient',
    ]),
    goodToKnow: Object.freeze([
      'No proprietary IMAX-style expanded image',
      'Not Dolby Vision; sound is not a single branded core spec',
      'Do not confuse with generic “XL” labels from other exhibitors',
    ]),
    bestFor: 'Mainstream spectacle wanting a bigger, brighter AMC screen',
    browseCanonicalId: 'xl-amc',
    comparison: Object.freeze({
      projectionMedium: 'Digital 4K laser',
      imageCharacter: 'Clean, bright 4K laser',
      screenScale: 'Larger AMC auditorium / screen',
      expandedImage: 'No proprietary expanded-image standard',
      contrastHdr: 'Brighter laser, but not Dolby Vision',
      soundEmphasis: 'Auditorium dependent; not the core branded feature',
      is3d: 'May vary by title/location',
      analogTexture: 'No',
      bestFor: 'Bigger AMC auditorium + 4K laser',
      biggestCaveat: 'Fewer unique format-specific features than IMAX/Dolby',
    }),
  }),
  'reald-3d': Object.freeze({
    id: 'reald-3d',
    name: 'RealD 3D',
    shortDescription:
      'Stereoscopic 3D projection using polarized glasses to add visible depth to the image.',
    tileTone: 'reald',
    tileLabel: '3D',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Digital stereoscopic',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'glasses',
        label: 'Glasses',
        value: 'Polarized 3D glasses required',
        icon: 'eye',
      }),
      Object.freeze({
        id: 'feature',
        label: 'Defining feature',
        value: 'Stereoscopic depth',
        icon: 'spark',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'Depends on auditorium',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      'RealD 3D is a stereoscopic digital cinema system. Viewers wear polarized glasses while separate left- and right-eye images create a perception of depth. The defining feature is 3D — not screen size, HDR, or a specific audio system.',
    whyChooseIt: Object.freeze([
      'Visible stereoscopic depth',
      'Strong fit for films authored or carefully converted for 3D',
      'Can transform animation and VFX-heavy spectacle',
    ]),
    goodToKnow: Object.freeze([
      'Glasses required; perceived brightness is often reduced versus 2D',
      'Some viewers experience eye strain or discomfort',
      'Generic “3D” tags are not automatically treated as RealD',
    ]),
    bestFor: 'Films designed around depth and stereoscopic presentation',
    browseCanonicalId: 'reald-3d',
    comparison: Object.freeze({
      projectionMedium: 'Digital stereoscopic',
      imageCharacter: 'Depends on base projection; depth is the feature',
      screenScale: 'Not inherently larger',
      expandedImage: 'No',
      contrastHdr: 'Glasses often reduce perceived brightness',
      soundEmphasis: 'Depends on auditorium',
      is3d: 'Yes',
      analogTexture: 'No',
      bestFor: 'Stereoscopic depth',
      biggestCaveat: 'Glasses, brightness, and comfort tradeoffs',
    }),
  }),
  'dolby-cinema': Object.freeze({
    id: 'dolby-cinema',
    name: 'Dolby Cinema',
    shortDescription:
      'Dolby Vision picture and Dolby Atmos sound for deep contrast, vivid highlights, and immersive spatial audio.',
    tileTone: 'dolby',
    tileLabel: 'Dolby',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Dolby Vision digital',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'contrast',
        label: 'Contrast / HDR',
        value: 'Major strength',
        icon: 'spark',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'Dolby Atmos',
        icon: 'sound',
      }),
      Object.freeze({
        id: 'expanded',
        label: 'Expanded image',
        value: 'No IMAX-style expansion',
        icon: 'expand',
      }),
    ]),
    whatItIs:
      'Dolby Cinema combines Dolby Vision premium imaging and Dolby Atmos spatial audio in a purpose-designed premium auditorium. Reel Seattle only uses this label when the source identifies Dolby Cinema — Dolby Atmos alone is not enough.',
    whyChooseIt: Object.freeze([
      'Deep blacks, bright highlights, and strong contrast',
      'Immersive Dolby Atmos spatial sound',
      'A consistent premium picture + sound package',
    ]),
    goodToKnow: Object.freeze([
      'No proprietary expanded aspect ratio comparable to IMAX',
      'Screen geometry may feel less enormous than the largest IMAX houses',
      'Atmos-only screenings are not automatically Dolby Cinema',
    ]),
    bestFor: 'Contrast, HDR-rich photography, and elaborate sound design',
    browseCanonicalId: 'dolby-cinema',
    comparison: Object.freeze({
      projectionMedium: 'Digital (Dolby Vision)',
      imageCharacter: 'Very high contrast / HDR emphasis',
      screenScale: 'Premium auditorium; not IMAX-tall framing',
      expandedImage: 'No proprietary expanded-image benefit',
      contrastHdr: 'Major strength — Dolby Vision',
      soundEmphasis: 'Major strength — Dolby Atmos',
      is3d: 'Not the defining feature',
      analogTexture: 'No',
      bestFor: 'Premium contrast + spatial sound',
      biggestCaveat: 'No expanded IMAX frame',
    }),
  }),
  'imax-70mm': Object.freeze({
    id: 'imax-70mm',
    name: 'IMAX 70mm',
    shortDescription:
      'Rare 15/70 IMAX film projection with enormous image area and up to a 1.43:1 expanded frame.',
    tileTone: 'imax70',
    tileLabel: 'IMAX 70',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Physical 15/70 IMAX film',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'frame',
        label: 'Frame',
        value: 'Horizontal 15-perf',
        icon: 'film',
      }),
      Object.freeze({
        id: 'aspect',
        label: 'Aspect ratio',
        value: 'Up to 1.43:1 when supported',
        icon: 'aspect',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'IMAX presentation',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      'IMAX 70mm is the analog IMAX film system (15/70): a 70mm print runs horizontally with 15 perforations per frame and can support the extremely tall 1.43:1 IMAX image. It is distinct from conventional 5-perf 70mm.',
    whyChooseIt: Object.freeze([
      'Exceptional large-format analog detail potential',
      'Full 1.43:1 composition when film and venue support it',
      'Extremely rare special-event presentation',
    ]),
    goodToKnow: Object.freeze([
      'Extremely limited availability',
      'Most valuable when the movie was created to exploit 15/70',
      'Not HDR — appeal is analog image area and scale',
      'Distinct from ordinary 70mm and from digital IMAX',
    ]),
    bestFor: 'Films photographed for IMAX film / 1.43:1 sequences',
    browseCanonicalId: 'imax-70mm',
    comparison: Object.freeze({
      projectionMedium: 'Physical 15-perf 70mm IMAX film',
      imageCharacter: 'Exceptional analog detail',
      screenScale: 'Maximum-scale analog IMAX',
      expandedImage: 'Yes; up to 1.43:1 where supported',
      contrastHdr: 'Film presentation rather than HDR',
      soundEmphasis: 'Yes — IMAX presentation',
      is3d: 'Generally no for current feature engagements',
      analogTexture: 'Strong / fine-grained',
      bestFor: 'Maximum-scale analog IMAX',
      biggestCaveat: 'Extreme rarity',
    }),
  }),
  '35mm': Object.freeze({
    id: '35mm',
    name: '35mm',
    shortDescription:
      'Projected from an actual 35mm film print for a textured, photochemical presentation.',
    tileTone: 'film35',
    tileLabel: '35mm',
    atAGlance: Object.freeze([
      Object.freeze({
        id: 'projection',
        label: 'Projection',
        value: 'Physical 35mm film print',
        icon: 'projector',
      }),
      Object.freeze({
        id: 'texture',
        label: 'Image character',
        value: 'Photochemical grain & texture',
        icon: 'film',
      }),
      Object.freeze({
        id: 'condition',
        label: 'Condition',
        value: 'Varies by print',
        icon: 'info',
      }),
      Object.freeze({
        id: 'sound',
        label: 'Sound',
        value: 'No format-specific audio requirement',
        icon: 'sound',
      }),
    ]),
    whatItIs:
      '35mm is the traditional motion-picture film gauge. For a Reel Seattle screening labeled 35mm, the movie is projected from a physical film print — not merely shot on film and shown digitally.',
    whyChooseIt: Object.freeze([
      'Authentic photochemical presentation',
      'Distinct grain and analog texture',
      'Historical / repertory event appeal',
    ]),
    goodToKnow: Object.freeze([
      'Print condition varies — wear, dust, or instability can appear',
      'Not automatically higher fidelity than a pristine digital restoration',
      'No standardized premium sound or HDR benefit',
    ]),
    bestFor: 'Repertory cinema and viewers who value film texture',
    browseCanonicalId: '35mm',
    comparison: Object.freeze({
      projectionMedium: 'Physical film',
      imageCharacter: 'Filmic / textured; print-dependent',
      screenScale: 'Standard theatrical (not a premium-scale brand)',
      expandedImage: 'No special expanded-image standard',
      contrastHdr: 'No',
      soundEmphasis: 'No format-specific audio requirement',
      is3d: 'No',
      analogTexture: 'Strong',
      bestFor: 'Classic photochemical presentation',
      biggestCaveat: 'Print condition variability',
    }),
  }),
});

/** @type {Readonly<Record<string, ExperienceContent>>} */
export const EXPERIENCE_CONTENT = Object.freeze({
  'open-caption': Object.freeze({
    id: 'open-caption',
    name: 'Open Caption',
    shortDescription:
      'Captions appear directly on the movie screen for everyone in the auditorium.',
    cardSummary: 'Captions appear on screen for everyone.',
    icon: 'caption',
    whatItIs:
      'Open Caption screenings show dialogue and relevant sound information as text directly on the screen. Unlike closed-caption devices, every viewer sees the captions — no separate caption device or app is required.',
    whyChooseIt: Object.freeze([
      Object.freeze({
        title: 'Easy to follow',
        description:
          'Read along with dialogue and key sound information without extra hardware.',
        icon: 'caption',
      }),
      Object.freeze({
        title: 'Everyone welcome',
        description:
          'Designed for Deaf and hard-of-hearing viewers, and helpful whenever dialogue is hard to catch.',
        icon: 'people',
      }),
      Object.freeze({
        title: 'No extra gear',
        description:
          'Captions are built into the presentation — no apps, glasses, or headsets required.',
        icon: 'check',
      }),
    ]),
    whatToKnow: Object.freeze([
      'Captions are visible to everyone and cannot be individually turned off',
      'Placement and style may vary by theater and title',
      'Not all films or showtimes include open captions',
      'This is not the same as translated “subtitles” unless the source means that',
    ]),
    browseCanonicalId: 'open-caption',
  }),
  'audio-description': Object.freeze({
    id: 'audio-description',
    name: 'Audio Description',
    shortDescription:
      'An optional narration track describes important visual action through a theater-provided headset.',
    cardSummary: 'Narration of visual action via headset.',
    icon: 'headphones',
    whatItIs:
      'Audio Description provides spoken narration describing important visual information during natural gaps in dialogue. In theaters it is typically delivered through assistive hardware or a headset, while the normal soundtrack remains present for everyone.',
    whyChooseIt: Object.freeze([
      Object.freeze({
        title: 'Visual story access',
        description:
          'Actions, expressions, settings, and other visual details are described for blind and low-vision viewers.',
        icon: 'eye',
      }),
      Object.freeze({
        title: 'Stay with your group',
        description:
          'Usually lets you attend a standard screening without changing the auditorium mix for others.',
        icon: 'people',
      }),
      Object.freeze({
        title: 'Optional track',
        description:
          'Narration is generally heard only through the user’s device — not over house speakers.',
        icon: 'headphones',
      }),
    ]),
    whatToKnow: Object.freeze([
      'Depends on theater assistive-listening hardware being available and working',
      'Device implementation can vary by theater',
      'Not captions, an alternate-language dub, or “enhanced audio”',
    ]),
    browseCanonicalId: 'audio-description',
  }),
  'live-score': Object.freeze({
    id: 'live-score',
    name: 'Live Score',
    shortDescription:
      'The film screens while musicians perform its score live in sync with the picture.',
    cardSummary: 'Musicians perform the score live with the film.',
    icon: 'music',
    whatItIs:
      'A Live Score screening presents the movie while musicians perform the film’s score live and synchronized to picture — orchestra, ensemble, organ, piano, band, or another live group. It is a hybrid movie-plus-concert event, not a conventional screening.',
    whyChooseIt: Object.freeze([
      Object.freeze({
        title: 'Unique live performance',
        description:
          'The score becomes a central, physical part of the night.',
        icon: 'music',
      }),
      Object.freeze({
        title: 'Special-event energy',
        description:
          'Often feels closer to a concert than a standard showtime.',
        icon: 'spark',
      }),
      Object.freeze({
        title: 'Iconic scores & silent cinema',
        description:
          'Especially powerful for celebrated scores and silent-film presentations.',
        icon: 'film',
      }),
    ]),
    whatToKnow: Object.freeze([
      'Usually more expensive and limited to one or a few performances',
      'Venue seating may prioritize musicians as well as screen sightlines',
      'Do not classify ordinary concert films or musician biopics as Live Score',
    ]),
    browseCanonicalId: 'live-score',
  }),
});

/** Comparison table row definitions (attribute column). */
export const COMPARE_ATTRIBUTES = Object.freeze([
  Object.freeze({
    id: 'projectionMedium',
    label: 'Projection medium',
  }),
  Object.freeze({
    id: 'imageCharacter',
    label: 'Image character / detail',
  }),
  Object.freeze({
    id: 'screenScale',
    label: 'Screen / scale emphasis',
  }),
  Object.freeze({
    id: 'expandedImage',
    label: 'Expanded image',
  }),
  Object.freeze({
    id: 'contrastHdr',
    label: 'Contrast / HDR emphasis',
  }),
  Object.freeze({
    id: 'soundEmphasis',
    label: 'Sound emphasis',
  }),
  Object.freeze({
    id: 'is3d',
    label: '3D',
  }),
  Object.freeze({
    id: 'analogTexture',
    label: 'Analog texture',
  }),
  Object.freeze({
    id: 'bestFor',
    label: 'Best for',
  }),
  Object.freeze({
    id: 'biggestCaveat',
    label: 'Biggest caveat',
  }),
  Object.freeze({
    id: 'availability',
    label: 'Currently in Seattle',
  }),
]);

export const COMPARE_INTRO = Object.freeze({
  title: 'Compare formats',
  description:
    'Every format has its strengths. Here’s how they compare so you can choose the right experience for your movie.',
  provisoTitle: 'No single format is best for every film.',
  provisoBody:
    'Factors like the movie’s presentation, the theater, and your preferences all play a role in your experience.',
  availabilityNote:
    'Availability changes frequently. Check individual showtimes for format and experience details.',
  helpLabel: 'Need help choosing?',
  helpTitle: 'Help me choose a format',
  helpBody: 'Get a quick recommendation',
});

/** @typedef {'immersive-screen'|'picture-sound'|'on-film'|'watch-3d'|'easy-premium'} RecommendPriorityId */

export const RECOMMEND_PRIORITIES = Object.freeze([
  Object.freeze({
    id: 'immersive-screen',
    label: 'Biggest, most immersive screen',
    icon: 'expand',
  }),
  Object.freeze({
    id: 'picture-sound',
    label: 'Best picture + sound',
    icon: 'spark',
  }),
  Object.freeze({
    id: 'on-film',
    label: 'See it on film',
    icon: 'film',
  }),
  Object.freeze({
    id: 'watch-3d',
    label: 'Watch in 3D',
    icon: 'eye',
  }),
  Object.freeze({
    id: 'easy-premium',
    label: 'Premium but easy to find',
    icon: 'ticket',
  }),
]);

export const RECOMMEND_COPY = Object.freeze({
  title: 'Help me choose a format',
  subtitle:
    'Start with what matters most, then match it to the right screening.',
  priorityHeading: 'What matters most?',
  bestMatchHeading: 'Best match',
  alsoConsiderHeading: 'Also consider',
  ruleOfThumb:
    'If IMAX 70mm is available for a film, it’s usually a presentation worth seeking out. Otherwise, choose the format that best matches what you care about.',
  compareCta: 'Compare all formats',
  browseCta: 'Browse Seattle showtimes',
});

export const LANDING_COPY = Object.freeze({
  title: 'Formats & Experiences',
  tagline:
    'Learn what each format or accessibility option means and find where it’s available in Seattle.',
  formatsHeading: 'Formats',
  experiencesHeading: 'Experiences',
  filtersLabel: 'Filters',
  countTemplate: (formatCount, experienceCount) =>
    `${formatCount} formats • ${experienceCount} experiences`,
});

/**
 * @returns {FormatContent[]}
 */
export function listFormatContent() {
  return FORMAT_LANDING_ORDER.map((id) => FORMAT_CONTENT[id]).filter(Boolean);
}

/**
 * @returns {ExperienceContent[]}
 */
export function listExperienceContent() {
  return EXPERIENCE_CANONICAL_IDS.map((id) => EXPERIENCE_CONTENT[id]).filter(
    Boolean,
  );
}

/**
 * @param {string} id
 * @returns {FormatContent | null}
 */
export function getFormatContent(id) {
  return FORMAT_CONTENT[id] ?? null;
}

/**
 * @param {string} id
 * @returns {ExperienceContent | null}
 */
export function getExperienceContent(id) {
  return EXPERIENCE_CONTENT[id] ?? null;
}
