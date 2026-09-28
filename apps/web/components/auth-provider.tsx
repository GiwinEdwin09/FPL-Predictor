"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { browserSupabase } from "@/lib/supabase/client";
import { supabaseConfig } from "@/lib/supabase/config";

const AuthContext = createContext<{ user: User | null; loading: boolean; configured: boolean }>({
  user: null, loading: true, configured: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = Boolean(supabaseConfig());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  useEffect(() => {
    if (!configured) return;
    const client = browserSupabase();
    let active = true;
    let revision = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      revision += 1;
      if (active) { setUser(session?.user ?? null); setLoading(false); }
    });
    const initialRevision = revision;
    void client.auth.getUser().then(({ data }) => {
      if (active && revision === initialRevision) { setUser(data.user); setLoading(false); }
    }).catch(() => { if (active) setLoading(false); });
    return () => { active = false; subscription.unsubscribe(); };
  }, [configured]);
  return <AuthContext.Provider value={{ user, loading, configured }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
