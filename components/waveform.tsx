import { useEffect, useState } from "react";
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
export default function Waveform({ playing }: { playing: boolean }) {
  const [path, setPath] = useState(() => waveform(0, 0));
  useEffect(() => {
    const preference = reducedMotion();
    let frame = 0,
      previous = 0;
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - previous < 1000 / 24) return;
      previous = now;
      setPath(waveform((now / 1000) * 0.9, 1));
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
  }, [playing]);
  return (
    <svg
      className={`radio-waveform${playing ? " is-playing" : ""}`}
      id="radio-waveform"
      viewBox="0 0 120 16"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
