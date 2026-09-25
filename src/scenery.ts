import { batchSectionSurfaces } from "./section-surfaces.ts";
import { createInstanceView, createVisibleInstances, type VisibleInstance } from "./visible-instances.ts";
import { SCENERY_DISTANCE, DETAIL_FADE_START, DETAIL_FADE_END } from "./view-distance.ts";
import { environmentFrom } from "./environments.ts";
import type { EnvironmentSource } from "./environments.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { EnvironmentWeights, SceneryMode } from "./environments.ts";
import * as THREE from "./three.ts";
import { roadFrame, roadPoint, SEGMENT_LENGTH } from "./drive.ts";
import {
  ENVIRONMENTS,
  environmentWeights,
  environmentNames,
  dominantEnvironment,
  blendEnvironment,
} from "./environments.ts";
import {
  noise,
  smoothstep,
  terrainHeight,
  terrainPoint,
  terrainSurfaceHeight,
  SEA_LEVEL,
  TERRAIN_OFFSETS,
  TERRAIN_ROW_LENGTH,
} from "./terrain.ts";
import { createWeather } from "./weather.ts";
import { recycleStation } from "./recycle.ts";
import { createLandmarks } from "./landmarks.ts";
import { createRailStructures } from "./rail-structures.ts";
import { createCoast } from "./coast.ts";
import { createStylizedNature } from "./stylized-nature.ts";
import { createSettlements } from "./settlements.ts";
import { createStations } from "./stations.ts";
import { stationClearing } from "./station-route.ts";
import { natureClearing } from "./nature-layout.ts";
import { createFirFairyLights } from "./fir-fairy-lights.ts";
import { createTumbleweeds } from "./tumbleweeds.ts";
import { createTunnelLighting } from "./tunnel-lighting.ts";

interface Decoration {
  object: THREE.Group;
  offset: number;
  lateral: number;
  baseY: number;
  kind: "pine" | "desert" | "rock" | "grass";
}
interface BatchPart {
  object: THREE.Group;
  child: THREE.Mesh;
}
interface Segment {
  group: THREE.Group;
  start: number;
  strips: ReturnType<typeof makeStrip>[];
  terrains: ReturnType<typeof makeTerrain>[];
  sleepers: THREE.InstancedMesh;
  items: Decoration[];
  batches: {
    geometry: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
    kind: Decoration["kind"];
    parts: BatchPart[];
    instances: VisibleInstance[];
  }[];
  pineMaterial: THREE.MeshStandardMaterial;
  rockMaterial: THREE.MeshStandardMaterial;
  grassMaterial: THREE.MeshStandardMaterial;
  fairyLights: THREE.Group;
}

const BEHIND_SEGMENTS = Math.ceil(SCENERY_DISTANCE / SEGMENT_LENGTH) + 1;
const SEGMENTS = BEHIND_SEGMENTS * 2 + 2;
const colorKeys = [
  "ground",
  "pine",
  "rock",
  "sky",
  "horizon",
  "fog",
  "light",
] as const;
const palette = Object.fromEntries(
  Object.entries(ENVIRONMENTS).map(([name, settings]) => [
    name,
    Object.fromEntries(
      colorKeys.map((key) => [key, new THREE.Color(settings[key])]),
    ),
  ]),
);

const atmosphereColor = new THREE.Color();

function blendColor(
  target: THREE.Color,
  weights: EnvironmentWeights,
  key: (typeof colorKeys)[number],
  atmosphere?: EnvironmentSource,
) {
  target.setRGB(0, 0, 0);
  for (const name of environmentNames) {
    const color = atmosphere ? atmosphereColor.setHex(environmentFrom(name, atmosphere)[key]) : palette[name][key];
    target.r += color.r * weights[name];
    target.g += color.g * weights[name];
    target.b += color.b * weights[name];
  }
  return target;
}

function makeStrip(
  left: number,
  right: number,
  height: number,
  material: THREE.Material,
  from = 0,
  to = SEGMENT_LENGTH,
  colored = false,
) {
  const rows = Math.ceil((to - from) / 2) + 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(rows * 6), 3),
  );
  const normals = new Float32Array(rows * 6);
  for (let i = 0; i < rows * 2; i++) normals[i * 3 + 1] = 1;
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  if (colored)
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(rows * 6), 3),
    );
  const indices = [];
  for (let i = 0; i < rows - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  return { mesh, left, right, height, from, to, rows };
}

function updateStrip(
  { mesh, left, right, height, from, to, rows }: ReturnType<typeof makeStrip>,
  start: number,
  mode: SceneryMode,
) {
  const origin = roadFrame(start);
  const positions = mesh.geometry.attributes.position;
  const colors = mesh.geometry.attributes.color;
  const color = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    const station = start + from + ((to - from) * row) / (rows - 1);
    if (colors) blendColor(color, environmentWeights(station, mode), "ground");
    for (let side = 0; side < 2; side++) {
      const point = roadPoint(station, side ? right : left);
      positions.setXYZ(
        row * 2 + side,
        point.x - origin.x,
        height,
        point.z + start,
      );
      if (colors) colors.setXYZ(row * 2 + side, color.r, color.g, color.b);
    }
  }
  positions.needsUpdate = true;
  if (colors) colors.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

const TERRAIN_ROWS = SEGMENT_LENGTH / TERRAIN_ROW_LENGTH + 1;
function makeTerrain(side: number, material: THREE.Material) {
  const geometry = new THREE.BufferGeometry();
  const count = TERRAIN_ROWS * TERRAIN_OFFSETS.length;
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    "color",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(count * 3), 3),
  );
  const indices = [];
  const width = TERRAIN_OFFSETS.length;
  for (let row = 0; row < TERRAIN_ROWS - 1; row++)
    for (let column = 0; column < width - 1; column++) {
      const a = row * width + column,
        b = a + 1,
        c = a + width,
        d = c + 1;
      if (side > 0) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  return { mesh, side };
}

function updateTerrain(
  { mesh, side }: ReturnType<typeof makeTerrain>,
  start: number,
  mode: SceneryMode,
) {
  const origin = roadFrame(start);
  const positions = mesh.geometry.attributes.position;
  const colors = mesh.geometry.attributes.color;
  const normals = mesh.geometry.attributes.normal;
  const ground = new THREE.Color(),
    rock = new THREE.Color(),
    snow = new THREE.Color(0xe0e7e9),
    sand = new THREE.Color(0xc5b799);
  for (let row = 0; row < TERRAIN_ROWS; row++)
    for (let column = 0; column < TERRAIN_OFFSETS.length; column++) {
      const station = start + (row * SEGMENT_LENGTH) / (TERRAIN_ROWS - 1);
      const point = terrainPoint(station, TERRAIN_OFFSETS[column] * side, mode);
      const index = row * TERRAIN_OFFSETS.length + column;
      positions.setXYZ(index, point.x - origin.x, point.y, point.z + start);
      const weights = environmentWeights(-point.z, mode);
      const dx =
        (terrainHeight(point.x + 1, point.z, mode) -
          terrainHeight(point.x - 1, point.z, mode)) /
        2;
      const dz =
        (terrainHeight(point.x, point.z + 1, mode) -
          terrainHeight(point.x, point.z - 1, mode)) /
        2;
      const slope = Math.hypot(dx, dz);
      const length = Math.hypot(dx, 1, dz);
      // Sample the same landform on both sides of a recycled section's edge,
      // keeping hillside lighting continuous across road sections.
      normals.setXYZ(index, -dx / length, 1 / length, -dz / length);
      blendColor(ground, weights, "ground");
      blendColor(rock, weights, "rock");
      ground.lerp(
        rock,
        smoothstep(0.25, 0.9, slope) * (1 - weights.desert * 0.55),
      );
      ground.lerp(
        snow,
        weights.alpine *
          smoothstep(18, 48, point.y) *
          (1 - smoothstep(0.65, 1.4, slope)),
      );
      if (side < 0)
        ground.lerp(
          sand,
          weights.coast *
            (1 - smoothstep(0.5, 3.5, Math.abs(point.y - SEA_LEVEL))),
        );
      const strata =
        0.92 +
        noise(point.x * 0.16, point.z * 0.16) * 0.12 +
        Math.sin(point.y * 0.75 + noise(point.x * 0.02, point.z * 0.02) * 3) *
          0.035;
      ground.multiplyScalar(strata);
      colors.setXYZ(index, ground.r, ground.g, ground.b);
    }
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  normals.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
}

function makeFirGeometry(seed: number) {
  const positions = [],
    indices = [];
  const spokes = 16,
    rings = 4;
  for (let tier = 0; tier < 7; tier++) {
    const bottom = 0.9 + tier * 0.87,
      radius = 2.0 * (1 - tier / 8) ** 0.8;
    const start = positions.length / 3;
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      for (let i = 0; i <= spokes; i++) {
        const angle = (i / spokes) * Math.PI * 2;
        const irregular =
          0.92 +
          Math.sin(angle * 5 + tier + seed) * 0.045 +
          Math.cos(angle * 3 + seed) * 0.035;
        const reach = radius * Math.pow(t, 0.78) * irregular;
        positions.push(
          Math.cos(angle) * reach,
          bottom + (1 - t) * 2.45 + Math.sin(angle * 5 + tier) * t * 0.06,
          Math.sin(angle) * reach,
        );
      }
    }
    for (let ring = 0; ring < rings; ring++)
      for (let i = 0; i < spokes; i++) {
        const a = start + ring * (spokes + 1) + i,
          b = a + spokes + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function makeRockGeometry(seed: number) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const distortion = 0.8 + noise(x * 3 + y + seed * 4, z * 3 + y * 2) * 0.4;
    positions.setXYZ(
      i,
      x * distortion + y * 0.12,
      Math.min(0.72, y * distortion),
      z * distortion,
    );
  }
  geometry.computeVertexNormals();
  return geometry;
}

function makeGrassGeometry() {
  const positions = [];
  for (let blade = 0; blade < 9; blade++) {
    const angle = blade * 2.4,
      x = Math.cos(angle) * 0.4,
      z = Math.sin(angle) * 0.4;
    const height = 0.25 + noise(blade, 7) * 0.65;
    positions.push(
      x - 0.055,
      0,
      z,
      x + 0.055,
      0,
      z,
      x + Math.cos(angle) * 0.22,
      height,
      z + Math.sin(angle) * 0.22,
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

export function createScenery(scene: THREE.Scene, scope: Lifecycle) {
  const world = new THREE.Group();
  world.name = "landscape";
  scene.add(world);
  const nature = createStylizedNature(world, scope);
  const tumbleweeds = createTumbleweeds(world, scope);
  const settlements = createSettlements(world);
  const stations = createStations(world, scope);
  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0x77796c,
    roughness: 1,
  });
  const groundMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  const shoulderMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
  });
  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xb6b7a4,
    metalness: 0.7,
    roughness: 0.4,
  });
  const sleeperMaterial = new THREE.MeshStandardMaterial({
    color: 0x655a4a,
    roughness: 1,
  });
  const sleeperGeometry = new THREE.BoxGeometry(2.4, 0.12, 0.24);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: 0x26302b,
    roughness: 1,
  });
  const cactusMaterial = new THREE.MeshStandardMaterial({
    color: 0x496252,
    flatShading: true,
    roughness: 1,
  });
  const trunkGeometry = new THREE.CylinderGeometry(0.06, 0.2, 7.8, 6);
  const firGeometries = [1, 2, 3].map(makeFirGeometry);
  const rockGeometries = [1, 2, 3].map(makeRockGeometry);
  const grassGeometry = makeGrassGeometry();
  const cactusGeometry = new THREE.CylinderGeometry(0.2, 0.24, 1, 6);
  const segments: Segment[] = [];
  const fairyLights = new THREE.Group();
  fairyLights.name = "fir-fairy-lights";
  fairyLights.add(...firGeometries.map(createFirFairyLights));

  function makePine(material: THREE.Material, scale: number) {
    const pine = new THREE.Group();
    const firVariant = Math.floor(Math.random() * firGeometries.length);
    pine.userData.firVariant = firVariant;
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = 3.9;
    pine.add(trunk);
    pine.add(
      new THREE.Mesh(
        firGeometries[firVariant],
        material,
      ),
    );
    pine.scale.set(scale, scale * (0.9 + Math.random() * 0.3), scale);
    pine.userData.yaw = Math.random() * Math.PI * 2;
    pine.position.y = -0.25;
    return pine;
  }

  function makeCactus(scale: number) {
    const cactus = new THREE.Group();
    const trunk = new THREE.Mesh(cactusGeometry, cactusMaterial);
    trunk.scale.y = 3;
    trunk.position.y = 1.5;
    cactus.add(trunk);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(cactusGeometry, cactusMaterial);
      arm.rotation.z = Math.PI / 2;
      arm.scale.set(0.7, 0.75, 0.7);
      arm.position.set(side * 0.4, 1.4 + side * 0.3, 0);
      const tip = new THREE.Mesh(cactusGeometry, cactusMaterial);
      tip.scale.set(0.7, 1.1, 0.7);
      tip.position.set(side * 0.75, 1.9 + side * 0.3, 0);
      cactus.add(arm, tip);
    }
    cactus.scale.setScalar(scale);
    return cactus;
  }

  function place(
    object: THREE.Group,
    start: number,
    offset: number,
    lateral: number,
    baseY: number,
    mode: SceneryMode,
  ) {
    const station = start + offset;
    const point = roadPoint(station, lateral);
    object.position.x = point.x - roadFrame(start).x;
    object.position.y = terrainSurfaceHeight(point.x, point.z, mode) + baseY;
    object.position.z = point.z + start;
    object.rotation.y = roadFrame(station).heading + (object.userData.yaw || 0);
  }

  function rebuild(segment: Segment, start: number, mode: SceneryMode) {
    segment.start = start;
    segment.group.position.set(roadFrame(start).x, 0, -start);
    segment.group.updateMatrix();
    const weights = environmentWeights(start + SEGMENT_LENGTH / 2, mode);
    blendColor(segment.pineMaterial.color, weights, "pine");
    blendColor(segment.rockMaterial.color, weights, "rock");
    blendColor(segment.grassMaterial.color, weights, "ground").multiplyScalar(
      1.3,
    );
    for (const strip of segment.strips) updateStrip(strip, start, mode);
    for (const terrain of segment.terrains) updateTerrain(terrain, start, mode);
    const sleeper = new THREE.Object3D();
    const sectionOrigin = roadFrame(start);
    for (let i = 0; i < segment.sleepers.count; i++) {
      const at = roadFrame(start + i * 0.8);
      sleeper.position.set(at.x - sectionOrigin.x, 0.115, at.z + start);
      sleeper.rotation.y = at.heading;
      sleeper.updateMatrix();
      segment.sleepers.setMatrixAt(i, sleeper.matrix);
    }
    segment.sleepers.instanceMatrix.needsUpdate = true;
    segment.sleepers.computeBoundingSphere();
    for (const item of segment.items) {
      place(item.object, start, item.offset, item.lateral, item.baseY, mode);
      const rules =
        ENVIRONMENTS[
          dominantEnvironment(environmentWeights(start + item.offset, mode))
        ].vegetation;
      item.object.visible =
        item.kind === "pine"
          ? rules.pine
          : item.kind === "desert"
            ? rules.cactus
            : true;
      if (item.kind === "pine" && rules.pineSide !== undefined)
        item.object.visible &&=
          Math.sign(item.lateral) === rules.pineSide &&
          noise(item.offset, item.lateral) > (rules.pineThreshold ?? 0);
      if (
        item.kind === "grass" &&
        rules.grassEdge !== undefined &&
        item.lateral < rules.grassEdge
      )
        item.object.visible = false;
      if (
        rules.minHeight !== undefined &&
        item.object.position.y < rules.minHeight
      )
        item.object.visible = false;
      const localWeights = environmentWeights(start + item.offset, mode);
      if (localWeights.tunnel > 0.15 || localWeights.bridge > 0.15)
        item.object.visible = false;
      const localForest = localWeights.forest;
      if (stationClearing(start + item.offset, item.lateral, mode)) item.object.visible = false;
      const worldPoint = roadPoint(start + item.offset, item.lateral);
      if (
        natureClearing(
          worldPoint.x,
          worldPoint.z,
          start + item.offset,
          item.kind === "pine",
          mode,
        )
      )
        item.object.visible = false;
      if (
        localForest > 0.65 &&
        ((item.kind === "pine" && Math.abs(item.lateral) < 46) ||
          (item.kind === "grass" && Math.abs(item.lateral) < 24))
      )
        item.object.visible = false;
    }
    // Pick a nearby surviving fir after clearing checks. Reapply its complete
    // transform whenever a section is recycled or the scenery mode changes.
    const festiveTree = Math.round(start / SEGMENT_LENGTH) % 3 === 0 && weights.alpine > 0.9
      ? segment.items.filter((item) => item.kind === "pine" && item.object.visible &&
          environmentWeights(start + item.offset, mode).alpine > 0.9)
        .sort((a, b) => Math.abs(a.lateral) - Math.abs(b.lateral))[0]
      : undefined;
    segment.fairyLights.visible = !!festiveTree;
    if (festiveTree) {
      segment.fairyLights.children.forEach((strand, index) => {
        strand.visible = index === festiveTree.object.userData.firVariant;
      });
      segment.fairyLights.position.copy(festiveTree.object.position);
      segment.fairyLights.quaternion.copy(festiveTree.object.quaternion);
      segment.fairyLights.scale.copy(festiveTree.object.scale);
    }
    const matrix = new THREE.Matrix4();
    for (const batch of segment.batches) {
      batch.instances = [];
      batch.geometry.computeBoundingSphere();
      for (const { object, child } of batch.parts) {
        if (!object.visible) continue;
        object.updateMatrix();
        child.updateMatrix();
        matrix.multiplyMatrices(object.matrix, child.matrix).premultiply(segment.group.matrix);
        batch.instances.push({
          matrix: matrix.clone(), color: batch.material.color.clone(),
          bounds: batch.geometry.boundingSphere!.clone().applyMatrix4(matrix),
          maxDistance: batch.kind === "grass" ? DETAIL_FADE_END : undefined,
        });
      }
    }
  }

  // Keep section-local placement data, but share GPU batches across the route.
  // Instance colors preserve each section's environment palette.
  function batchDecorations(segment: THREE.Group, items: Decoration[]) {
    const batches = new Map<number, Segment["batches"][number]>();
    for (const { object, kind } of items) {
      for (const child of object.children) {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) continue;
        const key = child.geometry.id;
        if (!batches.has(key)) batches.set(key, {
          geometry: child.geometry, material: child.material, kind, parts: [], instances: [],
        });
        batches.get(key)!.parts.push({ object, child });
      }
      segment.remove(object);
    }
    return [...batches.values()];
  }

  for (let index = 0; index < SEGMENTS; index++) {
    const group = new THREE.Group();
    group.name = "railway-section";
    const pineMaterial = new THREE.MeshStandardMaterial({
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const rockMaterial = new THREE.MeshStandardMaterial({ roughness: 1 });
    const grassMaterial = new THREE.MeshStandardMaterial({
      roughness: 1,
      side: THREE.DoubleSide,
    });
    const terrains = [-1, 1].map((side) => makeTerrain(side, groundMaterial));
    group.add(...terrains.map((terrain) => terrain.mesh));
    const strips = [
      makeStrip(-6, 6, 0.025, shoulderMaterial, 0, SEGMENT_LENGTH, true),
      makeStrip(-2.0, 2.0, 0.055, roadMaterial),
      makeStrip(-0.82, -0.71, 0.205, railMaterial),
      makeStrip(0.71, 0.82, 0.205, railMaterial),
    ];
    group.add(...strips.map((strip) => strip.mesh));
    const sleepers = new THREE.InstancedMesh(
      sleeperGeometry,
      sleeperMaterial,
      SEGMENT_LENGTH / 0.8,
    );
    group.add(sleepers);
    const items: Decoration[] = [];
    function addItem(
      object: THREE.Group,
      offset: number,
      lateral: number,
      kind: Decoration["kind"],
    ) {
      items.push({ object, offset, lateral, kind, baseY: object.position.y });
      group.add(object);
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const offset = Math.random() * SEGMENT_LENGTH;
        const lateral =
          side * (i < 2 ? 24 + Math.random() * 20 : 48 + Math.random() * 88);
        const scale = 0.55 + Math.random() * 0.8;
        addItem(makePine(pineMaterial, scale), offset, lateral, "pine");
        if (i < 3) addItem(makeCactus(scale), offset, lateral, "desert");
      }
      for (let i = 0; i < 4; i++) {
        const rock = new THREE.Group();
        rock.add(
          new THREE.Mesh(
            rockGeometries[i % rockGeometries.length],
            rockMaterial,
          ),
        );
        const scale = i < 3 ? 0.5 + Math.random() * 1.1 : 2 + Math.random() * 2;
        rock.scale.set(scale * 1.3, scale * 0.8, scale);
        rock.position.y = scale * 0.3;
        rock.userData.yaw = Math.random() * Math.PI * 2;
        addItem(
          rock,
          Math.random() * SEGMENT_LENGTH,
          side * (i < 3 ? 22 + Math.random() * 18 : 48 + Math.random() * 42),
          "rock",
        );
      }
      for (let i = 0; i < 16; i++) {
        const grass = new THREE.Group();
        grass.add(new THREE.Mesh(grassGeometry, grassMaterial));
        grass.scale.setScalar(0.7 + Math.random() * 1.1);
        grass.userData.yaw = Math.random() * Math.PI * 2;
        grass.position.y = -0.1;
        addItem(
          grass,
          Math.random() * SEGMENT_LENGTH,
          side * (6.8 + Math.random() ** 2 * 28),
          "grass",
        );
      }
    }
    const batches = batchDecorations(group, items);
    const segmentLights = fairyLights.clone();
    group.add(segmentLights);
    const segment: Segment = {
      group,
      start: 0,
      strips,
      terrains,
      sleepers,
      items,
      batches,
      pineMaterial,
      rockMaterial,
      grassMaterial,
      fairyLights: segmentLights,
    };
    rebuild(segment, (index - BEHIND_SEGMENTS) * SEGMENT_LENGTH, "auto");
    world.add(group);
    segments.push(segment);
  }

  const surfaces = batchSectionSurfaces(world, segments.flatMap(segment =>
    [...segment.terrains, ...segment.strips].map(({ mesh }) => ({ mesh, origin: segment.group }))), scope);
  const instanceView = createInstanceView();
  const decorations = new Map<number, ReturnType<typeof createVisibleInstances>>();
  const sectionBatches = segments.flatMap(segment => segment.batches);
  for (const batch of sectionBatches) {
    if (decorations.has(batch.geometry.id)) continue;
    const capacity = sectionBatches.filter(part => part.geometry === batch.geometry)
      .reduce((total, part) => total + part.parts.length, 0);
    const material = batch.material.clone();
    material.color.set(0xffffff);
    if (batch.kind === "grass") {
      material.onBeforeCompile = shader => {
        shader.vertexShader = "varying float detailVisibility;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
          #include <project_vertex>
          vec4 detailOrigin = vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            detailOrigin = instanceMatrix * detailOrigin;
          #endif
          detailVisibility = 1.0 - smoothstep(${DETAIL_FADE_START.toFixed(1)}, ${DETAIL_FADE_END.toFixed(1)},
            length((modelViewMatrix * detailOrigin).xyz));
        `);
        shader.fragmentShader = "varying float detailVisibility;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `
          #include <clipping_planes_fragment>
          if (detailVisibility <= fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))))) discard;
        `);
      };
      material.customProgramCacheKey = () => "night-line-grass-distance-v1";
    }
    const mesh = new THREE.InstancedMesh(batch.geometry, material, capacity);
    mesh.name = `route-${batch.kind}`;
    world.add(mesh);
    scope.defer(() => mesh.dispose());
    decorations.set(batch.geometry.id, createVisibleInstances(mesh));
  }
  function refreshDecorations() {
    for (const [geometry, batch] of decorations)
      batch.setInstances(sectionBatches.filter(part => part.geometry.id === geometry).flatMap(part => part.instances));
  }
  refreshDecorations();
  const decorationMaterials = new Set(sectionBatches.map(batch => batch.material));
  scope.defer(() => decorationMaterials.forEach(material => material.dispose()));
  function updateVisibility(camera: THREE.Camera) {
    instanceView.update(camera, world);
    for (const batch of decorations.values()) batch.update(instanceView);
    nature.updateVisibility(camera);
  }

  const horizonMaterial = new THREE.MeshStandardMaterial({ roughness: 1 });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1800, 1800),
    horizonMaterial,
  );
  ground.rotation.x = -Math.PI / 2;
  // Keep the distant fill below both the coastal sea and the bridge river,
  // including upcoming regions during an automatic journey.
  ground.position.y = -42;
  scene.add(ground);
  const hemisphere = new THREE.HemisphereLight(0xa2b5c7, 0x26342f, 1.6);
  const moonlight = new THREE.DirectionalLight(0xb6cfde, 1.8);
  moonlight.position.set(-30, 50, -40);
  scene.add(hemisphere, moonlight);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
    },
    vertexShader:
      "varying vec3 direction; void main() { direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 horizon;
      varying vec3 direction;
      void main() {
        float height = normalize(direction).y;
        gl_FragColor = vec4(mix(horizon, top, smoothstep(-0.04, 0.65, height)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(450, 24, 16),
    skyMaterial,
  );
  sky.renderOrder = -2;
  scene.add(sky);
  const moonMaterial = new THREE.MeshBasicMaterial({
    color: 0xf2dfc5,
    fog: false,
  });
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(4.5, 24, 16),
    moonMaterial,
  );
  moon.position.set(50, 42, -160);
  scene.add(moon);
  const moonPosition = moon.position.clone(),
    coastSunPosition = new THREE.Vector3(-110, 22, -220);
  const nightMoonColor = moonMaterial.color.clone(),
    coastSunColor = new THREE.Color(0xffd5a1);
  const nightLightPosition = moonlight.position.clone();
  const stars = new Float32Array(1600 * 3);
  for (let i = 0; i < stars.length; i += 3) {
    const angle = Math.random() * Math.PI * 2;
    const height = Math.random() * 0.85 + 0.12;
    const radius = Math.sqrt(1 - height * height) * 380;
    stars.set(
      [Math.cos(angle) * radius, height * 380, Math.sin(angle) * radius],
      i,
    );
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(stars, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xd5dfeb,
    size: 0.7,
    transparent: true,
    opacity: 0.6,
    fog: false,
    depthWrite: false,
  });
  const starColors = new Float32Array(stars.length);
  for(let i=0;i<starColors.length;i+=3) {
    const brightness=.45+Math.random()*.55;
    starColors.set([brightness,brightness*(.9+Math.random()*.1),brightness],i);
  }
  starGeometry.setAttribute("color",new THREE.BufferAttribute(starColors,3));
  starMaterial.vertexColors=true;
  const starField=new THREE.Points(starGeometry,starMaterial);starField.name="night-sky-stars";scene.add(starField);

  const weather = createWeather(scene);
  const landmarks = createLandmarks(world, scope);
  const coast = createCoast(world, scope);
  const structures = createRailStructures(world);
  const lighting = createTunnelLighting();
  let previousMode: SceneryMode | undefined;
  const weights = environmentWeights(0);
  const targetColor = new THREE.Color();
  function update(
    progress: number,
    movement: number,
    dt: number,
    mode: SceneryMode,
    cityTimezone?: string,
  ) {
    const frame = roadFrame(progress);
    world.position.set(-frame.x, 0, progress);
    const modeChanged = mode !== previousMode;
    structures.update(progress, mode);
    nature.update(progress, dt, mode);
    tumbleweeds.update(progress, dt, mode);
    settlements.update(progress, mode, modeChanged, dt);
    stations.update(progress, mode, cityTimezone);
    landmarks.update(progress, dt, mode, modeChanged);
    let decorationsChanged = false;
    for (const segment of segments) {
      const start = recycleStation(
        segment.start,
        progress - (BEHIND_SEGMENTS + 1) * SEGMENT_LENGTH,
        SEGMENTS * SEGMENT_LENGTH,
      );
      if (start !== segment.start || modeChanged) {
        rebuild(segment, start, mode);
        for (const { mesh } of [...segment.terrains, ...segment.strips]) surfaces.update(mesh);
        decorationsChanged = true;
      }
    }
    if (decorationsChanged) refreshDecorations();
    previousMode = mode;
    const target = environmentWeights(progress, mode);
    const ease = 1 - Math.exp(-dt * 1.5);
    for (const name of environmentNames)
      weights[name] += (target[name] - weights[name]) * ease;
    coast.update(progress, dt, mode, weights, modeChanged);
    blendColor(horizonMaterial.color, weights, "ground");
    return weights;
  }

  function updateLighting(
    progress: number,
    eye: THREE.Vector3,
    dt: number,
    mode: SceneryMode,
    forest: EnvironmentSource = ENVIRONMENTS.forest,
  ) {
    const { weights, enclosure } = lighting.update(progress, eye.x, eye.z, dt, mode);
    blendColor(skyMaterial.uniforms.top.value, weights, "sky", forest);
    blendColor(skyMaterial.uniforms.horizon.value, weights, "horizon", forest);
    blendColor(scene.fog!.color, weights, "fog", forest).lerp(
      palette.tunnel.fog,
      enclosure,
    );
    (scene.background as THREE.Color).copy(scene.fog!.color);
    blendColor(moonlight.color, weights, "light", forest);
    hemisphere.color.copy(blendColor(targetColor, weights, "light", forest));
    (scene.fog as THREE.FogExp2).density = blendEnvironment(
      weights,
      (environment) => environment.fogDensity,
      forest,
    );
    (scene.fog as THREE.FogExp2).density +=
      (ENVIRONMENTS.tunnel.fogDensity - (scene.fog as THREE.FogExp2).density) *
      enclosure;
    starMaterial.opacity = blendEnvironment(
      weights,
      (environment) => environment.starOpacity,
      forest,
    );
    const daylight = blendEnvironment(weights, environment => environment.daylight ?? 0, forest);
    const cloudCover = blendEnvironment(weights, environment => environment.cloudCover ?? 0, forest);
    const citySynced = "forest" in forest;
    const sunBlend = citySynced ? daylight : weights.coast;
    hemisphere.intensity = (1.6 + daylight * .6) * (1 - enclosure * 0.84);
    moonlight.intensity = (1.8 + daylight * 1.2) * (1 - cloudCover * .65) * (1 - enclosure);
    moon.visible = enclosure < 0.05 && cloudCover < .7;
    starMaterial.opacity *= 1 - enclosure;
    moon.position.lerpVectors(moonPosition, coastSunPosition, sunBlend);
    moon.scale.setScalar(1 + sunBlend * 0.45);
    moonMaterial.color.copy(nightMoonColor).lerp(coastSunColor, sunBlend);
    moonlight.position.lerpVectors(
      nightLightPosition,
      coastSunPosition,
      sunBlend,
    );
  }

  return {
    update,
    updateVisibility,
    updateLighting,
    world,
    segments,
    weather,
    landmarks,
    coast,
    nature,
    settlements,
  };
}
