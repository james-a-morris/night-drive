import { createInstanceView, createVisibleInstances, type VisibleInstance } from "./visible-instances.ts";
import * as THREE from "./three.ts";
import { createNatureModels } from "./nature-models.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { SceneryMode } from "./environments.ts";
import { reducedMotion } from "./motion.ts";
import { NATURE_CAPACITY, isNatureTree, naturePlacements, type NatureKind } from "./nature-layout.ts";
import { DETAIL_FADE_START, DETAIL_FADE_END, TREE_FADE_START, TREE_FADE_END, firstNatureCell } from "./view-distance.ts";

export function createStylizedNature(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "stylized-nature";
  world.add(root);
  type BatchKey = NatureKind | `${NatureKind}-distant`;
  const batches = new Map<BatchKey, ReturnType<typeof createVisibleInstances>[]>();
  const instanceView = createInstanceView();
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
    const sources = new Map<BatchKey, VisibleInstance[]>();
    for (const pose of naturePlacements(latestProgress, latestMode)) {
      dummy.position.set(pose.x, pose.y, pose.z);
      dummy.rotation.set(0, pose.yaw, 0);
      dummy.scale.setScalar(pose.scale);
      dummy.updateMatrix();
      color.setRGB(pose.shade, pose.shade, pose.shade);
      const tree = isNatureTree(pose.kind);
      const instance = {
        matrix: dummy.matrix.clone(), color: color.clone(),
        bounds: new THREE.Sphere(new THREE.Vector3(pose.x, pose.y + (tree ? 4 : 0.6) * pose.scale, pose.z),
          (tree ? 6 : 2) * pose.scale),
      };
      const add = (key: BatchKey, minDistance: number, maxDistance: number) => {
        const list = sources.get(key) ?? [];
        list.push({ ...instance, minDistance, maxDistance });
        sources.set(key, list);
      };
      add(pose.kind, 0, tree ? TREE_FADE_END : DETAIL_FADE_END);
      if (tree) add(`${pose.kind}-distant`, TREE_FADE_START, Infinity);
    }
    for (const [key, parts] of batches) {
      for (const part of parts) part.setInstances(sources.get(key) ?? []);
    }
  }

  for (const distant of [false, true]) {
    const models = createNatureModels(distant);
    models.visible = false;
    root.add(models);
    const configured = new Set<THREE.Material>();
    for (const kind of Object.keys(NATURE_CAPACITY) as NatureKind[]) {
      const model = models.getObjectByName(kind);
      if (!model) continue;
      const height = new THREE.Box3().setFromObject(model).max.y;
      const parts: ReturnType<typeof createVisibleInstances>[] = [];
      model.traverse((part) => {
        if (!(part instanceof THREE.Mesh) || Array.isArray(part.material)) return;
        const material = part.material as THREE.MeshStandardMaterial;
        const positions = part.geometry.attributes.position;
        const flex = new Float32Array(positions.count);
        for (let i = 0; i < positions.count; i++)
          flex[i] = Math.max(0, positions.getY(i) / height) ** 2 * height * (isNatureTree(kind) ? 0.022 : 0.11);
        part.geometry.setAttribute("natureFlex", new THREE.BufferAttribute(flex, 1));
        part.geometry.setAttribute("natureDetail", new THREE.BufferAttribute(
          new Float32Array(positions.count).fill(isNatureTree(kind) ? 0 : 1), 1,
        ));
        part.geometry.setAttribute("natureLod", new THREE.BufferAttribute(
          new Float32Array(positions.count).fill(isNatureTree(kind) ? (distant ? 1 : -1) : 0), 1,
        ));
        if (!configured.has(material)) {
          configured.add(material);

          material.onBeforeCompile = (shader) => {
            shader.uniforms.natureTime = windTime;
            shader.uniforms.natureWind = windStrength;
            shader.vertexShader = `uniform float natureTime; uniform float natureWind;
              attribute float natureFlex;
              attribute float natureDetail;
              attribute float natureLod;
              varying float natureTreeFade;
              varying float natureLodLevel;
              varying float natureVisibility;\n` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
              #include <begin_vertex>
              float phase = 0.0;
              #ifdef USE_INSTANCING
                phase = sin(dot(instanceMatrix[3].xz, vec2(0.13, 0.19))) * 6.28318;
              #endif
              transformed.x += sin(natureTime * 0.7 + phase) * natureFlex * natureWind;
              transformed.z += cos(natureTime * 0.52 + phase * 1.3) * natureFlex * 0.55 * natureWind;
            `);
            shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
              #include <project_vertex>
              vec4 natureOrigin = vec4(0.0, 0.0, 0.0, 1.0);
              #ifdef USE_INSTANCING
                natureOrigin = instanceMatrix * natureOrigin;
              #endif
              float natureDistance = length((modelViewMatrix * natureOrigin).xyz);
              natureVisibility = 1.0 - natureDetail * smoothstep(
                ${DETAIL_FADE_START.toFixed(1)}, ${DETAIL_FADE_END.toFixed(1)}, natureDistance);
              natureTreeFade = smoothstep(${TREE_FADE_START.toFixed(1)}, ${TREE_FADE_END.toFixed(1)}, natureDistance);
              natureLodLevel = natureLod;
            `);
            // Dither opaque ground cover instead of alpha blending thousands of
            // overlapping plants. Trees keep their full silhouette in the fog.
            shader.fragmentShader = "varying float natureVisibility; varying float natureTreeFade; varying float natureLodLevel;\n" + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", `
              #include <clipping_planes_fragment>
              float natureDither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
              if (natureVisibility <= natureDither) discard;
              if (natureLodLevel < -0.5 && natureDither < natureTreeFade) discard;
              if (natureLodLevel > 0.5 && natureDither >= natureTreeFade) discard;
            `);
          };
          material.customProgramCacheKey = () => "night-line-nature-wind-distance-v2";
        }
        const batch = new THREE.InstancedMesh(part.geometry, material, NATURE_CAPACITY[kind]);
        batch.name = `nature-${kind}${distant ? "-distant" : ""}`;
        batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.count = 0;
        root.add(batch);
        scope.defer(() => batch.dispose());
        parts.push(createVisibleInstances(batch));
      });
      batches.set(distant ? `${kind}-distant` : kind, parts);
    }
  }
  populate();

  return {
    root,
    updateVisibility(camera: THREE.Camera) {
      instanceView.update(camera, root);
      for (const parts of batches.values()) for (const part of parts) part.update(instanceView);
    },
    update(progress: number, dt: number, mode: SceneryMode) {
      if (scope.signal.aborted) return;
      latestProgress = progress;
      latestMode = mode;
      if (!motion.matches) windTime.value += dt;
      windStrength.value = motion.matches ? 0 : 1;
      const cell = firstNatureCell(progress);
      if (cell !== previousCell || mode !== previousMode) {
        previousCell = cell;
        previousMode = mode;
        populate();
      }
    },
  };
}
