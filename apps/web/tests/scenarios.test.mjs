import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScenario, parseScenarioUpdate, validateScenarioRoster } from '../lib/scenarios.ts';

const input = () => ({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: ' Strongest XI ', season: '2026-2027', matchId: '2026-2027:123', homePlayerIds: Array.from({ length: 11 }, (_, i) => i + 1), awayPlayerIds: Array.from({ length: 11 }, (_, i) => i + 21) });

test('validates a complete scenario and trims its name', () => {
  assert.equal(parseScenario(input()).name, 'Strongest XI');
});
test('rejects duplicates, partial XIs, invalid IDs, and forged ownership', () => {
  for (const patch of [{ homePlayerIds: Array(11).fill(1) }, { awayPlayerIds: [1] }, { homePlayerIds: [...input().homePlayerIds.slice(1), -1] }, { user_id: 'other-user' }, { name: ' ' }, { season: '2026' }, { id: 'bad' }]) {
    assert.throws(() => parseScenario({ ...input(), ...patch }));
  }
});
test('checks season, fixture, and team membership against server roster', () => {
  const body = parseScenario(input());
  const context = { match: { matchId: body.matchId, season: body.season }, home: { roster: body.homePlayerIds.map(playerId => ({ playerId, name: `H${playerId}` })) }, away: { roster: body.awayPlayerIds.map(playerId => ({ playerId, name: `A${playerId}` })) } };
  assert.equal(validateScenarioRoster(body, context).homeNames.length, 11);
  assert.throws(() => validateScenarioRoster({ ...body, season: '2025-2026' }, context));
  assert.throws(() => validateScenarioRoster({ ...body, awayPlayerIds: body.homePlayerIds }, context));
});
test('updates require a version and cannot replace ownership or saved selections', () => {
  assert.deepEqual(parseScenarioUpdate({ version: 2, name: ' New ' }), { version: 2, patch: { name: 'New' } });
  assert.deepEqual(parseScenarioUpdate({ version: 2, archived: false }), { version: 2, patch: { archived_at: null } });
  for (const value of [{ name: 'No version' }, { version: 1, user_id: 'x' }, { version: 1, name: 'X', archived: true }, { version: 1, home_player_ids: [1] }, { version: 1, archived: 'true' }]) assert.throws(() => parseScenarioUpdate(value));
});
