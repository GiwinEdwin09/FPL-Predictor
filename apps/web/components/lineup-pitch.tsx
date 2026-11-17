"use client";

import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { goalkeeperKit, type Kit } from "@/lib/kits";
import type { LineupPlayer, TeamLineupContext } from "@/lib/lineup";
import {
  LINES,
  LINE_LABELS,
  POSITION_SHORT,
  benchFor,
  canMoveToLine,
  canReplace,
  canSwap,
  formationLabel,
  lineForPosition,
  moveToLine,
  playerAt,
  replaceAt,
  swapSlots,
  type Formation,
  type Line,
  type SlotRef,
} from "@/lib/pitch";

/** What the user has tapped and is about to act on: a starter or a bench player. */
export type PitchSelection = { kind: "pitch"; slot: SlotRef } | { kind: "bench"; playerId: number } | null;

type DragSource = { kind: "pitch"; slot: SlotRef } | { kind: "bench"; playerId: number };
type DropTarget =
  | { kind: "slot"; slot: SlotRef }
  | { kind: "line"; line: Line; index: number }
  | { kind: "bench"; playerId: number };

type DragState = { source: DragSource; x: number; y: number; target: DropTarget | null };

type LineupPitchProps = {
  team: TeamLineupContext;
  kit: Kit;
  formation: Formation;
  /** The projected XI, so changed starters can be marked. */
  defaultIds: number[];
  selection: PitchSelection;
  onSelectionChange: (next: PitchSelection) => void;
  /** A new formation plus a sentence describing the change, for the live region. */
  onFormationChange: (next: Formation, announcement: string) => void;
  /** Explains why an attempted move wasn't allowed. */
  onNotice: (message: string) => void;
};

/** Vertical position of each line, as a percentage of pitch height (attacking upward). */
const LINE_Y: Record<Line, number> = { gk: 89, def: 68.5, mid: 44.5, fwd: 20 };
const DRAG_THRESHOLD_PX = 6;
const FLIP_MS = 340;

const POSITION_WORD: Record<Line, string> = {
  gk: "goalkeeper",
  def: "defender",
  mid: "midfielder",
  fwd: "forward",
};

const GROUP_LABEL: Record<Line, string> = {
  gk: "Goalkeepers",
  def: "Defenders",
  mid: "Midfielders",
  fwd: "Forwards",
};

const SHIRT_BODY =
  "M14 4.5 L8.5 6.5 L2.5 12.5 L6.5 18.5 L10 16 L10 36 Q10 37 11 37 L29 37 Q30 37 30 36 L30 16 L33.5 18.5 L37.5 12.5 L31.5 6.5 L26 4.5 Q24.5 8.5 20 8.5 Q15.5 8.5 14 4.5 Z";
const SHIRT_LEFT_SLEEVE = "M8.5 6.5 L2.5 12.5 L6.5 18.5 L10 16 L11 5.6 Z";
const SHIRT_RIGHT_SLEEVE = "M31.5 6.5 L37.5 12.5 L33.5 18.5 L30 16 L29 5.6 Z";
const SHIRT_COLLAR = "M14 4.5 Q15.5 8.5 20 8.5 Q24.5 8.5 26 4.5";
const STRIPE_XS = [12.86, 18.57, 24.29];

function initials(name: string) {
  return name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** Why a player might not make it, or null when they're fully fit. */
function availabilityNote(player: LineupPlayer): string | null {
  if (!player.available) return player.news?.trim() || "Flagged as unavailable";
  const chance = player.chanceOfPlayingThisRound;
  if (chance !== null && chance < 100) {
    return `${Math.round(chance)}% chance of playing${player.news ? ` · ${player.news.trim()}` : ""}`;
  }
  return null;
}

function formText(player: LineupPlayer) {
  return player.form === null ? "—" : player.form.toFixed(1);
}

export function Shirt({ kit, label }: { kit: Kit; label: string }) {
  const clipId = `shirt-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className="shirt" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}>
          <path d={SHIRT_BODY} />
        </clipPath>
      </defs>
      <path d={SHIRT_BODY} fill={kit.body} />
      {kit.stripes ? (
        <g clipPath={`url(#${clipId})`} fill={kit.stripes}>
          {STRIPE_XS.map((x) => (
            <rect key={x} x={x} y="0" width="2.86" height="40" />
          ))}
        </g>
      ) : null}
      <path d={SHIRT_LEFT_SLEEVE} fill={kit.sleeves} />
      <path d={SHIRT_RIGHT_SLEEVE} fill={kit.sleeves} />
      <path d={SHIRT_BODY} fill="none" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="1" strokeLinejoin="round" />
      <path d={SHIRT_COLLAR} fill="none" stroke={kit.ink} strokeOpacity="0.55" strokeWidth="1.2" />
      <text x="20" y="27.5" textAnchor="middle" fill={kit.ink} className="shirt-label">
        {label}
      </text>
    </svg>
  );
}

/** Pitch markings drawn to scale on a 68 × 96 field (a touch shorter than a real one). */
function PitchMarkings() {
  return (
    <svg className="pitch-markings" viewBox="0 0 68 96" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="0.35">
        <rect x="3" y="3" width="62" height="90" />
        <line x1="3" y1="48" x2="65" y2="48" />
        <circle cx="34" cy="48" r="8.3" />
        <rect x="15.6" y="3" width="36.8" height="15" />
        <rect x="25.65" y="3" width="16.7" height="5" />
        <path d="M27.38 18 A8.3 8.3 0 0 0 40.62 18" />
        <rect x="15.6" y="78" width="36.8" height="15" />
        <rect x="25.65" y="88" width="16.7" height="5" />
        <path d="M27.38 78 A8.3 8.3 0 0 1 40.62 78" />
        <path d="M3 4 A1 1 0 0 0 4 3" />
        <path d="M64 3 A1 1 0 0 0 65 4" />
        <path d="M4 93 A1 1 0 0 0 3 92" />
        <path d="M65 92 A1 1 0 0 0 64 93" />
        <rect x="30.35" y="1.3" width="7.3" height="1.7" />
        <rect x="30.35" y="93" width="7.3" height="1.7" />
      </g>
      <g fill="currentColor">
        <circle cx="34" cy="48" r="0.6" />
        <circle cx="34" cy="13" r="0.5" />
        <circle cx="34" cy="83" r="0.5" />
      </g>
    </svg>
  );
}

function sameSlot(left: SlotRef, right: SlotRef) {
  return left.line === right.line && left.index === right.index;
}

export function LineupPitch({
  team,
  kit,
  formation,
  defaultIds,
  selection,
  onSelectionChange,
  onFormationChange,
  onNotice,
}: LineupPitchProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLDivElement>(null);
  const tokenEls = useRef(new Map<number, HTMLElement>());
  const previousRects = useRef<Map<number, { x: number; y: number }> | null>(null);
  const pending = useRef<{ source: DragSource; startX: number; startY: number; pointerId: number } | null>(null);
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [entering, setEntering] = useState(true);

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  const players = useMemo(() => {
    const map = new Map<number, LineupPlayer>();
    for (const player of [...team.roster, ...team.lineup]) map.set(player.playerId, player);
    return map;
  }, [team.lineup, team.roster]);
  const defaultSet = useMemo(() => new Set(defaultIds), [defaultIds]);
  const keeperKit = useMemo(() => goalkeeperKit(kit), [kit]);

  // Everything the window-level drag listeners need, always current.
  const latest = useRef({ formation, players, selection, onFormationChange, onNotice, onSelectionChange });
  latest.current = { formation, players, selection, onFormationChange, onNotice, onSelectionChange };

  const nameOf = (playerId: number | undefined) =>
    (playerId === undefined ? undefined : players.get(playerId)?.name) ?? "Player";

  /* ---------------------------------------------------------------- moves */

  /** Null when the drop is fine, otherwise a sentence saying why it isn't. */
  function dropProblem(source: DragSource, target: DropTarget, current: Formation): string | null {
    if (source.kind === "pitch") {
      if (target.kind === "slot") {
        if (sameSlot(source.slot, target.slot)) return "";
        return canSwap(source.slot, target.slot) ? null : "Goalkeepers can only swap places with goalkeepers.";
      }
      if (target.kind === "line") {
        if (source.slot.line === "gk" || target.line === "gk") return "Goalkeepers stay in goal.";
        if (canMoveToLine(current, source.slot, target.line)) return null;
        return current[source.slot.line].length <= 1
          ? `${LINE_LABELS[source.slot.line]} needs at least one player.`
          : `${LINE_LABELS[target.line]} is full.`;
      }
      const incoming = latest.current.players.get(target.playerId);
      if (!incoming) return "";
      return canReplace(source.slot, incoming) ? null : "Only a goalkeeper can replace a goalkeeper.";
    }
    if (target.kind !== "slot") return "";
    const incoming = latest.current.players.get(source.playerId);
    if (!incoming) return "";
    return canReplace(target.slot, incoming) ? null : "Only a goalkeeper can replace a goalkeeper.";
  }

  function substitute(current: Formation, slot: SlotRef, incomingId: number) {
    const incoming = latest.current.players.get(incomingId);
    const outgoingId = playerAt(current, slot);
    if (!incoming) return;
    const next = replaceAt(current, slot, incoming);
    if (next) {
      latest.current.onFormationChange(next, `${incoming.name} comes on for ${nameOf(outgoingId)}.`);
    }
  }

  function applyDrop(source: DragSource, target: DropTarget) {
    const current = latest.current.formation;
    const problem = dropProblem(source, target, current);
    if (problem !== null) {
      if (problem) latest.current.onNotice(problem);
      return;
    }
    if (source.kind === "pitch") {
      const movingId = playerAt(current, source.slot);
      if (target.kind === "slot") {
        const next = swapSlots(current, source.slot, target.slot);
        if (next) {
          latest.current.onFormationChange(
            next,
            `${nameOf(movingId)} and ${nameOf(playerAt(current, target.slot))} swap places.`,
          );
        }
      } else if (target.kind === "line") {
        const next = moveToLine(current, source.slot, target.line, target.index);
        if (next && next !== current) {
          const moved = source.slot.line === target.line ? "" : ` to ${LINE_LABELS[target.line].toLowerCase()}`;
          latest.current.onFormationChange(next, `${nameOf(movingId)} moves${moved}. Shape: ${formationLabel(next)}.`);
        }
      } else {
        substitute(current, source.slot, target.playerId);
      }
    } else if (target.kind === "slot") {
      substitute(current, target.slot, source.playerId);
    }
    latest.current.onSelectionChange(null);
  }

  /* ----------------------------------------------------------------- drag */

  function resolveTarget(x: number, y: number): DropTarget | null {
    const hit = document.elementFromPoint(x, y) as HTMLElement | null;
    const node = hit?.closest<HTMLElement>("[data-drop]");
    if (!node || !rootRef.current?.contains(node)) return null;
    const { drop, line, index, playerId } = node.dataset;
    if (drop === "slot") return { kind: "slot", slot: { line: line as Line, index: Number(index) } };
    if (drop === "bench") return { kind: "bench", playerId: Number(playerId) };
    if (drop === "line") {
      const tokens = Array.from(node.querySelectorAll<HTMLElement>('[data-drop="slot"]'));
      const before = tokens.filter((token) => {
        const rect = token.getBoundingClientRect();
        return rect.left + rect.width / 2 < x;
      }).length;
      return { kind: "line", line: line as Line, index: before };
    }
    return null;
  }

  function startDrag(event: ReactPointerEvent, source: DragSource) {
    if (event.button !== 0 || pending.current) return;
    // On touch the bench list needs to scroll, so bench players are tapped, not dragged.
    if (source.kind === "bench" && event.pointerType === "touch") return;
    pending.current = { source, startX: event.clientX, startY: event.clientY, pointerId: event.pointerId };

    const onMove = (moveEvent: PointerEvent) => {
      const start = pending.current;
      if (!start || moveEvent.pointerId !== start.pointerId) return;
      const { clientX: x, clientY: y } = moveEvent;
      if (!dragRef.current && Math.hypot(x - start.startX, y - start.startY) < DRAG_THRESHOLD_PX) return;
      updateDrag({ source: start.source, x, y, target: resolveTarget(x, y) });
    };

    const finish = (endEvent: PointerEvent, commit: boolean) => {
      const start = pending.current;
      if (!start || endEvent.pointerId !== start.pointerId) return;
      pending.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      const current = dragRef.current;
      updateDrag(null);
      if (!current) return;
      // The pointerup that ends a drag also fires a click on the token; ignore it.
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      const target = commit ? resolveTarget(endEvent.clientX, endEvent.clientY) : null;
      if (!target) return;
      if (current.source.kind === "pitch") landAtPointer(current.source.slot, endEvent.clientX, endEvent.clientY);
      applyDrop(current.source, target);
    };
    const onUp = (upEvent: PointerEvent) => finish(upEvent, true);
    const onCancel = (cancelEvent: PointerEvent) => finish(cancelEvent, false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  /** Makes a dropped starter glide from where it was released rather than from where it started. */
  function landAtPointer(slot: SlotRef, x: number, y: number) {
    const playerId = playerAt(latest.current.formation, slot);
    const element = playerId === undefined ? undefined : tokenEls.current.get(playerId);
    const pitch = pitchRef.current;
    if (playerId === undefined || !element || !pitch || !previousRects.current) return;
    const box = pitch.getBoundingClientRect();
    const size = element.getBoundingClientRect();
    previousRects.current.set(playerId, {
      x: (x - size.width / 2 - box.left) / box.width,
      y: (y - size.height * 0.35 - box.top) / box.height,
    });
  }

  /* ---------------------------------------------------------------- taps */

  function tapSlot(slot: SlotRef) {
    if (suppressClick.current) return;
    if (selection?.kind === "pitch") {
      if (sameSlot(selection.slot, slot)) {
        onSelectionChange(null);
        return;
      }
      if (canSwap(selection.slot, slot)) {
        applyDrop({ kind: "pitch", slot: selection.slot }, { kind: "slot", slot });
        return;
      }
    }
    if (selection?.kind === "bench") {
      const incoming = players.get(selection.playerId);
      if (incoming && canReplace(slot, incoming)) {
        applyDrop({ kind: "bench", playerId: selection.playerId }, { kind: "slot", slot });
        return;
      }
    }
    onSelectionChange({ kind: "pitch", slot });
    onNotice(`${nameOf(playerAt(formation, slot))} selected. Pick a bench player to bring on, or tap another starter to swap places.`);
  }

  function tapBench(playerId: number) {
    if (suppressClick.current) return;
    if (selection?.kind === "pitch") {
      const incoming = players.get(playerId);
      if (incoming && canReplace(selection.slot, incoming)) {
        applyDrop({ kind: "pitch", slot: selection.slot }, { kind: "bench", playerId });
        return;
      }
    }
    if (selection?.kind === "bench" && selection.playerId === playerId) {
      onSelectionChange(null);
      return;
    }
    onSelectionChange({ kind: "bench", playerId });
    onNotice(`${nameOf(playerId)} is ready to come on. Tap the starter they should replace.`);
  }

  /* ------------------------------------------------------- FLIP animation */

  useLayoutEffect(() => {
    const pitch = pitchRef.current;
    if (!pitch) return;
    const box = pitch.getBoundingClientRect();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = new Map<number, { x: number; y: number }>();
    for (const [playerId, element] of tokenEls.current) {
      if (!element.isConnected) continue;
      const rect = element.getBoundingClientRect();
      // Stored as fractions of the pitch so a resize between moves doesn't read as movement.
      const position = { x: (rect.left - box.left) / box.width, y: (rect.top - box.top) / box.height };
      next.set(playerId, position);
      const before = previousRects.current?.get(playerId);
      if (reduceMotion || previousRects.current === null) continue;
      if (before) {
        const dx = (before.x - position.x) * box.width;
        const dy = (before.y - position.y) * box.height;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
            duration: FLIP_MS,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          });
        }
      } else {
        element.animate(
          [
            { transform: "scale(0.4)", opacity: 0 },
            { transform: "scale(1.12)", opacity: 1, offset: 0.65 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    }
    previousRects.current = next;
  }, [formation]);

  useLayoutEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  /* --------------------------------------------------------------- render */

  const selectedSlot = selection?.kind === "pitch" ? selection.slot : null;
  const selectedBenchPlayer = selection?.kind === "bench" ? players.get(selection.playerId) : undefined;
  const dragSource = drag?.source ?? null;
  const dragPlayerId =
    dragSource?.kind === "pitch" ? playerAt(formation, dragSource.slot) : dragSource?.kind === "bench" ? dragSource.playerId : undefined;
  const dragPlayer = dragPlayerId === undefined ? undefined : players.get(dragPlayerId);
  // A tapped starter: lines it could join show a "+" spot. Not while dragging, where the
  // whole line lights up instead, because inserting spots would shift players under the pointer.
  const movingSlot = drag ? null : selectedSlot;

  function slotState(slot: SlotRef) {
    if (drag) {
      const target: DropTarget = { kind: "slot", slot };
      const ok = dropProblem(drag.source, target, formation) === null;
      const hover = drag.target?.kind === "slot" && sameSlot(drag.target.slot, slot);
      return { ok, hover: hover && ok, blocked: hover && !ok };
    }
    if (selectedSlot) return { ok: !sameSlot(selectedSlot, slot) && canSwap(selectedSlot, slot), hover: false, blocked: false };
    if (selectedBenchPlayer) return { ok: canReplace(slot, selectedBenchPlayer), hover: false, blocked: false };
    return { ok: false, hover: false, blocked: false };
  }

  const bench = benchFor(team.roster, formation, selectedSlot);
  const benchGroups = selectedSlot
    ? [{ line: null as Line | null, players: bench }]
    : LINES.map((line) => ({ line, players: bench.filter((player) => lineForPosition(player.position) === line) })).filter(
        (group) => group.players.length > 0,
      );
  const selectedStarter = selectedSlot ? players.get(playerAt(formation, selectedSlot) ?? -1) : undefined;

  return (
    <div className="pitch-editor" ref={rootRef} data-dragging={drag ? "true" : undefined}>
      <div className="pitch-stage">
        <div className="pitch-field" ref={pitchRef} data-entering={entering ? "true" : undefined}>
          <PitchMarkings />
          <span className="pitch-direction" aria-hidden="true">
            Attacking ↑
          </span>
          {LINES.map((line) => {
            const ids = formation[line];
            const canJoin = movingSlot !== null && movingSlot.line !== line && canMoveToLine(formation, movingSlot, line);
            const lineHover = drag?.target?.kind === "line" && drag.target.line === line;
            const lineOk = drag ? dropProblem(drag.source, { kind: "line", line, index: 0 }, formation) === null : false;
            const style = {
              top: `${LINE_Y[line]}%`,
              "--count": Math.max(ids.length + (canJoin ? 1 : 0), 1),
            } as CSSProperties;
            return (
              <div
                key={line}
                className={`pitch-line${lineHover && lineOk ? " is-line-hover" : ""}`}
                data-drop="line"
                data-line={line}
                style={style}
                role="group"
                aria-label={`${LINE_LABELS[line]}: ${ids.length} ${ids.length === 1 ? "player" : "players"}`}
              >
                {ids.map((playerId, index) => {
                  const player = players.get(playerId);
                  if (!player) return null;
                  const slot = { line, index };
                  const note = availabilityNote(player);
                  const isNew = !defaultSet.has(playerId);
                  const isSelected = selectedSlot !== null && sameSlot(selectedSlot, slot);
                  const isDragging = dragSource?.kind === "pitch" && sameSlot(dragSource.slot, slot);
                  const state = slotState(slot);
                  const classes = [
                    "pitch-token",
                    isSelected ? "is-selected" : "",
                    isDragging ? "is-dragging" : "",
                    state.ok ? "is-target" : "",
                    state.hover ? "is-target-hover" : "",
                    state.blocked ? "is-blocked" : "",
                    note ? "is-doubt" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <button
                      key={playerId}
                      ref={(element) => {
                        if (element) tokenEls.current.set(playerId, element);
                        else tokenEls.current.delete(playerId);
                      }}
                      type="button"
                      className={classes}
                      data-drop="slot"
                      data-line={line}
                      data-index={index}
                      style={{ "--order": LINES.indexOf(line) * 3 + index } as CSSProperties}
                      aria-pressed={isSelected}
                      aria-label={`${player.name}, ${POSITION_WORD[lineForPosition(player.position)]}${
                        note ? `, ${note}` : ""
                      }${isNew ? ", not in the projected XI" : ""}`}
                      title={note ?? undefined}
                      onPointerDown={(event) => startDrag(event, { kind: "pitch", slot })}
                      onClick={() => tapSlot(slot)}
                    >
                      <span className="pitch-token-shirt">
                        <Shirt kit={line === "gk" ? keeperKit : kit} label={initials(player.name)} />
                        {note ? (
                          <span className="pitch-token-flag" aria-hidden="true">
                            !
                          </span>
                        ) : null}
                        {isNew ? <span className="pitch-token-new" aria-hidden="true" /> : null}
                      </span>
                      <span className="pitch-token-name">{player.name}</span>
                    </button>
                  );
                })}
                {canJoin && movingSlot ? (
                  <button
                    type="button"
                    className={`pitch-add${lineHover ? " is-target-hover" : ""}`}
                    aria-label={`Move ${nameOf(playerAt(formation, movingSlot))} to ${LINE_LABELS[line].toLowerCase()}`}
                    onClick={() => applyDrop({ kind: "pitch", slot: movingSlot }, { kind: "line", line, index: ids.length })}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <aside className="bench-panel" aria-label={`${team.team.name} bench`}>
        <div className="bench-head">
          {selectedStarter ? (
            <>
              <p className="eyebrow">Substitution</p>
              <h4>Bring on for {selectedStarter.name}</h4>
              <p>Pick a replacement, or tap another starter to swap their places.</p>
              <button type="button" className="bench-cancel" onClick={() => onSelectionChange(null)}>
                Cancel
              </button>
            </>
          ) : selectedBenchPlayer ? (
            <>
              <p className="eyebrow">Ready to come on</p>
              <h4>{selectedBenchPlayer.name}</h4>
              <p>Tap the starter they should replace.</p>
              <button type="button" className="bench-cancel" onClick={() => onSelectionChange(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow">Bench</p>
              <h4>{bench.length} in the squad</h4>
              <p>Drag a player onto a starter, or tap a starter to sub them off.</p>
            </>
          )}
        </div>

        <div className="bench-list">
          {benchGroups.map((group) => (
            <section key={group.line ?? "fit"} className="bench-group">
              {group.line ? <h5>{GROUP_LABEL[group.line]}</h5> : null}
              <ul>
                {group.players.map((player) => {
                  const line = lineForPosition(player.position);
                  const note = availabilityNote(player);
                  const isSelected = selection?.kind === "bench" && selection.playerId === player.playerId;
                  const target: DropTarget = { kind: "bench", playerId: player.playerId };
                  const dropOk = drag?.source.kind === "pitch" && dropProblem(drag.source, target, formation) === null;
                  const dropHover = dropOk && drag?.target?.kind === "bench" && drag.target.playerId === player.playerId;
                  const isDragging = dragSource?.kind === "bench" && dragSource.playerId === player.playerId;
                  const fit = selectedSlot && line === selectedSlot.line;
                  return (
                    <li key={player.playerId}>
                      <button
                        type="button"
                        className={[
                          "bench-row",
                          isSelected ? "is-selected" : "",
                          isDragging ? "is-dragging" : "",
                          dropOk ? "is-target" : "",
                          dropHover ? "is-target-hover" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-drop="bench"
                        data-player-id={player.playerId}
                        aria-pressed={isSelected}
                        aria-label={`${player.name}, ${POSITION_WORD[line]}, form ${formText(player)}${note ? `, ${note}` : ""}`}
                        onPointerDown={(event) => startDrag(event, { kind: "bench", playerId: player.playerId })}
                        onClick={() => tapBench(player.playerId)}
                      >
                        <span className="bench-shirt">
                          <Shirt kit={line === "gk" ? keeperKit : kit} label={initials(player.name)} />
                        </span>
                        <span className="bench-name">
                          <strong>{player.name}</strong>
                          <small className={note ? "bench-note-doubt" : undefined}>
                            {note ?? `${player.recentStarts ?? 0} of last 5 started`}
                          </small>
                        </span>
                        <span className={`bench-pos${fit ? " bench-pos-fit" : ""}`}>{POSITION_SHORT[line]}</span>
                        <span className="bench-form">
                          <strong>{formText(player)}</strong>
                          <small>form</small>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {bench.length === 0 ? <p className="bench-empty">No eligible players on the bench.</p> : null}
        </div>
      </aside>

      {drag && dragPlayer ? (
        <div className="pitch-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          <span className="pitch-token-shirt">
            <Shirt
              kit={lineForPosition(dragPlayer.position) === "gk" ? keeperKit : kit}
              label={initials(dragPlayer.name)}
            />
          </span>
          <span className="pitch-token-name">{dragPlayer.name}</span>
        </div>
      ) : null}
    </div>
  );
}

