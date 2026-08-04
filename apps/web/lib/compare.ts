import { modelPick, resolveOutcome, type QuizMatch } from "@/lib/quiz";

export type HeadToHeadMeeting = {
  match: QuizMatch;
  teamAHome: boolean;
};

export type HeadToHeadSummary = {
  meetings: HeadToHeadMeeting[];
  played: number;
  teamAWins: number;
  draws: number;
  teamBWins: number;
  goalsA: number;
  goalsB: number;
  xgA: number;
  xgB: number;
  modelCorrect: number;
  modelAccuracy: number | null;
};

export function headToHead(matches: QuizMatch[], slugA: string, slugB: string): HeadToHeadSummary {
  const meetings = matches
    .filter(
      (match) =>
        (match.homeTeam.badgeSlug === slugA && match.awayTeam.badgeSlug === slugB) ||
        (match.homeTeam.badgeSlug === slugB && match.awayTeam.badgeSlug === slugA),
    )
    .sort((left, right) => (right.kickoffTime ?? "").localeCompare(left.kickoffTime ?? ""))
    .map((match) => ({ match, teamAHome: match.homeTeam.badgeSlug === slugA }));

  let played = 0;
  let teamAWins = 0;
  let draws = 0;
  let teamBWins = 0;
  let goalsA = 0;
  let goalsB = 0;
  let xgA = 0;
  let xgB = 0;
  let xgSamples = 0;
  let modelCorrect = 0;

  for (const { match, teamAHome } of meetings) {
    const scoredA = teamAHome ? match.score.home : match.score.away;
    const scoredB = teamAHome ? match.score.away : match.score.home;
    const outcome = resolveOutcome(match);
    if (scoredA !== null && scoredB !== null) {
      played += 1;
      goalsA += scoredA;
      goalsB += scoredB;
      if (scoredA > scoredB) {
        teamAWins += 1;
      } else if (scoredA === scoredB) {
        draws += 1;
      } else {
        teamBWins += 1;
      }
    }

    const xgForA = teamAHome ? match.stats.xg.home : match.stats.xg.away;
    const xgForB = teamAHome ? match.stats.xg.away : match.stats.xg.home;
    if (xgForA !== null && xgForB !== null) {
      xgA += xgForA;
      xgB += xgForB;
      xgSamples += 1;
    }

    if (outcome !== null && modelPick(match) === outcome) {
      modelCorrect += 1;
    }
  }

  return {
    meetings,
    played,
    teamAWins,
    draws,
    teamBWins,
    goalsA,
    goalsB,
    xgA: xgSamples > 0 ? xgA / xgSamples : 0,
    xgB: xgSamples > 0 ? xgB / xgSamples : 0,
    modelCorrect,
    modelAccuracy: played > 0 ? modelCorrect / played : null,
  };
}
