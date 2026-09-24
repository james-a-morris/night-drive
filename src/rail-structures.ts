import * as THREE from "./three.ts";
import { createTunnelDinosaurs, DINOSAUR_SITES } from "./tunnel-dinosaur.ts";
import { createTunnelGraffiti } from "./tunnel-graffiti.ts";
import { roadFrame, roadPoint, SEGMENT_LENGTH } from "./drive.ts";
import {
  environmentWeights,
  insideTunnel,
  tunnelSpan,
  tunnelSection,
  tunnelLampLit,
  type SceneryMode,
} from "./environments.ts";

// Shared route-space geometry keeps the lining, portals and viaduct joined on bends.
const WIDTH = 7.8;
const profile = (angle: number, radius = WIDTH, rise = 5.5) => ({
  x: Math.cos(angle) * radius,
  y: angle === 0 || angle === Math.PI ? -0.3 : 3.5 + Math.sin(angle) * rise,
});
const angles = [
  0,
  ...Array.from({ length: 25 }, (_, i) => 0.001 + (i / 24) * (Math.PI - 0.002)),
  Math.PI,
];

const liningProfile = [
  profile(0),
  { x: WIDTH, y: 1.05 },
  { x: WIDTH, y: 1.85 },
  ...angles.slice(1, -1).map((a) => profile(a)),
  { x: -WIDTH, y: 1.85 },
  { x: -WIDTH, y: 1.05 },
  profile(Math.PI),
];

type Vertex = { x: number; y: number; z: number };
class Surface {
  readonly baseColor?: THREE.Color;
  constructor(baseColor?: THREE.Color) { this.baseColor = baseColor; }
  positions: number[] = [];
  colors: number[] = [];
  quad(
    a: Vertex,
    b: Vertex,
    c: Vertex,
    d: Vertex,
    color?: THREE.Color | THREE.Color[],
  ) {
    const vertices = [a, b, c, d];
    for (const index of [0, 1, 2, 1, 3, 2]) {
      const p = vertices[index];
      this.positions.push(p.x, p.y, p.z);
      const shade = (Array.isArray(color) ? color[index] : color) ?? this.baseColor;
      if (shade) this.colors.push(shade.r, shade.g, shade.b);
    }
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    if (this.colors.length)
      geometry.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(this.colors, 3),
      );
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
const at = (station: number, lateral: number, y: number): Vertex => ({
  ...roadPoint(station, lateral),
  y,
});

function ribbon(
  surface: Surface,
  from: number,
  to: number,
  crossSection: { x: number; y: number }[],
  color?: (station: number, index: number) => THREE.Color,
  opening?: (station: number, index: number) => boolean,
) {
  const rows = Math.max(1, Math.ceil((to - from) / (opening ? 1.5 : 3)));
  for (let row = 0; row < rows; row++) {
    const s = from + ((to - from) * row) / rows;
    const t = from + ((to - from) * (row + 1)) / rows;
    for (let i = 0; i < crossSection.length - 1; i++) {
      if (opening?.((s + t) / 2, i)) continue;
      const a = crossSection[i],
        b = crossSection[i + 1];
      surface.quad(
        at(s, a.x, a.y),
        at(s, b.x, b.y),
        at(t, a.x, a.y),
        at(t, b.x, b.y),
        color
          ? [
              color(s, i).clone(),
              color(s, i + 1).clone(),
              color(t, i).clone(),
              color(t, i + 1).clone(),
            ]
          : undefined,
      );
    }
  }
}

const cube = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
function box(
  surface: Surface,
  station: number,
  lateral: number,
  y: number,
  width: number,
  height: number,
  depth: number,
  color?: THREE.Color,
) {
  color ??= surface.baseColor;
  const frame = roadFrame(station),
    center = roadPoint(station, lateral);
  const points = cube.attributes.position;
  for (let i = 0; i < points.count; i++) {
    if (color) surface.colors.push(color.r, color.g, color.b);
    const x = points.getX(i) * width,
      z = points.getZ(i) * depth;
    surface.positions.push(
      center.x + frame.rightX * x - frame.rightZ * z,
      y + points.getY(i) * height,
      center.z + frame.rightZ * x + frame.rightX * z,
    );
  }
}

// Solid braces use route-space endpoints so adjacent bays follow the bends.
function brace(surface: Surface, a: Vertex, b: Vertex, width: number, color: THREE.Color) {
  const start = new THREE.Vector3(a.x, a.y, a.z), end = new THREE.Vector3(b.x, b.y, b.z);
  const direction = end.clone().sub(start), length = direction.length();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  const center = start.add(end).multiplyScalar(0.5), point = new THREE.Vector3();
  const scale = new THREE.Vector3(width, length, width);
  for (let i = 0; i < cube.attributes.position.count; i++) {
    point.fromBufferAttribute(cube.attributes.position, i).multiply(scale);
    point.applyQuaternion(rotation).add(center);
    surface.positions.push(point.x, point.y, point.z);
    surface.colors.push(color.r, color.g, color.b);
  }
}
export function bridgeDeckAt(station: number, mode: SceneryMode) {
  return environmentWeights(station + 1.5, mode).bridge >= 0.015 && !insideTunnel(station + 1.5, mode);
}

const bridgeColors = {
  stone: new THREE.Color(0x96816a), coping: new THREE.Color(0xc0ad87),
  course: new THREE.Color(0x756c5b), steel: new THREE.Color(0x426a61),
  darkSteel: new THREE.Color(0x304d49), bronze: new THREE.Color(0xb08a52),
};

export function createRailStructures(world: THREE.Group) {
  const root = new THREE.Group();
  root.name = "tunnel-and-viaduct";
  world.add(root);
  const dinosaurs = createTunnelDinosaurs(world);
  const graffiti = createTunnelGraffiti(world);
  const materials = {
    lining: new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    stone: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    iron: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.35,
      side: THREE.DoubleSide,
    }),
    lamps: new THREE.MeshBasicMaterial({ color: 0xffd399 }),
    water: new THREE.MeshStandardMaterial({
      color: 0x3f8187,
      roughness: 0.28,
      metalness: 0.35,
      side: THREE.DoubleSide,
    }),
  };
  const meshes = Object.fromEntries(
    Object.entries(materials).map(([name, material]) => {
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.name = `rail-structure-${name}`;
      root.add(mesh);
      return [name, mesh];
    }),
  );
  // A fixed pool of lights; steady lamps pass the carriage without flicker or flashes.
  const lights = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight(0xffc17a, 14, 22, 2);
    world.add(light);
    return light;
  });
  let previousCell = NaN,
    previousMode: SceneryMode | undefined;
  const wallColor = new THREE.Color();
  function rebuild(progress: number, mode: SceneryMode) {
    const surfaces = {
      lining: new Surface(),
      stone: new Surface(new THREE.Color(0x666968)),
      iron: new Surface(new THREE.Color(0x495659)),
      lamps: new Surface(),
      water: new Surface(),
    };
    const first = Math.floor(progress / SEGMENT_LENGTH) * SEGMENT_LENGTH - 384;
    const last = first + 816;
    for (let station = first; station < last; station += SEGMENT_LENGTH) {
      const span = tunnelSpan(station, mode);
      if (span) {
        const from = Math.max(station, span.start),
          to = Math.min(station + SEGMENT_LENGTH, span.end);
        if (to > from) {
          ribbon(
            surfaces.lining,
            from,
            to,
            liningProfile,
            (s, i) => {
              const lamp = Math.round(s / 24) * 24;
              const glow = tunnelLampLit(lamp, mode)
                ? Math.exp(-((s - lamp) ** 2) / 35)
                : 0;
              const ambient = tunnelSection(s, mode)?.dark ? 0.32 : 1;
              const side = Math.abs(liningProfile[i].x / WIDTH);
              return wallColor.setRGB(
                0.012 * ambient + glow * side * 0.085,
                0.018 * ambient + glow * side * 0.045,
                0.026 * ambient + glow * side * 0.017,
              );
            },
            (s, i) => {
              const side =
                i === 1 ? 1 : i === liningProfile.length - 3 ? -1 : 0;
              return DINOSAUR_SITES.some(
                (site) =>
                  site.side === side &&
                  Math.abs(s - (span.start + site.offset)) < 0.75,
              );
            },
          );
          for (let s = Math.ceil(from / 12) * 12; s < to; s += 12) {
            ribbon(
              surfaces.lining,
              s,
              Math.min(s + 0.24, to),
              angles.map((a) => profile(a, WIDTH - 0.12, 5.38)),
              () =>
                wallColor
                  .setRGB(0.04, 0.047, 0.051)
                  .multiplyScalar(tunnelSection(s, mode)?.dark ? 0.4 : 1),
            );
            if (s % 24 === 0 && tunnelLampLit(s, mode))
              for (const side of [-1, 1]) {
                box(surfaces.iron, s, side * 7.5, 3.5, 0.3, 1.25, 0.65);
                box(surfaces.lamps, s, side * 7.31, 3.5, 0.13, 0.75, 0.38);
                box(surfaces.lamps, s, side * 6.3, 0.38, 0.08, 0.07, 1.3);
              }
          }
          // Subtle stone relief and old refuge alcoves give the unlit galleries depth.
          for (let s = Math.ceil(from / 24) * 24; s < to; s += 24) {
            if (tunnelSection(s, mode)?.position !== 192) continue;
            const gallery = Math.floor((s - span.start) / 384);
            // Broad, irregular facets sit just proud of the wall, fading into its edges.
            // Their muted stone colours stay quiet in the lamp-free stretches.
            for (const side of [-1, 1]) {
              const point = (column: number, row: number) => {
                const edge =
                  column === 0 || column === 8 || row === 0 || row === 4;
                const variation = Math.sin(
                  column * 7.13 + row * 3.71 + gallery * 1.9 + side,
                );
                return at(
                  s - 12 + column * 3 + (edge ? 0 : variation * 0.65),
                  side * (edge ? 7.79 : 7.45 + variation * 0.22),
                  0.45 + row * 0.7 + (edge ? 0 : variation * 0.18),
                );
              };
              for (let column = 0; column < 8; column++)
                for (let row = 0; row < 4; row++) {
                  const shade =
                    0.65 +
                    (1 + Math.sin(column * 4.7 + row * 2.3 + gallery)) * 0.22;
                  surfaces.lining.quad(
                    point(column, row),
                    point(column + 1, row),
                    point(column, row + 1),
                    point(column + 1, row + 1),
                    wallColor.setRGB(0.009, 0.012, 0.014).multiplyScalar(shade),
                  );
                }
            }
            const side = gallery % 2 ? -1 : 1;
            const alcove = s + 34;
            box(
              surfaces.lining,
              alcove,
              side * 7.62,
              1.6,
              0.12,
              2.8,
              3.4,
              wallColor.setRGB(0.002, 0.004, 0.006),
            );
            for (const offset of [-1.8, 1.8])
              box(
                surfaces.lining,
                alcove + offset,
                side * 7.4,
                1.6,
                0.55,
                3.1,
                0.22,
                wallColor.setRGB(0.024, 0.032, 0.035),
              );
            box(
              surfaces.lining,
              alcove,
              side * 7.4,
              3.05,
              0.55,
              0.25,
              3.8,
              wallColor.setRGB(0.024, 0.032, 0.035),
            );
            box(
              surfaces.lining,
              alcove,
              side * 7.1,
              0.5,
              0.8,
              0.3,
              2.5,
              wallColor.setRGB(0.018, 0.026, 0.028),
            );
          }
          // Low service ledges and a quiet cable line along both walls.
          for (const side of [-1, 1]) {
            ribbon(surfaces.iron, from, to, [
              { x: side * 6.3, y: 0.15 },
              { x: side * 7.8, y: 0.15 },
            ]);
            ribbon(
              surfaces.lining,
              from,
              to,
              [
                { x: side * 7.65, y: 1.1 },
                { x: side * 7.65, y: 1.18 },
              ],
              (s) =>
                wallColor
                  .setRGB(0.1, 0.09, 0.075)
                  .multiplyScalar(tunnelSection(s, mode)?.dark ? 0.15 : 1),
            );
          }
        }
        for (const [portal, direction] of [
          [span.start, 1],
          [span.end, -1],
        ]) {
          if (portal < station || portal >= station + SEGMENT_LENGTH) continue;
          // A mountain face with a real open arch, backed by a rocky mound.
          for (let i = 0; i < angles.length - 1; i++) {
            const a = profile(angles[i]),
              b = profile(angles[i + 1]);
            const outerA = profile(angles[i], 76, 56 + Math.sin(i * 1.7) * 5);
            const outerB = profile(
              angles[i + 1],
              76,
              56 + Math.sin((i + 1) * 1.7) * 5,
            );
            surfaces.stone.quad(
              at(portal, a.x, a.y),
              at(portal, outerA.x, outerA.y),
              at(portal, b.x, b.y),
              at(portal, outerB.x, outerB.y),
            );
            const rimA = profile(angles[i], WIDTH + 0.75, 6.25),
              rimB = profile(angles[i + 1], WIDTH + 0.75, 6.25);
            surfaces.lining.quad(
              at(portal - direction * 0.12, a.x, a.y),
              at(portal - direction * 0.12, rimA.x, rimA.y),
              at(portal - direction * 0.12, b.x, b.y),
              at(portal - direction * 0.12, rimB.x, rimB.y),
              wallColor.setRGB(0.24, 0.25, 0.25),
            );
            const backA = profile(angles[i], 35, 23),
              backB = profile(angles[i + 1], 35, 23);
            surfaces.stone.quad(
              at(portal, outerA.x, outerA.y),
              at(portal, outerB.x, outerB.y),
              at(portal + direction * 160, backA.x, backA.y),
              at(portal + direction * 160, backB.x, backB.y),
            );
          }
        }
      }
      // Deck follows the same three-metre samples as the terrain and railway.
      for (let s = station; s < station + SEGMENT_LENGTH; s += 3) {
        if (!bridgeDeckAt(s, mode)) continue;
        ribbon(surfaces.stone, s, s + 3, [
          { x: -6.15, y: 0.02 }, { x: -6.15, y: -0.9 },
          { x: 6.15, y: -0.9 }, { x: 6.15, y: 0.02 },
        ], () => bridgeColors.stone);
        for (const side of [-1, 1]) {
          // Check neighboring route samples, not the recycled mesh window:
          // terminal posts only appear where the actual bridge begins or ends.
          for (const end of [
            ...(!bridgeDeckAt(s - 3, mode) ? [s] : []),
            ...(!bridgeDeckAt(s + 3, mode) ? [s + 3] : []),
          ]) {
            box(surfaces.stone, end, side * 5.9, 0.06, 0.86, 0.5, 0.86, bridgeColors.stone);
            box(surfaces.stone, end, side * 5.9, 0.95, 0.54, 1.6, 0.54, bridgeColors.coping);
            box(surfaces.iron, end, side * 5.9, 1.79, 0.74, 0.14, 0.74, bridgeColors.bronze);
            box(surfaces.iron, end, side * 5.9, 1.92, 0.38, 0.14, 0.38, bridgeColors.darkSteel);
          }
          // Pale coping separates the warm masonry from the painted ironwork.
          ribbon(surfaces.stone, s, s + 3, [
            { x: side * 5.55, y: 0.08 }, { x: side * 6.24, y: 0.08 },
            { x: side * 6.24, y: -0.16 }, { x: side * 6.15, y: -0.22 },
          ], () => bridgeColors.coping);
          for (const y of [0.38, 1.35]) {
            ribbon(surfaces.iron, s, s + 3, [
              { x: side * 5.83, y: y - 0.055 }, { x: side * 5.83, y: y + 0.055 },
              { x: side * 5.97, y: y + 0.055 }, { x: side * 5.97, y: y - 0.055 },
              { x: side * 5.83, y: y - 0.055 },
            ], () => y > 1 ? bridgeColors.bronze : bridgeColors.steel);
          }
          if (s % 6 === 0) {
            box(surfaces.iron, s, side * 5.9, 0.72, 0.14, 1.44, 0.14, bridgeColors.steel);
            box(surfaces.iron, s, side * 5.9, 0.16, 0.27, 0.24, 0.27, bridgeColors.darkSteel);
            box(surfaces.iron, s, side * 5.9, 1.45, 0.23, 0.09, 0.23, bridgeColors.bronze);
          }
          // Alternating diagonal balusters keep the view into the valley open.
          const even = Math.abs(s / 3) % 2 === 0;
          brace(surfaces.iron, at(s, side * 5.9, even ? 0.42 : 1.29),
            at(s + 3, side * 5.9, even ? 1.29 : 0.42), 0.055, bridgeColors.steel);
          if (s % 24 === 0) {
            box(surfaces.iron, s, side * 5.9, 1.85, 0.16, 0.8, 0.16, bridgeColors.darkSteel);
            box(surfaces.iron, s, side * 5.9, 2.21, 0.46, 0.08, 0.46, bridgeColors.bronze);
            box(surfaces.lamps, s, side * 5.9, 2.46, 0.29, 0.43, 0.29);
            for (const x of [-0.19, 0.19]) for (const z of [-0.19, 0.19])
              box(surfaces.iron, s + z, side * 5.9 + x, 2.46, 0.045, 0.48, 0.045, bridgeColors.darkSteel);
            box(surfaces.iron, s, side * 5.9, 2.73, 0.5, 0.12, 0.5, bridgeColors.darkSteel);
            box(surfaces.iron, s, side * 5.9, 2.84, 0.22, 0.12, 0.22, bridgeColors.bronze);
          }
          if (s % 48 === 0) {
            box(surfaces.stone, s, side * 4.8, -18, 2.1, 35, 3.1, bridgeColors.stone);
            box(surfaces.stone, s, side * 4.8, -3.5, 3, 0.65, 4, bridgeColors.coping);
            box(surfaces.stone, s, side * 4.8, -4.2, 2.55, 0.75, 3.6, bridgeColors.stone);
            for (let y = -7; y > -33; y -= 4)
              box(surfaces.stone, s, side * 4.8, y, 2.16, 0.12, 3.16, bridgeColors.course);
          }
          // Deep flanged girders and diagonal web members, visible below the deck.
          for (const y of [-1.05, -3.25])
            ribbon(surfaces.iron, s, s + 3, [
              { x: side * 4.85, y: y - 0.1 }, { x: side * 4.85, y: y + 0.1 },
              { x: side * 5.25, y: y + 0.1 }, { x: side * 5.25, y: y - 0.1 },
              { x: side * 4.85, y: y - 0.1 },
            ], () => bridgeColors.steel);
          brace(surfaces.iron, at(s, side * 5.05, even ? -1.15 : -3.15),
            at(s + 3, side * 5.05, even ? -3.15 : -1.15), 0.18, bridgeColors.steel);
          if (s % 12 === 0) {
            box(surfaces.iron, s, side * 5.05, -2.15, 0.24, 2.2, 0.22, bridgeColors.darkSteel);
            for (const y of [-1.3, -2.95])
              box(surfaces.iron, s, side * 5.2, y, 0.08, 0.11, 0.11, bridgeColors.bronze);
          }
        }
        if (s % 12 === 0)
          box(surfaces.iron, s, 0, -1.25, 10.3, 0.38, 0.32, bridgeColors.darkSteel);
        ribbon(surfaces.water, s, s + 3, [
          { x: -34, y: -29 },
          { x: 34, y: -29 },
        ]);
      }
    }
    for (const key of Object.keys(surfaces) as (keyof typeof surfaces)[]) {
      meshes[key].geometry.dispose();
      meshes[key].geometry = surfaces[key].geometry();
      meshes[key].visible = surfaces[key].positions.length > 0;
    }
  }
  return {
    root,
    update(progress: number, mode: SceneryMode) {
      dinosaurs.update(progress, mode);
      graffiti.update(progress, mode);
      const cell = Math.floor(progress / SEGMENT_LENGTH);
      if (cell !== previousCell || mode !== previousMode) {
        rebuild(progress, mode);
        previousCell = cell;
        previousMode = mode;
      }
      lights.forEach((light, index) => {
        const station =
          Math.floor(progress / 24) * 24 + Math.floor(index / 2) * 24;
        const point = roadPoint(station, index % 2 === 0 ? -6.8 : 6.8);
        light.position.set(point.x, 3.5, point.z);
        light.intensity = tunnelLampLit(station, mode) ? 14 : 0;
      });
      return insideTunnel(progress, mode) ? 1 : 0;
    },
  };
}
