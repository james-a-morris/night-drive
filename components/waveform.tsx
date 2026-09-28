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

function steamWaveform(phase: number, amplitude: number) {
  // Keep the waveform's distinct peaks while its centerline rises like steam.
  return bars.map((bar, index) => {
    const drift = index / (bars.length - 1);
    const plume = Math.sin(Math.PI * drift) ** 0.7;
    const x = 244 - drift * 196;
    const y = 45 - 24 * (1 - Math.exp(-drift * 7)) +
      amplitude * plume * Math.sin(drift * 10 - phase) * 0.7;
    const height = 0.6 + amplitude * plume * (1 + 7 * bar) *
      (0.85 + 0.15 * Math.sin(phase - drift * 14));
    return `M${x.toFixed(2)} ${(y - height).toFixed(2)}V${(y + height).toFixed(2)}`;
  }).join(" ");
}

// Decorative rhythm; live stations need not allow access to their audio samples.
export default function Waveform({ playing, train = false }: { playing: boolean; train?: boolean }) {
  const [rhythm, setRhythm] = useState({ phase: 0, amplitude: 0 });
  const smoke = useId();
  useEffect(() => {
    const preference = reducedMotion();
    let frame = 0,
      previous = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - previous < 1000 / 24) return;
      previous = now;
      setRhythm({ phase: (now / 1000) * (train ? 0.35 : 0.9), amplitude: 1 });
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      if (document.hidden) return;
      if (playing && !preference.matches) frame = requestAnimationFrame(draw);
      else setRhythm({ phase: 0, amplitude: playing ? 0.65 : 0 });
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
      viewBox={train ? "0 0 300 104" : "0 0 120 16"}
      preserveAspectRatio={train ? "xMidYMid meet" : "none"}
      aria-hidden="true"
      focusable="false"
    >
      {train ? <>
        <defs>
          <linearGradient id={smoke} x1="48" y1="0" x2="244" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="currentColor" stopOpacity="0" />
            <stop offset=".25" stopColor="currentColor" stopOpacity=".75" />
            <stop offset="1" stopColor="currentColor" />
          </linearGradient>
        </defs>
        <path className="waveform-bars waveform-steam" d={steamWaveform(rhythm.phase, rhythm.amplitude)}
          style={{ stroke: `url(#${smoke})`, strokeWidth: 1 }} vectorEffect="non-scaling-stroke" />
        <g opacity=".8" fill="none" stroke="currentColor" strokeLinejoin="round">
          {/* Passenger carriage, coal tender, and a little steam locomotive. */}
          <path d="M30 82V61a6 6 0 0 1 6-6h58a6 6 0 0 1 6 6v21ZM27 55h76M30 76h70m0 4h10" />
          {[39, 57, 75].map(x => <rect key={x} x={x} y="62" width="12" height="9" rx="1" />)}
          <path d="M110 65h44v17h-44ZM115 65l5-5 5 2 5-4 5 4 6-2 7 5m-38 12h44m0 3h10" />
          <path d="M164 82V54h28v28m-32-28q18-7 36 0M171 59h14v13h-14Z" />
          <path d="M192 63h56a9 9 0 0 1 9 9v10h-65m8-19v19m48-19v19M207 63v-3a6 6 0 0 1 12 0v3" />
          <path d="M238 63V52l-3-5h18l-3 5v11m-12-11h12M162 82h100l10 9h-17m2-20h5v5h-5" />
          {[42, 88, 120, 145, 253].map(x => <circle key={x} cx={x} cy="88" r="4" />)}
          {[177, 205, 233].map(x => <g key={x}>
            <circle cx={x} cy="85" r="8" />
            <circle cx={x} cy="85" r="2" />
            <path d={`M${x} 77v5m0 6v5m-8-8h5m6 0h5`} opacity=".55" />
          </g>)}
          <path d="M177 85h56" />
        </g>
        <path d="M0 94h300" opacity=".22" />
        <path className="waveform-track" d="M-20 99h340" strokeDasharray="2 18" opacity=".18" />
      </> : <path className="waveform-bars" d={waveform(rhythm.phase, rhythm.amplitude)} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}
