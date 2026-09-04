const KICKOFF_FORMAT = {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
} as const;

const KICKOFF_FORMAT_TZ = { ...KICKOFF_FORMAT, timeZoneName: "short" } as const;

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

export function formatKickoff(kickoffTime: string | null | undefined): string {
  return formatDateTime(kickoffTime, KICKOFF_FORMAT, "Kickoff TBC");
}

export function formatKickoffWithZone(kickoffTime: string | null | undefined): string {
  return formatDateTime(kickoffTime, KICKOFF_FORMAT_TZ, "Kickoff TBC");
}

export function formatMatchDate(kickoffTime: string | null | undefined): string {
  return formatDateTime(kickoffTime, DATE_FORMAT, "Date pending");
}

export function formatMetric(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}
