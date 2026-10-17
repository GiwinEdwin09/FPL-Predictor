"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth-provider";
import { browserSupabase } from "@/lib/supabase/client";

export function displayName(user: User) {
  const name = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
  return name || null;
}

export function SignOutButton({ className = "account-signout", scope = "local", label = "Sign out", role }: {
  className?: string; scope?: "local" | "global"; label?: string; role?: "menuitem";
}) {
  const { user } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true); setError("");
    try {
      const { error } = await browserSupabase().auth.signOut({ scope });
      if (error) throw error;
      // Full navigation discards private client state and the Next.js router cache.
      window.location.replace("/");
    } catch { setError("Unable to sign out. Please retry."); setBusy(false); }
  }
  if (!user) return null;
  return <>
    <button type="button" role={role} className={className} disabled={busy} onClick={() => void signOut()}>
      {busy ? "Signing out…" : label}
    </button>
    {error ? <span role="alert" className="account-note">{error}</span> : null}
  </>;
}

const icon = <svg className="account-link-icon" viewBox="0 0 16 16" aria-hidden="true">
  <circle cx="8" cy="5.5" r="2.75" />
  <path d="M2.75 13.5c.6-2.4 2.7-4 5.25-4s4.65 1.6 5.25 4" />
</svg>;

export function AccountNav() {
  const { user, loading, unavailable } = useAuth();
  // Hidden "Sign in" pill keeps the header from flashing text or shifting while auth resolves.
  if (loading) return <span className="account-link account-link-pending" aria-hidden="true">{icon}<span>Sign in</span></span>;
  if (unavailable) return <Link className="account-link" href="/account" title="Accounts are temporarily unavailable">{icon}Account</Link>;
  if (!user) return <Link className="account-link" href="/sign-in">{icon}Sign in</Link>;
  return <AccountMenu user={user} />;
}

function AccountMenu({ user }: { user: User }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const name = displayName(user);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); root.current?.querySelector<HTMLButtonElement>(".account-link")?.focus(); }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return <div className="account-nav" ref={root}>
    <button type="button" className="account-link" aria-haspopup="menu" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen((value) => !value)}>
      {icon}
      <span className="account-link-label">{name ?? "Account"}</span>
      <svg className="account-link-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5l3-3" /></svg>
    </button>
    {open ? <div id="account-menu" className="account-menu" role="menu" aria-label="Account">
      <div className="account-menu-head">
        <strong>{name ?? "Signed in"}</strong>
        <span>{user.email}</span>
      </div>
      <Link role="menuitem" className="account-menu-item" href="/account">Account settings</Link>
      <Link role="menuitem" className="account-menu-item" href="/my-lineups">My lineups</Link>
      <div className="account-menu-divider" role="separator" />
      <SignOutButton role="menuitem" className="account-menu-item account-menu-signout" />
    </div> : null}
  </div>;
}
