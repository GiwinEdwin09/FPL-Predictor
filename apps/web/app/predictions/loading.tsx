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
        <h1 className="page-title">Upcoming fixtures, one gameweek at a time.</h1>
        <p className="page-lede">Pulling the latest probabilities and grouping fixtures into rounds.</p>
      </header>

      <div className="tab-bar">
        <span className="tab-button tab-button-disabled">Current Gameweek</span>
        <span className="tab-button tab-button-disabled">Future Predictions</span>
        <span className="tab-button tab-button-disabled">Postponed</span>
      </div>

      <section className="week-panel">
        <div className="week-panel-header week-panel-header-simple">
          <div className="week-heading">
            <p>Loading</p>
            <h2>Preparing prediction fixtures</h2>
            <p>Fetching the latest forecasts from the backend.</p>
          </div>
        </div>

        <div className="fixtures-week-scroll">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="fixture-card skeleton-card">
              <div className="skeleton-line skeleton-line-short" />
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-bars">
                <div className="skeleton-bar" />
                <div className="skeleton-bar" />
                <div className="skeleton-bar" />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
