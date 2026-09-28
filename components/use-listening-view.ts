import { useEffect, useState } from "react";
import { PREFERENCES, readPreference, savePreference } from "../src/prefs.ts";
import { resolveListeningView, type ListeningView } from "../src/listening-mode.ts";

export function useListeningView() {
  // Resolve on the client before importing either the scene or the radio.
  const [state, setState] = useState<{ view: ListeningView; mobile: boolean } | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const style = document.documentElement.style;
    const updateViewport = () => {
      const installed = standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      document.documentElement.toggleAttribute("data-standalone", installed);
      // Both 100dvh and innerHeight can omit the status bar on an iOS cold
      // start. With no browser toolbar, 100vh is the full installed viewport.
      if (installed) {
        style.setProperty("--standalone-viewport-height", "100vh");
      } else {
        style.removeProperty("--standalone-viewport-height");
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") updateViewport();
    };
    updateViewport();
    standalone.addEventListener("change", updateViewport);
    window.addEventListener("pageshow", updateViewport);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      standalone.removeEventListener("change", updateViewport);
      window.removeEventListener("pageshow", updateViewport);
      document.removeEventListener("visibilitychange", onVisible);
      style.removeProperty("--standalone-viewport-height");
      document.documentElement.removeAttribute("data-standalone");
    };
  }, []);
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
  useEffect(() => {
    if (!state?.view) return;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!theme) return;
    const previous = theme.content;
    // Resolve the CSS palette for browsers that use a theme-color hint.
    theme.content = getComputedStyle(document.documentElement).backgroundColor;
    return () => { theme.content = previous; };
  }, [state?.view]);
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
