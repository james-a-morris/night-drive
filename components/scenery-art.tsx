import type { SceneryMode } from "../src/environments.ts";
import type { PineWeather } from "../src/pine-weather.ts";
const artwork = {
  auto: (
    <>
      <rect width={64} height={48} fill="#344756" />
      <circle
        className="scenery-sun-glow"
        cx="47"
        cy="11"
        r="6"
        fill="#e7cba3"
        opacity=".14"
      />
      <circle cx="47" cy="11" r="4" fill="#e7cba3" />
      <g
        className="scenery-cloud"
        fill="none"
        stroke="#b0bcc0"
        strokeOpacity=".4"
        strokeLinecap="round"
      >
        <path d="M9 10h12m-8-3h5" />
      </g>
      <path d="M0 36 17 16 33 35 48 22 64 34V48H0Z" fill="#586271" />
      <path d="m12 22 5-6 6 8-6-2-3 2Z" fill="#b0bcc0" />
      <path d="M0 39Q20 25 37 37T64 34V48H0Z" fill="#263a41" />
      <path
        d="M31 48C18 39 47 39 35 32"
        fill="none"
        stroke="#cfb79d"
        strokeWidth="2"
      />
    </>
  ),
  tunnel: (
    <>
      <rect width={64} height={48} fill="#18212d" />
      <path d="M-8 48 14 10 27 20 39 4 72 48Z" fill="#525760" />
      <path d="M16 48V32a16 16 0 0 1 32 0v16" fill="#858078" />
      <path d="M21 48V32a11 11 0 0 1 22 0v16" fill="#111820" />
      <path d="m25 48 5-16m9 16-5-16" stroke="#a59177" />
      <g fill="#f1be7e">
        <rect x="23" y="33" width="2" height="5" rx="1" />
        <rect x="39" y="33" width="2" height="5" rx="1" />
        <circle cx="32" cy="28" r="1" />
      </g>
    </>
  ),
  bridge: (
    <>
      <rect width={64} height={48} fill="#687b90" />
      <path d="M0 23 17 14 31 28 48 16 64 26V48H0Z" fill="#455e66" />
      <path d="M0 32 19 40 31 46 48 35 64 29V48H0Z" fill="#2c454b" />
      <path
        d="M0 26Q32 34 64 23M0 22Q32 30 64 19"
        fill="none"
        stroke="#c5bba4"
        strokeWidth="2"
      />
      <path
        d="M9 27v14m15-11v18m16-18v18m15-21v14"
        stroke="#929588"
        strokeWidth="3"
      />
      <path d="m8 25 8 4m16-2 8 2m8-5 8 1" stroke="#f4cf93" strokeWidth="2" />
    </>
  ),
  forest: (
    <>
      <rect width={64} height={48} fill="#253c43" />
      <path d="M0 35 13 22 26 31 42 20 64 34V48H0Z" fill="#40605a" />
      <path
        d="m9 14-8 19h5l-5 9h17l-6-9h5Zm44 2-9 21h5l-5 9h19l-6-9h5ZM28 25l-6 15h12Z"
        fill="#203e38"
      />
      <path d="M31 48 37 34 35 48" fill="#a8aaa0" />
      <g
        className="scenery-rain"
        stroke="#a9c4c6"
        strokeOpacity=".45"
        strokeLinecap="round"
      >
        <path d="m8 4-3 7" />
        <path d="m20 6-3 7" />
        <path d="m35 9-3 7" />
        <path d="m46 3-3 7" />
        <path d="m58 8-3 7" />
        <path d="m27 23-3 7" />
      </g>
    </>
  ),
  alpine: (
    <>
      <rect width={64} height={48} fill="#485c7b" />
      <path d="m-6 48 25-35 16 24 11-20 24 31Z" fill="#8198ae" />
      <path
        d="m9 27 10-14 11 16-10-6-4 3-3-2Zm27 8 10-18 10 13-8-3-4 4-3-2Z"
        fill="#d8e1e6"
      />
      <path d="M0 43Q18 32 34 43T64 37V48H0Z" fill="#bdcdd5" />
      <g className="scenery-snow" fill="#fff" opacity=".9">
        <circle cx="9" cy="9" r=".8" />
        <circle cx="23" cy="17" r="1" />
        <circle cx="35" cy="6" r=".8" />
        <circle cx="47" cy="25" r=".7" />
        <circle cx="57" cy="14" r="1" />
        <circle cx="32" cy="31" r=".7" />
      </g>
    </>
  ),
  desert: (
    <>
      <rect width={64} height={48} fill="#765a62" />
      <circle
        className="scenery-sun-glow"
        cx="46"
        cy="16"
        r="8"
        fill="#efc192"
        opacity=".14"
      />
      <circle cx="46" cy="16" r="6" fill="#efc192" />
      <path d="M0 31Q19 20 37 32T69 29V48H0Z" fill="#b78872" />
      <path d="M0 42Q22 27 43 39T68 36V48H0Z" fill="#86614f" />
      <path
        d="M14 42V27m0 9h-5v-6m5 3h5v-7"
        fill="none"
        stroke="#434d42"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.5"
      />
      <g
        className="scenery-wind"
        fill="none"
        stroke="#efc192"
        strokeOpacity=".4"
        strokeLinecap="round"
      >
        <path d="M23 34q7-2 14 1" />
        <path d="M35 42q8-2 15 0" />
        <path d="M18 25q5-1 10 1" />
      </g>
    </>
  ),
  coast: (
    <>
      <rect width={64} height={48} fill="#ceafa0" />
      <circle
        className="scenery-sun-glow"
        cx="18"
        cy="15"
        r="9"
        fill="#ffdfa7"
        opacity=".2"
      />
      <circle cx="18" cy="15" r="5" fill="#ffdfa7" />
      <path d="M0 25h64v23H0Z" fill="#537f94" />
      <path d="M0 33q16-5 32 0t32 0v15H0Z" fill="#4e9c9e" />
      <g
        className="scenery-wind"
        fill="none"
        stroke="#d0e2d3"
        strokeOpacity=".7"
        strokeLinecap="round"
      >
        <path d="M3 35h17m-8 6h17m-8-12h8" />
      </g>
      <path d="M64 17 45 24 40 34 48 48H64Z" fill="#a5957d" />
      <path d="M64 17 46 22 43 30 53 48H64Z" fill="#8c9a75" />
      <path
        d="M58 48Q42 31 53 23"
        fill="none"
        stroke="#e0d7b9"
        strokeWidth="1.5"
      />
      <path d="m29 40 2-7 3 7Z" fill="#777b74" />
    </>
  ),
};

export default function SceneryArt({ mode, pineWeather }: { mode: SceneryMode; pineWeather?: PineWeather }) {
  return (
    <svg
      className="scenery-art"
      data-starry={mode === "forest" && pineWeather === "stars" || undefined}
      viewBox="0 0 64 48"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {artwork[mode]}
      {mode === "forest" && pineWeather === "stars" && <g fill="#e1e7d9">
        <circle cx="12" cy="7" r=".7" /><circle cx="28" cy="5" r=".8" />
        <circle cx="37" cy="15" r=".6" /><circle cx="54" cy="5" r=".6" />
        <path d="M46 5a5 5 0 1 0 5 7 5 5 0 0 1-5-7" />
      </g>}
    </svg>
  );
}
