"use client";

import { useMemo, useState } from "react";

import { FixtureCard } from "@/components/fixture-card";
import type { UpcomingFixture } from "@/lib/dashboard";

type FixturesWeekViewProps = {
  fixtures: UpcomingFixture[];
};

function sortWeekNumbers(values: Array<number | null>) {
  return values
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
}

export function FixturesWeekView({ fixtures }: FixturesWeekViewProps) {
  const grouped = useMemo(() => {
    const map = new Map<number, UpcomingFixture[]>();
    for (const fixture of fixtures) {
      if (fixture.gameweek === null) {
        continue;
      }
      const current = map.get(fixture.gameweek) ?? [];
      current.push(fixture);
      map.set(fixture.gameweek, current);
    }
    for (const [, items] of map) {
      items.sort((left, right) => {
        const leftTime = left.kickoffTime ?? "";
        const rightTime = right.kickoffTime ?? "";
        return leftTime.localeCompare(rightTime);
      });
    }
    return map;
  }, [fixtures]);

  const gameweeks = useMemo(() => sortWeekNumbers(Array.from(grouped.keys())), [grouped]);
  const [index, setIndex] = useState(0);

  if (gameweeks.length === 0) {
    return <p className="empty-state">No upcoming fixtures are available.</p>;
  }

  const gameweek = gameweeks[Math.min(index, gameweeks.length - 1)];
  const fixturesForWeek = grouped.get(gameweek) ?? [];

  return (
    <section className="week-panel">
      <div className="week-panel-header">
        <button
          className="week-arrow"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
          aria-label="Previous gameweek"
        >
          ←
        </button>
        <div className="week-heading">
          <p className="eyebrow">Upcoming Gameweek</p>
          <h2>Gameweek {gameweek}</h2>
          <p>{fixturesForWeek.length} fixtures in this round</p>
        </div>
        <button
          className="week-arrow"
          onClick={() => setIndex((current) => Math.min(gameweeks.length - 1, current + 1))}
          disabled={index === gameweeks.length - 1}
          aria-label="Next gameweek"
        >
          →
        </button>
      </div>

      <div className="fixtures-week-scroll">
        {fixturesForWeek.map((fixture) => (
          <FixtureCard key={fixture.matchId} fixture={fixture} />
        ))}
      </div>
    </section>
  );
}

