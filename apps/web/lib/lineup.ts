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
  };
};
