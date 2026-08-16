import { InsightsBrowser } from "@/components/insights-browser";
import { loadDashboardResult } from "@/lib/dashboard";
import { pickQuizCandidates } from "@/lib/quiz";

export default async function InsightsPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Insights
            </span>
          </div>
          <h1 className="page-title">The model&apos;s report card.</h1>
          <p className="page-lede">
            Insights are temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load insights</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const dashboard = result.data;
  const matches = pickQuizCandidates(dashboard.historicalMatches);
  const model = {
    validationAccuracy: dashboard.model.metrics.accuracy ?? null,
    logLoss: dashboard.model.metrics.multiclass_log_loss ?? null,
    brier: dashboard.model.metrics.multiclass_brier_score ?? null,
    temperature: dashboard.model.calibrationTemperature ?? null,
    trainRows: dashboard.model.split.train_rows ?? null,
    validationRows: dashboard.model.split.validation_rows ?? null,
  };

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Insights
          </span>
        </div>
        <h1 className="page-title">The model&apos;s report card.</h1>
        <p className="page-lede">
          Explore the model&apos;s 2025–2026 results, hit rate, biggest surprises, and calibration. The model launched
          during the season, so earlier gameweeks are identified as retrospective replays rather than published
          forecasts.
        </p>
      </header>

      <InsightsBrowser matches={matches} model={model} />
    </div>
  );
}
