import { HistoryWeekView } from "@/components/history-week-view";
import { loadDashboardResult } from "@/lib/dashboard";

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

export default async function HistoryPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              History
            </span>
          </div>
          <h1 className="page-title">Finished matches with the stats that matter most.</h1>
          <p className="page-lede">
            The historical results view is temporarily unavailable, but we can try again once the backend responds.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load match history</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const dashboard = result.data;
  const seasons = Array.from(new Set(dashboard.historicalMatches.map((match) => match.season)));

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            History
          </span>
          <span className="page-eyebrow page-eyebrow-light">{seasons.length} season{seasons.length === 1 ? "" : "s"}</span>
        </div>
        <h1 className="page-title">Finished matches with the stats that matter most.</h1>
        <p className="page-lede">
          Step through completed gameweeks and compare scorelines with xG, shots on target, big chances, possession,
          and pre-match context.
        </p>
        <div className="page-meta-row">
          <span>
            <strong>{dashboard.historicalMatches.length.toLocaleString("en-GB")}</strong> finished matches archived
          </span>
          <span className="site-footer-dot" aria-hidden="true">
            ·
          </span>
          <span>Updated {formatGenerated(dashboard.generatedAtUtc)}</span>
        </div>
      </header>

      <HistoryWeekView matches={dashboard.historicalMatches} />
    </div>
  );
}
