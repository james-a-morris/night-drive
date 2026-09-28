import { roadFrame } from "./drive.ts";
import { ROUTE_LENGTH, TRANSITION_LENGTH, routeRegions, type SceneryMode } from "./environments.ts";
import { SUBSEA_RAMP_LENGTH } from "./route-elevation.ts";

export const UNDERWATER_RADIUS = 6.8;
export const UNDERWATER_SURFACE = 18;
export const UNDERWATER_SLEEVE = SUBSEA_RAMP_LENGTH;
export const UNDERWATER_VIEW_DISTANCE = 216;
const region = routeRegions.find(region => region.name === "underwater")!;

// Rock ramps follow the full biome blends down to the reef and back up onto
// the coast. Manual selection is an uninterrupted glass passage at depth.
export function underwaterSpan(station: number, mode: SceneryMode) {
  if (mode === "underwater") return { start: -Infinity, end: Infinity };
  if (mode !== "auto") return null;
  const cycle = Math.floor(station / ROUTE_LENGTH) * ROUTE_LENGTH;
  return {
    start: cycle + region.start - TRANSITION_LENGTH,
    end: cycle + region.start + region.length,
  };
}

export function insideUnderwater(station: number, mode: SceneryMode, margin = 0) {
  const span = underwaterSpan(station, mode);
  return !!span && station >= span.start + margin && station < span.end - margin;
}

export function viewpointUnderwater(x: number, z: number, mode: SceneryMode) {
  if (mode === "underwater") return true;
  const span = underwaterSpan(-z, mode);
  if (!span) return false;
  const past = (station: number) => {
    const frame = roadFrame(station);
    return (x - frame.x) * frame.rightZ - (z - frame.z) * frame.rightX;
  };
  return past(span.start) >= 0 && past(span.end) < 0;
}
