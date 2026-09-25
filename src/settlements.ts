import { SCENERY_DISTANCE } from "./view-distance.ts";
import { createChimneySmoke } from "./chimney-smoke.ts";
import { reducedMotion } from "./motion.ts";
import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { settlementLayout, SETTLEMENT_SPACING, buildingDimensions, type BuildingKind } from "./settlement-layout.ts";
import { dominantEnvironment, environmentWeights, ENVIRONMENTS, type SceneryMode } from "./environments.ts";

// Original, softly coloured architecture. Every solid part is merged into a
// single vertex-coloured mesh; windows and snow each get one additional draw.
export function createBuilding(kind: BuildingKind) {
  const group = new THREE.Group();
  group.name = `wayside-${kind}`;
  const solid: THREE.BufferGeometry[] = [], lights: THREE.BufferGeometry[] = [], snow: THREE.BufferGeometry[] = [];
  const wood = 0x655747, trim = 0xc6b99a, roof = 0x3f5053;
  const shutter = kind === "house" ? 0x586c65 : 0x665c4b;
  const { width, depth, height } = buildingDimensions(kind);
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
  for (let y = 0.65; y < height + 0.3; y += 0.38) {
    for (const side of [-1, 1]) box(wood, 0, y, side * (depth / 2 + 0.025), width, 0.035, 0.06);
    for (const side of [-1, 1]) box(wood, side * (width / 2 + 0.025), y, 0, 0.06, 0.035, depth);
  }
  for (const side of [-1, 1]) {
    box(trim, 0, 0.48, side * (depth / 2 + 0.04), width, 0.16, 0.12);
    box(trim, side * (width / 2 + 0.04), height + 0.22, 0, 0.16, 0.18, depth + 0.15);
    if (kind === "house") box(trim, 0, 3.2, side * (depth / 2 + 0.05), width, 0.16, 0.12);
  }
  const pitch = kind === "cabin" ? 0.65 : kind === "barn" ? 0.5 : 0.42;
  const rise = Math.tan(pitch) * width / 2;
  const chimneyY = height + rise - 0.15;
  // Fill the triangular gables so the roof has a believable closed silhouette.
  const gable = new THREE.Shape();
  gable.moveTo(-width / 2, 0); gable.lineTo(width / 2, 0); gable.lineTo(0, rise); gable.closePath();
  const g = new THREE.ExtrudeGeometry(gable, { depth, bevelEnabled: false, steps: 1 });
  g.translate(0, height + 0.3, -depth / 2); g.deleteAttribute("uv");
  const color = new THREE.Color(wall);
  g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: g.attributes.position.count }, () => [color.r, color.g, color.b]).flat(), 3));
  solid.push(g);
  for (const side of [-1, 1]) {
    const x = side * (width / 4 + 0.18), y = height + 0.3 + rise / 2 - Math.tan(pitch) * 0.18;
    const length = (width / 2 + 0.36) / Math.cos(pitch);
    box(roof, x, y, 0, length, 0.22, depth + 1, -side * pitch);
    // Pale fascia and subtle standing seams give the roof some thickness.
    for (const end of [-1, 1])
      box(trim, x, y - 0.035, end * (depth / 2 + 0.51), length, 0.16, 0.12, -side * pitch);
    for (let z = -depth / 2; z <= depth / 2; z += 0.7)
      box(0x536366, x, y + 0.12, z, length, 0.045, 0.035, -side * pitch);
    box(0xd4dbd4, x, y + 0.16, 0, length, 0.12, depth + 1, -side * pitch, snow);
  }
  box(roof, 0, height + rise + 0.45, 0, 0.22, 0.15, depth + 1.15);
  // A small louvered attic vent breaks up the blank gable.
  for (const side of [-1, 1]) {
    box(trim, 0, height + rise * 0.43 + 0.3, side * (depth / 2 + 0.07), 0.65, 0.65, 0.12);
    for (let y = -0.2; y <= 0.21; y += 0.13)
      box(wood, 0, height + rise * 0.43 + 0.3 + y, side * (depth / 2 + 0.15), 0.46, 0.055, 0.06);
  }
  function window(x: number, y: number, z: number, sideWall = false) {
    // Map the detail outwards on either wall, including the negative X side.
    const outward = Math.sign(sideWall ? x : z);
    function detail(color: number, u: number, v: number, out: number, w: number, h: number, d: number, bucket = solid) {
      box(color, x + (sideWall ? outward * out : u), y + v,
        z + (sideWall ? u : outward * out), sideWall ? d : w, h, sideWall ? w : d, 0, bucket);
    }
    detail(trim, 0, -0.73, 0.04, 1.38, 0.13, 0.3);
    detail(trim, 0, 0.73, 0.02, 1.3, 0.12, 0.2);
    if (kind === "cabin" || kind === "house") for (const edge of [-1, 1]) {
      detail(shutter, edge * 0.78, 0, 0, 0.32, 1.3, 0.1);
      for (const v of [-0.42, 0.42]) detail(wood, edge * 0.78, v, 0.07, 0.34, 0.08, 0.05);
    }
    box(trim, x, y, z, sideWall ? 0.13 : 1.17, 1.35, sideWall ? 1.17 : 0.13);
    detail(0xffdca1, 0, 0, 0.085, 0.93, 1.09, 0.04, lights);
    detail(wood, 0, 0, 0.12, 0.07, 1.12, 0.04);
    detail(wood, 0, 0, 0.12, 0.96, 0.07, 0.04);
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
    const front = depth / 2;
    box(wood, 0, 0.25, front + 0.85, width * 0.8, 0.3, 1.8);
    for (let x = -width * 0.38; x <= width * 0.38; x += 0.3)
      box(0x958369, x, 0.409, front + 0.85, 0.025, 0.018, 1.75);
    box(roof, 0, 2.96, front + 0.8, width * 0.85, 0.18, 2);
    box(trim, 0, 2.86, front + 1.79, width * 0.86, 0.18, 0.12);
    box(0xd4dbd4, 0, 3.1, front + 0.8, width * 0.85, 0.1, 2, 0, snow);
    for (const x of [-width * 0.35, width * 0.35]) {
      box(trim, x, 1.66, front + 1.4, 0.17, 2.6, 0.17);
      box(wood, x, 0.7, front + 1.4, 0.23, 0.6, 0.23);
      const railWidth = Math.abs(x) - 0.85;
      for (const y of [0.62, 1.25]) box(trim, Math.sign(x) * (0.85 + railWidth / 2), y, front + 1.4, railWidth, 0.1, 0.12);
      for (let u = 1; u < Math.abs(x); u += 0.38)
        box(trim, Math.sign(x) * u, 0.92, front + 1.4, 0.055, 0.6, 0.055);
    }
    box(0x8e8878, 0, -0.375, front + 1.95, 1.65, 1.35, 0.45);
    box(0x8e8878, 0, -0.48, front + 2.3, 1.85, 1.14, 0.3);
    // Recessed door panels, casing, brass latch and a warm porch lantern.
    for (const x of [-0.59, 0.59]) box(trim, x, 1.4, front + 0.17, 0.12, 2.18, 0.16);
    box(trim, 0, 2.46, front + 0.17, 1.3, 0.14, 0.16);
    for (const y of [0.88, 1.78]) box(0x617068, 0, y, front + 0.17, 0.74, 0.64, 0.05);
    box(0xc3a16a, 0.35, 1.35, front + 0.23, 0.09, 0.12, 0.08);
    box(wood, 0.94, 2.24, front + 0.24, 0.24, 0.42, 0.28);
    box(0xffdca1, 0.94, 2.24, front + 0.4, 0.15, 0.27, 0.08, 0, lights);
    box(0x827468, -width * 0.27, chimneyY, -1, 0.62, 2, 0.72);
    for (let y = chimneyY - 0.8; y < chimneyY + 1; y += 0.24)
      box(0x605e56, -width * 0.27, y, -1, 0.64, 0.035, 0.74);
    box(0x999180, -width * 0.27, chimneyY + 1, -1, 0.84, 0.16, 0.94);
    box(0x343c39, -width * 0.27, chimneyY + 1.09, -1, 0.45, 0.025, 0.54);
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
  const foundationParts = [new THREE.BoxGeometry(width + 0.5, 1, depth + 0.6)];
  if (kind !== "barn") foundationParts.push(
    new THREE.BoxGeometry(width * 0.8, 1, 1.8).translate(0, 0, depth / 2 + 0.85),
  );
  const foundation = mergeGeometries(foundationParts)!;
  foundationParts.forEach(part => part.dispose());
  const footing = new THREE.Mesh(foundation, new THREE.MeshStandardMaterial({ color: 0x697166, roughness: 1 }));
  footing.name = "stone-foundation"; group.add(footing);
  const chimney = kind === "barn" ? null : new THREE.Vector3(-width * 0.27, chimneyY + 1.12, -1);
  return { group, snowcap, footing, width, depth, chimney };
}

export function createSettlements(world: THREE.Group) {
  const root = new THREE.Group(); root.name = "wayside-hamlets"; world.add(root);
  // Keep complete villages around both the upcoming and previous bends.
  // Multiples of four preserve each cell's building types when recycled.
  const count = Math.ceil((SCENERY_DISTANCE * 2 + SETTLEMENT_SPACING * 2) / (SETTLEMENT_SPACING * 4)) * 4;
  const villages = Array.from({ length: count }, (_, index) => {
    const group = new THREE.Group(); root.add(group);
    const buildings = settlementLayout(index, "forest").map(spec => {
      const building = createBuilding(spec.kind);
      const smoke = building.chimney ? createChimneySmoke() : null;
      if (smoke) { smoke.mesh.position.copy(building.chimney!); building.group.add(smoke.mesh); }
      group.add(building.group); return { ...building, smoke };
    });
    return { group, buildings, cell: Number.NaN, index };
  });
  let elapsed = 0;
  function update(progress: number, mode: SceneryMode, modeChanged: boolean, dt = 0) {
    if (typeof matchMedia === "undefined" || !reducedMotion().matches) elapsed += dt;
    const first = Math.floor((progress - SCENERY_DISTANCE - 139) / SETTLEMENT_SPACING);
    for (const village of villages) {
      const cell = first + ((village.index - first % count + count) % count);
      const weights = environmentWeights(cell * SETTLEMENT_SPACING + 139, mode);
      village.group.visible = Math.abs(cell * SETTLEMENT_SPACING + 139 - progress) < SCENERY_DISTANCE &&
        weights.tunnel < 0.15 && weights.bridge < 0.15;
      for (const [i, building] of village.buildings.entries()) {
        if (village.group.visible && building.group.visible)
          building.smoke?.update(elapsed, building.snowcap.visible, village.index * 0.21 + i * 0.13);
      }
      if (cell === village.cell && !modeChanged) continue;
      village.cell = cell;
      settlementLayout(cell, mode).forEach((spec, i) => {
        const building = village.buildings[i];
        const { group, footing } = building;
        group.visible = spec.suitable;
        group.position.set(spec.x, spec.high, spec.z); group.rotation.y = spec.yaw;
        footing.scale.y = spec.suitable ? spec.high - spec.low + 0.6 : 0.6;
        footing.position.y = 0.3 - footing.scale.y / 2;
        building.snowcap.visible = ENVIRONMENTS[dominantEnvironment(environmentWeights(spec.station, mode))].snowRoof;
        building.smoke?.update(elapsed, building.snowcap.visible, village.index * 0.21 + i * 0.13);
      });
    }
  }
  return { root, update };
}
