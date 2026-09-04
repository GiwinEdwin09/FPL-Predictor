import { BrandMark } from "@/components/ui/brand-mark";

function formatGenerated(generatedAtUtc: string | null): string {
  if (!generatedAtUtc) {
    return "Data unavailable";
  }
  const date = new Date(generatedAtUtc);
  if (Number.isNaN(date.getTime())) {
    return "Data unavailable";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function SiteFooter({ generatedAtUtc }: { generatedAtUtc: string | null }) {
  const updatedLabel = formatGenerated(generatedAtUtc);

  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <BrandMark />
          <span>Prem Predict</span>
        </div>

        <div className="site-footer-meta">
          <span>
            Data via{" "}
            <a href="https://github.com/olbauday/FPL-Core-Insights" target="_blank" rel="noreferrer">
              upstream match data
            </a>
          </span>
          <span className="site-footer-dot" aria-hidden="true">
            ·
          </span>
          <span>Updated {updatedLabel}</span>
          <span className="site-footer-dot" aria-hidden="true">
            ·
          </span>
          <a
            href="https://github.com/GiwinEdwin09/FPL-Predictor"
            target="_blank"
            rel="noreferrer"
          >
            Source on GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
