import Link from "next/link";

import { ConfidenceBadge } from "@/components/ui/badges";
import { TeamCrest } from "@/components/ui/crest";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { describeConfidence } from "@/lib/confidence";
import type { UpcomingFixture } from "@/lib/dashboard";
import { formatKickoff } from "@/lib/format";

export function FeaturedMatch({ fixture }: { fixture: UpcomingFixture }) {
  const confidence = describeConfidence(fixture.probabilities);

  const favoredName =
    confidence.pick === "home"
      ? fixture.homeTeam.name
      : confidence.pick === "away"
        ? fixture.awayTeam.name
        : null;

  return (
    <section className="motw" aria-label="Match of the Week">
      <div className="motw-head">
        <span className="motw-title">Match of the Week</span>
        <span className="motw-meta">
          Premier League · MW {fixture.gameweek ?? "?"} · {formatKickoff(fixture.kickoffTime)}
        </span>
      </div>

      <div className="motw-clubs">
        <div className="motw-team">
          <TeamCrest name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={92} />
          <span className="motw-team-name">{fixture.homeTeam.name}</span>
          <span className="motw-team-sub">
            Home{fixture.context.homeElo !== null ? ` · Elo ${Math.round(fixture.context.homeElo)}` : ""}
          </span>
        </div>

        <div className="motw-vs" aria-hidden="true">
          <div className="motw-vs-badge">VS</div>
        </div>

        <div className="motw-team">
          <TeamCrest name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={92} />
          <span className="motw-team-name">{fixture.awayTeam.name}</span>
          <span className="motw-team-sub">
            Away{fixture.context.awayElo !== null ? ` · Elo ${Math.round(fixture.context.awayElo)}` : ""}
          </span>
        </div>
      </div>

      <div className="motw-verdict">
        {favoredName ? (
          <>
            <span className="motw-callout">{favoredName} favored</span>
            <ConfidenceBadge confidence={confidence} />
          </>
        ) : (
          <>
            <span className="motw-callout" style={{ color: "var(--prob-draw)" }}>
              {confidence.label}
            </span>
            <ConfidenceBadge confidence={confidence} />
          </>
        )}
      </div>

      <ProbabilityBar
        probabilities={fixture.probabilities}
        homeShort={fixture.homeTeam.shortName}
        awayShort={fixture.awayTeam.shortName}
        size="lg"
      />

      <div className="motw-footer">
        <p className="motw-footer-note">
          Probabilities produced by the production model from Elo, recent xG form and venue.
        </p>
        <Link href="/predictions" className="cta-primary">
          Analyse match
          <svg className="cta-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
