import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/predictions", label: "Predictions" },
  { href: "/history", label: "History" },
];

export function SiteNav() {
  return (
    <header className="site-header">
      <Link href="/" className="site-brand">
        Premier League Predictor
      </Link>
      <nav className="site-nav">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="site-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

