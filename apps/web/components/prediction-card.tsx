"use client";

import { useId, useState, type ReactNode } from "react";

import { TeamCrest } from "@/components/ui/crest";
import { ConfidenceBadge } from "@/components/ui/badges";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { describeConfidence, outcomeLabel } from "@/lib/confidence";
import type { UpcomingFixture } from "@/lib/dashboard";
import { formatKickoffWithZone } from "@/lib/format";
import { explainPrediction, fixtureMetricPairs } from "@/lib/explain";
import type { FixtureProbabilities } from "@/lib/lineup";

function ChevronIcon() {
  return (
    <svg className="why-chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PredictionCard({
  fixture,
  probabilitiesOverride,
  children,
}: {
  fixture: UpcomingFixture;
  /** Simulated probabilities (e.g. from a lineup change). Falls back to the model's default forecast. */
  probabilitiesOverride?: FixtureProbabilities;
  children?: ReactNode;
}) {
  const [whyOpen, setWhyOpen] = useState(false);
  const whyPanelId = useId();

  const probabilities = probabilitiesOverride ?? fixture.probabilities;
  const confidence = describeConfidence(probabilities);
  const factors = explainPrediction(fixture);
  const metricPairs = fixtureMetricPairs(fixture);

  const pickHeadline =
    confidence.pick !== null
      ? outcomeLabel(confidence.pick, fixture.homeTeam.shortName, fixture.awayTeam.shortName)
      : null;

  return (
    <article className="fixture-card">
      <div className="fixture-card-topline">
        <span className="fixture-card-gw">MW {fixture.gameweek ?? "TBD"}</span>
        <span className="fixture-card-time">{formatKickoffWithZone(fixture.kickoffTime)}</span>
      </div>

      <div className="fixture-clubs">
        <div className="club-stack">
          <TeamCrest name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={52} />
          <div>
            <p className="club-name">{fixture.homeTeam.name}</p>
            <p className="club-subline">
              Home · ELO {fixture.context.homeElo !== null ? Math.round(fixture.context.homeElo) : "—"}
            </p>
          </div>
        </div>
        <div className="fixture-versus">vs</div>
        <div className="club-stack club-stack-away">
          <div>
            <p className="club-name">{fixture.awayTeam.name}</p>
            <p className="club-subline">
              Away · ELO {fixture.context.awayElo !== null ? Math.round(fixture.context.awayElo) : "—"}
            </p>
          </div>
          <TeamCrest name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={52} />
        </div>
      </div>

      <div className="pred-callout">
        <div className="pick-badge">
          <span className="pick-badge-label">Model prediction</span>
          {pickHeadline ? (
            <span className="pick-badge-team">{pickHeadline}</span>
          ) : (
            <span className="pick-badge-team">Too close to call</span>
          )}
        </div>
        <ConfidenceBadge confidence={confidence} />
      </div>

      <ProbabilityBar
        probabilities={probabilities}
        homeShort={fixture.homeTeam.shortName}
        awayShort={fixture.awayTeam.shortName}
        size="md"
      />

      <button
        type="button"
        className="why-toggle"
        aria-expanded={whyOpen}
        aria-controls={whyPanelId}
        onClick={() => setWhyOpen((open) => !open)}
      >
        Why this prediction?
        <ChevronIcon />
      </button>

      {whyOpen ? (
        <div id={whyPanelId} className="disclosure-panel">
          <div className="disclosure-inner">
            <div className="metric-duo">
              {metricPairs.map((pair) => (
                <div key={pair.label}>
                  <span className="context-label">{pair.label}</span>
                  <strong>
                    {pair.format(pair.home)} <span style={{ color: "var(--muted)" }}>vs</span>{" "}
                    {pair.format(pair.away)}
                  </strong>
                </div>
              ))}
            </div>

            <div>
              <span className="context-label" style={{ marginBottom: "0.5rem", display: "block" }}>
                Key model factors
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

            <p className="disclosure-note">
              Factors are derived from pre-match data only and mirror what the production model sees.
            </p>
          </div>
        </div>
      ) : null}

      {children}
    </article>
  );
}
