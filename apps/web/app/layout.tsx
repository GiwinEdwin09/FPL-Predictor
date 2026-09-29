import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { SiteFooter } from "@/components/site-footer";
import { AuthProvider } from "@/components/auth-provider";
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

const SITE_TITLE = "Prem Predict — Premier League match forecasts";
const SITE_DESCRIPTION =
  "Machine-learned Premier League predictions: calibrated HOME / DRAW / AWAY probabilities for every fixture, model explainability, and full forecast history.";

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "https://fpl-predictor-bay.vercel.app";
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Prem Predict",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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
        <AuthProvider>
        <div className="app-shell">
          <SiteNav summary={summary} />
          <main className="app-main">{children}</main>
          <SiteFooter generatedAtUtc={generatedAtUtc} />
        </div>
        </AuthProvider>
      </body>
    </html>
  );
}
