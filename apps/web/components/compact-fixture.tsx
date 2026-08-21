import Link from "next/link";

import { TeamCrest } from "@/components/ui/crest";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import { describeConfidence } from "@/lib/confidence";
import type { UpcomingFixture } from "@/lib/dashboard";
import { formatKickoff, formatPercent } from "@/lib/format";

export function CompactFixture({ fixture }: { fixture: UpcomingFixture }) {
  const confidence = describeConfidence(fixture.probabilities);

  const lead =
    confidence.pick !== null && confidence.pick !== "draw"
      ? `${confidence.pick === "home" ? fixture.homeTeam.shortName : fixture.awayTeam.shortName} favored`
      : confidence.label;

  const leadValue =
    confidence.pick !== null && confidence.pick !== "draw"
      ? formatPercent(
          confidence.pick === "home"
            ? fixture.probabilities.homeWin
            : fixture.probabilities.awayWin,
        )
      : null;

  return (
    <Link href="/predictions" className="upcoming-row">
      <div className="upcoming-row-time">{formatKickoff(fixture.kickoffTime)}</div>

      <div className="upcoming-row-teams">
        <div className="upcoming-row-team">
          <TeamCrest name={fixture.homeTeam.name} badgePath={fixture.homeTeam.badgePath} size={26} />
          <span>{fixture.homeTeam.shortName}</span>
        </div>
        <span className="upcoming-row-vs">vs</span>
        <div className="upcoming-row-team upcoming-row-team-away">
          <span>{fixture.awayTeam.shortName}</span>
          <TeamCrest name={fixture.awayTeam.name} badgePath={fixture.awayTeam.badgePath} size={26} />
        </div>
      </div>

      <div className="upcoming-row-bar">
        <ProbabilityBar
          probabilities={fixture.probabilities}
          homeShort={fixture.homeTeam.shortName}
          awayShort={fixture.awayTeam.shortName}
          size="sm"
        />
        <span className="upcoming-row-lead">
          {lead}
          {leadValue ? ` · ${leadValue}` : ""}
        </span>
      </div>
    </Link>
  );
}
