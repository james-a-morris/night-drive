import { useEffect, useState } from "react";
import { PREFERENCES, readPreference, savePreference } from "../src/prefs.ts";
import { resolveListeningView, type ListeningView } from "../src/listening-mode.ts";

export function useListeningView() {
  // Resolve on the client before importing either the scene or the radio.
  const [state, setState] = useState<{ view: ListeningView; mobile: boolean } | null>(null);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 650px), (max-height: 500px) and (pointer: coarse)");
    const update = () => setState({
      view: resolveListeningView(readPreference("listeningView"), mobile.matches),
      mobile: mobile.matches,
    });
    const storage = (event: StorageEvent) => {
      if (!event.key || event.key === PREFERENCES.listeningView.key) update();
    };
    update();
    mobile.addEventListener("change", update);
    window.addEventListener("storage", storage);
    return () => {
      mobile.removeEventListener("change", update);
      window.removeEventListener("storage", storage);
    };
  }, []);
  return {
    view: state?.view ?? null,
    mobile: state?.mobile ?? false,
    setView(next: ListeningView) {
      if (!state?.mobile) return;
      savePreference("listeningView", next);
      setState({ view: next, mobile: true });
    },
  };
}
