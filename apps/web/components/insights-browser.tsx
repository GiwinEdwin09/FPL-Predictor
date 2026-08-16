"use client";

import Image from "next/image";
import { useMemo } from "react";

import type { QuizMatch } from "@/lib/quiz";
import { resolveOutcome } from "@/lib/quiz";
import {
  accuracyByGameweek,
  biggestUpsets,
  calibrationBins,
  summarizeModel,
  type CalibrationBin,
  type GameweekAccuracy,
} from "@/lib/insights";

type ModelMeta = {
  validationAccuracy: number | null;
  logLoss: number | null;
  brier: number | null;
  temperature: number | null;
  trainRows: number | null;
  validationRows: number | null;
};

const INSIGHTS_SEASON = "2025-2026";
const INSIGHTS_SEASON_LABEL = "2025–2026";

function formatPercent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDate(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "Date pending";
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(kickoffTime),
  );
}

function ClubBadge({ name, badgePath }: { name: string; badgePath: string | null }) {
  if (!badgePath) {
    return <span className="upset-badge upset-badge-fallback">{name.slice(0, 3).toUpperCase()}</span>;
  }
  return <Image src={badgePath} alt={name} width={30} height={30} className="upset-badge-image" />;
}

function GameweekAccuracyChart({ rows }: { rows: GameweekAccuracy[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No finished gameweeks for this season yet.</p>;
  }

  const width = 720;
  const height = 180;
  const padTop = 12;
  const padBottom = 26;
  const chartHeight = height - padTop - padBottom;
  const barSlot = width / rows.length;
  const barWidth = Math.max(6, barSlot * 0.62);
  const overall = rows.reduce((sum, row) => sum + row.correct, 0) / rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Model accuracy by gameweek" className="chart-svg">
        <line
          x1={0}
          x2={width}
          y1={padTop + chartHeight * (1 - overall)}
          y2={padTop + chartHeight * (1 - overall)}
          className="chart-baseline"
        />
        {rows.map((row, index) => {
          const barHeight = Math.max(2, row.accuracy * chartHeight);
          const x = index * barSlot + (barSlot - barWidth) / 2;
          const y = padTop + chartHeight - barHeight;
          return (
            <g key={`${row.season}-${row.gameweek}`}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} className="chart-bar">
                <title>{`GW ${row.gameweek}: ${formatPercent(row.accuracy)} (${row.correct}/${row.total})`}</title>
              </rect>
              {rows.length <= 20 || index % 4 === 0 ? (
                <text x={index * barSlot + barSlot / 2} y={height - 8} className="chart-tick" textAnchor="middle">
                  {row.gameweek}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="chart-caption">
        Bars show the share of matches the model called correctly each gameweek. The line marks the season average of{" "}
        {formatPercent(overall)}.
      </p>
    </div>
  );
}

function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const width = 420;
  const height = 320;
  const pad = { top: 16, right: 16, bottom: 40, left: 44 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  const toX = (value: number) => pad.left + value * innerWidth;
  const toY = (value: number) => pad.top + innerHeight * (1 - value);

  return (
    <div className="chart-frame">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Calibration chart" className="chart-svg">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={toX(tick)} x2={toX(tick)} y1={toY(0)} y2={toY(1)} className="chart-grid" />
            <line x1={toX(0)} x2={toX(1)} y1={toY(tick)} y2={toY(tick)} className="chart-grid" />
            <text x={toX(tick)} y={height - 24} className="chart-tick" textAnchor="middle">
              {Math.round(tick * 100)}%
            </text>
            <text x={pad.left - 8} y={toY(tick) + 4} className="chart-tick" textAnchor="end">
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} className="chart-diagonal" />
        {bins
          .filter((bin) => bin.count > 0)
          .map((bin) => (
            <circle
              key={bin.label}
              cx={toX(bin.predictedAvg)}
              cy={toY(bin.actualRate)}
              r={4 + 10 * Math.sqrt(bin.count / maxCount)}
              className="chart-dot"
            >
              <title>{`${bin.label}: predicted ${formatPercent(bin.predictedAvg, 1)}, happened ${formatPercent(bin.actualRate, 1)} (${bin.count} forecasts)`}</title>
            </circle>
          ))}
        <text x={toX(0.5)} y={height - 6} className="chart-axis-label" textAnchor="middle">
          Predicted probability
        </text>
        <text
          x={12}
          y={toY(0.5)}
          className="chart-axis-label"
          textAnchor="middle"
          transform={`rotate(-90 12 ${toY(0.5)})`}
        >
          Actual frequency
        </text>
      </svg>
      <p className="chart-caption">
        Each dot bins forecasts by predicted probability (all three outcomes per match). Dots on the dashed line mean
        the model&apos;s confidence matches reality; dot size tracks sample count.
      </p>
    </div>
  );
}

export function InsightsBrowser({ matches, model }: { matches: QuizMatch[]; model: ModelMeta }) {
  const seasonMatches = useMemo(() => matches.filter((match) => match.season === INSIGHTS_SEASON), [matches]);
  const summary = useMemo(() => summarizeModel(seasonMatches), [seasonMatches]);
  const gameweekRows = useMemo(() => accuracyByGameweek(seasonMatches), [seasonMatches]);
  const upsets = useMemo(() => biggestUpsets(seasonMatches), [seasonMatches]);
  const bins = useMemo(() => calibrationBins(seasonMatches), [seasonMatches]);

  return (
    <div className="insights-stack">
      <section className="insights-season-context" aria-label="Insights season coverage">
        <div className="insights-season-heading">
          <span>Season coverage</span>
          <strong>{INSIGHTS_SEASON_LABEL}</strong>
        </div>
        <p>
          <strong>Mid-season launch.</strong> This model was created during the 2025–2026 season, not before
          Gameweek 1. Earlier gameweeks are retrospective replays and were not predictions published at the time.
        </p>
      </section>

      <section className="stat-strip" aria-label="Model at a glance">
        <article className="stat-tile">
          <div className="stat-tile-label">Match accuracy</div>
          <div className="stat-tile-value">{formatPercent(summary.accuracy, 1)}</div>
          <div className="stat-tile-hint">
            {summary.correct} of {summary.total} finished matches
          </div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Always-home baseline</div>
          <div className="stat-tile-value">{formatPercent(summary.homeBaseline, 1)}</div>
          <div className="stat-tile-hint">What picking the home side every time would score</div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Validation log loss</div>
          <div className="stat-tile-value">{model.logLoss?.toFixed(3) ?? "—"}</div>
          <div className="stat-tile-hint">
            Held-out window · Brier {model.brier?.toFixed(3) ?? "—"} · temp {model.temperature?.toFixed(2) ?? "—"}
          </div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Training rows</div>
          <div className="stat-tile-value">{model.trainRows ?? "—"}</div>
          <div className="stat-tile-hint">{model.validationRows ?? "—"} held out for validation</div>
        </article>
      </section>

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Accuracy by gameweek</h2>
            <p>How the model&apos;s hit rate moved across the {INSIGHTS_SEASON_LABEL} season.</p>
          </div>
        </div>
        <GameweekAccuracyChart rows={gameweekRows} />
      </section>

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Biggest upsets</h2>
            <p>Results the model rated least likely before kickoff.</p>
          </div>
        </div>
        <ol className="upset-list">
          {upsets.map((upset) => {
            const outcomeText =
              upset.outcome === "draw"
                ? "a draw"
                : upset.outcome === "home"
                  ? `${upset.match.homeTeam.shortName} win`
                  : `${upset.match.awayTeam.shortName} win`;
            return (
              <li key={upset.match.matchId} className="upset-row">
                <span className="upset-rank" aria-hidden="true" />
                <div className="upset-fixture">
                  <span className="upset-team">
                    <ClubBadge name={upset.match.homeTeam.name} badgePath={upset.match.homeTeam.badgePath} />
                    {upset.match.homeTeam.shortName}
                  </span>
                  <strong className="upset-score">
                    {upset.match.score.home} - {upset.match.score.away}
                  </strong>
                  <span className="upset-team">
                    <ClubBadge name={upset.match.awayTeam.name} badgePath={upset.match.awayTeam.badgePath} />
                    {upset.match.awayTeam.shortName}
                  </span>
                </div>
                <div className="upset-detail">
                  <span>
                    GW {upset.match.gameweek ?? "—"} · {formatDate(upset.match.kickoffTime)}
                  </span>
                  <span>
                    Model gave {outcomeText} just <strong>{formatPercent(upset.probability, 1)}</strong>
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Calibration</h2>
            <p>When the model says 70%, does it happen 70% of the time?</p>
          </div>
        </div>
        <CalibrationChart bins={bins} />
      </section>
    </div>
  );
}
