import { ENVIRONMENTS, ROUTE_LENGTH, TRANSITION_LENGTH, type Environment, type SceneryMode } from "./environments.ts";

export type PineWeather = "rain" | "stars";
export const NIGHT_PINES: Environment = {
  ...ENVIRONMENTS.forest,
  name: "NIGHTTIME PINES",
  weather: "CLEAR SKIES · STARLIT NIGHT",
  particles: { rain: 0, snow: 0, dust: 0 },
  windowRain: 0,
  starOpacity: 1,
  sky: 0x030916,
  horizon: 0x1c304b,
  fog: 0x192d46,
  light: 0xadc8e3,
  fogDensity: 0.0035,
  audio: { weatherGain: 0.007, filterHz: 450, surfGain: 0 },
};

export const pineEnvironment = (weather: PineWeather) => weather === "stars" ? NIGHT_PINES : ENVIRONMENTS.forest;

// One choice per visit, including the incoming forest blend at the end of a lap.
// This lives with the scene, so ordinary React renders never reroll the weather.
export function createPineWeather(random = Math.random) {
  const choose = (): PineWeather => random() < .5 ? "rain" : "stars";
  let weather = choose(), cycle: number | undefined, previousMode: SceneryMode | undefined;
  return {
    update(progress: number, mode: SceneryMode) {
      if (mode === "auto") {
        const nextCycle = Math.floor((progress + TRANSITION_LENGTH) / ROUTE_LENGTH);
        if (cycle !== undefined && cycle !== nextCycle) weather = choose();
        cycle = nextCycle;
      } else if (mode === "forest" && previousMode !== undefined && previousMode !== "forest") weather = choose();
      previousMode = mode;
      return weather;
    },
  };
}
