import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInSampleReplay, replayCoverage } from '../lib/replays.ts';

const CUTOFF = '2026-04-26T15:00:00+00:00';
const probabilities = { homeWin: 0.5, draw: 0.25, awayWin: 0.25 };

function match(predictionType, kickoffTime, withForecast = true, season = '2024-2025') {
  return { season, predictionType, kickoffTime, probabilities: withForecast ? probabilities : null };
}

test('replays of matches before the training cutoff are in-sample', () => {
  assert.equal(isInSampleReplay(match('replay', '2025-05-25T15:00:00+00:00'), CUTOFF), true);
  // Replayed after the fact, but the model never trained on a match after its cutoff.
  assert.equal(isInSampleReplay(match('replay', '2026-08-22T14:00:00+00:00'), CUTOFF), false);
  assert.equal(isInSampleReplay(match('replay', CUTOFF), CUTOFF), false);
});

test('frozen and walk-forward forecasts are never in-sample replays', () => {
  assert.equal(isInSampleReplay(match('backfill_walk_forward', '2025-12-01T15:00:00+00:00'), CUTOFF), false);
  assert.equal(isInSampleReplay(match('pre_kickoff', '2025-12-01T15:00:00+00:00'), CUTOFF), false);
  assert.equal(isInSampleReplay(match(null, '2025-12-01T15:00:00+00:00'), CUTOFF), false);
  assert.equal(isInSampleReplay(match(undefined, '2025-12-01T15:00:00+00:00'), CUTOFF), false);
});

test('a replay is assumed in-sample when its cutoff or kickoff is undated', () => {
  assert.equal(isInSampleReplay(match('replay', '2026-08-22T14:00:00+00:00'), 'gameweek_fallback'), true);
  assert.equal(isInSampleReplay(match('replay', null), CUTOFF), true);
});

test('coverage counts in-sample replays among matches that carry a forecast', () => {
  const season = [
    match('replay', '2025-05-25T15:00:00+00:00'),
    match('replay', '2025-05-18T15:00:00+00:00'),
    match('backfill_walk_forward', '2025-05-11T15:00:00+00:00'),
    match('replay', '2025-05-04T15:00:00+00:00', false),
  ];
  assert.deepEqual(replayCoverage(season, CUTOFF), { seasons: ['2024-2025'], graded: 3, inSample: 2 });
  assert.deepEqual(replayCoverage([], CUTOFF), { seasons: [], graded: 0, inSample: 0 });
});

test('coverage across seasons names and counts only the seasons holding in-sample replays', () => {
  // A head-to-head spans seasons: 2025-26 is walk-forward and 2026-27 replays are past the cutoff.
  const meetings = [
    match('pre_kickoff', '2026-10-03T14:00:00+00:00', true, '2026-2027'),
    match('replay', '2026-08-22T14:00:00+00:00', true, '2026-2027'),
    match('backfill_walk_forward', '2026-02-01T16:30:00+00:00', true, '2025-2026'),
    match('replay', '2025-04-12T14:00:00+00:00', true, '2024-2025'),
    match('replay', '2024-09-14T14:00:00+00:00', true, '2024-2025'),
  ];
  assert.deepEqual(replayCoverage(meetings, CUTOFF), { seasons: ['2024-2025'], graded: 2, inSample: 2 });
});
