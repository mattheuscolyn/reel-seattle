import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWhySeeItSignals } from '../../v2/filmDetail/filmDetailModel.js';
import { buildDepartureTimingPresentation } from '../../v2/filmDetail/departureTiming.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SURFACE = readFileSync(join(ROOT, 'v2/surfaces/FilmDetailSurface.jsx'), 'utf8');
const CSS = readFileSync(join(ROOT, 'v2/v2.css'), 'utf8');

test('Film Detail signal cards expose semantic type hooks', () => {
  assert.match(SURFACE, /data-signal-type=\{signal\.type\}/);
  assert.match(SURFACE, /v2-fd-signal-\$\{signal\.type\}/);
});

test('mobile Why See It grid is 2-up; departure spans full width', () => {
  assert.match(
    CSS,
    /\.v2-fd-signals-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s,
  );
  assert.match(
    CSS,
    /@media \(max-width:\s*719px\)[\s\S]*?\.v2-fd-signal-departure_timing[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
  assert.match(
    CSS,
    /@media \(min-width:\s*720px\)[\s\S]*?\.v2-fd-signals-grid[\s\S]*?repeat\(4,\s*minmax\(0,\s*1fr\)\)/,
  );
});

test('departure timing text is not line-clamped on mobile', () => {
  // Base primary/secondary rules no longer force 4/2 clamps.
  assert.equal(
    /\.v2-fd-signal-primary\s*\{[^}]*-webkit-line-clamp:\s*4/s.test(CSS),
    false,
  );
  assert.equal(
    /\.v2-fd-signal-secondary\s*\{[^}]*-webkit-line-clamp:\s*2/s.test(CSS),
    false,
  );
  // Explicit departure overrides remain unclamped on desktop too.
  assert.match(
    CSS,
    /\.v2-fd-signal-departure_timing \.v2-fd-signal-primary[\s\S]*?-webkit-line-clamp:\s*unset/,
  );
  assert.match(
    CSS,
    /\.v2-fd-signal-departure_timing \.v2-fd-signal-secondary[\s\S]*?-webkit-line-clamp:\s*unset/,
  );
});

test('See all expansion class still exists for >4 signals', () => {
  assert.match(SURFACE, /v2-fd-signals-expanded/);
  assert.match(SURFACE, /WHY_SEE_IT_PREVIEW_LIMIT/);
  assert.match(CSS, /\.v2-fd-signals-expanded/);
});

test('departure_timing signal type is first when present', () => {
  const homeData = {
    opportunities: [
      {
        filmKey: 'mighty-mary',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-09-22',
        localTime: '19:30',
        formatLabels: ['Dolby Cinema'],
        isNewlyAdded: false,
        isSpecialScreening: false,
      },
      {
        filmKey: 'mighty-mary',
        theaterId: 'amc-pacific-place-11',
        theaterName: 'AMC Pacific Place 11',
        localDate: '2026-09-23',
        localTime: '19:30',
        formatLabels: [],
        isNewlyAdded: false,
        isSpecialScreening: false,
      },
    ],
    leavingSoon: {
      status: 'ready',
      entries: [
        {
          filmKey: 'mighty-mary',
          title: 'Mighty Mary',
          bucket: 'last_chance',
          maxShowDate: '2026-09-23',
          predictedEndDate: '2026-09-23',
          timingConfidence: 'high',
          timingMode: 'likely_around',
          predictionAsOf: '2026-09-20',
          totalVisibleShowtimes: 2,
          totalVisibleTheaters: 1,
        },
      ],
    },
    newlyAdded: [],
  };
  const film = { filmKey: 'mighty-mary', title: 'Mighty Mary' };
  const signals = buildWhySeeItSignals(homeData, film);
  assert.ok(signals.length >= 2);
  assert.equal(signals[0].type, 'departure_timing');
  assert.match(signals[0].primary, /Likely leaving AMC around Sep 23|Could leave AMC/);
  assert.match(signals[0].secondary ?? '', /Currently booked through Sep 23/);

  const timing = buildDepartureTimingPresentation(homeData.leavingSoon.entries[0], {
    todayIso: '2026-09-20',
  });
  assert.ok(timing);
  assert.match(timing.primaryLabel, /AMC/);
  assert.equal(timing.secondaryLabel, 'Currently booked through Sep 23');
});
