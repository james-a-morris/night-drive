import * as THREE from "./three.ts";
import { roadFrame, roadPoint } from "./drive.ts";
import { tunnelSpan, type SceneryMode } from "./environments.ts";

// Tiny, partly concealed cameos in the unlit galleries on opposite banks.
export const DINOSAUR_SITES = [
  { offset: 210.75, side: -1 },
  { offset: 978.75, side: 1 },
] as const;

export function createDinosaurAlcove() {
  const root = new THREE.Group();
  root.name = "little-dinosaur-alcove";
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const material = (color: number, glow = 0) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.86,
      emissive: color,
      emissiveIntensity: glow,
    });
  const green = material(0x526b57, 0.006);
  const belly = material(0x818b70, 0.004);
  const amber = material(0x8a795e, 0.004);
  const dark = material(0x253d35);
  const cream = material(0xaaa792, 0.003);
  const blush = material(0x806e60, 0.003);
  const stone = material(0x333b39);
  const moss = material(0x3d4935);
  function oval(
    parent: THREE.Group,
    mat: THREE.Material,
    position: number[],
    scale: number[],
    geometry: THREE.BufferGeometry = sphere,
  ) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(scale[0], scale[1], scale[2]);
    parent.add(mesh);
    return mesh;
  }

  // A small pocket behind a real opening in the lining, with no projecting frame.
  const pocket = material(0x262e2c);
  function wall(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      pocket,
    );
    mesh.position.set(x, y, z);
    root.add(mesh);
  }
  wall(-0.76, 1.45, -0.65, 0.12, 0.9, 2.3);
  wall(0.76, 1.45, -0.65, 0.12, 0.9, 2.3);
  wall(0, 1.06, -0.65, 1.64, 0.12, 2.3);
  wall(0, 1.84, -0.65, 1.64, 0.12, 2.3);
  wall(0, 1.45, -1.8, 1.64, 0.9, 0.12);
  oval(root, stone, [0, 1.13, -0.9], [0.65, 0.06, 0.6], rock);
  oval(root, moss, [0, 1.17, -0.9], [0.38, 0.015, 0.35]);
  // Broken rock narrows the mouth and hides most of the body at passing angles.
  for (const side of [-1, 1]) {
    const lip = oval(
      root,
      stone,
      [side * 0.74, 1.45, 0.32],
      [0.22, 0.48, 0.22],
      rock,
    );
    lip.rotation.z = side * 0.23;
  }
  for (let i = 0; i < 3; i++) {
    const lip = oval(
      root,
      stone,
      [-0.48 + i * 0.45, 1.88 + (i % 2) * 0.025, 0.32],
      [0.4, 0.11, 0.22],
      rock,
    );
    lip.rotation.z = 0.2 - i * 0.19;
  }
  oval(root, stone, [-0.25, 1.12, 0.26], [0.65, 0.17, 0.24], rock);

  // An uneven stone mouth covers the square construction behind the lining.
  const mouth = new THREE.Shape();
  mouth.moveTo(-0.8, -0.45);
  mouth.lineTo(0.8, -0.45);
  mouth.lineTo(0.8, 0.36);
  mouth.lineTo(-0.8, 0.36);
  mouth.closePath();
  const opening = new THREE.Path();
  opening.moveTo(-0.54, -0.12);
  opening.lineTo(-0.38, -0.3);
  opening.lineTo(0.12, -0.27);
  opening.lineTo(0.5, -0.15);
  opening.lineTo(0.57, 0.24);
  opening.lineTo(0.3, 0.29);
  opening.lineTo(-0.24, 0.31);
  opening.lineTo(-0.57, 0.24);
  opening.closePath();
  mouth.holes.push(opening);
  const lip = new THREE.Mesh(
    new THREE.ShapeGeometry(mouth),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color().setRGB(0.004, 0.006, 0.0085),
      side: THREE.DoubleSide,
    }),
  );
  lip.position.set(0, 1.5, 0.49);
  root.add(lip);

  const dinosaur = new THREE.Group();
  dinosaur.name = "little-tunnel-dinosaur";
  dinosaur.position.set(0.04, 1.18, -0.65);
  dinosaur.scale.setScalar(0.32);
  dinosaur.rotation.y = -0.2;
  root.add(dinosaur);
  oval(dinosaur, green, [0, 0.69, -0.18], [0.54, 0.48, 0.69]);
  oval(dinosaur, belly, [0, 0.61, 0.36], [0.38, 0.36, 0.22]);
  for (const side of [-1, 1])
    for (const z of [-0.49, 0.26]) {
      oval(dinosaur, green, [side * 0.37, 0.27, z], [0.18, 0.27, 0.22]);
      for (const toe of [-1, 1])
        oval(
          dinosaur,
          belly,
          [side * 0.37 + toe * 0.055, 0.1, z + 0.18],
          [0.04, 0.047, 0.055],
        );
    }
  // A curled, tapering tail and soft plates make the dinosaur readable in silhouette.
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const tail = oval(
      dinosaur,
      green,
      [0.38 * t * t, 0.63 - Math.sin(t * Math.PI) * 0.13, -0.68 - t * 0.67],
      [0.23 * (1 - t) + 0.045, 0.18 * (1 - t) + 0.045, 0.25 - t * 0.14],
    );
    tail.rotation.y = -t * 0.6;
  }
  for (let i = 0; i < 5; i++) {
    const z = -0.95 + i * 0.26;
    oval(
      dinosaur,
      amber,
      [0, 0.83 + Math.sin((i / 4) * Math.PI) * 0.45, z],
      [0.09, 0.18 + Math.sin((i / 4) * Math.PI) * 0.08, 0.13],
    );
  }
  oval(dinosaur, green, [0, 1.01, 0.4], [0.3, 0.4, 0.32]);
  const head = new THREE.Group();
  head.name = "dinosaur-head";
  head.position.set(0, 1.33, 0.64);
  dinosaur.add(head);
  oval(head, green, [0, 0, 0], [0.43, 0.37, 0.39]);
  oval(head, belly, [0, -0.16, 0.29], [0.32, 0.17, 0.24]);
  for (const side of [-1, 1]) {
    oval(head, cream, [side * 0.25, 0.07, 0.29], [0.11, 0.13, 0.065]);
    oval(head, dark, [side * 0.25, 0.075, 0.345], [0.056, 0.075, 0.025]);
    oval(
      head,
      cream,
      [side * 0.25 - 0.016, 0.105, 0.366],
      [0.018, 0.023, 0.01],
    );
    oval(head, blush, [side * 0.33, -0.07, 0.25], [0.065, 0.04, 0.035]);
    oval(head, dark, [side * 0.095, -0.09, 0.51], [0.022, 0.017, 0.013]);
  }
  const smile = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.13, -0.2, 0.495),
    new THREE.Vector3(0, -0.24, 0.514),
    new THREE.Vector3(0.13, -0.2, 0.495),
  ]);
  head.add(
    new THREE.Mesh(new THREE.TubeGeometry(smile, 8, 0.009, 5, false), dark),
  );
  // A concealed, very short-range glow reveals the face without lighting the gallery.
  const nookLight = new THREE.PointLight(0xffd9ad, 0.18, 1.5, 2);
  nookLight.name = "dinosaur-inlet-glow";
  nookLight.position.set(-0.22, 1.96, -0.05);
  root.add(nookLight);

  // Rounded parts share a draw per material.
  root.updateMatrixWorld(true);
  const batches = new Map<string, THREE.Mesh[]>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
      return;
    const key = `${object.geometry.uuid}:${object.material.uuid}`;
    const parts = batches.get(key) ?? [];
    parts.push(object);
    batches.set(key, parts);
  });
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const batch = new THREE.InstancedMesh(
      parts[0].geometry,
      parts[0].material,
      parts.length,
    );
    batch.name = "dinosaur-alcove-details";
    parts.forEach((part, index) => {
      batch.setMatrixAt(index, part.matrixWorld);
      part.removeFromParent();
    });
    batch.computeBoundingSphere();
    root.add(batch);
  }
  return root;
}

export function createTunnelDinosaurs(world: THREE.Group) {
  const root = new THREE.Group();
  root.name = "tunnel-dinosaur-outcroppings";
  world.add(root);
  const model = createDinosaurAlcove();
  const encounters = DINOSAUR_SITES.map((site, index) => {
    const object = index === 0 ? model : model.clone(true);
    root.add(object);
    return { ...site, object };
  });
  return {
    root,
    update(progress: number, mode: SceneryMode) {
      const span = tunnelSpan(progress, mode);
      root.visible = span !== null;
      if (!span) return;
      for (const encounter of encounters) {
        const station = span.start + encounter.offset;
        encounter.object.visible = Math.abs(station - progress) < 180;
        if (!encounter.object.visible) continue;
        const point = roadPoint(station, encounter.side * 8.25);
        encounter.object.position.set(point.x, 0, point.z);
        encounter.object.scale.x = roadFrame(station).length;
        encounter.object.rotation.y =
          roadFrame(station).heading - (encounter.side * Math.PI) / 2;
      }
    },
  };
}
