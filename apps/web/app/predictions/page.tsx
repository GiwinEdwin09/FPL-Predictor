import { PredictionsBrowser } from "@/components/predictions-browser";
import { loadDashboardResult } from "@/lib/dashboard";

export default async function PredictionsPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <main className="page-shell">
        <section className="section-header section-header-page">
          <div>
            <p className="eyebrow">Predictions</p>
            <h1 className="page-title">Upcoming Premier League fixtures, one gameweek at a time.</h1>
            <p className="hero-text">
              The predictions view is temporarily unavailable, but the site is still online and we can retry shortly.
            </p>
          </div>
        </section>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load predictions</h2>
          <p>{result.errorMessage}</p>
        </section>
      </main>
    );
  }

  const { data: dashboard } = result;

  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">Predictions</p>
          <h1 className="page-title">Upcoming Premier League fixtures, one gameweek at a time.</h1>
          <p className="hero-text">
            Use the current-gameweek tab once a round has started, browse future rounds gameweek by gameweek, and keep
            postponed fixtures separate so unresolved scheduling changes do not confuse the forecast view.
          </p>
        </div>
        <p className="section-note">Updated {new Date(dashboard.generatedAtUtc).toUTCString()}</p>
      </section>

      <PredictionsBrowser
        currentGameweek={dashboard.currentGameweek}
        currentGameweekFixtures={dashboard.currentGameweekFixtures}
        upcomingFixtures={dashboard.upcomingFixtures}
        postponedFixtures={dashboard.postponedFixtures}
      />
    </main>
  );
}
