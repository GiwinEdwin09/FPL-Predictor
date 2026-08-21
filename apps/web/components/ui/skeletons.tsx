export function PredictionCardSkeleton() {
  return (
    <div className="fixture-card skeleton-card" aria-hidden="true">
      <div className="skeleton-line skeleton-line-short" style={{ marginBottom: 0 }} />
      <div className="fixture-clubs" style={{ gridTemplateColumns: "1fr auto 1fr", gap: "0.75rem" }}>
        <div className="club-stack">
          <span className="skeleton-pill" style={{ width: 56, height: 56, borderRadius: 14 }} />
          <div>
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-short" style={{ marginBottom: 0 }} />
          </div>
        </div>
        <span className="skeleton-pill" style={{ width: 34, height: 34, borderRadius: 999 }} />
        <div className="club-stack club-stack-away">
          <div>
            <div className="skeleton-line skeleton-line-title" />
            <div className="skeleton-line skeleton-line-short" style={{ marginBottom: 0 }} />
          </div>
          <span className="skeleton-pill" style={{ width: 56, height: 56, borderRadius: 14 }} />
        </div>
      </div>
      <div>
        <div className="skeleton-line skeleton-line-short" style={{ marginBottom: "0.5rem" }} />
        <div className="skeleton-probbar" />
      </div>
    </div>
  );
}
