import { NextRequest } from "next/server";
import { mutationBody, privateJson, scenarioAccount } from "@/lib/scenario-api";
import { parseScenario, SCENARIO_COLUMNS, validateScenarioRoster } from "@/lib/scenarios";
import type { FixtureLineupContext } from "@/lib/lineup";

export async function GET(request: NextRequest) {
  const account = await scenarioAccount();
  if (account.error) return account.error;
  const page = Number(request.nextUrl.searchParams.get("page") ?? 0);
  if (!Number.isSafeInteger(page) || page < 0 || page > 10000) return privateJson({ error: "Invalid page." }, 400);
  let query = account.supabase.from("lineup_scenarios").select(SCENARIO_COLUMNS).eq("user_id", account.user.id);
  query = request.nextUrl.searchParams.get("archived") === "true" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const { data, error } = await query.order("updated_at", { ascending: false }).order("id").range(page * 20, page * 20 + 20);
  if (error) return privateJson({ error: "Your lineups could not be loaded. Please retry." }, 503);
  return privateJson({ scenarios: data.slice(0, 20), hasMore: data.length > 20 });
}

export async function POST(request: NextRequest) {
  const account = await scenarioAccount();
  if (account.error) return account.error;
  let input;
  try { input = parseScenario(await mutationBody(request)); }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : "Invalid scenario." }, 400); }

  // A retry after a lost response returns the original save without creating duplicates.
  const existing = await account.supabase.from("lineup_scenarios").select(SCENARIO_COLUMNS).eq("user_id", account.user.id).eq("id", input.id).maybeSingle();
  if (existing.error) return privateJson({ error: "Saving is temporarily unavailable. Your selection is still here." }, 503);
  if (existing.data) return privateJson({ scenario: existing.data });

  const base = process.env.API_BASE_URL;
  if (!base) return privateJson({ error: "The lineup service is not connected. Your selection has not been saved." }, 503);
  let context: FixtureLineupContext;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/fixtures/${encodeURIComponent(input.matchId)}/lineup-context`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error("Lineup service unavailable");
    context = await response.json();
  } catch { return privateJson({ error: "We couldn’t check this lineup right now. Your selection is still here; try saving again." }, 503); }
  let names;
  try { names = validateScenarioRoster(input, context); }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : "Invalid lineup." }, 400); }

  const { data, error } = await account.supabase.from("lineup_scenarios").insert({
    id: input.id, name: input.name, season: input.season, match_id: input.matchId,
    home_team_name: context.home.team.name, away_team_name: context.away.team.name,
    home_player_ids: input.homePlayerIds, away_player_ids: input.awayPlayerIds,
    home_player_names: names.homeNames, away_player_names: names.awayNames,
  }).select(SCENARIO_COLUMNS).single();
  if (error) return privateJson({ error: "We couldn’t confirm the save. Keep this page open and retry." }, 503);
  return privateJson({ scenario: data }, 201);
}
