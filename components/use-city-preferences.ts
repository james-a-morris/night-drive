import { useEffect, useRef, useState } from "react";
import type { Room } from "./use-room.ts";
import { DEFAULT_CITY_PREFERENCES, type CityPreferences } from "../src/city-preferences.ts";
import { isCity } from "../src/city-weather.ts";

const LEGACY_KEYS = ["night-rail:weather-city", "night-rail:weather-sync", "night-rail:weather-unit"];
function legacyPreferences(): CityPreferences | null {
  try {
    const city: unknown = JSON.parse(localStorage.getItem(LEGACY_KEYS[0]) ?? "null");
    return isCity(city) ? { city, sync: localStorage.getItem(LEGACY_KEYS[1]) !== "off", unit: localStorage.getItem(LEGACY_KEYS[2]) === "F" ? "F" : "C" } : null;
  } catch { return null; }
}
function clearLegacy() { try { LEGACY_KEYS.forEach(key => localStorage.removeItem(key)); } catch {} }
type Session = { owner: string; preferences: CityPreferences; pending: number; sequence: number; dirty: boolean; tail: Promise<void> };

export function useCityPreferences(room: Room) {
  const [preferences, setPreferences] = useState(DEFAULT_CITY_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const session = useRef<Session | null>(null);
  const legacyChecked = useRef(false);
  const latestRoom = useRef(room);
  latestRoom.current = room;
  const owner = room.me?.id;
  const remoteKey = JSON.stringify(room.me?.citySync ?? null);

  function accept(next: CityPreferences) {
    if (!session.current) return;
    if (JSON.stringify(session.current.preferences) !== JSON.stringify(next)) {
      session.current.preferences = next;
      setPreferences(next);
    }
  }
  function save(next: CityPreferences, initializeOnly = false) {
    const current = session.current;
    if (!current) return;
    accept(next);
    current.dirty = true;
    current.pending++;
    const sequence = ++current.sequence;
    setError("");
    // Serialize rapid unit/sync changes so the final click is the final database write.
    current.tail = current.tail.then(async () => {
      if (session.current !== current) return;
      try {
        const saved = await latestRoom.current.changeProfile({ action: "city-sync", ownerId: current.owner, preferences: next, initializeOnly });
        if (session.current !== current || current.sequence !== sequence) return;
        current.dirty = false;
        accept(saved.citySync ?? next);
        clearLegacy();
      } catch {
        if (session.current === current && current.sequence === sequence) setError("City settings couldn’t be saved. Retry");
      } finally {
        current.pending--;
      }
    });
  }

  useEffect(() => {
    if (!owner) { setReady(false); return; }
    const remote = latestRoom.current.me?.citySync ?? null;
    if (session.current?.owner !== owner) {
      const legacy = !legacyChecked.current && !remote ? legacyPreferences() : null;
      legacyChecked.current = true;
      const initial = remote ?? legacy ?? DEFAULT_CITY_PREFERENCES;
      session.current = { owner, preferences: initial, pending: 0, sequence: 0, dirty: false, tail: Promise.resolve() };
      setPreferences(initial);
      setError("");
      setReady(true);
      if (legacy) save(legacy, true);
      else if (remote) clearLegacy();
      return;
    }
    // Room polling carries changes from other devices, without replacing unsaved edits.
    if (!session.current.pending && !session.current.dirty) accept(remote ?? DEFAULT_CITY_PREFERENCES);
  }, [owner, remoteKey]);

  return {
    ...preferences,
    ready,
    error,
    update(patch: Partial<CityPreferences>) {
      if (session.current) save({ ...session.current.preferences, ...patch });
    },
    retry() { if (session.current) save(session.current.preferences); },
  };
}
