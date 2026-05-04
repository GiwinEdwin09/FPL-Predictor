import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { loadDashboardResult } from "@/lib/dashboard";
import { summarizeGameweek } from "@/lib/gameweek";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FPL Predictor — Premier League fixture forecasts",
  description:
    "Gameweek-by-gameweek Premier League predictions, finished match stats, and pre-match context for fantasy and football fans.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const result = await loadDashboardResult();
  const summary = result.ok ? summarizeGameweek(result.data) : null;
  const generatedAtUtc = result.ok ? result.data.generatedAtUtc : null;

  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>
        <div className="app-shell">
          <SiteNav summary={summary} />
          <main className="app-main">{children}</main>
          <SiteFooter generatedAtUtc={generatedAtUtc} />
        </div>
      </body>
    </html>
  );
}
