import type { DashboardData, UpcomingFixture } from "@/lib/dashboard";

export type GameweekSummary = {
  status: "live" | "upcoming" | "season-over";
  gameweek: number | null;
  fixtureCount: number;
  firstKickoffUtc: string | null;
};

export function earliestKickoff(fixtures: UpcomingFixture[]): string | null {
  return (
    fixtures
      .map((fixture) => fixture.kickoffTime)
      .filter((time): time is string => Boolean(time))
      .sort()[0] ?? null
  );
}

export function groupByGameweek<T extends { gameweek: number | null; kickoffTime: string | null }>(
  matches: T[],
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const match of matches) {
    if (match.gameweek === null) continue;
    const group = groups.get(match.gameweek) ?? [];
    group.push(match);
    groups.set(match.gameweek, group);
  }
  for (const group of groups.values()) {
    group.sort((left, right) => (left.kickoffTime ?? "").localeCompare(right.kickoffTime ?? ""));
  }
  return groups;
}

export function matchSeasons(matches: { season: string }[]): string[] {
  return Array.from(new Set(matches.map((match) => match.season))).sort().reverse();
}

export function summarizeGameweek(dashboard: DashboardData): GameweekSummary {
  if (dashboard.currentGameweek !== null && dashboard.currentGameweekFixtures.length > 0) {
    const firstKickoff = earliestKickoff(dashboard.currentGameweekFixtures);
    return {
      status: "live",
      gameweek: dashboard.currentGameweek,
      fixtureCount: dashboard.currentGameweekFixtures.length,
      firstKickoffUtc: firstKickoff,
    };
  }

  const upcomingByGw = groupByGameweek(dashboard.upcomingFixtures);

  const sortedGameweeks = [...upcomingByGw.keys()].sort((a, b) => a - b);
  if (sortedGameweeks.length === 0) {
    return {
      status: "season-over",
      gameweek: null,
      fixtureCount: 0,
      firstKickoffUtc: null,
    };
  }

  const nextGameweek = sortedGameweeks[0];
  const fixtures = upcomingByGw.get(nextGameweek) ?? [];
  const firstKickoff = earliestKickoff(fixtures);
  return {
    status: "upcoming",
    gameweek: nextGameweek,
    fixtureCount: fixtures.length,
    firstKickoffUtc: firstKickoff,
  };
}

export function fixturesForGameweek(dashboard: DashboardData, gameweek: number | null): UpcomingFixture[] {
  if (gameweek === null) return [];
  if (dashboard.currentGameweek === gameweek) {
    return dashboard.currentGameweekFixtures;
  }
  return dashboard.upcomingFixtures.filter((fixture) => fixture.gameweek === gameweek);
}
