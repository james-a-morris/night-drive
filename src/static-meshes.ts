import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Lifecycle } from "./lifecycle.ts";

// Only explicitly selected, rigid parts are baked. Moving windows, bogies,
// characters and transparent surfaces retain their own objects and transforms.
export function mergeStaticMeshes(root: THREE.Object3D, sources: THREE.Object3D[], scope: Lifecycle) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, THREE.Mesh[]>();
  for (const source of sources) {
    if (!(source instanceof THREE.Mesh) || source instanceof THREE.SkinnedMesh ||
      source instanceof THREE.InstancedMesh || Array.isArray(source.material) ||
      source.material.transparent || !source.visible || Object.keys(source.geometry.morphAttributes).length) continue;
    const attributes = Object.keys(source.geometry.attributes).sort().map(name => {
      const attribute = source.geometry.getAttribute(name);
      return `${name}:${attribute.itemSize}:${attribute.normalized}`;
    }).join(",");
    const key = `${source.material.uuid}:${source.layers.mask}:${source.renderOrder}:${source.castShadow}:${source.receiveShadow}:${attributes}`;
    const group = groups.get(key) ?? []; group.push(source); groups.set(key, group);
  }
  const retired = new Set<THREE.BufferGeometry>();
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      return geometry;
    });
    const geometry = mergeGeometries(parts);
    let start = 0;
    const regions = geometry ? parts.map(part => {
      part.computeBoundingBox();
      const count = part.getAttribute("position").count;
      const region = { bounds: part.boundingBox!, start, count };
      start += count;
      return region;
    }) : [];
    parts.forEach(part => part.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const first = meshes[0], batch = new THREE.Mesh(geometry, first.material);
    batch.name = "static-detail-batch";
    batch.layers.mask = first.layers.mask; batch.renderOrder = first.renderOrder;
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.matrixAutoUpdate = false;
    // A batch can span both sides of the carriage. Its single bounding sphere
    // admits rays through the aisle, making hover checks scan every triangle.
    // Keep each source's bounds and test only the crossed pieces of the batch.
    const localRay = new THREE.Ray(), inverseWorld = new THREE.Matrix4();
    batch.raycast = (raycaster, intersections) => {
      localRay.copy(raycaster.ray).applyMatrix4(inverseWorld.copy(batch.matrixWorld).invert());
      const { start, count } = geometry.drawRange;
      try {
        for (const region of regions) {
          if (!localRay.intersectsBox(region.bounds)) continue;
          const from = Math.max(start, region.start);
          const to = Math.min(start + count, region.start + region.count);
          if (to <= from) continue;
          geometry.setDrawRange(from, to - from);
          THREE.Mesh.prototype.raycast.call(batch, raycaster, intersections);
        }
      } finally {
        geometry.setDrawRange(start, count);
      }
    };
    for (const mesh of meshes) { retired.add(mesh.geometry); mesh.removeFromParent(); }
    root.add(batch);
  }
  // Source geometries may be shared with parts outside this batch.
  scope.defer(() => retired.forEach(geometry => geometry.dispose()));
}
