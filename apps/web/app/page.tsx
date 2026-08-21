import Link from "next/link";

import { CompactFixture } from "@/components/compact-fixture";
import { FeaturedMatch } from "@/components/featured-match";
import { TeamCrest } from "@/components/ui/crest";
import { MetricTile } from "@/components/ui/metric-tile";
import { ErrorState } from "@/components/ui/states";
import { loadDashboardResult } from "@/lib/dashboard";
import { formatMatchDate, formatPercent } from "@/lib/format";
import { biggestUpsets } from "@/lib/insights";
import { fixturesForGameweek, summarizeGameweek } from "@/lib/gameweek";
import { pickQuizCandidates } from "@/lib/quiz";

const TOTAL_GAMEWEEKS = 38;
const PREVIEW_FIXTURE_COUNT = 5;

export default async function HomePage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <section className="hero">
          <div className="hero-inner">
            <div>
              <span className="hero-eyebrow">
                <span className="hero-eyebrow-pulse" aria-hidden="true" />
                Premier League Forecasts
              </span>
              <h1>
                Predict the <span className="accent">Weekend.</span>
              </h1>
              <p>
                Calibrated HOME / DRAW / AWAY probabilities for every Premier League fixture, built on Elo ratings,
                expected goals and match context. Live data is unavailable right now — try again shortly.
              </p>
              <div className="hero-cta-row">
                <Link href="/predictions" className="cta-primary">
                  View Predictions
                </Link>
                <Link href="/model-lab" className="cta-secondary">
                  How good is the model?
                </Link>
              </div>
            </div>
          </div>
        </section>

        <div style={{ marginTop: "1.5rem" }}>
          <ErrorState title="Live data is unavailable">{result.errorMessage}</ErrorState>
        </div>
      </div>
    );
  }

  const dashboard = result.data;
  const summary = summarizeGameweek(dashboard);
  const focusFixtures = fixturesForGameweek(dashboard, summary.gameweek);
  const sortedFocus = [...focusFixtures].sort((a, b) => {
    const left = a.kickoffTime ?? "9999";
    const right = b.kickoffTime ?? "9999";
    return left.localeCompare(right);
  });
  const previewFixtures = sortedFocus.slice(0, PREVIEW_FIXTURE_COUNT);
  const spotlightFixture = sortedFocus[0] ?? null;

  const remainingGameweeks =
    summary.gameweek !== null
      ? Math.max(0, TOTAL_GAMEWEEKS - summary.gameweek + (summary.status === "live" ? 0 : 1))
      : 0;

  const matchesAnalysed = dashboard.historicalMatches.length;
  const accuracyPct = formatPercent(dashboard.model.metrics.accuracy ?? 0, 1);

  // Historical insight: the single biggest shock from the archive.
  const gradedMatches = pickQuizCandidates(dashboard.historicalMatches);
  const latestSeason = gradedMatches.reduce<string | null>(
    (latest, match) => (latest === null || match.season > latest ? match.season : latest),
    null,
  );
  const seasonUpsets = biggestUpsets(
    gradedMatches.filter((match) => match.season === latestSeason),
    1,
  );
  const headlineShock = seasonUpsets[0] ?? null;

  const heroEyebrow =
    summary.status === "live"
      ? `Live · Matchweek ${summary.gameweek}`
      : summary.status === "upcoming"
        ? `Next up · Matchweek ${summary.gameweek}`
        : `Premier League ${dashboard.currentSeason.replace("-", "/")}`;

  return (
    <div className="page-shell">
      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="hero-eyebrow">
              <span className="hero-eyebrow-pulse" aria-hidden="true" />
              {heroEyebrow}
            </span>
            <h1>
              Predict the <span className="accent">Weekend.</span>
            </h1>
            <p>
              Machine-learned forecasts for every Premier League fixture — calibrated HOME / DRAW / AWAY
              probabilities built from Elo ratings, expected goals, recent form and lineups.
            </p>
            <div className="hero-cta-row">
              <Link href="/predictions" className="cta-primary">
                View Predictions
                <svg className="cta-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
              <Link href="/model-lab" className="cta-secondary">
                Model Lab
              </Link>
            </div>
          </div>

          <aside aria-label="Why trust these predictions">
            <div style={{ display: "grid", gap: "0.7rem", justifyItems: "start" }}>
              {[
                ["Elo", "Every club carries a live strength rating updated after each match."],
                ["xG & xGA", "Rolling five-match attack and defensive quality, kickoff-aware."],
                ["Calibration", "When the model says 70%, it happens about 70% of the time."],
                ["Lineups", "Swap players in any fixture and watch the forecast respond."],
              ].map(([term, description]) => (
                <div key={term} style={{ display: "flex", gap: "0.75rem", alignItems: "baseline" }}>
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--accent)",
                      minWidth: "4.5rem",
                    }}
                  >
                    {term}
                  </span>
                  <span style={{ fontSize: "0.86rem", color: "rgba(255,255,255,0.72)", lineHeight: 1.5 }}>
                    {description}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {/* Match of the Week */}
      {spotlightFixture ? <FeaturedMatch fixture={spotlightFixture} /> : null}

      {/* Season at a glance */}
      <section className="stat-strip" aria-label="Season at a glance">
        <MetricTile
          label={summary.status === "live" ? "Live matchweek" : "Current matchweek"}
          value={summary.gameweek ?? "—"}
          hint={
            summary.status === "live"
              ? "Round in progress"
              : summary.status === "upcoming"
                ? "Up next"
                : "Season complete"
          }
        />
        <MetricTile
          label="Fixtures this round"
          value={summary.fixtureCount}
          hint={`${remainingGameweeks} matchweek${remainingGameweeks === 1 ? "" : "s"} left of ${TOTAL_GAMEWEEKS}`}
        />
        <MetricTile
          label="Match accuracy"
          value={accuracyPct}
          hint={`Across ${dashboard.model.split.validation_rows ?? "—"} held-out matches`}
        />
        <MetricTile
          label="Matches analysed"
          value={matchesAnalysed.toLocaleString("en-GB")}
          hint="Finished matches with full pre-match context"
        />
      </section>

      {/* Matchweek preview */}
      {previewFixtures.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>{summary.status === "live" ? "Live now" : "Coming up"} · MW {summary.gameweek}</h2>
              <p>
                {previewFixtures.length} of {summary.fixtureCount} fixtures shown — every card shows the model&apos;s
                pick and how confident it is.
              </p>
            </div>
            <Link href="/predictions" className="section-link">
              View all predictions
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          <div className="upcoming-rows">
            {previewFixtures.map((fixture) => (
              <CompactFixture key={fixture.matchId} fixture={fixture} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Historical insight teaser */}
      {headlineShock ? (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>From the archive · {latestSeason?.replace("-", "/")}</h2>
              <p>The result the model rated least likely — and how often it gets calls like this right.</p>
            </div>
            <Link href="/model-lab" className="section-link">
              Open Model Lab
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
          <Link
            href="/model-lab"
            className="upset-row"
            style={{ display: "grid", cursor: "pointer" }}
            aria-label={`Open model lab: ${headlineShock.match.homeTeam.name} ${headlineShock.match.score.home}-${headlineShock.match.score.away} ${headlineShock.match.awayTeam.name}`}
          >
            <span className="upset-rank" aria-hidden="true" />
            <div className="upset-fixture">
              <span className="upset-team">
                <TeamCrest name={headlineShock.match.homeTeam.name} badgePath={headlineShock.match.homeTeam.badgePath} size={30} />
                {headlineShock.match.homeTeam.shortName}
              </span>
              <strong className="upset-score">
                {headlineShock.match.score.home} – {headlineShock.match.score.away}
              </strong>
              <span className="upset-team">
                <TeamCrest name={headlineShock.match.awayTeam.name} badgePath={headlineShock.match.awayTeam.badgePath} size={30} />
                {headlineShock.match.awayTeam.shortName}
              </span>
            </div>
            <div className="upset-detail">
              <span>
                MW {headlineShock.match.gameweek ?? "—"} · {formatMatchDate(headlineShock.match.kickoffTime)}
              </span>
              <span>
                Model gave the winner just <strong>{formatPercent(headlineShock.probability, 1)}</strong>
              </span>
            </div>
          </Link>
        </section>
      ) : null}
    </div>
  );
}
