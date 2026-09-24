import * as THREE from "./three.ts";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Lifecycle } from "./lifecycle.ts";
import { reducedMotion } from "./motion.ts";
import { PREFERENCES, readPreference, savePreference } from "./prefs.ts";
import { createTreeGrowth, treeShape } from "./tree-growth.ts";

export function createPottedTree(scope: Lifecycle) {
  const object = new THREE.Group();
  object.name = "growing-tree";
  // The soil is the fixed pivot. Growth and sway never move the pot itself.
  object.position.y = 0.157;
  object.rotation.y = -0.6;
  const crown = new THREE.Group();
  crown.name = "tree-growth";
  object.add(crown);
  const growth = createTreeGrowth(readPreference("treeAge"));
  const motion = reducedMotion();
  let canopies: THREE.Object3D[] = [];
  let savedAt = 0;
  let breeze = 0;
  let lastFrame: number | null = null;

  // A small sapling also keeps the pot planted if the model cannot load.
  const sapling = new THREE.Group();
  sapling.name = "tree-sapling";
  crown.add(sapling);
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.012, 0.42, 7),
    new THREE.MeshStandardMaterial({ color: 0x89664b, roughness: 0.92 }),
  );
  stem.position.y = 0.21;
  sapling.add(stem);
  const leafGeometry = new THREE.SphereGeometry(1, 6, 4);
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x829a64,
    roughness: 0.92,
    flatShading: true,
  });
  for (let i = 0; i < 5; i++) {
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    const angle = i * 2.4;
    leaf.position.set(
      Math.cos(angle) * 0.035,
      0.24 + i * 0.045,
      Math.sin(angle) * 0.035,
    );
    leaf.rotation.set(0.25, -angle, i % 2 ? 0.5 : -0.5);
    leaf.scale.set(0.085, 0.02, 0.035);
    sapling.add(leaf);
  }

  function shape() {
    const pose = treeShape(growth.seconds);
    crown.scale.set(pose.width, pose.height, pose.width);
    canopies.forEach((part, index) => {
      part.scale.setScalar(index === 0 ? pose.lowerCrown : pose.upperCrown);
    });
  }
  shape();

  void scope
    .task(async () => {
      const response = await fetch("/assets/potted-tree.glb", {
        signal: scope.signal,
      });
      if (!response.ok) throw new Error(`Tree asset: ${response.status}`);
      const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer(), "");
      if (scope.signal.aborted) {
        // The scene may already have been disposed while the GLB was parsing.
        asset.scene.traverse((part) => {
          if (!(part instanceof THREE.Mesh)) return;
          part.geometry.dispose();
          const materials = Array.isArray(part.material)
            ? part.material
            : [part.material];
          for (const material of materials) material.dispose();
        });
        return;
      }
      canopies = [];
      asset.scene.traverse((part) => {
        if (part.userData.canopy) canopies.push(part);
      });
      canopies.sort((a, b) => a.position.y - b.position.y);
      crown.add(asset.scene);
      sapling.visible = false;
      shape();
    })
    .catch((error: unknown) => console.warn("Could not load the miniature tree", error));

  function save() {
    // Another tab may have a more mature tree; never overwrite it with a younger one.
    growth.resume(readPreference("treeAge"));
    savePreference("treeAge", growth.seconds);
  }
  scope.on(window, "storage", (event) => {
    if (event instanceof StorageEvent && event.key === PREFERENCES.treeAge.key) {
      growth.resume(readPreference("treeAge"));
      shape();
    }
  });
  scope.on(document, "visibilitychange", () => {
    growth.update(performance.now(), false);
    lastFrame = null;
    if (document.hidden) save();
  });
  scope.on(window, "pagehide", save);
  scope.defer(save);

  return {
    object,
    update(now: number, aboard: boolean) {
      if (scope.signal.aborted) return;
      const active = aboard && !document.hidden;
      growth.update(now, active);
      if (active && now - savedAt >= 30000) {
        save();
        savedAt = now;
      }
      const dt = lastFrame === null
        ? 0
        : Math.max(0, Math.min((now - lastFrame) / 1000, 0.05));
      lastFrame = now;
      if (active && !motion.matches) breeze += dt;
      crown.rotation.z = motion.matches ? 0 : Math.sin(breeze * 1.2) * 0.012;
      crown.rotation.x = motion.matches ? 0 : Math.sin(breeze * 0.8 + 0.4) * 0.007;
      shape();
    },
  };
}
