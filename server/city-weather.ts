import { isCity, isTimezone, parseWeather, type City } from "../src/city-weather.ts";

async function upstream(url: URL, seconds: number) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: seconds } });
  if (!response.ok) throw new Error("Weather provider unavailable");
  return response.json();
}
const failure = () => Response.json({ error: "The weather service is unavailable. Please try again." }, { status: 502 });

export async function searchCities(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 100) return Response.json({ error: "Enter between 2 and 100 characters." }, { status: 400 });
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query, count: "100", language: "en", format: "json" }).toString();
  try {
    const data = await upstream(url, 86400);
    if (!data || (data.results !== undefined && !Array.isArray(data.results))) return failure();
    const cities: City[] = (data.results ?? []).filter((city: Record<string, unknown>) =>
      typeof city?.feature_code === "string" && city.feature_code.startsWith("PPL"),
    ).map((city: Record<string, unknown>) => ({
      id: city.id, population: city.population ?? 0, capital: city.feature_code === "PPLC", name: city.name, region: city.admin1 ?? "", country: city.country ?? city.country_code ?? "",
      latitude: city.latitude, longitude: city.longitude, timezone: city.timezone,
    })).filter(isCity).slice(0, 8);
    return Response.json({ cities });
  } catch { return failure(); }
}

export async function getCityWeather(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = params.get("latitude"), lon = params.get("longitude"), timezone = params.get("timezone");
  if (!lat?.trim() || !lon?.trim() || !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90 ||
    !Number.isFinite(Number(lon)) || Math.abs(Number(lon)) > 180 || !isTimezone(timezone)) {
    return Response.json({ error: "Choose a city with valid coordinates and timezone." }, { status: 400 });
  }
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({ latitude: String(Number(lat)), longitude: String(Number(lon)), timezone,
    current: "temperature_2m,apparent_temperature,is_day,cloud_cover,precipitation,weather_code,wind_speed_10m",
    timeformat: "unixtime",
    temperature_unit: "celsius", wind_speed_unit: "kmh",
  }).toString();
  try { return Response.json(parseWeather(await upstream(url, 300))); } catch { return failure(); }
}
