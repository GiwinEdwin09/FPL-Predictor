import type { FixtureProbabilities } from "@/lib/dashboard";
import { formatPercent } from "@/lib/format";

type ProbabilityBarProps = {
  probabilities: FixtureProbabilities;
  homeShort: string;
  awayShort: string;
  size?: "sm" | "md" | "lg";
  showValues?: boolean;
  className?: string;
};

/**
 * The signature Prem Predict visual: a single segmented HOME | DRAW | AWAY
 * probability bar with labelled values. Segments animate in on load and
 * transition smoothly when the underlying probabilities change.
 */
export function ProbabilityBar({
  probabilities,
  homeShort,
  awayShort,
  size = "md",
  showValues = true,
  className = "",
}: ProbabilityBarProps) {
  const total = probabilities.homeWin + probabilities.draw + probabilities.awayWin || 1;
  const homePct = Math.max(0, Math.min(100, (probabilities.homeWin / total) * 100));
  const drawPct = Math.max(0, Math.min(100, (probabilities.draw / total) * 100));
  const awayPct = Math.max(100 - homePct - drawPct, 0);

  const ariaLabel = `Match probabilities: ${homeShort} ${formatPercent(probabilities.homeWin)}, draw ${formatPercent(
    probabilities.draw,
  )}, ${awayShort} ${formatPercent(probabilities.awayWin)}`;

  return (
    <div
      className={`probbar probbar-${size} ${className}`.trim()}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="probbar-track" aria-hidden="true">
        <span
          className="probbar-seg probbar-seg-home"
          style={{ width: `${homePct}%` }}
        />
        <span
          className="probbar-seg probbar-seg-draw"
          style={{ width: `${drawPct}%` }}
        />
        <span
          className="probbar-seg probbar-seg-away"
          style={{ width: `${awayPct}%` }}
        />
      </div>

      {showValues ? (
        <div className="probbar-values" aria-hidden="true">
          <div className={`probbar-cell${size === "sm" ? "" : " probbar-cell-center"}`}>
            <span className="probbar-value-num">{formatPercent(probabilities.homeWin)}</span>
            <span className="probbar-value-label">
              <span className="probbar-swatch probbar-swatch-home" />
              {homeShort}
            </span>
          </div>
          <div className={`probbar-cell probbar-cell-center${size === "sm" ? " probbar-cell-right" : ""}`}>
            <span className="probbar-value-num">{formatPercent(probabilities.draw)}</span>
            <span className="probbar-value-label">
              <span className="probbar-swatch probbar-swatch-draw" />
              Draw
            </span>
          </div>
          <div className={`probbar-cell probbar-cell-right${size === "sm" ? " probbar-cell-left" : ""}`}>
            <span className="probbar-value-num">{formatPercent(probabilities.awayWin)}</span>
            <span className="probbar-value-label">
              <span className="probbar-swatch probbar-swatch-away" />
              {awayShort}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
