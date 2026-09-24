import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roadFrame, roadPoint } from "./drive.ts";
import { environmentWeights, type SceneryMode } from "./environments.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { noise, terrainSurfaceHeight } from "./terrain.ts";
import { settlementClearing } from "./settlement-layout.ts";
import { stationClearing } from "./station-route.ts";

const SPACING = 48;
const CAPACITY = 24;
const WIND_SPEED = 1.1;

// Open, tangled stems give the ball a dry silhouette without textures or a
// solid core. All stems share one geometry and one instanced draw call.
function tumbleweedGeometry() {
  const stems: THREE.BufferGeometry[] = [];
  for (let stem = 0; stem < 22; stem++) {
    const points: THREE.Vector3[] = [];
    const orientation = new THREE.Euler(stem * 2.4, stem * 1.7, stem * 0.8);
    const radius = 0.65 + noise(stem, 9) * 0.3;
    for (let step = 0; step <= 9; step++) {
      const angle = (step / 9) * Math.PI * 1.75;
      const reach = radius * (0.9 + 0.1 * Math.sin(step * 2 + stem));
      points.push(new THREE.Vector3(
        Math.cos(angle) * reach,
        Math.sin(angle) * reach,
        Math.sin(angle * 3 + stem) * 0.13,
      ).applyEuler(orientation));
    }
    stems.push(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points), 12, 0.018 + noise(stem, 2) * 0.009, 3, false,
    ));
    // Forked tips break up the rounded outline.
    const start = points[6];
    const tip = start.clone().multiplyScalar(1.2);
    tip.y += 0.12;
    stems.push(new THREE.TubeGeometry(
      new THREE.LineCurve3(start, tip), 1, 0.012, 3, false,
    ));
  }
  const geometry = mergeGeometries(stems)!;
  for (const stem of stems) stem.dispose();
  geometry.computeBoundingSphere();
  const bound = geometry.boundingSphere!;
  geometry.translate(-bound.center.x, -bound.center.y, -bound.center.z);
  geometry.scale(1 / bound.radius, 1 / bound.radius, 1 / bound.radius);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createTumbleweeds(world: THREE.Group, scope: Lifecycle) {
  const batch = new THREE.InstancedMesh(
    tumbleweedGeometry(),
    new THREE.MeshStandardMaterial({ color: 0xb99562, roughness: 1 }),
    CAPACITY,
  );
  batch.name = "desert-tumbleweeds";
  batch.count = 0;
  batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(batch);
  // Geometry and material are released by the scene's shared cleanup.
  scope.defer(() => batch.dispose());
  const motion = reducedMotion();
  const pose = new THREE.Object3D();
  const tint = new THREE.Color();
  let time = 0;

  return {
    update(progress: number, dt: number, mode: SceneryMode) {
      if (scope.signal.aborted) return;
      if (!motion.matches) time += dt;
      const travel = time * WIND_SPEED;
      const firstCell = Math.floor((progress - travel - 140) / SPACING);
      let count = 0;
      for (let cell = firstCell; cell < firstCell + CAPACITY / 2; cell++) {
        for (const side of [-1, 1]) {
          const seed = noise(cell, side * 17);
          const station = cell * SPACING + seed * 30 + travel;
          if (station < progress - 120 || station > progress + 330) continue;
          // Check each ball's location so automatic biome transitions work too.
          if (environmentWeights(station, mode).desert < 0.8) continue;
          const radius = 0.55 + noise(cell, side * 31) * 0.4;
          const lateral = side * (10 + seed * 15 + Math.sin(time * 0.35 + cell) * 1.2);
          const point = roadPoint(station, lateral);
          if (stationClearing(station, lateral, mode) ||
              settlementClearing(point.x, point.z, station, radius + 1, mode)) continue;
          const bounce = Math.abs(Math.sin(travel / radius * 1.7 + seed * 9)) * 0.12;
          pose.position.set(point.x,
            terrainSurfaceHeight(point.x, point.z, mode) + radius + bounce, point.z);
          // Travel follows the verge, with a little sideways wind and an uneven roll.
          pose.rotation.set(-travel / radius + seed * 6,
            roadFrame(station).heading, Math.sin(time * 0.7 + seed * 8) * 0.2, "YXZ");
          pose.scale.setScalar(radius);
          pose.updateMatrix();
          batch.setMatrixAt(count, pose.matrix);
          tint.setScalar(0.8 + seed * 0.35);
          batch.setColorAt(count++, tint);
        }
      }
      batch.count = count;
      batch.visible = count > 0;
      batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
      if (count) batch.computeBoundingSphere();
    },
  };
}
