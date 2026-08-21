export type ConfidenceLevel =
  | "strong-favorite"
  | "favorite"
  | "slight-edge"
  | "too-close"
  | "wide-open";

export type Confidence = {
  level: ConfidenceLevel;
  label: string;
  /** Short label used in compact badges. */
  shortLabel: string;
  /** Outcome the model leans towards, or null when effectively even. */
  pick: "home" | "draw" | "away" | null;
};

type Distribution = {
  homeWin: number;
  draw: number;
  awayWin: number;
};

function pickOutcome({ homeWin, draw, awayWin }: Distribution): "home" | "draw" | "away" {
  if (homeWin >= draw && homeWin >= awayWin) return "home";
  if (awayWin >= homeWin && awayWin >= draw) return "away";
  return "draw";
}

/**
 * Human-readable confidence for a 1X2 probability distribution.
 *
 * Uses the full distribution, not just the largest probability:
 * - the gap between the top two outcomes
 * - how tightly packed the three outcomes are (spread)
 * - the draw probability as a balancing force
 */
export function describeConfidence(probabilities: Distribution): Confidence {
  const { homeWin, draw, awayWin } = probabilities;
  const values = [homeWin, draw, awayWin];
  const sorted = [...values].sort((left, right) => right - left);
  const top = sorted[0];
  const second = sorted[1];
  const gap = top - second;
  const spread = sorted[0] - sorted[2];
  const pick = pickOutcome(probabilities);

  // Very tight distribution: nothing separates the outcomes.
  if (spread <= 0.12 && gap <= 0.06) {
    return { level: "wide-open", label: "Wide Open", shortLabel: "Wide Open", pick: null };
  }

  // Close distribution with a modest leader.
  if (gap <= 0.09) {
    return {
      level: "too-close",
      label: "Too Close to Call",
      shortLabel: "Too Close",
      pick: null,
    };
  }

  if (top >= 0.7) {
    return { level: "strong-favorite", label: "Strong Favorite", shortLabel: "Strong Fav", pick };
  }

  if (top >= 0.55) {
    return { level: "favorite", label: "Favorite", shortLabel: "Favorite", pick };
  }

  return { level: "slight-edge", label: "Slight Edge", shortLabel: "Slight Edge", pick };
}

export function outcomeLabel(
  outcome: "home" | "draw" | "away",
  homeShort: string,
  awayShort: string,
): string {
  if (outcome === "home") return `${homeShort} WIN`;
  if (outcome === "away") return `${awayShort} WIN`;
  return "DRAW";
}
