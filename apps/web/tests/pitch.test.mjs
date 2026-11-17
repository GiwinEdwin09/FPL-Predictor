import assert from "node:assert/strict";
import test from "node:test";

import {
  benchFor,
  buildFormation,
  canMoveToLine,
  formationIds,
  formationLabel,
  lineForPosition,
  moveToLine,
  replaceAt,
  sameEleven,
  swapSlots,
} from "../lib/pitch.ts";

const player = (playerId, position, extra = {}) => ({
  playerId,
  position,
  name: `P${playerId}`,
  available: true,
  lineupScore: 0,
  ...extra,
});

// A 4-3-3 listed out of pitch order, the way the API returns a projected XI.
const xi = [
  player(1, "Goalkeeper"),
  player(2, "Defender"),
  player(7, "Forward"),
  player(3, "Defender"),
  player(8, "Midfielder"),
  player(4, "Defender"),
  player(9, "Midfielder"),
  player(5, "Defender"),
  player(10, "Midfielder"),
  player(11, "Forward"),
  player(6, "Forward"),
];
const formation = buildFormation(xi);

test("positions map onto lines, unknown ones into midfield", () => {
  assert.equal(lineForPosition(" goalkeeper"), "gk");
  assert.equal(lineForPosition("Defender"), "def");
  assert.equal(lineForPosition("Forward"), "fwd");
  assert.equal(lineForPosition(null), "mid");
});

test("an XI is laid out by line and keeps its order within each line", () => {
  assert.deepEqual(formation, { gk: [1], def: [2, 3, 4, 5], mid: [8, 9, 10], fwd: [7, 11, 6] });
  assert.equal(formationLabel(formation), "4-3-3");
  assert.deepEqual(formationIds(formation), [1, 2, 3, 4, 5, 8, 9, 10, 7, 11, 6]);
});

test("rearranging the same eleven still counts as the same XI", () => {
  assert.equal(sameEleven([1, 2, 3], [3, 1, 2]), true);
  assert.equal(sameEleven([1, 2, 3], [1, 2, 4]), false);
});

test("two outfield starters can swap places across lines", () => {
  const next = swapSlots(formation, { line: "def", index: 0 }, { line: "fwd", index: 2 });
  assert.deepEqual(next.def, [6, 3, 4, 5]);
  assert.deepEqual(next.fwd, [7, 11, 2]);
  assert.equal(sameEleven(formationIds(next), formationIds(formation)), true);
});

test("the goalkeeper can't swap with an outfield player", () => {
  assert.equal(swapSlots(formation, { line: "gk", index: 0 }, { line: "def", index: 1 }), null);
});

test("moving a player to another line changes the shape", () => {
  const next = moveToLine(formation, { line: "fwd", index: 1 }, "mid", 1);
  assert.deepEqual(next.mid, [8, 11, 9, 10]);
  assert.deepEqual(next.fwd, [7, 6]);
  assert.equal(formationLabel(next), "4-4-2");
});

test("moving within a line reorders it, and dropping in place changes nothing", () => {
  const reordered = moveToLine(formation, { line: "def", index: 0 }, "def", 4);
  assert.deepEqual(reordered.def, [3, 4, 5, 2]);
  assert.equal(moveToLine(formation, { line: "def", index: 1 }, "def", 1), formation);
  assert.equal(moveToLine(formation, { line: "def", index: 1 }, "def", 2), formation);
});

test("lines can't be emptied, overfilled, or swapped with the goal", () => {
  const lone = buildFormation([player(1, "Goalkeeper"), player(2, "Defender"), player(3, "Forward")]);
  assert.equal(canMoveToLine(lone, { line: "fwd", index: 0 }, "def"), false);
  assert.equal(canMoveToLine(formation, { line: "def", index: 0 }, "gk"), false);
  const packed = { gk: [1], def: [2, 3], mid: [4, 5, 6, 7, 8, 9], fwd: [10, 11] };
  assert.equal(canMoveToLine(packed, { line: "def", index: 0 }, "mid"), false);
  assert.equal(moveToLine(packed, { line: "def", index: 0 }, "mid", 0), null);
});

test("a bench player replaces a starter, goalkeepers only in goal", () => {
  const next = replaceAt(formation, { line: "fwd", index: 0 }, player(20, "Midfielder"));
  assert.deepEqual(next.fwd, [20, 11, 6]);
  assert.equal(replaceAt(formation, { line: "gk", index: 0 }, player(21, "Defender")), null);
  assert.deepEqual(replaceAt(formation, { line: "gk", index: 0 }, player(22, "Goalkeeper")).gk, [22]);
  assert.equal(replaceAt(formation, { line: "gk", index: 0 }, player(9, "Goalkeeper")), null, "already starting");
});

test("the bench lists best fits first for the chosen slot", () => {
  const roster = [
    ...xi,
    player(30, "Forward", { lineupScore: 10 }),
    player(31, "Midfielder", { lineupScore: 50 }),
    player(32, "Forward", { lineupScore: 40, available: false }),
    player(33, "Forward", { lineupScore: 20 }),
    player(34, "Goalkeeper", { lineupScore: 90 }),
  ];
  const forForward = benchFor(roster, formation, { line: "fwd", index: 0 }).map((entry) => entry.playerId);
  assert.deepEqual(forForward, [33, 30, 32, 31]);
  const forKeeper = benchFor(roster, formation, { line: "gk", index: 0 }).map((entry) => entry.playerId);
  assert.deepEqual(forKeeper, [34]);
  const whole = benchFor(roster, formation, null).map((entry) => entry.playerId);
  assert.deepEqual(whole, [34, 31, 33, 30, 32]);
});
