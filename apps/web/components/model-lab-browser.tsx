"use client";

import Image from "next/image";
import { useMemo } from "react";

import { TeamCrest } from "@/components/ui/crest";
import { MetricTile } from "@/components/ui/metric-tile";
import type { QuizMatch } from "@/lib/quiz";
import { modelPick, resolveOutcome } from "@/lib/quiz";
import {
  accuracyByGameweek,
  biggestUpsets,
  bestCalls,
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

function GameweekAccuracyChart({ rows }: { rows: GameweekAccuracy[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No finished matchweeks for this season yet.</p>;
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
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Model accuracy by matchweek" className="chart-svg">
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
                <title>{`MW ${row.gameweek}: ${formatPercent(row.accuracy)} (${row.correct}/${row.total})`}</title>
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
        Each bar is the share of matches called correctly in that matchweek. The dashed line marks the season average
        of {formatPercent(overall)}.
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
        Every forecast across the season is binned by predicted probability (all three outcomes per match). Dots
        sitting on the dashed diagonal mean the model&apos;s confidence matches reality; dot size tracks sample count.
      </p>
    </div>
  );
}

type UpsetLike = {
  match: QuizMatch;
  outcome: "home" | "draw" | "away";
  probability: number;
};

function OutcomeRow({ entry, hit }: { entry: UpsetLike; hit: boolean }) {
  const outcomeText =
    entry.outcome === "draw"
      ? "a draw"
      : entry.outcome === "home"
        ? `${entry.match.homeTeam.shortName} win`
        : `${entry.match.awayTeam.shortName} win`;
  return (
    <li className={`upset-row${hit ? " hit-row" : ""}`}>
      <span className="upset-rank" aria-hidden="true" />
      <div className="upset-fixture">
        <span className="upset-team">
          <TeamCrest name={entry.match.homeTeam.name} badgePath={entry.match.homeTeam.badgePath} size={30} />
          {entry.match.homeTeam.shortName}
        </span>
        <strong className="upset-score">
          {entry.match.score.home} – {entry.match.score.away}
        </strong>
        <span className="upset-team">
          <TeamCrest name={entry.match.awayTeam.name} badgePath={entry.match.awayTeam.badgePath} size={30} />
          {entry.match.awayTeam.shortName}
        </span>
      </div>
      <div className="upset-detail">
        <span>
          MW {entry.match.gameweek ?? "—"} · {formatDate(entry.match.kickoffTime)}
        </span>
        <span>
          {hit ? "Called at just " : "Gave "}
          {outcomeText} <strong>{formatPercent(entry.probability, 1)}</strong> · {hit ? "and it landed" : "it happened"}
        </span>
      </div>
    </li>
  );
}

export function ModelLabBrowser({ matches, model }: { matches: QuizMatch[]; model: ModelMeta }) {
  const seasons = useMemo(
    () => Array.from(new Set(matches.map((match) => match.season))).sort().reverse(),
    [matches],
  );
  // Evaluate on the most recent fully-graded season available in the data.
  const season = seasons[0] ?? "";
  const seasonMatches = useMemo(() => matches.filter((match) => match.season === season), [matches, season]);

  const summary = useMemo(() => summarizeModel(seasonMatches), [seasonMatches]);
  const gameweekRows = useMemo(() => accuracyByGameweek(seasonMatches), [seasonMatches]);
  const upsets = useMemo(() => biggestUpsets(seasonMatches, 6), [seasonMatches]);
  const calls = useMemo(() => bestCalls(seasonMatches, 6), [seasonMatches]);
  const bins = useMemo(() => calibrationBins(seasonMatches), [seasonMatches]);

  const improvementPp =
    summary.total > 0 ? (summary.accuracy - summary.homeBaseline) * 100 : null;

  if (summary.total === 0) {
    return (
      <p className="empty-state">
        No finished matches with pre-match forecasts are available yet, so the model cannot be graded.
      </p>
    );
  }

  return (
    <div className="insights-stack">
      <section className="lab-season-banner" aria-label="Evaluation coverage">
        <div className="lab-season-heading">
          <span>Evaluation window</span>
          <strong>{season.replace("-", "/")}</strong>
        </div>
        <p>
          Grading covers every finished {season.replace("-", "/")} Premier League match with a stored pre-match
          forecast ({summary.total} matches).{" "}
          <strong>Honest out-of-sample numbers</strong> — earlier matchweeks are retrospective replays, not picks
          published at kickoff time.
        </p>
      </section>

      <section className="stat-strip" aria-label="Headline metrics">
        <MetricTile
          label="Match accuracy"
          value={<span className="accented">{formatPercent(summary.accuracy, 1)}</span>}
          hint={`${summary.correct} of ${summary.total} finished matches called correctly`}
        />
        <MetricTile
          label="Home-team baseline"
          value={formatPercent(summary.homeBaseline, 1)}
          hint="What picking the home side every week would score"
        />
        <MetricTile
          label="Model improvement"
          value={`${improvementPp !== null && improvementPp >= 0 ? "+" : ""}${improvementPp?.toFixed(1) ?? "—"} pp`}
          hint="Accuracy gained over always picking home wins"
        />
        <MetricTile
          label="Log loss"
          value={model.logLoss?.toFixed(3) ?? "—"}
          hint={
            <>
              Probability quality on held-out validation — lower is better. Brier {model.brier?.toFixed(3) ?? "—"}.{" "}
              {model.validationRows ?? "—"} matches held out.
            </>
          }
        />
      </section>

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Can you trust a 70% prediction?</h2>
            <p>Calibration checks whether the model&apos;s confidence matches what actually happens.</p>
          </div>
        </div>
        <CalibrationChart bins={bins} />
      </section>

      <section className="insight-section">
        <div className="section-head">
          <div>
            <h2>Accuracy by matchweek</h2>
            <p>How the hit rate moved across the {season.replace("-", "/")} season.</p>
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
          {upsets.map((upset) => (
            <OutcomeRow key={`upset-${upset.match.matchId}`} entry={upset} hit={false} />
          ))}
        </ol>
      </section>

      {calls.length > 0 ? (
        <section className="insight-section">
          <div className="section-head">
            <div>
              <h2>Best calls</h2>
              <p>Bold predictions the model got right against the odds.</p>
            </div>
          </div>
          <ol className="upset-list">
            {calls.map((call) => (
              <OutcomeRow key={`call-${call.match.matchId}`} entry={call} hit={true} />
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
