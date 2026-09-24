import { roadPoint } from "./drive.ts";
import { coastalShoreDistance, SEA_LEVEL } from "./terrain.ts";

export const OCEAN_SPECIES = {
  dolphin: {
    length: 4.6,
    depth: 0.85,
    rise: 0.65,
    speed: 0.17,
    surge: 0.095,
    stroke: 1.22,
  },
  whale: {
    length: 12,
    depth: 1.9,
    rise: 1.05,
    speed: 0.065,
    surge: 0.022,
    stroke: 0.95,
  },
  shark: {
    length: 5.5,
    depth: 0.85,
    rise: 0.2,
    speed: 0.105,
    surge: 0.035,
    stroke: 1.12,
  },
  ray: {
    length: 4.8,
    depth: 1.1,
    rise: 0.35,
    speed: 0.115,
    surge: 0.05,
    stroke: 1.25,
  },
  tang: {
    length: 0.85,
    depth: 0.8,
    rise: 0.25,
    speed: 0.23,
    surge: 0.12,
    stroke: 1.65,
  },
  fish: {
    length: 1.1,
    depth: 1,
    rise: 0.3,
    speed: 0.21,
    surge: 0.105,
    stroke: 1.45,
  },
  clownfish: {
    length: 0.65,
    depth: 0.7,
    rise: 0.2,
    speed: 0.25,
    surge: 0.13,
    stroke: 1.8,
  },
} as const;
export type OceanSpecies = keyof typeof OCEAN_SPECIES;

// The CPU placement and water vertex shader share exactly the same swells.
const SWELLS = [
  { x: 0.075, z: 0.028, speed: 0.48, height: 0.18 },
  { x: -0.038, z: 0.11, speed: -0.34, height: 0.1 },
  { x: 0.18, z: 0.16, speed: 0.71, height: 0.035 },
];
export function oceanHeight(x: number, z: number, time: number) {
  return (
    SEA_LEVEL +
    SWELLS.reduce(
      (height, wave) =>
        height +
        Math.sin(x * wave.x + z * wave.z + time * wave.speed) * wave.height,
      0,
    )
  );
}
export const OCEAN_SWELLS_GLSL = SWELLS.map(
  (wave, i) => `
  float wave${i} = dot(route, vec2(${wave.x}, ${wave.z})) + time * ${wave.speed};
  p.y += sin(wave${i}) * ${wave.height};
  slope += cos(wave${i}) * ${wave.height} * vec2(${wave.x}, ${wave.z});
`,
).join("\n");

export interface SwimPath {
  station: number;
  offshore: number;
  phase: number;
  species: OceanSpecies;
}

function pathPoint(path: SwimPath, time: number, calm: boolean) {
  const kind = OCEAN_SPECIES[path.species];
  const surgePhase = time * 0.95 + path.phase * 1.3;
  const phase =
    time * kind.speed + path.phase + Math.sin(surgePhase) * kind.surge;
  const station = path.station + Math.sin(phase) * 22;
  const lateral =
    -coastalShoreDistance(station) - path.offshore - Math.cos(phase) * 5;
  const point = roadPoint(station, lateral);
  const breachAge = (((time + path.phase * 2.6) % 16) + 16) % 16;
  const breaches = path.species === "dolphin" && !calm;
  const lift =
    breaches && breachAge < 2.6
      ? 1.6 * Math.sin((Math.PI * breachAge) / 2.6) ** 2
      : 0;
  const depth =
    kind.depth - Math.sin(time * 0.72 + path.phase * 2) * kind.rise - lift;
  return {
    ...point,
    station,
    depth,
    splash: breaches ? Math.max(0, 1 - Math.abs(breachAge - 2.45) / 0.55) : 0,
    stroke: kind.stroke * (1 + Math.cos(surgePhase) * 0.16),
    y: oceanHeight(point.x, point.z, time) - depth,
  };
}

// Closed paths belong to the coastline; the train passes them. Sampling the
// tangent keeps each animal facing its swimming direction through railway bends.
export function oceanPose(path: SwimPath, time: number, calm = false) {
  const point = pathPoint(path, time, calm);
  const ahead = pathPoint(path, time + 0.05, calm);
  const following = pathPoint(path, time + 0.1, calm);
  const dx = ahead.x - point.x,
    dz = ahead.z - point.z;
  const heading = Math.atan2(-dx, -dz);
  const nextHeading = Math.atan2(ahead.x - following.x, ahead.z - following.z);
  const turn = Math.atan2(
    Math.sin(nextHeading - heading),
    Math.cos(nextHeading - heading),
  );
  const pitchLimit = path.species === "dolphin" && !calm ? 0.58 : 0.24;
  return {
    ...point,
    heading,
    roll: calm ? 0 : Math.max(-0.3, Math.min(0.3, (turn / 0.05) * 0.14)),
    pitch: Math.max(
      -pitchLimit,
      Math.min(pitchLimit, Math.atan2(ahead.y - point.y, Math.hypot(dx, dz))),
    ),
  };
}
