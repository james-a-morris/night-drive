import { ImageResponse } from "next/og";
import { BrandEmblem, EMBLEM_BACKDROP, EMBLEM_INK } from "./brand.tsx";

// The sizes Android and desktop browsers require before offering to install.
export const APP_ICON_SIZES = [192, 512] as const;

// Home screen icons fill the whole square: iOS and Android round or crop the
// corners themselves. The emblem stays inside the central 80% circle that
// Android keeps for maskable icons.
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: EMBLEM_BACKDROP,
          color: EMBLEM_INK,
        }}
      >
        <BrandEmblem
          emblemWidth={Math.round(size * 0.4)}
          emblemHeight={Math.round(size * 0.5)}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
