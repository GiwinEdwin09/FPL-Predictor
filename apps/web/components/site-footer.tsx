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
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M12 5.5L15.7 8.2L14.3 12.5H9.7L8.3 8.2L12 5.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
                fill="currentColor"
                fillOpacity="0.18"
              />
              <path d="M12 12.5V18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M9.7 12.5L7 16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M14.3 12.5L17 16" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </span>
          <span>FPL Predictor</span>
        </div>

        <div className="site-footer-meta">
          <span>
            Data via the official{" "}
            <a href="https://fantasy.premierleague.com/api/" target="_blank" rel="noreferrer">
              FPL API
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
