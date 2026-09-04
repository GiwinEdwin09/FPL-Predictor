import type { HistoricalMatch, UpcomingFixture } from "@/lib/dashboard";

export type QuizOutcome = "home" | "draw" | "away";

export type QuizMatch = HistoricalMatch & {
  probabilities: NonNullable<HistoricalMatch["probabilities"]>;
};

export function resolveOutcome(match: HistoricalMatch): QuizOutcome | null {
  const home = match.score.home;
  const away = match.score.away;
  if (home === null || away === null) {
    return null;
  }
  if (home > away) {
    return "home";
  }
  if (away > home) {
    return "away";
  }
  return "draw";
}

export function modelPick(match: Pick<UpcomingFixture, "probabilities">): QuizOutcome {
  const { homeWin, draw, awayWin } = match.probabilities;
  if (homeWin >= draw && homeWin >= awayWin) {
    return "home";
  }
  if (awayWin >= homeWin && awayWin >= draw) {
    return "away";
  }
  return "draw";
}

export function outcomeProbability(match: Pick<UpcomingFixture, "probabilities">, outcome: QuizOutcome): number {
  if (outcome === "home") {
    return match.probabilities.homeWin;
  }
  if (outcome === "draw") {
    return match.probabilities.draw;
  }
  return match.probabilities.awayWin;
}

export function pickQuizCandidates(matches: HistoricalMatch[]): QuizMatch[] {
  return matches.filter(
    (match): match is QuizMatch =>
      match.probabilities !== null && match.kickoffTime !== null && resolveOutcome(match) !== null,
  );
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyQuizMatches(candidates: QuizMatch[], dateKey: string, count = 5): QuizMatch[] {
  const random = seededRandom(hashSeed(dateKey));
  const pool = [...candidates];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
