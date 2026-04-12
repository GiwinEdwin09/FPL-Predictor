import type { UpcomingFixture } from "@/lib/dashboard";

function formatGameweek(gameweek: number | null) {
  return gameweek === null ? "TBD" : `Gameweek ${gameweek}`;
}

export function PostponedFixturesView({ fixtures }: { fixtures: UpcomingFixture[] }) {
  if (fixtures.length === 0) {
    return <p className="empty-state">No postponed Premier League fixtures are currently listed.</p>;
  }

  const sortedFixtures = [...fixtures].sort((left, right) => {
    const gwLeft = left.gameweek ?? Number.MAX_SAFE_INTEGER;
    const gwRight = right.gameweek ?? Number.MAX_SAFE_INTEGER;
    if (gwLeft !== gwRight) {
      return gwLeft - gwRight;
    }
    return left.matchId.localeCompare(right.matchId);
  });

  return (
    <section className="week-panel">
      <div className="week-panel-header week-panel-header-simple">
        <div className="week-heading">
          <p className="eyebrow">Postponed Fixtures</p>
          <h2>Fixtures waiting for a new date</h2>
          <p>These matches are kept separate so they are not confused with live upcoming rounds.</p>
        </div>
      </div>

      <div className="postponed-grid">
        {sortedFixtures.map((fixture) => (
          <article key={fixture.matchId} className="postponed-card">
            <div className="postponed-topline">
              <span>{fixture.season}</span>
              <span>{formatGameweek(fixture.gameweek)}</span>
            </div>
            <div className="postponed-clubs">
              <strong>{fixture.homeTeam.name}</strong>
              <span>vs</span>
              <strong>{fixture.awayTeam.name}</strong>
            </div>
            <p className="postponed-note">{fixture.statusReason ?? "Awaiting updated source data."}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

