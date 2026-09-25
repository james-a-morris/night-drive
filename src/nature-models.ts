import * as THREE from "./three.ts";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import type { NatureKind } from "./nature-layout.ts";

type XYZ = [number, number, number];

// Original carriage-side flora. Solid, softly shaded forms keep their silhouette
// through rain and at a distance, without alpha-cutout leaf textures.
export function createNatureModels(distant = false) {
  const root = new THREE.Group();
  root.name = "night-line-nature-models";
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide,
  });
  let pieces: THREE.BufferGeometry[] = [];

  function paint(geometry: THREE.BufferGeometry, hex: number) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    geo.deleteAttribute("uv");
    const color = new THREE.Color(hex);
    const normals = geo.attributes.normal;
    const colors = new Float32Array(normals.count * 3);
    for (let i = 0; i < normals.count; i++) {
      const shade = 0.92 + normals.getY(i) * 0.08;
      colors.set([color.r * shade, color.g * shade, color.b * shade], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    pieces.push(geo);
  }

  function branch(points: XYZ[], radius: number, color: number, tip = 0.018) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const rings = distant ? 3 : 8, sides = distant ? 4 : 7;
    const geometry = new THREE.TubeGeometry(curve, rings, 1, sides, false);
    const positions = geometry.attributes.position;
    for (let ring = 0; ring <= rings; ring++) {
      const t = ring / rings;
      const center = curve.getPointAt(t);
      const width = radius * (1 - t) + tip * t;
      for (let j = 0; j <= sides; j++) {
        const i = ring * (sides + 1) + j;
        positions.setXYZ(i,
          center.x + (positions.getX(i) - center.x) * width,
          center.y + (positions.getY(i) - center.y) * width,
          center.z + (positions.getZ(i) - center.z) * width);
      }
    }
    geometry.computeVertexNormals();
    paint(geometry, color);
  }

  function crown(position: XYZ, size: XYZ, color: number, seed: number) {
    const raw = new THREE.IcosahedronGeometry(1, distant ? 1 : 2);
    raw.deleteAttribute("uv");
    raw.deleteAttribute("normal");
    const geometry = mergeVertices(raw);
    raw.dispose();
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i);
      const radius = 1 + Math.sin(x * 4 + z * 3 + seed) * 0.085
        + Math.cos(y * 5 - z * 4 + seed * 2) * 0.055;
      vertices.setXYZ(i, x * radius, y * radius, z * radius);
    }
    geometry.computeVertexNormals();
    geometry.scale(...size);
    geometry.translate(...position);
    paint(geometry, color);
  }

  function blossom(x: number, y: number, z: number, color: number, radius: number) {
    const points: number[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5;
      points.push(x, y + radius * 0.1, z,
        x + Math.cos(angle - 0.4) * radius, y, z + Math.sin(angle - 0.4) * radius,
        x + Math.cos(angle + 0.4) * radius, y, z + Math.sin(angle + 0.4) * radius);
    }
    const petals = new THREE.BufferGeometry();
    petals.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    petals.computeVertexNormals(); paint(petals, color);
  }

  function tree(kind: NatureKind, tall: boolean, broad: boolean, warm: boolean) {
    const bark = broad ? 0x66594b : 0x969586;
    const greens = warm ? [0x72785a, 0x828462, 0x8a8a68] : [0x4c6b5b, 0x5d7b64, 0x6a846c];
    const height = tall ? 7.6 : broad ? 6 : 6.4;
    branch([[0, 0, 0], [-0.13, height * 0.28, 0.08], [0.2, height * 0.62, -0.04], [0.12, height * 0.91, 0]], broad ? 0.23 : 0.14, bark);
    const lobes: [XYZ, XYZ][] = broad ? [
      [[-1.3, 3.75, 0.15], [1.65, 0.95, 1.35]],
      [[1.28, 4.25, 0.05], [1.7, 1.05, 1.35]],
      [[0.15, 4.5, -1.05], [1.5, 0.95, 1.35]],
      [[-0.65, 5.1, -0.15], [1.45, 1, 1.2]],
      [[0.65, 5.6, 0.05], [1.3, 0.95, 1.15]],
    ] : [
      [[-0.72, height * 0.48, 0.1], [1.15, 0.78, 0.95]],
      [[0.75, height * 0.61, 0.04], [1.2, 0.87, 1]],
      [[-0.4, height * 0.72, -0.35], [1.2, 0.95, 1]],
      [[0.22, height * 0.87, 0], [0.95, 1.05, 0.88]],
    ];
    lobes.forEach(([position, size], i) => {
      branch([[0, position[1] * 0.65, 0], [position[0] * 0.6, position[1] - 0.55, position[2] * 0.6], position], broad ? 0.09 : 0.055, bark);
      crown(position, size, greens[i % greens.length], i + (tall ? 5 : 1));
    });
    finish(kind);
  }

  function finish(kind: NatureKind) {
    const geometry = mergeGeometries(pieces)!;
    geometry.computeBoundingBox();
    geometry.translate(0, -geometry.boundingBox!.min.y, 0);
    for (const piece of pieces) piece.dispose();
    pieces = [];
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = kind;
    root.add(mesh);
  }

  tree("birch", false, false, false);
  tree("birch-tall", true, false, false);
  tree("broadleaf", false, true, false);
  tree("maple", false, true, true);
  if (distant) return root;
  for (const flowering of [false, true]) {
    // Broad, low shrubs: two smooth masses with a quiet, nearly uniform colour.
    // No overlapping leaf clusters, petal spheres or fine stems.
    for (let i = 0; i < 2; i++) {
      const shrub = new THREE.SphereGeometry(1, 8, 4);
      shrub.scale(i === 0 ? 1.05 : 0.75, i === 0 ? 0.48 : 0.37, 0.7);
      shrub.translate(i === 0 ? -0.35 : 0.65, i === 0 ? 0.45 : 0.34, i * 0.12);
      paint(shrub, i === 0 ? 0x556e59 : 0x59735d);
    }
    if (flowering) {
      const buds = new THREE.BufferGeometry();
      buds.setAttribute("position", new THREE.Float32BufferAttribute([
        -0.55, 0.89, 0.12, -0.4, 0.94, 0.06, -0.35, 0.89, 0.22,
        0.1, 0.86, -0.1, 0.2, 0.9, -0.2, 0.28, 0.86, -0.06,
      ], 3));
      buds.computeVertexNormals(); paint(buds, 0x929b80);
    }
    finish(flowering ? "flower-bush" : "bush");
  }
  for (const blue of [false, true]) {
    for (let i = 0; i < 2; i++) {
      const x = Math.sin(i * 2.4) * 0.22, z = Math.cos(i * 2.4) * 0.2;
      const height = 0.32 + (i % 3) * 0.09;
      branch([[x, 0, z], [x + 0.025, height * 0.6, z], [x + 0.04, height, z]], 0.011, 0x596d50, 0.006);
      blossom(x + 0.04, height, z, blue ? 0x8b9fa7 : 0xb9b39a, 0.07);
    }
    finish(blue ? "blue-flowers" : "flowers");
  }
  // Broad curved blades, with a central ridge to catch the moonlight.
  for (let blade = 0; blade < 5; blade++) {
    const angle = blade * 2.4;
    const vertices: number[] = [], indices: number[] = [];
    const height = 0.32 + (blade % 4) * 0.085;
    for (let row = 0; row <= 2; row++) {
      const t = row / 2, width = Math.sin(Math.PI * t) * 0.038 + 0.002;
      for (let side = -1; side <= 1; side++)
        vertices.push(Math.cos(angle) * t * t * 0.34 + Math.sin(angle) * side * width,
          Math.sin(t * 1.7) * height + (side === 0 ? width * 0.3 : 0),
          Math.sin(angle) * t * t * 0.34 - Math.cos(angle) * side * width);
      if (row < 2) for (let side = 0; side < 2; side++) {
        const a = row * 3 + side;
        indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    paint(geometry, blade % 2 ? 0x6b7c59 : 0x596e52);
  }
  finish("grass");
  return root;
}
