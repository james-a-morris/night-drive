import { ROUTE_LENGTH, TRANSITION_LENGTH, routeRegions, type SceneryMode } from "./environments.ts";

export const SUBSEA_TRACK_LEVEL = -26;
export const SUBSEA_RAMP_LENGTH = TRANSITION_LENGTH;
export const SUBSEA_OPEN_GRADE = 120;
export const SUBSEA_REGION = routeRegions.find(region => region.name === "underwater")!;
const smooth = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

export function trackElevation(station: number, mode: SceneryMode) {
  if (mode === "underwater") return SUBSEA_TRACK_LEVEL;
  if (mode !== "auto") return 0;
  const s = ((station % ROUTE_LENGTH) + ROUTE_LENGTH) % ROUTE_LENGTH;
  return SUBSEA_TRACK_LEVEL *
    smooth(SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH - SUBSEA_OPEN_GRADE, SUBSEA_REGION.start, s) *
    (1 - smooth(SUBSEA_REGION.start + SUBSEA_REGION.length - SUBSEA_RAMP_LENGTH,
      SUBSEA_REGION.start + SUBSEA_REGION.length + SUBSEA_OPEN_GRADE, s)) || 0;
}

export function trackGrade(station: number, mode: SceneryMode) {
  return trackElevation(station + .5, mode) - trackElevation(station - .5, mode);
}

// Dry dunes first reveal a shoreline on the left. The water is visible well
// before the train reaches the descending portal, including in manual desert.
export function desertOceanApproach(station: number, mode: SceneryMode) {
  if (mode === "desert") return 1;
  if (mode !== "auto") return 0;
  const s = ((station % ROUTE_LENGTH) + ROUTE_LENGTH) % ROUTE_LENGTH;
  return smooth(SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH - 360,
    SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH - 60, s) *
    (1 - smooth(SUBSEA_REGION.start - 60, SUBSEA_REGION.start + 60, s));
}

// Low, weathered headlands bury the descending tunnel. The same landform is
// sampled by the landscape and the roof, so the entrance grows out of the
// dunes instead of sitting in front of them as a freestanding shell.
export function subseaHeadlandHeight(station: number, lateral: number, mode: SceneryMode) {
  if (mode !== "auto") return -Infinity;
  const s = ((station % ROUTE_LENGTH) + ROUTE_LENGTH) % ROUTE_LENGTH;
  const entrance = SUBSEA_REGION.start - SUBSEA_RAMP_LENGTH;
  const exit = SUBSEA_REGION.start + SUBSEA_REGION.length;
  const along = s < (entrance + exit) / 2 ? s - entrance : exit - s;
  if (along < -54 || along > SUBSEA_RAMP_LENGTH + 48) return -Infinity;
  const length = smooth(-54, 4, along) * (1 - smooth(SUBSEA_RAMP_LENGTH - 24, SUBSEA_RAMP_LENGTH + 48, along));
  const width = lateral < 0 ? 24 : 34;
  const weathering = Math.sin(along * .085 + lateral * .12) * .65 + Math.sin(along * .21 - lateral * .18) * .3;
  return trackElevation(station, mode) - 18 +
    (30.8 + weathering) * length * Math.exp(-((lateral / width) ** 2));
}
