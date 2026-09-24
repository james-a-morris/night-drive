import type { SceneryMode } from "./environments.ts";
type Point = { x: number; y: number; z: number };
import { roadFrame } from "./drive.ts";
import { environmentWeights } from "./environments.ts";

export const TERRAIN_OFFSETS = [
  5.5, 7.5, 10, 13, 17, 22, 28, 36, 46, 59, 75, 95, 119, 147, 179, 215, 256,
];
export const TERRAIN_ROW_LENGTH = 3;
export const SEA_LEVEL = -8;

// Small coves and headlands along the ocean side. Keep this profile in sync
// with the coastal water shader so the foam follows the actual waterline.
export function coastalShoreDistance(station: number) {
  return 23 + 4 * Math.sin(station / 83) + 3 * Math.sin(station / 39 + 0.7);
}

export function smoothstep(from: number, to: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

export function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const u = smoothstep(0, 1, x - ix),
    v = smoothstep(0, 1, y - iy);
  const a = hash(ix, iy),
    b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1),
    d = hash(ix + 1, iy + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function fractal(x: number, z: number, octaves: number = 4) {
  let sum = 0,
    amplitude = 0.55,
    total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, z) * amplitude;
    total += amplitude;
    x = x * 2.07 + 17.3;
    z = z * 2.03 + 9.2;
    amplitude *= 0.48;
  }
  return sum / total;
}

function distanceFromRoad(x: number, z: number) {
  // Project onto the curved centerline, keeping the banks out of the roadway.
  let station = -z;
  for (let i = 0; i < 3; i++) {
    const frame = roadFrame(station);
    const slope = frame.rightZ / frame.rightX;
    station += ((x - frame.x) * slope - (z + station)) / (1 + slope * slope);
  }
  const frame = roadFrame(station);
  return (x - frame.x) * frame.rightX + (z - frame.z) * frame.rightZ;
}

// World-space noise keeps neighboring pieces of landscape continuous when
// road sections recycle. Broad landforms, erosion and small ledges have their
// own scales, instead of repeating a mountain mesh along the roadside.
export function terrainHeight(
  x: number,
  z: number,
  mode: SceneryMode = "auto",
) {
  const lateral = distanceFromRoad(x, z);
  const distance = Math.abs(lateral);
  const bank = smoothstep(16, 46, distance);
  const weights = environmentWeights(-z, mode);
  if (
    bank === 0 &&
    weights.bridge === 0 &&
    (weights.coast === 0 || lateral >= -8)
  )
    return 0;
  const warp = fractal(x * 0.006 + 24, z * 0.006 - 11, 3);
  const rolling = fractal(x * 0.022 + warp, z * 0.018, 3);
  const broad = fractal(x * 0.007 + 81, z * 0.006 + 36);
  const ridge =
    1 - Math.abs(noise(x * 0.015 + warp * 2, z * 0.009 + 18) * 2 - 1);
  const erosion = fractal(x * 0.065, z * 0.045, 3);
  const foothills = smoothstep(38, 110, distance) * (3 + rolling * 10);
  const peaks =
    smoothstep(75, 220, distance) * (18 + broad * 66 + ridge * ridge * 35);
  const stone =
    bank * (0.4 + rolling * 1.5 + erosion * 0.8) + foothills + peaks;
  const dunes =
    bank *
      (1 + 14 * (0.5 + 0.5 * Math.sin(x * 0.045 + z * 0.019 + warp * 5)) ** 2) +
    smoothstep(70, 180, distance) *
      (12 + smoothstep(0.3, 0.7, broad) * 42 + ridge * 12);
  const coast =
    lateral < 0
      ? -16 * smoothstep(8, coastalShoreDistance(-z) * 2 - 8, distance)
      : stone * 0.65 + bank * rolling * 3;
  return (
    stone * weights.forest +
    (stone * 1.3 + peaks * ridge * 0.18) * weights.alpine +
    dunes * weights.desert +
    coast * weights.coast +
    (stone * 1.4 + bank * 12) * weights.tunnel +
    (stone * 0.8 - 34 * smoothstep(0, 5.5, distance)) * weights.bridge
  );
}

export function terrainPoint(
  station: number,
  lateral: number,
  mode: SceneryMode = "auto",
) {
  const frame = roadFrame(station);
  // Follow the shoulders closely; let the wider landscape use a regular grid
  // so tight turns cannot fold distant hills back through themselves.
  const follow = Math.exp(-Math.max(0, Math.abs(lateral) - 12) / 22);
  const x = frame.x + lateral * (1 + (frame.rightX - 1) * follow);
  const z = -station + lateral * frame.rightZ * follow;
  return { x, y: terrainHeight(x, z, mode), z };
}

function triangleHeight(x: number, z: number, a: Point, b: Point, c: Point) {
  const denominator = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
  const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / denominator;
  const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / denominator;
  if (u < -0.00001 || v < -0.00001 || u + v > 1.00001) return null;
  return a.y * u + b.y * v + c.y * (1 - u - v);
}

// Props rest on the actual triangles. Sampling the underlying noise alone can
// leave a boulder floating above a wide, gently sloping patch of mesh.
export function terrainSurfaceHeight(
  x: number,
  z: number,
  mode: SceneryMode = "auto",
) {
  let station = -z,
    lateral = x - roadFrame(station).x;
  for (let i = 0; i < 6; i++) {
    const frame = roadFrame(station);
    const follow = Math.exp(-Math.max(0, Math.abs(lateral) - 12) / 22);
    lateral = (x - frame.x) / (1 + (frame.rightX - 1) * follow);
    station = -z + lateral * frame.rightZ * follow;
  }
  if (Math.abs(lateral) <= TERRAIN_OFFSETS[0]) return 0;
  const side = Math.sign(lateral);
  const column = Math.min(
    TERRAIN_OFFSETS.length - 2,
    TERRAIN_OFFSETS.findIndex((offset) => offset > Math.abs(lateral)) - 1,
  );
  const row = Math.floor(station / TERRAIN_ROW_LENGTH) * TERRAIN_ROW_LENGTH;
  for (const rowOffset of [0, -TERRAIN_ROW_LENGTH, TERRAIN_ROW_LENGTH]) {
    for (const columnOffset of [0, -1, 1]) {
      const index = column + columnOffset;
      if (index < 0 || index >= TERRAIN_OFFSETS.length - 1) continue;
      const left = TERRAIN_OFFSETS[index] * side,
        right = TERRAIN_OFFSETS[index + 1] * side;
      const start = row + rowOffset;
      const a = terrainPoint(start, left, mode),
        b = terrainPoint(start, right, mode);
      const c = terrainPoint(start + TERRAIN_ROW_LENGTH, left, mode),
        d = terrainPoint(start + TERRAIN_ROW_LENGTH, right, mode);
      const height =
        triangleHeight(x, z, a, b, c) ?? triangleHeight(x, z, b, d, c);
      if (height !== null) return height;
    }
  }
  return terrainHeight(x, z, mode);
}
