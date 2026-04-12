import { PredictionsBrowser } from "@/components/predictions-browser";
import { loadDashboardData } from "@/lib/dashboard";

export default async function PredictionsPage() {
  const dashboard = await loadDashboardData();

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
