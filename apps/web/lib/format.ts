/** Kickoffs render in UK time until the browser reports the viewer's own zone. */
export const DEFAULT_TIME_ZONE = "Europe/London";

const KICKOFF_FORMAT = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
} as const;

const TIME_FORMAT = { hour: "2-digit", minute: "2-digit" } as const;

const DAY_HEADING_FORMAT = { weekday: "long", day: "numeric", month: "long" } as const;

const DATE_FORMAT = { day: "numeric", month: "short", year: "numeric" } as const;

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDateTime(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

/** e.g. "Fri 23 Oct, 20:00". */
export function formatKickoff(kickoffTime: string | null | undefined, timeZone = DEFAULT_TIME_ZONE): string {
  if (!kickoffTime) return "Kickoff TBC";
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return "Kickoff TBC";
  // Assembled from parts: Node and browsers ship different CLDR patterns for this combination
  // ("Fri 23 Oct, 20:00" vs "Fri, 23 Oct, 20:00"), and any difference breaks hydration.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { ...KICKOFF_FORMAT, timeZone })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}

export function formatKickoffTime(kickoffTime: string | null | undefined, timeZone = DEFAULT_TIME_ZONE): string {
  return formatDateTime(kickoffTime, { ...TIME_FORMAT, timeZone }, "TBC");
}

/** e.g. "Saturday 17 October". */
export function formatDayHeading(kickoffTime: string | null | undefined, timeZone = DEFAULT_TIME_ZONE): string {
  return formatDateTime(kickoffTime, { ...DAY_HEADING_FORMAT, timeZone }, "Date to be confirmed");
}

/** Calendar day (YYYY-MM-DD) of a kickoff in the given zone, or null when unscheduled. */
export function kickoffDayKey(kickoffTime: string | null | undefined, timeZone = DEFAULT_TIME_ZONE): string | null {
  if (!kickoffTime) return null;
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(date);
}

/** Short zone name for a moment, e.g. "BST", "GMT" or "GMT+2". */
export function timeZoneLabel(kickoffTime: string | null | undefined, timeZone = DEFAULT_TIME_ZONE): string {
  const date = kickoffTime ? new Date(kickoffTime) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((entry) => entry.type === "timeZoneName");
  return part?.value ?? "";
}

/** Match day in UK time, so server and browser agree whatever the viewer's zone. */
export function formatMatchDate(kickoffTime: string | null | undefined, options: Intl.DateTimeFormatOptions = DATE_FORMAT): string {
  return formatDateTime(kickoffTime, { ...options, timeZone: DEFAULT_TIME_ZONE }, "Date pending");
}

export function formatMetric(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}
