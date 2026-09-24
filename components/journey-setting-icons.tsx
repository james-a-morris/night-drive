import type { Seat } from "../src/types.ts";

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
      <path d={open ? "M6 18h16" : "M6 20h16"} />
      <rect
        x="8"
        y={open ? "18" : "5"}
        width="12"
        height={open ? "5" : "15"}
        rx="3"
        fill="currentColor"
        fillOpacity=".08"
        stroke="none"
      />
      {/* The arrow shows the action: raise to close, lower to open. */}
      <path d={open ? "M14 15V7m-3 3 3-3 3 3" : "M14 7v8m-3-3 3 3 3-3"} />
    </svg>
  );
}
