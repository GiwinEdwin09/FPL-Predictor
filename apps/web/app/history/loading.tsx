export default function HistoryLoading() {
  return (
    <main className="page-shell">
      <section className="section-header section-header-page">
        <div>
          <p className="eyebrow">History</p>
          <h1 className="page-title">Finished matches with the stats that matter most.</h1>
          <p className="hero-text">Loading completed fixtures and their key match summaries.</p>
        </div>
      </section>

      <section className="week-panel">
        <div className="week-panel-header week-panel-header-simple">
          <div className="week-heading">
            <p className="eyebrow">Loading</p>
            <h2>Preparing historical gameweeks</h2>
            <p>Fetching the latest completed match archive.</p>
          </div>
        </div>

        <div className="history-week-scroll">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="history-card skeleton-card">
              <div className="skeleton-line skeleton-line-short" />
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-line skeleton-line-title" />
              <div className="skeleton-grid">
                <div className="skeleton-bar" />
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
