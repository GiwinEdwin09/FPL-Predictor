import { NextRequest } from "next/server";

import { proxyBackend } from "@/lib/backend-api";

export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyBackend("/api/v1/predict/simulate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body,
  });
}
