/**
 * Film Detail AMC departure-timing presentation tests.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildLeavingSoon } from '../../v2/adapters/buildLeavingSoon.js';
import {
  buildDepartureTimingPresentation,
  findLeavingSoonEntryForFilm,
  formatDepartureDateLabel,
} from '../../v2/filmDetail/departureTiming.js';
import { buildWhySeeItSignals } from '../../v2/filmDetail/filmDetailModel.js';

const baseArtifact = {
  schema_version: '1.2.0',
  generated_at: '2026-09-19T03:11:08-07:00',
  source: 'amc',
  model_version: 'amc_remaining_run_survival_v1',
  published: true,
  skipped_reason: null,
  window: { start_date: '2026-09-19', end_date: '2027-09-18' },
  method: {
    name: 'amc_remaining_run_survival_v1',
    description: 'test',
    evaluated_precision: 0.9,
    evaluated_recall: 0.7,
    evaluated_coverage: 0.7,
    evaluation_note: 'test',
  },
  stats: {
    candidate_film_count: 1,
    flagged_film_count: 1,
    last_chance_count: 1,
    leaving_soon_count: 0,
  },
  items: [],
};

function leavingHome(entries) {
  return {
    leavingSoon: {
      status: 'ready',
      reason: null,
      generatedAt: '2026-09-19T03:11:08-07:00',
      modelVersion: 'amc_remaining_run_survival_v1',
      stats: null,
      entries,
    },
    newlyAdded: [],
    opportunitiesByFilmKey: {},
  };
}

describe('departure timing presentation', () => {
  it('formats HIGH / MODERATE / LOW copy with AMC scope', () => {
    const high = buildDepartureTimingPresentation(
      {
        bucket: 'last_chance',
        timingConfidence: 'high',
        timingMode: 'likely_around',
        predictedEndDate: '2026-09-23',
        maxShowDate: '2026-09-23',
        predictionAsOf: '2026-09-19',
      },
      { todayIso: '2026-09-19' },
    );
    assert.equal(high.primaryLabel, 'Likely leaving AMC around Sep 23');
    assert.equal(high.secondaryLabel, 'Currently booked through Sep 23');
    assert.equal(high.scope, 'amc');

    const moderate = buildDepartureTimingPresentation(
      {
        bucket: 'leaving_soon',
        timingConfidence: 'moderate',
        timingMode: 'could_around',
        predictedEndDate: '2026-09-25',
        maxShowDate: '2026-09-23',
        predictionAsOf: '2026-09-19',
      },
      { todayIso: '2026-09-19' },
    );
    assert.equal(moderate.primaryLabel, 'Could leave AMC around Sep 25');
    assert.match(moderate.secondaryLabel, /Currently booked through/);

    const low = buildDepartureTimingPresentation(
      {
        bucket: 'last_chance',
        timingConfidence: 'low',
        timingMode: 'horizon_only',
        predictedEndDate: null,
        maxShowDate: '2026-09-23',
        predictionAsOf: '2026-09-19',
      },
      { todayIso: '2026-09-19' },
    );
    assert.equal(low.primaryLabel, 'Could leave AMC within the next week');
    assert.equal(low.predictedEndDate, null);
  });

  it('does not show raw percentages', () => {
    const text = buildDepartureTimingPresentation(
      {
        bucket: 'leaving_soon',
        timingConfidence: 'moderate',
        timingMode: 'could_around',
        predictedEndDate: '2026-10-08',
        maxShowDate: '2026-10-01',
        predictionAsOf: '2026-09-19',
      },
      { todayIso: '2026-09-19' },
    );
    assert.doesNotMatch(text.primaryLabel, /%/);
    assert.doesNotMatch(text.primaryLabel, /\d{2}\s*%/);
  });

  it('joins parent/variant film keys without title fuzzy match', () => {
    const entries = [
      {
        filmKey: 'sinners',
        title: 'Sinners',
        bucket: 'leaving_soon',
        timingConfidence: 'moderate',
        timingMode: 'could_around',
        predictedEndDate: '2026-09-28',
        maxShowDate: '2026-09-25',
        predictionAsOf: '2026-09-19',
      },
    ];
    const parent = findLeavingSoonEntryForFilm({ filmKey: 'sinners' }, entries);
    assert.equal(parent?.filmKey, 'sinners');
    const variant = findLeavingSoonEntryForFilm(
      { filmKey: 'sinners-qa', parentFilmKey: 'sinners' },
      entries,
    );
    assert.equal(variant?.filmKey, 'sinners');
    assert.equal(
      findLeavingSoonEntryForFilm({ filmKey: 'other', title: 'Sinners' }, entries),
      null,
    );
  });

  it('adapter keeps timing fields and tolerates v1.1 without them', () => {
    const withTiming = buildLeavingSoon({
      ...baseArtifact,
      items: [
        {
          film_key: 'paw-patrol-the-dino-movie',
          film_title: 'PAW Patrol: The Dino Movie',
          risk_level: 'high',
          reason: 'test',
          leaving_soon_bucket: 'last_chance',
          sort_rank: 1,
          run_type: 'probable_normal_first_run',
          visible_show_date_count: 2,
          total_visible_showtimes: 4,
          max_show_date: '2026-09-23',
          total_visible_theaters: 2,
          theaters: [],
          prediction_as_of: '2026-09-19',
          predicted_end_date: '2026-09-23',
          timing_confidence: 'high',
          timing_mode: 'likely_around',
          prediction_scope: 'amc',
        },
      ],
    });
    assert.equal(withTiming.entries[0].timingConfidence, 'high');
    assert.equal(withTiming.entries[0].predictedEndDate, '2026-09-23');

    const legacy = buildLeavingSoon({
      ...baseArtifact,
      schema_version: '1.1.0',
      items: [
        {
          film_key: 'sinners',
          film_title: 'Sinners',
          risk_level: 'elevated',
          reason: 'test',
          leaving_soon_bucket: 'leaving_soon',
          sort_rank: 1,
          run_type: 'probable_normal_first_run',
          visible_show_date_count: 3,
          total_visible_showtimes: 5,
          max_show_date: '2026-09-25',
          total_visible_theaters: 2,
          theaters: [],
        },
      ],
    });
    assert.equal(legacy.entries[0].timingConfidence, null);
    assert.equal(legacy.entries[0].predictedEndDate, null);
  });

  it('Why See It prioritizes departure timing and drops redundant Through date', () => {
    const film = { filmKey: 'demo-film', title: 'Demo' };
    const homeData = {
      ...leavingHome([
        {
          filmKey: 'demo-film',
          title: 'Demo',
          bucket: 'last_chance',
          timingConfidence: 'high',
          timingMode: 'likely_around',
          predictedEndDate: '2026-09-23',
          maxShowDate: '2026-09-23',
          predictionAsOf: '2026-09-19',
        },
      ]),
      opportunities: [
        {
          opportunityKey: 'o1',
          filmKey: 'demo-film',
          theaterId: 'amc-1',
          theaterName: 'AMC Test',
          localDate: '2026-09-23',
          startAt: '2026-09-23T19:00:00-07:00',
          formatLabels: [],
        },
      ],
      films: [film],
    };
    const signals = buildWhySeeItSignals(homeData, film);
    assert.equal(signals[0]?.type, 'departure_timing');
    assert.match(signals[0].primary, /Likely leaving AMC around/);
    assert.doesNotMatch(signals[0].primary, /Leaving Seattle/);
    const scarcity = signals.find((s) => s.type === 'scarcity');
    assert.ok(scarcity);
    assert.equal(scarcity.secondary, null);
  });

  it('keeps non-AMC showtimes available when timing is present', () => {
    const film = { filmKey: 'overlap-film', title: 'Overlap' };
    const homeData = {
      ...leavingHome([
        {
          filmKey: 'overlap-film',
          title: 'Overlap',
          bucket: 'leaving_soon',
          timingConfidence: 'moderate',
          timingMode: 'could_around',
          predictedEndDate: '2026-09-28',
          maxShowDate: '2026-09-25',
          predictionAsOf: '2026-09-19',
        },
      ]),
      opportunities: [
        {
          opportunityKey: 'amc',
          filmKey: 'overlap-film',
          theaterId: 'amc-1',
          theaterName: 'AMC Pacific Place 11',
          localDate: '2026-09-24',
          startAt: '2026-09-24T19:00:00-07:00',
          formatLabels: [],
        },
        {
          opportunityKey: 'siff',
          filmKey: 'overlap-film',
          theaterId: 'siff-upi',
          theaterName: 'SIFF Uptown',
          localDate: '2026-09-26',
          startAt: '2026-09-26T19:00:00-07:00',
          formatLabels: [],
        },
      ],
      films: [film],
    };
    const signals = buildWhySeeItSignals(homeData, film);
    assert.equal(signals[0]?.type, 'departure_timing');
    assert.match(signals[0].primary, /AMC/);
    assert.equal(homeData.opportunities.length, 2);
    assert.ok(homeData.opportunities.some((o) => o.theaterId === 'siff-upi'));
  });

  it('has no departure timing when Leaving Soon entry is absent', () => {
    const signals = buildWhySeeItSignals(
      { leavingSoon: { entries: [] }, opportunities: [], films: [] },
      { filmKey: 'missing', title: 'Missing' },
    );
    assert.equal(signals.find((s) => s.type === 'departure_timing'), undefined);
  });

  it('includes year when prediction crosses years', () => {
    assert.equal(
      formatDepartureDateLabel('2027-01-02', { asOfIso: '2026-12-28' }),
      'Jan 2, 2027',
    );
  });
});
