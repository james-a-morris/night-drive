import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const artwork = await readFile(join(process.cwd(), "app/icon.svg"), "base64");

// The sizes Android and desktop browsers require before offering to install.
export const APP_ICON_SIZES = [192, 512] as const;

// Home screen icons fill the whole square: iOS and Android round or crop the
// corners themselves. The emblem stays inside the central 80% circle that
// Android keeps for maskable icons.
export function renderAppIcon(size: number) {
  return new ImageResponse(
    (
      <img
        alt=""
        src={`data:image/svg+xml;base64,${artwork}`}
        width={size}
        height={size}
      />
    ),
    { width: size, height: size },
  );
}
