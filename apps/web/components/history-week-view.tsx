"use client";

import { useId, useMemo, useState } from "react";

import { ChevronIcon } from "@/components/prediction-card";
import { ResultBadge } from "@/components/ui/badges";
import { DayGroups } from "@/components/ui/local-time";
import { TeamCrest } from "@/components/ui/crest";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { ReplayNote } from "@/components/ui/replay-note";
import { EmptyState } from "@/components/ui/states";
import type { HistoricalMatch } from "@/lib/dashboard";
import { modelPick, outcomeProbability, resolveOutcome } from "@/lib/quiz";
import { groupByGameweek, matchSeasons } from "@/lib/gameweek";
import { formatPercent } from "@/lib/format";

type HistoryWeekViewProps = {
  matches: HistoricalMatch[];
  trainingCutoffUtc: string;
};

type Verdict = "correct" | "incorrect" | "upset";

/** Upset threshold: realized outcome the model gave ≤ 20% before kickoff. */
const UPSET_PROBABILITY_THRESHOLD = 0.2;

function verdictFor(match: HistoricalMatch): Verdict | null {
  if (!match.probabilities || match.score.home === null || match.score.away === null) {
    return null;
  }
  const actual = resolveOutcome(match);
  if (actual === null) return null;
  const prediction = { probabilities: match.probabilities };
  if (modelPick(prediction) === actual) {
    return "correct";
  }
  const actualProbability = outcomeProbability(prediction, actual);
  return actualProbability <= UPSET_PROBABILITY_THRESHOLD ? "upset" : "incorrect";
}

export function HistoryWeekView({ matches, trainingCutoffUtc }: HistoryWeekViewProps) {
  const seasons = useMemo(() => matchSeasons(matches), [matches]);
  const [season, setSeason] = useState(seasons[0] ?? "");

  const seasonMatches = useMemo(() => matches.filter((match) => match.season === season), [matches, season]);
  const groups = useMemo(() => groupByGameweek(seasonMatches), [seasonMatches]);

  const gameweeks = useMemo(() => Array.from(groups.keys()).sort((left, right) => left - right), [groups]);
  // null = latest finished matchweek, so the page opens on what just happened.
  const [index, setIndex] = useState<number | null>(null);
  const lastIndex = Math.max(0, gameweeks.length - 1);
  const clampedIndex = index === null ? lastIndex : Math.min(index, lastIndex);
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
              setIndex(null);
            }}
          >
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value.replace("-", "/")}
              </option>
            ))}
          </select>
        </label>
        <ReplayNote season={season} matches={seasonMatches} trainingCutoffUtc={trainingCutoffUtc} />
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
              onClick={() => setIndex(Math.max(0, clampedIndex - 1))}
              disabled={clampedIndex === 0}
              aria-label="Previous matchweek"
            >
              ←
            </button>
            <div className="week-heading">
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
              onClick={() => setIndex(Math.min(lastIndex, clampedIndex + 1))}
              disabled={clampedIndex === lastIndex}
              aria-label="Next matchweek"
            >
              →
            </button>
          </div>

          <DayGroups fixtures={selectedMatches}>{(match) => <HistoryRow match={match} />}</DayGroups>
        </>
      )}
    </section>
  );
}

function pair(home: number | null, away: number | null, format: (value: number) => string = String) {
  return `${home !== null ? format(home) : "—"} – ${away !== null ? format(away) : "—"}`;
}

function HistoryRow({ match }: { match: HistoricalMatch }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const verdict = verdictFor(match);
  const { homeTeam, awayTeam, stats } = match;

  const statRows = [
    { label: "xG", home: stats.xg.home, away: stats.xg.away, format: String },
    { label: "Shots on target", home: stats.shotsOnTarget.home, away: stats.shotsOnTarget.away, format: String },
    { label: "Big chances", home: stats.bigChances.home, away: stats.bigChances.away, format: String },
    {
      label: "Possession",
      home: stats.possession.home,
      away: stats.possession.away,
      format: (value: number) => `${Math.round(value)}%`,
    },
  ].filter((row) => row.home !== null || row.away !== null);

  return (
    <article className="fixture-row history-row" data-open={open}>
      <div className="fixture-row-summary">
        <span className="fixture-row-teams">
          <span className="fixture-row-team">
            <TeamCrest name={homeTeam.name} badgePath={homeTeam.badgePath} size={28} />
            <span className="fixture-row-name">
              <span className="history-row-full">{homeTeam.name}</span>
              <span className="history-row-short" aria-hidden="true">
                {homeTeam.shortName}
              </span>
            </span>
          </span>
          <span className="history-row-score">
            {match.score.home ?? "–"}
            <span aria-hidden="true">–</span>
            {match.score.away ?? "–"}
          </span>
          <span className="fixture-row-team fixture-row-team-away">
            <span className="fixture-row-name">
              <span className="history-row-full">{awayTeam.name}</span>
              <span className="history-row-short" aria-hidden="true">
                {awayTeam.shortName}
              </span>
            </span>
            <TeamCrest name={awayTeam.name} badgePath={awayTeam.badgePath} size={28} />
          </span>
        </span>

        <span className="fixture-row-forecast">
          {match.probabilities ? (
            <ProbabilityBar
              probabilities={match.probabilities}
              homeShort={homeTeam.shortName}
              awayShort={awayTeam.shortName}
              size="sm"
            />
          ) : (
            <span className="history-row-noforecast">No stored pre-match forecast</span>
          )}
          {verdict ? <ResultBadge state={verdict} /> : null}
        </span>

        <button
          type="button"
          className="fixture-row-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
        >
          <span className="sr-only">
            {open ? "Hide" : "Show"} match stats for {homeTeam.name} {match.score.home ?? ""}–{match.score.away ?? ""}{" "}
            {awayTeam.name}
          </span>
          <ChevronIcon />
        </button>
      </div>

      {open ? (
        <div id={panelId} className="fixture-row-body">
          {statRows.length > 0 ? (
            <div className="history-stats">
              {statRows.map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{pair(row.home, row.away, row.format)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="history-row-note">Match stats aren&apos;t available for this fixture yet.</p>
          )}

          <div className="history-prematch">
            <span>Pre-match Elo: {pair(match.preMatch.homeElo, match.preMatch.awayElo, (value) => String(Math.round(value)))}</span>
            {match.probabilities ? (
              <span>
                The model&apos;s pick had{" "}
                {formatPercent(
                  Math.max(match.probabilities.homeWin, match.probabilities.draw, match.probabilities.awayWin),
                  1,
                )}{" "}
                before kickoff
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
