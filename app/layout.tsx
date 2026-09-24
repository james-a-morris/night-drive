import type { ReactNode } from "react";
import "../src/style.css";
import "../src/scenery-picker.css";
import "../src/cabin.css";
import "../src/auth.css";
import "../src/timer.css";
import "../src/welcome.css";
import "../src/about.css";
import "../src/dev-kit.css";

export const metadata = {
  title: "Night Line — a little room for your thoughts",
  description:
    "A cozy train cabin for study and quiet thoughts. Pick a window seat, put on some lo-fi, and let the world pass by.",
  icons: { icon: "/icon.svg" },
};

export const viewport = { themeColor: "#21352f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
