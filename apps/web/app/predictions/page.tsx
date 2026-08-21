import { PredictionsBrowser } from "@/components/predictions-browser";
import { ErrorState } from "@/components/ui/states";
import { loadDashboardResult } from "@/lib/dashboard";
import { summarizeGameweek } from "@/lib/gameweek";
import { formatMatchDate } from "@/lib/format";

export default async function PredictionsPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Predictions
            </span>
          </div>
          <h1 className="page-title">Upcoming fixtures, one matchweek at a time.</h1>
          <p className="page-lede">
            The predictions view is temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <ErrorState title="Unable to load predictions">{result.errorMessage}</ErrorState>
      </div>
    );
  }

  const dashboard = result.data;
  const summary = summarizeGameweek(dashboard);
  const totalUpcoming = dashboard.upcomingFixtures.length + dashboard.currentGameweekFixtures.length;

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Predictions
          </span>
          {summary.gameweek !== null ? (
            <span className="page-eyebrow page-eyebrow-light">
              {summary.status === "live" ? `Live · MW ${summary.gameweek}` : `Next up · MW ${summary.gameweek}`}
            </span>
          ) : null}
        </div>
        <h1 className="page-title">Who does the model back this week?</h1>
        <p className="page-lede">
          Calibrated HOME / DRAW / AWAY probabilities for every Premier League fixture, with the model&apos;s pick,
          a confidence rating, and the factors behind each call. Open any card to see why — or edit the lineups to
          simulate a different team sheet.
        </p>
        <div className="page-meta-row">
          <span>
            <strong>{totalUpcoming}</strong> fixtures with active forecasts
          </span>
          <span className="site-footer-dot" aria-hidden="true">
            ·
          </span>
          <span>Updated {formatMatchDate(dashboard.generatedAtUtc)}</span>
        </div>
      </header>

      <PredictionsBrowser
        currentGameweek={dashboard.currentGameweek}
        currentGameweekFixtures={dashboard.currentGameweekFixtures}
        upcomingFixtures={dashboard.upcomingFixtures}
        postponedFixtures={dashboard.postponedFixtures}
      />
    </div>
  );
}
