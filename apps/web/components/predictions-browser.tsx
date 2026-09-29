"use client";

import { useEffect, useState } from "react";

import { CurrentGameweekView } from "@/components/current-gameweek-view";
import { FixturesWeekView } from "@/components/fixtures-week-view";
import { PostponedFixturesView } from "@/components/postponed-fixtures-view";
import type { UpcomingFixture } from "@/lib/dashboard";
import { fixtureAnchorId, matchIdFromHash } from "@/lib/fixture-link";

const HIGHLIGHT_MS = 2600;

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
  // Set from a #fixture-… link: which fixture to open on, and whether it is still outlined.
  const [focus, setFocus] = useState<{ matchId: string; gameweek: number | null } | null>(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState<string | null>(null);

  useEffect(() => {
    function focusFromHash() {
      const matchId = matchIdFromHash(window.location.hash);
      if (!matchId) return;
      const current = currentGameweekFixtures.find((fixture) => fixture.matchId === matchId);
      const upcoming = upcomingFixtures.find((fixture) => fixture.matchId === matchId);
      const postponed = postponedFixtures.find((fixture) => fixture.matchId === matchId);
      const target = current ?? upcoming ?? postponed;
      if (!target) return;
      setTab(current ? "current" : upcoming ? "upcoming" : "postponed");
      setFocus({ matchId, gameweek: target.gameweek });
      setHighlightedMatchId(matchId);
    }
    focusFromHash();
    window.addEventListener("hashchange", focusFromHash);
    return () => window.removeEventListener("hashchange", focusFromHash);
  }, [currentGameweekFixtures, upcomingFixtures, postponedFixtures]);

  useEffect(() => {
    if (!highlightedMatchId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(fixtureAnchorId(highlightedMatchId))?.scrollIntoView({ block: "start" });
    });
    const timer = window.setTimeout(() => setHighlightedMatchId(null), HIGHLIGHT_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [highlightedMatchId]);

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
        <CurrentGameweekView
          gameweek={currentGameweek}
          fixtures={currentGameweekFixtures}
          highlightedMatchId={highlightedMatchId}
        />
      ) : tab === "upcoming" ? (
        <FixturesWeekView
          // Remount so the view opens on the linked fixture's matchweek.
          key={focus?.matchId ?? "default"}
          fixtures={upcomingFixtures}
          initialGameweek={focus?.gameweek ?? null}
          highlightedMatchId={highlightedMatchId}
        />
      ) : (
        <PostponedFixturesView fixtures={postponedFixtures} />
      )}
    </>
  );
}
