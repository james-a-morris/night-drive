import type { MetadataRoute } from "next";
import { APP_ICON_SIZES } from "../components/app-icon.tsx";
import { PAGE_BACKGROUND, SITE_DESCRIPTION } from "../components/brand.tsx";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Night Rail",
    short_name: "Night Rail",
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Match the first paint so the launch splash fades straight into the cabin.
    background_color: PAGE_BACKGROUND,
    theme_color: PAGE_BACKGROUND,
    lang: "en",
    // The square PNGs rather than the tall favicon SVG, which launchers would letterbox.
    icons: APP_ICON_SIZES.flatMap((size) => (["any", "maskable"] as const).map((purpose) => ({
      src: `/app-icon/${size}`,
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose,
    }))),
  };
}
