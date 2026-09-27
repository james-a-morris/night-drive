import { useEffect, useState } from "react";
import { useAsyncAction } from "./use-async-action.ts";

type FullscreenDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void | Promise<void>;
};
type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => void | Promise<void>;
};

export default function FullscreenButton() {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const action = useAsyncAction();

  useEffect(() => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenRoot;
    setSupported(Boolean(
      (doc.fullscreenEnabled && root.requestFullscreen) ||
      (doc.webkitFullscreenEnabled && root.webkitRequestFullscreen),
    ));
    const sync = () => setActive(Boolean(doc.fullscreenElement || doc.webkitFullscreenElement));
    sync();
    doc.addEventListener("fullscreenchange", sync);
    doc.addEventListener("webkitfullscreenchange", sync);
    return () => {
      doc.removeEventListener("fullscreenchange", sync);
      doc.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  function toggle() {
    void action.run(async () => {
      const doc = document as FullscreenDocument;
      const root = document.documentElement as FullscreenRoot;
      if (doc.fullscreenElement) {
        await doc.exitFullscreen();
      } else if (doc.webkitFullscreenElement) {
        await doc.webkitExitFullscreen?.();
      } else if (doc.fullscreenEnabled) {
        // Keep dialogs and controls in fullscreen along with the canvas.
        await root.requestFullscreen();
      } else {
        await root.webkitRequestFullscreen?.();
      }
    });
  }

  if (!supported) return null;
  const label = active ? "Exit fullscreen" : "Enter fullscreen";
  return (
    <div className="fullscreen-control">
      <button
        className="account-manage"
        id="fullscreen-toggle"
        type="button"
        title={active ? `${label} (Esc)` : label}
        aria-label={label}
        disabled={action.busy}
        aria-disabled={action.busy}
        onClick={toggle}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={active
            ? "M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5"
            : "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"} />
        </svg>
      </button>
      <p className="form-error fullscreen-error" role="status" hidden={!action.error}>
        Fullscreen is unavailable right now. Please try again.
      </p>
    </div>
  );
}
