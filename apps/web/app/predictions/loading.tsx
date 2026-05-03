export default function PredictionsLoading() {
  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">Predictions</p>
          <h1 className="page-title">Upcoming Premier League fixtures, one gameweek at a time.</h1>
          <p className="hero-text">Fetching the latest prediction view and grouping the next rounds for you.</p>
        </div>
      </section>

      <div className="tab-bar">
        <span className="tab-button tab-button-disabled">Current Gameweek</span>
        <span className="tab-button tab-button-disabled">Future Predictions</span>
        <span className="tab-button tab-button-disabled">Postponed</span>
      </div>

      <section className="week-panel">
        <div className="week-panel-header week-panel-header-simple">
          <div className="week-heading">
            <p className="eyebrow">Loading</p>
            <h2>Preparing prediction fixtures</h2>
            <p>Pulling the latest probabilities from the backend.</p>
          </div>
        </div>

        <div className="fixture-grid">
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
    </main>
  );
}
