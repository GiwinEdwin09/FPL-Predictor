import { PredictionCard } from "@/components/prediction-card";
import { EmptyState } from "@/components/ui/states";
import { earliestKickoff } from "@/lib/gameweek";
import type { UpcomingFixture } from "@/lib/dashboard";
import { formatKickoffWithZone } from "@/lib/format";

export function CurrentGameweekView({
  gameweek,
  fixtures,
}: {
  gameweek: number | null;
  fixtures: UpcomingFixture[];
}) {
  if (gameweek === null || fixtures.length === 0) {
    return (
      <EmptyState title="No matchweek in progress">
        There is no active Premier League round right now. Check the future predictions tab for upcoming fixtures.
      </EmptyState>
    );
  }

  const firstKickoff = earliestKickoff(fixtures);

  return (
    <section className="week-panel">
      <div className="week-panel-header week-panel-header-simple">
        <div className="week-heading">
          <p className="eyebrow">Current Matchweek</p>
          <h2>Matchweek {gameweek}</h2>
          <p>
            This round has already started, so any available scores are shown alongside the pre-match forecast.
            {firstKickoff ? ` Round opened ${formatKickoffWithZone(firstKickoff)}.` : ""}
          </p>
        </div>
      </div>

      <div className="fixtures-week-scroll">
        {fixtures.map((fixture) => (
          <PredictionCard key={fixture.matchId} fixture={fixture} />
        ))}
      </div>
    </section>
  );
}
