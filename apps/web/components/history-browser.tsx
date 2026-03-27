"use client";

import { useState } from "react";

import type { HistoricalMatch } from "@/lib/dashboard";

function formatKickoff(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Date pending";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(kickoffTime));
}

export function HistoryBrowser({ matches }: { matches: HistoricalMatch[] }) {
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("all");
  const [visibleCount, setVisibleCount] = useState(24);

  const seasons = Array.from(new Set(matches.map((match) => match.season)));
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = matches.filter((match) => {
    const seasonMatch = season === "all" || match.season === season;
    const clubText = `${match.homeTeam.name} ${match.awayTeam.name}`.toLowerCase();
    const searchMatch = normalizedQuery.length === 0 || clubText.includes(normalizedQuery);
    return seasonMatch && searchMatch;
  });
  const visibleMatches = filtered.slice(0, visibleCount);

  return (
    <section className="history-shell">
      <div className="history-toolbar">
        <label className="toolbar-field">
          <span>Search clubs</span>
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(24);
            }}
            placeholder="Arsenal, Chelsea, Newcastle..."
          />
        </label>
        <label className="toolbar-field toolbar-select">
          <span>Season</span>
          <select
            value={season}
            onChange={(event) => {
              setSeason(event.target.value);
              setVisibleCount(24);
            }}
          >
            <option value="all">All seasons</option>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="history-grid">
        {visibleMatches.map((match) => (
          <article key={match.matchId} className="history-card">
            <div className="history-meta">
              <span>{match.season}</span>
              <span>GW {match.gameweek ?? "TBD"}</span>
              <span>{formatKickoff(match.kickoffTime)}</span>
            </div>
            <div className="history-scoreline">
              <div className="history-team-line">
                <strong>{match.homeTeam.name}</strong>
                <span>{match.score.home ?? "-"}</span>
              </div>
              <div className="history-team-line">
                <strong>{match.awayTeam.name}</strong>
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

      {visibleCount < filtered.length ? (
        <button className="load-more-button" onClick={() => setVisibleCount((current) => current + 24)}>
          Load more matches
        </button>
      ) : null}
    </section>
  );
}

