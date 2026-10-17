import { NextRequest, NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/supabase/config";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  // Only same-site paths, so the link can't bounce users to another origin.
  const next = request.nextUrl.searchParams.get("next");
  const destination = next && /^\/(?![/\\])/.test(next) ? next : "/my-lineups";
  if (code && supabaseConfig()) {
    const supabase = await serverSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, request.url), { headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.redirect(new URL("/sign-in?error=link", request.url), { headers: { "Cache-Control": "private, no-store" } });
}
