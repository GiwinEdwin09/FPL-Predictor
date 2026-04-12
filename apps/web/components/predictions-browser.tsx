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
  const [tab, setTab] = useState<"current" | "future" | "postponed">(
    currentGameweekFixtures.length > 0 ? "current" : "future",
  );

  return (
    <>
      <div className="tab-bar">
        <button
          className={`tab-button ${tab === "current" ? "tab-button-active" : ""}`}
          onClick={() => setTab("current")}
        >
          Current Gameweek
          <span className="tab-count">{currentGameweekFixtures.length}</span>
        </button>
        <button
          className={`tab-button ${tab === "future" ? "tab-button-active" : ""}`}
          onClick={() => setTab("future")}
        >
          Future Predictions
          <span className="tab-count">{upcomingFixtures.length}</span>
        </button>
        <button
          className={`tab-button ${tab === "postponed" ? "tab-button-active" : ""}`}
          onClick={() => setTab("postponed")}
        >
          Postponed
          <span className="tab-count">{postponedFixtures.length}</span>
        </button>
      </div>

      {tab === "current" ? (
        <CurrentGameweekView gameweek={currentGameweek} fixtures={currentGameweekFixtures} />
      ) : tab === "future" ? (
        <FixturesWeekView fixtures={upcomingFixtures} />
      ) : (
        <PostponedFixturesView fixtures={postponedFixtures} />
      )}
    </>
  );
}
