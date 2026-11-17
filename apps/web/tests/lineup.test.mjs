import assert from "node:assert/strict";
import test from "node:test";

import { isGoalkeeper, slotOptions } from "../lib/lineup.ts";

const player = (playerId, position) => ({ playerId, position });
const roster = [
  player(1, "Goalkeeper"),
  player(2, "Defender"),
  player(3, "Midfielder"),
  player(4, "Forward"),
  player(5, "Goalkeeper"),
  player(6, null),
];

test("recognises goalkeepers however the position is written", () => {
  assert.equal(isGoalkeeper(player(1, " goalkeeper ")), true);
  assert.equal(isGoalkeeper(player(1, "Forward")), false);
  assert.equal(isGoalkeeper(player(1, null)), false);
});

test("the goalkeeper slot only offers goalkeepers", () => {
  assert.deepEqual(slotOptions(roster, roster[0]).map((option) => option.playerId), [1, 5]);
});

test("outfield slots never offer a goalkeeper", () => {
  assert.deepEqual(slotOptions(roster, roster[3]).map((option) => option.playerId), [2, 3, 4, 6]);
});
