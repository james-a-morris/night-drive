import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { settlementLayout, SETTLEMENT_SPACING, type BuildingKind } from "./settlement-layout.ts";
import { dominantEnvironment, environmentWeights, ENVIRONMENTS, type SceneryMode } from "./environments.ts";
import { terrainSurfaceHeight } from "./terrain.ts";

// Original, softly coloured architecture. Every solid part is merged into a
// single vertex-coloured mesh; windows and snow each get one additional draw.
export function createBuilding(kind: BuildingKind) {
  const group = new THREE.Group();
  group.name = `wayside-${kind}`;
  const solid: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], snow: THREE.BufferGeometry[] = [];
  const wood = 0x726451, trim = 0xb6aa8e, roof = 0x485859;
  const width = kind === "barn" ? 8.4 : kind === "signal-house" ? 4.2 : 6.6;
  const depth = kind === "barn" ? 7.2 : 5.6;
  const height = kind === "house" ? 5.6 : kind === "signal-house" ? 5 : 3.2;
  const wall = kind === "barn" ? 0x805c50 : kind === "house" ? 0xb5a78c : kind === "signal-house" ? 0x71847b : 0x7e8066;
  function box(color: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0, bucket = solid) {
    const geometry = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    geometry.deleteAttribute("uv");
    geometry.rotateZ(rz); geometry.translate(x, y, z);
    const c = new THREE.Color(color), values = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) values.push(c.r, c.g, c.b);
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(values, 3));
    bucket.push(geometry);
  }
  box(wall, 0, height / 2 + 0.3, 0, width, height, depth);
  // Corners and siding catch the low light without needing noisy textures.
  for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2])
    box(trim, x, height / 2 + 0.3, z, 0.15, height + 0.12, 0.15);
  for (let y = 0.8; y < height; y += 0.65) {
    for (const side of [-1, 1]) box(wood, 0, y, side * (depth / 2 + 0.025), width, 0.045, 0.06);
  }
  const pitch = kind === "cabin" ? 0.65 : kind === "barn" ? 0.5 : 0.42;
  const rise = Math.tan(pitch) * width / 2;
  // Fill the triangular gables so the roof has a believable closed silhouette.
  const gable = new THREE.Shape();
  gable.moveTo(-width / 2, 0); gable.lineTo(width / 2, 0); gable.lineTo(0, rise); gable.closePath();
  const g = new THREE.ExtrudeGeometry(gable, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, height + 0.3, -depth / 2); g.deleteAttribute("uv");
  const color = new THREE.Color(wall);
  g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [color.r, color.g, color.b]).flat(), 3));
  solid.push(g);
  for (const side of [-1, 1]) {
    const x = side * width / 4, y = height + 0.3 + rise / 2;
    const length = width / 2 / Math.cos(pitch) + 0.8;
    box(roof, x, y, 0, length, 0.22, depth + 1, -side * pitch);
    box(0xd4dbd4, x, y + 0.16, 0, length, 0.12, depth + 1, -side * pitch, snow);
  }
  function window(x: number, y: number, z: number, sideWall = false) {
    box(trim, x, y, z, sideWall ? 0.13 : 1.17, 1.35, sideWall ? 1.17 : 0.13);
    box(0xffdca1, x, y, z + (sideWall ? 0 : Math.sign(z) * 0.075), sideWall ? 0.16 : 0.93, 1.09, sideWall ? 0.93 : 0.04, 0, lights);
    box(wood, x, y, z + (sideWall ? 0 : Math.sign(z) * 0.11), sideWall ? 0.2 : 0.07, 1.12, sideWall ? 0.07 : 0.04);
    box(wood, x, y, z + (sideWall ? 0 : Math.sign(z) * 0.11), sideWall ? 0.2 : 0.96, 0.07, sideWall ? 0.96 : 0.04);
  }
  for (const side of [-1, 1]) {
    for (const x of [-width * 0.28, width * 0.28]) window(x, 2, side * (depth / 2 + 0.08));
    window(side * (width / 2 + 0.08), height > 4 ? 4.1 : 2, 0, true);
    if (kind === "house") for (const x of [-1.8, 1.8]) window(x, 4.5, side * (depth / 2 + 0.08));
  }
  box(0x454e45, 0, 1.3, depth / 2 + 0.09, kind === "barn" ? 2.5 : 1.05, 2, 0.13);
  if (kind === "barn") {
    // Wide double doors, diagonal bracing and a small hayloft opening.
    for (const side of [-1, 1]) box(trim, side * 0.59, 1.3, depth / 2 + 0.18, 0.09, 2.15, 0.06, side * 0.54);
    box(0x414b42, 0, height + 0.65, depth / 2 + 0.03, 0.95, 0.8, 0.08);
  } else {
    box(wood, 0, 0.25, depth / 2 + 0.85, width * 0.8, 0.3, 1.8);
    box(roof, 0, 2.85, depth / 2 + 0.8, width * 0.85, 0.16, 2);
    for (const x of [-width * 0.35, width * 0.35]) box(trim, x, 1.5, depth / 2 + 1.4, 0.13, 2.5, 0.13);
    box(0x686661, -width * 0.27, height + rise * 0.6, -1, 0.62, 2, 0.72);
  }
  if (kind === "signal-house") {
    box(wood, width / 2 + 0.9, 3.2, 0, 0.13, 6.4, 0.13);
    box(trim, width / 2 + 0.9, 5.9, 0, 2.6, 0.22, 0.16);
    box(0xc18b66, width / 2 + 1.9, 5.9, 0.03, 0.5, 0.24, 0.2);
  }
  function mesh(parts: THREE.BufferGeometry[], material: THREE.Material, name: string) {
    const merged = mergeGeometries(parts)!;
    parts.forEach(part => part.dispose());
    const result = new THREE.Mesh(merged, material); result.name = name; group.add(result); return result;
  }
  mesh(solid, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), "building-shell");
  mesh(lights, new THREE.MeshStandardMaterial({ color: 0xffdaa0, emissive: 0xffbf70, emissiveIntensity: 0.65, roughness: 1 }), "lamplit-windows");
  const snowcap = mesh(snow, new THREE.MeshStandardMaterial({ color: 0xd4dbd4, roughness: 1 }), "snow-on-roof");
  snowcap.visible = false;
  const footing = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 1, depth + 0.6), new THREE.MeshStandardMaterial({ color: 0x697166, roughness: 1 }));
  footing.name = "stone-foundation"; group.add(footing);
  return { group, snowcap, footing, width, depth };
}

export function createSettlements(world: THREE.Group) {
  const root = new THREE.Group(); root.name = "wayside-hamlets"; world.add(root);
  // Four reusable sets keep each village's architecture stable when recycled.
  const villages = Array.from({ length: 4 }, (_, index) => {
    const group = new THREE.Group(); root.add(group);
    const buildings = settlementLayout(index, "forest").map(spec => {
      const building = createBuilding(spec.kind); group.add(building.group); return building;
    });
    return { group, buildings, cell: Number.NaN, index };
  });
  function update(progress: number, mode: SceneryMode, modeChanged: boolean) {
    const first = Math.floor((progress - 230) / SETTLEMENT_SPACING);
    for (const village of villages) {
      const cell = first + ((village.index - first % 4 + 4) % 4);
      const weights = environmentWeights(cell * SETTLEMENT_SPACING + 139, mode);
      village.group.visible = Math.abs(cell * SETTLEMENT_SPACING + 139 - progress) < 360 &&
        weights.tunnel < 0.15 && weights.bridge < 0.15;
      if (cell === village.cell && !modeChanged) continue;
      village.cell = cell;
      settlementLayout(cell, mode).forEach((spec, i) => {
        const building = village.buildings[i];
        const { group, footing, width, depth } = building;
        const ground = (x: number, z: number) => terrainSurfaceHeight(spec.x + Math.cos(spec.yaw) * x + Math.sin(spec.yaw) * z, spec.z + Math.cos(spec.yaw) * z - Math.sin(spec.yaw) * x, mode);
        const heights = [-width / 2, width / 2].flatMap(x => [-depth / 2, depth / 2].map(z => ground(x, z)));
        const high = Math.max(...heights), low = Math.min(...heights);
        group.position.set(spec.x, high, spec.z); group.rotation.y = spec.yaw;
        footing.scale.y = high - low + 0.6; footing.position.y = 0.3 - footing.scale.y / 2;
        building.snowcap.visible = ENVIRONMENTS[dominantEnvironment(environmentWeights(spec.station, mode))].snowRoof;
      });
    }
  }
  return { root, update };
}
