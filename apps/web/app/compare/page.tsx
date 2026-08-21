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
          Put any two clubs side by side: Elo, expected goals, defensive load and how often the model calls each
          team&apos;s matches — then scroll into every league meeting in the archive with the model&apos;s pre-match
          call marked hit or miss.
        </p>
      </header>

      <CompareExplorer matches={matches} teams={teams} />
    </div>
  );
}
