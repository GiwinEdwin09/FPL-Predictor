import { NextRequest, NextResponse } from "next/server";

import { backendUrl } from "@/lib/backend-api";

type RouteContext = {
  params: Promise<{
    matchId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { matchId } = await context.params;
  const search = request.nextUrl.searchParams.toString();
  const response = await fetch(
    backendUrl(`/api/v1/fixtures/${encodeURIComponent(matchId)}/lineup-context${search ? `?${search}` : ""}`),
    {
      cache: "no-store",
    },
  );

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
