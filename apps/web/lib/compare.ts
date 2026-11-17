import { modelPick, resolveOutcome, type QuizMatch } from "@/lib/quiz";
import { teamView } from "@/lib/teams";

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
    const { scored: scoredA, conceded: scoredB, xgFor: xgForA, xgAgainst: xgForB } = teamView(match, teamAHome);
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
