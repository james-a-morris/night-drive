import * as THREE from "./three.ts";
import { blendEnvironment, type Environment, type EnvironmentWeights } from "./environments.ts";
import { intersectsCabin } from "./weather-shelter.ts";
import { radialTexture } from "./textures.ts";
interface Particles {
  kind: "rain" | "snow" | "dust";
  count: number;
  positions: Float32Array;
  attribute: THREE.BufferAttribute;
  material: THREE.Material;
  object: THREE.Object3D;
}

export function createWeather(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.name = "weather";
  scene.add(group);
  const texture = radialTexture(32, [
    [0, "rgba(255,255,255,1)"],
    [0.3, "rgba(255,255,255,.9)"],
    [1, "rgba(255,255,255,0)"],
  ]);
  const particles: Particles[] = [];
  for (const [kind, count] of [
    ["rain", 2000],
    ["snow", 850],
    ["dust", 180],
  ] as const) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++)
      positions.set(
        [
          (Math.random() - 0.5) * 80,
          Math.random() * 34,
          70 - Math.random() * 160,
        ],
        i * 3,
      );
    const geometry = new THREE.BufferGeometry();
    const attribute = new THREE.BufferAttribute(
      new Float32Array(count * (kind === "rain" ? 6 : 3)),
      3,
    );
    attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", attribute);
    const material =
      kind === "rain"
        ? new THREE.LineBasicMaterial({
            color: 0xb6cfde,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          })
        : new THREE.PointsMaterial({
            color: kind === "snow" ? 0xf1f5ff : 0xd8b991,
            size: kind === "snow" ? 0.16 : 0.2,
            map: texture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
    const object =
      kind === "rain"
        ? new THREE.LineSegments(geometry, material)
        : new THREE.Points(geometry, material);
    object.name = kind;
    object.frustumCulled = false;
    group.add(object);
    particles.push({ kind, count, positions, attribute, material, object });
  }
  let elapsed = 0;
  let shelter: THREE.Object3D | null = null;
  const weatherToCabin = new THREE.Matrix4();
  const start = new THREE.Vector3(),
    end = new THREE.Vector3();
  return {
    group,
    particles,
    setShelter(carriage: THREE.Object3D) {
      shelter = carriage;
    },
    update(
      dt: number,
      movement: number,
      heading: number,
      weights: EnvironmentWeights,
      stormRain = 0,
      forest?: Environment,
    ) {
      elapsed += dt;
      group.rotation.y = heading;
      group.updateMatrixWorld(true);
      if (shelter)
        weatherToCabin
          .copy(shelter.matrixWorld)
          .invert()
          .multiply(group.matrixWorld);
      for (const {
        kind,
        count,
        positions,
        attribute,
        material,
        object,
      } of particles) {
        material.opacity = blendEnvironment(
          weights,
          (environment) => environment.particles[kind],
          forest,
        );
        if (kind === "rain") {
          material.opacity *= 1 + stormRain * 0.65;
          // Keep the usual drizzle sparse; bring in more streaks for a squall.
          (object as THREE.LineSegments).geometry.setDrawRange(
            0,
            Math.round(1200 + stormRain * 800) * 2,
          );
        }
        object.visible = material.opacity > 0.005;
        if (!object.visible) continue;
        for (let i = 0; i < count; i++) {
          const at = i * 3;
          positions[at] +=
            dt *
            (kind === "rain"
              ? -2.5
              : kind === "dust"
                ? 2
                : Math.sin(elapsed * 0.7 + i) * 0.7);
          positions[at + 1] -=
            dt *
            (kind === "rain"
              ? 24 + (i % 9) + stormRain * 10
              : kind === "snow"
                ? 1.1 + (i % 8) * 0.2
                : 0.15);
          positions[at + 2] += movement;
          if (positions[at] < -40) positions[at] += 80;
          if (positions[at] > 40) positions[at] -= 80;
          if (positions[at + 1] < -1) positions[at + 1] += 35;
          if (positions[at + 2] > 70) positions[at + 2] -= 160;
          const x = positions[at],
            y = positions[at + 1],
            z = positions[at + 2];
          start.set(x, y, z).applyMatrix4(weatherToCabin);
          end.set(x + 0.1, y + 1.1, z - 0.1).applyMatrix4(weatherToCabin);
          const sheltered =
            shelter && intersectsCabin(start, kind === "rain" ? end : start);
          // Cull the whole rain streak, not only its origin. Keep the actual
          // particle moving outside the render buffer so it reappears naturally.
          const visibleY = sheltered ? -1000 : y;
          if (kind === "rain") {
            attribute.setXYZ(i * 2, x, visibleY, z);
            attribute.setXYZ(i * 2 + 1, x + 0.1, visibleY + 1.1, z - 0.1);
          } else attribute.setXYZ(i, x, visibleY, z);
        }
        attribute.needsUpdate = true;
      }
    },
  };
}
