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

export function formatKickoff(kickoffTime: string | null | undefined): string {
  if (!kickoffTime) return "Kickoff TBC";
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return "Kickoff TBC";
  return new Intl.DateTimeFormat("en-GB", KICKOFF_FORMAT).format(date);
}

export function formatKickoffWithZone(kickoffTime: string | null | undefined): string {
  if (!kickoffTime) return "Kickoff TBC";
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return "Kickoff TBC";
  return new Intl.DateTimeFormat("en-GB", KICKOFF_FORMAT_TZ).format(date);
}

export function formatMatchDate(kickoffTime: string | null | undefined): string {
  if (!kickoffTime) return "Date pending";
  const date = new Date(kickoffTime);
  if (Number.isNaN(date.getTime())) return "Date pending";
  return new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(date);
}

export function formatMetric(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(digits);
}
