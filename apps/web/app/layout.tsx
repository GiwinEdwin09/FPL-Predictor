import type { Metadata, Viewport } from "next";
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
  title: "Prem Predict — Premier League match forecasts",
  description:
    "Machine-learned Premier League predictions: calibrated HOME / DRAW / AWAY probabilities for every fixture, model explainability, and full forecast history.",
};

export const viewport: Viewport = {
  themeColor: "#09080f",
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
