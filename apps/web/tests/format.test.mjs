import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatKickoff, formatMatchDate } from '../lib/format.ts';

test('kickoffs use one fixed pattern whatever CLDR the runtime ships', () => {
  assert.equal(formatKickoff('2026-10-23T19:00:00Z'), 'Fri 23 Oct, 20:00');
  assert.equal(formatKickoff('2026-12-26T12:30:00Z'), 'Sat 26 Dec, 12:30');
  assert.equal(formatKickoff('2026-10-23T19:00:00Z', 'America/Los_Angeles'), 'Fri 23 Oct, 12:00');
  assert.equal(formatKickoff(null), 'Kickoff TBC');
  assert.equal(formatKickoff('not a date'), 'Kickoff TBC');
});

test('match dates are UK match days, independent of the process time zone', () => {
  // 23:30 UTC is already the next day in London during BST.
  assert.equal(formatMatchDate('2026-08-21T23:30:00Z'), '22 Aug 2026');
  assert.equal(formatMatchDate('2026-08-21T19:00:00Z', { day: 'numeric', month: 'short' }), '21 Aug');
  assert.equal(formatMatchDate(null), 'Date pending');
});
