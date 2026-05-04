import { PredictionsBrowser } from "@/components/predictions-browser";
import { loadDashboardResult } from "@/lib/dashboard";
import { formatDeadlineLong, summarizeGameweek } from "@/lib/gameweek";

function formatGenerated(generatedAtUtc: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(generatedAtUtc));
}

export default async function PredictionsPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Predictions
            </span>
          </div>
          <h1 className="page-title">Upcoming fixtures, one gameweek at a time.</h1>
          <p className="page-lede">
            The predictions view is temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load predictions</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const dashboard = result.data;
  const summary = summarizeGameweek(dashboard);
  const deadlineLabel = formatDeadlineLong(summary.deadlineUtc);
  const totalUpcoming = dashboard.upcomingFixtures.length + dashboard.currentGameweekFixtures.length;

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Predictions
          </span>
          {summary.gameweek !== null ? (
            <span className="page-eyebrow page-eyebrow-light">
              {summary.status === "live" ? `Live · GW ${summary.gameweek}` : `Next up · GW ${summary.gameweek}`}
            </span>
          ) : null}
          {deadlineLabel ? (
            <span className="page-meta-pill">Deadline {deadlineLabel}</span>
          ) : null}
        </div>
        <h1 className="page-title">Upcoming fixtures, one gameweek at a time.</h1>
        <p className="page-lede">
          Use the current-gameweek tab once a round has started, browse future rounds gameweek by gameweek, and keep
          postponed fixtures separate so unresolved scheduling changes don&apos;t confuse the forecast view.
        </p>
        <div className="page-meta-row">
          <span>
            <strong>{totalUpcoming}</strong> fixtures with active probabilities
          </span>
          <span className="site-footer-dot" aria-hidden="true">
            ·
          </span>
          <span>Updated {formatGenerated(dashboard.generatedAtUtc)}</span>
        </div>
      </header>

      <PredictionsBrowser
        currentGameweek={dashboard.currentGameweek}
        currentGameweekFixtures={dashboard.currentGameweekFixtures}
        upcomingFixtures={dashboard.upcomingFixtures}
        postponedFixtures={dashboard.postponedFixtures}
      />
    </div>
  );
}
