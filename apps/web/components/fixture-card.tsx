import Image from "next/image";

import type { UpcomingFixture } from "@/lib/dashboard";

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

  return <Image src={badgePath} alt={name} width={84} height={84} className="club-mark-image" />;
}

export function FixtureCard({ fixture }: { fixture: UpcomingFixture }) {
  const bars = [
    { label: fixture.homeTeam.shortName, value: fixture.probabilities.homeWin, tone: "var(--tone-home)" },
    { label: "Draw", value: fixture.probabilities.draw, tone: "var(--tone-draw)" },
    { label: fixture.awayTeam.shortName, value: fixture.probabilities.awayWin, tone: "var(--tone-away)" },
  ];

  return (
    <article className="fixture-card">
      <div className="fixture-card-topline">
        <span>GW {fixture.gameweek ?? "TBD"}</span>
        <span>{formatKickoff(fixture.kickoffTime)}</span>
      </div>

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
    </article>
  );
}
