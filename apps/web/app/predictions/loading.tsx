export default function PredictionsLoading() {
  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Predictions
          </span>
          <span className="page-eyebrow page-eyebrow-light">Loading…</span>
        </div>
        <h1 className="page-title">Who does the model back this week?</h1>
        <p className="page-lede">Pulling the latest probabilities and grouping fixtures into rounds.</p>
      </header>

      <section className="week-panel">
        <div className="week-panel-header week-panel-header-simple">
          <div className="week-heading">
            <p>Loading</p>
            <h2>Preparing prediction fixtures</h2>
            <p>Fetching the latest forecasts from the backend.</p>
          </div>
        </div>

        <div className="day-group-rows">
          {Array.from({ length: 5 }).map((_, index) => (
            <article key={index} className="fixture-row skeleton-card">
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line" />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
