import { HistoryWeekView } from "@/components/history-week-view";
import { loadDashboardData } from "@/lib/dashboard";

export default async function HistoryPage() {
  const dashboard = await loadDashboardData();

  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="page-title">Finished matches with the stats that matter most.</h1>
          <p className="hero-text">
            Step through completed gameweeks and compare scorelines with xG, shots on target, big chances, possession,
            and pre-match context.
          </p>
        </div>
        <p className="section-note">{dashboard.historicalMatches.length} finished matches available</p>
      </section>

      <HistoryWeekView matches={dashboard.historicalMatches} />
    </main>
  );
}
