import Image from "next/image";
import Link from "next/link";

import { loadDashboardResult, type UpcomingFixture } from "@/lib/dashboard";
import { fixturesForGameweek, formatDeadlineLong, summarizeGameweek } from "@/lib/gameweek";

const TOTAL_GAMEWEEKS = 38;

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatKickoffShort(kickoffTime: string | null) {
  if (!kickoffTime) {
    return "TBC";
  }
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(kickoffTime));
}

function TeamBadge({ name, badgePath, size = 28 }: { name: string; badgePath: string | null; size?: number }) {
  if (!badgePath) {
    return (
      <div
        className="club-mark-fallback"
        style={{ width: size, height: size, borderRadius: 8, fontSize: 10 }}
      >
        {name.slice(0, 3).toUpperCase()}
      </div>
    );
  }
  return <Image src={badgePath} alt={name} width={size} height={size} className="club-mark-image" style={{ width: size, height: size, filter: "none" }} />;
}

function HeroFixturePreview({ fixture }: { fixture: UpcomingFixture }) {
  const total = fixture.probabilities.homeWin + fixture.probabilities.draw + fixture.probabilities.awayWin || 1;
  const homeFrac = fixture.probabilities.homeWin / total;
  const drawFrac = fixture.probabilities.draw / total;
  const awayFrac = fixture.probabilities.awayWin / total;
  const favored = homeFrac >= awayFrac && homeFrac >= drawFrac
    ? `${fixture.homeTeam.shortName} favored`
    : awayFrac >= homeFrac && awayFrac >= drawFrac
      ? `${fixture.awayTeam.shortName} favored`
      : "Even matchup";

  return (
    <div className="hero-aside">
      <div className="hero-aside-label">
        <span>Spotlight fixture</span>
        <span className="accent-pill">GW {fixture.gameweek ?? "?"}</span>
      </div>
      <div className="hero-fixture-row">
        <div className="hero-fixture-team">
          <TeamBadge name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={36} />
          <span className="hero-fixture-name">{fixture.homeTeam.shortName}</span>
        </div>
        <div className="hero-fixture-vs">VS</div>
        <div className="hero-fixture-team hero-fixture-team-away">
          <span className="hero-fixture-name">{fixture.awayTeam.shortName}</span>
          <TeamBadge name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={36} />
        </div>
      </div>
      <div className="hero-aside-meta">
        <span>{formatKickoffShort(fixture.kickoffTime)}</span>
        <span>{favored}</span>
      </div>
      <div
        className="hero-prob-bar"
        style={{
          ["--home-frac" as string]: `${homeFrac}fr`,
          ["--draw-frac" as string]: `${drawFrac}fr`,
          ["--away-frac" as string]: `${awayFrac}fr`,
        }}
      >
        <span aria-label={`Home win ${formatPercent(homeFrac)}`} />
        <span aria-label={`Draw ${formatPercent(drawFrac)}`} />
        <span aria-label={`Away win ${formatPercent(awayFrac)}`} />
      </div>
      <div className="hero-prob-legend">
        <span>{fixture.homeTeam.shortName} {formatPercent(homeFrac)}</span>
        <span>Draw {formatPercent(drawFrac)}</span>
        <span>{fixture.awayTeam.shortName} {formatPercent(awayFrac)}</span>
      </div>
    </div>
  );
}

function UpcomingFixtureRow({ fixture }: { fixture: UpcomingFixture }) {
  const probs = fixture.probabilities;
  const total = probs.homeWin + probs.draw + probs.awayWin || 1;
  const homePct = (probs.homeWin / total) * 100;
  const drawPct = (probs.draw / total) * 100;
  const awayPct = (probs.awayWin / total) * 100;

  let leadLabel: string;
  if (homePct >= drawPct && homePct >= awayPct) {
    leadLabel = `H favored (${Math.round(homePct)}%)`;
  } else if (awayPct >= drawPct && awayPct >= homePct) {
    leadLabel = `A favored (${Math.round(awayPct)}%)`;
  } else {
    leadLabel = "Tight";
  }

  return (
    <article className="upcoming-row">
      <div className="upcoming-row-time">{formatKickoffShort(fixture.kickoffTime)}</div>
      <div className="upcoming-row-teams">
        <div className="upcoming-row-team">
          <TeamBadge name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={26} />
          <span>{fixture.homeTeam.shortName}</span>
        </div>
        <span className="upcoming-row-vs">vs</span>
        <div className="upcoming-row-team upcoming-row-team-away">
          <span>{fixture.awayTeam.shortName}</span>
          <TeamBadge name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={26} />
        </div>
      </div>
      <div className="upcoming-row-bar" aria-label={leadLabel}>
        <div className="upcoming-row-bar-track">
          <div className="upcoming-row-bar-home" style={{ width: `${homePct}%` }} />
          <div className="upcoming-row-bar-draw" style={{ width: `${drawPct}%` }} />
          <div className="upcoming-row-bar-away" style={{ width: `${awayPct}%` }} />
        </div>
        <span className="upcoming-row-lead">{leadLabel}</span>
      </div>
    </article>
  );
}

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
                Premier League Predictor
              </span>
              <h1>
                Predict. Analyse. <span className="accent">Win your gameweek.</span>
              </h1>
              <p>
                Calibrated home, draw and away win probabilities for every Premier League fixture, plus the
                stats behind every finished match. Live data is unavailable right now — try again shortly.
              </p>
              <div className="hero-cta-row">
                <Link href="/predictions" className="cta-primary">
                  Try predictions
                </Link>
                <Link href="/history" className="cta-secondary">
                  Browse history
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="page-state-card page-state-error" role="alert" style={{ marginTop: "1.5rem" }}>
          <h2>Live data is unavailable</h2>
          <p>{result.errorMessage}</p>
        </section>
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
  const previewFixtures = sortedFocus.slice(0, 3);
  const spotlightFixture = previewFixtures[0] ?? null;

  const allUpcomingGameweeks = new Set<number>();
  for (const fixture of dashboard.upcomingFixtures) {
    if (fixture.gameweek !== null) allUpcomingGameweeks.add(fixture.gameweek);
  }
  const remainingGameweeks =
    summary.gameweek !== null
      ? Math.max(0, TOTAL_GAMEWEEKS - summary.gameweek + (summary.status === "live" ? 0 : 1))
      : 0;

  const matchesAnalysed = dashboard.historicalMatches.length;
  const accuracyPct = Math.round((dashboard.model.metrics.accuracy ?? 0) * 100);
  const deadlineLabel = formatDeadlineLong(summary.deadlineUtc);

  const heroEyebrow =
    summary.status === "live"
      ? `Live · GW ${summary.gameweek}`
      : summary.status === "upcoming"
        ? `Next up · GW ${summary.gameweek}`
        : `Premier League ${dashboard.currentSeason}`;

  return (
    <div className="page-shell">
      <section className="hero">
        <div className="hero-inner">
          <div>
            <span className="hero-eyebrow">
              <span className="hero-eyebrow-pulse" aria-hidden="true" />
              {heroEyebrow}
            </span>
            <h1>
              Predict. Analyse. <span className="accent">Win your gameweek.</span>
            </h1>
            <p>
              Calibrated home, draw and away win probabilities for every Premier League fixture in{" "}
              {dashboard.currentSeason.replace("-", "/")}, paired with the stats that explain finished matches.
              {deadlineLabel ? ` Deadline ${deadlineLabel}.` : ""}
            </p>
            <div className="hero-cta-row">
              <Link href="/predictions" className="cta-primary">
                <ArrowRightIcon />
                {summary.status === "live"
                  ? `Open GW ${summary.gameweek} predictions`
                  : summary.gameweek
                    ? `Preview GW ${summary.gameweek} predictions`
                    : "Open predictions"}
              </Link>
              <Link href="/history" className="cta-secondary">
                <HistoryIcon />
                Browse match history
              </Link>
            </div>
          </div>
          {spotlightFixture ? <HeroFixturePreview fixture={spotlightFixture} /> : null}
        </div>
      </section>

      <section className="stat-strip" aria-label="Season at a glance">
        <article className="stat-tile">
          <div className="stat-tile-label">Gameweek</div>
          <div className="stat-tile-value">{summary.gameweek ?? "—"}</div>
          <div className="stat-tile-hint">
            {summary.status === "live"
              ? "Round in progress"
              : summary.status === "upcoming"
                ? "Up next"
                : "Season complete"}
          </div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Fixtures this week</div>
          <div className="stat-tile-value">{summary.fixtureCount}</div>
          <div className="stat-tile-hint">
            {deadlineLabel ? `Deadline ${deadlineLabel}` : "Schedule still being confirmed"}
          </div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Gameweeks left</div>
          <div className="stat-tile-value">{remainingGameweeks}</div>
          <div className="stat-tile-hint">{TOTAL_GAMEWEEKS} total in a Premier League season</div>
        </article>
        <article className="stat-tile">
          <div className="stat-tile-label">Matches analysed</div>
          <div className="stat-tile-value">{matchesAnalysed.toLocaleString("en-GB")}</div>
          <div className="stat-tile-hint">Model accuracy {accuracyPct}% (calibrated)</div>
        </article>
      </section>

      {previewFixtures.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>
                Upcoming · GW {summary.gameweek}
              </h2>
              <p>
                {previewFixtures.length} of {summary.fixtureCount} fixtures shown — open predictions for the full
                round and customise lineups.
              </p>
            </div>
            <Link href="/predictions" className="section-link">
              View all
              <ArrowRightIcon />
            </Link>
          </div>
          <div className="upcoming-rows">
            {previewFixtures.map((fixture) => (
              <UpcomingFixtureRow key={fixture.matchId} fixture={fixture} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="cta-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 12H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 6L19 12L13 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg className="cta-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16.97 3 21 7.03 21 12C21 16.97 16.97 21 12 21"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="M3 12L6 9M3 12L6 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
