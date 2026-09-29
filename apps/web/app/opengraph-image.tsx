import { promises as fs } from "node:fs";
import path from "node:path";

import { ImageResponse } from "next/og";

import { loadDashboardResult, type UpcomingFixture } from "@/lib/dashboard";
import { fixturesForGameweek, sortByKickoff, summarizeGameweek } from "@/lib/gameweek";

export const alt = "Prem Predict — Premier League match forecasts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COLORS = {
  bg: "#09080f",
  ink: "#ffffff",
  muted: "rgba(255, 255, 255, 0.62)",
  accent: "#00ff85",
  home: "#38bdf8",
  draw: "#fbbf24",
  away: "#a78bfa",
};

async function crestDataUri(badgePath: string | null): Promise<string | null> {
  if (!badgePath) return null;
  try {
    const file = await fs.readFile(path.join(process.cwd(), "public", badgePath));
    return `data:image/png;base64,${file.toString("base64")}`;
  } catch {
    return null;
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "rgba(0, 255, 133, 0.12)",
          border: "2px solid rgba(0, 255, 133, 0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9.25" stroke={COLORS.accent} strokeWidth="1.5" />
          <path
            d="M12 5.5L15.7 8.2L14.3 12.5H9.7L8.3 8.2L12 5.5Z"
            stroke={COLORS.accent}
            strokeWidth="1.4"
            strokeLinejoin="round"
            fill={COLORS.accent}
            fillOpacity="0.18"
          />
          <path d="M12 12.5V18" stroke={COLORS.accent} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M9.7 12.5L7 16" stroke={COLORS.accent} strokeWidth="1.3" strokeLinecap="round" />
          <path d="M14.3 12.5L17 16" stroke={COLORS.accent} strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: COLORS.ink }}>
        Prem&nbsp;<span style={{ color: COLORS.accent }}>Predict</span>
      </div>
    </div>
  );
}

async function MatchCard({ fixture }: { fixture: UpcomingFixture }) {
  const [homeCrest, awayCrest] = await Promise.all([
    crestDataUri(fixture.homeTeam.badgePath),
    crestDataUri(fixture.awayTeam.badgePath),
  ]);
  const { homeWin, draw, awayWin } = fixture.probabilities;
  const segments = [
    { value: homeWin, color: COLORS.home, label: fixture.homeTeam.shortName },
    { value: draw, color: COLORS.draw, label: "DRAW" },
    { value: awayWin, color: COLORS.away, label: fixture.awayTeam.shortName },
  ];

  const team = (name: string, crest: string | null) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 300 }}>
      {crest ? <img src={crest} width={132} height={132} alt="" /> : <div style={{ width: 132, height: 132 }} />}
      <div style={{ fontSize: 38, fontWeight: 700, color: COLORS.ink }}>{name}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", fontSize: 22, letterSpacing: 4, color: COLORS.accent, fontWeight: 700 }}>
        {`MATCH OF THE WEEK · MW ${fixture.gameweek ?? "?"}`}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {team(fixture.homeTeam.name, homeCrest)}
        <div style={{ fontSize: 28, color: COLORS.muted, fontWeight: 700 }}>VS</div>
        {team(fixture.awayTeam.name, awayCrest)}
      </div>
      <div style={{ display: "flex", height: 18, borderRadius: 9, overflow: "hidden" }}>
        {segments.map((segment) => (
          <div key={segment.label} style={{ width: `${segment.value * 100}%`, background: segment.color }} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {segments.map((segment) => (
          <div key={segment.label} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontSize: 48, fontWeight: 700, color: COLORS.ink }}>{pct(segment.value)}</span>
            <span style={{ fontSize: 22, fontWeight: 700, color: segment.color }}>{segment.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function OpenGraphImage() {
  const result = await loadDashboardResult();
  let spotlight: UpcomingFixture | null = null;
  if (result.ok) {
    const summary = summarizeGameweek(result.data);
    spotlight = sortByKickoff(fixturesForGameweek(result.data, summary.gameweek))[0] ?? null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 72px",
          background: `radial-gradient(circle at 20% 0%, #2a1240 0%, ${COLORS.bg} 60%)`,
          color: COLORS.ink,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Brand />
          <div style={{ fontSize: 24, color: COLORS.muted }}>Premier League forecasts</div>
        </div>

        {spotlight ? (
          await MatchCard({ fixture: spotlight })
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 84, fontWeight: 700 }}>Predict the Weekend.</div>
            <div style={{ fontSize: 32, color: COLORS.muted }}>
              Calibrated HOME / DRAW / AWAY probabilities for every Premier League fixture.
            </div>
          </div>
        )}
      </div>
    ),
    size,
  );
}
