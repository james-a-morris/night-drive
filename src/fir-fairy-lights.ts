import * as THREE from "./three.ts";
import { radialTexture } from "./textures.ts";

// Individual bulbs sit on the actual branch surface, with the wire hidden in
// the foliage. Each fir variant shares its light geometry across the landscape.
export function createFirFairyLights(firGeometry: THREE.BufferGeometry) {
  const group = new THREE.Group();
  const bulbs: number[] = [], colors: number[] = [];
  const surfaceMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const surface = new THREE.Mesh(firGeometry, surfaceMaterial);
  const ray = new THREE.Raycaster();
  const red = new THREE.Color(0xff142b), green = new THREE.Color(0x16e84a);
  for (let i = 0; i < 110; i++) {
    // A loose winding strand with uneven spacing and small dips between boughs.
    const angle = i / 109 * Math.PI * 12 + Math.sin(i * 2.3) * 0.24;
    const y = 1.06 + i / 109 * 7.12 + Math.sin(i * 1.73) * 0.14;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    ray.set(new THREE.Vector3(outward.x * 4, y, outward.z * 4), outward.clone().negate());
    const hit = ray.intersectObject(surface)[0];
    if (!hit) continue;
    const bulb = hit.point.addScaledVector(outward, 0.035);
    bulbs.push(bulb.x, bulb.y, bulb.z);
    const color = i % 2 ? green : red;
    colors.push(color.r, color.g, color.b);
  }
  surfaceMaterial.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(bulbs, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const glow = radialTexture(32, [
    [0, "rgba(255,255,255,1)"],
    [0.18, "rgba(255,255,255,0.95)"],
    [0.45, "rgba(255,255,255,0.24)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  group.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    vertexColors: true, size: 0.34, map: glow, transparent: true, opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false,
  })));
  group.add(new THREE.Points(geometry, new THREE.PointsMaterial({
    vertexColors: true, size: 0.16, map: glow, transparent: true,
    depthWrite: false, toneMapped: false,
  })));
  return group;
}
