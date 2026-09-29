"use client";

import { useState } from "react";

import { CurrentGameweekView } from "@/components/current-gameweek-view";
import { FixturesWeekView } from "@/components/fixtures-week-view";
import { PostponedFixturesView } from "@/components/postponed-fixtures-view";
import type { UpcomingFixture } from "@/lib/dashboard";

type PredictionsBrowserProps = {
  currentGameweek: number | null;
  currentGameweekFixtures: UpcomingFixture[];
  upcomingFixtures: UpcomingFixture[];
  postponedFixtures: UpcomingFixture[];
};

export function PredictionsBrowser({
  currentGameweek,
  currentGameweekFixtures,
  upcomingFixtures,
  postponedFixtures,
}: PredictionsBrowserProps) {
  const tabs = (
    [
      { id: "current", label: "Current Matchweek", count: currentGameweekFixtures.length },
      { id: "upcoming", label: "Upcoming", count: upcomingFixtures.length },
      { id: "postponed", label: "Postponed", count: postponedFixtures.length },
    ] as const
  ).filter((entry) => entry.count > 0);
  const [tab, setTab] = useState<"current" | "upcoming" | "postponed">(tabs[0]?.id ?? "upcoming");

  return (
    <>
      {/* Empty tabs are hidden, and a single remaining tab needs no switcher. */}
      {tabs.length > 1 ? (
        <div className="tab-bar" role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`tab-button ${tab === entry.id ? "tab-button-active" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
              <span className="tab-count">{entry.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "current" ? (
        <CurrentGameweekView gameweek={currentGameweek} fixtures={currentGameweekFixtures} />
      ) : tab === "upcoming" ? (
        <FixturesWeekView fixtures={upcomingFixtures} />
      ) : (
        <PostponedFixturesView fixtures={postponedFixtures} />
      )}
    </>
  );
}
