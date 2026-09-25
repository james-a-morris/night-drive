import * as THREE from "./three.ts";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Lifecycle } from "./lifecycle.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";
import type { TrainType } from "./train-types.ts";

function roundedPath<T extends THREE.Path>(path: T, width: number, height: number, radius: number): T {
  const x = width / 2, y = height / 2;
  path.moveTo(-x + radius, -y);
  path.lineTo(x - radius, -y);
  path.quadraticCurveTo(x, -y, x, -y + radius);
  path.lineTo(x, y - radius);
  path.quadraticCurveTo(x, y, x - radius, y);
  path.lineTo(-x + radius, y);
  path.quadraticCurveTo(-x, y, -x, y - radius);
  path.lineTo(-x, -y + radius);
  path.quadraticCurveTo(-x, -y, -x + radius, -y);
  path.closePath();
  return path;
}

function windowFrame(width: number, height: number, border: number, depth: number, radius: number) {
  const shape = roundedPath(new THREE.Shape(), width, height, radius);
  shape.holes.push(roundedPath(new THREE.Path(), width - border * 2, height - border * 2, radius - border));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth, steps: 1, bevelEnabled: true, bevelSize: 0.012,
    bevelThickness: 0.012, bevelSegments: 3, curveSegments: 10,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

// Architectural details stay on the cabin, separate from the sliding glass.
// Shared materials let every window, curtain and roof rib batch together.
export function createCabinSurrounds(parent: THREE.Group, fabric: THREE.Texture, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "warm-window-surrounds";
  parent.add(root);
  const grainCanvas = document.createElement("canvas");
  grainCanvas.width = 256;
  grainCanvas.height = 128;
  const grainContext = grainCanvas.getContext("2d")!;
  grainContext.fillStyle = "#f5ecdc";
  grainContext.fillRect(0, 0, 256, 128);
  // Quiet, continuous grain rather than a noisy texture across the window view.
  for (let row = 0; row < 48; row++) {
    grainContext.strokeStyle = `rgba(111,77,43,${0.045 + (row % 4) * 0.012})`;
    grainContext.lineWidth = row % 3 ? 0.55 : 1.1;
    grainContext.beginPath();
    for (let x = 0; x <= 256; x += 4) {
      const y = row * 2.8 + Math.sin(x / 41 + row * 0.3) * 1.1 + Math.sin(x / 93 + row) * 1.9;
      if (x === 0) grainContext.moveTo(x, y);
      else grainContext.lineTo(x, y);
    }
    grainContext.stroke();
  }
  const grain = new THREE.CanvasTexture(grainCanvas);
  scope.defer(() => grain.dispose());
  grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  grain.anisotropy = 4;
  const wood = new THREE.MeshStandardMaterial({
    color: 0xb1875e, roughness: 0.64, map: grain, bumpMap: grain, bumpScale: 0.002,
    emissive: 0x765133, emissiveIntensity: 0.18,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: 0xd0aa7b, roughness: 0.58, map: grain,
    emissive: 0x96603a, emissiveIntensity: 0.13,
  });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc1a26e, roughness: 0.55, metalness: 0.35 });
  const linen = new THREE.MeshStandardMaterial({
    color: 0xd7c4a0, roughness: 1, bumpMap: fabric, bumpScale: 0.002,
    side: THREE.DoubleSide, emissive: 0x8c7350, emissiveIntensity: 0.12,
  });
  const seam = new THREE.MeshStandardMaterial({ color: 0xb29a71, roughness: 0.95 });
  const cove = new THREE.MeshBasicMaterial({ color: 0xffd19a, toneMapped: false });
  const lining = new THREE.MeshStandardMaterial({
    color: 0xcbb58f, roughness: 1, bumpMap: fabric, bumpScale: 0.001,
    emissive: 0xa6652d, emissiveIntensity: 0.18,
  });
  function add(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  }
  function roundBox(width: number, height: number, depth: number, radius: number,
    material: THREE.Material, x: number, y: number, z: number) {
    return add(new RoundedBoxGeometry(width, height, depth, 2, radius), material, x, y, z);
  }

  const frame = windowFrame(4.78, 1.98, 0.16, 0.17, 0.32);
  const innerLip = windowFrame(4.48, 1.68, 0.033, 0.034, 0.18);
  // The curved shoulders follow the glazed roof, then meet the central headliner.
  const ribProfile = new THREE.Shape();
  ribProfile.moveTo(-2.025, 3.18);
  ribProfile.quadraticCurveTo(-1.96, 3.36, -1.17, 3.65);
  ribProfile.lineTo(1.17, 3.65);
  ribProfile.quadraticCurveTo(1.96, 3.36, 2.025, 3.18);
  ribProfile.lineTo(2.025, 3.055);
  ribProfile.quadraticCurveTo(1.91, 3.25, 1.145, 3.515);
  ribProfile.lineTo(-1.145, 3.515);
  ribProfile.quadraticCurveTo(-1.91, 3.25, -2.025, 3.055);
  ribProfile.closePath();
  const rib = new THREE.ExtrudeGeometry(ribProfile, {
    depth: 0.16, bevelEnabled: true, bevelSize: 0.025,
    bevelThickness: 0.025, bevelSegments: 3, curveSegments: 12,
  });
  rib.translate(0, 0, -0.08);
  for (let joint = 0; joint < 7; joint++) add(rib, wood, 0, 0, 2.4 - joint * 4.8);

  // Pleated cloth narrows at its tieback and fans gently over the sill.
  function curtainPoint(u: number, v: number, side: number, end: number, z: number) {
    const gathered = Math.exp(-Math.pow((v - 0.64) / 0.19, 2));
    const width = 0.43 - gathered * 0.25 + v * 0.035;
    const fold = Math.cos(u * Math.PI * 10) * (0.027 - gathered * 0.018);
    return new THREE.Vector3(
      side * (1.825 + fold - Math.sin(v * Math.PI) * 0.035),
      3.17 - v * 1.51 - Math.sin(u * Math.PI * 5) * 0.015 * v,
      z + end * (2.075 + gathered * 0.055 + (u - 0.5) * width),
    );
  }
  function curtain(side: number, end: number, z: number) {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    const columns = 32, rows = 24;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
      positions.push(...curtainPoint(x / columns, y / rows, side, end, z).toArray());
      uv.push(x / columns * 0.45, y / rows * 1.6);
      if (x < columns && y < rows) {
        const a = y * (columns + 1) + x, b = a + columns + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(geometry, linen, 0, 0, 0);
    for (const v of [0.035, 0.965]) {
      const points = Array.from({ length: 33 }, (_, i) => {
        const point = curtainPoint(i / 32, v, side, end, z);
        point.x -= side * 0.004;
        return point;
      });
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.004, 5, false), seam, 0, 0, 0);
    }
    const tie = curtainPoint(0.5, 0.64, side, end, z);
    roundBox(0.072, 0.052, 0.235, 0.018, seam, side * 1.782, tie.y, tie.z);
    const cord = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 1.738, tie.y, tie.z),
      new THREE.Vector3(side * 1.724, tie.y - 0.09, tie.z - end * 0.025),
      new THREE.Vector3(side * 1.748, tie.y - 0.18, tie.z - end * 0.013),
    ]);
    add(new THREE.TubeGeometry(cord, 8, 0.006, 6, false), seam, 0, 0, 0);
    add(new THREE.ConeGeometry(0.021, 0.067, 10), seam,
      side * 1.748, tie.y - 0.207, tie.z - end * 0.013);
  }

  for (const side of [-1, 1]) {
    // A deep rounded sill, shaped apron and padded rail frame the foreground.
    roundBox(0.38, 0.115, 28.8, 0.052, wood, side * 2.025, 1.49, -12);
    roundBox(0.075, 0.052, 28.8, 0.025, edge, side * 1.845, 1.478, -12);
    roundBox(0.1, 0.12, 28.8, 0.027, wood, side * 1.992, 1.386, -12);
    roundBox(0.11, 0.115, 28.8, 0.05, lining, side * 2.002, 1.295, -12);
    roundBox(0.23, 0.13, 28.8, 0.045, wood, side * 2.02, 3.34, -12);
    roundBox(0.065, 0.045, 28.8, 0.02, edge, side * 1.907, 3.275, -12);
    // The ceiling border conceals an amber strip behind its timber lip.
    roundBox(0.2, 0.1, 28.8, 0.035, wood, side * 1.16, 3.585, -12);
    roundBox(0.15, 0.026, 28.8, 0.01, lining, side * 1.014, 3.592, -12);
    roundBox(0.022, 0.014, 28.8, 0.006, cove, side * 1.058, 3.553, -12);
    for (let row = 0; row < 6; row++) {
      const z = -row * 4.8;
      add(frame, wood, side * 2.035, 2.38, z);
      add(innerLip, edge, side * 1.925, 2.38, z);
      // A short linen valance softens the top edge without covering the view.
      const valance = new THREE.PlaneGeometry(4.35, 0.13, 80, 3);
      const positions = valance.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const along = positions.getX(i), down = positions.getY(i);
        positions.setXYZ(i,
          side * (1.852 + Math.cos(along * 34) * 0.012),
          3.125 + down - (0.065 - down) * 0.18 * Math.cos(along * 2.8),
          z + along,
        );
      }
      valance.computeVertexNormals();
      add(valance, linen, 0, 0, 0);
      for (const end of [-1, 1]) {
        curtain(side, end, z);
        // Curtain poles and rings sit inside the fixed window surround.
        for (let ring = 0; ring < 5; ring++) {
          add(new THREE.TorusGeometry(0.029, 0.006, 6, 12), brass,
            side * 1.825, 3.186, z + end * (1.88 + ring * 0.093));
        }
      }
      roundBox(0.035, 0.035, 4.46, 0.016, brass, side * 1.825, 3.204, z);
    }
  }
  mergeStaticMeshes(root, [...root.children], scope);
  return {
    root,
    setTrainType(type: TrainType) {
      const metro = type === "metro", steam = type === "steam";
      wood.color.set(metro ? 0xa8b9bd : steam ? 0x96613f : 0xb1875e);
      wood.emissive.set(metro ? 0x526a76 : steam ? 0x57341f : 0x765133);
      wood.emissiveIntensity = metro ? 0.08 : 0.18;
      wood.roughness = metro ? 0.38 : 0.64;
      wood.metalness = metro ? 0.55 : 0;
      wood.bumpMap = metro ? null : grain;
      edge.color.set(metro ? 0xd2e0e2 : steam ? 0xcba86e : 0xd0aa7b);
      edge.emissive.set(metro ? 0x698997 : 0x96603a);
      for (const surface of [wood, edge]) {
        const map = metro ? null : grain;
        if (surface.map !== map) {
          surface.map = map;
          surface.needsUpdate = true;
        }
      }
      lining.color.set(metro ? 0xc6d4d6 : steam ? 0xab855e : 0xcbb58f);
      lining.emissive.set(metro ? 0x7196a8 : 0xa6652d);
      cove.color.set(metro ? 0xd8edff : steam ? 0xffc482 : 0xffd19a);
      for (const child of root.children) if (child instanceof THREE.Mesh &&
        [linen, seam, brass].includes(child.material as THREE.MeshStandardMaterial)) child.visible = !metro;
    },
  };
}
