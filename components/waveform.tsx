import { useEffect, useId, useState } from "react";
import { reducedMotion } from "../src/motion.ts";

const bars = Array.from({ length: 32 }, (_, index) => {
  const seed = Math.sin((index + 1) * 127.1) * 43758.5453;
  return 0.2 + 0.8 * (seed - Math.floor(seed));
});
function waveform(phase: number, amplitude: number) {
  return bars
    .map((bar, index) => {
      const x = ((index + 0.5) / bars.length) * 120;
      const height =
        0.4 +
        amplitude *
          (1 + 2.7 * bar) *
          (0.7 + 0.3 * Math.sin(phase + index * 0.6));
      return `M${x.toFixed(2)} ${(8 - height).toFixed(2)}V${(8 + height).toFixed(2)}`;
    })
    .join(" ");
}

// Decorative rhythm; live stations need not allow access to their audio samples.
export default function Waveform({ playing, train = false }: { playing: boolean; train?: boolean }) {
  const [path, setPath] = useState(() => waveform(0, 0));
  const windows = useId();
  useEffect(() => {
    const preference = reducedMotion();
    let frame = 0,
      previous = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - previous < 1000 / (train ? 12 : 24)) return;
      previous = now;
      setPath(waveform((now / 1000) * (train ? 0.55 : 0.9), 1));
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      if (playing && !preference.matches) frame = requestAnimationFrame(draw);
      else setPath(waveform(0, playing ? 0.65 : 0));
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [playing, train]);
  return (
    <svg
      className={`radio-waveform${playing ? " is-playing" : ""}${train ? " is-train" : ""}`}
      id="radio-waveform"
      viewBox={train ? "0 0 300 64" : "0 0 120 16"}
      preserveAspectRatio={train ? "xMidYMid meet" : "none"}
      aria-hidden="true"
      focusable="false"
    >
      {train ? <>
        <defs>
          <clipPath id={windows}>
            <rect x="40" y="23" width="50" height="14" rx="2" />
            <rect x="110" y="23" width="50" height="14" rx="2" />
            <rect x="180" y="23" width="46" height="14" rx="2" />
          </clipPath>
        </defs>
        <g opacity=".65">
          <path d="M39 18h52a5 5 0 0 1 5 5v21H34V23a5 5 0 0 1 5-5Zm70 0h52a5 5 0 0 1 5 5v21h-62V23a5 5 0 0 1 5-5Zm70 0h47c12 0 24 12 32 23l1 3h-85V23a5 5 0 0 1 5-5Z" />
          <path d="M34 39h62m8 0h62m8 0h81m-159 3h8m62 0h8M234 24l11 11h-11Z" />
          {[47, 83, 117, 153, 187, 244].map(x => <circle key={x} cx={x} cy="48" r="3" fill="none" stroke="currentColor" />)}
        </g>
        <g clipPath={`url(#${windows})`}>
          <path className="waveform-bars" d={path} transform="translate(40 15.5) scale(1.73 1.8)" vectorEffect="non-scaling-stroke" />
        </g>
        <path d="M0 52h300" opacity=".22" />
        <path className="waveform-track" d="M-20 56h340" strokeDasharray="2 18" opacity=".18" />
      </> : <path className="waveform-bars" d={path} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
