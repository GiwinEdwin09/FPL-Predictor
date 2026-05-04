"use client";

type PredictionsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PredictionsError({ error, reset }: PredictionsErrorProps) {
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
        <p className="page-lede">The live prediction page hit an unexpected issue while loading.</p>
      </header>

      <section className="page-state-card page-state-error" role="alert">
        <h2>Unable to load predictions</h2>
        <p>{error.message || "Something went wrong while loading the prediction page."}</p>
        <button className="page-state-action" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
