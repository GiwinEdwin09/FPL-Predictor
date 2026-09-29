"use client";

import { formatPercent } from "@/lib/format";

import { matchSeasons } from "@/lib/gameweek";
import { useMemo } from "react";

import { MetricTile } from "@/components/ui/metric-tile";
import { OutcomeRow } from "@/components/outcome-row";
import type { QuizMatch } from "@/lib/quiz";
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
  testAccuracy: number | null;
  logLoss: number | null;
  brier: number | null;
  validationRows: number | null;
};

/** Column value labels stay readable up to this many matchweeks; past it, hover and the y-axis carry values. */
const MAX_LABELED_COLUMNS = 12;

// Plain HTML columns rather than a scaled SVG, so type stays at its real size at any width.
function GameweekAccuracyChart({ rows }: { rows: GameweekAccuracy[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No finished matchweeks for this season yet.</p>;
  }

  const overall = rows.reduce((sum, row) => sum + row.correct, 0) / rows.reduce((sum, row) => sum + row.total, 0);
  const showValues = rows.length <= MAX_LABELED_COLUMNS;
  const showTick = (index: number) => rows.length <= 20 || index % 4 === 0;

  return (
    <div className="chart-frame">
      <div
        className="acc-chart"
        role="img"
        aria-label={`Model accuracy by matchweek. Season average ${formatPercent(overall)}. ${rows
          .map((row) => `Matchweek ${row.gameweek}: ${formatPercent(row.accuracy)}`)
          .join(", ")}.`}
      >
        <div className="acc-y" aria-hidden="true">
          {[0, 0.5, 1].map((tick) => (
            <span key={tick} style={{ bottom: `${tick * 100}%` }}>
              {formatPercent(tick)}
            </span>
          ))}
        </div>
        <div className="acc-plot" aria-hidden="true">
          {[0.25, 0.5, 0.75, 1].map((tick) => (
            <span key={tick} className="acc-grid" style={{ bottom: `${tick * 100}%` }} />
          ))}
          <div className="acc-cols">
            {rows.map((row) => (
              <div
                key={`${row.season}-${row.gameweek}`}
                className="acc-col"
                title={`MW ${row.gameweek}: ${formatPercent(row.accuracy)} (${row.correct}/${row.total})`}
              >
                <div className="acc-bar" style={{ height: `${row.accuracy * 100}%` }}>
                  {showValues ? <span className="acc-value">{formatPercent(row.accuracy)}</span> : null}
                </div>
              </div>
            ))}
          </div>
          <span className="acc-avg" style={{ bottom: `${overall * 100}%` }}>
            <span className="acc-avg-label">Avg {formatPercent(overall)}</span>
          </span>
        </div>
        <div className="acc-x" aria-hidden="true">
          {rows.map((row, index) => (
            <span key={`${row.season}-${row.gameweek}`}>{showTick(index) ? `MW ${row.gameweek}` : ""}</span>
          ))}
        </div>
      </div>
      <p className="chart-caption">
        Each column is the share of that matchweek&apos;s matches the model called correctly. The dashed line is the
        season average.
      </p>
    </div>
  );
}

function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const width = 420;
  const height = 320;
  const pad = { top: 16, right: 26, bottom: 48, left: 60 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const maxCount = Math.max(1, ...bins.map((bin) => bin.count));

  const toX = (value: number) => pad.left + value * innerWidth;
  const toY = (value: number) => pad.top + innerHeight * (1 - value);

  return (
    <div className="chart-frame">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Calibration chart"
        className="chart-svg chart-svg-calibration"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line x1={toX(tick)} x2={toX(tick)} y1={toY(0)} y2={toY(1)} className="chart-grid" />
            <line x1={toX(0)} x2={toX(1)} y1={toY(tick)} y2={toY(tick)} className="chart-grid" />
            <text x={toX(tick)} y={height - 27} className="chart-tick" textAnchor="middle">
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
          x={14}
          y={toY(0.5)}
          className="chart-axis-label"
          textAnchor="middle"
          transform={`rotate(-90 14 ${toY(0.5)})`}
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

export function ModelLabBrowser({ matches, model }: { matches: QuizMatch[]; model: ModelMeta }) {
  const seasons = useMemo(
    () => matchSeasons(matches),
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
          label="Season accuracy so far"
          value={<span className="accented">{formatPercent(summary.accuracy, 1)}</span>}
          hint={`${summary.correct} of ${summary.total} finished matches called correctly · updates each matchweek`}
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
          label="Test log loss"
          value={model.logLoss?.toFixed(3) ?? "—"}
          hint={
            <>
              From {model.validationRows ?? "—"} held-out test matches:{" "}
              {model.testAccuracy !== null ? formatPercent(model.testAccuracy, 1) : "—"} accuracy, Brier{" "}
              {model.brier?.toFixed(3) ?? "—"}. Lower log loss is better.
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
