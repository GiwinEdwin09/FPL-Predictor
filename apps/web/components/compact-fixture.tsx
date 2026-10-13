"use client";

import Link from "next/link";

import { ModelVerdict } from "@/components/ui/badges";
import { TeamCrest } from "@/components/ui/crest";
import { DayGroups, LocalTime } from "@/components/ui/local-time";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import type { UpcomingFixture } from "@/lib/dashboard";
import { fixtureHref } from "@/lib/fixture-link";

export function CompactFixture({ fixture }: { fixture: UpcomingFixture }) {
  const { homeTeam, awayTeam } = fixture;

  return (
    <Link href={fixtureHref(fixture.matchId)} className="upcoming-row">
      <div className="upcoming-row-time">
        <LocalTime value={fixture.kickoffTime} variant="time" />
      </div>

      <div className="upcoming-row-teams">
        <div className="upcoming-row-team">
          <TeamCrest name={homeTeam.name} badgePath={homeTeam.badgePath} size={26} />
          <span>{homeTeam.shortName}</span>
        </div>
        <span className="upcoming-row-vs">vs</span>
        <div className="upcoming-row-team upcoming-row-team-away">
          <span>{awayTeam.shortName}</span>
          <TeamCrest name={awayTeam.name} badgePath={awayTeam.badgePath} size={26} />
        </div>
      </div>

      <div className="upcoming-row-bar">
        <ProbabilityBar
          probabilities={fixture.probabilities}
          homeShort={homeTeam.shortName}
          awayShort={awayTeam.shortName}
          size="sm"
        />
        <ModelVerdict probabilities={fixture.probabilities} homeShort={homeTeam.shortName} awayShort={awayTeam.shortName} />
      </div>
    </Link>
  );
}

/** Compact fixture rows under a heading for each of the viewer's calendar days. */
export function CompactFixtureList({ fixtures }: { fixtures: UpcomingFixture[] }) {
  return <DayGroups fixtures={fixtures}>{(fixture) => <CompactFixture fixture={fixture} />}</DayGroups>;
}
