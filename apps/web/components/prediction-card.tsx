"use client";

import { useEffect, useId, useState, type ReactNode, type Ref } from "react";

import { TeamCrest } from "@/components/ui/crest";
import { ModelVerdict } from "@/components/ui/badges";
import { LocalTime } from "@/components/ui/local-time";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import type { FixtureProbabilities, UpcomingFixture } from "@/lib/dashboard";
import { explainPrediction, fixtureMetricPairs } from "@/lib/explain";
import { fixtureAnchorId } from "@/lib/fixture-link";

export function ChevronIcon() {
  return (
    <svg className="row-chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Two diagonal arrows: this row opens in a box over the page rather than expanding. */
function PopOutIcon() {
  return (
    <svg className="row-chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * One fixture as a compact row: kickoff, clubs, probabilities and the model's
 * call. By default opening it expands the row to show why the model leans that
 * way, plus any children. With `onOpenDetails` the row instead hands off to a
 * modal (future fixtures, where the lineup editor lives).
 */
export function PredictionCard({
  fixture,
  probabilitiesOverride,
  highlighted = false,
  defaultOpen = false,
  onOpenDetails,
  onIntent,
  articleRef,
  tag,
  children,
}: {
  fixture: UpcomingFixture;
  /** Briefly outlines the row and opens it, e.g. after arriving from a fixture link. */
  highlighted?: boolean;
  defaultOpen?: boolean;
  /** Simulated probabilities (e.g. from a lineup change). Falls back to the model's default forecast. */
  probabilitiesOverride?: FixtureProbabilities;
  /** Open details somewhere else (a modal) instead of expanding the row. */
  onOpenDetails?: () => void;
  /** The pointer or focus reached the row: a cue to prefetch what opening it needs. */
  onIntent?: () => void;
  articleRef?: Ref<HTMLElement>;
  /** A short label beside the verdict, e.g. that the forecast reflects a custom XI. */
  tag?: ReactNode;
  children?: ReactNode;
}) {
  const opensModal = onOpenDetails !== undefined;
  const [open, setOpen] = useState(!opensModal && (defaultOpen || highlighted));
  const panelId = useId();

  useEffect(() => {
    if (highlighted && !opensModal) setOpen(true);
  }, [highlighted, opensModal]);

  const probabilities = probabilitiesOverride ?? fixture.probabilities;
  const { homeTeam, awayTeam } = fixture;
  // Finished matches in the current matchweek show their result beside the pre-match forecast.
  const { home: homeGoals, away: awayGoals } = fixture.score;
  const hasResult = fixture.finished && homeGoals !== null && awayGoals !== null;

  return (
    <article
      ref={articleRef}
      id={fixtureAnchorId(fixture.matchId)}
      className={`fixture-row${highlighted ? " fixture-row-focus" : ""}${opensModal ? " fixture-row-pops" : ""}`}
      data-open={open}
    >
      <div className="fixture-row-summary" onPointerEnter={onIntent} onFocus={onIntent}>
        <span className="fixture-row-time">
          {hasResult ? "FT" : <LocalTime value={fixture.kickoffTime} variant="time" />}
        </span>

        <span className="fixture-row-teams">
          <span className="fixture-row-team">
            <TeamCrest name={homeTeam.name} badgePath={homeTeam.badgePath} size={28} />
            <span className="fixture-row-name">{homeTeam.name}</span>
          </span>
          {hasResult ? (
            <span className="history-row-score">
              {homeGoals}
              <span aria-hidden="true">–</span>
              {awayGoals}
            </span>
          ) : (
            <span className="fixture-row-vs" aria-hidden="true">
              vs
            </span>
          )}
          <span className="fixture-row-team fixture-row-team-away">
            <span className="fixture-row-name">{awayTeam.name}</span>
            <TeamCrest name={awayTeam.name} badgePath={awayTeam.badgePath} size={28} />
          </span>
        </span>

        <span className="fixture-row-forecast">
          <ProbabilityBar probabilities={probabilities} homeShort={homeTeam.shortName} awayShort={awayTeam.shortName} size="sm" />
          <span className="fixture-row-verdict">
            <ModelVerdict probabilities={probabilities} homeShort={homeTeam.shortName} awayShort={awayTeam.shortName} />
            {tag}
          </span>
        </span>

        {/* The whole row is the click target; this button carries the name and state. */}
        {opensModal ? (
          <button type="button" className="fixture-row-toggle" aria-haspopup="dialog" onClick={onOpenDetails}>
            <span className="sr-only">
              Open details and lineups for {homeTeam.name} vs {awayTeam.name}
            </span>
            <PopOutIcon />
          </button>
        ) : (
          <button
            type="button"
            className="fixture-row-toggle"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="sr-only">
              {open ? "Hide" : "Show"} details for {homeTeam.name} vs {awayTeam.name}
            </span>
            <ChevronIcon />
          </button>
        )}
      </div>

      {open && !opensModal ? (
        <div id={panelId} className="fixture-row-body">
          <WhyThisPrediction fixture={fixture} />
          {children}
        </div>
      ) : null}
      {opensModal ? children : null}
    </article>
  );
}

export function WhyThisPrediction({ fixture }: { fixture: UpcomingFixture }) {
  const factors = explainPrediction(fixture);
  const metricPairs = fixtureMetricPairs(fixture);

  return (
    <div className="why-panel">
      <div className="metric-duo">
        {metricPairs.map((pair) => (
          <div key={pair.label}>
            <span className="context-label">{pair.label}</span>
            <strong>
              {pair.format(pair.home)} <span style={{ color: "var(--muted)" }}>vs</span> {pair.format(pair.away)}
            </strong>
          </div>
        ))}
      </div>

      <div>
        <span className="context-label" style={{ marginBottom: "0.5rem", display: "block" }}>
          Why the model leans this way
        </span>
        <ul className="factor-list">
          {factors.map((factor, index) => (
            <li key={`${factor.tag}-${index}`} className={`factor-row factor-${factor.tone}`}>
              <span className="factor-icon" aria-hidden="true">
                {factor.tone === "flat" ? "•" : factor.tone === "up" ? "↑" : "↓"}
              </span>
              <span>
                <strong>{factor.tag}.</strong> {factor.text}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="disclosure-note">Based only on what was known before kickoff, the same inputs the model uses.</p>
    </div>
  );
}
