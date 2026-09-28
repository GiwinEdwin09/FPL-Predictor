import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" } });
}

export async function scenarioAccount() {
  if (!supabaseConfig()) return { error: privateJson({ error: "Account saving is not configured yet." }, 503) } as const;
  const supabase = await serverSupabase();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: privateJson({ error: "Sign in to access your lineups." }, 401) } as const;
  return { supabase, user } as const;
}

export async function mutationBody(request: NextRequest) {
  // Browser cookie-authenticated writes must originate from this application.
  if (request.headers.get("origin") !== request.nextUrl.origin) throw new Error("Invalid request origin.");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("Expected JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 8192) { await reader.cancel(); throw new Error("Scenario is too large."); }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
