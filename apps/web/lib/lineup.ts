export type TeamSummary = {
  id: number | null;
  name: string;
  shortName: string;
  badgeSlug: string;
  badgePath: string | null;
};

export type FixtureProbabilities = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

export type FixtureContext = {
  homeElo: number | null;
  awayElo: number | null;
  homeDaysRest: number | null;
  awayDaysRest: number | null;
  homeLast5Xg: number | null;
  awayLast5Xg: number | null;
  homeLast5Xga: number | null;
  awayLast5Xga: number | null;
  homeLast5Matches: number | null;
  awayLast5Matches: number | null;
};

export type SimulationFixture = {
  matchId: string;
  season: string;
  gameweek: number | null;
  kickoffTime: string | null;
  finished: boolean;
  score: {
    home: number | null;
    away: number | null;
  };
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  probabilities: FixtureProbabilities;
  context: FixtureContext;
  status?: string;
  statusReason?: string;
};

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
  match: SimulationFixture;
  home: TeamLineupContext;
  away: TeamLineupContext;
};

export type FixtureSimulation = {
  generatedAtUtc: string;
  simulationMode: string;
  match: SimulationFixture;
  simulatedMatch: SimulationFixture;
  home: TeamLineupContext;
  away: TeamLineupContext;
  adjustments: {
    homeAttackRatio: number | null;
    awayAttackRatio: number | null;
    homeDefenceRatio: number | null;
    awayDefenceRatio: number | null;
  };
};
