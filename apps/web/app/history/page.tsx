import { HistoryWeekView } from "@/components/history-week-view";
import { loadDashboardResult } from "@/lib/dashboard";

export default async function HistoryPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <main className="page-shell">
        <section className="section-header section-header-page">
          <div>
            <p className="eyebrow">History</p>
            <h1 className="page-title">Finished matches with the stats that matter most.</h1>
            <p className="hero-text">
              The historical results view is temporarily unavailable, but we can try again once the backend responds.
            </p>
          </div>
        </section>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load match history</h2>
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
