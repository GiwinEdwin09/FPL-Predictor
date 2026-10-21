import type { HistoricalMatch } from "@/lib/dashboard";

type ForecastedMatch = Pick<HistoricalMatch, "kickoffTime" | "predictionType" | "probabilities">;

/**
 * True when a forecast is a replay of a match the model trained on. Replays are scored after the
 * fact by the current model, which is fit on every match that kicked off before its training cutoff
 * (the dashboard's `model.split.validation_cutoff_utc`), so grading those replays is in-sample.
 */
export function isInSampleReplay(match: ForecastedMatch, trainingCutoffUtc: string): boolean {
  if (match.predictionType !== "replay" || match.probabilities === null) return false;
  const cutoff = Date.parse(trainingCutoffUtc);
  const kickoff = match.kickoffTime === null ? Number.NaN : Date.parse(match.kickoffTime);
  // An undated cutoff (the trainer's gameweek fallback) or kickoff can't rule training out.
  if (Number.isNaN(cutoff) || Number.isNaN(kickoff)) return true;
  return kickoff < cutoff;
}

/** How many of the matches carry a forecast, and how many of those are in-sample replays. */
export function replayCoverage(matches: ForecastedMatch[], trainingCutoffUtc: string) {
  const graded = matches.filter((match) => match.probabilities !== null);
  return {
    graded: graded.length,
    inSample: graded.filter((match) => isInSampleReplay(match, trainingCutoffUtc)).length,
  };
}
