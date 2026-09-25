import * as THREE from "./three.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeStaticMeshes } from "./static-meshes.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { TrainType } from "./train-types.ts";

type XYZ = [number, number, number];

// Only the architectural details switch. The desk, garden, windows and camera
// keep their objects and state for the whole journey.
export function createCabinStyleDetails(parent: THREE.Group, ceiling: THREE.Material, scope: Lifecycle) {
  const metro = new THREE.Group(), steam = new THREE.Group();
  metro.name = "metro-cabin-details";
  steam.name = "steam-cabin-details";
  metro.visible = steam.visible = false;
  parent.add(metro, steam);
  const steel = new THREE.MeshStandardMaterial({ color: 0xc6d4d8, metalness: 0.7, roughness: 0.3 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x254956, roughness: 0.65 });
  const grip = new THREE.MeshStandardMaterial({ color: 0xc8d7d5, roughness: 0.65 });
  const led = new THREE.MeshBasicMaterial({ color: 0xdcefff, toneMapped: false });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc69f58, metalness: 0.55, roughness: 0.4 });
  const opal = new THREE.MeshBasicMaterial({ color: 0xffd18d, toneMapped: false });
  function mesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, at: XYZ) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...at);
    parent.add(object);
    return object;
  }
  function box(parent: THREE.Group, size: XYZ, at: XYZ, material: THREE.Material, radius = 0.015) {
    return mesh(parent, new RoundedBoxGeometry(...size, 2, radius), material, at);
  }
  function rail(parent: THREE.Group, from: XYZ, to: XYZ, material: THREE.Material, radius = 0.023) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const object = mesh(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10),
      material, a.clone().add(b).multiplyScalar(0.5).toArray());
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
    return object;
  }
  // Solid roof shoulders give the commuter and heritage cars their own silhouette.
  for (const group of [metro, steam]) for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      side * 2.07, 3.235, 2.4, side * 2.07, 3.235, -26.4,
      side * 1.2, 3.615, -26.4, side * 1.2, 3.615, 2.4,
    ], 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    geometry.setIndex(side < 0 ? [0, 1, 2, 0, 2, 3] : [2, 1, 0, 3, 2, 0]);
    geometry.computeVertexNormals();
    mesh(group, geometry, ceiling, [0, 0, 0]);
  }

  for (const side of [-1, 1]) {
    box(metro, [0.24, 0.055, 27.2], [side * 0.8, 3.555, -11.8], steel);
    box(metro, [0.145, 0.024, 26.9], [side * 0.8, 3.514, -11.8], led);
    rail(metro, [side * 0.72, 3.18, -1.8], [side * 0.72, 3.18, -24], steel);
    for (const z of [-2.15, -7.2, -12, -16.8, -21.6]) {
      rail(metro, [side * 0.72, 0.83, z], [side * 0.72, 3.18, z], steel, 0.028);
      for (const y of [0.89, 3.16]) box(metro, [0.1, 0.075, 0.1], [side * 0.72, y, z], navy);
      rail(metro, [side * 0.72, 3.17, z - 0.7], [side * 0.72, 2.99, z - 0.7], navy, 0.017);
      mesh(metro, new THREE.TorusGeometry(0.088, 0.015, 8, 16), grip,
        [side * 0.72, 2.906, z - 0.7]);
    }
  }

  for (const z of [-4, -11, -18]) {
    rail(steam, [0, 3.57, z], [0, 3.27, z], brass, 0.024);
    mesh(steam, new THREE.CylinderGeometry(0.09, 0.265, 0.16, 20), brass, [0, 3.19, z]);
    mesh(steam, new THREE.CylinderGeometry(0.18, 0.16, 0.24, 20), opal, [0, 2.99, z]);
    mesh(steam, new THREE.CylinderGeometry(0.205, 0.17, 0.045, 20), brass, [0, 2.853, z]);
    for (const x of [-0.15, 0.15]) for (const offset of [-0.1, 0.1])
      rail(steam, [x, 2.865, z + offset], [x, 3.125, z + offset], brass, 0.009);
  }

  const routeCanvas = document.createElement("canvas");
  routeCanvas.width = 512;
  routeCanvas.height = 96;
  const ctx = routeCanvas.getContext("2d")!;
  ctx.fillStyle = "#162d36"; ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = "#c0e5d5"; ctx.font = "500 23px sans-serif";
  ctx.fillText("N  ·  NIGHT LINE", 24, 33);
  ctx.strokeStyle = "#68b0bd"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(25, 65); ctx.lineTo(487, 65); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.beginPath(); ctx.arc(25 + i * 66, 65, 5, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#f4d28e" : "#b8d9d4"; ctx.fill();
  }
  const routeTexture = new THREE.CanvasTexture(routeCanvas);
  routeTexture.colorSpace = THREE.SRGBColorSpace;
  box(metro, [2.58, 0.49, 0.065], [0, 3.02, -25.22], navy);
  mesh(metro, new THREE.PlaneGeometry(2.48, 0.465),
    new THREE.MeshBasicMaterial({ map: routeTexture }), [0, 3.02, -25.18]);
  for (const group of [metro, steam]) mergeStaticMeshes(group, [...group.children], scope);
  return {
    setTrainType(type: TrainType) {
      metro.visible = type === "metro";
      steam.visible = type === "steam";
    },
  };
}
