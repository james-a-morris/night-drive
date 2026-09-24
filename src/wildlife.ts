import * as THREE from "./three.ts";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { radialTexture } from "./textures.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { WildlifeSpecies } from "./environments.ts";
import type { GroundAt, Landmark } from "./landmark-types.ts";
import { wildlifePose } from "./wildlife-motion.ts";

const loader = new GLTFLoader();
const models = new Map<WildlifeSpecies, Promise<GLTF | null>>();
const heights = { deer: 1.65, stag: 2.15, fox: 0.78, wolf: 1.05 };

function loadModel(species: WildlifeSpecies) {
  if (!models.has(species)) {
    models.set(
      species,
      loader
        .loadAsync(`/assets/wildlife-${species}.glb`)
        .then((asset) => {
          asset.scene.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (material instanceof THREE.MeshStandardMaterial) {
                material.roughness = 0.93;
                material.metalness = 0;
              }
            }
            object.frustumCulled = false;
          });
          return asset;
        })
        .catch((error) => {
          models.delete(species);
          console.warn(`Could not load ${species} wildlife`, error);
          return null;
        }),
    );
  }
  return models.get(species)!;
}

// Shared model data, with an independent skeleton, animation clock and lifetime.
export function createWildlifeAnimal(
  species: WildlifeSpecies,
  variation: number,
  scope: Lifecycle,
): Landmark {
  const object = new THREE.Group();
  object.name = `wildlife-${species}`;
  const mover = new THREE.Group();
  mover.name = "animal-movement";
  object.add(mover);
  let body: THREE.Group | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let activeAction: THREE.AnimationAction | undefined;
  const actions = new Map<string, THREE.AnimationAction>();
  let elapsed = 0,
    contactAge = 0;
  let shadow:
    | THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
    | undefined;
  let groundAt: GroundAt | undefined;
  function groundHeight(x: number, z: number) {
    if (!groundAt) return 0;
    const c = Math.cos(object.rotation.y),
      s = Math.sin(object.rotation.y);
    return (
      (groundAt(
        object.position.x + (c * x + s * z) * object.scale.x,
        object.position.z + (c * z - s * x) * object.scale.z,
      ) -
        object.position.y) /
      object.scale.y
    );
  }
  function fitContact(detail: boolean) {
    if (!groundAt) return;
    mover.position.y = groundHeight(mover.position.x, mover.position.z);
    if (!detail || !shadow) return;
    const c = Math.cos(mover.rotation.y),
      s = Math.sin(mover.rotation.y);
    const surface = (x: number, z: number) =>
      groundHeight(
        mover.position.x + c * x + s * z,
        mover.position.z + c * z - s * x,
      );
    const positions = shadow.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(
        i,
        surface(positions.getX(i), positions.getZ(i)) - mover.position.y,
      );
    }
    positions.needsUpdate = true;
    shadow.geometry.computeBoundingSphere();
    if (body) {
      body.rotation.x = THREE.MathUtils.clamp(
        -Math.atan2(surface(0, 0.6) - surface(0, -0.6), 1.2),
        -0.2,
        0.2,
      );
      body.rotation.z = THREE.MathUtils.clamp(
        Math.atan2(surface(0.35, 0) - surface(-0.35, 0), 0.7),
        -0.2,
        0.2,
      );
    }
  }
  function fitGround(ground: GroundAt) {
    groundAt = ground;
    fitContact(true);
  }
  void loadModel(species).then((asset) => {
    if (!asset || scope.signal.aborted) return;
    const rig = clone(asset.scene);
    mixer = new THREE.AnimationMixer(rig);
    const animation = mixer;
    scope.defer(() => {
      animation.stopAllAction();
      animation.uncacheRoot(rig);
    });
    for (const clip of asset.animations)
      actions.set(clip.name, mixer.clipAction(clip));
    activeAction = actions.get("Idle") || actions.values().next().value;
    activeAction?.play();
    mixer.update(0);
    rig.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(rig, true);
    const center = bounds.getCenter(new THREE.Vector3());
    const offset = new THREE.Group();
    offset.position.set(-center.x, -bounds.min.y, -center.z);
    offset.add(rig);
    body = new THREE.Group();
    body.scale.setScalar(heights[species] / (bounds.max.y - bounds.min.y));
    body.add(offset);
    const geometry = new THREE.PlaneGeometry(
      (bounds.max.x - bounds.min.x) * body.scale.x * 1.8,
      (bounds.max.z - bounds.min.z) * body.scale.z * 0.85,
      2,
      3,
    );
    geometry.rotateX(-Math.PI / 2);
    shadow = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        map: radialTexture(
          64,
          [
            [0, "rgba(12,18,12,.28)"],
            [0.5, "rgba(12,18,12,.15)"],
            [1, "rgba(12,18,12,0)"],
          ],
          2,
        ),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.position.y = 0.025;
    mover.add(body, shadow);
    if (groundAt) fitGround(groundAt);
  });
  return {
    object,
    fitGround,
    update: (dt, _elapsed, reducedMotion) => {
      if (reducedMotion) return;
      elapsed += dt;
      const pose = wildlifePose(species, variation, elapsed);
      // Keep the clearing's narrow side aligned with its fence, independently
      // of the animal's initial facing direction.
      const c = Math.cos(object.rotation.y),
        s = Math.sin(object.rotation.y);
      mover.position.x = c * pose.x - s * pose.z;
      mover.position.z = s * pose.x + c * pose.z;
      mover.rotation.y = pose.heading - object.rotation.y;
      contactAge += dt;
      fitContact(contactAge >= 0.1);
      if (contactAge >= 0.1) contactAge = 0;
      const next = actions.get(pose.clip) || actions.get("Idle");
      if (next && next !== activeAction) {
        next.reset().setEffectiveWeight(1).play();
        next.time = (variation * 0.37) % next.getClip().duration;
        if (activeAction) next.crossFadeFrom(activeAction, 0.35, false);
        activeAction = next;
      }
      if (activeAction) {
        const gait =
          pose.clip === "Walk" ? 0.9 : pose.clip === "Gallop" ? 1.6 : 0;
        activeAction.timeScale = gait
          ? THREE.MathUtils.clamp(
              (pose.speed * object.scale.x) / gait,
              0.65,
              1.65,
            )
          : 1 + (variation % 3) * 0.09;
      }
      mixer?.update(dt);
    },
  };
}
