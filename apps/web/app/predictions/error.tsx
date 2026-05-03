"use client";

type PredictionsErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function PredictionsError({ error, reset }: PredictionsErrorProps) {
  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">Predictions</p>
          <h1 className="page-title">Upcoming Premier League fixtures, one gameweek at a time.</h1>
          <p className="hero-text">The live prediction page hit an unexpected issue while loading.</p>
        </div>
      </section>

      <section className="page-state-card page-state-error" role="alert">
        <h2>Unable to load predictions</h2>
        <p>{error.message || "Something went wrong while loading the prediction page."}</p>
        <button className="page-state-action" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
