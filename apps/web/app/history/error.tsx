"use client";

type HistoryErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function HistoryError({ error, reset }: HistoryErrorProps) {
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
        <p className="page-lede">The historical results page hit an unexpected issue while loading.</p>
      </header>

      <section className="page-state-card page-state-error" role="alert">
        <h2>Unable to load match history</h2>
        <p>{error.message || "Something went wrong while loading the history page."}</p>
        <button className="page-state-action" onClick={reset}>
          Try again
        </button>
      </section>
    </div>
  );
}
