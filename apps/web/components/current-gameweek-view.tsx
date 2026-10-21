"use client";

import { PredictionCard } from "@/components/prediction-card";
import { DayGroups, LocalTime } from "@/components/ui/local-time";
import { EmptyState } from "@/components/ui/states";
import { earliestKickoff } from "@/lib/gameweek";
import type { UpcomingFixture } from "@/lib/dashboard";

export function CurrentGameweekView({
  gameweek,
  fixtures,
  highlightedMatchId = null,
}: {
  gameweek: number | null;
  fixtures: UpcomingFixture[];
  highlightedMatchId?: string | null;
}) {
  if (gameweek === null || fixtures.length === 0) {
    return (
      <EmptyState title="No matchweek in progress">
        There is no active Premier League round right now. Check the Upcoming tab for future fixtures.
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
            {firstKickoff ? (
              <>
                {" "}
                Round opened <LocalTime value={firstKickoff} withZone />.
              </>
            ) : null}
          </p>
        </div>
      </div>

      <DayGroups fixtures={fixtures}>
        {(fixture) => <PredictionCard fixture={fixture} highlighted={fixture.matchId === highlightedMatchId} />}
      </DayGroups>
    </section>
  );
}
