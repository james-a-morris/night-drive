import { roadFrame, roadPoint } from "./drive.ts";
import { environmentWeights, type SceneryMode } from "./environments.ts";
import { buildingGround, MAX_BUILDING_RELIEF, settlementClearing } from "./settlement-layout.ts";
import { stationClearing } from "./station-route.ts";

// The recurring windmill cottages share one placement with all vegetation.
const cache = new Map<string, ReturnType<typeof chooseSite>>();
function chooseSite(station: number, mode: SceneryMode) {
  const weights = environmentWeights(station, mode);
  const side = weights.coast > 0.5 ? 1 : Math.floor(station / 86) % 2 === 1 ? -1 : 1;
  for (const lateral of [31, 23, 19]) for (const shift of [0, -8, 8]) {
    const at = station + shift;
    const point = roadPoint(at, side * lateral);
    const yaw = roadFrame(at).heading - side * Math.PI / 2;
    const ground = buildingGround("cabin", point.x, point.z, yaw, mode);
    if (ground.high - ground.low > MAX_BUILDING_RELIEF || ground.low < -0.1 ||
      stationClearing(at, lateral, mode) || settlementClearing(point.x, point.z, at, 9, mode)) continue;
    return { ...point, ...ground, yaw, station: at };
  }
  return null;
}
export function cottageSite(station: number, mode: SceneryMode) {
  const key = `${mode}:${station}`;
  if (cache.has(key)) return cache.get(key)!;
  const site = chooseSite(station, mode);
  if (cache.size >= 96) cache.delete(cache.keys().next().value!);
  cache.set(key, site);
  return site;
}
