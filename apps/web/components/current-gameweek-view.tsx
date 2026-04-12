import { FixtureCard } from "@/components/fixture-card";
import type { UpcomingFixture } from "@/lib/dashboard";

function formatWeekStart(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Kickoff timing is still being confirmed by the source.";
  }

  return `Round opened ${new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(kickoffTime))}.`;
}

export function CurrentGameweekView({
  gameweek,
  fixtures,
}: {
  gameweek: number | null;
  fixtures: UpcomingFixture[];
}) {
  if (gameweek === null || fixtures.length === 0) {
    return <p className="empty-state">No active Premier League gameweek is currently in progress.</p>;
  }

  const firstKickoff = fixtures
    .map((fixture) => fixture.kickoffTime)
    .filter((kickoffTime): kickoffTime is string => kickoffTime !== null)
    .sort()[0] ?? null;

  return (
    <section className="week-panel">
      <div className="week-panel-header week-panel-header-simple">
        <div className="week-heading">
          <p className="eyebrow">Current Gameweek</p>
          <h2>Gameweek {gameweek}</h2>
          <p>
            This round has already started, so any available scores are shown alongside the pre-match forecast.{" "}
            {formatWeekStart(firstKickoff)}
          </p>
        </div>
      </div>

      <div className="fixtures-week-scroll">
        {fixtures.map((fixture) => (
          <FixtureCard key={fixture.matchId} fixture={fixture} />
        ))}
      </div>
    </section>
  );
}
