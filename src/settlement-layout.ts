import { roadFrame, roadPoint } from "./drive.ts";
import { environmentWeights, type SceneryMode } from "./environments.ts";

export const SETTLEMENT_SPACING = 172;
export type BuildingKind = "cabin" | "barn" | "house" | "signal-house";
const types: BuildingKind[] = ["cabin", "house", "barn", "signal-house"];

// Small hamlets alternate banks; the Pacific shore always stays open.
export function settlementLayout(cell: number, mode: SceneryMode) {
  const station = cell * SETTLEMENT_SPACING + 139;
  const side = environmentWeights(station, mode).coast > 0.5 ? 1 : cell % 2 === 0 ? -1 : 1;
  return [0, 1, 2].map((slot) => {
    const at = station + [0, -19, 18][slot];
    const lateral = side * [27, 43, 52][slot];
    const point = roadPoint(at, lateral);
    const kind = types[((cell + slot) % types.length + types.length) % types.length];
    return { kind, station: at, ...point, yaw: roadFrame(at).heading, side };
  });
}

export function settlementClearing(x: number, z: number, station: number, margin: number, mode: SceneryMode) {
  const cell = Math.floor(station / SETTLEMENT_SPACING);
  for (let i = cell - 1; i <= cell + 1; i++) {
    for (const building of settlementLayout(i, mode)) {
      const dx = x - building.x, dz = z - building.z;
      const localX = Math.cos(building.yaw) * dx - Math.sin(building.yaw) * dz;
      const localZ = Math.sin(building.yaw) * dx + Math.cos(building.yaw) * dz;
      if (Math.abs(localX) < 6 + margin && Math.abs(localZ) < 6 + margin) return true;
    }
  }
  return false;
}
