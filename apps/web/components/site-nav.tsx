"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { GameweekSummary } from "@/lib/gameweek";
import { formatDeadlineShort } from "@/lib/gameweek";

const links = [
  { href: "/", label: "Home" },
  { href: "/predictions", label: "Predictions" },
  { href: "/history", label: "History" },
];

function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandMark() {
  return (
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
  );
}

function GameweekChip({ summary }: { summary: GameweekSummary }) {
  if (summary.gameweek === null) {
    return (
      <span className="gameweek-chip" title="No active or upcoming gameweek">
        <span className="gameweek-chip-dot" aria-hidden="true" />
        Season finished
      </span>
    );
  }

  const deadlineLabel = formatDeadlineShort(summary.deadlineUtc);
  const statusLabel = summary.status === "live" ? "Live" : "Next";

  return (
    <span className="gameweek-chip" title={deadlineLabel ? `Deadline ${deadlineLabel} UTC` : undefined}>
      <span className="gameweek-chip-dot" aria-hidden="true" />
      <span className="gameweek-chip-muted">{statusLabel}</span>
      <strong>GW {summary.gameweek}</strong>
      {deadlineLabel ? (
        <>
          <span className="gameweek-chip-divider">·</span>
          <span className="gameweek-chip-muted">{deadlineLabel}</span>
        </>
      ) : null}
    </span>
  );
}

export function SiteNav({ summary }: { summary: GameweekSummary | null }) {
  const pathname = usePathname() ?? "/";

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <BrandMark />
          <span>
            FPL <span className="brand-wordmark-accent">Predictor</span>
          </span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="site-nav-link"
              data-active={isActive(pathname, link.href)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="header-meta">{summary ? <GameweekChip summary={summary} /> : null}</div>
      </div>
    </header>
  );
}
