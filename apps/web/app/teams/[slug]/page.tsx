import Link from "next/link";
import { notFound } from "next/navigation";

import { TeamView } from "@/components/team-view";
import { loadDashboardResult } from "@/lib/dashboard";
import { pickQuizCandidates } from "@/lib/quiz";
import { collectTeams } from "@/lib/teams";

export async function generateStaticParams() {
  const result = await loadDashboardResult();
  if (!result.ok) {
    return [];
  }
  const matches = pickQuizCandidates(result.data.historicalMatches);
  return collectTeams(matches).map((team) => ({ slug: team.badgeSlug }));
}

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const result = await loadDashboardResult();

  if (!result.ok) {
    return (
      <div className="page-shell">
        <section className="page-state-card page-state-error" role="alert">
          <h2>Unable to load team data</h2>
          <p>{result.errorMessage}</p>
        </section>
      </div>
    );
  }

  const matches = pickQuizCandidates(result.data.historicalMatches);
  const team = collectTeams(matches).find((candidate) => candidate.badgeSlug === slug);
  if (!team) {
    notFound();
  }

  return (
    <div className="page-shell">
      <nav className="team-breadcrumb" aria-label="Breadcrumb">
        <Link href="/teams" className="section-link">
          ← All teams
        </Link>
      </nav>
      <TeamView team={team} matches={matches} />
    </div>
  );
}
