"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { HistoricalMatch } from "@/lib/dashboard";

type HistoryWeekViewProps = {
  matches: HistoricalMatch[];
};

function formatKickoff(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Date pending";
  }

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(kickoffTime));
}

function ClubLogo({
  name,
  badgePath,
}: {
  name: string;
  badgePath: string | null;
}) {
  if (!badgePath) {
    return <div className="history-club-mark history-club-mark-fallback">{name.slice(0, 3).toUpperCase()}</div>;
  }

  return <Image src={badgePath} alt={name} width={44} height={44} className="history-club-mark-image" />;
}

type GroupKey = {
  season: string;
  gameweek: number;
  label: string;
};

export function HistoryWeekView({ matches }: HistoryWeekViewProps) {
  const seasons = useMemo(() => Array.from(new Set(matches.map((match) => match.season))).sort().reverse(), [matches]);
  const [season, setSeason] = useState(seasons[0] ?? "2025-2026");

  const groups = useMemo(() => {
    const relevant = matches.filter((match) => match.season === season && match.gameweek !== null);
    const map = new Map<number, HistoricalMatch[]>();
    for (const match of relevant) {
      const key = match.gameweek as number;
      const current = map.get(key) ?? [];
      current.push(match);
      map.set(key, current);
    }

    for (const [, items] of map) {
      items.sort((left, right) => {
        const leftTime = left.kickoffTime ?? "";
        const rightTime = right.kickoffTime ?? "";
        return leftTime.localeCompare(rightTime);
      });
    }

    return map;
  }, [matches, season]);

  const gameweeks = useMemo(() => Array.from(groups.keys()).sort((left, right) => left - right), [groups]);
  const [index, setIndex] = useState(0);
  const clampedIndex = Math.min(index, Math.max(0, gameweeks.length - 1));
  const gameweek = gameweeks[clampedIndex];
  const selectedMatches = gameweek === undefined ? [] : groups.get(gameweek) ?? [];

  return (
    <section className="week-panel">
      <div className="history-controls">
        <label className="toolbar-field toolbar-select">
          <span>Season</span>
          <select
            value={season}
            onChange={(event) => {
              setSeason(event.target.value);
              setIndex(0);
            }}
          >
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {gameweek === undefined ? (
        <p className="empty-state">No finished gameweeks are available for this season.</p>
      ) : (
        <>
          <div className="week-panel-header">
            <button
              className="week-arrow"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={clampedIndex === 0}
              aria-label="Previous gameweek"
            >
              ←
            </button>
            <div className="week-heading">
              <p className="eyebrow">Historical Gameweek</p>
              <h2>
                {season} · Gameweek {gameweek}
              </h2>
              <p>{selectedMatches.length} finished matches</p>
            </div>
            <button
              className="week-arrow"
              onClick={() => setIndex((current) => Math.min(gameweeks.length - 1, current + 1))}
              disabled={clampedIndex === gameweeks.length - 1}
              aria-label="Next gameweek"
            >
              →
            </button>
          </div>

          <div className="history-week-scroll">
            {selectedMatches.map((match) => (
              <article key={match.matchId} className="history-card">
                <div className="history-meta">
                  <span>{formatKickoff(match.kickoffTime)}</span>
                  <span>{match.homeTeam.name} vs {match.awayTeam.name}</span>
                </div>
                <div className="history-scoreline">
                  <div className="history-team-line">
                    <div className="history-team-brand">
                      <ClubLogo name={match.homeTeam.name} badgePath={match.homeTeam.badgePath} />
                      <strong>{match.homeTeam.name}</strong>
                    </div>
                    <span>{match.score.home ?? "-"}</span>
                  </div>
                  <div className="history-team-line">
                    <div className="history-team-brand">
                      <ClubLogo name={match.awayTeam.name} badgePath={match.awayTeam.badgePath} />
                      <strong>{match.awayTeam.name}</strong>
                    </div>
                    <span>{match.score.away ?? "-"}</span>
                  </div>
                </div>
                <div className="history-stats">
                  <div>
                    <span>xG</span>
                    <strong>
                      {match.stats.xg.home ?? "NA"} - {match.stats.xg.away ?? "NA"}
                    </strong>
                  </div>
                  <div>
                    <span>Shots on target</span>
                    <strong>
                      {match.stats.shotsOnTarget.home ?? "NA"} - {match.stats.shotsOnTarget.away ?? "NA"}
                    </strong>
                  </div>
                  <div>
                    <span>Big chances</span>
                    <strong>
                      {match.stats.bigChances.home ?? "NA"} - {match.stats.bigChances.away ?? "NA"}
                    </strong>
                  </div>
                  <div>
                    <span>Possession</span>
                    <strong>
                      {match.stats.possession.home ?? "NA"}% - {match.stats.possession.away ?? "NA"}%
                    </strong>
                  </div>
                </div>
                <div className="history-prematch">
                  <span>
                    Pre-match Elo: {match.preMatch.homeElo ?? "NA"} / {match.preMatch.awayElo ?? "NA"}
                  </span>
                  <span>
                    Pre-match last 5 xG: {match.preMatch.homeLast5Xg ?? "NA"} / {match.preMatch.awayLast5Xg ?? "NA"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
