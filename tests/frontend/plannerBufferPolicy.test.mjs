import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PLANNER_BUFFER_POLICY_V1,
  calculateBreakMinutes,
  calculateExpectedEndTime,
  calculateRequiredNextStart,
  getPlannerBufferPolicy,
  getPreshowMinutes,
  getTransferMinutes,
  isValidSequence,
} from '../../src/utils/plannerBufferPolicy.js';
import { MINUTES_PER_DAY } from '../../src/utils/timeUtils.js';

test('policy version and transfer constants are explicit and frozen', () => {
  const policy = getPlannerBufferPolicy();
  assert.equal(policy.version, 2);
  assert.equal(policy.preshowMinutes, 0);
  assert.equal(policy.generalTransferMinutes, 10);
  assert.equal(policy.sameVenueTransferMinutes, 5);
  assert.equal(getPreshowMinutes(), 0);
  assert.equal(PLANNER_BUFFER_POLICY_V1.preshowMinutes, 0);
  assert.throws(() => {
    // @ts-expect-error intentional mutation probe
    PLANNER_BUFFER_POLICY_V1.sameVenueTransferMinutes = 99;
  });
  assert.equal(PLANNER_BUFFER_POLICY_V1.sameVenueTransferMinutes, 5);
});

test('expected end is start + runtime only; missing runtime is indeterminate', () => {
  const start = 19 * 60;
  const end = calculateExpectedEndTime({ startMin: start, runtime: 100 });
  assert.equal(end.ok, true);
  assert.equal(end.endMin, start + 100);
  assert.equal(end.preshowMinutes, 0);

  const fromStrings = calculateExpectedEndTime('7:00PM', '100');
  assert.equal(fromStrings.ok, true);
  assert.equal(fromStrings.endMin, start + 100);

  const miasma = calculateExpectedEndTime('8:00PM', 112);
  assert.equal(miasma.ok, true);
  // 8:00 PM + 112 = 9:52 PM
  assert.equal(miasma.endMin, 20 * 60 + 112);
  assert.equal(miasma.endMin, 21 * 60 + 52);

  const missing = calculateExpectedEndTime({ startMin: start });
  assert.equal(missing.ok, false);
  assert.equal(missing.error, 'missing_runtime');
  assert.equal(missing.endMin, null);

  const invalidRuntime = calculateExpectedEndTime('7:00PM', 'Unknown');
  assert.equal(invalidRuntime.ok, false);
  assert.equal(invalidRuntime.error, 'missing_runtime');

  const input = { startMin: start, runtime: 90 };
  const snapshot = structuredClone(input);
  calculateExpectedEndTime(input);
  assert.deepEqual(input, snapshot);
});

test('expected end rolls across midnight without preshow', () => {
  const end = calculateExpectedEndTime('11:30PM', 120);
  assert.equal(end.ok, true);
  assert.equal(end.endMin, 23 * 60 + 30 + 120);
  assert.ok(end.endMin > MINUTES_PER_DAY);
});

test('transfer selection uses canonical theater id; names never imply same building', () => {
  assert.equal(
    getTransferMinutes(
      { theater_id: 'siff-cinema-uptown' },
      { theater_id: 'siff-cinema-uptown' },
    ),
    5,
  );
  assert.equal(
    getTransferMinutes(
      { theater_id: 'siff-cinema-uptown' },
      { theater_id: 'siff-cinema-downtown' },
    ),
    10,
  );
  assert.equal(
    getTransferMinutes(
      { theater: 'SIFF Cinema Uptown' },
      { theater: 'SIFF Cinema Uptown' },
    ),
    10,
  );
  assert.equal(
    getTransferMinutes(
      { theater_id: 'the-beacon', sourceTheaterId: 'x' },
      { theater_id: 'central-cinema', sourceTheaterId: 'x' },
    ),
    10,
  );
  assert.equal(
    getTransferMinutes(
      { theater_id: 'a' },
      { theater_id: 'b' },
      { sameBuilding: true },
    ),
    5,
  );
  assert.equal(getTransferMinutes(null, null), 10);
});

test('sequence validity uses scheduling end + transfer; exact threshold is valid', () => {
  const previous = {
    startMin: 12 * 60,
    runtime: 60,
    theater_id: 'the-beacon',
  };
  // scheduling end = 12:00 + 60 = 13:00; same-venue transfer 5 → required 13:05
  const exact = isValidSequence(previous, {
    startMin: 13 * 60 + 5,
    theater_id: 'the-beacon',
  });
  assert.equal(exact.valid, true);
  assert.equal(exact.transferMinutes, 5);
  assert.equal(exact.breakMinutes, 5);
  assert.equal(exact.requiredStartMin, 13 * 60 + 5);

  const oneMinuteEarly = isValidSequence(previous, {
    startMin: 13 * 60 + 4,
    theater_id: 'the-beacon',
  });
  assert.equal(oneMinuteEarly.valid, false);
  assert.equal(oneMinuteEarly.reason, 'insufficient_transfer');

  const general = isValidSequence(
    { startMin: 12 * 60, runtime: 60, theater_id: 'the-beacon' },
    { startMin: 13 * 60 + 10, theater_id: 'central-cinema' },
  );
  assert.equal(general.transferMinutes, 10);
  assert.equal(general.valid, true);

  const generalEarly = isValidSequence(
    { startMin: 12 * 60, runtime: 60, theater_id: 'the-beacon' },
    { startMin: 13 * 60 + 9, theater_id: 'central-cinema' },
  );
  assert.equal(generalEarly.valid, false);

  const missingRuntime = isValidSequence(
    { startMin: 12 * 60, theater_id: 'the-beacon' },
    { startMin: 14 * 60, theater_id: 'the-beacon' },
  );
  assert.equal(missingRuntime.valid, false);
  assert.equal(missingRuntime.reason, 'missing_runtime');
});

test('Miasma → Oak Street same-theater chain is valid with 8 min slack', () => {
  const miasma = {
    startMin: 20 * 60,
    runtime: 112,
    theater_id: 'amc-pacific-place-11',
  };
  const oakStart = 22 * 60 + 5;
  const end = calculateExpectedEndTime(miasma);
  assert.equal(end.endMin, 20 * 60 + 112);

  const seq = isValidSequence(miasma, {
    startMin: oakStart,
    theater_id: 'amc-pacific-place-11',
  });
  assert.equal(seq.valid, true);
  assert.equal(seq.breakMinutes, 13);
  assert.equal(seq.transferMinutes, 5);
  assert.equal(seq.breakMinutes - seq.transferMinutes, 8);

  const tooTight = isValidSequence(miasma, {
    startMin: 21 * 60 + 55,
    theater_id: 'amc-pacific-place-11',
  });
  assert.equal(tooTight.valid, false);
  assert.equal(tooTight.breakMinutes, 3);
  assert.equal(tooTight.reason, 'insufficient_transfer');
});

test('sequence validity across midnight with planner extended minutes', () => {
  const previous = {
    startMin: 23 * 60 + 30,
    runtime: 120,
    theater_id: 'the-beacon',
  };
  // scheduling end = 1410 + 120 = 1530; +5 → 1535
  const nextStart = MINUTES_PER_DAY + 1 * 60 + 35;
  const ok = isValidSequence(previous, {
    startMin: nextStart,
    theater_id: 'the-beacon',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.previousEndMin, 23 * 60 + 30 + 120);

  const tooSoon = isValidSequence(previous, {
    startMin: MINUTES_PER_DAY + 1 * 60 + 30,
    theater_id: 'the-beacon',
  });
  assert.equal(tooSoon.valid, false);
});

test('break calculation matches validity policy and can be negative on overlap', () => {
  const previous = {
    startMin: 12 * 60,
    runtime: 60,
    theater_id: 'the-beacon',
  };
  const br = calculateBreakMinutes(previous, {
    startMin: 13 * 60 + 15,
    theater_id: 'the-beacon',
  });
  assert.equal(br.ok, true);
  assert.equal(br.breakMinutes, 15);
  assert.equal(br.meetsTransfer, true);

  const overlap = calculateBreakMinutes(previous, {
    startMin: 12 * 60 + 30,
    theater_id: 'the-beacon',
  });
  assert.equal(overlap.ok, true);
  assert.ok(overlap.breakMinutes < 0);
  assert.equal(overlap.meetsTransfer, false);

  const required = calculateRequiredNextStart(previous, {
    theater_id: 'the-beacon',
  });
  assert.equal(required.ok, true);
  assert.equal(required.requiredStartMin, 13 * 60 + 5);
  assert.equal(required.transferMinutes, 5);
});
