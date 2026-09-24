import { environmentWeights, insideTunnel, type SceneryMode } from "./environments.ts";

export const STATION_DWELL_SECONDS = 22;
export const STATION_INTERVAL = 3800;
export const FIRST_STATION = 620;
const names = ["Willow Halt", "Lantern Field", "Mossbank", "Cedar Crossing", "Stillwater", "Moonlit Vale"];
export interface StationStop { index: number; at: number; name: string }
const stationCache = new Map<number, StationStop | null>();

export function stationAvailable(at: number, mode: SceneryMode) {
  for (const offset of [-110, 0, 150]) {
    const weights = environmentWeights(at + offset, mode);
    if (insideTunnel(at + offset, mode) || weights.tunnel > 0.02 || weights.bridge > 0.02) return false;
  }
  return true;
}

// An independent timetable, with deterministic variation. Unsafe sites are
// passed over rather than placing a platform in a tunnel, on a bridge or portal.
export function stationAt(index: number): StationStop | null {
  if (index < 0) return null;
  if (stationCache.has(index)) return stationCache.get(index)!;
  const jitter = index === 0 ? 0 : ((Math.imul(index, 1274126177) >>> 0) % 901) - 450;
  const nominal = FIRST_STATION + index * STATION_INTERVAL + jitter;
  let stop: StationStop | null = null;
  for (const shift of [0, ...Array.from({ length: 8 }, (_, i) => [(i + 1) * 180, -(i + 1) * 180]).flat()]) {
    const at = nominal + shift;
    if (stationAvailable(at, "auto")) { stop = { index, at, name: names[index % names.length] }; break; }
  }
  stationCache.set(index, stop);
  if (stationCache.size > 32) stationCache.delete(stationCache.keys().next().value!);
  return stop;
}

export function stationsNear(progress: number) {
  const index = Math.floor((progress - FIRST_STATION) / STATION_INTERVAL);
  const stops: StationStop[] = [];
  for (let i = Math.max(0, index - 1); i <= index + 2; i++) {
    const stop = stationAt(i);
    if (stop) stops.push(stop);
  }
  return stops;
}

export function stationClearing(station: number, lateral: number, mode: SceneryMode) {
  return Math.abs(lateral) < 19 && stationsNear(station).some(stop =>
    stationAvailable(stop.at, mode) && station > stop.at - 40 && station < stop.at + 110);
}
