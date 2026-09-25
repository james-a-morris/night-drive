import * as THREE from "./three.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeStaticMeshes } from "./static-meshes.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { TrainType } from "./train-types.ts";

type XYZ = [number, number, number];

export function createWindowHandle(side: number, scope: Lifecycle) {
  const group = new THREE.Group();
  group.name = `window-handle-${side < 0 ? "left" : "right"}`;
  group.position.z = -1.05;
  // Small pulls sit just proud of the sill on either side of the train.
  group.scale.x = -side;
  const variants = { classic: new THREE.Group(), metro: new THREE.Group(), steam: new THREE.Group() };
  const brass = new THREE.MeshStandardMaterial({ color: 0xd0ad73, metalness: 0.4, roughness: 0.38 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x674735, roughness: 0.6 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2dfe1, metalness: 0.45, roughness: 0.32 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x334449, roughness: 0.65 });
  const antique = new THREE.MeshStandardMaterial({ color: 0xc8a15c, metalness: 0.4, roughness: 0.4 });
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, at: XYZ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...at);
    parent.add(object);
    return object;
  }
  function box(parent: THREE.Group, size: XYZ, at: XYZ, material: THREE.Material, radius = 0.008) {
    return mesh(parent, new RoundedBoxGeometry(...size, 2, radius), material, at);
  }
  function curve(parent: THREE.Group, points: XYZ[], material: THREE.Material, radius: number) {
    return mesh(parent, new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), 24, radius, 8, false,
    ), material, [0, 0, 0]);
  }

  // Night Rail: a warm wooden grip held by two rounded brass brackets.
  for (const end of [-1, 1]) {
    box(variants.classic, [0.024, 0.03, 0.05], [0.068, 0.062, end * 0.125], brass);
    curve(variants.classic, [[0.025, 0.021, end * 0.13], [0.07, 0.065, end * 0.125],
      [0.12, 0.091, end * 0.115], [0.145, 0.096, end * 0.1]], brass, 0.008);
    const collar = mesh(variants.classic, new THREE.CylinderGeometry(0.013, 0.013, 0.022, 16), brass,
      [0.145, 0.096, end * 0.1]);
    collar.rotation.x = Math.PI / 2;
  }
  const grip = mesh(variants.classic, new THREE.CylinderGeometry(0.0105, 0.0105, 0.18, 16), wood, [0.145, 0.096, 0]);
  grip.rotation.x = Math.PI / 2;

  // Metro: a clean, squared steel pull with dark mounting pads.
  for (const end of [-1, 1]) {
    box(variants.metro, [0.025, 0.027, 0.045], [0.063, 0.062, end * 0.105], dark);
    curve(variants.metro, [[0.025, 0.02, end * 0.105], [0.08, 0.083, end * 0.105],
      [0.135, 0.09, end * 0.105]], steel, 0.007);
  }
  box(variants.metro, [0.018, 0.018, 0.23], [0.135, 0.09, 0], steel, 0.005);

  // Steam Express: a slim brass bow on rounded mounts.
  for (const end of [-1, 1]) {
    box(variants.steam, [0.022, 0.035, 0.06], [0.065, 0.066, end * 0.142], antique, 0.009);
  }
  curve(variants.steam, [[0.025, 0.021, -0.16], [0.08, 0.095, -0.135], [0.145, 0.12, -0.095],
    [0.155, 0.1, 0], [0.145, 0.12, 0.095], [0.08, 0.095, 0.135], [0.025, 0.021, 0.16]], antique, 0.01);

  for (const [type, variant] of Object.entries(variants)) {
    variant.name = `window-handle-${type}`;
    mergeStaticMeshes(variant, [...variant.children], scope);
    variant.visible = type === "classic";
    group.add(variant);
  }
  return {
    group,
    setTrainType(type: TrainType) {
      for (const [name, variant] of Object.entries(variants)) variant.visible = name === type;
    },
  };
}
