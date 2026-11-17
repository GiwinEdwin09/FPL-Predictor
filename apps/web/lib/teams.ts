import type { TeamSummary, UpcomingFixture } from "@/lib/dashboard";
import { sortByKickoff } from "@/lib/gameweek";
import { modelPick, resolveOutcome, type QuizMatch } from "@/lib/quiz";

/**
 * Each club's current Elo: the pre-match rating on its next fixture, which already
 * includes every finished result. Clubs with no upcoming fixture are left out.
 */
export function currentEloBySlug(fixtures: UpcomingFixture[]): Record<string, number> {
  const elo: Record<string, number> = {};
  for (const fixture of sortByKickoff(fixtures)) {
    const sides = [
      [fixture.homeTeam.badgeSlug, fixture.context.homeElo],
      [fixture.awayTeam.badgeSlug, fixture.context.awayElo],
    ] as const;
    for (const [slug, rating] of sides) {
      if (rating !== null && !(slug in elo)) {
        elo[slug] = rating;
      }
    }
  }
  return elo;
}

export function collectTeams(matches: QuizMatch[]): TeamSummary[] {
  const bySlug = new Map<string, TeamSummary>();
  for (const match of matches) {
    for (const team of [match.homeTeam, match.awayTeam]) {
      if (!bySlug.has(team.badgeSlug)) {
        bySlug.set(team.badgeSlug, team);
      }
    }
  }
  return Array.from(bySlug.values()).sort((left, right) => left.name.localeCompare(right.name));
}

export function teamMatches(matches: QuizMatch[], badgeSlug: string): QuizMatch[] {
  return matches
    .filter((match) => match.homeTeam.badgeSlug === badgeSlug || match.awayTeam.badgeSlug === badgeSlug)
    .sort((left, right) => (left.kickoffTime ?? "").localeCompare(right.kickoffTime ?? ""));
}

/** A match's goals and xG from one club's side. */
export function teamView(match: QuizMatch, isHome: boolean) {
  const [own, opponent] = isHome ? (["home", "away"] as const) : (["away", "home"] as const);
  return {
    scored: match.score[own],
    conceded: match.score[opponent],
    xgFor: match.stats.xg[own],
    xgAgainst: match.stats.xg[opponent],
  };
}

export type TeamSummaryStats = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  xgFor: number;
  xgAgainst: number;
  modelCorrect: number;
  modelAccuracy: number | null;
};

export function summarizeTeam(matches: QuizMatch[], badgeSlug: string): TeamSummaryStats {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let xgFor = 0;
  let xgAgainst = 0;
  let xgSamples = 0;
  let modelCorrect = 0;

  for (const match of teamMatches(matches, badgeSlug)) {
    const view = teamView(match, match.homeTeam.badgeSlug === badgeSlug);
    const { scored, conceded } = view;
    if (scored === null || conceded === null) {
      continue;
    }

    played += 1;
    goalsFor += scored;
    goalsAgainst += conceded;
    if (scored > conceded) {
      wins += 1;
    } else if (scored === conceded) {
      draws += 1;
    } else {
      losses += 1;
    }

    if (view.xgFor !== null && view.xgAgainst !== null) {
      xgFor += view.xgFor;
      xgAgainst += view.xgAgainst;
      xgSamples += 1;
    }

    const outcome = resolveOutcome(match);
    if (outcome !== null && modelPick(match) === outcome) {
      modelCorrect += 1;
    }
  }

  return {
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    points: wins * 3 + draws,
    xgFor: xgSamples > 0 ? xgFor / xgSamples : 0,
    xgAgainst: xgSamples > 0 ? xgAgainst / xgSamples : 0,
    modelCorrect,
    modelAccuracy: played > 0 ? modelCorrect / played : null,
  };
}

export type StandingRow = TeamSummaryStats & {
  team: TeamSummary;
  goalDifference: number;
};

export function buildStandings(matches: QuizMatch[]): StandingRow[] {
  return collectTeams(matches)
    .map((team) => {
      const stats = summarizeTeam(matches, team.badgeSlug);
      return {
        team,
        ...stats,
        goalDifference: stats.goalsFor - stats.goalsAgainst,
      };
    })
    .sort(
      (left, right) =>
        right.points - left.points ||
        right.goalDifference - left.goalDifference ||
        right.goalsFor - left.goalsFor ||
        left.team.name.localeCompare(right.team.name),
    );
}

export type TeamTrendPoint = {
  matchId: string;
  gameweek: number | null;
  kickoffTime: string | null;
  isHome: boolean;
  opponent: TeamSummary;
  scored: number | null;
  conceded: number | null;
  elo: number | null;
  xgFor: number | null;
  xgAgainst: number | null;
  result: "W" | "D" | "L" | null;
  modelCorrect: boolean | null;
};

export function buildTeamTrend(matches: QuizMatch[], badgeSlug: string): TeamTrendPoint[] {
  return teamMatches(matches, badgeSlug).map((match) => {
    const isHome = match.homeTeam.badgeSlug === badgeSlug;
    const view = teamView(match, isHome);
    const outcome = resolveOutcome(match);
    const result =
      outcome === null ? null : outcome === "draw" ? "D" : (outcome === "home") === isHome ? "W" : "L";
    return {
      matchId: match.matchId,
      gameweek: match.gameweek,
      kickoffTime: match.kickoffTime,
      isHome,
      opponent: isHome ? match.awayTeam : match.homeTeam,
      ...view,
      elo: isHome ? match.preMatch.homeElo : match.preMatch.awayElo,
      result,
      modelCorrect: outcome === null ? null : modelPick(match) === outcome,
    };
  });
}
