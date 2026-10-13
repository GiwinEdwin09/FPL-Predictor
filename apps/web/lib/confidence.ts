import type { FixtureProbabilities } from "@/lib/dashboard";
import { modelPick } from "@/lib/quiz";

export type ConfidenceLevel = "strong-favorite" | "favorite" | "slight-edge" | "too-close";

export type Confidence = {
  level: ConfidenceLevel;
  label: string;
  /** Outcome the model leans towards, or null when effectively even. */
  pick: "home" | "draw" | "away" | null;
};

/**
 * Human-readable confidence for a 1X2 probability distribution.
 *
 * A pick needs a clear gap over the second outcome; its strength then
 * comes from the leading probability.
 */
export function describeConfidence(probabilities: FixtureProbabilities): Confidence {
  const { homeWin, draw, awayWin } = probabilities;
  const values = [homeWin, draw, awayWin];
  const sorted = [...values].sort((left, right) => right - left);
  const top = sorted[0];
  const second = sorted[1];
  const gap = top - second;
  const pick = modelPick({ probabilities });

  // No outcome clearly ahead of the next one.
  if (gap <= 0.09) {
    return { level: "too-close", label: "Too close to call", pick: null };
  }

  if (top >= 0.7) {
    return { level: "strong-favorite", label: "Strong favourite", pick };
  }

  if (top >= 0.55) {
    return { level: "favorite", label: "Favourite", pick };
  }

  return { level: "slight-edge", label: "Slight edge", pick };
}

export function outcomeLabel(
  outcome: "home" | "draw" | "away",
  homeShort: string,
  awayShort: string,
): string {
  if (outcome === "home") return `${homeShort} win`;
  if (outcome === "away") return `${awayShort} win`;
  return "Draw";
}
