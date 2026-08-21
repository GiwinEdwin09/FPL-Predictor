"use client";

import { useMemo, useState } from "react";

import { ResultBadge } from "@/components/ui/badges";
import { TeamCrest } from "@/components/ui/crest";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { EmptyState } from "@/components/ui/states";
import type { HistoricalMatch } from "@/lib/dashboard";
import { formatMatchDate, formatPercent } from "@/lib/format";

type HistoryWeekViewProps = {
  matches: HistoricalMatch[];
};

type Verdict = "correct" | "incorrect" | "upset";

/** Upset threshold: realized outcome the model gave ≤ 20% before kickoff. */
const UPSET_PROBABILITY_THRESHOLD = 0.2;

function verdictFor(match: HistoricalMatch): Verdict | null {
  if (!match.probabilities || match.score.home === null || match.score.away === null) {
    return null;
  }
  const { homeWin, draw, awayWin } = match.probabilities;
  const pick = homeWin >= draw && homeWin >= awayWin ? "home" : awayWin >= homeWin && awayWin >= draw ? "away" : "draw";
  const actual = match.score.home > match.score.away ? "home" : match.score.away > match.score.home ? "away" : "draw";
  if (pick === actual) {
    return "correct";
  }
  const actualProbability =
    actual === "home" ? homeWin : actual === "away" ? awayWin : draw;
  return actualProbability <= UPSET_PROBABILITY_THRESHOLD ? "upset" : "incorrect";
}

export function HistoryWeekView({ matches }: HistoryWeekViewProps) {
  const seasons = useMemo(() => Array.from(new Set(matches.map((match) => match.season))).sort().reverse(), [matches]);
  const [season, setSeason] = useState(seasons[0] ?? "");

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

  const gradedCount = selectedMatches.filter((match) => verdictFor(match) !== null).length;

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
                {value.replace("-", "/")}
              </option>
            ))}
          </select>
        </label>
      </div>

      {gameweek === undefined ? (
        <EmptyState title="No finished matchweeks for this season">
          Choose a different season to browse graded results.
        </EmptyState>
      ) : (
        <>
          <div className="week-panel-header">
            <button
              type="button"
              className="week-arrow"
              onClick={() => setIndex((current) => Math.max(0, current - 1))}
              disabled={clampedIndex === 0}
              aria-label="Previous matchweek"
            >
              ←
            </button>
            <div className="week-heading">
              <p className="eyebrow">Was the model right?</p>
              <h2>
                {season.replace("-", "/")} · Matchweek {gameweek}
              </h2>
              <p>
                {selectedMatches.length} finished matches · {gradedCount} with stored pre-match forecasts
              </p>
            </div>
            <button
              type="button"
              className="week-arrow"
              onClick={() => setIndex((current) => Math.min(gameweeks.length - 1, current + 1))}
              disabled={clampedIndex === gameweeks.length - 1}
              aria-label="Next matchweek"
            >
              →
            </button>
          </div>

          <div className="history-week-scroll">
            {selectedMatches.map((match) => {
              const verdict = verdictFor(match);
              const verdictLabel =
                verdict === "correct"
                  ? "Correct prediction"
                  : verdict === "upset"
                    ? "Upset — model missed"
                    : "Incorrect prediction";

              return (
                <article key={match.matchId} className="history-card">
                  <div className="history-meta">
                    <span>MW {match.gameweek ?? "?"}</span>
                    <span>{formatMatchDate(match.kickoffTime)}</span>
                    {verdict ? <ResultBadge state={verdict} label={verdictLabel} /> : null}
                  </div>

                  <div className="history-scoreline">
                    <div className="history-team-line">
                      <div className="history-team-brand">
                        <TeamCrest name={match.homeTeam.name} badgePath={match.homeTeam.badgePath} size={44} />
                        <strong>{match.homeTeam.name}</strong>
                      </div>
                      <span>{match.score.home ?? "-"}</span>
                    </div>
                    <div className="history-team-line">
                      <div className="history-team-brand">
                        <TeamCrest name={match.awayTeam.name} badgePath={match.awayTeam.badgePath} size={44} />
                        <strong>{match.awayTeam.name}</strong>
                      </div>
                      <span>{match.score.away ?? "-"}</span>
                    </div>
                  </div>

                  {match.probabilities ? (
                    <div>
                      <span className="context-label" style={{ display: "block", marginBottom: "0.45rem" }}>
                        Pre-match model
                      </span>
                      <ProbabilityBar
                        probabilities={match.probabilities}
                        homeShort={match.homeTeam.shortName}
                        awayShort={match.awayTeam.shortName}
                        size="sm"
                      />
                    </div>
                  ) : null}

                  <div className="history-stats">
                    <div>
                      <span>xG</span>
                      <strong>
                        {match.stats.xg.home ?? "—"} – {match.stats.xg.away ?? "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Shots on target</span>
                      <strong>
                        {match.stats.shotsOnTarget.home ?? "—"} – {match.stats.shotsOnTarget.away ?? "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Big chances</span>
                      <strong>
                        {match.stats.bigChances.home ?? "—"} – {match.stats.bigChances.away ?? "—"}
                      </strong>
                    </div>
                    <div>
                      <span>Possession</span>
                      <strong>
                        {match.stats.possession.home !== null ? `${Math.round(match.stats.possession.home)}%` : "—"} –{" "}
                        {match.stats.possession.away !== null ? `${Math.round(match.stats.possession.away)}%` : "—"}
                      </strong>
                    </div>
                  </div>

                  <div className="history-prematch">
                    <span>
                      Pre-match Elo: {match.preMatch.homeElo !== null ? Math.round(match.preMatch.homeElo) : "—"} /{" "}
                      {match.preMatch.awayElo !== null ? Math.round(match.preMatch.awayElo) : "—"}
                    </span>
                    {match.probabilities ? (
                      <span>
                        Model gave the winner{" "}
                        {formatPercent(
                          Math.max(
                            match.probabilities.homeWin,
                            match.probabilities.draw,
                            match.probabilities.awayWin,
                          ),
                          1,
                        )}{" "}
                        before kickoff
                      </span>
                    ) : (
                      <span>No stored forecast for this fixture</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
