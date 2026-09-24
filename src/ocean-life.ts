import * as THREE from "./three.ts";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { Lifecycle } from "./lifecycle.ts";
import type { SceneryMode } from "./environments.ts";
import { environmentWeights } from "./environments.ts";
import { recycleStation } from "./recycle.ts";
import { terrainSurfaceHeight, SEA_LEVEL } from "./terrain.ts";
import {
  OCEAN_SPECIES,
  oceanHeight,
  oceanPose,
  type OceanSpecies,
  type SwimPath,
} from "./ocean-motion.ts";

const loader = new GLTFLoader();
const models = new Map<OceanSpecies, Promise<GLTF | null>>();
function loadModel(species: OceanSpecies) {
  if (!models.has(species)) {
    models.set(
      species,
      loader.loadAsync(`/assets/ocean-${species}.glb`).catch((error) => {
        models.delete(species);
        console.warn(`Could not load ocean ${species}`, error);
        return null;
      }),
    );
  }
  return models.get(species)!;
}

interface Swimmer {
  path: SwimPath;
  body: THREE.Group;
  loaded: boolean;
  mixer?: THREE.AnimationMixer;
  action?: THREE.AnimationAction;
  ripples: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
}

export function createOceanLife(parent: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "ocean-life";
  parent.add(root);
  const swimmers: Swimmer[] = [];
  const rippleGeometry = new THREE.RingGeometry(0.92, 1, 40);
  rippleGeometry.rotateX(-Math.PI / 2);
  // All resources are attached to the scene; its disposer owns geometry and
  // materials. The lifecycle also stops mixers and cancels late model mounts.
  const encounters: {
    station: number;
    offshore: number;
    species: OceanSpecies[];
  }[] = [
    { station: 150, offshore: 23, species: ["dolphin", "dolphin", "dolphin"] },
    { station: 270, offshore: 56, species: ["whale"] },
    {
      station: 370,
      offshore: 20,
      species: ["tang", "fish", "tang", "clownfish", "fish", "clownfish"],
    },
    { station: 505, offshore: 25, species: ["ray", "ray"] },
    { station: 655, offshore: 30, species: ["shark"] },
    { station: 810, offshore: 24, species: ["dolphin", "dolphin"] },
  ];
  for (const [index, encounter] of encounters.entries()) {
    encounter.species.forEach((species, member) => {
      const body = new THREE.Group();
      body.name = `ocean-${species}`;
      root.add(body);
      const ripples: Swimmer["ripples"] = [];
      if (["dolphin", "whale", "shark"].includes(species)) {
        for (let i = 0; i < 2; i++) {
          const ring = new THREE.Mesh(
            rippleGeometry,
            new THREE.MeshBasicMaterial({
              color: 0xb6e1d8,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              side: THREE.DoubleSide,
            }),
          );
          ring.name = "ocean-surface-ripple";
          ring.renderOrder = 1;
          root.add(ring);
          ripples.push(ring);
        }
      }
      swimmers.push({
        body,
        ripples,
        loaded: false,
        path: {
          species,
          station:
            encounter.station +
            member * (OCEAN_SPECIES[species].length < 1.2 ? 2 : 4.5),
          offshore:
            encounter.offshore +
            (member % 3) * (OCEAN_SPECIES[species].length < 1.2 ? 1.6 : 3),
          phase: index * 1.4 + member * 0.18,
        },
      });
    });
  }

  function populate(swimmer: Swimmer) {
    swimmer.loaded = true;
    void loadModel(swimmer.path.species).then((asset) => {
      if (!asset || scope.signal.aborted) return;
      const rig = clone(asset.scene);
      const mixer = new THREE.AnimationMixer(rig);
      swimmer.mixer = mixer;
      scope.defer(() => {
        mixer.stopAllAction();
        mixer.uncacheRoot(rig);
      });
      const clip = asset.animations[0];
      if (clip) {
        swimmer.action = mixer.clipAction(clip).play();
        swimmer.action.timeScale = OCEAN_SPECIES[swimmer.path.species].stroke;
      }
      mixer.update(0);
      rig.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(rig, true);
      const center = bounds.getCenter(new THREE.Vector3());
      const offset = new THREE.Group();
      offset.position.copy(center).negate();
      offset.add(rig);
      const scaled = new THREE.Group();
      scaled.scale.setScalar(
        OCEAN_SPECIES[swimmer.path.species].length /
          (bounds.max.z - bounds.min.z),
      );
      // The source animals face +Z; route tangents use -Z as forward.
      scaled.rotation.y = Math.PI;
      scaled.add(offset);
      swimmer.body.add(scaled);
      // Separate animation phases keep pods and schools from swimming in lockstep.
      mixer.setTime(swimmer.path.phase * 2.3);
    });
  }

  return {
    root,
    update(
      progress: number,
      dt: number,
      mode: SceneryMode,
      time: number,
      still: boolean,
    ) {
      for (const swimmer of swimmers) {
        const path = swimmer.path;
        path.station = recycleStation(path.station, progress - 160, 960);
        const pose = oceanPose(path, time, still);
        // Both the actual coastline and rendered terrain must be water here.
        // This also suppresses animals in the mixed land/ocean transition.
        const visible =
          Math.abs(pose.station - progress) < 360 &&
          environmentWeights(-pose.z, mode).coast > 0.98 &&
          terrainSurfaceHeight(pose.x, pose.z, mode) < SEA_LEVEL - 3;
        swimmer.body.visible = visible;
        for (const ring of swimmer.ripples) ring.visible = visible;
        if (!visible) continue;
        if (!swimmer.loaded) populate(swimmer);
        swimmer.body.position.set(pose.x, pose.y, pose.z);
        swimmer.body.rotation.set(pose.pitch, pose.heading, pose.roll, "YXZ");
        if (!still) {
          if (swimmer.action) swimmer.action.timeScale = pose.stroke;
          swimmer.mixer?.update(dt);
        }
        swimmer.ripples.forEach((ring, i) => {
          const wake = oceanPose(
            path,
            Math.max(0, time - 0.45 - i * 0.55),
            still,
          );
          const phase = (((time * 0.3 + path.phase + i * 0.5) % 1) + 1) % 1;
          const length = OCEAN_SPECIES[path.species].length;
          const radius = length * (0.2 + phase * 0.35);
          ring.position.set(
            wake.x,
            oceanHeight(wake.x, wake.z, time) + 0.04,
            wake.z,
          );
          ring.rotation.y = wake.heading;
          ring.scale.set(radius * 0.5, 1, radius);
          const nearSurface = THREE.MathUtils.clamp(
            1 -
              wake.depth / (path.species === "whale" ? 2 : 1) +
              pose.splash * 0.6,
            0,
            1,
          );
          ring.material.opacity =
            Math.sin(phase * Math.PI) * nearSurface * 0.34;
        });
      }
    },
  };
}
