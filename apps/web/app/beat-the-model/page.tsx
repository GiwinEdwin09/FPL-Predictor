import { QuizGame } from "@/components/quiz-game";
import { ErrorState } from "@/components/ui/states";
import { loadDashboardResult } from "@/lib/dashboard";
import { dailyQuizMatches, pickQuizCandidates, todayKey } from "@/lib/quiz";

export const metadata = {
  title: "Beat the Model — Prem Predict",
  description: "Call real Premier League results before the reveal and see if you can out-predict the model.",
};

export default async function BeatTheModelPage() {
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <header className="page-head">
          <div className="page-head-row">
            <span className="page-eyebrow">
              <span className="page-eyebrow-dot" aria-hidden="true" />
              Beat the Model
            </span>
          </div>
          <h1 className="page-title">Can you out-predict the machine?</h1>
          <p className="page-lede">
            Beat the Model is temporarily unavailable, but the rest of the site is online and we can retry shortly.
          </p>
        </header>

        <ErrorState title="Unable to load matches">{result.errorMessage}</ErrorState>
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
            Beat the Model
          </span>
        </div>
        <h1 className="page-title">Can you out-predict the machine?</h1>
        <p className="page-lede">
          We hide the scoreline of a real Premier League match and show you exactly what the model saw before kickoff —
          Elo, recent xG, venue. Call HOME, DRAW or AWAY, then compare your record against the model&apos;s on the same
          fixtures. Five fresh matches every day, plus unlimited practice from the archive. Your score lives in your
          browser only.
        </p>
      </header>

      <QuizGame candidates={candidates} daily={daily} />
    </div>
  );
}
