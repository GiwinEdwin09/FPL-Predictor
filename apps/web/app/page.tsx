export default async function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero-panel hero-panel-home">
        <div className="hero-copy">
          <p className="eyebrow">Premier League Predictor</p>
          <h1>A cleaner home for fixture predictions and match history.</h1>
          <p className="hero-text">
            This site is built to help you move through the season gameweek by gameweek. Use the predictions page for
            upcoming fixtures and the history page for finished matches, scorelines, and the most important stat
            signals behind them.
          </p>
        </div>

        <div className="home-card-grid">
          <a href="/predictions" className="home-card">
            <span className="eyebrow">Predictions</span>
            <h2>Browse upcoming fixtures by gameweek</h2>
            <p>Move week to week with arrow controls and scroll vertically through every match in that round.</p>
          </a>
          <a href="/history" className="home-card">
            <span className="eyebrow">History</span>
            <h2>Inspect finished matches with key stats</h2>
            <p>Review scorelines, xG, shots on target, big chances, possession, and pre-match context.</p>
          </a>
        </div>
      </section>
    </main>
  );
}
