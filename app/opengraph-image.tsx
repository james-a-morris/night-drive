import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Brand from "../components/brand.tsx";

export const alt = "Night Rail. Lo-fi + coffee. Let’s ride together. Logo and text on a dark green background.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const [wordmark, byline] = await Promise.all([
  readFile(join(process.cwd(), "public/assets/night-rail-wordmark.ttf")),
  readFile(join(process.cwd(), "public/assets/social-byline.ttf")),
]);

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          width: "100%",
          height: "100%",
          background: "#21352f",
          color: "#e6d8bc",
          fontFamily: "Byline",
        }}
      >
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 48,
          fontFamily: "Wordmark",
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: 144,
          letterSpacing: "-0.015em",
        }}>
          <Brand emblemWidth={132} emblemHeight={162} />
        </div>
        <span style={{ fontSize: 30, color: "#c4cbb9" }}>
          Lo-fi + coffee. Let’s ride together.
        </span>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Wordmark", data: wordmark, weight: 300, style: "italic" },
        { name: "Byline", data: byline, weight: 400, style: "normal" },
      ],
    },
  );
}
