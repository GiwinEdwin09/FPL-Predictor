import { NextResponse } from "next/server";

function trimmedBaseUrl() {
  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) {
    throw new Error("API_BASE_URL is not configured for the web app.");
  }
  return baseUrl.replace(/\/$/, "");
}

function backendUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${trimmedBaseUrl()}${normalizedPath}`;
}

export async function proxyBackend(path: string, init?: RequestInit) {
  const response = await fetch(backendUrl(path), { ...init, cache: "no-store" });
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
