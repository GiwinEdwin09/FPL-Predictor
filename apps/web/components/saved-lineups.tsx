"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { SavedScenario } from "@/lib/scenarios";

export function SavedLineups() {
  const { user, loading, configured } = useAuth();
  if (loading) return <p role="status">Checking your account…</p>;
  if (!configured || !user) return <div className="account-card"><h2>{configured ? "A place for your own lineups" : "Account saving is being set up"}</h2><p>Sign in to see your saved scenarios. They stay in your account when you sign out.</p><Link className="cta-primary" href="/sign-in">Sign in →</Link></div>;
  return <LineupList key={user.id} email={user.email ?? "your account"} />;
}

function LineupList({ email }: { email: string }) {
  const [archived, setArchived] = useState(false);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<SavedScenario[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRows([]);
    void fetch(`/api/scenarios?archived=${archived}&page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); return result; })
      .then((result) => { if (!controller.signal.aborted) { setRows(result.scenarios); setMore(result.hasMore); } })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message || "Unable to load your lineups."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [archived, page, revision]);
  async function update(row: SavedScenario, change: { name: string } | { archived: boolean }) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/scenarios/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version: row.version, ...change }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage("name" in change ? "Lineup renamed." : change.archived ? "Lineup archived. You can restore it from Archived." : "Lineup restored.");
      setRevision((value) => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save the change."); }
    finally { setBusy(false); }
  }
  return <section className="saved-lineups">
    <div className="saved-toolbar"><p className="account-note">Private to {email}</p><Link href="/predictions">Create a lineup →</Link></div>
    <div className="quiz-mode-toggle" role="group" aria-label="Saved lineup view">
      {[false, true].map((value) => <button type="button" key={String(value)} aria-pressed={archived === value} className={`quiz-mode-button ${archived === value ? "quiz-mode-active" : ""}`} onClick={() => { setArchived(value); setPage(0); }} disabled={busy}>{value ? "Archived" : "Saved"}</button>)}
    </div>
    {message ? <p role="status">{message}</p> : null}
    {error ? <div role="alert"><p className="lineup-error">{error}</p><button className="lineup-reset-button" onClick={() => setRevision((value) => value + 1)}>Refresh list</button></div> : null}
    {loading ? <p role="status">Loading your lineups…</p> : rows.length === 0 && !error ? <div className="account-card"><h2>{archived ? "Your archive is empty" : "Your next idea starts here"}</h2><p>{archived ? "Archived lineups remain available to restore." : "Open a future fixture, edit its lineup, and save your selection with a name."}</p><Link href="/predictions">Explore fixtures →</Link></div> : null}
    <div className="saved-lineup-grid">{rows.map((row) => <SavedLineupRow key={`${row.id}:${row.version}`} row={row} busy={busy} onUpdate={update} />)}</div>
    <div className="saved-toolbar"><button className="lineup-reset-button" disabled={page === 0 || loading || busy} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className="lineup-reset-button" disabled={!more || loading || busy} onClick={() => setPage(page + 1)}>Next</button></div>
  </section>;
}

function SavedLineupRow({ row, busy, onUpdate }: { row: SavedScenario; busy: boolean; onUpdate: (row: SavedScenario, change: { name: string } | { archived: boolean }) => Promise<void> }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(row.name);
  return <article className="account-card saved-lineup-card">
    <p className="page-eyebrow">{row.season.replace("-", "/")} · Private</p>
    <h2><Link href={`/my-lineups/${row.id}`}>{row.name}</Link></h2>
    <p>{row.home_team_name} vs {row.away_team_name}</p>
    <p className="account-note">Saved {new Date(row.created_at).toLocaleDateString()}</p>
    {renaming ? <form className="account-form" onSubmit={(event) => { event.preventDefault(); void onUpdate(row, { name }); }}><label>New name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required /></label><div className="fixture-action-buttons"><button className="lineup-toggle-button" disabled={busy}>Save name</button><button className="lineup-reset-button" type="button" onClick={() => setRenaming(false)}>Cancel</button></div></form> : <div className="fixture-action-buttons"><Link className="lineup-toggle-button" href={`/my-lineups/${row.id}`}>Open</Link><button className="lineup-reset-button" disabled={busy} onClick={() => setRenaming(true)}>Rename</button><button className="lineup-reset-button" disabled={busy} onClick={() => void onUpdate(row, { archived: !row.archived_at })}>{row.archived_at ? "Restore" : "Archive"}</button></div>}
  </article>;
}
