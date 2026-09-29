const ANCHOR_PREFIX = "fixture-";

/** DOM id of a fixture's prediction card on /predictions. */
export function fixtureAnchorId(matchId: string): string {
  return `${ANCHOR_PREFIX}${matchId}`;
}

/** Link straight to one fixture's prediction card. */
export function fixtureHref(matchId: string): string {
  return `/predictions#${fixtureAnchorId(matchId)}`;
}

/** Match id encoded in a `#fixture-…` location hash, or null. */
export function matchIdFromHash(hash: string): string | null {
  const prefix = `#${ANCHOR_PREFIX}`;
  if (!hash.startsWith(prefix)) return null;
  const matchId = decodeURIComponent(hash.slice(prefix.length));
  return matchId.length > 0 ? matchId : null;
}
