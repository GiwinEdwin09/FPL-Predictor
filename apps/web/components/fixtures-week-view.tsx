"use client";

import { useMemo, useState } from "react";

import { CustomizableFutureFixtureCard } from "@/components/customizable-future-fixture-card";
import { DayGroups, LocalTime } from "@/components/ui/local-time";
import { EmptyState } from "@/components/ui/states";
import { earliestKickoff, groupByGameweek } from "@/lib/gameweek";
import type { UpcomingFixture } from "@/lib/dashboard";

type FixturesWeekViewProps = {
  fixtures: UpcomingFixture[];
  /** Matchweek to open on; defaults to the earliest one. */
  initialGameweek?: number | null;
  highlightedMatchId?: string | null;
};

export function FixturesWeekView({ fixtures, initialGameweek = null, highlightedMatchId = null }: FixturesWeekViewProps) {
  const grouped = useMemo(() => groupByGameweek(fixtures), [fixtures]);
  const gameweeks = useMemo(() => Array.from(grouped.keys()).sort((left, right) => left - right), [grouped]);
  const [index, setIndex] = useState(() => Math.max(0, initialGameweek === null ? 0 : gameweeks.indexOf(initialGameweek)));

  if (gameweeks.length === 0) {
    return (
      <EmptyState title="No upcoming fixtures available">
        The schedule has not been published for future matchweeks yet. Check back once the next round is confirmed.
      </EmptyState>
    );
  }

  const gameweek = gameweeks[Math.min(index, gameweeks.length - 1)];
  const fixturesForWeek = grouped.get(gameweek) ?? [];
  const firstKickoff = earliestKickoff(fixturesForWeek);

  return (
    <section className="week-panel">
      <div className="week-panel-header">
        <button
          className="week-arrow"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          aria-label="Previous matchweek"
        >
          ←
        </button>
        <div className="week-heading">
          <p className="eyebrow">Upcoming Matchweek</p>
          <h2>Matchweek {gameweek}</h2>
          <p>
            {firstKickoff ? (
              <>
                Starts <LocalTime value={firstKickoff} withZone /> · times in your time zone
              </>
            ) : (
              `${fixturesForWeek.length} fixtures in this round`
            )}
          </p>
        </div>
        <button
          className="week-arrow"
          onClick={() => setIndex((current) => Math.min(gameweeks.length - 1, current + 1))}
          disabled={index === gameweeks.length - 1}
          aria-label="Next matchweek"
        >
          →
        </button>
      </div>

      <DayGroups fixtures={fixturesForWeek}>
        {(fixture) => (
          <CustomizableFutureFixtureCard fixture={fixture} highlighted={fixture.matchId === highlightedMatchId} />
        )}
      </DayGroups>
    </section>
  );
}
