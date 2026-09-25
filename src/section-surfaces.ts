import * as THREE from "./three.ts";
import type { Lifecycle } from "./lifecycle.ts";

// The route's small terrain/rail meshes share four materials. Keep their
// editable sections on the CPU and draw one surface per material on the GPU.
// Recycling updates only the affected section's slice of each vertex buffer.
export function batchSectionSurfaces(
  root: THREE.Group,
  sources: { mesh: THREE.Mesh; origin: THREE.Group }[],
  scope: Lifecycle,
) {
  const groups = new Map<string, typeof sources>();
  const slices = new Map<THREE.Mesh, { geometry: THREE.BufferGeometry; offset: number; origin: THREE.Group }>();
  for (const source of sources) {
    const material = source.mesh.material as THREE.Material;
    const key = `${material.uuid}:${Object.keys(source.mesh.geometry.attributes).sort().join(":")}`;
    const list = groups.get(key) ?? [];
    list.push(source); groups.set(key, list);
  }
  for (const parts of groups.values()) {
    const geometry = new THREE.BufferGeometry();
    const count = parts.reduce((sum, part) => sum + part.mesh.geometry.attributes.position.count, 0);
    for (const [name, attribute] of Object.entries(parts[0].mesh.geometry.attributes))
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * attribute.itemSize), attribute.itemSize)
        .setUsage(THREE.DynamicDrawUsage));
    const indices: number[] = [];
    let offset = 0;
    for (const { mesh, origin } of parts) {
      const source = mesh.geometry;
      for (let i = 0; i < source.index!.count; i++) indices.push(source.index!.getX(i) + offset);
      slices.set(mesh, { geometry, offset, origin });
      offset += source.attributes.position.count;
      mesh.removeFromParent();
      scope.defer(() => source.dispose());
    }
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, parts[0].mesh.material);
    mesh.name = "route-surface";
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    root.add(mesh);
  }
  function update(mesh: THREE.Mesh) {
    const { geometry, offset, origin } = slices.get(mesh)!;
    for (const [name, source] of Object.entries(mesh.geometry.attributes)) {
      const target = geometry.getAttribute(name) as THREE.BufferAttribute;
      const start = offset * source.itemSize;
      target.array.set(source.array, start);
      if (name === "position") {
        for (let i = 0; i < source.count; i++) target.setXYZ(offset + i,
          source.getX(i) + origin.position.x, source.getY(i) + origin.position.y, source.getZ(i) + origin.position.z);
      }
      target.addUpdateRange(start, source.array.length);
      target.needsUpdate = true;
    }
  }
  sources.forEach(({ mesh }) => update(mesh));
  return { update };
}
