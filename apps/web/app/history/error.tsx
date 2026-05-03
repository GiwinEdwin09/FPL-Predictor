"use client";

type HistoryErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function HistoryError({ error, reset }: HistoryErrorProps) {
  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="page-title">Finished matches with the stats that matter most.</h1>
          <p className="hero-text">The historical results page hit an unexpected issue while loading.</p>
        </div>
      </section>

      <section className="page-state-card page-state-error" role="alert">
        <h2>Unable to load match history</h2>
        <p>{error.message || "Something went wrong while loading the history page."}</p>
        <button className="page-state-action" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
