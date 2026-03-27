import { FixturesWeekView } from "@/components/fixtures-week-view";
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
            Use the arrows to move between gameweeks, then scroll vertically through the matches in that round.
          </p>
        </div>
        <p className="section-note">Updated {new Date(dashboard.generatedAtUtc).toUTCString()}</p>
      </section>

      <FixturesWeekView fixtures={dashboard.upcomingFixtures} />
    </main>
  );
}

