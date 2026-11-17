import type { TeamSummary, UpcomingFixture } from "@/lib/dashboard";

export type LineupPlayer = {
  playerId: number;
  name: string;
  position: string | null;
  status: string | null;
  chanceOfPlayingThisRound: number | null;
  form: number | null;
  recentStarts: number | null;
  recentMinutes: number | null;
  lineupScore: number | null;
  available: boolean;
  news: string | null;
};

export function isGoalkeeper(player: Pick<LineupPlayer, "position">): boolean {
  return (player.position ?? "").trim().toLowerCase().startsWith("goal");
}

/**
 * Players who may take over the slot `current` holds: goalkeepers only swap with
 * goalkeepers, so an XI always keeps the keeper in goal and nowhere else.
 */
export function slotOptions(roster: LineupPlayer[], current: LineupPlayer): LineupPlayer[] {
  const goalkeeperSlot = isGoalkeeper(current);
  return roster.filter((player) => isGoalkeeper(player) === goalkeeperSlot);
}

export type TeamLineupContext = {
  team: TeamSummary;
  lineup: LineupPlayer[];
  roster: LineupPlayer[];
  selectedPlayerIds?: number[];
  defaultPlayerIds?: number[];
};

export type FixtureLineupContext = {
  match: UpcomingFixture;
  home: TeamLineupContext;
  away: TeamLineupContext;
};

export type FixtureSimulation = {
  generatedAtUtc: string;
  simulationMode: string;
  match: UpcomingFixture;
  simulatedMatch: UpcomingFixture;
  home: TeamLineupContext;
  away: TeamLineupContext;
  adjustments: {
    homeAttackRatio: number | null;
    awayAttackRatio: number | null;
    homeDefenceRatio: number | null;
    awayDefenceRatio: number | null;
    /** Factor applied to each side's expected goals. Absent from API builds that predate it. */
    homeGoalMultiplier?: number | null;
    awayGoalMultiplier?: number | null;
  };
};
