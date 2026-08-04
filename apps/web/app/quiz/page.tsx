import { QuizGame } from "@/components/quiz-game";
import { loadDashboardResult } from "@/lib/dashboard";
import { dailyQuizMatches, pickQuizCandidates, todayKey } from "@/lib/quiz";

export default async function QuizPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Quiz
            </span>
          </div>
          <h1 className="page-title">Beat the model.</h1>
          <p className="page-lede">
            The quiz is temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load quiz matches</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const candidates = pickQuizCandidates(result.data.historicalMatches);
  const daily = dailyQuizMatches(candidates, todayKey());

  return (
    <div className="page-shell">
      <header className="page-head">
        <div className="page-head-row">
          <span className="page-eyebrow">
            <span className="page-eyebrow-dot" aria-hidden="true" />
            Quiz
          </span>
        </div>
        <h1 className="page-title">Beat the model.</h1>
        <p className="page-lede">
          We hide the score of a real Premier League match and show you what the model saw before kickoff. Call the
          result, then see how your pick stacks up against the forecast. Five fresh matches every day, or unlimited
          practice from the archive.
        </p>
      </header>

      <QuizGame candidates={candidates} daily={daily} />
    </div>
  );
}
