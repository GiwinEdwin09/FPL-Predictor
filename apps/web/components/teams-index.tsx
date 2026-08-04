"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { QuizMatch } from "@/lib/quiz";
import { buildStandings } from "@/lib/teams";

function ClubBadge({ name, badgePath }: { name: string; badgePath: string | null }) {
  if (!badgePath) {
    return <span className="team-badge team-badge-fallback">{name.slice(0, 3).toUpperCase()}</span>;
  }
  return <Image src={badgePath} alt={name} width={34} height={34} className="team-badge-image" />;
}

export function TeamsIndex({ matches }: { matches: QuizMatch[] }) {
  const seasons = useMemo(() => Array.from(new Set(matches.map((match) => match.season))).sort().reverse(), [matches]);
  const [season, setSeason] = useState(seasons[0] ?? "2025-2026");

  const standings = useMemo(
    () => buildStandings(matches.filter((match) => match.season === season)),
    [matches, season],
  );

  return (
    <div className="insights-stack">
      <div className="history-controls">
        <label className="toolbar-field toolbar-select">
          <span>Season</span>
          <select value={season} onChange={(event) => setSeason(event.target.value)}>
            {seasons.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th scope="col" className="standings-rank">#</th>
              <th scope="col">Club</th>
              <th scope="col" className="standings-num">P</th>
              <th scope="col" className="standings-num">W</th>
              <th scope="col" className="standings-num">D</th>
              <th scope="col" className="standings-num">L</th>
              <th scope="col" className="standings-num standings-hide-sm">GF</th>
              <th scope="col" className="standings-num standings-hide-sm">GA</th>
              <th scope="col" className="standings-num">GD</th>
              <th scope="col" className="standings-num">Pts</th>
              <th scope="col" className="standings-num standings-hide-sm">Model hit rate</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => (
              <tr key={row.team.badgeSlug}>
                <td className="standings-rank">{index + 1}</td>
                <td>
                  <Link href={`/teams/${row.team.badgeSlug}`} className="standings-club">
                    <ClubBadge name={row.team.name} badgePath={row.team.badgePath} />
                    <span>{row.team.name}</span>
                  </Link>
                </td>
                <td className="standings-num">{row.played}</td>
                <td className="standings-num">{row.wins}</td>
                <td className="standings-num">{row.draws}</td>
                <td className="standings-num">{row.losses}</td>
                <td className="standings-num standings-hide-sm">{row.goalsFor}</td>
                <td className="standings-num standings-hide-sm">{row.goalsAgainst}</td>
                <td className="standings-num">{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
                <td className="standings-num standings-points">{row.points}</td>
                <td className="standings-num standings-hide-sm">
                  {row.modelAccuracy === null ? "—" : `${Math.round(row.modelAccuracy * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
