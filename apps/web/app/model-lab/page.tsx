import { ModelLabBrowser } from "@/components/model-lab-browser";
import { ErrorState } from "@/components/ui/states";
import { loadDashboardResult } from "@/lib/dashboard";
import { pickQuizCandidates } from "@/lib/quiz";

export const metadata = {
  title: "Model Lab — Prem Predict",
  description: "How good is the Prem Predict model? Accuracy, calibration, upsets and best calls.",
};

export default async function ModelLabPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Model Lab
            </span>
          </div>
          <h1 className="page-title">How good is the model?</h1>
          <p className="page-lede">
            The model evaluation view is temporarily unavailable, but the rest of the site is online.
          </p>
        </header>

        <ErrorState title="Unable to load model metrics">{result.errorMessage}</ErrorState>
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
            Model Lab
          </span>
          <span className="page-eyebrow page-eyebrow-light">{dashboard.model.version}</span>
        </div>
        <h1 className="page-title">How good is the model?</h1>
        <p className="page-lede">
          Every forecast is graded against what actually happened. See the hit rate, whether the model beats simply
          picking home wins, how well its confidence tracks reality, and its biggest misses and boldest correct calls.
        </p>
      </header>

      <ModelLabBrowser matches={matches} model={model} />
    </div>
  );
}
