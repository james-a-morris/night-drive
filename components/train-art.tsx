import type { TrainType } from "../src/train-types.ts";

export default function TrainArt({ type }: { type: TrainType }) {
  return (
    <svg className="train-art" data-train={type} viewBox="0 0 96 56" fill="none" aria-hidden="true" focusable="false">
      <rect width="96" height="56" rx="8" fill={type === "metro" ? "#263f50" : type === "steam" ? "#3c3435" : "#30453d"} />
      <circle cx="78" cy="12" r="5" fill="#e8d8ae" opacity=".65" />
      <path d="M0 42 15 30l12 9 19-19 20 22 17-13 13 12v15H0Z" fill="#182d30" opacity=".4" />
      <path d="M7 47h82m-76 3h8m8 0h8m8 0h8m8 0h8m8 0h8" stroke="#b7b29d" strokeOpacity=".35" strokeLinecap="round" />
      <g className="train-illustration">
      {type === "classic" && <>
        <path d="M12 21c0-4 4-7 8-7h57c4 0 7 3 7 7" fill="#c6c3a7" />
        <rect x="12" y="21" width="72" height="21" rx="3" fill="#688675" />
        <path d="M12 34h72M12 23h72" stroke="#dac08b" strokeWidth="1.5" />
        {[20, 34, 48, 62].map(x => <g key={x}>
          <rect className="train-window-glow" x={x} y="25" width="10" height="8" rx="2" fill="#f2d69d" />
          <path d={`M${x + 5} 25v8`} stroke="#a59163" strokeWidth=".8" />
        </g>)}
        <rect x="76" y="26" width="4" height="14" rx="1" fill="#354c44" />
        <path d="M17 42h61" stroke="#a6a383" strokeWidth="2" />
        {[24, 32, 65, 73].map(x => <circle key={x} cx={x} cy="43" r="3" fill="#172a2c" stroke="#a2afa4" />)}
      </>}
      {type === "metro" && <>
        <path d="M9 39V27c0-8 5-13 13-13h52c8 0 13 6 13 14v11c0 3-2 5-5 5H14c-3 0-5-2-5-5Z" fill="#c9d7db" />
        <path d="M10 24h76v10H10Z" fill="#28434e" />
        <path d="M10 36h76v5H10Z" fill="#3e9bb7" />
        {[30, 50, 70].map(x => <rect key={x} x={x} y="24" width="12" height="8" rx="2" fill="#8bbac6" />)}
        <path d="M16 24h8v9H12v-5Z" fill="#6d9cab" />
        <path d="M45 22v21m21-21v21" stroke="#849ca6" />
        <rect x="15" y="18" width="16" height="3" rx="1" fill="#e9c88b" />
        <path className="train-window-glow" d="M13 38h4m61 0h4" stroke="#fff4cb" strokeWidth="2" strokeLinecap="round" />
        {[24, 33, 65, 74].map(x => <circle key={x} cx={x} cy="44" r="2.5" fill="#183038" />)}
        <path d="m48 14 5-7h10l-5 7m-8-7h15" stroke="#92b0b8" strokeWidth="1.5" />
      </>}
      {type === "steam" && <>
        <g className="train-svg-steam" fill="#d5cdc1" opacity=".5"><circle cx="24" cy="12" r="4" /><circle cx="31" cy="9" r="5" /><circle cx="40" cy="6" r="5" /></g>
        <path d="M14 38h57v6H10Z" fill="#bb7956" />
        <rect x="18" y="24" width="42" height="15" rx="7" fill="#263538" />
        <path d="M31 25v14m18-14v14" stroke="#d0ab65" strokeWidth="2" />
        <path d="M22 25V16h7v9m-9-9h11" stroke="#28383b" strokeWidth="3" />
        <rect x="57" y="20" width="17" height="21" rx="2" fill="#86534a" />
        <path d="M55 19h22" stroke="#d3b782" strokeWidth="3" strokeLinecap="round" />
        <rect x="61" y="23" width="9" height="8" rx="1" fill="#f0d393" />
        <path d="M77 31h11v11H77Z" fill="#765248" />
        <circle cx="16" cy="30" r="3" fill="#efd09a" />
        {[30, 45, 61].map(x => <g key={x} className="train-svg-wheel">
          <circle cx={x} cy="41" r="6" fill="#884d43" stroke="#d1b181" strokeWidth="1.5" />
          <path d={`M${x - 4} 41h8m-4-4v8`} stroke="#c6a27b" />
        </g>)}
        <path d="M30 42h31" stroke="#ddd0aa" strokeWidth="2" strokeLinecap="round" />
      </>}
      </g>
    </svg>
  );
}
