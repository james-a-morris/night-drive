import type { Lifecycle } from "./lifecycle.ts";
import type { Landmark, GroundAt } from "./landmark-types.ts";
import type { Environment, SceneryMode } from "./environments.ts";
import { ENVIRONMENTS, WILDLIFE_FAMILIES } from "./environments.ts";
import { reducedMotion } from "./motion.ts";
import { recycleStation } from "./recycle.ts";
import { radialTexture } from "./textures.ts";
type XYZ = [number, number, number];
interface Site {
  group: THREE.Group;
  kind: number;
  index: number;
  station: number;
  items: Landmark[];
}
import * as THREE from "./three.ts";
import { roadFrame, roadPoint } from "./drive.ts";
import { terrainSurfaceHeight } from "./terrain.ts";
import { dominantEnvironment, environmentWeights } from "./environments.ts";
import { createWildlifeAnimal } from "./wildlife.ts";
import { birdPose, birdFlyby } from "./wildlife-motion.ts";
import { mergeStaticMeshes } from "./static-meshes.ts";
import { stationClearing } from "./station-route.ts";

// Small, recurring places along the railway. Everything lives in world space:
// the train passes each clearing, cottage and pool instead of carrying it along.
export function createLandmarks(world: THREE.Group, scope: Lifecycle) {
  const root = new THREE.Group();
  root.name = "places-along-the-line";
  world.add(root);
  const mat = (
    color: THREE.ColorRepresentation,
    extra: THREE.MeshStandardMaterialParameters = {},
  ) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const wood = mat(0x675442),
    roof = mat(0x4b5654),
    plaster = mat(0xb29b7b),
    stone = mat(0x6c7166);
  const dark = mat(0x343c36),
    cream = mat(0xd2c1a0),
    snow = mat(0xdbded4);
  const lamp = mat(0xf6d799, { emissive: 0xeeb764, emissiveIntensity: 1.1 });
  const leaf = mat(0x58765a, { side: THREE.DoubleSide });
  const unitBox = new THREE.BoxGeometry(1, 1, 1),
    sphere = new THREE.SphereGeometry(1, 10, 8);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
  function shape(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    xyz: XYZ,
    size: XYZ,
  ) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(...xyz);
    mesh.scale.set(...size);
    parent.add(mesh);
    return mesh;
  }
  const box = (
    parent: THREE.Object3D,
    material: THREE.Material,
    xyz: XYZ,
    size: XYZ,
  ) => shape(parent, unitBox, material, xyz, size);
  const ellipsoid = (
    parent: THREE.Object3D,
    material: THREE.Material,
    xyz: XYZ,
    size: XYZ,
  ) => shape(parent, sphere, material, xyz, size);
  function rod(
    parent: THREE.Object3D,
    material: THREE.Material,
    a: XYZ,
    b: XYZ,
    width: number,
  ) {
    const from = new THREE.Vector3(...a),
      to = new THREE.Vector3(...b);
    const mesh = shape(
      parent,
      cylinder,
      material,
      from.clone().add(to).multiplyScalar(0.5).toArray(),
      [width, from.distanceTo(to), width],
    );
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.sub(from).normalize(),
    );
    return mesh;
  }
  function fence(group: THREE.Group) {
    for (let z = -8; z <= 8; z += 3.2)
      box(group, wood, [0, 0.65, z], [0.1, 1.3, 0.11]);
    for (const y of [0.42, 0.92]) box(group, wood, [0, y, 0], [0.07, 0.09, 17]);
    mergeStaticMeshes(group, [...group.children], scope);
  }
  const smokeTexture = radialTexture(32, [
    [0, "rgba(215,211,190,.26)"],
    [1, "rgba(215,211,190,0)"],
  ]);
  function cottage(): Landmark {
    const group = new THREE.Group();
    group.name = "lamplit-cottage";
    box(group, stone, [0, 0.24, 0], [7.4, 0.5, 5.4]);
    box(group, plaster, [0, 1.8, 0], [7, 3.1, 5]);
    for (const side of [-1, 1]) {
      const panel = box(group, roof, [side * 1.86, 3.67, 0], [4.25, 0.18, 6.1]);
      panel.rotation.z = -side * 0.4;
      box(group, wood, [side * 3.3, 1.8, 0], [0.18, 3.5, 5.1]);
    }
    box(group, wood, [0, 1.26, 2.54], [1.05, 2.1, 0.12]);
    for (const x of [-2.1, 2.1])
      for (const side of [-1, 1]) {
        box(group, wood, [x, 1.95, side * 2.54], [1.4, 1.3, 0.13]);
        box(group, lamp, [x, 1.95, side * 2.62], [1.16, 1.08, 0.025]);
        box(group, wood, [x, 1.95, side * 2.64], [0.06, 1.09, 0.03]);
        box(group, wood, [x, 1.95, side * 2.64], [1.17, 0.06, 0.03]);
      }
    box(group, stone, [1.9, 4.4, -0.8], [0.7, 2.2, 0.7]);
    const cap = new THREE.Group();
    cap.name = "snow-on-roof";
    group.add(cap);
    for (const side of [-1, 1]) {
      const panel = box(cap, snow, [side * 1.86, 3.8, 0], [4.28, 0.12, 6.15]);
      panel.rotation.z = -side * 0.4;
    }
    const smoke = new THREE.Group();
    smoke.position.set(1.9, 5.6, -0.8);
    group.add(smoke);
    const puffs = Array.from(
      { length: 7 },
      () =>
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: smokeTexture,
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
          }),
        ),
    );
    smoke.add(...puffs);
    mergeStaticMeshes(group, [...group.children], scope);
    mergeStaticMeshes(cap, [...cap.children], scope);
    return {
      object: group,
      setEnvironment(environment) {
        cap.visible = environment.snowRoof;
      },
      update(_dt, elapsed) {
        puffs.forEach((puff, i) => {
          const age = (elapsed * 0.05 + i / 7) % 1;
          puff.position.set(age * 1.7, age * 6, Math.sin(age * 3) * 0.4);
          puff.scale.setScalar(0.8 + age * 2.1);
          puff.material.opacity = Math.sin(age * Math.PI) * 0.55;
        });
      },
    };
  }
  function windmill(): Landmark {
    const group = new THREE.Group();
    group.name = "desert-windmill";
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        rod(group, wood, [x, 0, z], [x * 0.38, 6.7, z * 0.38], 0.1);
    for (const y of [1.1, 3.2, 5.2])
      for (const side of [-1, 1])
        rod(
          group,
          wood,
          [-1 + y * 0.09, y, side * (1 - y * 0.09)],
          [1 - (y + 1) * 0.09, y + 1, side * (1 - (y + 1) * 0.09)],
          0.048,
        );
    const rotor = new THREE.Group();
    rotor.position.set(0, 6.8, 0);
    group.add(rotor);
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const blade = box(
        rotor,
        cream,
        [Math.sin(angle) * 1.12, Math.cos(angle) * 1.12, 0],
        [0.42, 1.25, 0.055],
      );
      blade.rotation.z = -angle;
    }
    ellipsoid(rotor, dark, [0, 0, 0.04], [0.16, 0.16, 0.15]);
    mergeStaticMeshes(group, [...group.children], scope);
    mergeStaticMeshes(rotor, [...rotor.children], scope);
    return {
      object: group,
      setEnvironment(environment) {
        group.visible = environment.windmill;
      },
      update(_dt, elapsed, reduced) {
        if (!reduced) rotor.rotation.z = elapsed * 0.12;
      },
    };
  }
  function pond(): Landmark {
    const group = new THREE.Group();
    group.name = "quiet-water";
    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      mat(0x577b79, {
        roughness: 0.24,
        metalness: 0.35,
        side: THREE.DoubleSide,
      }),
    );
    surface.rotation.x = -Math.PI / 2;
    surface.scale.set(5.3, 10.5, 1);
    surface.position.y = 0.09;
    group.add(surface);
    const shoreGeometry = new THREE.BufferGeometry();
    const shorePositions = [],
      shoreIndices = [];
    for (let i = 0; i <= 40; i++) {
      const angle = (i * Math.PI) / 20;
      shorePositions.push(
        Math.cos(angle) * 5.28,
        0.08,
        Math.sin(angle) * 10.48,
        Math.cos(angle) * 6.6,
        0,
        Math.sin(angle) * 11.8,
      );
      if (i < 40) {
        const a = i * 2;
        shoreIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    shoreGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(shorePositions, 3),
    );
    shoreGeometry.setIndex(shoreIndices);
    const shore = new THREE.Mesh(
      shoreGeometry,
      mat(0x52604c, { side: THREE.DoubleSide }),
    );
    group.add(shore);
    const ripples: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] =
      [];
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1, 40),
        new THREE.MeshBasicMaterial({
          color: 0xaec4ad,
          transparent: true,
          opacity: 0.1,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0.4, 0.11, -1);
      group.add(ring);
      ripples.push(ring);
    }
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const reed = rod(
        group,
        leaf,
        [Math.cos(a) * 5.45, 0, Math.sin(a) * 10.65],
        [Math.cos(a) * 5.45 + 0.1, 0.65 + (i % 3) * 0.2, Math.sin(a) * 10.65],
        0.025,
      );
      reed.name = "pond-reed";
    }
    return {
      object: group,
      fitGround(groundAt) {
        const height = Math.max(
          ...[-4, 0, 4].flatMap((x) => [-9, 0, 9].map((z) => groundAt(x, z))),
        );
        group.position.y = height;
        const positions = shore.geometry.attributes.position;
        for (let i = 1; i < positions.count; i += 2)
          positions.setY(
            i,
            groundAt(positions.getX(i), positions.getZ(i)) - height - 0.01,
          );
        positions.needsUpdate = true;
        shore.geometry.computeVertexNormals();
        shore.geometry.computeBoundingSphere();
      },
      setEnvironment(environment) {
        surface.material.color.setHex(environment.pond.water);
        shore.material.color.setHex(environment.pond.shore);
      },
      update(_dt, elapsed) {
        ripples.forEach((ring, i) => {
          const phase = (elapsed * 0.12 + i / 3) % 1;
          ring.scale.setScalar(0.4 + phase * 3.2);
          ring.material.opacity = Math.sin(phase * Math.PI) * 0.1;
        });
      },
    };
  }

  const sites: Site[] = [];
  for (let index = 0; index < 9; index++) {
    const group = new THREE.Group();
    root.add(group);
    const kind = index % 3,
      items: Landmark[] = [];
    function groundedAt(item: Landmark, x: number, z: number) {
      group.add(item.object);
      item.object.position.set(x, 0, z);
      items.push(item);
      return item;
    }
    if (kind === 0) {
      for (const [familyName, species] of Object.entries(WILDLIFE_FAMILIES)) {
        const family = new THREE.Group();
        family.name = `${familyName}-wildlife`;
        group.add(family);
        items.push({
          object: family,
          fitGround() {
            family.position.y = 0;
          },
          setEnvironment(environment) {
            family.visible = environment.wildlife === familyName;
          },
        });
        for (let i = 0; i < species.length; i++) {
          const animal = createWildlifeAnimal(species[i], index + i, scope);
          const [x, z, heading] = [
            [-3.4, 2.8, 1.05],
            [1.2, -3.5, -0.55],
            [3.2, 3.8, 2.15],
          ][i];
          animal.object.position.set(x, 0, z);
          animal.object.rotation.y = heading + index * 0.23;
          animal.object.scale.setScalar(i === 2 ? 0.72 : 1);
          family.add(animal.object);
          items.push(animal);
        }
      }
      const rails = new THREE.Group();
      fence(rails);
      groundedAt({ object: rails }, 5.5, -2);
    } else if (kind === 1) {
      groundedAt(cottage(), 0, 0);
      groundedAt(windmill(), -7, -4);
      const rails = new THREE.Group();
      fence(rails);
      rails.rotation.y = Math.PI / 2;
      groundedAt({ object: rails }, 0, 7);
      for (let i = 0; i < 3; i++) {
        const log = shape(
          group,
          cylinder,
          wood,
          [-5, 0.28, 3 + i * 0.55],
          [0.24, 3.4, 0.24],
        );
        log.rotation.z = Math.PI / 2;
        items.push({
          object: log,
          fitGround(ground) {
            log.position.y = ground(log.position.x, log.position.z) + 0.28;
          },
        });
      }
    } else {
      groundedAt(pond(), 0, 0);
      const marker = new THREE.Group();
      box(marker, wood, [0, 1, 0], [0.12, 2, 0.12]);
      box(marker, cream, [0, 1.7, 0], [0.62, 0.32, 0.1]);
      groundedAt({ object: marker }, 5, 8);
    }
    sites.push({ group, kind, index, station: 96 + index * 86, items });
  }
  function place(site: Site, mode: SceneryMode) {
    const environment =
      ENVIRONMENTS[dominantEnvironment(environmentWeights(site.station, mode))];
    const side =
      environment.landSide ??
      (Math.floor(site.station / 86) % 2 === 1 ? -1 : 1);
    const point = roadPoint(
      site.station,
      side * (site.kind === 1 ? 31 : site.kind === 2 ? 14 : 15),
    );
    const frame = roadFrame(site.station);
    site.group.position.set(point.x, 0, point.z);
    site.group.rotation.y = frame.heading;
    const groundAt: GroundAt = (x, z) =>
      terrainSurfaceHeight(
        point.x + Math.cos(frame.heading) * x + Math.sin(frame.heading) * z,
        point.z + Math.cos(frame.heading) * z - Math.sin(frame.heading) * x,
        mode,
      );
    for (const item of site.items) {
      // Wildlife family containers remain at the site origin; their animals
      // have individual terrain contacts in the same local coordinate system.
      if (item.object.parent === site.group || item.fitGround)
        item.object.position.y = groundAt(
          item.object.position.x,
          item.object.position.z,
        );
      item.fitGround?.(groundAt);
      item.setEnvironment?.(environment);
    }
  }
  const flock = new THREE.Group();
  flock.name = "passing-birds";
  root.add(flock);
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, 0, 0.7, 0, 0.17, 0.34, 0, -0.11],
      3,
    ),
  );
  wingGeometry.computeVertexNormals();
  const birdMaterial = mat(0x273633, { side: THREE.DoubleSide });
  function addBird(parent: THREE.Group, i: number) {
    const bird = new THREE.Group();
    bird.position.set(
      (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.1,
      Math.sin(i) * 0.3,
      i * 1.25,
    );
    parent.add(bird);
    ellipsoid(bird, birdMaterial, [0, 0, 0], [0.065, 0.07, 0.22]);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeometry, birdMaterial);
      wing.scale.x = side;
      bird.add(wing);
    }
    ellipsoid(bird, birdMaterial, [0, 0.06, -0.2], [0.055, 0.055, 0.07]);
    const tail = new THREE.Mesh(wingGeometry, birdMaterial);
    tail.scale.set(0.25, 1, 0.6);
    tail.rotation.y = -Math.PI / 2;
    tail.position.z = 0.18;
    bird.add(tail);
  }
  for (let i = 0; i < 7; i++) addBird(flock, i);
  const flybys = ([-1, 1] as const).map((side) => {
    const group = new THREE.Group();
    group.name = `nearby-birds-${side === -1 ? "left" : "right"}`;
    root.add(group);
    for (let i = 0; i < 3; i++) addBird(group, i);
    return { group, side };
  });
  const flocks = [flock, ...flybys.map(({ group }) => group)];
  let elapsed = 0;
  const motion = reducedMotion();
  return {
    root,
    sites,
    update(
      progress: number,
      dt: number,
      mode: SceneryMode,
      modeChanged: boolean,
    ) {
      if (!motion.matches) elapsed += dt;
      for (const site of sites) {
        const previous = site.station;
        site.station = recycleStation(
          site.station,
          progress - 130,
          sites.length * 86,
        );
        if (previous !== site.station || modeChanged) place(site, mode);
        if (Math.abs(site.station - progress) > 340 || stationClearing(site.station, 0, mode)) {
          site.group.visible = false;
          continue;
        }
        const weights = environmentWeights(site.station, mode);
        site.group.visible = weights.tunnel < 0.15 && weights.bridge < 0.15;
        for (const item of site.items) {
          if (item.object.visible && item.object.parent?.visible)
            item.update?.(dt, elapsed, motion.matches);
        }
      }
      const at = roadFrame(progress + 140);
      flock.position.set(
        at.x + Math.sin(elapsed * 0.045 - 1) * 75,
        24 + Math.sin(elapsed * 0.14) * 3,
        at.z + Math.cos(elapsed * 0.045) * 25,
      );
      flock.rotation.y = elapsed * 0.045 + Math.PI / 2;
      const localWeights = environmentWeights(progress, mode);
      const coastal = localWeights.coast;
      flock.visible = localWeights.tunnel < 0.15;
      birdMaterial.color.setRGB(
        0.025 + coastal * 0.65,
        0.037 + coastal * 0.64,
        0.033 + coastal * 0.59,
      );
      flock.position.y -= coastal * 10;
      const trainFrame = roadFrame(progress);
      for (const { group, side } of flybys) {
        // Keep close passes out of the reduced-motion view.
        group.visible = !motion.matches && localWeights.tunnel < 0.15;
        if (!group.visible) continue;
        const flight = birdFlyby(elapsed, side);
        group.position.set(
          trainFrame.x +
            trainFrame.rightX * flight.lateral +
            trainFrame.rightZ * flight.forward,
          flight.height,
          trainFrame.z +
            trainFrame.rightZ * flight.lateral -
            trainFrame.rightX * flight.forward,
        );
        group.position.y = Math.max(
          group.position.y,
          terrainSurfaceHeight(group.position.x, group.position.z, mode) + 4.8,
        );
        group.rotation.set(0, trainFrame.heading + flight.heading, flight.bank);
      }
      if (!motion.matches)
        flocks.forEach((group) =>
          group.children.forEach((bird, i) => {
            const pose = birdPose(elapsed, i, coastal);
            bird.position.set(
              (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2.1 + pose.x,
              Math.sin(i) * 0.3 + pose.y,
              i * 1.25 + pose.z,
            );
            bird.rotation.z = pose.bank;
            bird.children[1].rotation.z = pose.wing;
            bird.children[2].rotation.z = -pose.wing;
          }),
        );
    },
  };
}
