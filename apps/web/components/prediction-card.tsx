"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

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

/**
 * One fixture as a compact row: kickoff, clubs, probabilities and the model's
 * call. Opening it shows why the model leans that way, plus any extra tools
 * passed as children (the lineup simulator).
 */
export function PredictionCard({
  fixture,
  probabilitiesOverride,
  highlighted = false,
  defaultOpen = false,
  children,
}: {
  fixture: UpcomingFixture;
  /** Briefly outlines the row and opens it, e.g. after arriving from a fixture link. */
  highlighted?: boolean;
  defaultOpen?: boolean;
  /** Simulated probabilities (e.g. from a lineup change). Falls back to the model's default forecast. */
  probabilitiesOverride?: FixtureProbabilities;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || highlighted);
  const panelId = useId();

  useEffect(() => {
    if (highlighted) setOpen(true);
  }, [highlighted]);

  const probabilities = probabilitiesOverride ?? fixture.probabilities;
  const { homeTeam, awayTeam } = fixture;

  return (
    <article
      id={fixtureAnchorId(fixture.matchId)}
      className={`fixture-row${highlighted ? " fixture-row-focus" : ""}`}
      data-open={open}
    >
      <div className="fixture-row-summary">
        <span className="fixture-row-time">
          <LocalTime value={fixture.kickoffTime} variant="time" />
        </span>

        <span className="fixture-row-teams">
          <span className="fixture-row-team">
            <TeamCrest name={homeTeam.name} badgePath={homeTeam.badgePath} size={28} />
            <span className="fixture-row-name">{homeTeam.name}</span>
          </span>
          <span className="fixture-row-vs" aria-hidden="true">
            vs
          </span>
          <span className="fixture-row-team fixture-row-team-away">
            <span className="fixture-row-name">{awayTeam.name}</span>
            <TeamCrest name={awayTeam.name} badgePath={awayTeam.badgePath} size={28} />
          </span>
        </span>

        <span className="fixture-row-forecast">
          <ProbabilityBar probabilities={probabilities} homeShort={homeTeam.shortName} awayShort={awayTeam.shortName} size="sm" />
          <ModelVerdict probabilities={probabilities} homeShort={homeTeam.shortName} awayShort={awayTeam.shortName} />
        </span>

        {/* The whole row is the click target; this button carries the name and state. */}
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
      </div>

      {open ? (
        <div id={panelId} className="fixture-row-body">
          <WhyThisPrediction fixture={fixture} />
          {children}
        </div>
      ) : null}
    </article>
  );
}

function WhyThisPrediction({ fixture }: { fixture: UpcomingFixture }) {
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
