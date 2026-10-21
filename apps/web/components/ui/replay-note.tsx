import Link from "next/link";

import type { HistoricalMatch } from "@/lib/dashboard";
import { replayCoverage } from "@/lib/replays";

function listSeasons(seasons: string[]): string {
  const labels = seasons.map((season) => season.replace("-", "/"));
  return labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** Warns that grading is flattered where the graded forecasts replay matches the model trained on. */
export function ReplayNote({ matches, trainingCutoffUtc }: { matches: HistoricalMatch[]; trainingCutoffUtc: string }) {
  const { seasons, graded, inSample } = replayCoverage(matches, trainingCutoffUtc);
  if (inSample === 0) {
    return null;
  }
  const label = listSeasons(seasons);

  return (
    <section className="lab-season-banner replay-note" aria-label="Retrospective replay">
      <div className="lab-season-heading">
        <span>Retrospective replay</span>
        <strong>{label}</strong>
      </div>
      <p>
        {inSample === graded ? `Forecasts for ${label} are` : `${inSample} of ${graded} forecasts for ${label} are`}{" "}
        retrospective replays by a model trained on these results, so grading flatters it. For{" "}
        <strong>honest out-of-sample numbers</strong>, see the <Link href="/model-lab">Model Lab</Link>.
      </p>
    </section>
  );
}
