import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { PAGE_BACKGROUND, SITE_DESCRIPTION } from "../components/brand.tsx";
import "../src/style.css";
import "../src/scenery-picker.css";
import "../src/cabin.css";
import "../src/auth.css";
import "../src/timer.css";
import "../src/welcome.css";
import "../src/about.css";
import "../src/dev-kit.css";
import "../src/anki.css";
import "../src/city-weather.css";
import "../src/train-picker.css";
import "../src/listening.css";

const title = "Night Rail: a little room for your thoughts";
const deploymentHost =
  process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_ORIGIN ||
      (deploymentHost
        ? `https://${deploymentHost}`
        : `http://localhost:${process.env.PORT || 5173}`),
  ),
  title,
  description: SITE_DESCRIPTION,
  applicationName: "Night Rail",
  // The manifest opens the home screen app without browser bars; these set its
  // iOS title and a translucent status bar, which the controls clear with the
  // safe-area insets.
  appleWebApp: {
    capable: true,
    title: "Night Rail",
    statusBarStyle: "black-translucent",
  },
  // Next.js now emits only mobile-web-app-capable, but Safari still keys the
  // status bar style and splash screens off Apple's older tag.
  other: { "apple-mobile-web-app-capable": "yes" },
  openGraph: {
    type: "website",
    siteName: "Night Rail",
    title,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: SITE_DESCRIPTION,
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "Night Rail. Lo-fi + coffee. Let’s ride together. A moonlit window above the name on forest green.",
    }],
  },
};

export const viewport: Viewport = {
  themeColor: PAGE_BACKGROUND,
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
