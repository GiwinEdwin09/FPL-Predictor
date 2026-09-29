import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyQuizMatches, restoreDailyProgress, tallyDailyPicks } from '../lib/quiz.ts';

const match = (matchId, home, away, probabilities = { homeWin: 0.6, draw: 0.25, awayWin: 0.15 }) => ({
  matchId,
  score: { home, away },
  probabilities,
});
// Home win, draw, away win, home win, home win.
const daily = [match('m1', 2, 0), match('m2', 1, 1), match('m3', 0, 3), match('m4', 1, 0), match('m5', 3, 1)];
const saved = (patch = {}) => ({
  date: '2026-09-29',
  matchIds: daily.map((m) => m.matchId),
  picks: ['home', 'draw'],
  index: 2,
  ...patch,
});

test('restores progress for the same day and the same five matches', () => {
  assert.deepEqual(restoreDailyProgress(saved(), '2026-09-29', daily), saved());
  // Reveal still showing on the last answered match.
  assert.equal(restoreDailyProgress(saved({ index: 1 }), '2026-09-29', daily)?.index, 1);
});

test('drops progress from another day, another set of matches, or malformed storage', () => {
  for (const raw of [
    saved({ date: '2026-09-28' }),
    saved({ matchIds: ['m1', 'm2', 'm3', 'm4', 'other'] }),
    saved({ picks: ['home', 'sideways'] }),
    saved({ index: 0 }),
    saved({ index: 5, picks: ['home', 'draw', 'away', 'home', 'home'] }),
    saved({ picks: 'home' }),
    null,
    'garbage',
  ]) {
    assert.equal(restoreDailyProgress(raw, '2026-09-29', daily), null);
  }
});

test('tallies your hits and the model hits over the picks made so far', () => {
  // The model picks home every time: right on m1, wrong on m2 (draw) and m3 (away).
  const { results, user, model } = tallyDailyPicks(daily, ['home', 'home', 'away']);
  assert.deepEqual(results, [true, false, true]);
  assert.equal(user, 2);
  assert.equal(model, 1);
});

test('the daily five depends only on the date', () => {
  const pool = Array.from({ length: 40 }, (_, i) => match(`p${i}`, 1, 0));
  const ids = (date) => dailyQuizMatches(pool, date).map((m) => m.matchId);
  assert.deepEqual(ids('2026-09-29'), ids('2026-09-29'));
  assert.notDeepEqual(ids('2026-09-29'), ids('2026-09-30'));
});
