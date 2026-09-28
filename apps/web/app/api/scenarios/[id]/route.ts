import { NextRequest } from "next/server";
import { mutationBody, privateJson, scenarioAccount } from "@/lib/scenario-api";
import { parseScenarioUpdate, SCENARIO_COLUMNS, UUID_PATTERN } from "@/lib/scenarios";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await scenarioAccount();
  if (account.error) return account.error;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: "Lineup not found." }, 404);
  const { data, error } = await account.supabase.from("lineup_scenarios").select(SCENARIO_COLUMNS).eq("id", id).eq("user_id", account.user.id).maybeSingle();
  if (error) return privateJson({ error: "Your lineup could not be loaded. Please retry." }, 503);
  if (!data) return privateJson({ error: "Lineup not found in your account." }, 404);
  return privateJson({ scenario: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const account = await scenarioAccount();
  if (account.error) return account.error;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return privateJson({ error: "Lineup not found." }, 404);
  let input;
  try { input = parseScenarioUpdate(await mutationBody(request)); }
  catch (error) { return privateJson({ error: error instanceof Error ? error.message : "Invalid change." }, 400); }
  const { data, error } = await account.supabase.from("lineup_scenarios").update(input.patch)
    .eq("id", id).eq("user_id", account.user.id).eq("version", input.version).select(SCENARIO_COLUMNS).maybeSingle();
  if (error) return privateJson({ error: "Your change could not be saved. Please retry." }, 503);
  if (!data) return privateJson({ error: "This lineup changed on another device or is unavailable. Refresh your list before trying again." }, 409);
  return privateJson({ scenario: data });
}
