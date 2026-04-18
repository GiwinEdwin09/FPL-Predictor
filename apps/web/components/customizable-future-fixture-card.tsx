"use client";

import { useEffect, useMemo, useState } from "react";

import { FixtureCard } from "@/components/fixture-card";
import type { UpcomingFixture } from "@/lib/dashboard";
import type { FixtureLineupContext, FixtureSimulation, LineupPlayer, TeamLineupContext } from "@/lib/lineup";

type CustomizableFutureFixtureCardProps = {
  fixture: UpcomingFixture;
};

type PositionBucket = "goalkeeper" | "defender" | "midfielder" | "forward" | "unknown";

const POSITION_ROWS: PositionBucket[] = ["goalkeeper", "defender", "midfielder", "forward"];

function bucketPosition(position: string | null | undefined): PositionBucket {
  const normalized = (position ?? "").trim().toLowerCase();
  if (normalized.startsWith("goal")) {
    return "goalkeeper";
  }
  if (normalized.startsWith("def")) {
    return "defender";
  }
  if (normalized.startsWith("mid")) {
    return "midfielder";
  }
  if (normalized.startsWith("for")) {
    return "forward";
  }
  return "unknown";
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function equalIds(left: number[], right: number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function playersById(team: TeamLineupContext) {
  return new Map(team.roster.map((player) => [player.playerId, player] as const));
}

function selectedPlayers(team: TeamLineupContext, selectedIds: number[]) {
  const map = playersById(team);
  return selectedIds.map((playerId) => map.get(playerId)).filter((player): player is LineupPlayer => player !== undefined);
}

function groupedPlayers(players: LineupPlayer[]) {
  const groups = new Map<PositionBucket, LineupPlayer[]>();
  POSITION_ROWS.forEach((bucket) => groups.set(bucket, []));
  groups.set("unknown", []);

  for (const player of players) {
    const bucket = bucketPosition(player.position);
    const current = groups.get(bucket) ?? [];
    current.push(player);
    groups.set(bucket, current);
  }

  return groups;
}

function probabilitySummary(simulation: FixtureSimulation | null, fixture: UpcomingFixture) {
  if (!simulation) {
    return {
      title: "Default Forecast",
      probabilities: fixture.probabilities,
      note: "These bars reflect the default projected lineup from the current runtime.",
    };
  }

  return {
    title: "Your Lineup Forecast",
    probabilities: simulation.simulatedMatch.probabilities,
    note: "These probabilities are recalculated live from the lineup you selected.",
  };
}

function PitchMap({
  title,
  players,
}: {
  title: string;
  players: LineupPlayer[];
}) {
  const groups = groupedPlayers(players);

  return (
    <section className="lineup-pitch-card">
      <p className="eyebrow">{title}</p>
      <div className="lineup-pitch">
        {POSITION_ROWS.map((bucket) => {
          const rowPlayers = groups.get(bucket) ?? [];
          return (
            <div key={bucket} className="pitch-row">
              <span className="pitch-row-label">{bucket}</span>
              <div className="pitch-row-players">
                {rowPlayers.map((player) => (
                  <div key={player.playerId} className="pitch-marker">
                    <strong>{initials(player.name)}</strong>
                    <span>{player.name}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LineupControls({
  team,
  selectedIds,
  onChange,
}: {
  team: TeamLineupContext;
  selectedIds: number[];
  onChange: (nextIds: number[]) => void;
}) {
  const selected = selectedPlayers(team, selectedIds);

  return (
    <section className="lineup-controls-card">
      <div className="lineup-controls-header">
        <div>
          <p className="eyebrow">{team.team.name}</p>
          <h3>Customize XI</h3>
        </div>
        <span className="lineup-controls-note">Swap in any player from the current roster snapshot.</span>
      </div>

      <div className="lineup-controls-list">
        {selected.map((player, index) => (
          <label key={`${team.team.id}-${index}`} className="lineup-select-row">
            <span>
              <strong>{player.position ?? "Player"}</strong>
              <small>{player.available ? "Available" : "Risk flagged"}</small>
            </span>
            <select
              value={selectedIds[index]}
              onChange={(event) => {
                const nextId = Number(event.target.value);
                const nextIds = [...selectedIds];
                nextIds[index] = nextId;
                onChange(nextIds);
              }}
            >
              {team.roster.map((option) => {
                const selectedElsewhere = selectedIds.includes(option.playerId) && option.playerId !== selectedIds[index];
                return (
                  <option key={option.playerId} value={option.playerId} disabled={selectedElsewhere}>
                    {option.name} · {option.position ?? "Player"} · form {option.form ?? 0}
                  </option>
                );
              })}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}

export function CustomizableFutureFixtureCard({ fixture }: CustomizableFutureFixtureCardProps) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<FixtureLineupContext | null>(null);
  const [simulation, setSimulation] = useState<FixtureSimulation | null>(null);
  const [homeSelectedIds, setHomeSelectedIds] = useState<number[]>([]);
  const [awaySelectedIds, setAwaySelectedIds] = useState<number[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || context !== null || loadingContext) {
      return;
    }

    const controller = new AbortController();

    async function loadContext() {
      setLoadingContext(true);
      setError(null);
      try {
        const response = await fetch(`/api/fixtures/${fixture.matchId}/lineup-context`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load lineup context (${response.status}).`);
        }
        const payload = (await response.json()) as FixtureLineupContext;
        setContext(payload);
        setHomeSelectedIds(payload.home.lineup.map((player) => player.playerId));
        setAwaySelectedIds(payload.away.lineup.map((player) => player.playerId));
      } catch (loadError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Unable to load lineup context.");
      } finally {
        if (!controller.signal.aborted) {
          setLoadingContext(false);
        }
      }
    }

    void loadContext();

    return () => controller.abort();
  }, [context, fixture.matchId, loadingContext, open]);

  useEffect(() => {
    if (!open || context === null) {
      return;
    }

    const baselineHome = context.home.lineup.map((player) => player.playerId);
    const baselineAway = context.away.lineup.map((player) => player.playerId);
    if (equalIds(homeSelectedIds, baselineHome) && equalIds(awaySelectedIds, baselineAway)) {
      setSimulation(null);
      return;
    }

    const controller = new AbortController();

    async function runSimulation() {
      setSimulating(true);
      setError(null);
      try {
        const response = await fetch("/api/predict/simulate", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            matchId: fixture.matchId,
            homePlayerIds: homeSelectedIds,
            awayPlayerIds: awaySelectedIds,
          }),
        });
        if (!response.ok) {
          throw new Error(`Failed to simulate lineup (${response.status}).`);
        }
        const payload = (await response.json()) as FixtureSimulation;
        setSimulation(payload);
      } catch (simulationError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(simulationError instanceof Error ? simulationError.message : "Unable to run lineup simulation.");
      } finally {
        if (!controller.signal.aborted) {
          setSimulating(false);
        }
      }
    }

    void runSimulation();

    return () => controller.abort();
  }, [awaySelectedIds, context, fixture.matchId, homeSelectedIds, open]);

  const summary = useMemo(() => probabilitySummary(simulation, fixture), [fixture, simulation]);
  const homePlayers = useMemo(
    () => (context ? selectedPlayers(context.home, homeSelectedIds) : []),
    [context, homeSelectedIds],
  );
  const awayPlayers = useMemo(
    () => (context ? selectedPlayers(context.away, awaySelectedIds) : []),
    [awaySelectedIds, context],
  );

  return (
    <FixtureCard
      fixture={fixture}
      probabilitiesOverride={simulation?.simulatedMatch.probabilities}
    >
      <div className="fixture-actions">
        <div>
          <strong>{summary.title}</strong>
          <p>{summary.note}</p>
        </div>
        <div className="fixture-action-buttons">
          {context ? (
            <button
              className="lineup-reset-button"
              onClick={() => {
                setHomeSelectedIds(context.home.lineup.map((player) => player.playerId));
                setAwaySelectedIds(context.away.lineup.map((player) => player.playerId));
                setSimulation(null);
              }}
              disabled={
                equalIds(homeSelectedIds, context.home.lineup.map((player) => player.playerId))
                && equalIds(awaySelectedIds, context.away.lineup.map((player) => player.playerId))
              }
            >
              Reset XI
            </button>
          ) : null}
          <button className="lineup-toggle-button" onClick={() => setOpen((current) => !current)}>
            {open ? "Hide Lineup Tool" : "Customize Lineup"}
          </button>
        </div>
      </div>

      {open ? (
        <section className="lineup-builder-shell">
          {loadingContext ? <p className="lineup-status">Loading projected lineups...</p> : null}
          {simulating ? <p className="lineup-status">Updating your forecast...</p> : null}
          {error ? <p className="lineup-error">{error}</p> : null}

          {context ? (
            <>
              <div className="simulation-summary-card">
                <div className="simulation-summary-topline">
                  <span>Your runtime forecast</span>
                  <span>{simulation?.simulationMode ?? "projected-default-lineup"}</span>
                </div>
                <div className="simulation-bars">
                  <div>
                    <span>{fixture.homeTeam.shortName}</span>
                    <strong>{formatPercent(summary.probabilities.homeWin)}</strong>
                  </div>
                  <div>
                    <span>Draw</span>
                    <strong>{formatPercent(summary.probabilities.draw)}</strong>
                  </div>
                  <div>
                    <span>{fixture.awayTeam.shortName}</span>
                    <strong>{formatPercent(summary.probabilities.awayWin)}</strong>
                  </div>
                </div>
                {simulation ? (
                  <p className="simulation-adjustment-note">
                    Attack shift: home {simulation.adjustments.homeAttackRatio ?? "NA"}x, away{" "}
                    {simulation.adjustments.awayAttackRatio ?? "NA"}x. Defence shift: home{" "}
                    {simulation.adjustments.homeDefenceRatio ?? "NA"}x, away{" "}
                    {simulation.adjustments.awayDefenceRatio ?? "NA"}x.
                  </p>
                ) : null}
              </div>

              <div className="lineup-builder-grid">
                <div className="lineup-column">
                  <PitchMap title={`${context.home.team.shortName} shape`} players={homePlayers} />
                  <LineupControls team={context.home} selectedIds={homeSelectedIds} onChange={setHomeSelectedIds} />
                </div>
                <div className="lineup-column">
                  <PitchMap title={`${context.away.team.shortName} shape`} players={awayPlayers} />
                  <LineupControls team={context.away} selectedIds={awaySelectedIds} onChange={setAwaySelectedIds} />
                </div>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </FixtureCard>
  );
}
