import Link from "next/link";

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
          The league table with how often the model called each club&apos;s matches correctly. Open a club for its
          form, Elo trajectory, expected goals, upcoming forecasts and result-by-result grading.
        </p>
        <div className="hero-cta-row">
          <Link href="/compare" className="cta-secondary">
            Compare two clubs
          </Link>
        </div>
      </header>

      <TeamsIndex matches={matches} />
    </div>
  );
}
