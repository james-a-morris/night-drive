import type { ReactNode } from "react";
import type { Metadata } from "next";
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

const title = "Night Rail: a little room for your thoughts";
const description =
  "A cozy train cabin for study and quiet thoughts. Pick a window seat, put on some lo-fi, and let the world pass by.";
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
  description,
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "Night Rail",
    title,
    description,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{
      url: "/opengraph-image",
      width: 1200,
      height: 630,
      alt: "Night Rail. Lo-fi + coffee. Let’s ride together. A moonlit window above the name on forest green.",
    }],
  },
};

export const viewport = { themeColor: "#21352f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
