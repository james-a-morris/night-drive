// Shared by the page metadata, the install manifest and the generated images.
export const SITE_DESCRIPTION =
  "A cozy train cabin for study and quiet thoughts. Pick a window seat, put on some lo-fi, and let the world pass by.";
// The first paint, matching --page-background in src/style.css.
export const PAGE_BACKGROUND = "#081119";
// The emblem's moonlit card, for the social preview and home screen icons.
export const EMBLEM_BACKDROP = "radial-gradient(ellipse at center, #2c443b 0%, #192e28 100%)";
export const EMBLEM_INK = "#e6d8bc";

export function BrandEmblem({
  emblemWidth = 29,
  emblemHeight = 36,
}: {
  emblemWidth?: number;
  emblemHeight?: number;
} = {}) {
  return (
    <svg
      className="brand-emblem"
      width={emblemWidth}
      height={emblemHeight}
      viewBox="0 0 32 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 34V15a11 11 0 0 1 22 0v19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path d="M20 9a5 5 0 1 0 3 8 5 5 0 0 1-3-8Z" fill="currentColor" />
      <path
        d="M11 35c0-8 10-6 10-12M16 35c0-7 7-7 5-12"
        stroke="currentColor"
        strokeWidth=".8"
      />
      <circle cx="11" cy="21" r=".7" fill="currentColor" />
    </svg>
  );
}

export default function Brand(props: {
  emblemWidth?: number;
  emblemHeight?: number;
} = {}) {
  return (
    <>
      <BrandEmblem {...props} />
      <span className="brand-wordmark">Night Rail</span>
    </>
  );
}
