import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPlannerCompactTime,
  parsePlannerTimeParts,
  PLANNER_TIME_MINUTES,
} from '../../src/utils/plannerTimePicker.js';

test('parsePlannerTimeParts parses compact planner times', () => {
  assert.deepEqual(parsePlannerTimeParts('8:15PM'), {
    hour: '8',
    minute: '15',
    period: 'PM',
  });
});

test('parsePlannerTimeParts falls back to defaults for empty or invalid values', () => {
  assert.deepEqual(parsePlannerTimeParts(''), {
    hour: '12',
    minute: '00',
    period: 'PM',
  });
  assert.deepEqual(parsePlannerTimeParts('7ish'), {
    hour: '12',
    minute: '00',
    period: 'PM',
  });
});

test('parsePlannerTimeParts snaps unsupported minutes down to 00', () => {
  assert.deepEqual(parsePlannerTimeParts('8:10PM').minute, '00');
  assert.deepEqual(parsePlannerTimeParts('8:45PM').minute, '45');
});

test('formatPlannerCompactTime builds valid compact times', () => {
  assert.equal(formatPlannerCompactTime('8', '15', 'PM'), '8:15PM');
  assert.equal(formatPlannerCompactTime('8', '', 'PM'), '');
});

test('planner minute options use 15-minute increments', () => {
  assert.deepEqual(PLANNER_TIME_MINUTES, ['00', '15', '30', '45']);
});
