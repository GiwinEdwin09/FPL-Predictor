import { formatMetric } from "@/lib/format";
import type { UpcomingFixture } from "@/lib/dashboard";

export type FactorTone = "up" | "down" | "flat";

export type PredictionFactor = {
  tone: FactorTone;
  /** Short uppercase tag, e.g. "ELO", "ATTACK FORM". */
  tag: string;
  /** Plain-text explanation referencing only values present in the data. */
  text: string;
};

/**
 * Derives human-readable model factors from the fixture's real pre-match
 * context. Every factor is gated on the underlying data actually existing —
 * nothing is invented. Thresholds are conservative so only meaningful gaps
 * are called out.
 */
export function explainPrediction(fixture: UpcomingFixture): PredictionFactor[] {
  const factors: PredictionFactor[] = [];
  const home = fixture.homeTeam.shortName;
  const away = fixture.awayTeam.shortName;
  const ctx = fixture.context;

  // Elo gap
  if (ctx.homeElo !== null && ctx.awayElo !== null) {
    const diff = Math.round(ctx.homeElo - ctx.awayElo);
    if (Math.abs(diff) >= 40) {
      const leader = diff > 0 ? home : away;
      factors.push({
        tone: "up",
        tag: "Rating",
        text: `${leader} hold a clear Elo edge (${Math.round(
          diff > 0 ? ctx.homeElo : ctx.awayElo,
        )} vs ${Math.round(diff > 0 ? ctx.awayElo : ctx.homeElo)}).`,
      });
    } else {
      factors.push({
        tone: "flat",
        tag: "Rating",
        text: `Elo ratings are close (${Math.round(ctx.homeElo)} vs ${Math.round(ctx.awayElo)}) — little to separate the sides on rating.`,
      });
    }
  }

  // Home advantage — the production model includes an explicit home term.
  factors.push({
    tone: "up",
    tag: "Venue",
    text: "Home advantage is applied by the model, lifting the home side's win probability.",
  });

  // Attack form (last 5 xG)
  if (ctx.homeLast5Xg !== null && ctx.awayLast5Xg !== null) {
    const diff = ctx.homeLast5Xg - ctx.awayLast5Xg;
    if (Math.abs(diff) >= 0.25) {
      const leader = diff > 0 ? home : away;
      factors.push({
        tone: "up",
        tag: "Attack form",
        text: `${leader} carry the stronger recent attack (${formatMetric(
          Math.max(ctx.homeLast5Xg, ctx.awayLast5Xg),
        )} vs ${formatMetric(Math.min(ctx.homeLast5Xg, ctx.awayLast5Xg))} xG across the last five).`,
      });
    }
  }

  // Defensive form (last 5 xGA, lower is better)
  if (ctx.homeLast5Xga !== null && ctx.awayLast5Xga !== null) {
    const diff = ctx.homeLast5Xga - ctx.awayLast5Xga;
    if (Math.abs(diff) >= 0.25) {
      const leader = diff < 0 ? home : away;
      factors.push({
        tone: "up",
        tag: "Defence form",
        text: `${leader} have been tighter defensively (${formatMetric(
          Math.min(ctx.homeLast5Xga, ctx.awayLast5Xga),
        )} vs ${formatMetric(Math.max(ctx.homeLast5Xga, ctx.awayLast5Xga))} xGA across the last five).`,
      });
    }
  }

  // Rest advantage
  if (ctx.homeDaysRest !== null && ctx.awayDaysRest !== null) {
    const diff = Math.round(ctx.homeDaysRest - ctx.awayDaysRest);
    if (Math.abs(diff) >= 2) {
      const rested = diff > 0 ? home : away;
      factors.push({
        tone: "flat",
        tag: "Rest",
        text: `${rested} come into this match with roughly ${Math.abs(diff)} extra days' rest.`,
      });
    }
  }

  return factors;
}

/** Compact per-team metric pairs used inside the disclosure panel. */
export function fixtureMetricPairs(fixture: UpcomingFixture) {
  const ctx = fixture.context;
  return [
    {
      label: "Attack · last 5 xG",
      home: ctx.homeLast5Xg,
      away: ctx.awayLast5Xg,
      format: (value: number | null) => (value === null ? "No data" : value.toFixed(2)),
    },
    {
      label: "Defence · last 5 xGA",
      home: ctx.homeLast5Xga,
      away: ctx.awayLast5Xga,
      format: (value: number | null) => (value === null ? "No data" : value.toFixed(2)),
    },
    {
      label: "Elo rating",
      home: ctx.homeElo,
      away: ctx.awayElo,
      format: (value: number | null) => (value === null ? "—" : String(Math.round(value))),
    },
    {
      label: "Days rest",
      home: ctx.homeDaysRest,
      away: ctx.awayDaysRest,
      format: (value: number | null) => (value === null ? "—" : String(Math.round(value))),
    },
  ];
}
