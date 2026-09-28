"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { CustomizableFutureFixtureCard } from "@/components/customizable-future-fixture-card";
import type { SavedScenario } from "@/lib/scenarios";
import type { UpcomingFixture } from "@/lib/dashboard";

export function SavedLineupDetail({ id }: { id: string }) {
  const { user, loading, configured } = useAuth();
  if (loading) return <p role="status">Checking your account…</p>;
  if (!configured || !user) return <div className="account-card"><h1>Sign in to open your lineup</h1><p>Only the account that saved this lineup can open it.</p><Link href="/sign-in">Sign in →</Link></div>;
  return <Detail key={`${user.id}:${id}`} id={id} />;
}

function Detail({ id }: { id: string }) {
  const [scenario, setScenario] = useState<SavedScenario | null>(null);
  const [fixture, setFixture] = useState<UpcomingFixture | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/scenarios/${encodeURIComponent(id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then((result) => { if (!controller.signal.aborted) setScenario(result.scenario); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  async function open() {
    if (!scenario) return;
    setOpening(true); setError("");
    try {
      const response = await fetch(`/api/fixtures/${encodeURIComponent(scenario.match_id)}/lineup-context`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("The simulator is unavailable for this fixture. Your saved selection is still shown below.");
      const context = await response.json();
      if (context.match.season !== scenario.season) throw new Error("This fixture belongs to a different season. Your saved lineup is preserved below.");
      setFixture(context.match);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to open the simulator."); }
    finally { setOpening(false); }
  }
  return <>
    <Link href="/my-lineups">← My lineups</Link>
    {loading ? <p role="status">Loading your saved lineup…</p> : null}
    {error ? <p role="alert" className="lineup-error">{error}</p> : null}
    {scenario ? <>
      <header className="page-head"><p className="page-eyebrow">Private scenario{scenario.archived_at ? " · Archived" : ""}</p><h1 className="page-title">{scenario.name}</h1><p className="page-lede">{scenario.home_team_name} vs {scenario.away_team_name} · {scenario.season.replace("-", "/")}</p><p className="account-note">Saved {new Date(scenario.created_at).toLocaleString()}. Your original selection stays here when you experiment.</p></header>
      <div className="saved-lineup-grid">{(["home", "away"] as const).map((side) => <section className="account-card" key={side}><h2>{scenario[`${side}_team_name`]}</h2><ol className="saved-player-list">{scenario[`${side}_player_names`].map((name, index) => <li key={index}>{name}</li>)}</ol></section>)}</div>
      <div className="account-card"><h2>Try this lineup again</h2><p>Reopening calculates a forecast using the latest available model and data. It is not the forecast from the day you saved this lineup. Changes can be saved as a new scenario.</p><button className="cta-primary" disabled={opening} onClick={() => void open()}>{opening ? "Opening…" : "Reopen in simulator"}</button></div>
      {fixture ? <CustomizableFutureFixtureCard key={scenario.id} fixture={fixture} initialScenario={scenario} /> : null}
    </> : null}
  </>;
}
