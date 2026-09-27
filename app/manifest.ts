import type { MetadataRoute } from "next";
import { APP_ICON_SIZES } from "../components/app-icon.tsx";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Night Rail",
    short_name: "Night Rail",
    description:
      "A cozy train cabin for study and quiet thoughts. Pick a window seat, put on some lo-fi, and let the world pass by.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Match the first paint so the launch splash fades straight into the cabin.
    background_color: "#081119",
    theme_color: "#081119",
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
