import * as THREE from "./three.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Lifecycle } from "./lifecycle.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";
import { createSteamLocomotive } from "./steam-locomotive.ts";
import { TRAIN_PALETTES, type TrainType } from "./train-types.ts";
import {
  trainFrames,
  CARRIAGE_LENGTH,
  CARRIAGE_WHEELBASE,
} from "./train-motion.ts";

// Separate rigid carriages, swiveling bogies, and flexible gangways follow
// the same rails as the observation cabin.
export function createTrain(scene: THREE.Group, scope: Lifecycle) {
  const cars: THREE.Group[] = [],
    bogies: THREE.Group[][] = [],
    gangways: {
      group: THREE.Group;
      geometry: THREE.BufferGeometry;
      coupler: THREE.Mesh;
    }[] = [];
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x456055,
    roughness: 0.8,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    color: 0xb4b4a0,
    roughness: 0.8,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xa79262,
    roughness: 0.6,
    metalness: 0.25,
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x252f2c,
    roughness: 0.9,
  });
  const bellowsMaterial = new THREE.MeshStandardMaterial({
    color: 0x303932,
    roughness: 1,
    flatShading: true,
  });
  const endMaterial = new THREE.MeshStandardMaterial({
    color: 0x34483e,
    roughness: 0.9,
  });
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0xc6b888,
    emissive: 0x8e682e,
    emissiveIntensity: 0.22,
    roughness: 0.4,
  });
  const roofProfile = new THREE.Shape();
  roofProfile.moveTo(-1.66, 3.43);
  roofProfile.quadraticCurveTo(-1.66, 4.02, 0, 4.02);
  roofProfile.quadraticCurveTo(1.66, 4.02, 1.66, 3.43);
  roofProfile.closePath();
  const roofGeometry = new THREE.ExtrudeGeometry(roofProfile, {
    depth: CARRIAGE_LENGTH - 0.14,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.07,
    bevelThickness: 0.07,
  });
  roofGeometry.translate(0, 0, -(CARRIAGE_LENGTH - 0.14) / 2);
  const bodyGeometry = new THREE.BoxGeometry(3.3, 2.48, CARRIAGE_LENGTH);
  const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.16, 16);
  wheelGeometry.rotateZ(Math.PI / 2);
  function box(
    parent: THREE.Object3D,
    size: [number, number, number],
    at: [number, number, number],
    material: THREE.Material,
  ) {
    const object = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    object.position.set(...at);
    parent.add(object);
    return object;
  }
  for (let index = 0; index < 5; index++) {
    const car = new THREE.Group();
    car.name = `leading-carriage-${index + 1}`;
    const shell = new THREE.Mesh(bodyGeometry, bodyMaterial);
    shell.position.y = 2.2;
    car.add(shell);
    car.add(new THREE.Mesh(roofGeometry, roofMaterial));
    box(car, [3.34, 0.065, 11.04], [0, 1.78, 0], trimMaterial);
    box(car, [3.34, 0.04, 11.04], [0, 3.42, 0], trimMaterial);
    for (const side of [-1, 1]) {
      for (const z of [-3.75, -1.25, 1.25, 3.75]) {
        box(car, [0.025, 1.21, 1.88], [side * 1.665, 2.62, z], trimMaterial);
        box(car, [0.03, 1.1, 1.76], [side * 1.686, 2.62, z], windowMaterial);
        box(car, [0.035, 0.025, 1.76], [side * 1.706, 2.6, z], trimMaterial);
      }
    }
    const carBogies: THREE.Group[] = [];
    for (const z of [CARRIAGE_WHEELBASE / 2, -CARRIAGE_WHEELBASE / 2]) {
      const bogie = new THREE.Group();
      bogie.position.z = z;
      car.add(bogie);
      box(bogie, [1.55, 0.2, 1.65], [0, 0.8, 0], darkMaterial);
      for (const side of [-1, 1])
        for (const axle of [-0.58, 0.58]) {
          const wheel = new THREE.Mesh(wheelGeometry, darkMaterial);
          wheel.position.set(side * 0.77, 0.605, axle);
          bogie.add(wheel);
        }
      carBogies.push(bogie);
      mergeStaticMeshes(bogie, [...bogie.children], scope);
    }
    for (const side of [-1, 1]) {
      const z = (side * CARRIAGE_LENGTH) / 2;
      box(car, [3.31, 2.48, 0.08], [0, 2.2, z - side * 0.04], endMaterial);
      box(car, [1.48, 2.28, 0.1], [0, 2.07, z], darkMaterial);
    }
    mergeStaticMeshes(car, [...car.children], scope);
    scene.add(car);
    cars.push(car);
    car.userData.trainType = "classic";
    bogies.push(carBogies);

    // Alternating narrow/wide rings form an accordion. Each end stays attached
    // to its carriage, and the folds fan out as the two bodies turn apart.
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.Float32BufferAttribute(
      new Float32Array(9 * 4 * 3),
      3,
    );
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positions);
    const indices = [];
    for (let ring = 0; ring < 8; ring++)
      for (let side = 0; side < 4; side++) {
        const a = ring * 4 + side,
          b = ring * 4 + ((side + 1) % 4);
        indices.push(a, a + 4, b, b, a + 4, b + 4);
      }
    geometry.setIndex(indices);
    const gangway = new THREE.Group();
    gangway.name = `carriage-gangway-${index + 1}`;
    gangway.add(new THREE.Mesh(geometry, bellowsMaterial));
    const coupler = box(gangway, [0.22, 0.18, 1], [0, 0.92, 0], darkMaterial);
    scene.add(gangway);
    gangways.push({ group: gangway, geometry, coupler });
  }
  const front = cars[cars.length - 1];
  const originalFrontParts = [...front.children];
  const locomotive = createSteamLocomotive(scope);
  front.add(locomotive.group);
  const metroDetails = cars.map((car, index) => {
    const group = new THREE.Group();
    group.name = "metro-carriage-details";
    group.visible = false;
    car.add(group);
    for (const side of [-1, 1]) {
      box(group, [0.035, 0.22, 10.85], [side * 1.67, 1.39, 0], trimMaterial);
      for (const z of [-2.5, 2.5]) box(group, [0.42, 0.065, 1.25], [side * 0.63, 3.99, z], darkMaterial);
    }
    if (index === cars.length - 1) {
      const nose = new THREE.Mesh(new RoundedBoxGeometry(3.28, 2.48, 0.26, 3, 0.12), bodyMaterial);
      nose.position.set(0, 2.2, -5.51);
      group.add(nose);
      const windscreen = new THREE.MeshStandardMaterial({
        color: 0x304d5c, roughness: 0.25, metalness: 0.2,
        emissive: 0x244b60, emissiveIntensity: 0.2,
      });
      box(group, [3.02, 1.22, 0.1], [0, 2.6, -5.66], darkMaterial);
      box(group, [2.65, 0.91, 0.025], [0, 2.62, -5.725], windscreen);
      box(group, [0.065, 1.16, 0.045], [0, 2.62, -5.745], roofMaterial);
      box(group, [3.15, 0.22, 0.025], [0, 1.39, -5.66], trimMaterial);
      box(group, [0.3, 0.16, 0.25], [0, 0.96, -5.72], darkMaterial);
      const lamp = new THREE.MeshBasicMaterial({ color: 0xffeed2 });
      for (const side of [-1, 1]) box(group, [0.35, 0.095, 0.035], [side * 1.15, 1.84, -5.67], lamp);
    }
    mergeStaticMeshes(group, [...group.children], scope);
    return group;
  });
  let currentType: TrainType = "classic";
  return {
    cars,
    setTrainType(type: TrainType) {
      if (type === currentType) return;
      currentType = type;
      const palette = TRAIN_PALETTES[type];
      bodyMaterial.color.set(palette.exterior);
      bodyMaterial.metalness = type === "metro" ? 0.45 : 0;
      bodyMaterial.roughness = type === "metro" ? 0.45 : 0.8;
      roofMaterial.color.set(palette.roof);
      trimMaterial.color.set(palette.trim);
      endMaterial.color.set(palette.end);
      windowMaterial.color.set(type === "metro" ? 0xb3ced2 : 0xc6b888);
      windowMaterial.emissive.set(type === "metro" ? 0x648da1 : 0x8e682e);
      for (const car of cars) car.userData.trainType = type;
      for (const object of originalFrontParts) object.visible = type !== "steam";
      locomotive.group.visible = type === "steam";
      for (const group of metroDetails) group.visible = type === "metro";
    },
    update(progress: number, dt = 0, reducedMotion = false) {
      locomotive.update(progress, dt, reducedMotion);
      const frames = trainFrames(progress, cars.length);
      cars.forEach((car, index) => {
        const at = frames.cars[index];
        car.position.set(at.x, 0, at.z);
        car.rotation.y = at.heading;
        bogies[index][0].rotation.y = at.rearBogie.heading - at.heading;
        bogies[index][1].rotation.y = at.frontBogie.heading - at.heading;

        const previous = index ? frames.cars[index - 1] : frames.cabin;
        const { group, geometry, coupler } = gangways[index];
        group.position.set(previous.front.x, 0, previous.front.z);
        const dx = at.rear.x - previous.front.x,
          dz = at.rear.z - previous.front.z;
        const positions = geometry.attributes.position;
        for (let ring = 0; ring < 9; ring++) {
          const t = ring / 8,
            halfWidth = ring % 2 ? 0.72 : 0.63;
          const heading =
            previous.heading + (at.heading - previous.heading) * t;
          for (let corner = 0; corner < 4; corner++) {
            const x = (corner === 0 || corner === 3 ? -1 : 1) * halfWidth;
            positions.setXYZ(
              ring * 4 + corner,
              dx * t + Math.cos(heading) * x,
              corner < 2 ? 1.01 : 3.13,
              dz * t - Math.sin(heading) * x,
            );
          }
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        coupler.position.set(dx / 2, 0.92, dz / 2);
        coupler.rotation.y = Math.atan2(dx, dz);
        coupler.scale.z = Math.hypot(dx, dz);
      });
      return frames.cabin;
    },
  };
}
