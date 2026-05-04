import type { DashboardData, UpcomingFixture } from "@/lib/dashboard";

export type GameweekSummary = {
  status: "live" | "upcoming" | "season-over";
  gameweek: number | null;
  fixtureCount: number;
  firstKickoffUtc: string | null;
  deadlineUtc: string | null;
};

function earliestKickoff(fixtures: UpcomingFixture[]): string | null {
  return (
    fixtures
      .map((fixture) => fixture.kickoffTime)
      .filter((time): time is string => Boolean(time))
      .sort()[0] ?? null
  );
}

function deadlineFromKickoff(kickoffTime: string | null): string | null {
  if (!kickoffTime) {
    return null;
  }
  // FPL deadline is canonically 90 minutes before the first kickoff of the gameweek.
  const ms = new Date(kickoffTime).getTime();
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms - 90 * 60 * 1000).toISOString();
}

export function summarizeGameweek(dashboard: DashboardData): GameweekSummary {
  if (dashboard.currentGameweek !== null && dashboard.currentGameweekFixtures.length > 0) {
    const firstKickoff = earliestKickoff(dashboard.currentGameweekFixtures);
    return {
      status: "live",
      gameweek: dashboard.currentGameweek,
      fixtureCount: dashboard.currentGameweekFixtures.length,
      firstKickoffUtc: firstKickoff,
      deadlineUtc: deadlineFromKickoff(firstKickoff),
    };
  }

  const upcomingByGw = new Map<number, UpcomingFixture[]>();
  for (const fixture of dashboard.upcomingFixtures) {
    if (fixture.gameweek === null) continue;
    const existing = upcomingByGw.get(fixture.gameweek) ?? [];
    existing.push(fixture);
    upcomingByGw.set(fixture.gameweek, existing);
  }

  const sortedGameweeks = [...upcomingByGw.keys()].sort((a, b) => a - b);
  if (sortedGameweeks.length === 0) {
    return {
      status: "season-over",
      gameweek: null,
      fixtureCount: 0,
      firstKickoffUtc: null,
      deadlineUtc: null,
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
    deadlineUtc: deadlineFromKickoff(firstKickoff),
  };
}

export function fixturesForGameweek(dashboard: DashboardData, gameweek: number | null): UpcomingFixture[] {
  if (gameweek === null) return [];
  if (dashboard.currentGameweek === gameweek) {
    return dashboard.currentGameweekFixtures;
  }
  return dashboard.upcomingFixtures.filter((fixture) => fixture.gameweek === gameweek);
}

export function formatDeadlineShort(deadlineUtc: string | null): string | null {
  if (!deadlineUtc) return null;
  const date = new Date(deadlineUtc);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

export function formatDeadlineLong(deadlineUtc: string | null): string | null {
  if (!deadlineUtc) return null;
  const date = new Date(deadlineUtc);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "UTC",
  }).format(date);
}
