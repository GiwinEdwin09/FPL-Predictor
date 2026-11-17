"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

type FixtureModalProps = {
  /** The element the box grows out of on open and shrinks back into on close. */
  originRef: RefObject<HTMLElement | null>;
  labelledBy: string;
  onClose: () => void;
  /** Runs on Escape before closing; return true to stay open (e.g. to drop a selection first). */
  onEscape?: () => boolean;
  children: ReactNode;
};

const OPEN_MS = 420;
const CLOSE_MS = 260;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const PANEL_RADIUS = "22px";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/** A clip-path that shows only the part of the panel sitting over the origin element. */
function originClip(panel: HTMLElement, origin: HTMLElement | null): string | null {
  if (!origin?.isConnected) return null;
  const box = panel.getBoundingClientRect();
  const from = origin.getBoundingClientRect();
  if (from.bottom < 0 || from.top > window.innerHeight || from.width === 0) return null;
  const top = clamp(from.top - box.top, 0, box.height - 24);
  const bottom = clamp(box.bottom - from.bottom, 0, box.height - top - 24);
  const left = clamp(from.left - box.left, 0, box.width - 24);
  const right = clamp(box.right - from.right, 0, box.width - left - 24);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round 16px)`;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Modal box for one fixture, layered over the page with the native <dialog>
 * (focus is trapped and returned, the rest of the page is inert). It opens by
 * growing out of the fixture row that was clicked.
 */
export function FixtureModal({ originRef, labelledBy, onClose, onEscape, children }: FixtureModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const pressStartedOnScrim = useRef(false);
  const latest = useRef({ onClose, onEscape });
  latest.current = { onClose, onEscape };

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel) return;
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add("has-modal");

    if (!prefersReducedMotion()) {
      const clip = originClip(panel, originRef.current);
      panel.animate(
        clip
          ? [
              { clipPath: clip, opacity: 0.6 },
              { clipPath: `inset(0px 0px 0px 0px round ${PANEL_RADIUS})`, opacity: 1 },
            ]
          : [
              { transform: "translateY(16px) scale(0.98)", opacity: 0 },
              { transform: "none", opacity: 1 },
            ],
        { duration: OPEN_MS, easing: EASE_OUT },
      );
      panel.querySelector(".match-modal-body")?.animate(
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: OPEN_MS, delay: 90, easing: EASE_OUT, fill: "backwards" },
      );
    }
    scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });

    return () => {
      document.documentElement.classList.remove("has-modal");
      if (dialog.open) dialog.close();
    };
    // Runs once per mount: the modal is only rendered while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function requestClose() {
    const dialog = dialogRef.current;
    const panel = panelRef.current;
    if (!dialog || !panel || closing.current) return;
    closing.current = true;
    const finish = () => {
      if (dialog.open) dialog.close();
    };
    if (prefersReducedMotion()) {
      finish();
      return;
    }
    const clip = originClip(panel, originRef.current);
    const animation = panel.animate(
      clip
        ? [
            { clipPath: `inset(0px 0px 0px 0px round ${PANEL_RADIUS})`, opacity: 1 },
            { clipPath: clip, opacity: 0.4 },
          ]
        : [
            { transform: "none", opacity: 1 },
            { transform: "translateY(12px) scale(0.98)", opacity: 0 },
          ],
      { duration: CLOSE_MS, easing: EASE_IN, fill: "forwards" },
    );
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, fill: "forwards" });
    animation.onfinish = finish;
    animation.oncancel = finish;
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // The close event is queued, so a dev-mode remount may have reopened the dialog by the time it lands.
    const handleClose = () => {
      if (!dialog.open) latest.current.onClose();
    };
    // Android back gesture and other close requests that skip the keydown below.
    const handleCancel = (event: Event) => {
      event.preventDefault();
      requestClose();
    };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="match-modal"
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Handling it here stops the browser's own instant close, so the box can animate shut.
        event.preventDefault();
        if (latest.current.onEscape?.()) return;
        requestClose();
      }}
    >
      <div
        ref={scrimRef}
        className="match-modal-scrim"
        aria-hidden="true"
        onPointerDown={() => {
          pressStartedOnScrim.current = true;
        }}
        onClick={() => {
          // Ignore clicks that began inside the box, e.g. a player dragged out past its edge.
          if (pressStartedOnScrim.current) requestClose();
          pressStartedOnScrim.current = false;
        }}
      />
      <div
        ref={panelRef}
        className="match-modal-panel"
        onPointerDown={() => {
          pressStartedOnScrim.current = false;
        }}
      >
        <button type="button" className="match-modal-close" onClick={requestClose} aria-label="Close match details">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {children}
      </div>
    </dialog>
  );
}
