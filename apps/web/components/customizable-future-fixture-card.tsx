"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { FixtureCard } from "@/components/fixture-card";
import type { UpcomingFixture } from "@/lib/dashboard";
import type { FixtureLineupContext, FixtureSimulation, LineupPlayer, TeamLineupContext } from "@/lib/lineup";

type CustomizableFutureFixtureCardProps = {
  fixture: UpcomingFixture;
};

type PositionBucket = "goalkeeper" | "defender" | "midfielder" | "forward" | "unknown";

const POSITION_ROWS: PositionBucket[] = ["goalkeeper", "defender", "midfielder", "forward"];
const LINEUP_CONTEXT_TIMEOUT_MS = 12000;
const SIMULATION_TIMEOUT_MS = 10000;
const lineupContextCache = new Map<string, FixtureLineupContext>();

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

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let didTimeout = false;
  const timer = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return fetch(input, {
    ...init,
    signal: controller.signal,
  })
    .catch((error) => {
      if (didTimeout) {
        throw new DOMException("Request timed out", "TimeoutError");
      }
      throw error;
    })
    .finally(() => {
      window.clearTimeout(timer);
    });
}

function timeoutMessage(kind: "lineup" | "simulation", timeoutMs: number) {
  const seconds = Math.round(timeoutMs / 1000);
  if (kind === "lineup") {
    return `Lineup loading timed out after ${seconds}s. The backend is probably reachable, but it is responding too slowly right now.`;
  }
  return `Simulation timed out after ${seconds}s. This is a good signal to check runtime latency rather than guessing whether the UI is broken.`;
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
  const [context, setContext] = useState<FixtureLineupContext | null>(lineupContextCache.get(fixture.matchId) ?? null);
  const [simulation, setSimulation] = useState<FixtureSimulation | null>(null);
  const [homeSelectedIds, setHomeSelectedIds] = useState<number[]>([]);
  const [awaySelectedIds, setAwaySelectedIds] = useState<number[]>([]);
  const [loadingContext, setLoadingContext] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPrefetched = useRef(false);

  async function ensureContextLoaded() {
    if (lineupContextCache.has(fixture.matchId)) {
      const cached = lineupContextCache.get(fixture.matchId)!;
      setContext(cached);
      if (homeSelectedIds.length === 0) {
        setHomeSelectedIds(cached.home.lineup.map((player) => player.playerId));
      }
      if (awaySelectedIds.length === 0) {
        setAwaySelectedIds(cached.away.lineup.map((player) => player.playerId));
      }
      return;
    }

    if (loadingContext) {
      return;
    }

    setLoadingContext(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
        `/api/fixtures/${fixture.matchId}/lineup-context`,
        {
          cache: "no-store",
        },
        LINEUP_CONTEXT_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`Failed to load lineup context (${response.status}).`);
      }
      const payload = (await response.json()) as FixtureLineupContext;
      lineupContextCache.set(fixture.matchId, payload);
      setContext(payload);
      setHomeSelectedIds(payload.home.lineup.map((player) => player.playerId));
      setAwaySelectedIds(payload.away.lineup.map((player) => player.playerId));
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "TimeoutError") {
        setError(timeoutMessage("lineup", LINEUP_CONTEXT_TIMEOUT_MS));
      } else {
        setError(loadError instanceof Error ? loadError.message : "Unable to load lineup context.");
      }
    } finally {
      setLoadingContext(false);
    }
  }

  useEffect(() => {
    if (!open || context !== null) {
      return;
    }
    void ensureContextLoaded();
  }, [context, open]);

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

    async function runSimulation() {
      setSimulating(true);
      setError(null);
      try {
        const response = await fetchWithTimeout(
          "/api/predict/simulate",
          {
            method: "POST",
            cache: "no-store",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              matchId: fixture.matchId,
              homePlayerIds: homeSelectedIds,
              awayPlayerIds: awaySelectedIds,
            }),
          },
          SIMULATION_TIMEOUT_MS,
        );
        if (!response.ok) {
          throw new Error(`Failed to simulate lineup (${response.status}).`);
        }
        const payload = (await response.json()) as FixtureSimulation;
        setSimulation(payload);
      } catch (simulationError) {
        if (simulationError instanceof DOMException && simulationError.name === "TimeoutError") {
          setError(timeoutMessage("simulation", SIMULATION_TIMEOUT_MS));
        } else {
          setError(simulationError instanceof Error ? simulationError.message : "Unable to run lineup simulation.");
        }
      } finally {
        setSimulating(false);
      }
    }

    void runSimulation();
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

  const prefetchedSummary = loadingContext
    ? "Fetching projected XI from the live backend..."
    : context
      ? "Projected XI is cached for this fixture."
      : "Open the lineup tool to fetch the projected XI from the live backend.";

  return (
    <FixtureCard
      fixture={fixture}
      probabilitiesOverride={simulation?.simulatedMatch.probabilities}
    >
      <div className="fixture-actions">
        <div>
          <strong>{summary.title}</strong>
          <p>{open ? summary.note : prefetchedSummary}</p>
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
          <button
            className="lineup-toggle-button"
            onMouseEnter={() => {
              if (!hasPrefetched.current) {
                hasPrefetched.current = true;
                void ensureContextLoaded();
              }
            }}
            onFocus={() => {
              if (!hasPrefetched.current) {
                hasPrefetched.current = true;
                void ensureContextLoaded();
              }
            }}
            onClick={() => {
              hasPrefetched.current = true;
              setOpen((current) => !current);
              if (context === null) {
                void ensureContextLoaded();
              }
            }}
          >
            {open ? "Hide Lineup Tool" : "Customize Lineup"}
          </button>
        </div>
      </div>

      {open ? (
        <section className="lineup-builder-shell">
          {loadingContext ? <p className="lineup-status">Loading projected lineups. Timeout test is {LINEUP_CONTEXT_TIMEOUT_MS / 1000}s.</p> : null}
          {simulating ? <p className="lineup-status">Updating your forecast...</p> : null}
          {error ? <p className="lineup-error">{error}</p> : null}

          {loadingContext && context === null ? (
            <div className="lineup-builder-grid">
              <div className="lineup-column">
                <section className="lineup-pitch-card lineup-skeleton-card">
                  <div className="skeleton-line skeleton-line-title" />
                  <div className="lineup-pitch lineup-pitch-skeleton">
                    <div className="skeleton-pill-row">
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                    </div>
                    <div className="skeleton-pill-row">
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                    </div>
                    <div className="skeleton-pill-row">
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                      <span className="skeleton-pill" />
                    </div>
                  </div>
                </section>
              </div>
              <div className="lineup-column">
                <section className="lineup-controls-card lineup-skeleton-card">
                  <div className="skeleton-line skeleton-line-title" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </section>
              </div>
            </div>
          ) : null}

          {context ? (
            <>
              <div className="simulation-summary-card">
                <div className="simulation-summary-topline">
                  <span>Your runtime forecast</span>
                  <span>
                    {simulation?.simulationMode ?? "projected-default-lineup"}
                    {simulating ? " · refreshing" : ""}
                  </span>
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
