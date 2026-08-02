import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emptyTheaterImagery,
  normalizeTheaterImageRef,
  resolveTheaterImagery,
  resolveTheaterImageUrl,
  THEATER_IMAGE_REPO_PREFIXES,
} from '../../v2/theaters/resolveTheaterImagery.js';
import { resolveTheaterPresentation } from '../../v2/theaters/resolveTheaterPresentation.js';
import { composeTheatersListPresentation } from '../../v2/theaters/composeTheatersListPresentation.js';
import { composeTheaterDetailPresentation } from '../../v2/theaters/composeTheaterDetailPresentation.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_SVG = '/theater-images/fixtures/venue-placeholder.svg';

const SURFACE_LIST = readFileSync(
  join(ROOT, 'v2/theaters/TheatersSurface.jsx'),
  'utf8',
);
const SURFACE_DETAIL = readFileSync(
  join(ROOT, 'v2/theaters/TheaterDetailSurface.jsx'),
  'utf8',
);
const VENUE_IMAGE = readFileSync(
  join(ROOT, 'v2/theaters/TheaterVenueImage.jsx'),
  'utf8',
);
const SCHEMA = readFileSync(
  join(ROOT, 'schema/theaters/v1.1.0.json'),
  'utf8',
);

test('allowlisted repo prefixes are stable', () => {
  assert.deepEqual([...THEATER_IMAGE_REPO_PREFIXES], ['/theater-images/']);
});

test('normalize accepts absolute https and allowlisted relative paths', () => {
  assert.equal(
    normalizeTheaterImageRef('https://cdn.example/venues/beacon.jpg'),
    'https://cdn.example/venues/beacon.jpg',
  );
  assert.equal(normalizeTheaterImageRef(FIXTURE_SVG), FIXTURE_SVG);
  assert.equal(normalizeTheaterImageRef(`  ${FIXTURE_SVG}  `), FIXTURE_SVG);
});

test('normalize rejects invalid metadata', () => {
  assert.equal(normalizeTheaterImageRef(null), null);
  assert.equal(normalizeTheaterImageRef(''), null);
  assert.equal(normalizeTheaterImageRef('javascript:alert(1)'), null);
  assert.equal(normalizeTheaterImageRef('data:image/png;base64,abc'), null);
  assert.equal(normalizeTheaterImageRef('//evil.example/x.jpg'), null);
  assert.equal(normalizeTheaterImageRef('/images/outside.jpg'), null);
  assert.equal(
    normalizeTheaterImageRef('/theater-images/../secret.jpg'),
    null,
  );
  assert.equal(
    normalizeTheaterImageRef('Theater Data/siff_cinema_downtown_image.jpg'),
    null,
  );
  assert.equal(normalizeTheaterImageRef('relative/no-slash.jpg'), null);
});

test('theater with shared image_url resolves hero and thumbnail', () => {
  const imagery = resolveTheaterImagery({
    image_url: FIXTURE_SVG,
    image_attribution: 'Reel Seattle fixture',
    image_license: 'Original work',
  });
  assert.equal(imagery.hasImage, true);
  assert.equal(imagery.heroUrl, FIXTURE_SVG);
  assert.equal(imagery.thumbnailUrl, FIXTURE_SVG);
  assert.equal(imagery.attribution, 'Reel Seattle fixture');
  assert.equal(imagery.license, 'Original work');
  assert.equal(resolveTheaterImageUrl({ image_url: FIXTURE_SVG }), FIXTURE_SVG);
});

test('optional hero and thumbnail fields take precedence', () => {
  const imagery = resolveTheaterImagery({
    image_url: 'https://cdn.example/shared.jpg',
    image_hero_url: 'https://cdn.example/hero.jpg',
    image_thumbnail_url: 'https://cdn.example/thumb.jpg',
    image_attribution: 'Venue permission 2026',
  });
  assert.equal(imagery.heroUrl, 'https://cdn.example/hero.jpg');
  assert.equal(imagery.thumbnailUrl, 'https://cdn.example/thumb.jpg');
});

test('theater without image returns empty imagery', () => {
  assert.deepEqual(resolveTheaterImagery({ id: 'the-beacon' }), emptyTheaterImagery());
  assert.deepEqual(resolveTheaterImagery(null), emptyTheaterImagery());
  assert.equal(resolveTheaterImageUrl({}), null);
});

test('invalid image metadata fails closed to placeholder path', () => {
  const imagery = resolveTheaterImagery({
    image_url: 'javascript:void(0)',
    image_attribution: 'Should not matter',
  });
  assert.equal(imagery.hasImage, false);
  assert.equal(imagery.heroUrl, null);
  assert.equal(imagery.thumbnailUrl, null);
});

test('presentation wires imagery into list and detail composers', () => {
  const theater = {
    id: 'the-beacon',
    name: 'The Beacon',
    enabled: true,
    image_hero_url: 'https://cdn.example/hero.jpg',
    image_thumbnail_url: FIXTURE_SVG,
    image_attribution: 'Beacon Cinema',
    image_license: 'Permission',
  };
  const card = resolveTheaterPresentation({ theater, context: 'list' });
  assert.equal(card.heroImageUrl, 'https://cdn.example/hero.jpg');
  assert.equal(card.thumbnailUrl, FIXTURE_SVG);
  assert.equal(card.imageUrl, FIXTURE_SVG);
  assert.equal(card.imageAttribution, 'Beacon Cinema');
  assert.equal(card.sectionsVisible.image, true);

  const homeData = {
    theaterOrder: ['the-beacon'],
    theatersById: { 'the-beacon': theater },
    films: [],
  };
  const list = composeTheatersListPresentation(homeData);
  assert.equal(list.theaters[0].thumbnailUrl, FIXTURE_SVG);
  assert.equal(list.theaters[0].imageUrl, FIXTURE_SVG);

  const detail = composeTheaterDetailPresentation(homeData, 'the-beacon');
  assert.equal(detail.heroImageUrl, 'https://cdn.example/hero.jpg');
  assert.equal(detail.imageAttribution, 'Beacon Cinema');
  assert.equal(detail.imageLicense, 'Permission');
});

test('live venue without curated imagery stays placeholder-ready', () => {
  const card = resolveTheaterPresentation({
    theater: { id: 'thin', name: 'Thin', enabled: true },
    context: 'detail',
  });
  assert.equal(card.imageUrl, null);
  assert.equal(card.heroImageUrl, null);
  assert.equal(card.sectionsVisible.image, false);
});

test('UI uses TheaterVenueImage with lazy loading and onError fallback', () => {
  assert.match(VENUE_IMAGE, /onError/);
  assert.match(VENUE_IMAGE, /loading/);
  assert.match(SURFACE_LIST, /TheaterVenueImage/);
  assert.match(SURFACE_DETAIL, /TheaterVenueImage/);
  assert.match(SURFACE_DETAIL, /imageAttribution/);
});

test('schema documents hero, thumbnail, attribution, and license', () => {
  assert.match(SCHEMA, /image_hero_url/);
  assert.match(SCHEMA, /image_thumbnail_url/);
  assert.match(SCHEMA, /image_license/);
  assert.match(SCHEMA, /theater-images/);
});

test('fixture SVG asset is staged under public/theater-images', () => {
  const svg = readFileSync(
    join(ROOT, 'public/theater-images/fixtures/venue-placeholder.svg'),
    'utf8',
  );
  assert.match(svg, /theater imagery fixture/i);
});
