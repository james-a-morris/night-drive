import { ENVIRONMENTS, environmentNames, type Environment, type EnvironmentName } from "./environments.ts";
import { weatherDescription, type City, type CityWeather } from "./city-weather.ts";
import { Color } from "./three.ts";

const mixColor = (clear: number, overcast: number, clouds: number) =>
  new Color(clear).lerp(new Color(overcast), clouds).getHex();

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
  // Precipitation/fog must not expose a clear sky when cloud readings are
  // missing or disagree with the condition code.
  const cloudFloor = rain || snow || fog || code === 3 ? 1 : code === 2 ? .5 : code === 1 ? .2 : 0;
  const clouds = Math.max(cloudFloor, Math.min(1, Math.max(0, (current.cloudCover ?? 0) / 100)));
  const day = current.isDay === true;
  const intensity = rain ? Math.min(.85, .18 + (current.precipitation ?? 0) * .22) : 0;
  const storm = isThunderstorm(code);
  const horizon = day ? mixColor(0xc9dce1, storm ? 0x7b8996 : 0xaab5be, clouds)
    : mixColor(0x12273a, 0x142634, clouds);
  const sky = day ? mixColor(0x639cc4, storm ? 0x495663 : 0x738594, clouds)
    : mixColor(0x040b17, 0x0b1623, clouds);
  return Object.fromEntries(environmentNames.map((name) => {
    const base = ENVIRONMENTS[name];
    if (name === "tunnel") return [name, base];
    const dry = base.precipitation === "none";
    const localRain = rain && !dry && base.precipitation !== "snow";
    const localSnow = !dry && (snow || (rain && base.precipitation === "snow"));
    return [name, {
      ...base,
      weather: `${city.name.toUpperCase()} · ${weatherDescription(code).toUpperCase()} · ${day ? "DAYTIME" : "NIGHTTIME"}`,
      sky: fog ? mixColor(sky, horizon, .7) : sky,
      horizon,
      // Distant terrain and water disappear into the same horizon as the sky.
      fog: horizon,
      light: day ? mixColor(0xffedcf, 0xc5d1da, clouds) : 0xb6cfde,
      daylight: day ? 1 : 0,
      cloudCover: clouds,
      haze: fog ? 1 : localRain || localSnow ? .45 : clouds * .15,
      // Rain needs depth, not an opaque gray wall over every distant hill.
      fogDensity: fog ? (day ? .025 : .014) : localRain || localSnow ? (day ? .007 : .0045) : .0035,
      starOpacity: day ? 0 : Math.max(0, 1 - clouds * 1.4),
      particles: { rain: localRain ? intensity : 0, snow: localSnow ? .85 : 0, dust: dry ? base.particles.dust : 0 },
      windowRain: localRain ? Math.min(1, intensity * 2.5) : 0,
      audio: { ...base.audio,
        weatherGain: localRain ? .025 + intensity * .04 : dry ? base.audio.weatherGain : localSnow ? ENVIRONMENTS.alpine.audio.weatherGain : .007,
        filterHz: localRain ? 1800 : dry ? base.audio.filterHz : localSnow ? ENVIRONMENTS.alpine.audio.filterHz : 450 },
    }];
  })) as Record<EnvironmentName, Environment>;
}
