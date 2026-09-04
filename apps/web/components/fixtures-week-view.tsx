"use client";

import { useMemo, useState } from "react";

import { CustomizableFutureFixtureCard } from "@/components/customizable-future-fixture-card";
import { EmptyState } from "@/components/ui/states";
import { earliestKickoff, groupByGameweek } from "@/lib/gameweek";
import { formatKickoffWithZone } from "@/lib/format";
import type { UpcomingFixture } from "@/lib/dashboard";

type FixturesWeekViewProps = {
  fixtures: UpcomingFixture[];
};

export function FixturesWeekView({ fixtures }: FixturesWeekViewProps) {
  const grouped = useMemo(() => groupByGameweek(fixtures), [fixtures]);
  const gameweeks = useMemo(() => Array.from(grouped.keys()).sort((left, right) => left - right), [grouped]);
  const [index, setIndex] = useState(0);

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
          <p>{firstKickoff ? `Starts ${formatKickoffWithZone(firstKickoff)}` : `${fixturesForWeek.length} fixtures in this round`}</p>
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

      <div className="fixtures-week-scroll">
        {fixturesForWeek.map((fixture) => (
          <CustomizableFutureFixtureCard key={fixture.matchId} fixture={fixture} />
        ))}
      </div>
    </section>
  );
}
