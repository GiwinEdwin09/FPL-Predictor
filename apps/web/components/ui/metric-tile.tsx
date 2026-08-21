import type { ReactNode } from "react";

type MetricTileProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  accent?: boolean;
};

export function MetricTile({ label, value, hint, accent = false }: MetricTileProps) {
  return (
    <article className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className={`stat-tile-value${accent ? " accented" : ""}`}>{value}</div>
      {hint ? <div className="stat-tile-hint">{hint}</div> : null}
    </article>
  );
}
