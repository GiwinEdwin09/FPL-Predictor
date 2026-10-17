"use client";

/** Shown when the account service can't be reached, so pages never sit on "Checking your account…". */
export function AccountUnavailable({ compact = false }: { compact?: boolean }) {
  if (compact) return <p className="account-note" role="status">Accounts are temporarily unavailable, so saving is off for now. Your current selections still work.</p>;
  return <div className="account-card" role="status">
    <h2>Accounts are temporarily unavailable</h2>
    <p>We can’t reach the account service right now. Saved lineups are safe and will be back once it reconnects. Forecasts and lineup tools still work.</p>
    <button type="button" className="account-signout" onClick={() => window.location.reload()}>Try again</button>
  </div>;
}
