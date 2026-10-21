import Link from "next/link";

import type { HistoricalMatch } from "@/lib/dashboard";
import { replayCoverage } from "@/lib/replays";

/** Warns that a season's grading is flattered when its forecasts replay matches the model trained on. */
export function ReplayNote({
  season,
  matches,
  trainingCutoffUtc,
}: {
  season: string;
  matches: HistoricalMatch[];
  trainingCutoffUtc: string;
}) {
  const { graded, inSample } = replayCoverage(matches, trainingCutoffUtc);
  if (inSample === 0) {
    return null;
  }

  return (
    <section className="lab-season-banner replay-note" aria-label="Retrospective replay">
      <div className="lab-season-heading">
        <span>Retrospective replay</span>
        <strong>{season.replace("-", "/")}</strong>
      </div>
      <p>
        {inSample === graded
          ? "Forecasts for this season are retrospective replays"
          : `${inSample} of ${graded} forecasts this season are retrospective replays`}{" "}
        by a model trained on these results, so grading flatters it. For{" "}
        <strong>honest out-of-sample numbers</strong>, see the <Link href="/model-lab">Model Lab</Link>.
      </p>
    </section>
  );
}
