import type { EnvironmentSource } from "./environments.ts";
import type { TreeGardenController } from "./tree-garden.ts";
import { blendEnvironment } from "./environments.ts";
import { radialTexture } from "./textures.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { EnvironmentWeights } from "./environments.ts";
import type { SceneSettings } from "./main.ts";
type XYZ = [number, number, number];
import { reducedMotion } from "./motion.ts";
import * as THREE from "./three.ts";
import { createWindowRain } from "./window-rain.ts";
import { createPottedTree } from "./potted-tree.ts";
import { createCabinSurrounds } from "./cabin-surrounds.ts";
import { createCabinStyleDetails } from "./cabin-styles.ts";
import { TRAIN_PALETTES, type TrainType } from "./train-types.ts";
import { advanceWindowSlide, createWindowSlide } from "./window-motion.ts";
import { createWindowHandle } from "./window-handle.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";

export function createStudyCabin(scope: Lifecycle, garden: TreeGardenController) {
  const rig = new THREE.Group();
  rig.name = "train-study-cabin";
  rig.userData.trainType = "classic";
  const nook = new THREE.Group();
  rig.add(nook);
  const material = (
    color: THREE.ColorRepresentation,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const fabricCanvas = document.createElement("canvas");
  fabricCanvas.width = fabricCanvas.height = 128;
  const fabricContext = fabricCanvas.getContext("2d")!;
  fabricContext.fillStyle = "#888";
  fabricContext.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    for (let x = 0; x < 128; x += 2) {
      fabricContext.fillStyle = (x + y) % 4 ? "#777" : "#999";
      fabricContext.fillRect(x, y, 1, 2);
    }
  }
  const fabric = new THREE.CanvasTexture(fabricCanvas);
  fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
  fabric.repeat.set(5, 5);
  const upholstery = material(0xa29377, { bumpMap: fabric, bumpScale: 0.0015 });
  const headliner = material(0xb7aa8c, { bumpMap: fabric, bumpScale: 0.001 });
  const dash = material(0x9e8160, { bumpMap: fabric, bumpScale: 0.0008 });
  const walnut = material(0x72543e);
  const dark = material(0x3b4037);
  const brass = material(0xb49b68, { metalness: 0.3, roughness: 0.6 });
  const cream = material(0xd4c7a6);
  // Sample the painted material surfaces from the cabin artwork. The geometry
  // remains three dimensional; the painting supplies the warmth and grain.
  const paintedTextures: THREE.Texture[] = [];
  scope.defer(() => paintedTextures.forEach(texture => texture.dispose()));
  const artwork = new THREE.TextureLoader().load(
    "/assets/train-cabin.png",
    () => {
      if (!scope.signal.aborted)
        for (const texture of paintedTextures) texture.needsUpdate = true;
    },
  );
  scope.defer(() => artwork.dispose());
  artwork.colorSpace = THREE.SRGBColorSpace;
  function paintedTexture(x: number, y: number, width: number, height: number) {
    // Texture.clone marks an empty source for upload before the image is ready.
    const texture = new THREE.Texture();
    texture.source = artwork.source;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.offset.set(x, 1 - y - height);
    texture.repeat.set(width, height);
    paintedTextures.push(texture);
    return texture;
  }
  dash.map = paintedTexture(0.32, 0.835, 0.37, 0.12);
  dash.color.set(0xffffff);
  walnut.map = paintedTexture(0.3, 0.739, 0.4, 0.044);
  walnut.color.set(0xe4d2b3);

  function mesh(
    geometry: THREE.BufferGeometry,
    surface: THREE.Material,
    position: XYZ,
    parent: THREE.Object3D = nook,
  ) {
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(...position);
    parent.add(object);
    return object;
  }
  function softBox(
    size: XYZ,
    position: XYZ,
    surface: THREE.Material = upholstery,
    parent: THREE.Object3D = nook,
    radius = 0.014,
  ) {
    const [width, height, depth] = size;
    const x = -width / 2 + radius,
      y = -height / 2 + radius;
    const shape = new THREE.Shape();
    shape.moveTo(x, y);
    shape.lineTo(-x, y);
    shape.lineTo(-x, -y);
    shape.lineTo(x, -y);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(0.001, depth - radius * 2),
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: radius,
      bevelThickness: radius,
    });
    geometry.translate(0, 0, -depth / 2 + radius);
    const positions = geometry.attributes.position,
      normals = geometry.attributes.normal,
      uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      if (Math.abs(normals.getZ(i)) > 0.5)
        uv.setXY(i, x / width + 0.5, y / height + 0.5);
      else if (Math.abs(normals.getY(i)) > 0.5)
        uv.setXY(i, x / width + 0.5, z / depth + 0.5);
      else uv.setXY(i, z / depth + 0.5, y / height + 0.5);
    }
    return mesh(geometry, surface, position, parent);
  }
  function beam(
    from: XYZ,
    to: XYZ,
    radius: number,
    surface: THREE.Material = upholstery,
    parent: THREE.Object3D = nook,
  ) {
    const a = new THREE.Vector3(...from),
      b = new THREE.Vector3(...to);
    const object = mesh(
      new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 12),
      surface,
      a.clone().add(b).multiplyScalar(0.5).toArray(),
      parent,
    );
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.sub(a).normalize(),
    );
    return object;
  }
  function line(
    points: XYZ[],
    color: THREE.ColorRepresentation,
    opacity = 1,
    parent: THREE.Object3D = nook,
  ) {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(...p)),
    );
    const object = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(curve.getPoints(40)),
      new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
    );
    parent.add(object);
    return object;
  }

  // A long observation carriage. The camera sits at a table facing forward,
  // with empty seats ahead and panoramic windows on both sides.
  const seatFabric = material(0x819583, { bumpMap: fabric, bumpScale: 0.003 });
  const seatPocket = material(0x927252, { roughness: 0.78 });
  const linen = material(0xd2c5a6, { bumpMap: fabric, bumpScale: 0.002 });
  const panel = material(0x59665a, { roughness: 0.76 });
  const piping = material(0xac9b75, { bumpMap: fabric, bumpScale: 0.001 });
  const floor = walnut.clone();
  const carpet = material(0x536052, { bumpMap: fabric, bumpScale: 0.002 });
  const runner = material(0x8b9277, { bumpMap: fabric, bumpScale: 0.002 });
  softBox([4.25, 0.15, 31], [0, 0.73, -12], floor, nook, 0.03);
  softBox([2.45, 0.12, 31], [0, 3.67, -12], headliner, nook, 0.04);
  softBox(
    [0.84, 0.012, 30],
    [0, 0.814, -12],
    carpet,
    nook,
    0.004,
  );
  // A woven border gives the aisle a quiet edge.
  for (const side of [-1, 1]) {
    softBox([0.035, 0.006, 30], [side * 0.39, 0.823, -12], piping, nook, 0.002);
  }
  const surrounds = createCabinSurrounds(nook, fabric, scope);
  const styleDetails = createCabinStyleDetails(nook, headliner, scope);
  const windowRain = createWindowRain();
  scope.defer(() => windowRain.dispose());
  const roofGlass = new THREE.MeshBasicMaterial({
    color: 0xdbe0cf,
    opacity: 0.035,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const panes: {
    side: number;
    near: boolean;
    glass: THREE.Mesh;
    glazing: THREE.Mesh;
    edge: THREE.Group;
  }[] = [];
  const windowHandles: ReturnType<typeof createWindowHandle>[] = [];
  const clearGlass = new THREE.MeshBasicMaterial({
    color: 0xb6c6bf, opacity: 0.04, transparent: true,
    side: THREE.DoubleSide, depthWrite: false, forceSinglePass: true,
  });
  const glassRim = new THREE.MeshStandardMaterial({
    color: 0x83988f, roughness: 0.88, metalness: 0.05,
  });
  for (const side of [-1, 1]) {
    softBox(
      [0.15, 0.69, 30],
      [side * 2.12, 1.16, -12],
      upholstery,
      nook,
      0.035,
    );
    softBox([0.07, 0.1, 30], [side * 2.015, 0.88, -12], walnut, nook, 0.016);
    for (let row = 0; row < 6; row++) {
      const z = -row * 4.8;
      for (const offset of [-1.18, 1.18]) {
        softBox([0.028, 0.43, 2.17], [side * 2.025, 1.18, z + offset], walnut, nook, 0.008);
        softBox([0.02, 0.34, 2.04], [side * 2.002, 1.18, z + offset], panel, nook, 0.008);
      }
      const glass = mesh(
        new THREE.PlaneGeometry(4.6, 1.65),
        windowRain.createMaterial(row + (side + 1) * 3),
        [side * 2.075, 2.375, z],
      );
      glass.rotation.y = Math.PI / 2;
      glass.layers.set(windowRain.layer);
      const glazing = mesh(glass.geometry, clearGlass, [side * 2.075, 2.375, z]);
      glazing.rotation.y = Math.PI / 2;
      const edge = new THREE.Group();
      edge.position.set(side * 2.03, 1.55, z);
      nook.add(edge);
      if (row === 0) {
        edge.name = `window-sash-${side < 0 ? "left" : "right"}`;
        glazing.name = `window-glass-${side < 0 ? "left" : "right"}`;
        softBox([0.058, 0.052, 4.45], [0, 0, 0], walnut, edge, 0.02);
        // A single matte bead stays clear of the glass and wood, without
        // overlapping hairline highlights that shimmer as the carriage moves.
        softBox([0.016, 0.02, 4.39], [side * 0.032, 0.034, 0], glassRim, edge, 0.005);
        const handle = createWindowHandle(side, scope);
        edge.add(handle.group);
        windowHandles.push(handle);
      } else {
        softBox([0.027, 0.022, 4.45], [0, 0, 0], brass, edge, 0.005);
      }
      mergeStaticMeshes(edge, [...edge.children], scope);
      panes.push({ side, near: row === 0, glass, glazing, edge });
      const roofPane = new THREE.BufferGeometry();
      roofPane.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            side * 2.07,
            3.24,
            z - 2.3,
            side * 2.07,
            3.24,
            z + 2.3,
            side * 1.2,
            3.62,
            z + 2.3,
            side * 1.2,
            3.62,
            z - 2.3,
          ],
          3,
        ),
      );
      roofPane.setIndex([0, 1, 2, 0, 2, 3]);
      nook.add(new THREE.Mesh(roofPane, roofGlass));
    }
  }
  // Soft fabric seat backs give the carriage depth without filling the windows.
  for (let row = 0; row < 6; row++)
    for (const side of [-1, 1]) {
      const z = -3.0 - row * 3.8,
        x = side * 1.26;
      const chair = new THREE.Group();
      chair.name = "empty-seat";
      chair.position.set(x, 0, z);
      nook.add(chair);
      softBox([1.18, 0.19, 0.81], [0, 1.05, 0], upholstery, chair, 0.06);
      softBox([1.09, 0.14, 0.76], [0, 1.15, -0.02], seatFabric, chair, 0.065);
      const back = softBox(
        [1.17, 1.04, 0.17],
        [0, 1.65, 0.3],
        seatFabric,
        chair,
        0.075,
      );
      back.rotation.x = 0.09;
      const backPanel = softBox([0.98, 0.79, 0.045], [0, 1.68, 0.401], seatFabric, chair, 0.02);
      backPanel.rotation.x = 0.09;
      // Piping, a linen headrest cover and a leather pocket finish the visible back.
      for (const edge of [-1, 1]) {
        beam([edge * 0.51, 1.25, 0.442], [edge * 0.51, 2.03, 0.372], 0.007, piping, chair);
      }
      const headrestCover = softBox([0.68, 0.27, 0.032], [0, 2.035, 0.407], linen, chair, 0.014);
      headrestCover.rotation.x = 0.09;
      const cushion = softBox(
        [1.07, 0.94, 0.11],
        [0, 1.67, 0.2],
        seatFabric,
        chair,
        0.07,
      );
      cushion.rotation.x = 0.09;
      softBox([0.97, 0.21, 0.2], [0, 2.1, 0.3], seatFabric, chair, 0.065);
      softBox(
        [0.7, 0.29, 0.025],
        [0, 1.36, 0.457],
        seatPocket,
        chair,
        0.008,
      );
      softBox([0.69, 0.018, 0.013], [0, 1.503, 0.478], piping, chair, 0.005);
      // A quiet stitched seam across the headrest cloth.
      softBox([0.58, 0.008, 0.009], [0, 1.929, 0.436], piping, chair, 0.003);
      for (const arm of [-1, 1]) {
        softBox([0.09, 0.07, 0.7], [arm * 0.64, 1.35, 0], walnut, chair, 0.028);
        beam(
          [arm * 0.45, 0.81, 0.19],
          [arm * 0.45, 1.0, 0.19],
          0.022,
          brass,
          chair,
        );
      }
    }
  softBox([4.24, 2.86, 0.18], [0, 2.17, -25.5], upholstery, nook, 0.03);
  softBox([0.96, 2.2, 0.07], [0, 1.94, -25.38], walnut, nook, 0.04);
  for (const side of [-1, 1]) {
    softBox([0.075, 2.3, 0.065], [side * 0.54, 1.98, -25.35], walnut, nook, 0.016);
    softBox([1.25, 0.065, 0.06], [side * 1.31, 1.53, -25.35], walnut, nook, 0.012);
    softBox([1.11, 0.55, 0.035], [side * 1.31, 1.17, -25.38], panel, nook, 0.014);
  }
  softBox([1.15, 0.1, 0.07], [0, 3.15, -25.35], walnut, nook, 0.02);
  beam([0.34, 1.77, -25.28], [0.34, 1.96, -25.28], 0.018, brass);
  softBox(
    [0.64, 1.08, 0.025],
    [0, 2.2, -25.33],
    material(0x456157, { emissive: 0x9f8050, emissiveIntensity: 0.12 }),
    nook,
    0.06,
  );

  const haloTexture = radialTexture(64, [
    [0, "rgba(255,229,175,.9)"],
    [0.15, "rgba(255,188,100,.28)"],
    [1, "rgba(255,173,76,0)"],
  ]);
  const bulbMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdda4,
    toneMapped: false,
  });
  const fairyLights = new THREE.Group();
  fairyLights.name = "classic-fairy-lights";
  nook.add(fairyLights);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row++) {
      const center = -row * 4.8;
      line([
        [side * 1.78, 3.16, center - 2.17],
        [side * 1.78, 3.05, center],
        [side * 1.78, 3.16, center + 2.17],
      ], 0x756552, 1, fairyLights);
      for (const offset of [-1.48, 0, 1.48]) {
        const z = center + offset;
        const y = 3.05 + 0.11 * Math.pow(offset / 2.17, 2);
        mesh(new THREE.SphereGeometry(0.022, 10, 8), bulbMaterial, [side * 1.78, y - 0.012, z], fairyLights);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: haloTexture,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            toneMapped: false,
          }),
        );
        glow.position.set(side * 1.765, y - 0.012, z);
        glow.scale.setScalar(0.25);
        fairyLights.add(glow);
      }
    }
  }
  mergeStaticMeshes(fairyLights, [...fairyLights.children], scope);
  const classicLamps = new THREE.Group();
  classicLamps.name = "classic-ceiling-lamps";
  nook.add(classicLamps);
  const ceilingLights: THREE.PointLight[] = [];
  for (const z of [-4, -11, -18]) {
    // Flush opal lamps sit in stepped timber and aged-brass housings.
    softBox([0.78, 0.06, 0.5], [0, 3.573, z], walnut, classicLamps, 0.025);
    softBox([0.64, 0.045, 0.38], [0, 3.527, z], brass, classicLamps, 0.02);
    softBox([0.54, 0.065, 0.29], [0, 3.48, z], bulbMaterial, classicLamps, 0.028);
    const light = new THREE.PointLight(0xffd2a0, 2.4, 7);
    light.position.set(0, 3.35, z);
    nook.add(light);
    ceilingLights.push(light);
  }
  mergeStaticMeshes(classicLamps, [...classicLamps.children], scope);
  const desk = new THREE.Group();
  desk.name = "study-table";
  nook.add(desk);
  softBox([2.0, 0.095, 1.1], [0, 1.38, -0.35], dash, desk, 0.04);
  softBox([0.14, 0.7, 0.16], [0.15, 1.0, -0.5], walnut, desk);
  // A soft fabric runner on the table beside the window.
  softBox(
    [1.28, 0.013, 0.97],
    [-0.02, 1.435, -0.34],
    runner,
    desk,
    0.004,
  );
  const keepsakes = new THREE.Group();
  keepsakes.position.y = 0.36;
  desk.add(keepsakes);
  // A stack of books, a ceramic cup, and a plant make this feel like someone's space.
  const books = new THREE.Group();
  books.name = "books";
  books.position.set(0.68, 1.09, -0.68);
  books.rotation.y = -0.17;
  keepsakes.add(books);
  books.scale.setScalar(0.8);
  for (const [index, color] of [0x687564, 0xbd936f, 0x8b706b].entries()) {
    const book = new THREE.Group();
    book.position.y = index * 0.055;
    book.rotation.y = index === 1 ? 0.12 : -0.02;
    books.add(book);
    softBox([0.37, 0.037, 0.25], [0, 0.025, 0], cream, book, 0.005);
    const cover = material(color);
    for (const y of [0.005, 0.048])
      softBox([0.39, 0.009, 0.267], [0, y, 0], cover, book, 0.003);
    softBox([0.02, 0.048, 0.264], [-0.19, 0.025, 0], cover, book, 0.004);
    for (const y of [0.014, 0.022, 0.03, 0.038])
      beam([-0.165, y, 0.127], [0.17, y, 0.127], 0.0008, upholstery, book);
  }
  // A little ribbon bookmark falling over the edge.
  softBox(
    [0.022, 0.15, 0.005],
    [0.72, 1.1, -0.535],
    material(0xbc7965),
    keepsakes,
    0.002,
  ).rotation.z = -0.15;

  const cup = new THREE.Group();
  cup.name = "tea";
  cup.position.set(0.53, 1.08, -0.11);
  keepsakes.add(cup);
  cup.scale.setScalar(0.8);
  const ceramic = material(0xc1c9b0, { roughness: 0.45 });
  mesh(
    new THREE.CylinderGeometry(0.094, 0.092, 0.014, 40),
    walnut,
    [0, 0.007, 0],
    cup,
  );
  mesh(
    new THREE.CylinderGeometry(0.078, 0.061, 0.15, 40),
    ceramic,
    [0, 0.09, 0],
    cup,
  );
  mesh(
    new THREE.TorusGeometry(0.073, 0.006, 10, 40),
    ceramic,
    [0, 0.166, 0],
    cup,
  ).rotation.x = Math.PI / 2;
  mesh(
    new THREE.CircleGeometry(0.068, 40),
    material(0x63472b, { roughness: 0.2 }),
    [0, 0.169, 0],
    cup,
  ).rotation.x = -Math.PI / 2;
  mesh(
    new THREE.TorusGeometry(0.044, 0.012, 12, 32),
    ceramic,
    [0.076, 0.094, 0],
    cup,
  );
  const steam = new THREE.Group();
  cup.add(steam);
  const steamPuffs: THREE.Sprite[] = [];
  for (let i = 0; i < 9; i++) {
    const puff = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTexture,
        color: 0xf7e7d3,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    steam.add(puff);
    steamPuffs.push(puff);
  }

  const plant = new THREE.Group();
  plant.name = "little-plant";
  plant.position.set(-0.65, 1.077, -0.55);
  keepsakes.add(plant);
  plant.scale.setScalar(0.74);
  const spareTable = new THREE.Group();
  nook.add(spareTable);
  softBox([1.8, 0.095, 1.1], [0, 1.38, -0.35], dash, spareTable, 0.04);
  softBox([0.14, 0.7, 0.16], [0, 1.0, -0.4], walnut, spareTable);
  const tree = createPottedTree(scope, plant, spareTable, nook, garden);
  const light = new THREE.PointLight(0xffd6a6, 3.2, 5);
  light.position.set(0, 3.03, 0.4);
  nook.add(light);
  const deskLight = new THREE.PointLight(0xffcfa0, 0.7, 2.8);
  deskLight.position.set(-0.75, 2.35, -0.3);
  nook.add(deskLight);
  // Sashes are separate groups; transparent glass also stays out of the batch.
  const staticParts: THREE.Object3D[] = nook.children.filter(child => child instanceof THREE.Mesh);
  for (const child of nook.children) if (child.name === "empty-seat") staticParts.push(...child.children);
  mergeStaticMeshes(nook, staticParts, scope);
  const woodMap = walnut.map, tableMap = dash.map;
  let currentTrainType: TrainType = "classic";
  function setTrainType(type: TrainType) {
    if (type === currentTrainType) return;
    currentTrainType = type;
    rig.userData.trainType = type;
    const palette = TRAIN_PALETTES[type], metro = type === "metro";
    upholstery.color.set(palette.upholstery);
    headliner.color.set(palette.ceiling);
    seatFabric.color.set(palette.seat);
    seatFabric.roughness = metro ? 0.6 : 0.9;
    walnut.color.set(palette.wood);
    dash.color.set(palette.desk);
    floor.color.set(metro ? 0x47575d : palette.wood);
    for (const [surface, source] of [[walnut, woodMap], [floor, woodMap], [dash, tableMap]] as const) {
      const map = metro ? null : source;
      if (surface.map !== map) { surface.map = map; surface.needsUpdate = true; }
    }
    walnut.metalness = metro ? 0.45 : 0;
    brass.color.set(palette.brass);
    brass.metalness = metro ? 0.65 : 0.3;
    panel.color.set(palette.panel);
    seatPocket.color.set(palette.pocket);
    linen.color.set(palette.linen);
    piping.color.set(palette.piping);
    carpet.color.set(palette.carpet);
    runner.color.set(palette.runner);
    light.color.set(type === "classic" ? 0xffd6a6 : palette.light);
    deskLight.color.set(type === "classic" ? 0xffcfa0 : palette.light);
    for (const lamp of ceilingLights) {
      lamp.color.set(palette.light);
      lamp.position.y = type === "steam" ? 2.82 : 3.35;
      lamp.intensity = type === "classic" ? 2.4 : 2.9;
    }
    for (const child of nook.children) if (child instanceof THREE.Mesh) {
      if (child.material === roofGlass) child.visible = type === "classic";
      if (child.material === seatPocket || child.material === linen) child.visible = !metro;
    }
    fairyLights.visible = classicLamps.visible = type === "classic";
    surrounds.setTrainType(type);
    styleDetails.setTrainType(type);
    for (const handle of windowHandles) handle.setTrainType(type);
  }
  return { rig, nook, desk, spareTable, plant, tree, panes, windowRain, steamPuffs, setTrainType };
}

export function createCabinView({
  cabin,
  camera,
  canvas,
  getSettings,
  scope,
}: {
  cabin: ReturnType<typeof createStudyCabin>;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  getSettings(): SceneSettings;
  scope: Lifecycle;
}) {
  const { rig, nook, desk, spareTable, plant, panes, windowRain, steamPuffs } =
    cabin;
  const initialSettings = getSettings();
  const initialSide = initialSettings.seat === "left" ? -1 : 1;
  const slides = panes.map(pane => createWindowSlide(
    pane.near && pane.side === initialSide && initialSettings.windowOpen,
  ));
  let windowSeat = initialSettings.seat;
  const eye = new THREE.Vector3(),
    target = new THREE.Vector3();
  const pointer = { x: 0, y: 0 },
    gaze = { x: 0, y: 0 };
  const drag = { id: null as number | null, x: 0, y: 0, yaw: 0, pitch: 0 };
  const look = { yaw: 0, pitch: 0 };
  function releaseLook() {
    if (drag.id !== null && canvas.hasPointerCapture(drag.id))
      canvas.releasePointerCapture(drag.id);
    drag.id = null;
    drag.yaw = drag.pitch = 0;
    canvas.classList.remove("is-looking");
  }
  scope.defer(releaseLook);
  scope.on(canvas, "pointerdown", (event) => {
    if (event.button !== 0) return;
    drag.id = event.pointerId;
    drag.x = event.clientX;
    drag.y = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-looking");
    canvas.focus({ preventScroll: true });
    event.preventDefault();
  });
  scope.on(canvas, "pointermove", (event) => {
    if (event.pointerId !== drag.id) return;
    drag.yaw = Math.max(-0.5, Math.min(0.5, (event.clientX - drag.x) * 0.002));
    drag.pitch = Math.max(
      -0.13,
      Math.min(0.13, (event.clientY - drag.y) * 0.0014),
    );
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    scope.on(canvas, event, releaseLook);
  scope.on(canvas, "keydown", (event) => {
    if (!event.key.startsWith("Arrow") && event.key !== "Home") return;
    event.preventDefault();
    if (event.key === "ArrowLeft") drag.yaw = Math.min(0.5, drag.yaw + 0.07);
    if (event.key === "ArrowRight") drag.yaw = Math.max(-0.5, drag.yaw - 0.07);
    if (event.key === "ArrowUp")
      drag.pitch = Math.min(0.13, drag.pitch + 0.025);
    if (event.key === "ArrowDown")
      drag.pitch = Math.max(-0.13, drag.pitch - 0.025);
    if (event.key === "Home") releaseLook();
  });
  scope.on(canvas, "keyup", releaseLook);
  scope.on(window, "blur", releaseLook);
  scope.on(document, "visibilitychange", () => {
    if (document.hidden) releaseLook();
  });
  const motion = reducedMotion();
  scope.on(window, "pointermove", (event) => {
    if (event.pointerType !== "mouse" || motion.matches) return;
    pointer.x = (event.clientX / innerWidth) * 2 - 1;
    pointer.y = (event.clientY / innerHeight) * 2 - 1;
  });
  scope.on(document, "pointerleave", () => {
    pointer.x = pointer.y = 0;
  });
  return {
    update(dt: number, weather: EnvironmentWeights, forest?: EnvironmentSource) {
      const { seat, seatDirection, windowOpen, gardenView } = getSettings();
      const side = seat === "left" ? 1 : -1;
      const portrait = innerWidth / innerHeight < 0.85;
      gaze.x += (pointer.x - gaze.x) * (1 - Math.exp(-dt * 2));
      gaze.y += (pointer.y - gaze.y) * (1 - Math.exp(-dt * 2));
      look.yaw += ((gardenView ? -side * 0.98 : drag.yaw) - look.yaw) * (motion.matches ? 1 : 1 - Math.exp(-dt * 3));
      look.pitch += ((gardenView ? -0.13 : drag.pitch) - look.pitch) * (motion.matches ? 1 : 1 - Math.exp(-dt * 3));
      nook.position.x = 0;
      // Turn the furnished interior and viewpoint together around the cabin's
      // center (z = -12), keeping its footprint aligned with the moving train.
      nook.position.z = seatDirection === "backward" ? -24 : 0;
      nook.rotation.y = seatDirection === "backward" ? Math.PI : 0;
      // Keep the desk square to the carriage and its outer edge inside the wall.
      desk.position.x = -side * 1.0;
      // Bring the miniature into the narrow view, behind the ticket button.
      plant.position.x = portrait ? (seat === "left" ? 0.1 : -0.28) : -0.65;
      plant.position.z = portrait ? -0.78 : -0.55;
      spareTable.position.x = side * 1.13;
      const seatChanged = seat !== windowSeat;
      windowSeat = seat;
      panes.forEach((pane, index) => {
        const openness = advanceWindowSlide(slides[index],
          pane.near && pane.side === -side && windowOpen, dt, motion.matches || seatChanged);
        // Stop below the valance so the raised pull clears the fixed trim.
        const paneHeight = 1.65 - openness * 1.33;
        for (const surface of [pane.glass, pane.glazing]) {
          surface.scale.y = paneHeight / 1.65;
          surface.position.y = 3.2 - paneHeight / 2;
        }
        pane.edge.position.y = 3.2 - paneHeight;
      });
      windowRain.update(
        dt,
        blendEnvironment(weather, (environment) => environment.windowRain, forest),
        motion.matches,
      );
      steamPuffs.forEach((puff, i) => {
        const phase = (performance.now() / 5600 + i / steamPuffs.length) % 1;
        puff.position.set(
          Math.sin(phase * 5 + i) * 0.023,
          0.18 + phase * 0.34,
          0.012,
        );
        puff.scale.setScalar(0.08 + phase * 0.075);
        puff.material.opacity = Math.sin(phase * Math.PI) * 0.16;
      });
      rig.updateMatrixWorld(true);
      eye
        .set(
          -side * 0.95 + gaze.x * 0.025,
          (portrait ? 2.24 : 2.32) - gaze.y * 0.016,
          1.1,
        )
        .applyMatrix4(nook.matrixWorld);
      const directionX = -side * (portrait ? 1.55 : 5.05);
      const directionZ = -25.1;
      target
        .set(
          -side * 0.95 +
            directionX * Math.cos(look.yaw) +
            directionZ * Math.sin(look.yaw) +
            gaze.x * 0.12,
          2.24 + Math.sin(look.pitch) * 20 - gaze.y * 0.06,
          1.1 -
            directionX * Math.sin(look.yaw) +
            directionZ * Math.cos(look.yaw),
        )
        .applyMatrix4(nook.matrixWorld);
      camera.position.copy(eye);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
    },
  };
}
