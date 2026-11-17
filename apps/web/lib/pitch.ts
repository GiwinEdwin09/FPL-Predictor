import type { LineupPlayer } from "@/lib/lineup";

/**
 * A starting XI laid out on a pitch: four lines, each listed left to right.
 * Where a player stands is presentation only. The forecast depends on which
 * eleven start, so moving players between lines never changes the numbers;
 * only bringing someone in from the bench does.
 */
export type Line = "gk" | "def" | "mid" | "fwd";
export type Formation = Record<Line, number[]>;
export type SlotRef = { line: Line; index: number };

/** Back to front: the order lines are listed in and the order ids are flattened in. */
export const LINES: readonly Line[] = ["gk", "def", "mid", "fwd"];
export const OUTFIELD_LINES: readonly Line[] = ["def", "mid", "fwd"];
/** No outfield line holds more than this many players. */
export const MAX_LINE_SIZE = 6;

export const LINE_LABELS: Record<Line, string> = {
  gk: "Goalkeeper",
  def: "Defence",
  mid: "Midfield",
  fwd: "Attack",
};

export const POSITION_SHORT: Record<Line, string> = {
  gk: "GK",
  def: "DEF",
  mid: "MID",
  fwd: "FWD",
};

/** The line a player's listed position puts them in. Unknown positions start in midfield. */
export function lineForPosition(position: string | null | undefined): Line {
  const normalized = (position ?? "").trim().toLowerCase();
  if (normalized.startsWith("goal")) return "gk";
  if (normalized.startsWith("def")) return "def";
  if (normalized.startsWith("for")) return "fwd";
  return "mid";
}

export function emptyFormation(): Formation {
  return { gk: [], def: [], mid: [], fwd: [] };
}

/** Lays out an XI by each player's listed position, keeping their order within a line. */
export function buildFormation(players: Pick<LineupPlayer, "playerId" | "position">[]): Formation {
  const formation = emptyFormation();
  for (const player of players) {
    formation[lineForPosition(player.position)].push(player.playerId);
  }
  return formation;
}

/** Player ids from the goalkeeper forward: the XI as the forecast and saved lineups store it. */
export function formationIds(formation: Formation): number[] {
  return LINES.flatMap((line) => formation[line]);
}

/** Shape like "4-3-3", counting outfield lines only. */
export function formationLabel(formation: Formation): string {
  return OUTFIELD_LINES.map((line) => formation[line].length).join("-");
}

/** Order-insensitive key for an XI, so rearranging the same eleven reads as unchanged. */
export function lineupKey(ids: number[]): string {
  return [...ids].sort((left, right) => left - right).join(",");
}

export function sameEleven(left: number[], right: number[]): boolean {
  return lineupKey(left) === lineupKey(right);
}

export function playerAt(formation: Formation, slot: SlotRef): number | undefined {
  return formation[slot.line][slot.index];
}

export function findSlot(formation: Formation, playerId: number): SlotRef | null {
  for (const line of LINES) {
    const index = formation[line].indexOf(playerId);
    if (index !== -1) return { line, index };
  }
  return null;
}

function cloneFormation(formation: Formation): Formation {
  return { gk: [...formation.gk], def: [...formation.def], mid: [...formation.mid], fwd: [...formation.fwd] };
}

const isGoalkeeperLine = (line: Line) => line === "gk";

/** Goalkeepers only trade places with goalkeepers, so the XI always keeps its keeper in goal. */
export function canSwap(from: SlotRef, to: SlotRef): boolean {
  return isGoalkeeperLine(from.line) === isGoalkeeperLine(to.line);
}

/** Two starters trade places on the pitch. Returns null when the swap isn't allowed. */
export function swapSlots(formation: Formation, from: SlotRef, to: SlotRef): Formation | null {
  const first = playerAt(formation, from);
  const second = playerAt(formation, to);
  if (first === undefined || second === undefined || !canSwap(from, to)) return null;
  if (from.line === to.line && from.index === to.index) return formation;
  const next = cloneFormation(formation);
  next[from.line][from.index] = second;
  next[to.line][to.index] = first;
  return next;
}

/**
 * Whether a starter may move into another line. Outfield players stay outfield,
 * a line can't grow past MAX_LINE_SIZE, and the line they leave can't be emptied.
 */
export function canMoveToLine(formation: Formation, from: SlotRef, toLine: Line): boolean {
  if (isGoalkeeperLine(from.line) || isGoalkeeperLine(toLine)) return false;
  if (from.line === toLine) return formation[toLine].length > 1;
  return formation[toLine].length < MAX_LINE_SIZE && formation[from.line].length > 1;
}

/** Moves a starter into a line (possibly their own) at `toIndex`. Returns null when not allowed. */
export function moveToLine(formation: Formation, from: SlotRef, toLine: Line, toIndex: number): Formation | null {
  const playerId = playerAt(formation, from);
  if (playerId === undefined || !canMoveToLine(formation, from, toLine)) return null;
  const next = cloneFormation(formation);
  next[from.line].splice(from.index, 1);
  const target = next[toLine];
  // Inside its own line the removal shifts later slots left by one.
  const adjusted = from.line === toLine && toIndex > from.index ? toIndex - 1 : toIndex;
  const clamped = Math.max(0, Math.min(adjusted, target.length));
  // Dropped back where it started: hand back the same object so callers can tell nothing moved.
  if (from.line === toLine && clamped === from.index) return formation;
  target.splice(clamped, 0, playerId);
  return next;
}

/** Whether `incoming` (from the bench) may take the place of whoever stands in `slot`. */
export function canReplace(slot: SlotRef, incoming: Pick<LineupPlayer, "position">): boolean {
  return isGoalkeeperLine(slot.line) === (lineForPosition(incoming.position) === "gk");
}

/** A bench player takes over a slot. Returns null when not allowed or already starting. */
export function replaceAt(
  formation: Formation,
  slot: SlotRef,
  incoming: Pick<LineupPlayer, "playerId" | "position">,
): Formation | null {
  if (playerAt(formation, slot) === undefined || !canReplace(slot, incoming)) return null;
  if (findSlot(formation, incoming.playerId) !== null) return null;
  const next = cloneFormation(formation);
  next[slot.line][slot.index] = incoming.playerId;
  return next;
}

/**
 * Bench players who could come on for whoever stands in `slot`, best fits first:
 * same listed position, then available, then the most regular starters.
 */
export function benchFor(roster: LineupPlayer[], formation: Formation, slot: SlotRef | null): LineupPlayer[] {
  const starting = new Set(formationIds(formation));
  const bench = roster.filter((player) => !starting.has(player.playerId));
  const eligible = slot ? bench.filter((player) => canReplace(slot, player)) : bench;
  return [...eligible].sort((left, right) => {
    if (slot) {
      const leftFit = lineForPosition(left.position) === slot.line ? 0 : 1;
      const rightFit = lineForPosition(right.position) === slot.line ? 0 : 1;
      if (leftFit !== rightFit) return leftFit - rightFit;
    } else {
      const byLine = LINES.indexOf(lineForPosition(left.position)) - LINES.indexOf(lineForPosition(right.position));
      if (byLine !== 0) return byLine;
    }
    if (left.available !== right.available) return left.available ? -1 : 1;
    return (right.lineupScore ?? 0) - (left.lineupScore ?? 0);
  });
}
