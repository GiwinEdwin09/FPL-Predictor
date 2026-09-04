import { NextRequest } from "next/server";

import { proxyBackend } from "@/lib/backend-api";

type RouteContext = {
  params: Promise<{
    matchId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { matchId } = await context.params;
  const search = request.nextUrl.searchParams.toString();
  return proxyBackend(
    `/api/v1/fixtures/${encodeURIComponent(matchId)}/lineup-context${search ? `?${search}` : ""}`,
  );
}
