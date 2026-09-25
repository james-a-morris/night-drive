import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { BrandEmblem } from "../components/brand.tsx";

export const alt = "Night Rail. Lo-fi + coffee. Let’s ride together. A moonlit window above the name on forest green.";
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
          width: "100%",
          height: "100%",
          background: "radial-gradient(ellipse at center, #2c443b 0%, #192e28 100%)",
          color: "#e6d8bc",
          fontFamily: "Byline",
        }}
      >
        <div style={{
          display: "flex",
          position: "absolute",
          top: 28,
          right: 28,
          bottom: 28,
          left: 28,
          border: "1px solid #526052",
          borderRadius: 18,
        }} />
        {/* Keep the entire lockup inside the central square for compact previews. */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: 550,
          height: "100%",
          paddingBottom: 12,
        }}>
          <BrandEmblem emblemWidth={112} emblemHeight={140} />
          <span style={{
            marginTop: 14,
            fontFamily: "Wordmark",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 108,
            letterSpacing: "-0.015em",
            lineHeight: 1.15,
          }}>
            Night Rail
          </span>
          <span style={{ marginTop: 28, fontSize: 27, color: "#c4cbb9" }}>
            Lo-fi + coffee.
          </span>
          <span style={{ marginTop: 6, fontSize: 27, color: "#c4cbb9" }}>
            Let’s ride together.
          </span>
        </div>
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
