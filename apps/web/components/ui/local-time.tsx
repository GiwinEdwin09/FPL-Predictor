"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";

import {
  DEFAULT_TIME_ZONE,
  formatDayHeading,
  formatKickoff,
  formatKickoffTime,
  kickoffDayKey,
  timeZoneLabel,
} from "@/lib/format";

function subscribe() {
  return () => {};
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * The viewer's IANA time zone. The server and the first client render use UK
 * time so hydration matches; React then re-renders with the browser's zone.
 */
export function useViewerTimeZone(): string {
  return useSyncExternalStore(subscribe, browserTimeZone, () => DEFAULT_TIME_ZONE);
}

type LocalTimeVariant = "kickoff" | "time" | "day";

const FORMATTERS: Record<LocalTimeVariant, (value: string | null, timeZone: string) => string> = {
  kickoff: formatKickoff,
  time: formatKickoffTime,
  day: formatDayHeading,
};

/** A kickoff rendered in the viewer's own time zone. */
export function LocalTime({
  value,
  variant = "kickoff",
  withZone = false,
}: {
  value: string | null;
  variant?: LocalTimeVariant;
  withZone?: boolean;
}) {
  const timeZone = useViewerTimeZone();
  const text = FORMATTERS[variant](value, timeZone);
  return (
    <time dateTime={value ?? undefined}>
      {withZone && value ? `${text} ${timeZoneLabel(value, timeZone)}` : text}
    </time>
  );
}

type Dated = { matchId: string; kickoffTime: string | null };

/** Splits fixtures, in kickoff order, into the viewer's calendar days; unscheduled ones go last. */
export function DayGroups<T extends Dated>({
  fixtures,
  children,
}: {
  fixtures: T[];
  children: (fixture: T) => ReactNode;
}) {
  const timeZone = useViewerTimeZone();
  const ordered = [...fixtures].sort((left, right) => (left.kickoffTime ?? "").localeCompare(right.kickoffTime ?? ""));
  const groups = new Map<string, T[]>();
  for (const fixture of ordered) {
    const key = kickoffDayKey(fixture.kickoffTime, timeZone) ?? "unscheduled";
    groups.set(key, [...(groups.get(key) ?? []), fixture]);
  }
  const keys = Array.from(groups.keys()).sort((left, right) =>
    left === "unscheduled" ? 1 : right === "unscheduled" ? -1 : left.localeCompare(right),
  );

  return (
    <div className="day-groups">
      {keys.map((key) => {
        const dayFixtures = groups.get(key) ?? [];
        return (
          <section key={key} className="day-group" aria-label={formatDayHeading(dayFixtures[0]?.kickoffTime, timeZone)}>
            <h3 className="day-group-title">{formatDayHeading(dayFixtures[0]?.kickoffTime, timeZone)}</h3>
            <div className="day-group-rows">
              {dayFixtures.map((fixture) => (
                <Fragment key={fixture.matchId}>{children(fixture)}</Fragment>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
