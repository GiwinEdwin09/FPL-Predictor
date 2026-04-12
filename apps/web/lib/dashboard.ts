import { promises as fs } from "node:fs";
import path from "node:path";

export type TeamSummary = {
  id: number | null;
  name: string;
  shortName: string;
  badgeSlug: string;
  badgePath: string | null;
};

export type UpcomingFixture = {
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
  probabilities: {
    homeWin: number;
    draw: number;
    awayWin: number;
  };
  context: {
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
  status?: string;
  statusReason?: string;
};

export type HistoricalMatch = {
  matchId: string;
  season: string;
  gameweek: number | null;
  kickoffTime: string | null;
  homeTeam: TeamSummary;
  awayTeam: TeamSummary;
  score: {
    home: number | null;
    away: number | null;
  };
  stats: {
    xg: { home: number | null; away: number | null };
    shotsOnTarget: { home: number | null; away: number | null };
    bigChances: { home: number | null; away: number | null };
    possession: { home: number | null; away: number | null };
  };
  preMatch: {
    homeElo: number | null;
    awayElo: number | null;
    homeLast5Xg: number | null;
    awayLast5Xg: number | null;
  };
  matchUrl: string | null;
};

export type DashboardData = {
  generatedAtUtc: string;
  currentSeason: string;
  currentGameweek: number | null;
  model: {
    version: string;
    calibrationTemperature: number;
    metrics: {
      accuracy: number;
      multiclass_log_loss: number;
      multiclass_brier_score: number;
    };
    split: {
      train_rows: number;
      validation_rows: number;
      validation_cutoff_utc: string;
      latest_finished_kickoff_utc: string;
    };
    competitionDistributionTrain: Record<string, number>;
  };
  currentGameweekFixtures: UpcomingFixture[];
  upcomingFixtures: UpcomingFixture[];
  postponedFixtures: UpcomingFixture[];
  historicalMatches: HistoricalMatch[];
};

const dashboardPath = path.join(process.cwd(), "public", "data", "dashboard.json");

export async function loadDashboardData(): Promise<DashboardData> {
  const apiBaseUrl = process.env.API_BASE_URL;
  if (apiBaseUrl) {
    const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/api/dashboard`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Failed to load dashboard from API: ${response.status}`);
    }
    return (await response.json()) as DashboardData;
  }

  const raw = await fs.readFile(dashboardPath, "utf-8");
  return JSON.parse(raw) as DashboardData;
}
