import { useState } from "react";
import { createPortal } from "react-dom";
import type { ListeningView } from "../src/listening-mode.ts";
import Dialog from "./dialog.tsx";

const views = [
  { value: "carriage", title: "Regular", description: "Your window seat. Watch the world go by." },
  { value: "calm", title: "Calm", description: "Just the music and a little room to focus." },
] as const;

function ListeningIcon({ calm = false }: { calm?: boolean }) {
  return <svg className="listening-view-art" width="30" height="30" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    {calm
      ? <>
        <path d="M23.5 18.5a8.5 8.5 0 0 1-10-11 9 9 0 1 0 10 11Z" fill="#d8d4af" stroke="none" />
        <path d="M26 5v4m-2-2h4M7 27c4-2 7-2 11 0s7 2 11 0M9 32c4-2 6-2 10 0" stroke="#a6bb9a" />
        <circle cx="29" cy="16" r="1" fill="#d8d4af" stroke="none" />
      </>
      : <>
        <rect x="8" y="4" width="20" height="24" rx="6" fill="#a3b59822" stroke="#cad3b4" />
        <path d="M11 9h14v9H11Z" fill="#71958c66" stroke="#a7c0a5" />
        <path d="M18 9v9M12 29l-3 4m15-4 3 4M11 32h14M14 5h8" stroke="#cad3b4" />
        <circle cx="13" cy="23" r="1.5" fill="#e6d8bc" stroke="none" /><circle cx="23" cy="23" r="1.5" fill="#e6d8bc" stroke="none" />
      </>}
  </svg>;
}

export default function ListeningViewPicker({ view, onChange }: {
  view: ListeningView | null;
  onChange(view: ListeningView): void;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="listening-view-trigger" type="button" disabled={!view}
      title={`Change view: ${view === "calm" ? "Calm" : "Regular"}`}
      aria-label={`Choose your view: ${view === "calm" ? "Calm" : "Regular"}`} aria-haspopup="dialog" aria-expanded={open}
      aria-controls="listening-view-dialog" onClick={() => setOpen(true)}>
      <ListeningIcon calm={view === "calm"} />
      <span className="listening-view-label">{views.find((option) => option.value === view)?.title ?? "Your view"}</span>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<Dialog className="listening-view-dialog" id="listening-view-dialog" open
      onClose={() => setOpen(false)} aria-labelledby="listening-view-title">
      <div className="listening-sheet-heading">
        <h2 id="listening-view-title">Your view</h2>
        <button className="listening-close" type="button" aria-label="Close view options" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="listening-view-options" role="group" aria-label="Your view">
        {views.map((option) => <button key={option.value} type="button" aria-pressed={view === option.value}
          onClick={() => { onChange(option.value); setOpen(false); }}>
          <span className="listening-option-icon"><ListeningIcon calm={option.value === "calm"} /></span>
          <span><strong>{option.title}</strong><small>{option.description}</small></span>
          <span className="listening-option-check" aria-hidden="true">✓</span>
        </button>)}
      </div>
    </Dialog>, document.body)}
  </>;
}
