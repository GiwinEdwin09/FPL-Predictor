"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { browserSupabase } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

export function SignInForm() {
  const { user, loading, configured } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("error")) {
      setMessage("That sign-in link could not be verified. Request a new link and open it in this browser.");
    }
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const { error } = await browserSupabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setSent(true);
    } catch {
      setMessage("We couldn’t send a sign-in link. Check your address and try again shortly.");
    } finally { setBusy(false); }
  }
  if (!configured) return <div className="account-card"><h2>Account saving is being set up</h2><p>Sign-in will be available when the account service is connected. You can still explore forecasts and try lineups.</p><Link href="/predictions">Explore predictions →</Link></div>;
  if (loading) return <p role="status">Checking your account…</p>;
  if (user) return <div className="account-card"><h2>You’re signed in</h2><p>{user.email}</p><Link className="cta-primary" href="/my-lineups">Open my lineups →</Link></div>;
  return <form className="account-card account-form" onSubmit={submit}>
    <h2>{sent ? "Check your inbox" : "Sign in with your email"}</h2>
    <p>{sent ? "Open the link in your email in this browser to finish signing in. Your first sign-in creates your account." : "We’ll email you a secure sign-in link. No password to remember. New here? Your first sign-in creates your account."}</p>
    <label htmlFor="account-email">Email address</label>
    <input id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
    <button className="cta-primary" disabled={busy} type="submit">{busy ? "Sending…" : sent ? "Send another link" : "Email me a sign-in link"}</button>
    <p className="account-note">Saved lineups are private to your account. Signing out won’t delete them.</p>
    {message ? <p role="alert" className="lineup-error">{message}</p> : null}
    {sent ? <p role="status">Sign-in link requested for {email}.</p> : null}
  </form>;
}
