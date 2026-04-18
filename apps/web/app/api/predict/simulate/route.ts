import { NextRequest, NextResponse } from "next/server";

import { backendUrl } from "@/lib/backend-api";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const response = await fetch(backendUrl("/api/v1/predict/simulate"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body,
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
