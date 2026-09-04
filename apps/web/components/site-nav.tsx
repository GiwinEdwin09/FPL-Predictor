"use client";

import Link from "next/link";

import { BrandMark } from "@/components/ui/brand-mark";
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
