"use client";

import { formatPercent } from "@/lib/format";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import type { QuizMatch, QuizOutcome } from "@/lib/quiz";
import {
  dailyQuizMatches,
  modelPick,
  outcomeProbability,
  resolveOutcome,
  restoreDailyProgress,
  tallyDailyPicks,
  todayKey,
  type DailyProgress,
} from "@/lib/quiz";

type ScoreState = {
  user: number;
  model: number;
  played: number;
};

type DailyRecord = {
  date: string;
  user: number;
  model: number;
  total: number;
};

const SCORE_STORAGE_KEY = "fpl-predictor-quiz-score-v1";
const DAILY_STORAGE_KEY = "fpl-predictor-quiz-daily-v1";
const PROGRESS_STORAGE_KEY = "fpl-predictor-quiz-progress-v1";

function formatKickoff(kickoffTime: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(kickoffTime));
}

function outcomeLabel(outcome: QuizOutcome, match: QuizMatch) {
  if (outcome === "home") {
    return `${match.homeTeam.shortName} win`;
  }
  if (outcome === "away") {
    return `${match.awayTeam.shortName} win`;
  }
  return "Draw";
}

function ClubBadge({ name, badgePath }: { name: string; badgePath: string | null }) {
  if (!badgePath) {
    return <div className="quiz-club-mark quiz-club-mark-fallback">{name.slice(0, 3).toUpperCase()}</div>;
  }
  return <Image src={badgePath} alt={name} width={64} height={64} className="quiz-club-mark-image" />;
}

type DotState = "hit" | "miss" | "current" | "pending";

function QuizSidebar({
  daily,
  dailyIndex,
  dailyResults,
  dailyTally,
  dailyRecord,
}: {
  daily: QuizMatch[];
  dailyIndex: number;
  /** Whether you called each daily match played so far this session. */
  dailyResults: boolean[];
  dailyTally: { user: number; model: number };
  dailyRecord: DailyRecord | null;
}) {
  const dots: DotState[] = daily.map((_, index) => {
    if (index < dailyResults.length) return dailyResults[index] ? "hit" : "miss";
    return index === dailyIndex ? "current" : "pending";
  });
  const dotLabel: Record<DotState, string> = {
    hit: "called it",
    miss: "missed",
    current: "current match",
    pending: "up next",
  };

  return (
    <aside className="quiz-side" aria-label="About Beat the Model">
      <section className="quiz-side-card">
        <p className="eyebrow">Today&apos;s five</p>
        {dailyRecord ? (
          <p className="quiz-side-copy">
            Done for today: <strong>You {dailyRecord.user}</strong> – <strong>{dailyRecord.model} Model</strong>. New
            matches at 00:00 UTC.
          </p>
        ) : (
          <>
            <ol className="quiz-dots">
              {dots.map((state, index) => (
                <li key={daily[index].matchId} className={`quiz-dot quiz-dot-${state}`}>
                  <span className="sr-only">
                    Match {index + 1}: {dotLabel[state]}
                  </span>
                </li>
              ))}
            </ol>
            <p className="quiz-side-copy">
              {dailyResults.length === 0
                ? "Five real matches, the same for everyone today. New set at 00:00 UTC."
                : `Today so far: You ${dailyTally.user} – ${dailyTally.model} Model.`}
            </p>
          </>
        )}
      </section>

      <section className="quiz-side-card">
        <p className="eyebrow">How it works</p>
        <ol className="quiz-steps">
          <li>
            <strong>See what the model saw.</strong> Elo ratings and recent xG, with the score hidden.
          </li>
          <li>
            <strong>Make your call.</strong> Home win, draw or away win.
          </li>
          <li>
            <strong>Reveal.</strong> The real score, plus the odds the model gave each outcome.
          </li>
        </ol>
        <p className="quiz-side-copy">
          You and the model are scored on the same matches, so it&apos;s a straight head-to-head. Your record stays in
          this browser.
        </p>
      </section>
    </aside>
  );
}

export function QuizGame({ candidates, daily: initialDaily }: { candidates: QuizMatch[]; daily: QuizMatch[] }) {
  const [mode, setMode] = useState<"daily" | "practice">("daily");
  // The page is prerendered, so its daily five reflects the build date; swap in today's on mount.
  const [daily, setDaily] = useState(initialDaily);
  const [dailyIndex, setDailyIndex] = useState(0);
  const [dailyRecord, setDailyRecord] = useState<DailyRecord | null>(null);
  // Your call on each daily match answered so far; saved so a reload can't replay scored matches.
  const [dailyPicks, setDailyPicks] = useState<QuizOutcome[]>([]);
  const [practiceMatch, setPracticeMatch] = useState<QuizMatch | null>(null);
  const [practiceSeen, setPracticeSeen] = useState<string[]>([]);
  const [answeredPick, setAnsweredPick] = useState<QuizOutcome | null>(null);
  const [score, setScore] = useState<ScoreState>({ user: 0, model: 0, played: 0 });

  useEffect(() => {
    try {
      const rawScore = window.localStorage.getItem(SCORE_STORAGE_KEY);
      if (rawScore) {
        const parsed = JSON.parse(rawScore) as ScoreState;
        if (typeof parsed.user === "number" && typeof parsed.model === "number" && typeof parsed.played === "number") {
          setScore(parsed);
        }
      }
    } catch {
      // Ignore corrupted storage and start fresh.
    }

    const today = todayKey();
    const todaysFive = dailyQuizMatches(candidates, today);
    setDaily(todaysFive);
    try {
      const rawDaily = window.localStorage.getItem(DAILY_STORAGE_KEY);
      const record = rawDaily ? (JSON.parse(rawDaily) as DailyRecord) : null;
      if (record?.date === today) {
        setDailyRecord(record);
        return;
      }
      const rawProgress = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
      const progress = rawProgress ? restoreDailyProgress(JSON.parse(rawProgress), today, todaysFive) : null;
      if (progress) {
        setDailyPicks(progress.picks);
        setDailyIndex(progress.index);
        setAnsweredPick(progress.picks[progress.index] ?? null);
      }
    } catch {
      // Ignore corrupted storage and start today's five fresh.
    }
  }, [candidates]);

  const tally = useMemo(() => tallyDailyPicks(daily, dailyPicks), [daily, dailyPicks]);

  function saveProgress(picks: QuizOutcome[], index: number) {
    const progress: DailyProgress = {
      date: todayKey(),
      matchIds: daily.map((match) => match.matchId),
      picks,
      index,
    };
    try {
      window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Storage unavailable; progress lasts for this visit only.
    }
  }

  const currentMatch: QuizMatch | null =
    mode === "daily" ? (dailyRecord ? null : (daily[dailyIndex] ?? null)) : practiceMatch;

  function persistScore(next: ScoreState) {
    setScore(next);
    try {
      window.localStorage.setItem(SCORE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable; keep the in-memory score.
    }
  }

  function pickRandomPracticeMatch(seen: string[]): QuizMatch | null {
    const fresh = candidates.filter((match) => !seen.includes(match.matchId));
    const pool = fresh.length > 0 ? fresh : candidates;
    if (pool.length === 0) {
      return null;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function handlePick(outcome: QuizOutcome) {
    if (!currentMatch || answeredPick) {
      return;
    }
    // A daily match can only be scored once, even after switching modes.
    if (mode === "daily" && dailyPicks.length > dailyIndex) {
      return;
    }
    setAnsweredPick(outcome);
    const actual = resolveOutcome(currentMatch);
    const userCorrect = actual !== null && outcome === actual;
    const modelCorrect = actual !== null && modelPick(currentMatch) === actual;
    persistScore({
      user: score.user + (userCorrect ? 1 : 0),
      model: score.model + (modelCorrect ? 1 : 0),
      played: score.played + 1,
    });
    if (mode === "daily") {
      const picks = [...dailyPicks, outcome];
      setDailyPicks(picks);
      saveProgress(picks, dailyIndex);
    }
  }

  function handleNext() {
    setAnsweredPick(null);
    if (mode === "daily") {
      if (dailyIndex + 1 < daily.length) {
        setDailyIndex(dailyIndex + 1);
        saveProgress(dailyPicks, dailyIndex + 1);
        return;
      }
      const record: DailyRecord = {
        date: todayKey(),
        user: tally.user,
        model: tally.model,
        total: daily.length,
      };
      try {
        window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(record));
        window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
      } catch {
        // Storage unavailable; the summary still shows for this session.
      }
      setDailyRecord(record);
      return;
    }
    const seen = practiceMatch ? [...practiceSeen, practiceMatch.matchId] : practiceSeen;
    setPracticeSeen(seen);
    setPracticeMatch(pickRandomPracticeMatch(seen));
  }

  function startPractice() {
    setMode("practice");
    setAnsweredPick(null);
    if (!practiceMatch) {
      setPracticeMatch(pickRandomPracticeMatch(practiceSeen));
    }
  }

  function resetScore() {
    persistScore({ user: 0, model: 0, played: 0 });
  }

  if (candidates.length === 0) {
    return (
      <section className="page-state-card">
        <h2>No quiz matches available</h2>
        <p>Finished matches with model probabilities will appear here once the dashboard data includes them.</p>
      </section>
    );
  }

  const actual = currentMatch ? resolveOutcome(currentMatch) : null;
  const modelOutcome = currentMatch ? modelPick(currentMatch) : null;
  const userCorrect = currentMatch && answeredPick && actual !== null && answeredPick === actual;
  const modelCorrect = currentMatch && actual !== null && modelOutcome === actual;

  return (
    <div className="quiz-layout">
      <section className="quiz-panel">
        <div className="quiz-toolbar">
          <div className="quiz-mode-toggle" role="group" aria-label="Quiz mode">
            <button
              className={mode === "daily" ? "quiz-mode-button quiz-mode-active" : "quiz-mode-button"}
              aria-pressed={mode === "daily"}
              onClick={() => {
                setMode("daily");
                // Coming back to an answered daily match shows its reveal again, not fresh picks.
                setAnsweredPick(dailyPicks[dailyIndex] ?? null);
              }}
            >
              Daily five
            </button>
            <button
              className={mode === "practice" ? "quiz-mode-button quiz-mode-active" : "quiz-mode-button"}
              aria-pressed={mode === "practice"}
              onClick={startPractice}
            >
              Practice
            </button>
          </div>
          <div className="quiz-scoreboard" aria-live="polite">
            {score.played > 0 ? (
              <span
                className={`verdict-badge ${score.user > score.model ? "verdict-correct" : score.user < score.model ? "verdict-incorrect" : "conf-wide-open"}`}
              >
                {score.user > score.model
                  ? "You beat the model"
                  : score.user < score.model
                    ? "Model leads"
                    : "All square"}
              </span>
            ) : null}
            <span className="quiz-score-chip quiz-score-you">
              You <strong>{score.user}</strong>
            </span>
            <span className="quiz-score-chip quiz-score-model">
              Model <strong>{score.model}</strong>
            </span>
            <span className="quiz-score-chip">
              Played <strong>{score.played}</strong>
            </span>
            <button className="quiz-reset" onClick={resetScore} title="Reset your all-time score">
              Reset
            </button>
          </div>
        </div>

        {mode === "daily" && dailyRecord ? (
          <article className="quiz-card quiz-summary-card">
            <p className="eyebrow">Daily five · complete</p>
            <h2 className="quiz-summary-title">
              You {dailyRecord.user} - {dailyRecord.model} Model
            </h2>
            <p className="quiz-summary-copy">
              {dailyRecord.user > dailyRecord.model
                ? "You beat the model today. Come back tomorrow for five new matches."
                : dailyRecord.user === dailyRecord.model
                  ? "Dead even with the model today. Come back tomorrow for a rematch."
                  : "The model edged you today. Come back tomorrow for a rematch."}
            </p>
            <button className="quiz-next-button" onClick={startPractice}>
              Keep practicing
            </button>
          </article>
        ) : currentMatch ? (
          <article className="quiz-card">
            <div className="quiz-card-topline">
              <span className="fixture-card-gw">
                MW {currentMatch.gameweek ?? "TBD"} · {currentMatch.season}
              </span>
              <span className="fixture-card-time">
                {mode === "daily" ? `Match ${dailyIndex + 1} of ${daily.length} · ` : ""}
                {formatKickoff(currentMatch.kickoffTime as string)}
              </span>
            </div>

            <div className="quiz-clubs">
              <div className="quiz-club">
                <ClubBadge name={currentMatch.homeTeam.name} badgePath={currentMatch.homeTeam.badgePath} />
                <p className="club-name">{currentMatch.homeTeam.name}</p>
                <p className="club-subline">Elo {currentMatch.preMatch.homeElo !== null ? Math.round(currentMatch.preMatch.homeElo) : "—"}</p>
              </div>
              <div className="fixture-versus">vs</div>
              <div className="quiz-club">
                <ClubBadge name={currentMatch.awayTeam.name} badgePath={currentMatch.awayTeam.badgePath} />
                <p className="club-name">{currentMatch.awayTeam.name}</p>
                <p className="club-subline">Elo {currentMatch.preMatch.awayElo !== null ? Math.round(currentMatch.preMatch.awayElo) : "—"}</p>
              </div>
            </div>

            <div className="fixture-context-grid quiz-context">
              <div>
                <span className="context-label">Last 5 xG</span>
                <strong>
                  {currentMatch.preMatch.homeLast5Xg ?? "—"} – {currentMatch.preMatch.awayLast5Xg ?? "—"}
                </strong>
              </div>
            </div>

            {!answeredPick ? (
              <>
                <p className="quiz-prompt">How did this one finish?</p>
                <div className="quiz-picks">
                  {(["home", "draw", "away"] as QuizOutcome[]).map((outcome) => (
                    <button key={outcome} className="quiz-pick-button" onClick={() => handlePick(outcome)}>
                      {outcomeLabel(outcome, currentMatch)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="quiz-reveal">
                <div className="quiz-final-score">
                  <span>{currentMatch.homeTeam.shortName}</span>
                  <strong>
                    {currentMatch.score.home} - {currentMatch.score.away}
                  </strong>
                  <span>{currentMatch.awayTeam.shortName}</span>
                </div>
                <p className={userCorrect ? "quiz-verdict quiz-verdict-good" : "quiz-verdict quiz-verdict-miss"}>
                  {userCorrect ? "You called it." : "Not this time."}{" "}
                  {modelCorrect ? "The model got it right too." : "The model missed this one as well."}
                </p>

                <div className="probability-list quiz-model-bars">
                  {(
                    [
                      { outcome: "home" as QuizOutcome, label: currentMatch.homeTeam.shortName, tone: "var(--prob-home)" },
                      { outcome: "draw" as QuizOutcome, label: "Draw", tone: "var(--prob-draw)" },
                      { outcome: "away" as QuizOutcome, label: currentMatch.awayTeam.shortName, tone: "var(--prob-away)" },
                    ]
                  ).map((bar) => (
                    <div
                      key={bar.outcome}
                      className={
                        bar.outcome === modelOutcome ? "probability-row probability-row-model" : "probability-row"
                      }
                    >
                      <div className="probability-label">
                        <span>
                          {bar.label}
                          {bar.outcome === modelOutcome ? <em className="quiz-model-tag">model pick</em> : null}
                        </span>
                        <strong>{formatPercent(outcomeProbability(currentMatch, bar.outcome))}</strong>
                      </div>
                      <div className="probability-track">
                        <div
                          className="probability-fill"
                          style={{
                            width: `${Math.max(8, outcomeProbability(currentMatch, bar.outcome) * 100)}%`,
                            background: bar.tone,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button className="quiz-next-button" onClick={handleNext}>
                  {mode === "daily" && dailyIndex + 1 >= daily.length ? "See today’s result" : "Next match"}
                </button>
              </div>
            )}
          </article>
        ) : null}
      </section>
      <QuizSidebar
        daily={daily}
        dailyIndex={dailyIndex}
        dailyResults={tally.results}
        dailyTally={tally}
        dailyRecord={dailyRecord}
      />
    </div>
  );
}
