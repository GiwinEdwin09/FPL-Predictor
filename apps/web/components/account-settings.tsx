"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth-provider";
import { SignOutButton, displayName } from "@/components/account-nav";
import { browserSupabase } from "@/lib/supabase/client";

const dateFormat: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function AccountSettings() {
  const { user, loading, configured } = useAuth();
  if (loading) return <p role="status">Checking your account…</p>;
  if (!configured || !user) return <div className="account-card"><h2>{configured ? "You’re not signed in" : "Account saving is being set up"}</h2><p>Sign in to see your account details and saved lineups.</p><Link className="cta-primary" href="/sign-in">Sign in →</Link></div>;
  return <div className="account-settings" key={user.id}>
    <ProfileCard user={user} />
    <EmailCard user={user} />
    <section className="account-card">
      <h2>Sign out</h2>
      <p>Signing out won’t delete your saved lineups. Use “Sign out everywhere” if you’ve signed in on a shared or lost device.</p>
      <div className="account-actions">
        <SignOutButton />
        <SignOutButton scope="global" label="Sign out everywhere" />
      </div>
    </section>
  </div>;
}

function ProfileCard({ user }: { user: User }) {
  const [name, setName] = useState(displayName(user) ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const saved = displayName(user) ?? "";
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const { error } = await browserSupabase().auth.updateUser({ data: { display_name: name.trim() || null } });
      if (error) throw error;
      setName(name.trim());
      setMessage(name.trim() ? "Display name saved." : "Display name removed.");
    } catch { setError("We couldn’t save your name. Please try again."); }
    finally { setBusy(false); }
  }
  const joined = new Date(user.created_at).toLocaleDateString(undefined, dateFormat);
  const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString(undefined, dateFormat) : "—";
  return <section className="account-card">
    <h2>Profile</h2>
    <dl className="account-details">
      <div><dt>Email</dt><dd>{user.email}</dd></div>
      <div><dt>Member since</dt><dd>{joined}</dd></div>
      <div><dt>Last sign-in</dt><dd>{lastSignIn}</dd></div>
      <div><dt>Sign-in method</dt><dd>Email link</dd></div>
    </dl>
    <form className="account-form" onSubmit={save}>
      <label htmlFor="account-display-name">Display name</label>
      <input id="account-display-name" value={name} maxLength={40} autoComplete="nickname" placeholder="How should we greet you?" onChange={(event) => setName(event.target.value)} />
      <button className="cta-primary" type="submit" disabled={busy || name.trim() === saved}>{busy ? "Saving…" : "Save name"}</button>
      {message ? <p role="status" className="account-note">{message}</p> : null}
      {error ? <p role="alert" className="lineup-error">{error}</p> : null}
    </form>
    <p className="account-note"><Link href="/my-lineups">View my saved lineups →</Link></p>
  </section>;
}

function EmailCard({ user }: { user: User }) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(user.new_email ?? "");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    const next = email.trim();
    try {
      const { error } = await browserSupabase().auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` },
      );
      if (error) throw error;
      setSentTo(next); setEditing(false); setEmail("");
    } catch { setError("We couldn’t start the email change. Check the address and try again."); }
    finally { setBusy(false); }
  }
  return <section className="account-card">
    <h2>Email address</h2>
    <p>You sign in with links sent to <strong>{user.email}</strong>.</p>
    {sentTo ? <p role="status" className="account-note">Change to {sentTo} is pending. Open the confirmation link we emailed to finish. You may need to confirm from both addresses.</p> : null}
    {editing ? <form className="account-form" onSubmit={submit}>
      <label htmlFor="account-new-email">New email address</label>
      <input id="account-new-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <div className="account-actions">
        <button className="cta-primary" type="submit" disabled={busy || email.trim().toLowerCase() === user.email?.toLowerCase()}>{busy ? "Sending…" : "Send confirmation"}</button>
        <button className="account-signout" type="button" onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
      </div>
    </form> : <button className="account-signout" type="button" onClick={() => setEditing(true)}>Change email</button>}
    {error ? <p role="alert" className="lineup-error">{error}</p> : null}
  </section>;
}
