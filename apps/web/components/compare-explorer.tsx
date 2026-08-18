"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import type { TeamSummary } from "@/lib/dashboard";
import { modelPick, resolveOutcome, type QuizMatch } from "@/lib/quiz";
import { headToHead } from "@/lib/compare";

function ClubBadge({ name, badgePath }: { name: string; badgePath: string | null }) {
  if (!badgePath) {
    return <span className="upset-badge upset-badge-fallback">{name.slice(0, 3).toUpperCase()}</span>;
  }
  return <Image src={badgePath} alt={name} width={30} height={30} className="upset-badge-image" />;
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

export function CompareExplorer({ matches, teams }: { matches: QuizMatch[]; teams: TeamSummary[] }) {
  const [slugA, setSlugA] = useState(teams[0]?.badgeSlug ?? "");
  const [slugB, setSlugB] = useState(teams[1]?.badgeSlug ?? "");

  const teamA = teams.find((team) => team.badgeSlug === slugA);
  const teamB = teams.find((team) => team.badgeSlug === slugB);
  const summary = useMemo(() => headToHead(matches, slugA, slugB), [matches, slugA, slugB]);

  if (!teamA || !teamB) {
    return <p className="empty-state">Not enough clubs in the data to compare.</p>;
  }

  return (
    <div className="insights-stack">
      <div className="compare-selectors">
        <TeamPicker label="Club A" teams={teams} value={slugA} exclude={slugB} onChange={setSlugA} />
        <span className="fixture-versus">vs</span>
        <TeamPicker label="Club B" teams={teams} value={slugB} exclude={slugA} onChange={setSlugB} />
        <button
          className="quiz-reset compare-swap"
          onClick={() => {
            setSlugA(slugB);
            setSlugB(slugA);
          }}
        >
          Swap sides
        </button>
      </div>

      {summary.played === 0 ? (
        <section className="page-state-card">
          <h2>No league meetings on record</h2>
          <p>
            {teamA.name} and {teamB.name} have not met in the Premier League matches covered by this dataset. Try a
            different pairing.
          </p>
        </section>
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
                {summary.goalsA} - {summary.goalsB}
              </div>
              <div className="stat-tile-hint">
                {teamA.shortName} - {teamB.shortName}
              </div>
            </article>
            <article className="stat-tile">
              <div className="stat-tile-label">Avg xG</div>
              <div className="stat-tile-value">
                {summary.xgA.toFixed(2)} - {summary.xgB.toFixed(2)}
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
                <h2>Meetings</h2>
                <p>Latest first, with the model&apos;s pre-match favorite and whether it landed.</p>
              </div>
            </div>
            <ol className="team-results-list">
              {summary.meetings.map(({ match }) => {
                const outcome = resolveOutcome(match);
                const pick = modelPick(match);
                const correct = outcome !== null && pick === outcome;
                const favored =
                  pick === "draw" ? "Draw" : pick === "home" ? match.homeTeam.shortName : match.awayTeam.shortName;
                const favoredProb = match.probabilities[pick === "home" ? "homeWin" : pick === "draw" ? "draw" : "awayWin"];
                return (
                  <li key={match.matchId} className="team-result-row compare-meeting-row">
                    <span className="team-result-meta">
                      MW {match.gameweek ?? "—"} · {match.season} · {formatDate(match.kickoffTime)}
                    </span>
                    <span className="upset-fixture compare-meeting-fixture">
                      <span className="upset-team">
                        <ClubBadge name={match.homeTeam.name} badgePath={match.homeTeam.badgePath} />
                        {match.homeTeam.shortName}
                      </span>
                      <strong className="upset-score">
                        {match.score.home} - {match.score.away}
                      </strong>
                      <span className="upset-team">
                        <ClubBadge name={match.awayTeam.name} badgePath={match.awayTeam.badgePath} />
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
