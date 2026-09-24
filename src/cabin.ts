import { blendEnvironment } from "./environments.ts";
import { radialTexture } from "./textures.ts";
import type { Lifecycle } from "./lifecycle.ts";
import type { Environment, EnvironmentWeights } from "./environments.ts";
import type { SceneSettings } from "./main.ts";
type XYZ = [number, number, number];
import { reducedMotion } from "./motion.ts";
import * as THREE from "./three.ts";
import { createWindowRain } from "./window-rain.ts";
import { createPottedTree } from "./potted-tree.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";

export function createStudyCabin(scope: Lifecycle) {
  const rig = new THREE.Group();
  rig.name = "train-study-cabin";
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
  const headliner = material(0x80725c, { bumpMap: fabric, bumpScale: 0.001 });
  const dash = material(0x9e8160, { bumpMap: fabric, bumpScale: 0.0008 });
  const walnut = material(0x72543e);
  const dark = material(0x3b4037);
  const brass = material(0xb49b68, { metalness: 0.3, roughness: 0.6 });
  const cream = material(0xd4c7a6);
  // Sample the painted material surfaces from the cabin artwork. The geometry
  // remains three dimensional; the painting supplies the warmth and grain.
  const paintedTextures: THREE.Texture[] = [];
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
  const seatFabric = material(0x597265, { bumpMap: fabric, bumpScale: 0.003 });
  const seatPocket = material(0x969580);
  softBox([4.25, 0.15, 31], [0, 0.73, -12], walnut, nook, 0.03);
  softBox([2.45, 0.12, 31], [0, 3.67, -12], headliner, nook, 0.04);
  softBox(
    [0.84, 0.012, 30],
    [0, 0.814, -12],
    material(0x536052, { bumpMap: fabric, bumpScale: 0.002 }),
    nook,
    0.004,
  );
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
    edge: THREE.Mesh;
  }[] = [];
  for (const side of [-1, 1]) {
    softBox(
      [0.15, 0.69, 30],
      [side * 2.12, 1.16, -12],
      upholstery,
      nook,
      0.035,
    );
    softBox([0.24, 0.08, 30], [side * 2.03, 1.51, -12], walnut, nook, 0.018);
    softBox([0.13, 0.1, 30], [side * 2.08, 3.24, -12], walnut, nook, 0.02);
    softBox([0.09, 0.07, 30], [side * 1.19, 3.61, -12], walnut, nook, 0.016);
    for (let row = 0; row < 6; row++) {
      const z = -row * 4.8;
      for (const end of [-2.36, 2.36]) {
        softBox(
          [0.13, 1.76, 0.09],
          [side * 2.08, 2.37, z + end],
          upholstery,
          nook,
          0.015,
        );
        beam(
          [side * 2.08, 3.23, z + end],
          [side * 1.2, 3.64, z + end],
          0.045,
          upholstery,
        );
      }
      const glass = mesh(
        new THREE.PlaneGeometry(4.6, 1.65),
        windowRain.createMaterial(row + (side + 1) * 3),
        [side * 2.075, 2.375, z],
      );
      glass.rotation.y = Math.PI / 2;
      glass.layers.set(windowRain.layer);
      const edge = softBox(
        [0.027, 0.022, 4.6],
        [side * 2.05, 3.2, z],
        brass,
        nook,
        0.005,
      );
      panes.push({ side, near: row === 0, glass, edge });
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
        upholstery,
        chair,
        0.075,
      );
      back.rotation.x = 0.09;
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
        [0, 1.36, 0.4],
        seatPocket,
        chair,
        0.008,
      );
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
  for (const side of [-1, 1]) {
    line(
      [
        [side * 1.92, 3.27, 2.3],
        [side * 1.92, 3.22, -12],
        [side * 1.92, 3.27, -25],
      ],
      0x756552,
    );
    for (let i = 0; i < 14; i++) {
      const z = 1.8 - i * 1.9;
      mesh(new THREE.SphereGeometry(0.018, 10, 8), bulbMaterial, [
        side * 1.92,
        3.19,
        z,
      ]);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: haloTexture,
          transparent: true,
          opacity: 0.6,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      glow.position.set(side * 1.91, 3.19, z);
      glow.scale.setScalar(0.26);
      nook.add(glow);
    }
  }
  for (const z of [-4, -11, -18]) {
    softBox([0.34, 0.025, 0.19], [0, 3.59, z], bulbMaterial, nook, 0.008);
    const light = new THREE.PointLight(0xffd2a0, 1.9, 7);
    light.position.set(0, 3.35, z);
    nook.add(light);
  }
  const desk = new THREE.Group();
  desk.name = "study-table";
  nook.add(desk);
  softBox([2.0, 0.095, 1.1], [0, 1.38, -0.35], dash, desk, 0.04);
  softBox([0.14, 0.7, 0.16], [0.15, 1.0, -0.5], walnut, desk);
  // A soft fabric runner on the table beside the window.
  softBox(
    [1.28, 0.013, 0.97],
    [-0.02, 1.435, -0.34],
    material(0x8b9277, { bumpMap: fabric, bumpScale: 0.002 }),
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
  const pot = material(0xb17957);
  mesh(
    new THREE.CylinderGeometry(0.1, 0.072, 0.15, 32),
    pot,
    [0, 0.078, 0],
    plant,
  );
  mesh(
    new THREE.TorusGeometry(0.097, 0.008, 8, 32),
    pot,
    [0, 0.155, 0],
    plant,
  ).rotation.x = Math.PI / 2;
  const soil = mesh(
    new THREE.CircleGeometry(0.09, 32),
    walnut,
    [0, 0.157, 0],
    plant,
  );
  soil.rotation.x = -Math.PI / 2;
  const tree = createPottedTree(scope);
  plant.add(tree.object);

  const spareTable = new THREE.Group();
  nook.add(spareTable);
  softBox([1.8, 0.095, 1.1], [0, 1.38, -0.35], dash, spareTable, 0.04);
  softBox([0.14, 0.7, 0.16], [0, 1.0, -0.4], walnut, spareTable);
  const light = new THREE.PointLight(0xffd6a6, 3.2, 5);
  light.position.set(0, 3.03, 0.4);
  nook.add(light);
  const deskLight = new THREE.PointLight(0xffcfa0, 0.7, 2.8);
  deskLight.position.set(-0.75, 2.35, -0.3);
  nook.add(deskLight);
  const movingEdges = new Set(panes.map(pane => pane.edge));
  const staticParts = nook.children.filter(child => child instanceof THREE.Mesh && !movingEdges.has(child));
  for (const child of nook.children) if (child.name === "empty-seat") staticParts.push(...child.children);
  mergeStaticMeshes(nook, staticParts, scope);
  return { rig, nook, desk, spareTable, plant, tree, panes, windowRain, steamPuffs };
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
  let openness = Number(getSettings().windowOpen);
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
    update(dt: number, weather: EnvironmentWeights, forest?: Environment) {
      const { seat, windowOpen } = getSettings();
      const side = seat === "left" ? 1 : -1;
      const portrait = innerWidth / innerHeight < 0.85;
      gaze.x += (pointer.x - gaze.x) * (1 - Math.exp(-dt * 2));
      gaze.y += (pointer.y - gaze.y) * (1 - Math.exp(-dt * 2));
      look.yaw += (drag.yaw - look.yaw) * (1 - Math.exp(-dt * 4));
      look.pitch += (drag.pitch - look.pitch) * (1 - Math.exp(-dt * 4));
      nook.position.x = 0;
      nook.rotation.y = 0;
      // Keep the desk square to the carriage and its outer edge inside the wall.
      desk.position.x = -side * 1.0;
      // Bring the miniature into the narrow view, behind the ticket button.
      plant.position.x = portrait ? (seat === "left" ? 0.1 : -0.28) : -0.65;
      plant.position.z = portrait ? -0.78 : -0.55;
      spareTable.position.x = side * 1.13;
      openness += (Number(windowOpen) - openness) * (1 - Math.exp(-dt * 5));
      for (const pane of panes) {
        const paneHeight =
          1.65 * (1 - (pane.near && pane.side === -side ? openness * 0.95 : 0));
        pane.glass.scale.y = paneHeight / 1.65;
        pane.glass.position.y = 1.55 + paneHeight / 2;
        pane.edge.position.y = 1.55 + paneHeight;
      }
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
