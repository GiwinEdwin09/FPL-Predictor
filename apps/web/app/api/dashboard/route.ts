import { NextResponse } from "next/server";

import { loadDashboardData } from "@/lib/dashboard";

export async function GET() {
  const data = await loadDashboardData();
  return NextResponse.json(data);
}

