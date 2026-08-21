import { TeamsIndex } from "@/components/teams-index";
import { loadDashboardResult } from "@/lib/dashboard";
import { pickQuizCandidates } from "@/lib/quiz";

export default async function TeamsPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Teams
            </span>
          </div>
          <h1 className="page-title">Pick a club. Read its numbers.</h1>
          <p className="page-lede">
            Team pages are temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load teams</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const matches = pickQuizCandidates(result.data.historicalMatches);

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Teams
          </span>
        </div>
        <h1 className="page-title">Pick a club. Read its numbers.</h1>
        <p className="page-lede">
          Every Premier League club with its season record and how often the model called its matches correctly.
          Open a club for the full profile: form, Elo trajectory, expected goals, upcoming forecasts, and
          result-by-result grading. Prefer the classic view? Switch to the table.
        </p>
      </header>

      <TeamsIndex matches={matches} />
    </div>
  );
}
