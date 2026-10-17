import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";

const MIDDLEWARE_AUTH_TIMEOUT_MS = 3000;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = supabaseConfig();
  if (config) {
    const supabase = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(values) {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Access is also verified in every private route; middleware is not an authorization boundary.
    // Bounded so an unreachable auth service (supabase-js retries refreshes for ~25s) can't stall pages.
    await Promise.race([
      supabase.auth.getUser().catch(() => null),
      new Promise((resolve) => setTimeout(resolve, MIDDLEWARE_AUTH_TIMEOUT_MS)),
    ]);
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}

export const config = {
  matcher: ["/account", "/my-lineups/:path*", "/sign-in", "/auth/:path*", "/api/scenarios/:path*"],
};
