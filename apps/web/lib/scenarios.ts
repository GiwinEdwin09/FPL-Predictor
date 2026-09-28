import type { FixtureLineupContext } from "./lineup";

export type SavedScenario = {
  id: string;
  name: string;
  season: string;
  match_id: string;
  home_team_name: string;
  away_team_name: string;
  home_player_ids: number[];
  away_player_ids: number[];
  home_player_names: string[];
  away_player_names: string[];
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  version: number;
};

export const SCENARIO_COLUMNS = "id,name,season,match_id,home_team_name,away_team_name,home_player_ids,away_player_ids,home_player_names,away_player_names,created_at,updated_at,archived_at,version";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function scenarioName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) throw new Error("Choose a name between 1 and 80 characters.");
  return value.trim();
}

function playerIds(value: unknown): number[] {
  if (!Array.isArray(value) || value.length !== 11 || new Set(value).size !== 11 || value.some((id) => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) {
    throw new Error("Choose 11 different players for each team.");
  }
  return value;
}

export function parseScenario(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid scenario.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["id", "name", "season", "matchId", "homePlayerIds", "awayPlayerIds"].includes(key))) throw new Error("Unexpected scenario fields.");
  if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) throw new Error("Invalid scenario ID.");
  if (typeof body.matchId !== "string" || !body.matchId.length || body.matchId.length > 120) throw new Error("Invalid fixture.");
  if (typeof body.season !== "string" || !/^\d{4}-\d{4}$/.test(body.season)) throw new Error("Invalid season.");
  return { id: body.id, name: scenarioName(body.name), season: body.season, matchId: body.matchId,
    homePlayerIds: playerIds(body.homePlayerIds), awayPlayerIds: playerIds(body.awayPlayerIds) };
}

export function validateScenarioRoster(input: ReturnType<typeof parseScenario>, context: FixtureLineupContext) {
  if (context.match.matchId !== input.matchId || context.match.season !== input.season) throw new Error("This fixture no longer matches the saved season.");
  function names(ids: number[], team: FixtureLineupContext["home"]) {
    return ids.map((id) => {
      const player = team.roster.find((player) => player.playerId === id);
      if (!player) throw new Error("A selected player is no longer in this fixture’s squad. Review the lineup before saving.");
      return player.name;
    });
  }
  return { homeNames: names(input.homePlayerIds, context.home), awayNames: names(input.awayPlayerIds, context.away) };
}

export function parseScenarioUpdate(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid update.");
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !["version", "name", "archived"].includes(key))) throw new Error("Unexpected update fields.");
  if (!Number.isSafeInteger(body.version) || Number(body.version) < 1) throw new Error("Invalid scenario version.");
  if (("name" in body) === ("archived" in body)) throw new Error("Choose one change at a time.");
  const patch: { name?: string; archived_at?: string | null } = {};
  if ("name" in body) patch.name = scenarioName(body.name);
  else {
    if (typeof body.archived !== "boolean") throw new Error("Invalid archive choice.");
    patch.archived_at = body.archived ? new Date().toISOString() : null;
  }
  return { version: Number(body.version), patch };
}
