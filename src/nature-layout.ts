import { environmentWeights, type SceneryMode } from "./environments.ts";
import { roadFrame, roadPoint } from "./drive.ts";
import { settlementClearing } from "./settlement-layout.ts";
import { stationClearing } from "./station-route.ts";
import { SEA_LEVEL, terrainSurfaceHeight } from "./terrain.ts";

export const NATURE_CAPACITY = {
  birch: 192,
  "birch-tall": 192,
  broadleaf: 192,
  maple: 192,
  "flower-bush": 192,
  bush: 512,
  flowers: 192,
  "blue-flowers": 192,
  grass: 1536,
} as const;
export type NatureKind = keyof typeof NATURE_CAPACITY;
export interface NaturePlacement {
  kind: NatureKind;
  station: number;
  lateral: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  shade: number;
}

function random(cell: number, seed: number) {
  let value = Math.imul(cell, 374761393) + Math.imul(seed, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function isNatureTree(kind: NatureKind) {
  return ["birch", "birch-tall", "broadleaf", "maple"].includes(kind);
}

// Match the recurring clearings in landmarks.ts: wildlife, cottage, then pond.
// Compare in the landmark's own frame, including the bends in the railway.
export function natureClearing(
  x: number,
  z: number,
  station: number,
  tree: boolean,
  mode: SceneryMode,
) {
  if (settlementClearing(x, z, station, tree ? 3 : 0.8, mode)) return true;
  const nearest = Math.round((station - 96) / 86);
  for (let i = nearest - 1; i <= nearest + 1; i++) {
    const at = 96 + i * 86;
    const kind = ((i % 3) + 3) % 3;
    const coast = environmentWeights(at, mode).coast > 0.5;
    const side = coast ? 1 : Math.floor(at / 86) % 2 === 1 ? -1 : 1;
    const origin = roadPoint(at, side * (kind === 1 ? 31 : kind === 2 ? 14 : 15));
    const heading = roadFrame(at).heading;
    const dx = x - origin.x, dz = z - origin.z;
    const localX = Math.cos(heading) * dx - Math.sin(heading) * dz;
    const localZ = Math.sin(heading) * dx + Math.cos(heading) * dz;
    const width = kind === 1 ? 10 : kind === 2 ? 7 : 8;
    const depth = kind === 2 ? 13 : 11;
    const margin = tree ? 4 : 0;
    if (Math.abs(localX) < width + margin && Math.abs(localZ) < depth + margin)
      return true;
  }
  return false;
}

// Reuse the eleven overlapping cells when advancing into a new section. Terrain
// and clearing checks only run for newly arriving plants, avoiding a full rebuild.
const plantedCells = new Map<string, NaturePlacement[]>();

export function naturePlacements(progress: number, mode: SceneryMode) {
  const placements: NaturePlacement[] = [];
  const first = Math.floor((progress - 72) / 32);
  function add(kind: NatureKind, cell: number, seed: number, station: number, lateral: number) {
    const tree = isNatureTree(kind);
    if (stationClearing(station, lateral, mode)) return;
    const point = roadPoint(station, lateral);
    const weights = environmentWeights(-point.z, mode);
    const abundance = weights.forest + (lateral > 0 ? weights.coast * 0.6 : 0);
    if (random(cell, seed + 301) > abundance || abundance < 0.05) return;
    if (kind === "maple" && weights.forest < 0.5) return;
    if (natureClearing(point.x, point.z, station, tree, mode)) return;
    const height = terrainSurfaceHeight(point.x, point.z, mode);
    if (height < SEA_LEVEL + 2 || (lateral < 0 && weights.coast > 0.65)) return;
    // Keep soft ground cover off steep rock faces.
    const slope = Math.hypot(
      terrainSurfaceHeight(point.x + 0.5, point.z, mode) - height,
      terrainSurfaceHeight(point.x, point.z + 0.5, mode) - height,
    ) * 2;
    if (slope > (tree ? 0.95 : 0.55)) return;
    placements.push({
      kind, station, lateral, x: point.x, y: height - (tree ? 0.09 : 0.035), z: point.z,
      scale: (tree ? (Math.abs(lateral) > 36 ? 1.15 : 0.88) : kind === "bush" ? 1.25 : 0.9) + random(cell, seed + 13) * 0.55,
      yaw: random(cell, seed + 17) * Math.PI * 2,
      shade: 0.84 + random(cell, seed + 19) * 0.16,
    });
  }
  for (let cell = first; cell < first + 12; cell++) {
    const key = `${mode}:${cell}`, cached = plantedCells.get(key);
    if (cached) { placements.push(...cached); continue; }
    const cellStart = placements.length;
    for (const side of [-1, 1]) {
      const sideSeed = side === 1 ? 100 : 200;
      for (let i = 0; i < 8; i++) {
        const seed = sideSeed + i * 37;
        const species = random(cell, seed + 3);
        const kind = species < 0.3 ? "birch" : species < 0.5 ? "birch-tall" : species < 0.83 ? "broadleaf" : "maple";
        add(kind, cell, seed, cell * 32 + random(cell, seed + 5) * 32,
          side * (15 + (i % 3) * 15 + random(cell, seed + 7) * 15));

        // Layer the canopy above irregular banks of shrubs and wildflowers.
        if (i >= 5 || random(cell, seed + 23) < 0.08) continue;
        const station = cell * 32 + 5 + random(cell, seed + 29) * 22;
        const lateral = side * (9 + random(cell, seed + 31) * 19);
        add("flower-bush", cell, seed + 40, station, lateral);
        for (let j = 0; j < 2; j++) {
          add("bush", cell, seed + 50 + j, station + j * 3 - 1,
            lateral + side * (2 + j * 0.7));
          add(j === 0 ? "flowers" : "blue-flowers", cell, seed + 60 + j,
            station - 2 + j * 3, lateral - side * 1.5);
        }
        for (let j = 0; j < 3; j++)
          add("grass", cell, seed + 70 + j, station + j * 2 - 2,
            lateral - side * (0.4 + random(cell, seed + 80 + j) * 2.5));
      }
      // A light bank of broad silhouettes, concentrated near the carriage.
      // Keep coverage through shape and placement, not thousands of tiny leaves.
      for (let i = 0; i < 36; i++) {
        const seed = sideSeed + 1200 + i * 11;
        const station = cell * 32 + (i % 12 + random(cell, seed)) * (32 / 12);
        const lateral = side * (6.8 + Math.floor(i / 12) * 4 + random(cell, seed + 1) * 4);
        add("grass", cell, seed, station, lateral);
        if (i % 4 === 0 && Math.abs(lateral) > 9)
          add("bush", cell, seed + 4, station, lateral + side * 1.4);
      }
    }
    plantedCells.set(key, placements.slice(cellStart));
    if (plantedCells.size > 32) plantedCells.delete(plantedCells.keys().next().value!);
  }
  return placements;
}
