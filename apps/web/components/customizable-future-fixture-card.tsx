"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { FixtureModal } from "@/components/fixture-modal";
import { LineupPitch, type PitchSelection } from "@/components/lineup-pitch";
import { PredictionCard, WhyThisPrediction } from "@/components/prediction-card";
import { SaveLineup } from "@/components/save-lineup";
import { ModelVerdict } from "@/components/ui/badges";
import { TeamCrest } from "@/components/ui/crest";
import { LocalTime } from "@/components/ui/local-time";
import { ProbabilityBar } from "@/components/ui/probability-bar";
import type { UpcomingFixture } from "@/lib/dashboard";
import { clubKit } from "@/lib/kits";
import type { FixtureLineupContext, FixtureSimulation, LineupPlayer, TeamLineupContext } from "@/lib/lineup";
import {
  LINES,
  buildFormation,
  formationIds,
  formationLabel,
  lineupKey,
  sameEleven,
  type Formation,
} from "@/lib/pitch";
import { validateScenarioRoster, type SavedScenario } from "@/lib/scenarios";

type CustomizableFutureFixtureCardProps = {
  fixture: UpcomingFixture;
  initialScenario?: SavedScenario;
  highlighted?: boolean;
};

type Side = "home" | "away";
type Formations = Record<Side, Formation>;

const SIDES: readonly Side[] = ["home", "away"];
const LINEUP_CONTEXT_TIMEOUT_MS = 20000;
const SIMULATION_TIMEOUT_MS = 15000;
/** Quick successive changes send one forecast request, not one each. */
const SIMULATION_DEBOUNCE_MS = 250;
/** After a fixture link scrolls the row into view, wait a beat so the box visibly comes out of it. */
const LINK_OPEN_DELAY_MS = 450;
const lineupContextCache = new Map<string, FixtureLineupContext>();

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
    return `Lineups took longer than ${seconds}s to load. The lineup service is slow right now, so try again in a moment.`;
  }
  return `The updated forecast took longer than ${seconds}s. Try changing the lineup again in a moment.`;
}

/** Plain-language account of what the chosen XIs did to the forecast. */
function adjustmentNote(simulation: FixtureSimulation, fixture: UpcomingFixture) {
  const { homeGoalMultiplier, awayGoalMultiplier, homeAttackRatio, awayAttackRatio, homeDefenceRatio, awayDefenceRatio } =
    simulation.adjustments;
  if (typeof homeGoalMultiplier === "number" && typeof awayGoalMultiplier === "number") {
    if (homeGoalMultiplier === 1 && awayGoalMultiplier === 1) {
      return "These players have too little recent data to shift the forecast.";
    }
    return `Expected goals with your XI: ${fixture.homeTeam.shortName} ×${homeGoalMultiplier.toFixed(2)}, ${
      fixture.awayTeam.shortName
    } ×${awayGoalMultiplier.toFixed(2)}. Each lineup effect is capped at ±35%.`;
  }
  return `Attack shift: home ${homeAttackRatio ?? "—"}x, away ${awayAttackRatio ?? "—"}x. Defence shift: home ${
    homeDefenceRatio ?? "—"
  }x, away ${awayDefenceRatio ?? "—"}x.`;
}

function DeltaChip({ from, to }: { from: number; to: number }) {
  const diffPp = Math.round((to - from) * 100);
  if (diffPp === 0) {
    return <span className="delta-chip delta-flat">±0pp</span>;
  }
  const up = diffPp > 0;
  return (
    <span className={`delta-chip ${up ? "delta-up" : "delta-down"}`}>
      <span aria-hidden="true">{up ? "↑" : "↓"}</span>
      {Math.abs(diffPp)}pp
    </span>
  );
}

function defaultFormation(team: TeamLineupContext) {
  return buildFormation(team.lineup);
}

function formationFor(team: TeamLineupContext, playerIds: number[]): Formation {
  const byId = new Map(team.roster.map((player) => [player.playerId, player] as const));
  for (const player of team.lineup) byId.set(player.playerId, player);
  const players = playerIds.map((playerId) => byId.get(playerId)).filter((player): player is LineupPlayer => !!player);
  return buildFormation(players);
}

function sameShape(left: Formation, right: Formation) {
  return LINES.every(
    (line) => left[line].length === right[line].length && left[line].every((id, index) => right[line][index] === id),
  );
}

function PitchSkeleton() {
  return (
    <div className="pitch-editor pitch-editor-loading" aria-hidden="true">
      <div className="pitch-stage">
        <div className="pitch-field">
          {[20, 44.5, 68.5, 89].map((top, row) => (
            <div key={top} className="pitch-line" style={{ top: `${top}%` }}>
              {Array.from({ length: [3, 4, 4, 1][row] }, (_, index) => (
                <span key={index} className="pitch-token-skeleton" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="bench-panel skeleton-card">
        <div className="skeleton-line skeleton-line-title" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
        <div className="skeleton-line" />
      </div>
    </div>
  );
}

export function CustomizableFutureFixtureCard({
  fixture,
  initialScenario,
  highlighted = false,
}: CustomizableFutureFixtureCardProps) {
  const cacheKey = `${fixture.season}:${fixture.matchId}`;
  const titleId = useId();
  const rowRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(Boolean(initialScenario));
  const [context, setContext] = useState<FixtureLineupContext | null>(null);
  const [formations, setFormations] = useState<Formations | null>(null);
  const [side, setSide] = useState<Side>("home");
  const [selection, setSelection] = useState<PitchSelection>(null);
  const [announcement, setAnnouncement] = useState("");
  const [simulation, setSimulation] = useState<FixtureSimulation | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPrefetched = useRef(false);
  const loadingRef = useRef(false);

  function applyContext(payload: FixtureLineupContext) {
    setContext(payload);
    let home = defaultFormation(payload.home);
    let away = defaultFormation(payload.away);
    if (initialScenario) {
      try {
        validateScenarioRoster(
          {
            id: initialScenario.id,
            name: initialScenario.name,
            season: initialScenario.season,
            matchId: initialScenario.match_id,
            homePlayerIds: initialScenario.home_player_ids,
            awayPlayerIds: initialScenario.away_player_ids,
          },
          payload,
        );
        home = formationFor(payload.home, initialScenario.home_player_ids);
        away = formationFor(payload.away, initialScenario.away_player_ids);
      } catch {
        setError(
          "Some saved players are no longer in this fixture’s squad. The editor shows the current projected XI; your original save is unchanged.",
        );
      }
    }
    setFormations({ home, away });
  }

  async function ensureContextLoaded() {
    if (context !== null || loadingRef.current) {
      return;
    }
    const cached = lineupContextCache.get(cacheKey);
    if (cached) {
      applyContext(cached);
      return;
    }

    loadingRef.current = true;
    setLoadingContext(true);
    setError(null);
    try {
      const response = await fetchWithTimeout(
        `/api/fixtures/${fixture.matchId}/lineup-context`,
        { cache: "no-store" },
        LINEUP_CONTEXT_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new Error(`Failed to load lineup context (${response.status}).`);
      }
      const payload = (await response.json()) as FixtureLineupContext;
      lineupContextCache.set(cacheKey, payload);
      applyContext(payload);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "TimeoutError") {
        setError(timeoutMessage("lineup", LINEUP_CONTEXT_TIMEOUT_MS));
      } else {
        setError(loadError instanceof Error ? loadError.message : "Unable to load lineup context.");
      }
    } finally {
      loadingRef.current = false;
      setLoadingContext(false);
    }
  }

  function prefetchContext() {
    if (!hasPrefetched.current) {
      hasPrefetched.current = true;
      void ensureContextLoaded();
    }
  }

  useEffect(() => {
    if (open && context === null) {
      void ensureContextLoaded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, open]);

  // Arriving from a fixture link: the row scrolls into view, then the box opens out of it.
  useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => setOpen(true), LINK_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  const homeIds = useMemo(() => (formations ? formationIds(formations.home) : []), [formations]);
  const awayIds = useMemo(() => (formations ? formationIds(formations.away) : []), [formations]);
  const defaultIds = useMemo(
    () => ({
      home: context ? context.home.lineup.map((player) => player.playerId) : [],
      away: context ? context.away.lineup.map((player) => player.playerId) : [],
    }),
    [context],
  );
  const changed = {
    home: context !== null && !sameEleven(homeIds, defaultIds.home),
    away: context !== null && !sameEleven(awayIds, defaultIds.away),
  };
  const customised = changed.home || changed.away;
  // Rearranging the same eleven doesn't change the forecast, so only the set of players matters here.
  const homeKey = lineupKey(homeIds);
  const awayKey = lineupKey(awayIds);

  useEffect(() => {
    if (context === null || formations === null) {
      return;
    }
    if (!customised) {
      setSimulation(null);
      setSimulating(false);
      return;
    }

    let active = true;
    setSimulating(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchWithTimeout(
          "/api/predict/simulate",
          {
            method: "POST",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ matchId: fixture.matchId, homePlayerIds: homeIds, awayPlayerIds: awayIds }),
          },
          SIMULATION_TIMEOUT_MS,
        );
        if (!response.ok) {
          throw new Error(`Failed to simulate lineup (${response.status}).`);
        }
        const payload = (await response.json()) as FixtureSimulation;
        if (active) {
          setSimulation(payload);
          setError(null);
        }
      } catch (simulationError) {
        if (!active) return;
        if (simulationError instanceof DOMException && simulationError.name === "TimeoutError") {
          setError(timeoutMessage("simulation", SIMULATION_TIMEOUT_MS));
        } else {
          setError(simulationError instanceof Error ? simulationError.message : "Unable to run lineup simulation.");
        }
      } finally {
        if (active) setSimulating(false);
      }
    }, SIMULATION_DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
    // Keyed on the sets of players, not their order or pitch positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeKey, awayKey, context, fixture.matchId]);

  // A stale result from a previous XI shouldn't colour the forecast once we're back to the projected one.
  const activeSimulation = customised ? simulation : null;
  const activeProbabilities = activeSimulation?.simulatedMatch.probabilities ?? fixture.probabilities;

  function updateFormation(target: Side, next: Formation, message: string) {
    setFormations((current) => (current ? { ...current, [target]: next } : current));
    setAnnouncement(message);
  }

  function resetSide(target: Side) {
    if (!context) return;
    setSelection(null);
    updateFormation(target, defaultFormation(context[target]), `${context[target].team.name} back to the projected XI.`);
  }

  function resetAll() {
    if (!context) return;
    setSelection(null);
    setFormations({ home: defaultFormation(context.home), away: defaultFormation(context.away) });
    setAnnouncement("Both teams back to their projected XIs.");
  }

  function switchSide(next: Side) {
    setSide(next);
    setSelection(null);
  }

  const { homeTeam, awayTeam } = fixture;
  const activeTeam = context?.[side] ?? null;
  const activeFormation = formations?.[side] ?? null;
  const shapeChanged =
    context !== null && activeFormation !== null && !sameShape(activeFormation, defaultFormation(context[side]));

  return (
    <PredictionCard
      fixture={fixture}
      probabilitiesOverride={activeProbabilities}
      highlighted={highlighted}
      articleRef={rowRef}
      onIntent={prefetchContext}
      onOpenDetails={() => {
        hasPrefetched.current = true;
        setOpen(true);
      }}
      tag={customised ? <span className="custom-xi-tag">Your XI</span> : null}
    >
      {open ? (
        <FixtureModal
          originRef={rowRef}
          labelledBy={titleId}
          onClose={() => {
            setOpen(false);
            setSelection(null);
            // Back to the row it came from, including when a fixture link opened it.
            requestAnimationFrame(() => rowRef.current?.querySelector<HTMLElement>(".fixture-row-toggle")?.focus());
          }}
          onEscape={() => {
            if (selection === null) return false;
            setSelection(null);
            return true;
          }}
        >
          <header className="match-modal-head">
            <p className="match-modal-kicker">
              Matchweek {fixture.gameweek ?? "—"} · <LocalTime value={fixture.kickoffTime} withZone />
            </p>
            <h2 id={titleId} className="match-modal-title">
              <span className="match-modal-team">
                <TeamCrest name={homeTeam.name} badgePath={homeTeam.badgePath} size={36} />
                <span>{homeTeam.name}</span>
              </span>
              <span className="match-modal-vs">vs</span>
              <span className="match-modal-team match-modal-team-away">
                <span>{awayTeam.name}</span>
                <TeamCrest name={awayTeam.name} badgePath={awayTeam.badgePath} size={36} />
              </span>
            </h2>

            <div className="match-modal-forecast">
              <div className="match-modal-forecast-top">
                <span className="match-modal-forecast-label">
                  {customised ? "Forecast with your XIs" : "Model forecast"}
                </span>
                <span className={`forecast-status${simulating ? " is-updating" : ""}`} role="status">
                  {simulating ? "Updating…" : customised ? "Your XI" : "Projected XI"}
                </span>
                <ModelVerdict
                  probabilities={activeProbabilities}
                  homeShort={homeTeam.shortName}
                  awayShort={awayTeam.shortName}
                />
              </div>
              <ProbabilityBar
                probabilities={activeProbabilities}
                homeShort={homeTeam.shortName}
                awayShort={awayTeam.shortName}
                size="sm"
              />
              {activeSimulation ? (
                <div className="match-modal-deltas">
                  <span>vs projected</span>
                  <span>
                    {homeTeam.shortName}{" "}
                    <DeltaChip from={fixture.probabilities.homeWin} to={activeProbabilities.homeWin} />
                  </span>
                  <span>
                    Draw <DeltaChip from={fixture.probabilities.draw} to={activeProbabilities.draw} />
                  </span>
                  <span>
                    {awayTeam.shortName}{" "}
                    <DeltaChip from={fixture.probabilities.awayWin} to={activeProbabilities.awayWin} />
                  </span>
                </div>
              ) : null}
            </div>
          </header>

          <div className="match-modal-body">
            <section className="match-modal-editor" aria-label="Lineup editor">
              <div className="editor-toolbar">
                <div className="team-switch" role="tablist" aria-label="Team to edit">
                  {SIDES.map((option) => {
                    const team = option === "home" ? homeTeam : awayTeam;
                    return (
                      <button
                        key={option}
                        type="button"
                        role="tab"
                        aria-selected={side === option}
                        className={`team-switch-tab${side === option ? " is-active" : ""}`}
                        onClick={() => switchSide(option)}
                      >
                        <TeamCrest name={team.name} badgePath={team.badgePath} size={22} />
                        <span className="team-switch-name">{team.name}</span>
                        <span className="team-switch-side">{option === "home" ? "Home" : "Away"}</span>
                        {changed[option] ? (
                          <span className="team-switch-dot" title="Edited">
                            <span className="sr-only">, edited</span>
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="editor-actions">
                  {activeFormation ? (
                    <span className="formation-chip" aria-label={`Formation ${formationLabel(activeFormation)}`}>
                      {formationLabel(activeFormation)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="lineup-reset-button"
                    onClick={() => resetSide(side)}
                    disabled={!context || (!changed[side] && !shapeChanged)}
                  >
                    Reset {side === "home" ? homeTeam.shortName : awayTeam.shortName}
                  </button>
                  {customised ? (
                    <button type="button" className="lineup-reset-button" onClick={resetAll}>
                      Reset both
                    </button>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="lineup-error" role="alert">
                  <span>{error}</span>
                  {context === null && !loadingContext ? (
                    <button type="button" className="lineup-reset-button" onClick={() => void ensureContextLoaded()}>
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : null}

              {activeTeam && activeFormation ? (
                <LineupPitch
                  key={side}
                  team={activeTeam}
                  kit={clubKit((side === "home" ? homeTeam : awayTeam).badgeSlug, side)}
                  formation={activeFormation}
                  defaultIds={defaultIds[side]}
                  selection={selection}
                  onSelectionChange={setSelection}
                  onFormationChange={(next, message) => updateFormation(side, next, message)}
                  onNotice={setAnnouncement}
                />
              ) : context === null && (loadingContext || !error) ? (
                <>
                  <p className="lineup-status">Loading projected lineups…</p>
                  <PitchSkeleton />
                </>
              ) : null}

              <p className="editor-announce" role="status" aria-live="polite">
                {announcement}
              </p>
              <p className="editor-hint">
                Where a player stands is only the picture. The forecast moves when a different player starts.
              </p>
            </section>

            <aside className="match-modal-aside">
              {activeSimulation ? (
                <p className="simulation-adjustment-note">{adjustmentNote(activeSimulation, fixture)}</p>
              ) : null}
              <WhyThisPrediction fixture={fixture} />
              {context && formations ? (
                <SaveLineup fixture={fixture} homePlayerIds={homeIds} awayPlayerIds={awayIds} />
              ) : null}
            </aside>
          </div>
        </FixtureModal>
      ) : null}
    </PredictionCard>
  );
}
