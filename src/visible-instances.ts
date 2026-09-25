import * as THREE from "./three.ts";

export interface VisibleInstance {
  matrix: THREE.Matrix4;
  color: THREE.Color;
  bounds: THREE.Sphere;
  minDistance?: number;
  maxDistance?: number;
}

// Three culls an InstancedMesh as one object. A batch spanning the whole route
// otherwise draws every tree, including the ones behind the passenger. Keep
// the resident scenery, but submit only instances intersecting the actual view.
export function createInstanceView() {
  const matrix = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const eye = new THREE.Vector3();
  return {
    update(camera: THREE.Camera, root: THREE.Object3D) {
      root.updateWorldMatrix(true, false);
      matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(root.matrixWorld);
      frustum.setFromProjectionMatrix(matrix);
      eye.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse.copy(root.matrixWorld).invert());
    },
    includes(instance: VisibleInstance) {
      if (!frustum.intersectsSphere(instance.bounds)) return false;
      const distance = eye.distanceTo(instance.bounds.center);
      return distance + instance.bounds.radius >= (instance.minDistance ?? 0) &&
        distance - instance.bounds.radius <= (instance.maxDistance ?? Infinity);
    },
  };
}

export function createVisibleInstances(mesh: THREE.InstancedMesh) {
  let instances: VisibleInstance[] = [];
  let dirty = true;
  const previous: number[] = [];
  const selected: number[] = [];
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  return {
    mesh,
    setInstances(next: VisibleInstance[]) { instances = next; dirty = true; },
    update(view: ReturnType<typeof createInstanceView>) {
      selected.length = 0;
      for (let i = 0; i < instances.length; i++) if (view.includes(instances[i])) selected.push(i);
      if (!dirty && previous.length === selected.length && selected.every((index, i) => previous[i] === index)) return;
      dirty = false;
      mesh.count = selected.length;
      mesh.visible = mesh.count > 0;
      previous.length = selected.length;
      for (let i = 0; i < selected.length; i++) {
        const index = selected[i], instance = instances[index];
        mesh.setMatrixAt(i, instance.matrix);
        mesh.setColorAt(i, instance.color);
        previous[i] = index;
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
