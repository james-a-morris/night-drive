import { isCity, isTimezone, parseWeather, type City } from "../src/city-weather.ts";
import { readBoundedJson } from "../src/bounded-json.ts";
import { getSharedStore } from "./store.ts";
import type { Store } from "./types.ts";
import { addressKey, rateLimit, RateLimitError } from "./traffic.ts";

const MAX_UPSTREAM_BYTES = 512 * 1024;
const WEATHER_REQUESTS_PER_MINUTE = 60;
const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

async function upstream(url: URL, seconds: number) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
    next: { revalidate: seconds },
  });
  if (!response.ok) throw new Error("Weather provider unavailable");
  return readBoundedJson(response, MAX_UPSTREAM_BYTES);
}

const failure = (status = 502) =>
  Response.json(
    { error: "The weather service is unavailable. Please try again." },
    { status, headers: responseHeaders },
  );

export async function searchCities(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  if (
    query.length < 2 ||
    query.length > 80 ||
    /[\p{Cc}\p{Cf}]/u.test(query)
  )
    return Response.json(
      { error: "Enter between 2 and 80 visible characters." },
      { status: 400, headers: responseHeaders },
    );
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: query,
    count: "100",
    language: "en",
    format: "json",
  }).toString();
  try {
    const data = await upstream(url, 86400);
    if (!data || typeof data !== "object") return failure();
    const results = (data as { results?: unknown }).results;
    if (results !== undefined && !Array.isArray(results)) return failure();
    const cities: City[] = (results ?? [])
      .filter(
        (city): city is Record<string, unknown> =>
          Boolean(city) &&
          typeof city === "object" &&
          typeof (city as Record<string, unknown>).feature_code === "string" &&
          String((city as Record<string, unknown>).feature_code).startsWith(
            "PPL",
          ),
      )
      .map((city) => ({
        id: city.id,
        population: city.population ?? 0,
        capital: city.feature_code === "PPLC",
        name: city.name,
        region: city.admin1 ?? "",
        country: city.country ?? city.country_code ?? "",
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: city.timezone,
      }))
      .filter(isCity)
      .slice(0, 8);
    return Response.json({ cities }, { headers: responseHeaders });
  } catch {
    return failure();
  }
}

export async function getCityWeather(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = params.get("latitude");
  const lon = params.get("longitude");
  const timezone = params.get("timezone");
  if (
    !lat?.trim() ||
    !lon?.trim() ||
    !Number.isFinite(Number(lat)) ||
    Math.abs(Number(lat)) > 90 ||
    !Number.isFinite(Number(lon)) ||
    Math.abs(Number(lon)) > 180 ||
    !isTimezone(timezone)
  )
    return Response.json(
      { error: "Choose a city with valid coordinates and timezone." },
      { status: 400, headers: responseHeaders },
    );
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(Number(lat)),
    longitude: String(Number(lon)),
    timezone,
    current:
      "temperature_2m,apparent_temperature,is_day,cloud_cover,precipitation,weather_code,wind_speed_10m",
    timeformat: "unixtime",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
  }).toString();
  try {
    return Response.json(parseWeather(await upstream(url, 300)), {
      headers: responseHeaders,
    });
  } catch {
    return failure();
  }
}

interface HandlerOptions {
  getStore?: () => Promise<Store>;
  clock?: () => number;
  requestsPerMinute?: number;
}

export function createCityWeatherHandlers({
  getStore = getSharedStore,
  clock = Date.now,
  requestsPerMinute = WEATHER_REQUESTS_PER_MINUTE,
}: HandlerOptions = {}) {
  const guard =
    (handler: (request: Request) => Promise<Response>) =>
    async (request: Request) => {
      try {
        const store = await getStore();
        await rateLimit(
          store,
          `weather:${addressKey(request)}`,
          requestsPerMinute,
          60000,
          clock(),
        );
        return await handler(request);
      } catch (error) {
        if (error instanceof RateLimitError)
          return Response.json(
            { error: error.message },
            {
              status: error.status,
              headers: {
                ...responseHeaders,
                "Retry-After": String(error.retryAfter),
              },
            },
          );
        return failure(503);
      }
    };
  return {
    searchCities: guard(searchCities),
    getCityWeather: guard(getCityWeather),
  };
}

const handlers = createCityWeatherHandlers();
export const handleCitySearch = handlers.searchCities;
export const handleCityWeather = handlers.getCityWeather;
