/**
 * Home shirt colours for the pitch view, keyed by badge slug. Clubs not listed
 * fall back to the site's home or away accent, so a newly promoted side still
 * renders, just without its own colours.
 */
export type Kit = {
  body: string;
  sleeves: string;
  /** Text drawn on the shirt. */
  ink: string;
  /** Vertical stripes in this colour over the body. */
  stripes?: string;
};

const CLUB_KITS: Record<string, Kit> = {
  arsenal: { body: "#db0007", sleeves: "#ffffff", ink: "#ffffff" },
  "aston-villa": { body: "#7a003c", sleeves: "#95bfe5", ink: "#ffffff" },
  bournemouth: { body: "#c8102e", sleeves: "#111111", ink: "#ffffff", stripes: "#111111" },
  brentford: { body: "#e30613", sleeves: "#e30613", ink: "#111111", stripes: "#ffffff" },
  brighton: { body: "#0057b8", sleeves: "#0057b8", ink: "#ffffff", stripes: "#ffffff" },
  burnley: { body: "#6c1d45", sleeves: "#99d6ea", ink: "#ffffff" },
  chelsea: { body: "#034694", sleeves: "#034694", ink: "#ffffff" },
  "coventry-city": { body: "#59cbe8", sleeves: "#59cbe8", ink: "#0b2341" },
  "crystal-palace": { body: "#1b458f", sleeves: "#1b458f", ink: "#ffffff", stripes: "#c4122e" },
  everton: { body: "#003399", sleeves: "#003399", ink: "#ffffff" },
  fulham: { body: "#f5f5f5", sleeves: "#111111", ink: "#111111" },
  "hull-city": { body: "#f5a12d", sleeves: "#111111", ink: "#111111", stripes: "#111111" },
  ipswich: { body: "#3a64a3", sleeves: "#ffffff", ink: "#ffffff" },
  "leeds-united": { body: "#f5f5f5", sleeves: "#f5f5f5", ink: "#1d428a" },
  leicester: { body: "#003090", sleeves: "#003090", ink: "#fdbe11" },
  liverpool: { body: "#c8102e", sleeves: "#c8102e", ink: "#ffffff" },
  "manchester-city": { body: "#6cabdd", sleeves: "#6cabdd", ink: "#1c2c5b" },
  "manchester-united": { body: "#da291c", sleeves: "#da291c", ink: "#ffffff" },
  newcastle: { body: "#f5f5f5", sleeves: "#111111", ink: "#111111", stripes: "#111111" },
  "nottingham-forest": { body: "#dd0000", sleeves: "#dd0000", ink: "#ffffff" },
  southampton: { body: "#d71920", sleeves: "#d71920", ink: "#111111", stripes: "#ffffff" },
  sunderland: { body: "#eb172b", sleeves: "#eb172b", ink: "#111111", stripes: "#ffffff" },
  tottenham: { body: "#f5f5f5", sleeves: "#f5f5f5", ink: "#132257" },
  "west-ham": { body: "#7a263a", sleeves: "#1bb1e7", ink: "#ffffff" },
  wolves: { body: "#fdb913", sleeves: "#fdb913", ink: "#231f20" },
};

const SIDE_KITS: Record<"home" | "away", Kit> = {
  home: { body: "#38bdf8", sleeves: "#0c4a6e", ink: "#04121c" },
  away: { body: "#a78bfa", sleeves: "#3b1f7a", ink: "#140a2e" },
};

const GOALKEEPER_KIT: Kit = { body: "#facc15", sleeves: "#1f1a0a", ink: "#1f1a0a" };
const GOALKEEPER_ALT_KIT: Kit = { body: "#2dd4bf", sleeves: "#06302b", ink: "#06302b" };

export function clubKit(badgeSlug: string, side: "home" | "away"): Kit {
  return CLUB_KITS[badgeSlug] ?? SIDE_KITS[side];
}

/** Keepers wear a contrasting shirt: yellow, or teal when the outfield shirt is already yellow-ish. */
export function goalkeeperKit(outfield: Kit): Kit {
  const yellowish = ["#fdb913", "#f5a12d", "#facc15"].includes(outfield.body.toLowerCase());
  return yellowish ? GOALKEEPER_ALT_KIT : GOALKEEPER_KIT;
}
