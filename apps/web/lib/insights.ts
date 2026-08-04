import {
  modelPick,
  outcomeProbability,
  resolveOutcome,
  type QuizMatch,
  type QuizOutcome,
} from "@/lib/quiz";

export type GameweekAccuracy = {
  season: string;
  gameweek: number;
  total: number;
  correct: number;
  accuracy: number;
};

export function accuracyByGameweek(matches: QuizMatch[]): GameweekAccuracy[] {
  const groups = new Map<string, { season: string; gameweek: number; total: number; correct: number }>();
  for (const match of matches) {
    if (match.gameweek === null) {
      continue;
    }
    const key = `${match.season}#${match.gameweek}`;
    const entry = groups.get(key) ?? { season: match.season, gameweek: match.gameweek, total: 0, correct: 0 };
    entry.total += 1;
    if (resolveOutcome(match) === modelPick(match)) {
      entry.correct += 1;
    }
    groups.set(key, entry);
  }

  return Array.from(groups.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.total > 0 ? entry.correct / entry.total : 0,
    }))
    .sort((left, right) =>
      left.season === right.season ? left.gameweek - right.gameweek : left.season.localeCompare(right.season),
    );
}

export type UpsetEntry = {
  match: QuizMatch;
  outcome: QuizOutcome;
  probability: number;
};

export function biggestUpsets(matches: QuizMatch[], count = 8): UpsetEntry[] {
  const entries: UpsetEntry[] = [];
  for (const match of matches) {
    const outcome = resolveOutcome(match);
    if (outcome === null) {
      continue;
    }
    entries.push({ match, outcome, probability: outcomeProbability(match, outcome) });
  }
  return entries.sort((left, right) => left.probability - right.probability).slice(0, count);
}

export type CalibrationBin = {
  label: string;
  lower: number;
  upper: number;
  predictedAvg: number;
  actualRate: number;
  count: number;
};

const OUTCOMES: QuizOutcome[] = ["home", "draw", "away"];

export function calibrationBins(matches: QuizMatch[], binCount = 10): CalibrationBin[] {
  const bins = Array.from({ length: binCount }, (_, index) => ({
    label: `${Math.round((index / binCount) * 100)}–${Math.round(((index + 1) / binCount) * 100)}%`,
    lower: index / binCount,
    upper: (index + 1) / binCount,
    predictedAvg: 0,
    actualRate: 0,
    count: 0,
  }));
  const predictedSum = new Array<number>(binCount).fill(0);
  const actualSum = new Array<number>(binCount).fill(0);

  for (const match of matches) {
    const actual = resolveOutcome(match);
    if (actual === null) {
      continue;
    }
    for (const outcome of OUTCOMES) {
      const probability = outcomeProbability(match, outcome);
      const index = Math.min(binCount - 1, Math.floor(probability * binCount));
      bins[index].count += 1;
      predictedSum[index] += probability;
      actualSum[index] += outcome === actual ? 1 : 0;
    }
  }

  bins.forEach((bin, index) => {
    if (bin.count > 0) {
      bin.predictedAvg = predictedSum[index] / bin.count;
      bin.actualRate = actualSum[index] / bin.count;
    }
  });
  return bins;
}

export type ModelSummary = {
  total: number;
  correct: number;
  accuracy: number;
  homeBaseline: number;
};

export function summarizeModel(matches: QuizMatch[]): ModelSummary {
  let resolved = 0;
  let correct = 0;
  let homeWins = 0;
  for (const match of matches) {
    const outcome = resolveOutcome(match);
    if (outcome === null) {
      continue;
    }
    resolved += 1;
    if (outcome === "home") {
      homeWins += 1;
    }
    if (modelPick(match) === outcome) {
      correct += 1;
    }
  }
  return {
    total: resolved,
    correct,
    accuracy: resolved > 0 ? correct / resolved : 0,
    homeBaseline: resolved > 0 ? homeWins / resolved : 0,
  };
}
