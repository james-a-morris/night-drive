import { isCity, type City } from "./city-weather.ts";

export type CityPreferences = { city: City | null; sync: boolean; unit: "C" | "F" };
export const DEFAULT_CITY_PREFERENCES: CityPreferences = { city: null, sync: true, unit: "C" };
export function isCityPreferences(value: unknown): value is CityPreferences {
  if (!value || typeof value !== "object") return false;
  const prefs = value as CityPreferences;
  return Object.keys(prefs).every(key => ["city", "sync", "unit"].includes(key)) &&
    typeof prefs.sync === "boolean" && (prefs.unit === "C" || prefs.unit === "F") &&
    (prefs.city === null || (isCity(prefs.city) &&
      [prefs.city.name, prefs.city.region, prefs.city.country].every(text => text.length <= 200) &&
      Object.keys(prefs.city).every(key => ["id", "name", "region", "country", "population", "capital", "latitude", "longitude", "timezone"].includes(key))));
}
export function parseCityPreferences(value: string | null): CityPreferences | null {
  try { const parsed: unknown = JSON.parse(value ?? "null"); return isCityPreferences(parsed) ? parsed : null; } catch { return null; }
}
