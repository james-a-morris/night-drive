import { ENVIRONMENTS, environmentNames, type Environment, type EnvironmentName } from "./environments.ts";
import { weatherDescription, type City, type CityWeather } from "./city-weather.ts";

export type CityAtmosphere = { city: City; weather: CityWeather };
export const isThunderstorm = (code: number | null) => code !== null && [95, 96, 97, 99].includes(code);
export function canSyncWeather(weather: CityWeather, now: number) {
  return weatherDescription(weather.current.code) !== "Conditions unavailable" && weather.current.isDay !== null &&
    now - weather.current.time < 60 * 60_000 && weather.current.time <= now + 15 * 60_000;
}

// Override atmosphere only: geography, wildlife and the chosen route remain theirs.
export function cityEnvironments({ city, weather }: CityAtmosphere): Record<EnvironmentName, Environment> {
  const current = weather.current, code = current.code;
  const snow = code !== null && [71, 73, 75, 77, 85, 86].includes(code);
  const rain = code !== null && ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) || isThunderstorm(code));
  const fog = code === 45 || code === 48;
  const clouds = current.cloudCover === null ? (rain || snow || fog || code === 3 ? 1 : code === 2 ? .5 : 0) : current.cloudCover / 100;
  const day = current.isDay === true;
  const intensity = rain ? Math.min(.85, .18 + (current.precipitation ?? 0) * .22) : 0;
  return Object.fromEntries(environmentNames.map((name) => {
    const base = ENVIRONMENTS[name];
    if (name === "tunnel") return [name, base];
    return [name, {
      ...base,
      weather: `${city.name.toUpperCase()} · ${weatherDescription(code).toUpperCase()} · ${day ? "DAYTIME" : "NIGHTTIME"}`,
      sky: day ? (clouds > .7 ? 0x788c98 : 0x639cc4) : (clouds > .7 ? 0x171e2b : 0x07121f),
      horizon: day ? (clouds > .7 ? 0xb1b9bb : 0xc9dce1) : 0x435467,
      fog: day ? (fog ? 0xb6c0c3 : 0x9db6bf) : 0x334554,
      light: day ? 0xffedcf : 0xb6cfde,
      daylight: day ? 1 : 0,
      cloudCover: clouds,
      fogDensity: fog ? .025 : rain || snow ? .009 : .0035,
      starOpacity: day ? 0 : Math.max(0, 1 - clouds * 1.4),
      particles: { rain: intensity, snow: snow ? .85 : 0, dust: 0 },
      windowRain: rain ? Math.min(1, intensity * 2.5) : 0,
      audio: { ...base.audio, weatherGain: rain ? .025 + intensity * .04 : .007, filterHz: rain ? 1800 : 450 },
    }];
  })) as Record<EnvironmentName, Environment>;
}
