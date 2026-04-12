"use client";

import { useState } from "react";

import { FixturesWeekView } from "@/components/fixtures-week-view";
import { PostponedFixturesView } from "@/components/postponed-fixtures-view";
import type { UpcomingFixture } from "@/lib/dashboard";

type PredictionsBrowserProps = {
  upcomingFixtures: UpcomingFixture[];
  postponedFixtures: UpcomingFixture[];
};

export function PredictionsBrowser({
  upcomingFixtures,
  postponedFixtures,
}: PredictionsBrowserProps) {
  const [tab, setTab] = useState<"upcoming" | "postponed">("upcoming");

  return (
    <>
      <div className="tab-bar">
        <button
          className={`tab-button ${tab === "upcoming" ? "tab-button-active" : ""}`}
          onClick={() => setTab("upcoming")}
        >
          Upcoming
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

      {tab === "upcoming" ? (
        <FixturesWeekView fixtures={upcomingFixtures} />
      ) : (
        <PostponedFixturesView fixtures={postponedFixtures} />
      )}
    </>
  );
}
