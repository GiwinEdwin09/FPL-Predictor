"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import { TeamCrest } from "@/components/ui/crest";
import { EmptyState } from "@/components/ui/states";
import type { TeamSummary } from "@/lib/dashboard";
import { modelPick, resolveOutcome, type QuizMatch } from "@/lib/quiz";
import { headToHead } from "@/lib/compare";
import { buildTeamTrend, summarizeTeam } from "@/lib/teams";

function ClubBadge({ name, badgePath }: { name: string; badgePath: string | null }) {
  if (!badgePath) {
    return <span className="upset-badge upset-badge-fallback">{name.slice(0, 3).toUpperCase()}</span>;
  }
  return <Image src={badgePath} alt="" width={30} height={30} className="upset-badge-image" aria-hidden="true" />;
}

function TeamPicker({
  label,
  teams,
  value,
  exclude,
  onChange,
}: {
  label: string;
  teams: TeamSummary[];
  value: string;
  exclude: string;
  onChange: (slug: string) => void;
}) {
  return (
    <label className="toolbar-field toolbar-select compare-picker">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {teams.map((team) => (
          <option key={team.badgeSlug} value={team.badgeSlug} disabled={team.badgeSlug === exclude}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatDate(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Date pending";
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(kickoffTime),
  );
}

type MetricRow = {
  key: string;
  label: string;
  sub: string;
  valueA: number | null;
  valueB: number | null;
  /** When true the larger value leads the metric. */
  higherBetter: boolean;
  format: (value: number | null) => string;
};

export function CompareExplorer({ matches, teams }: { matches: QuizMatch[]; teams: TeamSummary[] }) {
  const [slugA, setSlugA] = useState(teams[0]?.badgeSlug ?? "");
  const [slugB, setSlugB] = useState(teams[1]?.badgeSlug ?? "");

  const teamA = teams.find((team) => team.badgeSlug === slugA);
  const teamB = teams.find((team) => team.badgeSlug === slugB);
  const summary = useMemo(() => headToHead(matches, slugA, slugB), [matches, slugA, slugB]);

  // Evaluate club metrics on the latest season where both clubs have graded matches.
  const comparisonSeason = useMemo(() => {
    const seasonsA = new Set(matches.filter((m) => m.homeTeam.badgeSlug === slugA || m.awayTeam.badgeSlug === slugA).map((m) => m.season));
    const seasonsB = new Set(matches.filter((m) => m.homeTeam.badgeSlug === slugB || m.awayTeam.badgeSlug === slugB).map((m) => m.season));
    const shared = Array.from(seasonsA).filter((season) => seasonsB.has(season)).sort().reverse();
    return shared[0] ?? null;
  }, [matches, slugA, slugB]);

  const seasonMatches = useMemo(
    () => (comparisonSeason ? matches.filter((match) => match.season === comparisonSeason) : []),
    [matches, comparisonSeason],
  );

  const statsA = useMemo(
    () => (comparisonSeason && seasonMatches.length > 0 ? summarizeTeam(seasonMatches, slugA) : null),
    [comparisonSeason, seasonMatches, slugA],
  );
  const statsB = useMemo(
    () => (comparisonSeason && seasonMatches.length > 0 ? summarizeTeam(seasonMatches, slugB) : null),
    [comparisonSeason, seasonMatches, slugB],
  );

  const latestElo = (slug: string): number | null => {
    const trend = buildTeamTrend(seasonMatches.length > 0 ? seasonMatches : matches, slug);
    for (let index = trend.length - 1; index >= 0; index -= 1) {
      if (trend[index].elo !== null) {
        return trend[index].elo;
      }
    }
    return null;
  };

  if (!teamA || !teamB) {
    return (
      <EmptyState title="Not enough clubs in the data">
        At least two graded clubs are required to run a comparison.
      </EmptyState>
    );
  }

  const eloA = latestElo(slugA);
  const eloB = latestElo(slugB);

  const metrics: MetricRow[] = [
    {
      key: "elo",
      label: "Elo",
      sub: comparisonSeason ? `end of ${comparisonSeason.replace("-", "/")}` : "latest rating",
      valueA: eloA,
      valueB: eloB,
      higherBetter: true,
      format: (value) => (value === null ? "—" : String(Math.round(value))),
    },
    {
      key: "xg",
      label: "xG / match",
      sub: "attack quality",
      valueA: statsA?.xgFor ?? null,
      valueB: statsB?.xgFor ?? null,
      higherBetter: true,
      format: (value) => (value === null || value === 0 ? "—" : value.toFixed(2)),
    },
    {
      key: "xga",
      label: "xGA / match",
      sub: "defensive load · lower is better",
      valueA: statsA?.xgAgainst ?? null,
      valueB: statsB?.xgAgainst ?? null,
      higherBetter: false,
      format: (value) => (value === null || value === 0 ? "—" : value.toFixed(2)),
    },
    {
      key: "hit",
      label: "Model hit rate",
      sub: "share of their matches called correctly",
      valueA: statsA?.modelAccuracy ?? null,
      valueB: statsB?.modelAccuracy ?? null,
      higherBetter: true,
      format: (value) => (value === null ? "—" : `${Math.round(value * 100)}%`),
    },
  ];

  return (
    <div className="insights-stack">
      <div className="compare-selectors">
        <TeamPicker label="Club A" teams={teams} value={slugA} exclude={slugB} onChange={setSlugA} />
        <button
          type="button"
          className="quiz-reset compare-swap"
          onClick={() => {
            setSlugA(slugB);
            setSlugB(slugA);
          }}
        >
          Swap sides
        </button>
        <TeamPicker label="Club B" teams={teams} value={slugB} exclude={slugA} onChange={setSlugB} />
      </div>

      {/* Arena header */}
      <section className="cmp-hero" aria-label="Head-to-head arena">
        <div className="cmp-side">
          <TeamCrest name={teamA.name} badgePath={teamA.badgePath} size={96} />
          <span className="cmp-side-name">{teamA.name}</span>
          {statsA ? (
            <span className="cmp-side-record">
              {statsA.wins}W · {statsA.draws}D · {statsA.losses}L · {statsA.points} pts
            </span>
          ) : null}
        </div>
        <div className="cmp-middle">
          <div className="cmp-vs-badge">VS</div>
          <span className="cmp-meetings">
            {summary.played > 0 ? `${summary.played} league meetings` : "No meetings"}
          </span>
        </div>
        <div className="cmp-side">
          <TeamCrest name={teamB.name} badgePath={teamB.badgePath} size={96} />
          <span className="cmp-side-name">{teamB.name}</span>
          {statsB ? (
            <span className="cmp-side-record">
              {statsB.wins}W · {statsB.draws}D · {statsB.losses}L · {statsB.points} pts
            </span>
          ) : null}
        </div>
      </section>

      {/* Club metric duel */}
      <section className="cmp-metric-list" aria-label="Club metric comparison">
        {metrics.map((metric) => {
          const comparable =
            metric.valueA !== null && metric.valueB !== null && (metric.valueA !== 0 || metric.valueB !== 0);
          const max = comparable ? Math.max(metric.valueA!, metric.valueB!) : null;
          const leader: "a" | "b" | null = comparable
            ? metric.higherBetter
              ? metric.valueA! > metric.valueB!
                ? "a"
                : metric.valueB! > metric.valueA!
                  ? "b"
                  : null
              : metric.valueA! < metric.valueB!
                ? "a"
                : metric.valueB! < metric.valueA!
                  ? "b"
                  : null
            : null;

          return (
            <article key={metric.key} className="cmp-metric-row">
              <strong className={`cmp-metric-value${leader === "a" ? " is-leader" : ""}`}>{metric.format(metric.valueA)}</strong>
              <div className="cmp-meter" aria-hidden="true">
                <div
                  className={`cmp-meter-fill${leader === "a" ? " is-leader" : ""}`}
                  style={{ width: max && comparable ? `${(metric.valueA! / max) * 100}%` : "0%" }}
                />
              </div>
              <div className="cmp-metric-label">
                {metric.label}
                <span className="cmp-metric-sub">{metric.sub}</span>
              </div>
              <div className="cmp-meter cmp-meter-right" aria-hidden="true">
                <div
                  className={`cmp-meter-fill${leader === "b" ? " is-leader" : ""}`}
                  style={{ width: max && comparable ? `${(metric.valueB! / max) * 100}%` : "0%" }}
                />
              </div>
              <strong className={`cmp-metric-value${leader === "b" ? " is-leader" : ""}`}>{metric.format(metric.valueB)}</strong>
            </article>
          );
        })}
      </section>

      {summary.played === 0 ? (
        <EmptyState title="No league meetings on record">
          {teamA.name} and {teamB.name} have not met in the Premier League matches covered by this dataset. Try a
          different pairing.
        </EmptyState>
      ) : (
        <>
          <section className="compare-verdict">
            <div className="compare-side">
              <ClubBadge name={teamA.name} badgePath={teamA.badgePath} />
              <span className="compare-side-name">{teamA.shortName}</span>
              <strong className="compare-side-wins">{summary.teamAWins}</strong>
            </div>
            <div className="compare-middle">
              <span className="compare-draws">{summary.draws} drawn</span>
              <span className="compare-played">{summary.played} meetings</span>
            </div>
            <div className="compare-side">
              <ClubBadge name={teamB.name} badgePath={teamB.badgePath} />
              <span className="compare-side-name">{teamB.shortName}</span>
              <strong className="compare-side-wins">{summary.teamBWins}</strong>
            </div>
          </section>

          <section className="stat-strip" aria-label="Head-to-head summary">
            <article className="stat-tile">
              <div className="stat-tile-label">Goals</div>
              <div className="stat-tile-value">
                {summary.goalsA} – {summary.goalsB}
              </div>
              <div className="stat-tile-hint">
                {teamA.shortName} – {teamB.shortName}, all-time in archive
              </div>
            </article>
            <article className="stat-tile">
              <div className="stat-tile-label">Avg xG</div>
              <div className="stat-tile-value">
                {summary.xgA.toFixed(2)} – {summary.xgB.toFixed(2)}
              </div>
              <div className="stat-tile-hint">per meeting</div>
            </article>
            <article className="stat-tile">
              <div className="stat-tile-label">Model record</div>
              <div className="stat-tile-value">
                {summary.modelAccuracy === null ? "—" : `${Math.round(summary.modelAccuracy * 100)}%`}
              </div>
              <div className="stat-tile-hint">
                {summary.modelCorrect} of {summary.played} meetings called
              </div>
            </article>
          </section>

          <section className="insight-section">
            <div className="section-head">
              <div>
                <h2>Recent meetings</h2>
                <p>Latest first, with the model&apos;s pre-match favorite and whether it landed.</p>
              </div>
              <Link href="/history" className="section-link">
                Full history
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>
            <ol className="team-results-list">
              {summary.meetings.map(({ match }) => {
                const outcome = resolveOutcome(match);
                const pick = modelPick(match);
                const correct = outcome !== null && pick === outcome;
                const favored =
                  pick === "draw" ? "Draw" : pick === "home" ? match.homeTeam.shortName : match.awayTeam.shortName;
                const favoredProb =
                  match.probabilities[pick === "home" ? "homeWin" : pick === "draw" ? "draw" : "awayWin"];
                return (
                  <li key={match.matchId} className="team-result-row compare-meeting-row">
                    <span className="team-result-meta">
                      MW {match.gameweek ?? "—"} · {match.season.replace("-", "/")} · {formatDate(match.kickoffTime)}
                    </span>
                    <span className="upset-fixture compare-meeting-fixture">
                      <span className="upset-team">
                        <TeamCrest name={match.homeTeam.name} badgePath={match.homeTeam.badgePath} size={26} />
                        {match.homeTeam.shortName}
                      </span>
                      <strong className="upset-score">
                        {match.score.home} – {match.score.away}
                      </strong>
                      <span className="upset-team">
                        <TeamCrest name={match.awayTeam.name} badgePath={match.awayTeam.badgePath} size={26} />
                        {match.awayTeam.shortName}
                      </span>
                    </span>
                    <span className="compare-model-call">
                      Model: {favored} {Math.round(favoredProb * 100)}%
                    </span>
                    <span
                      className={correct ? "model-dot model-dot-hit" : "model-dot model-dot-miss"}
                      title={correct ? "Model called this result" : "Model missed this result"}
                      aria-label={correct ? "Model called this result" : "Model missed this result"}
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
