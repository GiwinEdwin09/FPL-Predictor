"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import type { UpcomingFixture } from "@/lib/dashboard";
import type { SavedScenario } from "@/lib/scenarios";

type Props = { fixture: UpcomingFixture; homePlayerIds: number[]; awayPlayerIds: number[] };

export function SaveLineup(props: Props) {
  const { user, loading, configured } = useAuth();
  if (loading) return <p className="account-note">Checking your account…</p>;
  if (!configured) return <p className="account-note">Account saving is being set up. Your current selections are temporary.</p>;
  if (!user) return <div className="save-lineup"><strong>Keep this idea for later.</strong><p>Sign in before building a lineup you want to save across devices.</p><Link href="/sign-in">Sign in to save lineups →</Link></div>;
  return <SaveLineupForm key={user.id} {...props} />;
}

function SaveLineupForm({ fixture, homePlayerIds, awayPlayerIds }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<SavedScenario | null>(null);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSaved(null);
    const payload = { name: name.trim(), season: fixture.season, matchId: fixture.matchId, homePlayerIds, awayPlayerIds };
    const key = JSON.stringify(payload);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/scenarios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, id: attempt.current.id }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to save this lineup.");
      setSaved(result.scenario); attempt.current = null;
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save. Your selection is still here."); }
    finally { setBusy(false); }
  }
  return <form className="save-lineup account-form" onSubmit={save}>
    <div><strong>Save a private lineup</strong><p>Keep this selection in your account. Each save creates a separate scenario.</p></div>
    <label>Scenario name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="e.g. Strongest XI" disabled={busy} /></label>
    <button type="submit" className="cta-primary" disabled={busy || homePlayerIds.length !== 11 || awayPlayerIds.length !== 11}>{busy ? "Saving…" : "Save lineup"}</button>
    {error ? <p role="alert" className="lineup-error">{error}</p> : null}
    {saved ? <p role="status">Saved “{saved.name}” to your account. <Link href={`/my-lineups/${saved.id}`}>Open saved lineup →</Link></p> : null}
  </form>;
}
