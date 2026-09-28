"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";

export function browserSupabase() {
  const config = supabaseConfig();
  if (!config) throw new Error("Account saving is not configured yet.");
  return createBrowserClient(config.url, config.key);
}
