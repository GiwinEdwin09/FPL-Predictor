"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { browserSupabase } from "@/lib/supabase/client";

export function AccountNav() {
  const { user, loading } = useAuth();
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
  if (loading) return <span className="account-loading">Account…</span>;
  return <div className="account-nav">
    <Link className="account-link" href={user ? "/my-lineups" : "/sign-in"}>
      {user ? "My lineups" : "Sign in"}
    </Link>
    {user ? <button type="button" className="account-signout" disabled={busy} onClick={() => void signOut()}>
      {busy ? "Signing out…" : "Sign out"}
    </button> : null}
    {error ? <span role="alert">{error}</span> : null}
  </div>;
}
