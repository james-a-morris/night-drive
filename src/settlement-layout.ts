import { roadFrame, roadPoint } from "./drive.ts";
import { environmentWeights, type SceneryMode } from "./environments.ts";
import { terrainSurfaceHeight } from "./terrain.ts";

export const SETTLEMENT_SPACING = 172;
export const MAX_BUILDING_RELIEF = 0.75;
export type BuildingKind = "cabin" | "barn" | "house" | "signal-house";
const types: BuildingKind[] = ["cabin", "house", "barn", "signal-house"];

export function buildingDimensions(kind: BuildingKind) {
  return {
    width: kind === "barn" ? 8.4 : kind === "signal-house" ? 4.2 : 6.6,
    depth: kind === "barn" ? 7.2 : 5.6,
    height: kind === "house" ? 5.6 : kind === "signal-house" ? 5 : 3.2,
  };
}

// Include eaves, the entire porch and its steps, not just the wall corners.
export function buildingGround(kind: BuildingKind, x: number, z: number, yaw: number, mode: SceneryMode) {
  return sampleBuildingGround(kind, (localX, localZ) => terrainSurfaceHeight(
    x + Math.cos(yaw) * localX + Math.sin(yaw) * localZ,
    z + Math.cos(yaw) * localZ - Math.sin(yaw) * localX, mode,
  ));
}

export function sampleBuildingGround(kind: BuildingKind, groundAt: (x: number, z: number) => number) {
  const { width, depth } = buildingDimensions(kind);
  const halfX = width / 2 + 0.6, back = -depth / 2 - 0.6;
  const front = depth / 2 + (kind === "barn" ? 0.6 : 2.5);
  let low = Infinity, high = -Infinity;
  for (let ix = 0; ix <= 4; ix++) for (let iz = 0; iz <= 4; iz++) {
    const localX = -halfX + ix * halfX / 2, localZ = back + iz * (front - back) / 4;
    const y = groundAt(localX, localZ);
    low = Math.min(low, y); high = Math.max(high, y);
  }
  return { low, high };
}

type BuildingSite = {
  kind: BuildingKind; station: number; x: number; z: number; yaw: number;
  side: number; low: number; high: number; suitable: boolean;
};
// Vegetation asks about clearings thousands of times. Share the exact same
// bounded, deterministic layout with the renderer without resampling terrain.
const layouts = new Map<string, BuildingSite[]>();

export function settlementLayout(cell: number, mode: SceneryMode) {
  const key = `${mode}:${cell}`;
  const cached = layouts.get(key);
  if (cached) return cached;
  const station = cell * SETTLEMENT_SPACING + 139;
  const side = environmentWeights(station, mode).coast > 0.5 ? 1 : cell % 2 === 0 ? -1 : 1;
  const sites: BuildingSite[] = [];
  for (const slot of [0, 1, 2]) {
    const kind = types[((cell + slot) % types.length + types.length) % types.length];
    let selected: BuildingSite | undefined;
    // Prefer the original hamlet spacing, then seek a gentle shoulder nearby.
    search: for (const lateral of [[27, 43, 52][slot], 23, 19]) {
      for (const shift of [0, -7, 7]) {
        const at = station + [0, -19, 18][slot] + shift;
        const point = roadPoint(at, side * lateral);
        const yaw = roadFrame(at).heading - side * Math.PI / 2;
        const ground = buildingGround(kind, point.x, point.z, yaw, mode);
        const weights = environmentWeights(at, mode);
        const suitable = ground.high - ground.low <= MAX_BUILDING_RELIEF && ground.low >= -0.1 &&
          weights.tunnel < 0.15 && weights.bridge < 0.15 &&
          !sites.some(site => site.suitable && Math.hypot(site.x - point.x, site.z - point.z) < 15);
        const candidate = { kind, station: at, ...point, yaw, side, ...ground, suitable };
        selected ??= candidate;
        if (suitable) { selected = candidate; break search; }
      }
    }
    sites.push(selected!);
  }
  if (layouts.size >= 96) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, sites);
  return sites;
}

export function settlementClearing(x: number, z: number, station: number, margin: number, mode: SceneryMode) {
  const cell = Math.floor(station / SETTLEMENT_SPACING);
  for (let i = cell - 1; i <= cell + 1; i++) {
    for (const building of settlementLayout(i, mode)) {
      if (!building.suitable) continue;
      const dx = x - building.x, dz = z - building.z;
      const localX = Math.cos(building.yaw) * dx - Math.sin(building.yaw) * dz;
      const localZ = Math.sin(building.yaw) * dx + Math.cos(building.yaw) * dz;
      if (Math.abs(localX) < 6 + margin && Math.abs(localZ) < 6 + margin) return true;
    }
  }
  return false;
}
