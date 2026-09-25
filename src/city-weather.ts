export type City = {
  id: number;
  population: number;
  capital: boolean;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
};
export type WeatherPoint = {
  isDay: boolean | null;
  time: number;
  temperature: number | null;
  code: number | null;
  precipitation: number | null;
};
export type CityWeather = {
  current: WeatherPoint & { feelsLike: number | null; wind: number | null; cloudCover: number | null };
};

export function isTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
export function isCity(value: unknown): value is City {
  if (!value || typeof value !== "object") return false;
  const city = value as City;
  return Number.isInteger(city.id) && Number.isFinite(city.population) && city.population >= 0 &&
    typeof city.capital === "boolean" && (city.population >= 100_000 || city.capital) && typeof city.name === "string" && city.name.length > 0 &&
    typeof city.region === "string" && typeof city.country === "string" &&
    Number.isFinite(city.latitude) && Math.abs(city.latitude) <= 90 &&
    Number.isFinite(city.longitude) && Math.abs(city.longitude) <= 180 && isTimezone(city.timezone);
}
export function cityLabel(city: City) {
  return [...new Set([city.name, city.region, city.country].filter(Boolean))].join(", ");
}
export function localTime(time: number, timezone: string) {
  return new Intl.DateTimeFormat("en", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(time);
}
export function temperature(value: number | null, unit: "C" | "F") {
  return value === null ? "—" : `${Math.round(unit === "F" ? value * 9 / 5 + 32 : value)}°${unit}`;
}
const CONDITIONS: Record<number, string> = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  56: "Light freezing drizzle", 57: "Heavy freezing drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Light showers", 81: "Rain showers", 82: "Heavy showers", 85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 97: "Heavy thunderstorm", 99: "Thunderstorm with heavy hail",
};
export const weatherDescription = (code: number | null) => code === null ? "Conditions unavailable" : CONDITIONS[code] ?? "Conditions unavailable";

const numeric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
// Treat missing readings as unavailable, never as zero degrees or clear skies.
export function parseWeather(value: unknown): CityWeather {
  const data = value as { current?: Record<string, unknown> } | null;
  const current = data?.current;
  if (!current || numeric(current.time) === null) throw new Error("Invalid weather response");
  return {
    current: {
      time: Number(current.time) * 1000,
      temperature: numeric(current.temperature_2m), code: numeric(current.weather_code),
      precipitation: numeric(current.precipitation), feelsLike: numeric(current.apparent_temperature),
      wind: numeric(current.wind_speed_10m), cloudCover: numeric(current.cloud_cover), isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null,
    },
  };
}
