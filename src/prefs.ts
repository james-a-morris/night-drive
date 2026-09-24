import type { DistanceUnit, Seat } from "./types.ts";
import { DEFAULT_AUDIO_MIX, validAudioMix, type AudioMix } from "./audio-mix.ts";

interface PreferenceValues {
  audioMix: AudioMix;
  seat: Seat;
  window: "open" | "closed";
  distanceUnit: DistanceUnit;
  devKit: "on" | "off";
  treeAge: number;
  timer: unknown;
  pendingIntention: "0" | "1";
}
export type PreferenceName = keyof PreferenceValues;
type Preference<T> = {
  key: string;
  fallback: T;
  valid: (value: unknown) => boolean;
  json?: boolean;
  session?: boolean;
};
// Keep existing keys so returning riders retain their preferences.
export const PREFERENCES: {
  [K in PreferenceName]: Preference<PreferenceValues[K]>;
} = {
  audioMix: {
    key: "night-rail:audio-mix",
    fallback: DEFAULT_AUDIO_MIX,
    json: true,
    valid: validAudioMix,
  },
  seat: {
    key: "night-train:seat",
    fallback: "left",
    valid: (value) => value === "left" || value === "right",
  },
  window: {
    key: "night-train:window",
    fallback: "closed",
    valid: (value) => value === "open" || value === "closed",
  },
  distanceUnit: {
    key: "night-line:distance-unit",
    fallback: "mi",
    valid: (value) => value === "mi" || value === "km",
  },
  devKit: {
    key: "night-line:dev-kit",
    fallback: "off",
    valid: (value) => value === "on" || value === "off",
  },
  timer: {
    key: "night-train:timer",
    fallback: null,
    json: true,
    valid: (value) => Boolean(value) && typeof value === "object",
  },
  treeAge: {
    key: "night-line:tree-age",
    fallback: 0,
    json: true,
    valid: (value) => typeof value === "number" && Number.isFinite(value) && value >= 0,
  },
  pendingIntention: {
    key: "night-drive:add-intention",
    fallback: "0",
    session: true,
    valid: (value) => value === "0" || value === "1",
  },
};

export function readPreference<K extends PreferenceName>(
  name: K,
): PreferenceValues[K] {
  const pref = PREFERENCES[name];
  try {
    const raw = (pref.session ? sessionStorage : localStorage).getItem(
      pref.key,
    );
    const value: unknown = pref.json ? JSON.parse(raw ?? "null") : raw;
    if (pref.valid(value)) return value as PreferenceValues[K];
  } catch {}
  return pref.fallback;
}

export function savePreference<K extends PreferenceName>(
  name: K,
  value: PreferenceValues[K],
) {
  const pref = PREFERENCES[name];
  try {
    (pref.session ? sessionStorage : localStorage).setItem(
      pref.key,
      pref.json ? JSON.stringify(value) : String(value),
    );
  } catch {}
}
