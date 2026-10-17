"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isAuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/client";
import { supabaseConfig } from "@/lib/supabase/config";

// supabase-js retries a failed token refresh for a long time before settling,
// so stop waiting after this and let the UI explain the outage instead.
const AUTH_TIMEOUT_MS = 6000;

const AuthContext = createContext<{ user: User | null; loading: boolean; configured: boolean; unavailable: boolean }>({
  user: null, loading: true, configured: false, unavailable: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(supabaseConfig());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    if (!configured) return;
    const client = browserSupabase();
    let active = true;
    let revision = 0;
    const settle = (next: User | null) => {
      clearTimeout(timeout);
      setUser(next); setUnavailable(false); setLoading(false);
    };
    const timeout = setTimeout(() => {
      if (active) { setUnavailable(true); setLoading(false); }
    }, AUTH_TIMEOUT_MS);
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      revision += 1;
      if (active) settle(session?.user ?? null);
    });
    const initialRevision = revision;
    void client.auth.getUser().then(({ data, error }) => {
      if (!active || revision !== initialRevision) return;
      if (error && isAuthRetryableFetchError(error)) { clearTimeout(timeout); setUnavailable(true); setLoading(false); return; }
      settle(data.user);
    }).catch(() => { if (active) { clearTimeout(timeout); setUnavailable(true); setLoading(false); } });
    return () => { active = false; clearTimeout(timeout); subscription.unsubscribe(); };
  }, [configured]);
  return <AuthContext.Provider value={{ user, loading, configured, unavailable }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
