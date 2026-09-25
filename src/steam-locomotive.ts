import * as THREE from "./three.ts";
import type { Lifecycle } from "./lifecycle.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";

type XYZ = [number, number, number];

export function createSteamLocomotive(scope: Lifecycle) {
  const group = new THREE.Group();
  group.name = "steam-locomotive";
  group.visible = false;
  const iron = new THREE.MeshStandardMaterial({ color: 0x263631, metalness: 0.5, roughness: 0.55 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc3a05f, metalness: 0.55, roughness: 0.4 });
  const paint = new THREE.MeshStandardMaterial({ color: 0x6e3f38, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aaba9, metalness: 0.65, roughness: 0.4 });
  const window = new THREE.MeshStandardMaterial({ color: 0xd4bb88, emissive: 0xa8783d, emissiveIntensity: 0.35 });
  const headlamp = new THREE.MeshBasicMaterial({ color: 0xffdda4 });
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, at: XYZ, parent = group) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(...at); parent.add(object); return object;
  }
  function box(size: XYZ, at: XYZ, material: THREE.Material, parent = group) {
    return mesh(new THREE.BoxGeometry(...size), material, at, parent);
  }
  box([2.5, 0.24, 10.8], [0, 1.18, 0], iron);
  const boiler = mesh(new THREE.CylinderGeometry(0.9, 0.9, 6.6, 24), iron, [0, 2.36, -1.2]);
  boiler.rotation.x = Math.PI / 2;
  for (const z of [-3.7, -1.3, 1.2]) mesh(new THREE.TorusGeometry(0.908, 0.032, 8, 24), brass, [0, 2.36, z]);
  mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.64, 16), iron, [0, 3.58, -3.6]);
  mesh(new THREE.CylinderGeometry(0.31, 0.28, 0.12, 16), brass, [0, 3.95, -3.6]);
  mesh(new THREE.SphereGeometry(0.25, 16, 10), brass, [0, 3.28, -0.6]).scale.y = 0.85;
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), brass, [0.42, 3.34, 0.65]);
  box([2.7, 2.44, 3.05], [0, 2.39, 3.7], paint);
  box([2.94, 0.16, 3.36], [0, 3.68, 3.7], iron);
  for (const side of [-1, 1]) {
    box([0.035, 1.08, 1.58], [side * 1.37, 2.84, 3.45], brass);
    box([0.04, 0.94, 1.44], [side * 1.395, 2.84, 3.45], window);
    box([0.35, 0.65, 2.4], [side * 0.94, 1.74, 0.6], iron);
    box([0.3, 0.12, 1.0], [side * 1.37, 1.08, 4.3], steel);
    const handrail = mesh(new THREE.CylinderGeometry(0.021, 0.021, 5.9, 8), brass, [side * 0.98, 2.32, -1.4]);
    handrail.rotation.x = Math.PI / 2;
    for (const z of [-4.95, 5.38]) {
      const buffer = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12), iron, [side * 0.9, 1.2, z]);
      buffer.rotation.x = Math.PI / 2;
    }
  }
  box([2.75, 0.23, 0.28], [0, 1.23, -5.14], paint);
  const lamp = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 16), brass, [0, 2.67, -4.58]);
  lamp.rotation.x = Math.PI / 2;
  mesh(new THREE.CircleGeometry(0.15, 16), headlamp, [0, 2.67, -4.68]).rotation.y = Math.PI;
  for (let rib = -4; rib <= 4; rib++) {
    const bar = box([0.08, 0.55, 0.08], [rib * 0.27, 0.94, -5.18 + Math.abs(rib) * 0.045], iron);
    bar.rotation.x = -0.3;
  }
  mergeStaticMeshes(group, [...group.children], scope);

  const wheels: THREE.Group[] = [], rods: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-3.35, -1.25, 0.85]) {
      const wheel = new THREE.Group();
      wheel.name = "steam-driving-wheel";
      wheel.position.set(side * 1.25, 0.86, z);
      group.add(wheel); wheels.push(wheel);
      const disk = mesh(new THREE.CylinderGeometry(0.71, 0.71, 0.13, 24), paint, [0, 0, 0], wheel);
      disk.rotation.z = Math.PI / 2;
      const rim = mesh(new THREE.TorusGeometry(0.67, 0.042, 6, 24), steel, [side * 0.08, 0, 0], wheel);
      rim.rotation.y = Math.PI / 2;
      for (let spoke = 0; spoke < 6; spoke++) {
        box([0.025, 0.045, 1.2], [side * 0.092, 0, 0], brass, wheel).rotation.x = spoke * Math.PI / 6;
      }
      mergeStaticMeshes(wheel, [...wheel.children], scope);
    }
    const rod = box([0.095, 0.09, 4.43], [side * 1.39, 0.86, -1.25], steel);
    rods.push(rod);
    for (const z of [3.15, 4.55]) {
      const wheel = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16), iron, [side * 0.79, 0.61, z]);
      wheel.rotation.z = Math.PI / 2;
    }
  }

  const pixels = new Uint8Array(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const at = (y * 32 + x) * 4;
    pixels[at] = pixels[at + 1] = pixels[at + 2] = 238;
    pixels[at + 3] = Math.max(0, 1 - Math.hypot(x - 15.5, y - 15.5) / 15.5) ** 2 * 255;
  }
  const smokeTexture = new THREE.DataTexture(pixels, 32, 32);
  smokeTexture.needsUpdate = true;
  scope.defer(() => smokeTexture.dispose());
  const puffs = Array.from({ length: 7 }, () => {
    const material = new THREE.SpriteMaterial({ map: smokeTexture, color: 0xd5d7cb, transparent: true, depthWrite: false });
    scope.defer(() => material.dispose());
    const puff = new THREE.Sprite(material);
    group.add(puff); return puff;
  });
  let time = 0;
  return {
    group,
    update(progress: number, dt: number, reducedMotion: boolean) {
      if (!group.visible) return;
      const angle = -progress / 0.71;
      for (const wheel of wheels) wheel.rotation.x = angle;
      for (const rod of rods) {
        rod.position.y = 0.86 + Math.sin(angle) * 0.23;
        rod.position.z = -1.25 + Math.cos(angle) * 0.23;
      }
      if (!reducedMotion) time += dt;
      puffs.forEach((puff, index) => {
        puff.visible = !reducedMotion;
        const phase = (time * 0.23 + index / puffs.length) % 1;
        puff.position.set(Math.sin(phase * 4 + index) * phase * 0.25, 4.02 + phase * 2.8, -3.6 + phase * 3);
        puff.scale.setScalar(0.55 + phase * 2.25);
        puff.material.opacity = Math.sin(phase * Math.PI) * 0.46;
      });
    },
  };
}
