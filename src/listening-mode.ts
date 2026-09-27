import { advanceDrive, type Drive } from "./drive.ts";
import type { SceneryMode } from "./environments.ts";

export type ListeningView = "carriage" | "calm";
export type ListeningPreference = ListeningView | "auto";

export function resolveListeningView(
  preference: ListeningPreference,
  mobile: boolean,
): ListeningView {
  if (!mobile) return "carriage";
  if (preference !== "auto") return preference;
  return "calm";
}

// A small clock keeps the journey moving without a renderer. Reset at visibility
// changes so sleeping phones never accrue distance for time spent away.
export function createListeningClock(drive: Drive) {
  let previous: number | null = null;
  return (now: number, visible: boolean, mode: SceneryMode = "auto") => {
    if (!visible || !drive.started) {
      previous = null;
      return;
    }
    let seconds = previous === null ? 0 : Math.min(1, Math.max(0, (now - previous) / 1000));
    previous = now;
    while (seconds > 0) {
      const step = Math.min(seconds, 0.05);
      advanceDrive(drive, step, mode);
      seconds -= step;
    }
  };
}
