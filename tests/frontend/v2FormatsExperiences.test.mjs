import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLLECTION_IDS } from '../../v2/explore/exploreIds.js';
import {
  createInitialNavState,
  navigateBack,
  openCollection,
  openCompareFormats,
  openExperienceDetail,
  openFormatDetail,
  openFormatRecommendation,
  openShowtimesBrowse,
} from '../../v2/navigation/navState.js';
import { resolveActivePrimaryId } from '../../v2/destinations.js';
import {
  canonicalToBrowseFormatKey,
  classifyFormatLabel,
  EXPERIENCE_CANONICAL_IDS,
  FORMAT_LANDING_ORDER,
  normalizeCanonicalExperience,
  normalizeCanonicalFormat,
  opportunityMatchesCanonical,
} from '../../v2/formatsExperiences/formatNormalize.js';
import {
  FORMAT_CONTENT,
  EXPERIENCE_CONTENT,
  listFormatContent,
  listExperienceContent,
} from '../../v2/formatsExperiences/formatsExperiencesContent.js';
import {
  countAvailabilityForCanonical,
  formatTheaterAvailabilityLabel,
  resolveAvailabilityMap,
} from '../../v2/formatsExperiences/availability.js';
import { recommendFormats } from '../../v2/formatsExperiences/recommendationLogic.js';
import {
  composeCompareFormats,
  composeExperienceDetail,
  composeFormatDetail,
  composeFormatRecommendation,
  composeFormatsExperiencesLanding,
} from '../../v2/formatsExperiences/composeFormatsExperiencesPresentation.js';
import {
  ensureSelectedBrowseFormatOptions,
  normalizeBrowseFormat,
} from '../../v2/showtimes/showtimesBrowseModel.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const APP_SRC = readFileSync(join(ROOT, 'v2/V2App.jsx'), 'utf8');
const HOME_SRC = readFileSync(join(ROOT, 'v2/HomeDestination.jsx'), 'utf8');
const LANDING_SRC = readFileSync(
  join(ROOT, 'v2/formatsExperiences/FormatsExperiencesSurface.jsx'),
  'utf8',
);
const BACK_SRC = readFileSync(
  join(ROOT, 'v2/formatsExperiences/BackButton.jsx'),
  'utf8',
);
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

/** Fixed Pacific afternoon: 2026-08-01 15:00 PDT */
const NOW = new Date('2026-08-01T22:00:00.000Z');

function sampleHome() {
  return {
    films: [
      { filmKey: 'f1', title: 'Alpha' },
      { filmKey: 'f2', title: 'Beta' },
    ],
    opportunities: [
      {
        opportunityKey: 'o1',
        filmKey: 'f1',
        theaterId: 't-imax',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-08-02',
        localTime: '19:00',
        sortableLocalDateTime: '2026-08-02T19:00',
        formatLabels: ['imax-at-amc'],
      },
      {
        opportunityKey: 'o2',
        filmKey: 'f1',
        theaterId: 't-dolby',
        theaterName: 'AMC Oak Tree',
        localDate: '2026-08-03',
        localTime: '18:00',
        sortableLocalDateTime: '2026-08-03T18:00',
        formatLabels: ['dolby-cinema-at-amc'],
      },
      {
        opportunityKey: 'o3',
        filmKey: 'f2',
        theaterId: 't-xl-a',
        theaterName: 'AMC Seattle',
        localDate: '2026-08-02',
        localTime: '20:00',
        sortableLocalDateTime: '2026-08-02T20:00',
        formatLabels: ['xl-at-amc'],
      },
      {
        opportunityKey: 'o4',
        filmKey: 'f2',
        theaterId: 't-xl-b',
        theaterName: 'AMC Factoria',
        localDate: '2026-08-04',
        localTime: '21:00',
        sortableLocalDateTime: '2026-08-04T21:00',
        formatLabels: ['xl-at-amc'],
      },
      {
        opportunityKey: 'o5',
        filmKey: 'f1',
        theaterId: 't-oc',
        theaterName: 'SIFF Uptown',
        localDate: '2026-08-02',
        localTime: '16:00',
        sortableLocalDateTime: '2026-08-02T16:00',
        formatLabels: ['open-caption'],
      },
      {
        opportunityKey: 'o6',
        filmKey: 'f2',
        theaterId: 't-reald',
        theaterName: 'AMC Pacific Place',
        localDate: '2026-08-05',
        localTime: '17:00',
        sortableLocalDateTime: '2026-08-05T17:00',
        formatLabels: ['reald-3d'],
      },
      {
        opportunityKey: 'o7',
        filmKey: 'f1',
        theaterId: 't-70',
        theaterName: 'The Beacon Cinema',
        localDate: '2026-08-03',
        localTime: '19:30',
        sortableLocalDateTime: '2026-08-03T19:30',
        formatLabels: ['70mm'],
      },
    ],
  };
}

test('Home quick path still opens Formats & Experiences collection', () => {
  assert.match(HOME_SRC, /rowId === 'formats'/);
  assert.match(HOME_SRC, /COLLECTION_IDS\.formats/);
  let nav = createInitialNavState();
  nav = openCollection(nav, {
    collectionId: COLLECTION_IDS.formats,
    originPrimary: 'home',
  });
  assert.equal(nav.surface?.type, 'collection');
  assert.equal(nav.surface?.collectionId, COLLECTION_IDS.formats);
  assert.equal(resolveActivePrimaryId(nav), 'explore');
});

test('V2App routes formats collection to designed FormatsExperiencesSurface', () => {
  assert.match(APP_SRC, /FormatsExperiencesSurface/);
  assert.match(APP_SRC, /isFormatsExperiences/);
  assert.match(APP_SRC, /FormatDetailSurface/);
  assert.match(APP_SRC, /ExperienceDetailSurface/);
  assert.match(APP_SRC, /CompareFormatsSurface/);
  assert.match(APP_SRC, /FormatRecommendationSurface/);
  assert.equal(APP_SRC.includes('Explore · scaffold'), false);
});

test('Landing content includes seven formats and three experiences', () => {
  assert.equal(listFormatContent().length, 7);
  assert.equal(listExperienceContent().length, 3);
  assert.deepEqual([...FORMAT_LANDING_ORDER], [
    '70mm',
    'imax',
    'xl-amc',
    'reald-3d',
    'dolby-cinema',
    'imax-70mm',
    '35mm',
  ]);
  assert.deepEqual([...EXPERIENCE_CANONICAL_IDS], [
    'open-caption',
    'audio-description',
    'live-score',
  ]);
  const landing = composeFormatsExperiencesLanding(sampleHome(), { now: NOW });
  assert.equal(landing.formats.length, 7);
  assert.equal(landing.experiences.length, 3);
  assert.equal(landing.countLabel, '7 formats • 3 experiences');
  assert.match(landing.copy.tagline, /accessibility option/);
  assert.match(LANDING_SRC, /data-fe-section="formats"/);
  assert.match(LANDING_SRC, /data-fe-section="experiences"/);
  assert.match(LANDING_SRC, /Filters/);
});

test('Icon-only BackButton replaces purple text back links', () => {
  assert.match(BACK_SRC, /aria-label=\{label\}/);
  assert.match(BACK_SRC, /v2-fe-back/);
  assert.match(BACK_SRC, /IconChevronLeft/);
  assert.equal(LANDING_SRC.includes('← Explore'), false);
  assert.equal(LANDING_SRC.includes('← Formats'), false);
  assert.match(CSS, /\.v2-fe-back\b/);
});

test('Format and experience detail composers use Markdown content', () => {
  const imax = composeFormatDetail('imax', sampleHome(), { now: NOW });
  assert.equal(imax.name, 'IMAX');
  assert.match(imax.whatItIs, /not one single projector/);
  assert.ok(imax.whyChooseIt.length >= 3);
  assert.ok(imax.goodToKnow.some((g) => /not synonymous with IMAX 70mm/i.test(g)));
  assert.equal(imax.browseFormatKey, 'imax');
  assert.match(imax.availabilityLabel, /theater/);

  const oc = composeExperienceDetail('open-caption', sampleHome(), {
    now: NOW,
  });
  assert.equal(oc.name, 'Open Caption');
  assert.match(oc.whatItIs, /directly on the screen/i);
  assert.equal(
    oc.whatToKnow.some((t) => /always appear specifically at the bottom/i.test(t)),
    false,
  );
  assert.equal(oc.browseFormatKey, 'open captions');
});

test('Compare formats includes all seven columns and editorial proviso', () => {
  const compare = composeCompareFormats(sampleHome(), { now: NOW });
  assert.equal(compare.columns.length, 7);
  assert.equal(compare.intro.provisoTitle, 'No single format is best for every film.');
  assert.equal(compare.intro.helpBody, 'Get a quick recommendation');
  assert.ok(compare.attributes.some((a) => a.id === 'expandedImage'));
  assert.ok(compare.attributes.some((a) => a.id === 'availability'));
  const imaxCol = compare.columns.find((c) => c.id === 'imax');
  assert.match(imaxCol.cells.projectionMedium, /Usually digital/i);
  assert.equal(/dual laser/i.test(imaxCol.cells.projectionMedium), false);
});

test('Help Me Choose updates deterministically per priority', () => {
  const availability = resolveAvailabilityMap(
    sampleHome(),
    FORMAT_LANDING_ORDER,
    { now: NOW },
  );

  const immersive = recommendFormats('immersive-screen', availability);
  assert.equal(immersive.bestMatchId, 'imax');

  const picture = recommendFormats('picture-sound', availability);
  assert.equal(picture.bestMatchId, 'dolby-cinema');

  const film = recommendFormats('on-film', availability);
  assert.equal(film.bestMatchId, '70mm');

  const threeD = recommendFormats('watch-3d', availability);
  assert.equal(threeD.bestMatchId, 'reald-3d');

  const easy = recommendFormats('easy-premium', availability);
  assert.equal(easy.bestMatchId, 'xl-amc');

  const ui = composeFormatRecommendation('picture-sound', sampleHome(), {
    now: NOW,
  });
  assert.equal(ui.bestMatch.name, 'Dolby Cinema');
  assert.ok(ui.alsoConsider.length >= 1);
  assert.match(ui.ruleOfThumb, /IMAX 70mm/);
});

test('Navigation stack: landing → detail → compare → recommend → back', () => {
  let nav = openCollection(createInitialNavState(), {
    collectionId: COLLECTION_IDS.formats,
    originPrimary: 'home',
  });
  const landing = nav.surface;
  nav = openFormatDetail(nav, {
    formatId: 'imax',
    originPrimary: 'home',
    returnSurface: landing,
  });
  assert.equal(nav.surface.type, 'format-detail');
  assert.equal(nav.surface.formatId, 'imax');

  nav = openCompareFormats(nav, {
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'compare-formats');

  nav = openFormatRecommendation(nav, {
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'format-recommendation');

  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'compare-formats');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'format-detail');
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'collection');
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.formats);

  nav = openExperienceDetail(nav, {
    experienceId: 'open-caption',
    originPrimary: 'home',
    returnSurface: nav.surface,
  });
  assert.equal(nav.surface.type, 'experience-detail');
  nav = navigateBack(nav);
  assert.equal(nav.surface.collectionId, COLLECTION_IDS.formats);
});

test('Showtime CTAs pass browse format keys and restore returnSurface', () => {
  let nav = openFormatDetail(createInitialNavState(), {
    formatId: 'imax',
    originPrimary: 'explore',
    returnSurface: {
      type: 'collection',
      collectionId: COLLECTION_IDS.formats,
      originPrimary: 'explore',
    },
  });
  const detail = nav.surface;
  const browseKey = canonicalToBrowseFormatKey('imax');
  assert.equal(browseKey, 'imax');
  assert.equal(normalizeBrowseFormat('imax-at-amc')?.key, 'imax');

  nav = openShowtimesBrowse(nav, {
    originPrimary: 'explore',
    returnSurface: detail,
    browseUi: {
      dateMode: 'week',
      theaterIds: [],
      formatKeys: [browseKey],
      timeRangeId: 'any',
      expandedFilmKey: null,
      scrollY: 0,
    },
  });
  assert.equal(nav.surface.type, 'showtimes-browse');
  assert.deepEqual(nav.surface.browseUi.formatKeys, ['imax']);
  nav = navigateBack(nav);
  assert.equal(nav.surface.type, 'format-detail');
  assert.equal(nav.surface.formatId, 'imax');
});

test('Zero-result deep-link filters remain visible in Showtimes Browse', () => {
  assert.deepEqual(
    ensureSelectedBrowseFormatOptions([], ['imax 70mm', 'live score']),
    [
      { key: 'imax 70mm', label: 'IMAX 70mm', count: 0 },
      { key: 'live score', label: 'Live Score', count: 0 },
    ],
  );
});

test('Availability counts distinct theaters with current matching showtimes', () => {
  const home = sampleHome();
  const map = resolveAvailabilityMap(home, ['imax', 'xl-amc', 'open-caption'], {
    now: NOW,
  });
  assert.equal(map.imax.theaterCount, 1);
  assert.equal(map['xl-amc'].theaterCount, 2);
  assert.equal(map['open-caption'].theaterCount, 1);
  assert.equal(formatTheaterAvailabilityLabel(2), '2 theaters in Seattle');
  assert.equal(formatTheaterAvailabilityLabel(0), 'No current showtimes');

  const xl = countAvailabilityForCanonical(home.opportunities, 'xl-amc');
  assert.equal(xl.theaterCount, 2);
});

test('Normalization avoids false Dolby Atmos / bare XL / generic 3D mappings', () => {
  assert.equal(normalizeCanonicalFormat('Dolby Atmos'), null);
  assert.equal(normalizeCanonicalFormat('dolby-atmos'), null);
  assert.equal(normalizeCanonicalFormat('Dolby Cinema'), 'dolby-cinema');
  assert.equal(normalizeCanonicalFormat('dolby-cinema-at-amc'), 'dolby-cinema');

  assert.equal(normalizeCanonicalFormat('XL'), null);
  assert.equal(normalizeCanonicalFormat('XL', { exhibitorHint: 'Regal' }), null);
  assert.equal(
    normalizeCanonicalFormat('XL', { exhibitorHint: 'AMC Seattle' }),
    'xl-amc',
  );
  assert.equal(normalizeCanonicalFormat('XL at AMC'), 'xl-amc');
  assert.equal(normalizeCanonicalFormat('xl-at-amc'), 'xl-amc');

  assert.equal(normalizeCanonicalFormat('3D'), null);
  assert.equal(normalizeCanonicalFormat('RealD 3D'), 'reald-3d');

  assert.equal(normalizeCanonicalFormat('IMAX'), 'imax');
  assert.equal(normalizeCanonicalFormat('IMAX 70MM'), 'imax-70mm');
  assert.equal(normalizeCanonicalFormat('15/70 IMAX'), 'imax-70mm');
  assert.notEqual(
    normalizeCanonicalFormat('IMAX'),
    normalizeCanonicalFormat('IMAX 70MM'),
  );

  assert.equal(normalizeCanonicalExperience('Open Captions'), 'open-caption');
  assert.equal(normalizeCanonicalExperience('OC'), 'open-caption');
  assert.equal(normalizeCanonicalExperience('Audio Description'), 'audio-description');
  assert.equal(normalizeCanonicalExperience('Live Orchestra'), 'live-score');

  assert.deepEqual(classifyFormatLabel('dolby-atmos'), {
    formatId: null,
    experienceId: null,
  });
});

test('Opportunity matching keeps IMAX and IMAX 70mm distinct', () => {
  const imaxOpp = { formatLabels: ['imax-at-amc'], theaterName: 'AMC' };
  const imax70Opp = { formatLabels: ['IMAX 70MM'], theaterName: 'SIFF' };
  assert.equal(opportunityMatchesCanonical(imaxOpp, 'imax'), true);
  assert.equal(opportunityMatchesCanonical(imaxOpp, 'imax-70mm'), false);
  assert.equal(opportunityMatchesCanonical(imax70Opp, 'imax-70mm'), true);
  assert.equal(opportunityMatchesCanonical(imax70Opp, 'imax'), false);
  assert.equal(opportunityMatchesCanonical(imax70Opp, '70mm'), false);
});

test('All format/experience content ids are present', () => {
  for (const id of FORMAT_LANDING_ORDER) {
    assert.ok(FORMAT_CONTENT[id], `missing format ${id}`);
  }
  for (const id of EXPERIENCE_CANONICAL_IDS) {
    assert.ok(EXPERIENCE_CONTENT[id], `missing experience ${id}`);
  }
});

test('CSS covers key Formats & Experiences layout regions', () => {
  assert.match(CSS, /\.v2-fe-page\b/);
  assert.match(CSS, /\.v2-fe-format-card\b/);
  assert.match(CSS, /\.v2-fe-experience-grid\b/);
  assert.match(CSS, /\.v2-fe-compare-table\b/);
  assert.match(CSS, /\.v2-fe-priority-row-selected\b/);
  assert.match(CSS, /\.v2-fe-compare-scroll\b/);
  assert.match(CSS, /prefers-reduced-motion/);
});

test('Landing filters can hide unavailable rows', () => {
  const filtered = composeFormatsExperiencesLanding(sampleHome(), {
    now: NOW,
    filters: { availableOnly: true },
  });
  assert.ok(filtered.formats.every((f) => f.hasCurrentShowtimes));
  assert.ok(filtered.experiences.every((e) => e.hasCurrentShowtimes));
  assert.ok(filtered.formats.some((f) => f.id === 'xl-amc'));
  assert.equal(
    filtered.formats.some((f) => f.id === '35mm'),
    false,
  );
});
