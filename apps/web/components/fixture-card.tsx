import type { ReactNode } from "react";
import Image from "next/image";

import type { UpcomingFixture } from "@/lib/dashboard";
import type { FixtureProbabilities } from "@/lib/lineup";

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatKickoff(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Kickoff pending";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(kickoffTime));
}

function TeamBadge({
  name,
  badgePath,
}: {
  name: string;
  badgePath: string | null;
}) {
  if (!badgePath) {
    return <div className="club-mark club-mark-fallback">{name.slice(0, 3).toUpperCase()}</div>;
  }

  return <Image src={badgePath} alt={name} width={56} height={56} className="club-mark-image" />;
}

export function FixtureCard({
  fixture,
  probabilitiesOverride,
  children,
}: {
  fixture: UpcomingFixture;
  probabilitiesOverride?: FixtureProbabilities;
  children?: ReactNode;
}) {
  const probabilities = probabilitiesOverride ?? fixture.probabilities;
  const bars = [
    { label: fixture.homeTeam.shortName, value: probabilities.homeWin, tone: "var(--signal-home)" },
    { label: "Draw", value: probabilities.draw, tone: "var(--signal-draw)" },
    { label: fixture.awayTeam.shortName, value: probabilities.awayWin, tone: "var(--signal-away)" },
  ];

  return (
    <article className="fixture-card">
      <div className="fixture-card-topline">
        <span className="fixture-card-gw">GW {fixture.gameweek ?? "TBD"}</span>
        <span className="fixture-card-time">{formatKickoff(fixture.kickoffTime)}</span>
      </div>

      {fixture.finished ? (
        <div className="fixture-score-banner">
          <span>Current Result</span>
          <strong>
            {fixture.homeTeam.shortName} {fixture.score.home ?? "-"} - {fixture.score.away ?? "-"}{" "}
            {fixture.awayTeam.shortName}
          </strong>
        </div>
      ) : null}

      <div className="fixture-clubs">
        <div className="club-stack">
          <TeamBadge name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} />
          <div>
            <p className="club-name">{fixture.homeTeam.name}</p>
            <p className="club-subline">Elo {fixture.context.homeElo ?? "NA"}</p>
          </div>
        </div>
        <div className="fixture-versus">vs</div>
        <div className="club-stack club-stack-away">
          <div>
            <p className="club-name">{fixture.awayTeam.name}</p>
            <p className="club-subline">Elo {fixture.context.awayElo ?? "NA"}</p>
          </div>
          <TeamBadge name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} />
        </div>
      </div>

      <div className="probability-list">
        {bars.map((bar) => (
          <div key={bar.label} className="probability-row">
            <div className="probability-label">
              <span>{bar.label}</span>
              <strong>{formatPercent(bar.value)}</strong>
            </div>
            <div className="probability-track">
              <div className="probability-fill" style={{ width: `${Math.max(8, bar.value * 100)}%`, background: bar.tone }} />
            </div>
          </div>
        ))}
      </div>

      <div className="fixture-context-grid">
        <div>
          <span className="context-label">Last 5 xG</span>
          <strong>
            {fixture.context.homeLast5Xg ?? "NA"} - {fixture.context.awayLast5Xg ?? "NA"}
          </strong>
        </div>
        <div>
          <span className="context-label">Last 5 xGA</span>
          <strong>
            {fixture.context.homeLast5Xga ?? "NA"} - {fixture.context.awayLast5Xga ?? "NA"}
          </strong>
        </div>
        <div>
          <span className="context-label">Rest Days</span>
          <strong>
            {fixture.context.homeDaysRest ?? "NA"} - {fixture.context.awayDaysRest ?? "NA"}
          </strong>
        </div>
        <div>
          <span className="context-label">Form Sample</span>
          <strong>
            {fixture.context.homeLast5Matches ?? 0} - {fixture.context.awayLast5Matches ?? 0}
          </strong>
        </div>
      </div>

      {children}
    </article>
  );
}
