import { CompareExplorer } from "@/components/compare-explorer";
import { loadDashboardResult } from "@/lib/dashboard";
import { pickQuizCandidates } from "@/lib/quiz";
import { collectTeams } from "@/lib/teams";

export default async function ComparePage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Compare
            </span>
          </div>
          <h1 className="page-title">Head-to-head, settled by the data.</h1>
          <p className="page-lede">
            The compare view is temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load comparisons</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const matches = pickQuizCandidates(result.data.historicalMatches);
  const teams = collectTeams(matches);

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Compare
          </span>
        </div>
        <h1 className="page-title">Head-to-head, settled by the data.</h1>
        <p className="page-lede">
          Pick any two clubs to pull up every league meeting in the archive: the win split, goals and expected goals,
          and how often the model read the fixture correctly.
        </p>
      </header>

      <CompareExplorer matches={matches} teams={teams} />
    </div>
  );
}
