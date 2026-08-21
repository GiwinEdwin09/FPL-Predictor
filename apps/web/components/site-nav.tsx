"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import type { GameweekSummary } from "@/lib/gameweek";

const links = [
  { href: "/predictions", label: "Predictions" },
  { href: "/teams", label: "Teams" },
  { href: "/compare", label: "Compare" },
  { href: "/model-lab", label: "Model Lab" },
  { href: "/history", label: "History" },
  { href: "/beat-the-model", label: "Beat the Model" },
];

function isActive(pathname: string, href: string) {
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
      <span className="gameweek-chip" title="No active or upcoming matchweek">
        <span className="gameweek-chip-dot" aria-hidden="true" />
        <span className="gameweek-chip-muted">Season</span>
        finished
      </span>
    );
  }

  const statusLabel = summary.status === "live" ? "Live" : "Next";

  return (
    <span className="gameweek-chip" data-live={summary.status === "live"}>
      <span className="gameweek-chip-dot" aria-hidden="true" />
      <span className="gameweek-chip-muted">{statusLabel}</span>
      <strong>MW {summary.gameweek}</strong>
    </span>
  );
}

export function SiteNav({ summary }: { summary: GameweekSummary | null }) {
  const pathname = usePathname() ?? "/";
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link href="/" className="site-brand" onClick={() => setMenuOpen(false)}>
          <BrandMark />
          <span>
            Prem <span className="brand-wordmark-accent">Predict</span>
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

        <div className="header-meta">
          {summary ? <GameweekChip summary={summary} /> : null}
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="nav-toggle-box" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <nav
        id="mobile-navigation"
        className="mobile-nav"
        data-open={menuOpen}
        aria-label="Mobile"
      >
        <ul className="mobile-nav-list">
          <li>
            <Link
              href="/"
              className="mobile-nav-link"
              data-active={pathname === "/" ? true : undefined}
            >
              Home
              <span className="mobile-nav-index">00</span>
            </Link>
          </li>
          {links.map((link, index) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="mobile-nav-link"
                data-active={isActive(pathname, link.href) ? true : undefined}
              >
                {link.label}
                <span className="mobile-nav-index">{String(index + 1).padStart(2, "0")}</span>
              </Link>
            </li>
          ))}
        </ul>
        {summary ? (
          <div className="mobile-nav-meta">
            <GameweekChip summary={summary} />
          </div>
        ) : null}
      </nav>
    </header>
  );
}
