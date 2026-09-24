import * as THREE from "./three.ts";
import { createNatureModels } from "./nature-models.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { SceneryMode } from "./environments.ts";
import { reducedMotion } from "./motion.ts";
import { NATURE_CAPACITY, isNatureTree, naturePlacements, type NatureKind } from "./nature-layout.ts";

export function createStylizedNature(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "stylized-nature";
  world.add(root);
  const batches = new Map<NatureKind, THREE.InstancedMesh[]>();
  const windTime = { value: 0 };
  const windStrength = { value: 1 };
  const motion = reducedMotion();
  let previousCell = NaN;
  let previousMode: SceneryMode | undefined;
  let latestProgress = 0;
  let latestMode: SceneryMode = "auto";
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  function populate() {
    const counts = new Map<NatureKind, number>();
    for (const pose of naturePlacements(latestProgress, latestMode)) {
      const parts = batches.get(pose.kind);
      if (!parts) continue;
      const index = counts.get(pose.kind) ?? 0;
      if (index >= NATURE_CAPACITY[pose.kind]) continue;
      dummy.position.set(pose.x, pose.y, pose.z);
      dummy.rotation.set(0, pose.yaw, 0);
      dummy.scale.setScalar(pose.scale);
      dummy.updateMatrix();
      color.setRGB(pose.shade, pose.shade, pose.shade);
      for (const part of parts) {
        part.setMatrixAt(index, dummy.matrix);
        part.setColorAt(index, color);
      }
      counts.set(pose.kind, index + 1);
    }
    for (const [kind, parts] of batches) {
      for (const part of parts) {
        part.count = counts.get(kind) ?? 0;
        part.visible = part.count > 0;
        part.instanceMatrix.needsUpdate = true;
        if (part.instanceColor) part.instanceColor.needsUpdate = true;
        if (part.count) part.computeBoundingSphere();
      }
    }
  }

  const models = createNatureModels();
  models.visible = false;
  root.add(models);
  {
    const configured = new Set<THREE.Material>();
    for (const kind of Object.keys(NATURE_CAPACITY) as NatureKind[]) {
      const model = models.getObjectByName(kind);
      if (!model) continue;
      const height = new THREE.Box3().setFromObject(model).max.y;
      const parts: THREE.InstancedMesh[] = [];
      model.traverse((part) => {
        if (!(part instanceof THREE.Mesh) || Array.isArray(part.material)) return;
        const material = part.material as THREE.MeshStandardMaterial;
        const positions = part.geometry.attributes.position;
        const flex = new Float32Array(positions.count);
        for (let i = 0; i < positions.count; i++)
          flex[i] = Math.max(0, positions.getY(i) / height) ** 2 * height * (isNatureTree(kind) ? 0.022 : 0.11);
        part.geometry.setAttribute("natureFlex", new THREE.BufferAttribute(flex, 1));
        if (!configured.has(material)) {
          configured.add(material);

          material.onBeforeCompile = (shader) => {
            shader.uniforms.natureTime = windTime;
            shader.uniforms.natureWind = windStrength;
            shader.vertexShader = `uniform float natureTime; uniform float natureWind;
              attribute float natureFlex;\n` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
              #include <begin_vertex>
              float phase = 0.0;
              #ifdef USE_INSTANCING
                phase = sin(dot(instanceMatrix[3].xz, vec2(0.13, 0.19))) * 6.28318;
              #endif
              transformed.x += sin(natureTime * 0.7 + phase) * natureFlex * natureWind;
              transformed.z += cos(natureTime * 0.52 + phase * 1.3) * natureFlex * 0.55 * natureWind;
            `);
          };
          material.customProgramCacheKey = () => "night-line-nature-wind-v1";
        }
        const batch = new THREE.InstancedMesh(part.geometry, material, NATURE_CAPACITY[kind]);
        batch.name = `nature-${kind}`;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.count = 0;
        root.add(batch);
        scope.defer(() => batch.dispose());
        parts.push(batch);
      });
      batches.set(kind, parts);
    }
    populate();
  }

  return {
    root,
    update(progress: number, dt: number, mode: SceneryMode) {
      if (scope.signal.aborted) return;
      latestProgress = progress;
      latestMode = mode;
      if (!motion.matches) windTime.value += dt;
      windStrength.value = motion.matches ? 0 : 1;
      const cell = Math.floor((progress - 72) / 32);
      if (cell !== previousCell || mode !== previousMode) {
        previousCell = cell;
        previousMode = mode;
        populate();
      }
    },
  };
}
