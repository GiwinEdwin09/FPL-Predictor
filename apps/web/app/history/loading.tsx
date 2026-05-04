export default function HistoryLoading() {
  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            History
          </span>
          <span className="page-eyebrow page-eyebrow-light">Loading…</span>
        </div>
        <h1 className="page-title">Finished matches with the stats that matter most.</h1>
        <p className="page-lede">Loading completed fixtures and their key match summaries.</p>
      </header>

      <section className="week-panel">
        <div className="week-panel-header week-panel-header-simple">
          <div className="week-heading">
            <p>Loading</p>
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
    </div>
  );
}
