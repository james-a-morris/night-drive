import type { Seat, SeatDirection } from "../src/types.ts";

export function TrainDirectionIcon({ direction }: { direction: SeatDirection }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={direction === "backward" ? "translate(28 0) scale(-1 1)" : undefined}>
        <path d="M7 5h13m-3-3 3 3-3 3" opacity=".65" />
        <path d="M4 11h13a4 4 0 0 1 3.4 1.9l3.1 5a2 2 0 0 1-1.7 3.1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" />
        <path d="M17 11v6h6M7 14v3h5v-3H7Z" />
        <path d="M6 21v2m12-2v2M3 25h22" opacity=".65" />
      </g>
    </svg>
  );
}

export function DistanceIcon() {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="10" width="22" height="12" rx="2.5" />
      <path d="M8 10v5m6-5v8m6-8v5" />
      <path d="M5 5h18M7 3 5 5l2 2m14-4 2 2-2 2" opacity=".65" />
    </svg>
  );
}

export function SeatIcon({ side }: { side: Seat }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g transform={side === "right" ? "translate(28 0) scale(-1 1)" : undefined}>
        <rect x="3" y="4" width="5" height="15" rx="2.5" opacity=".65" />
        <path d="M5.5 7v4" opacity=".4" />
        <rect x="13" y="6" width="9" height="10" rx="2.5" />
        <path d="M11 14v4.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V14M13 17h9M14 21v2m7-2v2" />
      </g>
    </svg>
  );
}

export function WindowIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="3" width="16" height="22" rx="5" />
      <path d={open ? "M6 9h16" : "M6 20h16"} />
      <rect
        x="8"
        y="5"
        width="12"
        height={open ? "4" : "15"}
        rx="3"
        fill="currentColor"
        fillOpacity=".08"
        stroke="none"
      />
      {/* The arrow shows the action: raise to open, lower to close. */}
      <path d={open ? "M14 13v8m-3-3 3 3 3-3" : "M14 17V7m-3 3 3-3 3 3"} />
    </svg>
  );
}

export function CitySyncIcon({ synced }: { synced: boolean }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="16" r="7" />
      <path d="M10.5 12v4l3 1.5" />
      <path d="M10.5 23v2M5.5 25h10" opacity=".65" />
      <circle cx="21.5" cy="6" r="2.5" fill="currentColor" fillOpacity={synced ? ".12" : "0"} />
      <path d="M21.5 1v1M26.5 6h-1M25 2.5l-.7.7M18 2.5l.7.7" opacity=".65" />
      <path d={synced ? "M17.5 16h3a3 3 0 0 0 3-3v-2" : "M17.5 16h1M23.5 12v-1"} opacity={synced ? ".8" : ".5"} />
    </svg>
  );
}
