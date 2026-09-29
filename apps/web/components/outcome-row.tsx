import { TeamCrest } from "@/components/ui/crest";
import { formatMatchDate, formatPercent } from "@/lib/format";
import type { UpsetEntry } from "@/lib/insights";

type OutcomeRowProps = {
  entry: UpsetEntry;
  hit: boolean;
  /** Replaces the rank number with a text chip, for single highlighted rows. */
  label?: string;
};

export function OutcomeRow({ entry, hit, label }: OutcomeRowProps) {
  const outcomeText =
    entry.outcome === "draw"
      ? "a draw"
      : entry.outcome === "home"
        ? `${entry.match.homeTeam.shortName} win`
        : `${entry.match.awayTeam.shortName} win`;
  return (
    <li className={`upset-row${hit ? " hit-row" : ""}`}>
      {label ? (
        <span className="upset-label">{label}</span>
      ) : (
        <span className="upset-rank" aria-hidden="true" />
      )}
      <div className="upset-fixture">
        <span className="upset-team">
          <TeamCrest name={entry.match.homeTeam.name} badgePath={entry.match.homeTeam.badgePath} size={30} />
          {entry.match.homeTeam.shortName}
        </span>
        <strong className="upset-score">
          {entry.match.score.home} – {entry.match.score.away}
        </strong>
        <span className="upset-team">
          <TeamCrest name={entry.match.awayTeam.name} badgePath={entry.match.awayTeam.badgePath} size={30} />
          {entry.match.awayTeam.shortName}
        </span>
      </div>
      <div className="upset-detail">
        <span>
          MW {entry.match.gameweek ?? "—"} · {formatMatchDate(entry.match.kickoffTime)}
        </span>
        <span>
          {hit ? "Called at just " : "Gave "}
          {outcomeText} <strong>{formatPercent(entry.probability, 1)}</strong> · {hit ? "and it landed" : "it happened"}
        </span>
      </div>
    </li>
  );
}
