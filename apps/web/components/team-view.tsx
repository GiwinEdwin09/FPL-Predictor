"use client";

import { matchSeasons } from "@/lib/gameweek";
import Image from "next/image";
import { useMemo, useState } from "react";

import { ConfidenceBadge } from "@/components/ui/badges";
import { TeamCrest } from "@/components/ui/crest";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { describeConfidence } from "@/lib/confidence";
import type { TeamSummary, UpcomingFixture } from "@/lib/dashboard";
import { formatKickoff } from "@/lib/format";
import type { QuizMatch } from "@/lib/quiz";
import { buildTeamTrend, summarizeTeam, type TeamTrendPoint } from "@/lib/teams";

function formatDate(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Date pending";
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(kickoffTime));
}

type LinePoint = { x: number; y: number; value: number };

function toPolyline(points: LinePoint[]): string {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function TrendChart({
  title,
  caption,
  series,
  yMin,
  yMax,
  formatValue,
}: {
  title: string;
  caption: string;
  series: { label: string; tone: string; values: (number | null)[] }[];
  yMin: number;
  yMax: number;
  formatValue: (value: number) => string;
}) {
  const width = 720;
  const height = 190;
  const pad = { top: 14, right: 14, bottom: 14, left: 46 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const span = Math.max(1e-6, yMax - yMin);

  const maxLength = Math.max(...series.map((entry) => entry.values.length), 1);
  const toX = (index: number) => pad.left + (maxLength <= 1 ? innerWidth / 2 : (index / (maxLength - 1)) * innerWidth);
  const toY = (value: number) => pad.top + innerHeight * (1 - (value - yMin) / span);

  return (
    <div className="chart-frame">
      <div className="chart-legend">
        <h3>{title}</h3>
        <div className="chart-legend-items">
          {series.map((entry) => (
            <span key={entry.label} className="chart-legend-item">
              <span className="chart-legend-swatch" style={{ background: entry.tone }} aria-hidden="true" />
              {entry.label}
            </span>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="chart-svg">
        {[yMin, (yMin + yMax) / 2, yMax].map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={toY(tick)} y2={toY(tick)} className="chart-grid" />
            <text x={pad.left - 8} y={toY(tick) + 4} className="chart-tick" textAnchor="end">
              {formatValue(tick)}
            </text>
          </g>
        ))}
        {series.map((entry) => {
          const points: LinePoint[] = [];
          entry.values.forEach((value, index) => {
            if (value !== null) {
              points.push({ x: toX(index), y: toY(value), value });
            }
          });
          if (points.length === 0) {
            return null;
          }
          return (
            <g key={entry.label}>
              {points.length > 1 ? (
                <polyline points={toPolyline(points)} fill="none" stroke={entry.tone} strokeWidth={2} strokeLinejoin="round" />
              ) : null}
              {points.map((point, index) => (
                <circle key={index} cx={point.x} cy={point.y} r={2.6} fill={entry.tone}>
                  <title>
                    {entry.label}: {formatValue(point.value)}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="chart-caption">{caption}</p>
    </div>
  );
}

function rangeOf(values: (number | null)[], paddingRatio = 0.08): [number, number] {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return [0, 1];
  }
  let min = Math.min(...present);
  let max = Math.max(...present);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const padding = (max - min) * paddingRatio;
  return [min - padding, max + padding];
}

function resultClass(result: TeamTrendPoint["result"]) {
  if (result === "W") {
    return "result-chip result-win";
  }
  if (result === "D") {
    return "result-chip result-draw";
  }
  return "result-chip result-loss";
}

export function TeamView({
  team,
  matches,
  upcomingFixtures,
}: {
  team: TeamSummary;
  matches: QuizMatch[];
  upcomingFixtures: UpcomingFixture[];
}) {
  const seasons = useMemo(() => matchSeasons(matches), [matches]);
  const availableSeasons = useMemo(
    () =>
      seasons.filter(
        (season) =>
          matches.filter(
            (match) =>
              match.season === season &&
              (match.homeTeam.badgeSlug === team.badgeSlug || match.awayTeam.badgeSlug === team.badgeSlug),
          ).length > 0,
      ),
    [matches, seasons, team.badgeSlug],
  );
  const [season, setSeason] = useState(availableSeasons[0] ?? seasons[0] ?? "2025-2026");

  const seasonMatches = useMemo(() => matches.filter((match) => match.season === season), [matches, season]);
  const stats = useMemo(() => summarizeTeam(seasonMatches, team.badgeSlug), [seasonMatches, team.badgeSlug]);
  const trend = useMemo(() => buildTeamTrend(seasonMatches, team.badgeSlug), [seasonMatches, team.badgeSlug]);
  const results = useMemo(() => [...trend].reverse(), [trend]);

  const eloValues = trend.map((point) => point.elo);
  const [eloMin, eloMax] = rangeOf(eloValues);
  const xgForValues = trend.map((point) => point.xgFor);
  const xgAgainstValues = trend.map((point) => point.xgAgainst);
  const [xgMin, xgMax] = rangeOf([...xgForValues, ...xgAgainstValues], 0.15);
  const form = trend.filter((point) => point.result !== null).slice(-5).map((point) => point.result);
  const nextFixtures = useMemo(
    () =>
      upcomingFixtures
        .filter(
          (fixture) =>
            fixture.homeTeam.badgeSlug === team.badgeSlug || fixture.awayTeam.badgeSlug === team.badgeSlug,
        )
        .sort((left, right) => (left.kickoffTime ?? "9999").localeCompare(right.kickoffTime ?? "9999"))
        .slice(0, 3),
    [upcomingFixtures, team.badgeSlug],
  );

  return (
    <div className="insights-stack">
      <div className="team-hero">
        <div className="team-hero-brand">
          {team.badgePath ? (
            <Image src={team.badgePath} alt={team.name} width={72} height={72} className="team-hero-badge" />
          ) : (
            <span className="team-badge team-badge-fallback team-hero-badge">{team.name.slice(0, 3).toUpperCase()}</span>
          )}
          <div>
            <h2 className="team-hero-name">{team.name}</h2>
            <div className="team-form-strip" aria-label="Last five results">
              {form.map((result, index) => (
                <span key={index} className={resultClass(result)}>
                  {result}
                </span>
              ))}
              {form.length === 0 ? <span className="chart-caption">No finished matches this season</span> : null}
            </div>
          </div>
        </div>
        <label className="toolbar-field toolbar-select">
          <span>Season</span>
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            {availableSeasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="stat-strip" aria-label="Season summary">
        <article className="stat-tile">
          <div className="stat-tile-label">Record</div>
          <div className="stat-tile-value">
            {stats.wins}W {stats.draws}D {stats.losses}L
          </div>
          <div className="stat-tile-hint">
            {stats.points} pts from {stats.played} matches
          </div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Goals</div>
          <div className="stat-tile-value">
            {stats.goalsFor} / {stats.goalsAgainst}
          </div>
          <div className="stat-tile-hint">scored / conceded</div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">xG per match</div>
          <div className="stat-tile-value">
            {stats.xgFor.toFixed(2)} / {stats.xgAgainst.toFixed(2)}
          </div>
          <div className="stat-tile-hint">for / against</div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Model hit rate</div>
          <div className="stat-tile-value">
            {stats.modelAccuracy === null ? "—" : `${Math.round(stats.modelAccuracy * 100)}%`}
          </div>
          <div className="stat-tile-hint">
            {stats.modelCorrect} of {stats.played} calls on this club
          </div>
        </article>
      </section>

      {nextFixtures.length > 0 ? (
        <section className="insight-section">
          <div className="section-head">
            <div>
              <h2>Next up</h2>
              <p>The model&apos;s live forecast for this club&apos;s upcoming fixtures.</p>
            </div>
          </div>
          <div className="upcoming-rows">
            {nextFixtures.map((fixture) => {
              const confidence = describeConfidence(fixture.probabilities);
              return (
                <article key={fixture.matchId} className="upcoming-row" style={{ gridTemplateColumns: "8.5rem minmax(0,1.05fr) minmax(0,1.35fr)" }}>
                  <div className="upcoming-row-time">{formatKickoff(fixture.kickoffTime)}</div>
                  <div className="upcoming-row-teams">
                    <div className="upcoming-row-team">
                      <TeamCrest name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={26} />
                      <span>{fixture.homeTeam.shortName}</span>
                    </div>
                    <span className="upcoming-row-vs">vs</span>
                    <div className="upcoming-row-team upcoming-row-team-away">
                      <span>{fixture.awayTeam.shortName}</span>
                      <TeamCrest name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={26} />
                    </div>
                  </div>
                  <div className="upcoming-row-bar">
                    <ProbabilityBar
                      probabilities={fixture.probabilities}
                      homeShort={fixture.homeTeam.shortName}
                      awayShort={fixture.awayTeam.shortName}
                      size="sm"
                    />
                    <span className="upcoming-row-lead">
                      Model:{" "}
                      {confidence.pick !== null
                        ? `${confidence.pick === "home" ? fixture.homeTeam.shortName : confidence.pick === "away" ? fixture.awayTeam.shortName : "Draw"} · ${Math.round((confidence.pick === "home" ? fixture.probabilities.homeWin : confidence.pick === "away" ? fixture.probabilities.awayWin : fixture.probabilities.draw) * 100)}%`
                        : "Too close to call"}{" "}
                      <ConfidenceBadge confidence={confidence} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <TrendChart
        title="Elo trajectory"
        caption="Pre-match Elo entering each league match, in kickoff order."
        series={[{ label: "Elo", tone: "var(--brand-bright)", values: eloValues }]}
        yMin={eloMin}
        yMax={eloMax}
        formatValue={(value) => `${Math.round(value)}`}
      />

      <TrendChart
        title="Expected goals"
        caption="xG created and conceded per match."
        series={[
          { label: "xG for", tone: "var(--accent-deep)", values: xgForValues },
          { label: "xG against", tone: "var(--prob-draw)", values: xgAgainstValues },
        ]}
        yMin={Math.max(0, xgMin)}
        yMax={xgMax}
        formatValue={(value) => value.toFixed(1)}
      />

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Results</h2>
            <p>
              Every league match in {season}, latest first. The dot marks whether the model called the result.
            </p>
          </div>
        </div>
        <ol className="team-results-list">
          {results.map((point) => (
            <li key={point.matchId} className="team-result-row">
              <span className={resultClass(point.result)}>{point.result ?? "–"}</span>
              <span className="team-result-meta">
                MW {point.gameweek ?? "—"} · {formatDate(point.kickoffTime)}
              </span>
              <span className="team-result-fixture">
                {point.isHome ? "vs" : "at"} {point.opponent.name}
              </span>
              <strong className="upset-score">
                {point.scored} - {point.conceded}
              </strong>
              <span
                className={point.modelCorrect ? "model-dot model-dot-hit" : "model-dot model-dot-miss"}
                title={point.modelCorrect ? "Model called this result" : "Model missed this result"}
                aria-label={point.modelCorrect ? "Model called this result" : "Model missed this result"}
              />
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
