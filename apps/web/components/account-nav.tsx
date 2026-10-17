"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { browserSupabase } from "@/lib/supabase/client";

export function SignOutButton({ className = "account-signout" }: { className?: string }) {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true); setError("");
    try {
      const { error } = await browserSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
      // Full navigation discards private client state and the Next.js router cache.
      window.location.replace("/");
    } catch { setError("Unable to sign out. Please retry."); setBusy(false); }
  }
  if (!user) return null;
  return <>
    <button type="button" className={className} disabled={busy} onClick={() => void signOut()}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
    {error ? <span role="alert" className="account-note">{error}</span> : null}
  </>;
}

export function AccountNav() {
  const { user, loading } = useAuth();
  const icon = <svg className="account-link-icon" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 13.5c.6-2.4 2.7-4 5.25-4s4.65 1.6 5.25 4" />
  </svg>;
  // Hidden "Sign in" pill keeps the header from flashing text or shifting while auth resolves.
  if (loading) return <span className="account-link account-link-pending" aria-hidden="true">{icon}<span>Sign in</span></span>;
  return <div className="account-nav">
    <Link className="account-link" href={user ? "/my-lineups" : "/sign-in"}>
      {icon}
      {user ? "My lineups" : "Sign in"}
    </Link>
    <SignOutButton />
  </div>;
}
