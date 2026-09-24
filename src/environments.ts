export type EnvironmentName =
  | "forest"
  | "alpine"
  | "desert"
  | "coast"
  | "tunnel"
  | "bridge";
export type WildlifeSpecies = "deer" | "stag" | "wolf" | "fox";
export const WILDLIFE_FAMILIES: Record<string, WildlifeSpecies[]> = {
  forest: ["deer", "stag", "deer"],
  alpine: ["wolf", "wolf", "wolf"],
  desert: ["fox", "fox", "fox"],
};
export interface Environment {
  name: string;
  weather: string;
  ground: number;
  pine: number;
  rock: number;
  sky: number;
  horizon: number;
  fog: number;
  light: number;
  fogDensity: number;
  particles: { rain: number; snow: number; dust: number };
  starOpacity: number;
  windowRain: number;
  audio: { weatherGain: number; filterHz: number; surfGain: number };
  wildlife: string;
  snowRoof: boolean;
  windmill: boolean;
  landSide?: number;
  pond: { water: number; shore: number };
  vegetation: {
    pine: boolean;
    cactus: boolean;
    pineSide?: number;
    pineThreshold?: number;
    grassEdge?: number;
    minHeight?: number;
  };
}

export const ENVIRONMENTS: Record<EnvironmentName, Environment> = {
  forest: {
    particles: { rain: 0.32, snow: 0, dust: 0 },
    starOpacity: 0.35,
    windowRain: 1,
    audio: { weatherGain: 0.045, filterHz: 1800, surfGain: 0 },
    wildlife: "forest",
    snowRoof: false,
    windmill: false,
    pond: { water: 0x577b79, shore: 0x52604c },
    vegetation: { pine: true, cactus: false },
    name: "RAINY PINES",
    weather: "SOFT RAIN · MIDNIGHT",
    ground: 0x3a4b3d,
    pine: 0x406352,
    rock: 0x727b78,
    sky: 0x07121f,
    horizon: 0x435b69,
    fog: 0x334d58,
    light: 0xc5c8bd,
    fogDensity: 0.008,
  },
  alpine: {
    particles: { rain: 0, snow: 0.9, dust: 0 },
    starOpacity: 0.55,
    windowRain: 0,
    audio: { weatherGain: 0.016, filterHz: 350, surfGain: 0 },
    wildlife: "alpine",
    snowRoof: true,
    windmill: false,
    pond: { water: 0x91aeb5, shore: 0xb6c8d1 },
    vegetation: { pine: true, cactus: false },
    name: "SNOWBOUND PASS",
    weather: "FALLING SNOW · BLUE HOUR",
    ground: 0xb6c8d1,
    pine: 0xc1d2dc,
    rock: 0x6d7c92,
    sky: 0x111a34,
    horizon: 0x64798c,
    fog: 0x4b6176,
    light: 0xc1d4ef,
    fogDensity: 0.0085,
  },
  desert: {
    particles: { rain: 0, snow: 0, dust: 0.26 },
    starOpacity: 0.9,
    windowRain: 0,
    audio: { weatherGain: 0.022, filterHz: 600, surfGain: 0 },
    wildlife: "desert",
    snowRoof: false,
    windmill: true,
    pond: { water: 0x618b76, shore: 0x9f7957 },
    vegetation: { pine: false, cactus: true },
    name: "AMBER DUNES",
    weather: "DESERT WIND · AFTERGLOW",
    ground: 0x9f7957,
    pine: 0x496252,
    rock: 0x735446,
    sky: 0x171529,
    horizon: 0xb17a5e,
    fog: 0x765b57,
    light: 0xf1c49b,
    fogDensity: 0.007,
  },
  coast: {
    particles: { rain: 0, snow: 0, dust: 0 },
    starOpacity: 0,
    windowRain: 0,
    audio: { weatherGain: 0.012, filterHz: 1400, surfGain: 0.13 },
    wildlife: "forest",
    snowRoof: false,
    windmill: false,
    landSide: 1,
    pond: { water: 0x577b79, shore: 0x52604c },
    vegetation: {
      pine: true,
      cactus: false,
      pineSide: 1,
      pineThreshold: 0.6,
      grassEdge: -11,
      minHeight: -7.8,
    },
    name: "PACIFIC COAST",
    weather: "OCEAN BREEZE · LAST LIGHT",
    ground: 0x7c8b67,
    pine: 0x52766a,
    rock: 0xa59b84,
    sky: 0x274966,
    horizon: 0xe1b69a,
    fog: 0x94b3b8,
    light: 0xffdeba,
    fogDensity: 0.0028,
  },
  tunnel: {
    name: "THE TUNNEL",
    weather: "WARM LIGHTS · UNDER THE MOUNTAIN",
    ground: 0x343637,
    pine: 0x384943,
    rock: 0x50545a,
    sky: 0x06090f,
    horizon: 0x161b24,
    fog: 0x11151c,
    light: 0xb4aaa0,
    fogDensity: 0.012,
    particles: { rain: 0, snow: 0, dust: 0 },
    starOpacity: 0,
    windowRain: 0,
    audio: { weatherGain: 0.009, filterHz: 220, surfGain: 0 },
    wildlife: "forest",
    snowRoof: false,
    windmill: false,
    pond: { water: 0x344349, shore: 0x45494a },
    vegetation: { pine: false, cactus: false },
  },
  bridge: {
    name: "THE BRIDGE",
    weather: "HIGH ABOVE THE VALLEY · DUSK",
    ground: 0x4e605b,
    pine: 0x435b51,
    rock: 0x788084,
    sky: 0x192738,
    horizon: 0x8f929d,
    fog: 0x677e89,
    light: 0xd7c8b5,
    fogDensity: 0.0045,
    particles: { rain: 0, snow: 0, dust: 0 },
    starOpacity: 0.3,
    windowRain: 0,
    audio: { weatherGain: 0.016, filterHz: 800, surfGain: 0 },
    wildlife: "forest",
    snowRoof: false,
    windmill: false,
    pond: { water: 0x577b79, shore: 0x52604c },
    vegetation: { pine: false, cactus: false },
  },
};

export type SceneryMode = "auto" | EnvironmentName;
export type EnvironmentWeights = Record<EnvironmentName, number>;
export const environmentNames = Object.keys(ENVIRONMENTS) as EnvironmentName[];
export const REGION_LENGTH = 900;
export const TRANSITION_LENGTH = 240;
// At 50 km/h, 1,584 route metres under the curved mountain take about two minutes.
export const TUNNEL_REGION_LENGTH = 1680;
export const TUNNEL_CYCLE_LENGTH = TUNNEL_REGION_LENGTH + 240;

export function tunnelApproach(progress: number) {
  return Math.ceil(progress / TUNNEL_CYCLE_LENGTH) * TUNNEL_CYCLE_LENGTH + 48;
}
export const routeRegions = environmentNames.map((name, index) => ({
  name,
  start: environmentNames
    .slice(0, index)
    .reduce(
      (sum, previous) =>
        sum + (previous === "tunnel" ? TUNNEL_REGION_LENGTH : REGION_LENGTH),
      0,
    ),
  length: name === "tunnel" ? TUNNEL_REGION_LENGTH : REGION_LENGTH,
}));
export const ROUTE_LENGTH = routeRegions.reduce(
  (sum, region) => sum + region.length,
  0,
);

export function tunnelSpan(station: number, mode: SceneryMode) {
  if (mode !== "auto" && mode !== "tunnel") return null;
  const cycle = mode === "auto" ? ROUTE_LENGTH : TUNNEL_CYCLE_LENGTH;
  const origin = Math.floor(station / cycle) * cycle;
  const start = origin + (mode === "auto" ? 4 * REGION_LENGTH + 48 : 96);
  return { start, end: start + TUNNEL_REGION_LENGTH - 96 };
}

export function insideTunnel(station: number, mode: SceneryMode) {
  const span = tunnelSpan(station, mode);
  return !!span && station >= span.start && station < span.end;
}

// Longer unlit galleries interrupt the amber lamps; each lasts around eleven seconds.
export function tunnelSection(station: number, mode: SceneryMode) {
  const span = tunnelSpan(station, mode);
  if (!span || station < span.start || station >= span.end) return null;
  const position = (station - span.start) % 384;
  return { dark: position >= 120 && position < 264, position };
}

export function tunnelLampLit(station: number, mode: SceneryMode) {
  const section = tunnelSection(station, mode);
  return section !== null && !section.dark;
}

export function environmentWeights(
  distance: number,
  mode: SceneryMode = "auto",
) {
  const weights: EnvironmentWeights = {
    forest: 0,
    alpine: 0,
    desert: 0,
    coast: 0,
    tunnel: 0,
    bridge: 0,
  };
  if (Object.hasOwn(ENVIRONMENTS, mode)) {
    weights[mode as EnvironmentName] = 1;
    return weights;
  }
  const position = Math.max(0, distance) % ROUTE_LENGTH;
  const region = routeRegions.findIndex(
    (region) => position < region.start + region.length,
  );
  const current = routeRegions[region];
  const fraction = Math.max(
    0,
    (position - current.start - (current.length - TRANSITION_LENGTH)) /
      TRANSITION_LENGTH,
  );
  const blend = fraction * fraction * (3 - 2 * fraction);
  weights[environmentNames[region % environmentNames.length]] = 1 - blend;
  weights[environmentNames[(region + 1) % environmentNames.length]] = blend;
  return weights;
}

export function dominantEnvironment(weights: EnvironmentWeights) {
  return (Object.keys(weights) as EnvironmentName[]).reduce(
    (best, name) => (weights[name] > weights[best] ? name : best),
    "forest",
  );
}

export function blendEnvironment(
  weights: EnvironmentWeights,
  value: (environment: Environment) => number,
  forest: Environment = ENVIRONMENTS.forest,
) {
  return environmentNames.reduce(
    (sum, name) => sum + weights[name] * value(name === "forest" ? forest : ENVIRONMENTS[name]),
    0,
  );
}
