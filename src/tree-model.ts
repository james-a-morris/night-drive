import * as THREE from "./three.ts";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TREE_VARIETIES } from "./tree-varieties.ts";

// Each specimen is baked into at most five meshes; a full table stays inexpensive to draw.
export function createTreeModel(variety: number) {
  const v = TREE_VARIETIES[variety] ?? TREE_VARIETIES[0];
  const object = new THREE.Group();
  object.name = v.name;
  const crown = new THREE.Group();
  crown.position.y = 0.157;
  object.add(crown);
  const parts: THREE.Mesh[] = [];
  const materials = [v.pot, v.bark, v.leaf, v.accent, 0x443b2b].map(
    (color) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        flatShading: true,
      }),
  );
  function add(
    geometry: THREE.BufferGeometry,
    material: number,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    rz = 0,
    ry = 0,
  ) {
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(0, ry, rz);
    (material === 0 || material === 4 ? object : crown).add(mesh);
    parts.push(mesh);
    return mesh;
  }
  add(new THREE.CylinderGeometry(0.1, 0.072, 0.15, 12), 0, 0, 0.078, 0);
  const lip = add(new THREE.TorusGeometry(0.097, 0.008, 6, 16), 0, 0, 0.155, 0);
  lip.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.089, 0.089, 0.006, 12), 4, 0, 0.151, 0);
  const height = 0.49 + v.variant * 0.025;
  const blob = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    accent = false,
    rz = 0,
    ry = 0,
  ) =>
    add(
      new THREE.IcosahedronGeometry(1, 1),
      accent ? 3 : 2,
      x,
      y,
      z,
      sx,
      sy,
      sz,
      rz,
      ry,
    );
  function branch(
    x: number,
    y: number,
    z: number,
    xx: number,
    yy: number,
    zz: number,
    radius = 0.012,
  ) {
    const start = new THREE.Vector3(x, y, z),
      end = new THREE.Vector3(xx, yy, zz),
      direction = end.clone().sub(start);
    const mesh = add(
      new THREE.CylinderGeometry(radius * 0.6, radius, direction.length(), 7),
      1,
      ...start.add(end).multiplyScalar(0.5).toArray(),
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
  }
  if (v.form === "flower") {
    const petals = [10, 6, 5, 12, 6][v.variant];
    for (let flower = 0; flower < 3; flower++) {
      const x = (flower - 1) * 0.095,
        z = flower === 1 ? -0.03 : 0.02;
      const y = height * (flower === 1 ? 1 : 0.7);
      branch(x * 0.3, 0, 0, x, y, z, 0.008);
      for (let leaf = 0; leaf < 2; leaf++) {
        const side = leaf ? -1 : 1;
        add(
          new THREE.IcosahedronGeometry(1, 1),
          1,
          x + side * 0.035,
          y * (0.35 + leaf * 0.2),
          z,
          0.075,
          0.018,
          0.032,
          side * 0.45,
        );
      }
      for (let petal = 0; petal < petals; petal++) {
        const a = (petal * Math.PI * 2) / petals;
        const cup = v.variant === 1;
        blob(
          x + Math.cos(a) * 0.053,
          y + (cup ? 0.028 : 0),
          z + Math.sin(a) * 0.053,
          cup ? 0.043 : 0.076,
          cup ? 0.083 : 0.025,
          0.04,
          false,
          cup ? -0.3 : -0.1,
          -a,
        );
      }
      blob(x, y + 0.024, z, 0.036, 0.023, 0.036, true);
    }
  } else if (v.form === "succulent") {
    if (v.variant === 2) {
      for (let i = 0; i < 5; i++) {
        const a = i * 2.4,
          x = Math.cos(a) * 0.07,
          z = Math.sin(a) * 0.07;
        const y = 0.14 + i * 0.055;
        branch(0, 0, 0, x, y, z, 0.018);
        for (const side of [-1, 1])
          blob(x + side * 0.045, y, z, 0.072, 0.035, 0.05, false, side * 0.35);
      }
    } else {
      for (let ring = 0; ring < 3; ring++)
        for (let leaf = 0; leaf < 7; leaf++) {
          const a = (leaf * Math.PI * 2) / 7 + ring * 0.45;
          const radius = 0.075 - ring * 0.018;
          const pointed = v.variant === 1 || v.variant === 4;
          blob(
            Math.cos(a) * radius,
            0.035 + ring * 0.045,
            Math.sin(a) * radius,
            pointed ? 0.16 - ring * 0.025 : 0.115 - ring * 0.02,
            pointed ? 0.023 : 0.047,
            pointed ? 0.029 : 0.056,
            false,
            -0.25 - ring * 0.25,
            -a,
          );
        }
    }
  } else if (v.form === "cactus") {
    const tall = v.variant === 0 || v.variant === 2 || v.variant === 3;
    blob(
      0,
      tall ? 0.19 : 0.12,
      0,
      0.08 + (tall ? 0 : 0.045),
      tall ? 0.22 : 0.14,
      v.variant === 2 ? 0.045 : 0.085,
    );
    if (v.variant === 0 || v.variant === 2)
      for (const side of [-1, 1]) {
        blob(side * 0.085, 0.19, 0, 0.08, 0.037, 0.04);
        blob(side * 0.12, 0.27 + side * 0.03, 0, 0.042, 0.12, 0.038);
      }
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4;
      blob(
        Math.cos(a) * (tall ? 0.077 : 0.113),
        0.07 + (i % 4) * 0.066,
        Math.sin(a) * 0.079,
        0.009,
        0.018,
        0.009,
        true,
      );
    }
    const y = tall ? 0.415 : 0.25;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      blob(
        Math.cos(a) * 0.026,
        y,
        Math.sin(a) * 0.026,
        0.036,
        v.variant === 3 ? 0.046 : 0.017,
        0.023,
        true,
        0,
        -a,
      );
    }
  } else if (v.form === "fern") {
    for (let frond = 0; frond < 7; frond++) {
      const a = (frond * Math.PI * 2) / 7;
      for (let step = 1; step < 6; step++) {
        const t = step / 5,
          r = t * 0.23;
        const x = Math.cos(a) * r,
          z = Math.sin(a) * r,
          y = Math.sin(t * 2.2) * (0.27 + v.variant * 0.015);
        const prev = (step - 1) / 5;
        branch(
          Math.cos(a) * prev * 0.23,
          Math.sin(prev * 2.2) * (0.27 + v.variant * 0.015),
          Math.sin(a) * prev * 0.23,
          x,
          y,
          z,
          0.004,
        );
        for (const side of [-1, 1])
          blob(
            x + Math.sin(a) * side * 0.028,
            y,
            z - Math.cos(a) * side * 0.028,
            v.variant === 2 ? 0.075 : 0.044,
            0.011,
            v.variant === 0 ? 0.033 : 0.018,
            false,
            0.2,
            -a + side * 0.65,
          );
      }
    }
  } else if (v.form === "mushroom") {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 0.085,
        z = i === 1 ? -0.035 : 0.035,
        y = i === 1 ? 0.3 : 0.18;
      branch(x, 0, z, x + 0.012, y, z, 0.024);
      const cap = add(
        new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        2,
        x + 0.012,
        y,
        z,
        i === 1 ? 0.15 : 0.105,
        v.variant === 4 ? 0.19 : v.variant === 3 ? 0.035 : 0.085,
        i === 1 ? 0.13 : 0.095,
      );
      const underside = add(
        new THREE.CircleGeometry(1, 12),
        3,
        x + 0.012,
        y,
        z,
        cap.scale.x,
        cap.scale.z,
        1,
      );
      underside.rotation.x = Math.PI / 2;
      for (let dot = 0; dot < 6; dot++) {
        const a = dot * 2.4,
          radius = dot % 2 ? 0.045 : 0.065;
        blob(
          x + 0.012 + Math.cos(a) * radius,
          y + cap.scale.y * 0.86,
          z + Math.sin(a) * radius,
          0.015,
          0.007,
          0.013,
          true,
        );
      }
    }
  } else {
    branch(0, 0, 0, 0.018, height, 0, 0.018);
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4 + v.variant * 0.4;
      const x = Math.cos(angle),
        z = Math.sin(angle);
      if (v.form === "palm") {
        branch(0, height * 0.82, 0, x * 0.2, height + 0.015, z * 0.2, 0.007);
        blob(
          x * 0.13,
          height + 0.025,
          z * 0.13,
          0.24,
          0.028,
          0.068,
          false,
          -0.16,
          -angle,
        );
        blob(x * 0.045, height * 0.82, z * 0.045, 0.032, 0.034, 0.032, true);
      } else if (v.form === "spiral") {
        branch(0, i * 0.095, 0, x * 0.075, 0.17 + i * 0.095, z * 0.075);
        blob(
          x * 0.075,
          0.18 + i * 0.095,
          z * 0.075,
          0.11 - i * 0.007,
          0.08,
          0.11 - i * 0.007,
        );
      } else {
        const y = height - 0.11 + (i % 3) * 0.065,
          spread = 0.11;
        branch(0, y * 0.55, 0, x * spread, y, z * spread, 0.01);
        blob(
          x * spread,
          y,
          z * spread,
          0.14,
          0.125,
          0.125,
          v.form === "blossom" && i % 2 === 0,
        );
        if (v.form === "willow")
          for (let j = 0; j < 3; j++) {
            const a = angle + (j - 1) * 0.38;
            blob(
              Math.cos(a) * 0.18,
              y - 0.125,
              Math.sin(a) * 0.18,
              0.033,
              0.18,
              0.033,
            );
          }
        if (v.form === "blossom" || v.form === "round")
          blob(
            x * (spread + 0.035),
            y + 0.06,
            z * (spread + 0.035),
            0.038,
            0.039,
            0.035,
            true,
          );
      }
    }
  }
  for (const parent of [object, crown]) {
    parent.updateMatrix();
    for (const material of materials) {
      const sources = parts.filter(
        (mesh) => mesh.parent === parent && mesh.material === material,
      );
      if (!sources.length) continue;
      const geometries = sources.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index
          ? mesh.geometry.toNonIndexed()
          : mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrix);
        return geometry;
      });
      const merged = mergeGeometries(geometries)!;
      geometries.forEach((geometry) => geometry.dispose());
      sources.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.removeFromParent();
      });
      parent.add(new THREE.Mesh(merged, material));
    }
  }
  for (const material of materials)
    if (!parts.some((mesh) => mesh.material === material)) material.dispose();
  return { object, crown };
}
export function disposeTree(object: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  object.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      part.geometry.dispose();
      for (const material of Array.isArray(part.material)
        ? part.material
        : [part.material])
        materials.add(material);
    }
  });
  materials.forEach((material) => material.dispose());
  object.removeFromParent();
}
